import type { Metadata } from "next";
import { ArrowRight, ChartLine, DataBase, Dashboard, IbmCloudPakData } from "@carbon/icons-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ServicesInquiryForm } from "@/components/services/ServicesInquiryForm";
import { Link } from "@/i18n/navigation";
import { dataAuditPath, servicesPath } from "@/lib/routes";

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
    <>
      <Header alternateLocalePath={servicesPath(locale === "en" ? "tr" : "en")} />
      <main className="bg-ground text-ink">
        <section className="border-b border-hair">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 md:px-6 lg:grid-cols-[1.4fr_.6fr] lg:px-8 lg:py-28">
            <div>
              <p className="mb-5 font-mono text-xs uppercase tracking-[0.16em] text-accent">{t("eyebrow")}</p>
              <h1 className="max-w-4xl font-display text-5xl uppercase leading-[.95] tracking-tight sm:text-6xl lg:text-7xl">{t("title")}</h1>
              <p className="mt-7 max-w-2xl text-lg leading-relaxed text-ink-soft">{t("intro")}</p>
              <Link href="#inquiry" className="mt-8 inline-flex items-center gap-2 rounded-pill bg-accent px-7 py-3 font-medium text-on-accent transition-colors hover:bg-accent-dim">
                {t("cta")} <ArrowRight size={18} />
              </Link>
            </div>
            <div className="self-end rounded-card border border-hair bg-panel p-6">
              <p className="font-mono text-xs uppercase tracking-[0.1em] text-muted">{t("fitLabel")}</p>
              <p className="mt-3 text-xl leading-snug">{t("fit")}</p>
            </div>
          </div>
        </section>

        <section className="border-b border-hair bg-ground-2">
          <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-12 md:px-6 lg:grid-cols-[1fr_auto] lg:px-8">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-accent">{t("assessmentEyebrow")}</p>
              <h2 className="mt-3 font-display text-3xl uppercase tracking-tight sm:text-4xl">{t("assessmentTitle")}</h2>
              <p className="mt-3 max-w-3xl leading-relaxed text-ink-soft">{t("assessmentDescription")}</p>
            </div>
            <Link href={dataAuditPath(locale)} className="inline-flex items-center justify-center gap-2 rounded-pill border border-accent px-6 py-3 font-medium text-accent transition-colors hover:bg-accent hover:text-on-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              {t("assessmentButton")} <ArrowRight size={18} />
            </Link>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-20 md:px-6 lg:px-8">
          <div className="mb-10 max-w-2xl">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-accent">{t("servicesEyebrow")}</p>
            <h2 className="mt-4 font-display text-4xl uppercase tracking-tight sm:text-5xl">{t("servicesTitle")}</h2>
          </div>
          <div className="grid gap-px overflow-hidden rounded-card border border-hair bg-hair md:grid-cols-2">
            {services.map(({ key, icon: Icon }, index) => (
              <article key={key} className="bg-panel p-7 sm:p-9">
                <div className="mb-8 flex items-center justify-between">
                  <Icon size={28} className="text-accent" />
                  <span className="font-mono text-xs text-faint">0{index + 1}</span>
                </div>
                <h3 className="text-xl font-medium">{t(`${key}.title`)}</h3>
                <p className="mt-3 leading-relaxed text-ink-soft">{t(`${key}.description`)}</p>
                <p className="mt-6 font-mono text-xs uppercase tracking-[0.1em] text-muted">{t(`${key}.deliverable`)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y border-hair bg-ground-2">
          <div className="mx-auto max-w-7xl px-4 py-20 md:px-6 lg:px-8">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-accent">{t("processEyebrow")}</p>
            <div className="mt-8 grid gap-8 md:grid-cols-3">
              {["discover", "build", "deliver"].map((step, index) => (
                <div key={step}>
                  <span className="font-mono text-xs text-faint">0{index + 1}</span>
                  <h3 className="mt-3 text-xl font-medium">{t(`process.${step}.title`)}</h3>
                  <p className="mt-2 leading-relaxed text-ink-soft">{t(`process.${step}.description`)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="inquiry" className="scroll-mt-24">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 md:px-6 lg:grid-cols-[.75fr_1.25fr] lg:px-8 lg:py-24">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-accent">{t("inquiryEyebrow")}</p>
              <h2 className="mt-4 font-display text-4xl uppercase tracking-tight sm:text-5xl">{t("inquiryTitle")}</h2>
              <p className="mt-5 leading-relaxed text-ink-soft">{t("inquiryIntro")}</p>
              <p className="mt-6 font-mono text-xs uppercase tracking-[0.1em] text-muted">{t("responseTime")}</p>
            </div>
            <div className="rounded-card border border-hair bg-panel p-6 sm:p-8"><ServicesInquiryForm /></div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
