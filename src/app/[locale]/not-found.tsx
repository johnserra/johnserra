import { useTranslations } from "next-intl";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("NotFound");

  return (
    <>
      <Header />
      <main className="min-h-screen bg-ground text-ink">
        <div className="max-w-3xl mx-auto px-4 md:px-6 lg:px-8 pt-24 pb-16">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#006b9e]/30 bg-[#006b9e]/10 px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-accent">
            404
          </p>
          <h1 className="mb-4 font-serif text-4xl font-normal tracking-tight text-ink sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mb-8 text-lg text-ink-soft">
            {t("description")}
          </p>
          <Link href="/" className="inline-flex h-11 items-center rounded-field bg-accent px-5 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-dim focus-visible:bg-accent-dim">
            Home
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
