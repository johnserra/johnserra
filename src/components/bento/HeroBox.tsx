"use client";

import { Button } from "@/components/ui/Button";
import { useTranslations } from "next-intl";

export function HeroBox() {
  const t = useTranslations("Hero");

  return (
    <div className="relative overflow-hidden rounded-card bg-transparent p-8 md:p-12 col-span-1 md:col-span-6 lg:col-span-8 min-h-[400px] flex items-center">
      <div className="w-full">
        <h1
          className="font-display uppercase leading-[0.86] tracking-tight text-ink origin-left [transform:scaleX(1.06)] whitespace-nowrap"
          style={{ fontSize: "clamp(2.75rem, 8.5vw, 7rem)" }}
        >
          JOHN <span className="text-accent">SERRA</span>
        </h1>
        <p className="mt-6 font-mono text-xs md:text-sm uppercase tracking-[0.12em] text-muted">
          {t("headline")}
        </p>
        <p className="mt-5 max-w-2xl text-lg text-ink-soft mb-8 leading-relaxed">
          {t("introduction")}
        </p>
        <Button
          variant="primary"
          size="lg"
          onClick={() => window.dispatchEvent(new CustomEvent("openChat"))}
        >
          {t("ctaText")}
        </Button>
      </div>
    </div>
  );
}
