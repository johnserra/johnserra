"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Chat, Close, SendAlt } from "@carbon/icons-react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { IconButton } from "@/components/ui/IconButton";
import { NdjsonChatParser } from "@/lib/chat/protocol";

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

export function AIChatPanel({ isOpen, onClose, onReady }: AIChatPanelProps) {
  const t = useTranslations("Chat");
  const locale = useLocale();
  const [messages, setMessages] = useState<Message[]>(() => [
    { id: "welcome", role: "assistant", content: t("welcome") },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const requestAbortRef = useRef<AbortController | null>(null);
  const activeRequestRef = useRef<ActiveRequest | null>(null);

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
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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
      const history = filterChatHistory([...messages, userMsg]);

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

  if (!isOpen) return null;

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-chat-title"
        className={cn(
          "fixed bottom-4 right-4 z-50 w-[90vw] md:w-96 h-[600px] rounded-card flex flex-col overflow-hidden",
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

        <div className="flex-1 p-4 overflow-y-auto bg-transparent flex flex-col gap-3">
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
          <div ref={messagesEndRef} />
        </div>

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
