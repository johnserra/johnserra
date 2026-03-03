import { useTranslations } from "next-intl";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

export default function NotFound() {
  const t = useTranslations("NotFound");

  return (
    <>
      <Header />
      <main className="min-h-screen bg-zinc-50 dark:bg-black">
        <div className="max-w-3xl mx-auto px-4 md:px-6 lg:px-8 pt-24 pb-16">
          <p className="text-sm font-semibold text-blue-600 uppercase tracking-widest mb-4">
            404
          </p>
          <h1 className="text-4xl font-bold text-zinc-900 dark:text-zinc-50 mb-4">
            {t("title")}
          </h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400 mb-16">
            {t("description")}
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
