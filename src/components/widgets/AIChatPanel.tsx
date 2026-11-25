"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Add, Chat, Close, Renew, SendAlt, Settings, StopFilled } from "@carbon/icons-react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { IconButton } from "@/components/ui/IconButton";
import { ProjectDiscoveryFlow } from "@/components/widgets/ProjectDiscoveryFlow";
import { NdjsonChatParser } from "@/lib/chat/protocol";
import { createFaqExchange, getFaqShortcuts } from "@/lib/chat/faq-shortcuts";
import {
  boundedApiHistory,
  deleteSavedConversation,
  disableChatSaving,
  enableChatSaving,
  localeConversations,
  readSavedChats,
  saveCompletedExchange,
  selectSavedConversation,
  startSavedConversation,
  type ChatLocale,
  type ChatStorage,
  type SavedChatState,
} from "@/lib/chat/local-persistence";
import { isRestrictedPublicConversation } from "@/lib/chat/public-boundaries";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  failed?: boolean;
  retryPrompt?: string;
}

export function filterChatHistory(messages: Message[]): Array<Pick<Message, "role" | "content">> {
  const visibleMessages = messages.filter((message) => message.id !== "welcome");
  const history: Array<Pick<Message, "role" | "content">> = [];

  for (let index = 0; index < visibleMessages.length;) {
    const user = visibleMessages[index];
    if (user.role !== "user" || user.failed || !user.content.trim()) {
      index += 1;
      continue;
    }

    const assistant = visibleMessages[index + 1];
    if (!assistant) {
      history.push({ role: "user", content: user.content });
      break;
    }
    if (assistant.role === "assistant") {
      if (!assistant.failed && assistant.content.trim()) {
        history.push({ role: "user", content: user.content });
        history.push({ role: "assistant", content: assistant.content });
      }
      index += 2;
      continue;
    }
    index += 1;
  }

  return history;
}

export function chatErrorTranslationKey(code: string):
  "errors.rateLimited" | "errors.timeout" | "errors.model" | "errors.retrieval" | "errors.service" | "errors.cancelled" | "errors.invalidRequest" | "errors.tooLarge" {
  switch (code) {
    case "INVALID_JSON":
    case "INVALID_REQUEST":
    case "INVALID_SESSION":
    case "UNSUPPORTED_LOCALE":
    case "UNSUPPORTED_MEDIA_TYPE": return "errors.invalidRequest";
    case "BODY_TOO_LARGE":
    case "INPUT_TOO_LARGE":
    case "MESSAGE_TOO_LARGE": return "errors.tooLarge";
    case "RATE_LIMITED": return "errors.rateLimited";
    case "PREPARATION_TIMEOUT":
    case "MODEL_TIMEOUT": return "errors.timeout";
    case "MODEL_ERROR":
    case "OUTPUT_TOO_LARGE": return "errors.model";
    case "RETRIEVAL_ERROR": return "errors.retrieval";
    case "CLIENT_ABORTED": return "errors.cancelled";
    default: return "errors.service";
  }
}

function sessionId(): string {
  const storageKey = "johnserra.chat.session";
  try {
    const existing = window.sessionStorage.getItem(storageKey);
    if (existing && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existing)) return existing;
    const created = crypto.randomUUID();
    window.sessionStorage.setItem(storageKey, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

interface AIChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onReady: () => void;
}

interface ActiveRequest {
  controller: AbortController;
  userId: string;
  assistantId: string;
}

export function isSafeUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return true;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "mailto:";
  } catch {
    return false;
  }
}

