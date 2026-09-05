"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
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

  const openChat = useCallback(() => {
    setHasOpened(true);
    setIsOpen(true);
  }, []);
  const closeChat = useCallback(() => setIsOpen(false), []);
  const markPanelReady = useCallback(() => setPanelReady(true), []);

  useEffect(() => {
    window.addEventListener("openChat", openChat);
    return () => window.removeEventListener("openChat", openChat);
  }, [openChat]);

  return (
    <>
      {(!isOpen || !panelReady) && (
        <button
          onClick={openChat}
          className={cn(
            "fixed bottom-4 right-4 z-50 p-4 rounded-card transition-all duration-200 cursor-pointer inline-flex items-center justify-center border border-transparent",
            "bg-accent text-on-accent hover:bg-accent-dim focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-transparent"
          )}
          aria-label={t("openChat")}
          aria-expanded={isOpen}
          aria-busy={isOpen && !panelReady}
        >
          <Chat size={24} className={isOpen && !panelReady ? "animate-pulse" : undefined} />
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
