"use client";

import { Button } from "@/components/ui/Button";
import { useTranslations } from "next-intl";

export function HeroBox() {
  const t = useTranslations("Hero");

  return (
    <div className="relative overflow-hidden rounded-card bg-transparent p-8 md:p-12 col-span-1 md:col-span-6 lg:col-span-8 min-h-[400px] flex items-center">
      <div className="w-full">
        <h1
          className="font-display uppercase leading-[0.95] tracking-tight origin-left [transform:scaleX(1.04)]"
          style={{ fontSize: "clamp(1.9rem, 4.6vw, 4rem)" }}
        >
          <span className="block text-ink">{t("headlineLine1")}</span>
          <span className="block text-accent">{t("headlineLine2")}</span>
        </h1>
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
