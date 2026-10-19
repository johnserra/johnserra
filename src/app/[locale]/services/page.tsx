import type { Metadata } from "next";
import { ArrowRight, ChartLine, DataBase, Dashboard, IbmCloudPakData } from "@carbon/icons-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ServicesInquiryForm } from "@/components/services/ServicesInquiryForm";
import { Link } from "@/i18n/navigation";
import { dataAuditPath, servicesPath } from "@/lib/routes";
import { AIChatWidget } from "@/components/widgets/AIChatWidget";

interface Props { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Services" });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function ServicesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Services");
  const services = [
    { key: "dashboards", icon: Dashboard },
    { key: "analysis", icon: ChartLine },
    { key: "automation", icon: IbmCloudPakData },
    { key: "foundation", icon: DataBase },
  ] as const;

  return (
    <div className="bg-ground text-ink">
      <Header alternateLocalePath={servicesPath(locale === "en" ? "tr" : "en")} />
      <main>
        <section className="relative overflow-hidden border-b border-hair">
          <div
            className="pointer-events-none absolute inset-0 opacity-25"
            style={{
              backgroundImage:
                "radial-gradient(circle at 80% 20%, rgba(0, 133, 192, 0.14), transparent 55%), radial-gradient(circle at 15% 80%, rgba(34, 197, 94, 0.08), transparent 45%)",
            }}
            aria-hidden="true"
          />
          <div className="relative z-10 mx-auto grid max-w-6xl gap-10 px-4 py-16 md:px-6 lg:grid-cols-[1.35fr_.65fr] lg:py-24">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/10 px-3.5 py-1">
                <span className="h-2 w-2 rounded-full bg-[#22c55e]" />
                <span className="font-mono text-xs font-medium uppercase tracking-wider text-accent">{t("eyebrow")}</span>
              </div>
              <h1 className="max-w-4xl font-serif text-4xl leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">{t("title")}</h1>
              <p className="mt-6 max-w-2xl text-base sm:text-lg leading-relaxed text-muted">{t("intro")}</p>
              <Link href="#inquiry" className="mt-8 inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-3.5 font-medium text-on-accent shadow-sm transition-colors hover:bg-accent-dim no-underline">
                {t("cta")} <ArrowRight size={18} />
              </Link>
            </div>
            <div className="self-end rounded-xl border border-hair bg-panel p-6 md:p-8 shadow-sm">
              <p className="font-mono text-xs uppercase tracking-[0.1em] text-accent font-semibold">{t("fitLabel")}</p>
              <p className="mt-3 font-serif text-2xl leading-snug text-ink">{t("fit")}</p>
            </div>
          </div>
        </section>

        <section className="border-b border-hair bg-ground-2/60">
          <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 md:px-6 lg:grid-cols-[1fr_auto]">
            <div>
              <div className="inline-flex items-center rounded-full border border-accent/25 bg-accent/10 px-3 py-1 font-mono text-xs font-medium uppercase tracking-wider text-accent">{t("assessmentEyebrow")}</div>
              <h2 className="mt-3 font-serif text-3xl tracking-tight sm:text-4xl">{t("assessmentTitle")}</h2>
              <p className="mt-3 max-w-3xl leading-relaxed text-muted">{t("assessmentDescription")}</p>
            </div>
            <Link href={dataAuditPath(locale)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-accent bg-ground px-6 py-3.5 font-medium text-accent transition-colors hover:bg-accent hover:text-on-accent no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              {t("assessmentButton")} <ArrowRight size={18} />
            </Link>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
          <div className="mb-12 max-w-2xl">
            <div className="inline-flex items-center rounded-full border border-accent/25 bg-accent/10 px-3 py-1 font-mono text-xs font-medium uppercase tracking-wider text-accent">{t("servicesEyebrow")}</div>
            <h2 className="mt-4 font-serif text-3xl tracking-tight sm:text-4xl md:text-5xl">{t("servicesTitle")}</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {services.map(({ key, icon: Icon }, index) => (
              <article key={key} className="rounded-xl border border-hair bg-panel p-7 sm:p-8 shadow-sm transition-all hover:border-accent/50">
                <div className="mb-6 flex items-center justify-between">
                  <div className="rounded-lg bg-accent/10 p-2.5">
                    <Icon size={24} className="text-accent" />
                  </div>
                  <span className="font-mono text-xs text-faint">0{index + 1}</span>
                </div>
                <h3 className="font-serif text-2xl text-ink">{t(`${key}.title`)}</h3>
                <p className="mt-3 leading-relaxed text-muted">{t(`${key}.description`)}</p>
                <p className="mt-6 pt-4 border-t border-hair/70 font-mono text-xs uppercase tracking-[0.1em] text-accent">{t(`${key}.deliverable`)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y border-hair bg-ground-2/60">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
            <div className="inline-flex items-center rounded-full border border-accent/25 bg-accent/10 px-3 py-1 font-mono text-xs font-medium uppercase tracking-wider text-accent">{t("processEyebrow")}</div>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {["discover", "build", "deliver"].map((step, index) => (
                <div key={step} className="rounded-xl border border-hair bg-ground p-6 shadow-xs">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-accent/15 font-mono text-xs font-bold text-accent">0{index + 1}</span>
                  <h3 className="mt-4 font-serif text-2xl text-ink">{t(`process.${step}.title`)}</h3>
                  <p className="mt-2 leading-relaxed text-muted text-sm sm:text-base">{t(`process.${step}.description`)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="inquiry" className="scroll-mt-24">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 md:px-6 lg:grid-cols-[.75fr_1.25fr] lg:py-24">
            <div>
              <div className="inline-flex items-center rounded-full border border-accent/25 bg-accent/10 px-3 py-1 font-mono text-xs font-medium uppercase tracking-wider text-accent">{t("inquiryEyebrow")}</div>
              <h2 className="mt-4 font-serif text-3xl tracking-tight sm:text-4xl">{t("inquiryTitle")}</h2>
              <p className="mt-5 leading-relaxed text-muted">{t("inquiryIntro")}</p>
              <p className="mt-6 font-mono text-xs uppercase tracking-[0.1em] text-muted">{t("responseTime")}</p>
            </div>
            <div className="rounded-xl border border-hair bg-panel p-6 sm:p-8 shadow-sm"><ServicesInquiryForm /></div>
          </div>
        </section>
      </main>
      <Footer />
      <AIChatWidget />
    </div>
  );
}
