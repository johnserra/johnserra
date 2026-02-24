"use client";

import { Button } from "@/components/ui/Button";
import { HERO_CONTENT } from "@/lib/constants";

export function HeroBox() {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 to-purple-700 p-8 md:p-12 col-span-1 md:col-span-6 lg:col-span-8 min-h-[400px] flex items-center">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-10" />

      {/* Content */}
      <div className="relative z-10 max-w-2xl">
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-6 leading-tight">
          {HERO_CONTENT.headline}
        </h1>
        <p className="text-lg md:text-xl text-blue-50 mb-8 leading-relaxed">
          {HERO_CONTENT.introduction}
        </p>
        <Button
          variant="primary"
          size="lg"
          className="bg-white text-blue-700 hover:bg-blue-50"
          onClick={() => window.dispatchEvent(new CustomEvent("openChat"))}
        >
          {HERO_CONTENT.ctaText}
        </Button>
      </div>
    </div>
  );
}