function renderInlineMarkdown(text: string, keyPrefix: string): React.ReactNode[] {
  const tokenRegex = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[1] !== undefined && match[2] !== undefined) {
      const linkText = match[1];
      const trimmedUrl = match[2].trim();
      if (!isSafeUrl(trimmedUrl)) {
        parts.push(linkText);
      } else {
        const isExternal = trimmedUrl.startsWith("http://") || trimmedUrl.startsWith("https://");
        parts.push(
          <a
            key={`${keyPrefix}-link-${match.index}`}
            href={trimmedUrl}
            className="font-medium text-accent underline underline-offset-2 decoration-accent/50 hover:text-accent-dim hover:decoration-accent-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent forced-colors:focus-visible:outline-2 rounded-xs"
            {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            {linkText}
            {isExternal && <span className="sr-only"> (opens in a new tab)</span>}
          </a>
        );
      }
    } else if (match[3] !== undefined) {
      parts.push(
        <strong key={`${keyPrefix}-bold-${match.index}`} className="font-semibold text-ink">
          {match[3]}
        </strong>
      );
    } else if (match[4] !== undefined) {
      parts.push(
        <code
          key={`${keyPrefix}-code-${match.index}`}
          className="rounded-xs bg-ground-3/80 px-1 py-0.5 font-mono text-[0.85em] text-ink"
        >
          {match[4]}
        </code>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

export function renderContent(content: string): React.ReactNode {
  const blocks = content
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length <= 1 && !/^\s*[-*]\s+/m.test(content)) {
    const inline = renderInlineMarkdown(content, "inline");
    return inline.length === 1 ? inline[0] : inline;
  }

  return (
    <div className="flex flex-col gap-2.5">
      {blocks.map((block, blockIndex) => {
        const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
        const isBulletList = lines.length > 0 && lines.every((line) => /^[-*]\s+/.test(line));
        if (isBulletList) {
          return (
            <ul key={`b-${blockIndex}`} className="list-disc space-y-1.5 pl-4">
              {lines.map((line, itemIndex) => (
                <li key={`b-${blockIndex}-i-${itemIndex}`}>
                  {renderInlineMarkdown(line.replace(/^[-*]\s+/, ""), `b-${blockIndex}-i-${itemIndex}`)}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={`b-${blockIndex}`} className="leading-relaxed">
            {lines.map((line, lineIndex) => (
              <span key={`b-${blockIndex}-l-${lineIndex}`}>
                {lineIndex > 0 ? <br /> : null}
                {renderInlineMarkdown(line, `b-${blockIndex}-l-${lineIndex}`)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

export function scrollChatMessages(viewport: Pick<HTMLElement, "scrollTop" | "scrollHeight"> | null): void {
  if (viewport) viewport.scrollTop = viewport.scrollHeight;
}

function browserStorage(): ChatStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function restoredMessages(welcome: string, saved: SavedChatState | null, locale: ChatLocale) {
  const conversation = saved?.conversations.find((item) => item.id === saved.activeConversationId && item.locale === locale)
    ?? (saved ? localeConversations(saved, locale)[0] : undefined);
  return {
    conversationId: conversation?.id ?? crypto.randomUUID(),
    messages: [
      { id: "welcome", role: "assistant" as const, content: welcome },
      ...(conversation?.messages.map((item) => ({ ...item, id: crypto.randomUUID() })) ?? []),
    ],
  };
}

export function AIChatPanel({ isOpen, onClose, onReady }: AIChatPanelProps) {
  const t = useTranslations("Chat");
  const locale = useLocale();
  const faqShortcuts = getFaqShortcuts(locale);
  const [initial] = useState(() => {
    const result = typeof window === "undefined" ? null : readSavedChats(browserStorage());
    const saved = result?.ok ? result.value : null;
    return { ...restoredMessages(t("welcome"), saved, locale as ChatLocale), saved, storageError: result !== null && !result.ok };
  });
  const [messages, setMessages] = useState<Message[]>(initial.messages);
  const [conversationId, setConversationId] = useState(initial.conversationId);
  const [savedChats, setSavedChats] = useState<SavedChatState | null>(initial.saved);
  const [storageError, setStorageError] = useState(initial.storageError);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<"searching" | "verifying">("searching");
  const [mode, setMode] = useState<"chat" | "discovery">("chat");
  const restrictedConversation = isRestrictedPublicConversation(messages);
  const hasConversation = messages.length > 1;
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestAbortRef = useRef<AbortController | null>(null);
  const activeRequestRef = useRef<ActiveRequest | null>(null);

  function applyStorageResult(result: ReturnType<typeof saveCompletedExchange>) {
    if (result.ok) {
      setSavedChats(result.value);
      setStorageError(false);
      return true;
    }
    setStorageError(true);
    return false;
  }

  function handleSavingChange() {
    if (isLoading) return;
    const storage = browserStorage();
    if (savedChats) {
      const result = disableChatSaving(storage);
      if (result.ok) {
        setSavedChats(null);
        setStorageError(false);
        setConversationId(crypto.randomUUID());
        setMessages([{ id: "welcome", role: "assistant", content: t("welcome") }]);
        setInput("");
      } else setStorageError(true);
      return;
    }
    const result = enableChatSaving(storage);
    if (!applyStorageResult(result)) return;
    let next = startSavedConversation(storage, conversationId);
    if (!applyStorageResult(next)) return;
    const history = filterChatHistory(messages);
    for (let index = 0; index + 1 < history.length; index += 2) {
      next = saveCompletedExchange(storage, conversationId, locale as ChatLocale, history[index].content, history[index + 1].content);
      if (!applyStorageResult(next)) return;
    }
  }

  function handleNewConversation() {
    if (isLoading) return;
    const nextId = crypto.randomUUID();
    if (savedChats && !applyStorageResult(startSavedConversation(browserStorage(), nextId))) return;
    setConversationId(nextId);
    setMessages([{ id: "welcome", role: "assistant", content: t("welcome") }]);
    setInput("");
    setSettingsOpen(false);
    setMode("chat");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function handleSelectConversation(id: string) {
    if (isLoading || !savedChats || !id) return;
    const result = selectSavedConversation(browserStorage(), id, locale as ChatLocale);
    if (!result.ok) {
      applyStorageResult(result);
      return;
    }
    applyStorageResult(result);
    const restored = restoredMessages(t("welcome"), result.value, locale as ChatLocale);
    setConversationId(restored.conversationId);
    setMessages(restored.messages);
    setInput("");
    setSettingsOpen(false);
    setMode("chat");
  }

  function handleDeleteCurrent() {
    if (isLoading || !savedChats) return;
    const result = deleteSavedConversation(browserStorage(), conversationId);
    if (!applyStorageResult(result)) return;
    setConversationId(crypto.randomUUID());
    setMessages([{ id: "welcome", role: "assistant", content: t("welcome") }]);
    setInput("");
    setMode("chat");
  }

  const cancelActiveRequest = useCallback(() => {
    const activeRequest = activeRequestRef.current;
    if (!activeRequest) return;

    activeRequest.controller.abort();
    activeRequestRef.current = null;
    requestAbortRef.current = null;
    setMessages((prev) => prev.filter((message) =>
      message.id !== activeRequest.userId && message.id !== activeRequest.assistantId));
    setIsLoading(false);
  }, []);

  const handleClose = useCallback(() => {
    cancelActiveRequest();
    setSettingsOpen(false);
    setMode("chat");
    onClose();
  }, [cancelActiveRequest, onClose]);

  useEffect(() => {
    if (!isOpen) cancelActiveRequest();
  }, [cancelActiveRequest, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (settingsOpen) {
          setSettingsOpen(false);
        } else {
          handleClose();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleClose, isOpen, settingsOpen]);

  useEffect(() => {
    if (!isLoading) {
      setLoadingPhase("searching");
      return;
    }
    const timer = window.setTimeout(() => setLoadingPhase("verifying"), 2400);
    return () => window.clearTimeout(timer);
  }, [isLoading]);

  useEffect(() => () => {
    const activeRequest = activeRequestRef.current;
    activeRequestRef.current = null;
    requestAbortRef.current = null;
    activeRequest?.controller.abort();
  }, []);

  useEffect(() => {
    onReady();
  }, [onReady]);

  useEffect(() => {
    if (isOpen) {
      scrollChatMessages(messagesViewportRef.current);
      if (mode === "chat" && !settingsOpen) {
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    }
  }, [isOpen, messages, mode, settingsOpen]);

  async function submitPrompt(rawText: string) {
    const text = rawText.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text };
    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = { id: assistantId, role: "assistant", content: "" };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setSettingsOpen(false);
    setIsLoading(true);
    setLoadingPhase("searching");
    const requestAbort = new AbortController();
    requestAbortRef.current = requestAbort;
    activeRequestRef.current = { controller: requestAbort, userId: userMsg.id, assistantId };

    try {
      const history = boundedApiHistory(filterChatHistory([...messages, userMsg]));
      if (!history) throw new Error("INPUT_TOO_LARGE");

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Chat-Session": sessionId() },
        body: JSON.stringify({ messages: history, locale }),
        signal: requestAbort.signal,
      });

      if (!response.ok) {
        let code = "SERVICE_UNAVAILABLE";
        try {
          const payload = await response.json() as { error?: { code?: string } };
          code = payload.error?.code ?? code;
        } catch {
          // Keep the service message safe when a proxy returns a malformed body.
        }
        throw new Error(code);
      }
      if (!response.body) throw new Error("SERVICE_UNAVAILABLE");

      const reader = response.body.getReader();
      const parser = new NdjsonChatParser();
      let accumulated = "";
      let completed = false;
      let failed = false;

      while (true) {
        const { done, value } = await reader.read();
        const frames = done ? parser.finish() : parser.push(value);
        for (const frame of frames) {
          if (frame.type === "delta") {
            accumulated += frame.text;
            setMessages((prev) => prev.map((message) =>
              message.id === assistantId ? { ...message, content: accumulated } : message));
          } else if (frame.type === "error") {
            failed = true;
            setMessages((prev) => prev.map((message) =>
              message.id === assistantId
                ? { ...message, content: t(chatErrorTranslationKey(frame.code)), failed: true, retryPrompt: text }
                : message));
            await reader.cancel();
          } else if (frame.type === "done") {
            completed = true;
          }
        }
        if (done || failed) break;
      }
      if (!completed && !failed) {
        throw new Error("SERVICE_UNAVAILABLE");
      }
      if (completed && !failed && accumulated.trim() && savedChats) {
        applyStorageResult(saveCompletedExchange(browserStorage(), conversationId, locale as ChatLocale, text, accumulated));
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      const code = error instanceof Error ? error.message : "SERVICE_UNAVAILABLE";
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantId
            ? { ...message, content: t(chatErrorTranslationKey(code)), failed: true, retryPrompt: text }
            : message
        )
      );
    } finally {
      if (activeRequestRef.current?.assistantId === assistantId) {
        activeRequestRef.current = null;
        requestAbortRef.current = null;
        setIsLoading(false);
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submitPrompt(input);
  }

  function handleDiscussProject() {
    cancelActiveRequest();
    setSettingsOpen(false);
    setMode("discovery");
  }

  function handleAskAboutJohn() {
    setMode("chat");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function handleFaqShortcut(shortcut: { id: string; prompt: string; answer: string }) {
    if (isLoading || activeRequestRef.current) return;
    setSettingsOpen(false);
    setMessages((prev) => [
      ...prev,
      ...createFaqExchange(shortcut, crypto.randomUUID(), crypto.randomUUID()),
    ]);
    if (savedChats) {
      applyStorageResult(saveCompletedExchange(browserStorage(), conversationId, locale as ChatLocale, shortcut.prompt, shortcut.answer));
    }
    const analyticsWindow = window as Window & {
      gtag?: (command: "event", name: string, values: Record<string, string>) => void;
    };
    analyticsWindow.gtag?.("event", "chat_faq_shortcut", {
      shortcut_id: shortcut.id,
      locale,
      outcome: "shown",
    });
  }

  if (!isOpen) return null;

  const savedForLocale = savedChats ? localeConversations(savedChats, locale as ChatLocale) : [];

  return (
    <>
      <div
        role="dialog"
        aria-labelledby="ai-chat-title"
        className={cn(
          "fixed bottom-3 inset-x-3 sm:left-auto sm:bottom-5 sm:right-5 z-50",
          "sm:w-[432px] md:w-[456px] h-[min(720px,calc(100dvh-1.5rem))] sm:h-[min(720px,calc(100dvh-2.5rem))]",
          "rounded-card flex flex-col overflow-clip",
          "bg-ground text-ink border border-hair",
          "shadow-[0_18px_48px_rgba(0,0,0,0.14),0_2px_8px_rgba(0,0,0,0.06)]"
        )}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-hair bg-ground-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/12 text-accent"
              aria-hidden="true"
            >
              <Chat size={18} />
            </span>
            <div className="min-w-0 text-left">
              <h2 id="ai-chat-title" className="font-semibold text-ink text-sm leading-tight truncate">
                {t("title")}
              </h2>
              <p className="text-muted text-xs leading-tight mt-0.5 truncate">{t("subtitle")}</p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {mode === "chat" && hasConversation && (
              <IconButton
                onClick={handleNewConversation}
                disabled={isLoading}
                description={t("newConversation")}
                kind="ghost"
                size="sm"
                className="h-9 w-9 border-transparent text-muted hover:bg-ground-3/70 hover:text-ink hover:border-transparent"
              >
                <Add size={18} aria-hidden="true" />
              </IconButton>
            )}

            {mode === "chat" && (
              <IconButton
                onClick={() => setSettingsOpen((open) => !open)}
                disabled={isLoading}
                description={t("chatSettings")}
                aria-expanded={settingsOpen}
                aria-controls="ai-chat-settings-tray"
                kind="ghost"
                size="sm"
                className={cn(
                  "relative h-9 w-9 border-transparent text-muted hover:bg-ground-3/70 hover:text-ink hover:border-transparent",
                  settingsOpen && "bg-ground-3 text-ink"
                )}
              >
                <span className="inline-flex items-center justify-center">
                  <Settings size={17} aria-hidden="true" />
                  {savedChats && (
                    <span
                      className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-good"
                      aria-hidden="true"
                    />
                  )}
                </span>
              </IconButton>
            )}

            <IconButton
              onClick={handleClose}
              description={t("closeChat")}
              kind="ghost"
              size="sm"
              className="h-9 w-9 border-transparent text-muted hover:bg-ground-3/70 hover:text-ink hover:border-transparent"
            >
              <Close size={18} aria-hidden="true" />
            </IconButton>
          </div>
        </div>

        {mode === "chat" && settingsOpen && (
          <div
            id="ai-chat-settings-tray"
            className="border-b border-hair bg-ground-2 px-4 py-3 text-xs text-muted shrink-0 space-y-2.5"
          >
            <label htmlFor="ai-chat-save-browser" className="flex cursor-pointer items-start gap-2.5 text-ink">
              <input
                id="ai-chat-save-browser"
                type="checkbox"
                checked={Boolean(savedChats)}
                onChange={handleSavingChange}
                disabled={isLoading}
                className="mt-0.5 h-4 w-4 accent-accent cursor-pointer"
              />
              <span className="font-medium leading-snug">{t("saveOnBrowser")}</span>
            </label>
            <p className="leading-relaxed text-muted">{t("savingNotice")}</p>
            {storageError && (
              <p role="alert" className="text-bad font-medium">
                {t("storageError")}
              </p>
            )}

            {savedChats && savedForLocale.length > 0 && (
              <select
                value={savedChats.conversations.some((item) => item.id === conversationId) ? conversationId : ""}
                onChange={(event) => handleSelectConversation(event.target.value)}
                disabled={isLoading}
                aria-label={t("savedConversations")}
                className="w-full rounded-field border border-hair bg-ground px-2.5 py-1.5 text-xs text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <option value="">{t("savedConversations")}</option>
                {savedForLocale.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.messages[0]?.content.slice(0, 44) ?? t("newConversation")}
                  </option>
                ))}
              </select>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-0.5">
              <button
                type="button"
                onClick={handleNewConversation}
                disabled={isLoading}
                className="font-medium text-ink underline underline-offset-2 hover:text-accent disabled:opacity-50 cursor-pointer"
              >
                {t("newConversation")}
              </button>
              {!restrictedConversation && (
                <button
                  type="button"
                  onClick={handleDiscussProject}
                  disabled={isLoading}
                  className="font-medium text-accent underline underline-offset-2 hover:text-accent-dim disabled:opacity-50 cursor-pointer"
                >
                  {t("discussProject")}
                </button>
              )}
              {savedChats && (
                <>
                  <button
                    type="button"
                    onClick={handleDeleteCurrent}
                    disabled={isLoading || !savedChats.conversations.some((item) => item.id === conversationId)}
                    className="underline underline-offset-2 hover:text-ink disabled:opacity-50 cursor-pointer"
                  >
                    {t("deleteCurrent")}
                  </button>
                  <button
                    type="button"
                    onClick={handleSavingChange}
                    disabled={isLoading}
                    className="underline underline-offset-2 hover:text-bad disabled:opacity-50 cursor-pointer"
                  >
                    {t("deleteAllTurnOff")}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        <div
          ref={messagesViewportRef}
          aria-live="polite"
          aria-relevant="additions"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-ground px-4 py-4 flex flex-col gap-3.5"
        >
          {mode === "discovery" ? (
            <ProjectDiscoveryFlow
              key={locale}
              locale={locale as ChatLocale}
              contactHref={locale === "tr" ? "/tr/contact" : "/contact"}
              getSessionId={sessionId}
              onReturn={() => setMode("chat")}
              onContact={handleClose}
            />
          ) : (
            <>
              {messages.map((message) => {
                const isPendingAssistant = message.role === "assistant" && !message.content;
                return (
                  <div
                    key={message.id}
                    className={cn(
                      "rounded-card px-4 py-3 text-sm leading-relaxed font-sans text-left break-words",
                      message.role === "user"
                        ? "self-end max-w-[85%] bg-accent text-on-accent rounded-br-sm"
                        : "self-start max-w-[92%] bg-ground-2 text-ink rounded-bl-sm border border-hair/60",
                      message.failed && "border-bad/40 bg-bad/5 text-ink"
                    )}
                  >
                    {message.content ? (
                      <>
                        {message.role === "user" ? message.content : renderContent(message.content)}
                        {message.failed && message.retryPrompt && (
                          <div className="mt-2.5">
                            <button
                              type="button"
                              onClick={() => void submitPrompt(message.retryPrompt!)}
                              disabled={isLoading}
                              className="inline-flex items-center gap-1.5 rounded-field border border-hair bg-ground px-2.5 py-1 text-xs font-medium text-ink hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 cursor-pointer"
                            >
                              <Renew size={13} aria-hidden="true" />
                              {t("retryMessage")}
                            </button>
                          </div>
                        )}
                      </>
                    ) : isPendingAssistant ? (
                      <div
                        role="progressbar"
                        aria-label={loadingPhase === "searching" ? t("thinkingSearching") : t("thinkingVerifying")}
                        className="flex items-center gap-2.5 text-xs text-muted py-0.5"
                      >
                        <span className="inline-flex gap-1 items-center shrink-0" aria-hidden="true">
                          <span className="h-1.5 w-1.5 rounded-full bg-accent motion-safe:animate-pulse" />
                          <span className="h-1.5 w-1.5 rounded-full bg-accent/70 motion-safe:animate-pulse [animation-delay:150ms]" />
                          <span className="h-1.5 w-1.5 rounded-full bg-accent/40 motion-safe:animate-pulse [animation-delay:300ms]" />
                        </span>
                        <span>
                          {loadingPhase === "searching" ? t("thinkingSearching") : t("thinkingVerifying")}
                        </span>
                      </div>
                    ) : null}
                  </div>
                );
              })}

              {!hasConversation && (
                <div className="mt-1 flex flex-col gap-4">
                  <div role="group" aria-label={t("entryChoices")} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={handleAskAboutJohn}
                      disabled={isLoading}
                      className="rounded-field border border-accent bg-accent/10 px-3.5 py-2.5 text-sm font-semibold text-ink hover:bg-accent/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 transition-colors duration-150 cursor-pointer"
                    >
                      {t("askAboutJohn")}
                    </button>
                    {!restrictedConversation ? (
                      <button
                        type="button"
                        onClick={handleDiscussProject}
                        disabled={isLoading}
                        className="rounded-field border border-hair bg-ground px-3.5 py-2.5 text-sm font-semibold text-ink hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 transition-colors duration-150 cursor-pointer"
                      >
                        {t("discussProject")}
                      </button>
                    ) : null}
                  </div>

                  {faqShortcuts.length > 0 && (
                    <div role="group" aria-label={t("faqShortcuts")} className="space-y-2">
                      <p className="text-xs font-medium text-muted">{t("faqShortcuts")}</p>
                      <div className="flex flex-wrap gap-2">
                        {faqShortcuts.map((shortcut) => (
                          <button
                            key={shortcut.id}
                            type="button"
                            onClick={() => handleFaqShortcut(shortcut)}
                            disabled={isLoading}
                            aria-label={shortcut.prompt}
                            className="rounded-pill border border-hair bg-ground px-3 py-1.5 text-left text-xs text-ink hover:border-accent hover:bg-accent/5 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 transition-colors duration-150 cursor-pointer"
                          >
                            {shortcut.prompt}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {mode === "chat" && (
          <div className="border-t border-hair bg-ground-2 px-4 pt-3 pb-3 shrink-0">
            <form onSubmit={handleSubmit} className="flex items-center gap-2">
              <label htmlFor="ai-chat-input" className="sr-only">
                {t("inputLabel")}
              </label>
              <input
                id="ai-chat-input"
                ref={inputRef}
                type="text"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={t("placeholder")}
                autoComplete="off"
                disabled={isLoading}
                className={cn(
                  "flex-1 h-10 px-3.5 py-2 text-sm font-sans",
                  "bg-ground text-ink",
                  "border border-hair rounded-field",
                  "placeholder:text-muted",
                  "focus:outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/30",
                  "disabled:opacity-60"
                )}
              />
              {isLoading ? (
                <IconButton
                  type="button"
                  onClick={cancelActiveRequest}
                  kind="secondary"
                  size="md"
                  description={t("stopGenerating")}
                  className="shrink-0 rounded-pill border-hair bg-ground text-ink hover:border-bad hover:text-bad"
                >
                  <StopFilled size={16} aria-hidden="true" />
                </IconButton>
              ) : (
                <IconButton
                  type="submit"
                  disabled={!input.trim()}
                  kind="primary"
                  size="md"
                  description={t("sendMessage")}
                  className="shrink-0 rounded-pill border-transparent bg-accent text-on-accent hover:bg-accent-dim hover:text-on-accent hover:border-transparent"
                >
                  <SendAlt size={18} aria-hidden="true" />
                </IconButton>
              )}
            </form>
            <p role="note" className="mt-2 text-xs leading-snug text-muted">
              {t("disclosure")}
            </p>
          </div>
        )}
      </div>

      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-xs z-40 sm:hidden"
        onClick={handleClose}
        aria-hidden="true"
      />
    </>
  );
}
