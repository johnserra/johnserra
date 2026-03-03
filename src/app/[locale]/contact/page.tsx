import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ContactForm } from "@/components/ui/ContactForm";
import { Linkedin, Mail } from "lucide-react";
import { setRequestLocale, getTranslations } from "next-intl/server";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Contact" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export default async function ContactPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("Contact");

  const CONTACT_LINKS = [
    {
      label: t("linkedin"),
      href: "https://linkedin.com/in/johnserra",
      icon: Linkedin,
      description: t("connectProfessionally"),
    },
    {
      label: t("email"),
      href: "mailto:john@serra.us",
      icon: Mail,
      description: "john@serra.us",
    },
  ];

  return (
    <>
      <Header />
      <main className="min-h-screen bg-zinc-50 dark:bg-black py-16">
        <div className="max-w-2xl mx-auto px-4 md:px-6 lg:px-8">
          <div className="mb-12">
            <h1 className="text-4xl font-bold text-zinc-900 dark:text-zinc-50 mb-4">
              {t("title")}
            </h1>
            <p className="text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {t("subtitle")}
            </p>
          </div>

          {/* Direct contact links */}
          <div className="flex flex-col sm:flex-row gap-4 mb-12">
            {CONTACT_LINKS.map(({ label, href, icon: Icon, description }) => (
              <a
                key={label}
                href={href}
                target={href.startsWith("http") ? "_blank" : undefined}
                rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
                className="flex items-center gap-4 flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group"
              >
                <div className="p-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 group-hover:bg-blue-50 dark:group-hover:bg-blue-950 transition-colors">
                  <Icon size={20} className="text-zinc-600 dark:text-zinc-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
                </div>
                <div>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-50">{label}</p>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
                </div>
              </a>
            ))}
          </div>

          {/* Contact form */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mb-6">
              {t("sendMessage")}
            </h2>
            <ContactForm />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
