"use client";

import { useState } from "react";
import { ArrowRight, Chat, ChartLineData, Education, CheckmarkOutline } from "@carbon/icons-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { dataAuditPath, servicesPath } from "@/lib/routes";

type WorkbenchTab = "grain" | "audit" | "ctl";

export function HeroBox() {
  const t = useTranslations("Hero");
  const locale = useLocale();
  const [activeTab, setActiveTab] = useState<WorkbenchTab>("grain");

  const tabs: Array<{
    id: WorkbenchTab;
    label: string;
    title: string;
    body: string;
    code: string;
    cta: string;
    href: string;
  }> = [
    {
      id: "grain",
      label: t("tab1Label"),
      title: t("tab1Title"),
      body: t("tab1Body"),
      code: t("tab1Code"),
      cta: t("tab1Cta"),
      href: servicesPath(locale),
    },
    {
      id: "audit",
      label: t("tab2Label"),
      title: t("tab2Title"),
      body: t("tab2Body"),
      code: t("tab2Code"),
      cta: t("tab2Cta"),
      href: dataAuditPath(locale),
    },
    {
      id: "ctl",
      label: t("tab3Label"),
      title: t("tab3Title"),
      body: t("tab3Body"),
      code: t("tab3Code"),
      cta: t("tab3Cta"),
      href: "/blog?tag=CareerTalkLab",
    },
  ];

  const currentTab = tabs.find((item) => item.id === activeTab) ?? tabs[0];

  return (
    <section className="relative overflow-hidden border-b border-hair bg-ground px-4 py-12 md:px-6 md:py-20 lg:py-24">
      {/* Subtle architectural grid & radial Cerulean glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle at 80% 20%, rgba(0, 133, 192, 0.14), transparent 55%), radial-gradient(circle at 15% 80%, rgba(34, 197, 94, 0.08), transparent 45%)",
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 mx-auto max-w-6xl">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-12">
          {/* Left Column: Mission, Instrument Serif Headline, Direct CTAs & Telemetry */}
          <div className="lg:col-span-6 text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3.5 py-1.5 mb-6">
              <span className="h-2 w-2 rounded-full bg-[#22c55e]" />
              <span className="font-mono text-xs font-medium uppercase tracking-wider text-accent">
                {t("badge")}
              </span>
            </div>

            <h1 className="font-serif text-4xl sm:text-5xl lg:text-[3.35rem] text-ink tracking-tight leading-[1.1] mb-6">
              {t("headlineLine1")}{" "}
              <span className="block mt-1 text-brand">
                {t("headlineLine2")}
              </span>
            </h1>

            <p className="text-base sm:text-lg text-muted leading-relaxed mb-8 max-w-xl text-pretty">
              {t("introduction")}
            </p>

            {/* Primary & Secondary CTAs */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 mb-8">
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent("openChat"))}
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-accent text-on-accent font-medium text-sm sm:text-base rounded-lg hover:bg-accent-dim transition-all shadow-sm cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <Chat size={18} className="shrink-0" />
                <span>{t("ctaText")}</span>
              </button>
              <Link
                href={dataAuditPath(locale)}
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 border border-hair bg-panel text-ink font-medium text-sm sm:text-base rounded-lg hover:bg-panel-2 transition-all no-underline"
              >
                <ChartLineData size={18} className="text-accent shrink-0" />
                <span>{t("secondaryCtaText")}</span>
              </Link>
            </div>

            {/* Telemetry Strip */}
            <div className="grid grid-cols-3 gap-3 border-t border-hair pt-6">
              <div>
                <p className="font-mono text-xl sm:text-2xl font-bold text-ink">
                  {t("stat1Value")}
                </p>
                <p className="font-mono text-[11px] text-muted mt-0.5">
                  {t("stat1Label")}
                </p>
              </div>
              <div className="border-l border-hair pl-3">
                <p className="font-mono text-xl sm:text-2xl font-bold text-accent">
                  {t("stat2Value")}
                </p>
                <p className="font-mono text-[11px] text-muted mt-0.5">
                  {t("stat2Label")}
                </p>
              </div>
              <div className="border-l border-hair pl-3">
                <p className="font-mono text-lg sm:text-xl font-bold text-ink">
                  {t("stat3Value")}
                </p>
                <p className="font-mono text-[11px] text-muted mt-0.5">
                  {t("stat3Label")}
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Dark Workbench Card (Carbon g100) */}
          <div className="lg:col-span-6">
            <div className="relative w-full rounded-xl border border-[#2a3441] bg-[#161616] text-[#f4f4f4] shadow-2xl overflow-hidden">
              {/* Top Cerulean-to-Emerald highlight line */}
              <div
                className="h-1 w-full bg-gradient-to-r from-[#006b9e] via-[#38a3d6] to-[#22c55e]"
                aria-hidden="true"
              />

              {/* Workbench Window Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#262626] bg-[#1c1c1c] px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#ef4444]/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#22c55e]/80" />
                  <span className="ml-2 font-mono text-[11px] tracking-wider text-[#a8a8a8]">
                    {t("workbenchWindowTitle")}
                  </span>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#22c55e]/30 bg-[#22c55e]/10 px-2.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-[#4ade80]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e] animate-pulse" />
                  {t("workbenchLiveBadge")}
                </span>
              </div>

              {/* Mode Switcher Tabs */}
              <div
                role="tablist"
                aria-label={t("workbenchWindowTitle")}
                className="grid grid-cols-3 border-b border-[#262626] bg-[#191919] p-1.5 gap-1.5"
              >
                {tabs.map((tab) => {
                  const isActive = tab.id === activeTab;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setActiveTab(tab.id)}
                      className={`rounded-lg px-2.5 py-2 font-mono text-[11px] font-medium transition-all cursor-pointer text-left truncate ${
                        isActive
                          ? "bg-[#006b9e] text-white shadow-xs"
                          : "text-[#a8a8a8] hover:bg-[#262626] hover:text-[#f4f4f4]"
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Active Workbench Panel */}
              <div className="p-5 sm:p-6 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-[#38a3d6]">
                    {activeTab === "ctl" ? (
                      <Education size={16} />
                    ) : (
                      <CheckmarkOutline size={16} />
                    )}
                    {currentTab.label}
                  </span>
                  <span className="rounded bg-[#22c55e]/20 px-2 py-0.5 font-mono text-[10px] font-medium text-[#4ade80]">
                    VERIFIED
                  </span>
                </div>

                <h2 className="font-serif text-2xl text-[#f4f4f4] leading-snug">
                  {currentTab.title}
                </h2>

                <p className="text-xs sm:text-sm text-[#c6c6c6] leading-relaxed">
                  {currentTab.body}
                </p>

                <div className="rounded-lg border border-[#2a3441] bg-[#222222] px-3.5 py-3 font-mono text-xs text-[#7cc7ee]">
                  {currentTab.code}
                </div>

                <div className="pt-2 border-t border-[#262626] flex items-center justify-between">
                  <Link
                    href={currentTab.href}
                    className="inline-flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wider text-[#38a3d6] hover:text-white no-underline transition-colors"
                  >
                    <span>{currentTab.cta}</span>
                    <ArrowRight size={16} />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

