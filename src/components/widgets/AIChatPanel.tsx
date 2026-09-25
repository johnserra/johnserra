"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Chat, Close, SendAlt } from "@carbon/icons-react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { IconButton } from "@/components/ui/IconButton";
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

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  failed?: boolean;
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
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function renderContent(content: string): React.ReactNode {
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }
    const [, text, url] = match;
    const trimmedUrl = url.trim();

    if (!isSafeUrl(trimmedUrl)) {
      parts.push(text);
    } else {
      const isExternal = trimmedUrl.startsWith("http://") || trimmedUrl.startsWith("https://");
      parts.push(
        <a
          key={match.index}
          href={trimmedUrl}
          className="text-accent underline hover:text-accent-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-xs"
          {...(isExternal
            ? { target: "_blank", rel: "noopener noreferrer" }
            : {})}
        >
          {text}
          {isExternal && <span className="sr-only"> (opens in a new tab)</span>}
        </a>
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return parts.length > 0 ? parts : content;
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
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesViewportRef = useRef<HTMLDivElement>(null);
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
  }

  function handleSelectConversation(id: string) {
    if (isLoading || !savedChats) return;
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
  }

  function handleDeleteCurrent() {
    if (isLoading || !savedChats) return;
    const result = deleteSavedConversation(browserStorage(), conversationId);
    if (!applyStorageResult(result)) return;
    setConversationId(crypto.randomUUID());
    setMessages([{ id: "welcome", role: "assistant", content: t("welcome") }]);
    setInput("");
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

  useEffect(() => {
    if (!isOpen) cancelActiveRequest();
  }, [cancelActiveRequest, isOpen]);

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
    }
  }, [isOpen, messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text };
    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = { id: assistantId, role: "assistant", content: "" };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setIsLoading(true);
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
                ? { ...message, content: t(chatErrorTranslationKey(frame.code)), failed: true }
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
            ? { ...message, content: t(chatErrorTranslationKey(code)), failed: true }
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

  function handleClose() {
    cancelActiveRequest();
    onClose();
  }

  function handleFaqShortcut(shortcut: { id: string; prompt: string; answer: string }) {
    if (isLoading || activeRequestRef.current) return;
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

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-chat-title"
        className={cn(
          "fixed bottom-4 right-4 z-50 w-[90vw] md:w-96 h-[min(680px,calc(100vh-2rem))] rounded-card flex flex-col overflow-clip",
          "bg-panel text-ink border border-hair"
        )}
      >
        <div className="flex items-center justify-between p-4 border-b border-hair bg-panel">
          <div className="flex items-center gap-2.5">
            <Chat size={20} className="text-ink" />
            <div className="text-left">
              <h3 id="ai-chat-title" className="font-semibold text-ink text-sm leading-none mb-1">
                {t("title")}
              </h3>
              <p className="text-muted text-xs leading-none">{t("subtitle")}</p>
            </div>
          </div>
          <IconButton
            onClick={handleClose}
            description={t("closeChat")}
            kind="ghost"
            size="sm"
            className="text-muted hover:text-ink focus-visible:ring-ink"
          >
            <Close size={18} />
          </IconButton>
        </div>

        <p
          role="note"
          className="px-4 py-2.5 border-b border-hair bg-ground-2 text-muted text-xs leading-relaxed"
        >
          {t("disclosure")}
        </p>

        <div className="border-b border-hair bg-ground-2 px-4 py-2 text-xs text-muted">
          <label className="flex cursor-pointer items-start gap-2 text-ink-soft">
            <input type="checkbox" checked={Boolean(savedChats)} onChange={handleSavingChange} disabled={isLoading}
              className="mt-0.5 accent-accent" />
            <span>{t("saveOnBrowser")}</span>
          </label>
          <p className="mt-1 leading-snug">{t("savingNotice")}</p>
          {storageError && <p role="alert" className="mt-1 text-red-600">{t("storageError")}</p>}
          <div className="mt-1 flex items-center gap-3">
            <button type="button" onClick={handleNewConversation} disabled={isLoading} className="underline hover:text-ink disabled:opacity-50">{t("newConversation")}</button>
            {savedChats && <details className="relative min-w-0">
              <summary className="cursor-pointer underline hover:text-ink">{t("manageSaved")}</summary>
              <div className="absolute right-0 top-full z-10 mt-1 flex w-56 flex-col items-start gap-2 rounded-card border border-hair bg-panel p-3 shadow-lg">
                {localeConversations(savedChats, locale as ChatLocale).length > 0 && (
              <select value={savedChats.conversations.some((item) => item.id === conversationId) ? conversationId : ""}
                onChange={(event) => handleSelectConversation(event.target.value)} disabled={isLoading}
                aria-label={t("savedConversations")}
                className="w-full rounded-field border border-hair bg-panel px-2 py-1 text-ink-soft">
                <option value="">{t("savedConversations")}</option>
                {localeConversations(savedChats, locale as ChatLocale).map((item) => (
                  <option key={item.id} value={item.id}>{item.messages[0]?.content.slice(0, 36) ?? t("newConversation")}</option>
                ))}
              </select>
                )}
                <button type="button" onClick={handleDeleteCurrent} disabled={isLoading || !savedChats.conversations.some((item) => item.id === conversationId)} className="underline hover:text-ink disabled:opacity-50">{t("deleteCurrent")}</button>
                <button type="button" onClick={handleSavingChange} disabled={isLoading} className="underline hover:text-ink disabled:opacity-50">{t("deleteAllTurnOff")}</button>
              </div>
            </details>}
          </div>
        </div>

        <div ref={messagesViewportRef} className="min-h-0 flex-1 p-4 overflow-y-auto bg-transparent flex flex-col gap-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "max-w-[85%] rounded-card px-3.5 py-2 text-sm leading-relaxed font-sans text-left whitespace-pre-wrap break-words",
                message.role === "user"
                  ? "self-end bg-accent/10 text-ink rounded-card-br"
                  : "self-start bg-ground-3 text-ink-soft rounded-card-bl"
              )}
            >
              {message.content ? (
                renderContent(message.content)
              ) : (
                <span className="flex gap-1 items-center py-1">
                  <span className="w-1.5 h-1.5 bg-ink/40 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 bg-ink/40 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 bg-ink/40 rounded-full animate-bounce" />
                </span>
              )}
            </div>
          ))}
        </div>

        {faqShortcuts.length > 0 && (
          <div
            role="group"
            aria-label={t("faqShortcuts")}
            className="border-t border-hair bg-ground-2 px-4 py-3"
          >
            <p className="mb-2 font-mono text-xs text-muted">{t("faqShortcuts")}</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {faqShortcuts.map((shortcut) => (
                <button
                  key={shortcut.id}
                  type="button"
                  onClick={() => handleFaqShortcut(shortcut)}
                  disabled={isLoading}
                  aria-label={shortcut.prompt}
                  className="shrink-0 max-w-[75vw] rounded-pill border border-hair bg-panel px-3 py-1.5 text-left text-xs text-ink-soft hover:border-accent hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 md:max-w-[18rem]"
                >
                  {shortcut.prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="p-4 border-t border-hair bg-ground-2 text-ink"
        >
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={t("placeholder")}
              disabled={isLoading}
              className={cn(
                "flex-1 h-10 px-4 py-2 text-sm font-sans",
                "bg-ground-2 text-ink",
                "border border-hair rounded-field",
                "placeholder:text-faint",
                "focus-within:border-accent",
                "disabled:opacity-60"
              )}
            />
            <IconButton
              type="submit"
              disabled={isLoading || !input.trim()}
              kind="primary"
              size="md"
              description={t("sendMessage")}
              className="shrink-0 bg-accent text-on-accent rounded-pill hover:bg-accent-dim"
            >
              <SendAlt size={18} />
            </IconButton>
          </div>
        </form>
      </div>

      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 md:hidden"
        onClick={handleClose}
      />
    </>
  );
}
