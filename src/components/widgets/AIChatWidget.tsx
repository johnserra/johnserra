"use client";

import { useEffect, useRef, useState } from "react";
import { Chat, Close, SendAlt } from "@carbon/icons-react";
import { useTranslations, useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { IconButton } from "@/components/ui/IconButton";

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

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export function AIChatWidget() {
  const t = useTranslations("Chat");
  const locale = useLocale();

  const WELCOME: Message = {
    id: "welcome",
    role: "assistant",
    content: t("welcome"),
  };

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const handler = () => setIsOpen(true);
    window.addEventListener("openChat", handler);
    return () => window.removeEventListener("openChat", handler);
  }, []);

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
        .filter((m) => m.id !== "welcome")
        .map(({ role, content }) => ({ role, content }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, locale }),
      });

      if (!res.ok || !res.body) throw new Error("Request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: accumulated } : m
          )
        );
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: t("error") }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          "fixed bottom-4 right-4 z-50 p-4 rounded-card transition-all duration-200 cursor-pointer inline-flex items-center justify-center border border-transparent",
          "bg-accent text-on-accent hover:bg-accent-dim focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-transparent",
          isOpen && "scale-0 pointer-events-none"
        )}
        aria-label={t("openChat")}
      >
        <Chat size={24} />
      </button>

      {/* Chat Window Panel */}
      <div
        className={cn(
          "fixed bottom-4 right-4 z-50 w-[90vw] md:w-96 h-[600px] rounded-card flex flex-col overflow-hidden",
          "bg-panel text-ink border border-hair",
          "transition-all duration-200",
          isOpen ? "scale-100 opacity-100" : "scale-95 opacity-0 pointer-events-none"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-hair bg-panel">
          <div className="flex items-center gap-2.5">
            <Chat size={20} className="text-ink" />
            <div className="text-left">
              <h3 className="font-semibold text-ink text-sm leading-none mb-1">{t("title")}</h3>
              <p className="text-muted text-xs leading-none">{t("subtitle")}</p>
            </div>
          </div>
          <IconButton
            onClick={() => setIsOpen(false)}
            description={t("closeChat")}
            kind="ghost"
            size="sm"
            className="text-muted hover:text-ink focus-visible:ring-ink"
          >
            <Close size={18} />
          </IconButton>
        </div>

        {/* Messages */}
        <div className="flex-1 p-4 overflow-y-auto bg-transparent flex flex-col gap-3">
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "max-w-[85%] rounded-card px-3.5 py-2 text-sm leading-relaxed font-sans text-left",
                m.role === "user"
                  ? "self-end bg-accent/10 text-ink rounded-card-br"
                  : "self-start bg-ground-3 text-ink-soft rounded-card-bl"
              )}
            >
              {m.content ? renderContent(m.content) : (
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

        {/* Input Form Controls */}
        <form
          onSubmit={handleSubmit}
          className="p-4 border-t border-hair bg-ground-2 text-ink"
        >
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
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

      {/* Mobile backdrop overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
