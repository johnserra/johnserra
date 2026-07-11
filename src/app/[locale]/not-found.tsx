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
          <p className="mb-4 font-display text-7xl text-accent">
            404
          </p>
          <h1 className="mb-4 text-4xl font-bold tracking-tight text-ink">
            {t("title")}
          </h1>
          <p className="mb-8 text-lg text-ink-soft">
            {t("description")}
          </p>
          <Link href="/" className="font-mono text-xs uppercase tracking-[0.1em] text-muted transition-colors hover:text-accent">
            Home
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
