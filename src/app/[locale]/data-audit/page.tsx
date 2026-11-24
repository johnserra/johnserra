import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { DataAuditAssessment } from "@/components/data-audit/DataAuditAssessment";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { dataAuditPath } from "@/lib/routes";

interface Props {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "DataAudit" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: {
      canonical: locale === "tr" ? "/tr/veri-denetimi" : "/data-audit",
      languages: {
        en: "/data-audit",
        tr: "/tr/veri-denetimi",
        "x-default": "/data-audit",
      },
    },
  };
}

export default async function DataAuditPage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <>
      <Header alternateLocalePath={dataAuditPath(locale === "en" ? "tr" : "en")} />
      <main className="min-h-[calc(100vh-4rem)] bg-ground text-ink">
        <DataAuditAssessment />
      </main>
      <Footer />
    </>
  );
}
