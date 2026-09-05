"use client";

import { useEffect, useRef, useState } from "react";
import { Chat, Close, SendAlt } from "@carbon/icons-react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { IconButton } from "@/components/ui/IconButton";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface AIChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onReady: () => void;
}

function renderContent(content: string): React.ReactNode {
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }
    const [, text, url] = match;
    const isExternal = url.startsWith("http");
    parts.push(
      <a
        key={match.index}
        href={url}
        className="text-accent underline hover:text-accent-dim"
        {...(isExternal
          ? { target: "_blank", rel: "noopener noreferrer" }
          : {})}
      >
        {text}
      </a>
    );
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

    try {
      const history = [...messages, userMsg]
        .filter((message) => message.id !== "welcome")
        .map(({ role, content }) => ({ role, content }));

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, locale }),
      });

      if (!response.ok || !response.body) throw new Error("Request failed");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId
              ? { ...message, content: accumulated }
              : message
          )
        );
      }
    } catch {
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantId
            ? { ...message, content: t("error") }
            : message
        )
      );
    } finally {
      setIsLoading(false);
    }
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
            onClick={onClose}
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
                "max-w-[85%] rounded-card px-3.5 py-2 text-sm leading-relaxed font-sans text-left",
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
        onClick={onClose}
      />
    </>
  );
}
