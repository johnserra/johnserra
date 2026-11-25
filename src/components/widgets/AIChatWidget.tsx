"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { Chat } from "@carbon/icons-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const AIChatPanel = dynamic(
  () => import("./AIChatPanel").then((module) => module.AIChatPanel),
  { ssr: false }
);

export function AIChatWidget() {
  const t = useTranslations("Chat");
  const [isOpen, setIsOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [panelReady, setPanelReady] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null);

  const openChat = useCallback(() => {
    setHasOpened(true);
    setIsOpen(true);
  }, []);

  const closeChat = useCallback(() => {
    setIsOpen(false);
    requestAnimationFrame(() => launcherRef.current?.focus());
  }, []);

  const markPanelReady = useCallback(() => setPanelReady(true), []);

  useEffect(() => {
    window.addEventListener("openChat", openChat);
    return () => window.removeEventListener("openChat", openChat);
  }, [openChat]);

  return (
    <>
      {(!isOpen || !panelReady) && (
        <button
          ref={launcherRef}
          type="button"
          onClick={openChat}
          className={cn(
            "fixed bottom-5 right-5 z-50 inline-flex items-center justify-center gap-2 rounded-pill px-4 py-3 cursor-pointer",
            "bg-accent text-on-accent border border-accent-dim/30",
            "shadow-[0_10px_28px_rgba(0,82,122,0.28),0_2px_6px_rgba(0,0,0,0.08)]",
            "transition-all duration-150 hover:bg-accent-dim hover:-translate-y-0.5 motion-reduce:hover:translate-y-0",
            "focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          )}
          aria-label={t("openChat")}
          aria-expanded={isOpen}
          aria-busy={isOpen && !panelReady}
        >
          <Chat
            size={20}
            aria-hidden="true"
            className={isOpen && !panelReady ? "motion-safe:animate-pulse" : undefined}
          />
          <span className="hidden sm:inline text-sm font-semibold tracking-[-0.01em] leading-none">
            {t("launcherLabel")}
          </span>
        </button>
      )}

      {hasOpened && (
        <AIChatPanel
          isOpen={isOpen}
          onClose={closeChat}
          onReady={markPanelReady}
        />
      )}
    </>
  );
}
