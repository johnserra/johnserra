"use client";

import { Button } from "@/components/ui/Button";
import { useTranslations } from "next-intl";

export function HeroBox() {
  const t = useTranslations("Hero");

  return (
    <div className="relative overflow-hidden rounded-card bg-transparent px-0 py-8 col-span-1 md:col-span-6 lg:col-span-8 min-h-[400px] flex items-center">
      <div className="w-full">
        <h1 className="font-display text-[clamp(2.5rem,5vw,4rem)] font-semibold uppercase leading-[0.95] tracking-[-0.01em]">
          <span className="block text-ink">{t("headlineLine1")}</span>
          <span className="block text-brand">{t("headlineLine2")}</span>
        </h1>
        <p className="mt-5 mb-8 max-w-[640px] text-lg leading-[1.65] text-pretty text-ink-soft">
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
