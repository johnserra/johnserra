import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ContactForm } from "@/components/ui/ContactForm";
import { LogoLinkedin, Email } from "@carbon/icons-react";
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
      icon: LogoLinkedin,
      description: t("connectProfessionally"),
    },
    {
      label: t("email"),
      href: "mailto:john@serra.us",
      icon: Email,
      description: "john@serra.us",
    },
  ];

  return (
    <div className="bg-ground text-ink">
      <Header />
      <main className="min-h-screen py-14 md:py-20">
        <div className="max-w-2xl mx-auto px-4 md:px-6">
          <div className="mb-12">
            <h1 className="mb-3 font-serif text-4xl sm:text-5xl tracking-tight text-ink leading-tight">
              {t("title")}
            </h1>
            <p className="text-base md:text-lg leading-relaxed text-muted">
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
                className="group flex flex-1 items-center gap-4 rounded-xl border border-hair bg-panel p-6 shadow-sm transition-all hover:border-accent/50 hover:shadow-md no-underline"
              >
                <div className="rounded-lg bg-accent/10 p-3 transition-colors group-hover:bg-accent/15">
                  <Icon size={20} className="text-accent transition-colors group-hover:text-accent-dim group-focus-visible:text-accent-dim" />
                </div>
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.1em] font-semibold text-accent transition-colors group-hover:text-accent-dim group-focus-visible:text-accent-dim">{label}</p>
                  <p className="text-sm text-muted">{description}</p>
                </div>
              </a>
            ))}
          </div>

          {/* Contact form */}
          <div className="rounded-xl border border-hair bg-panel p-6 sm:p-8 shadow-sm">
            <h2 className="mb-6 font-mono text-xs uppercase tracking-[0.1em] text-accent font-semibold">
              {t("sendMessage")}
            </h2>
            <ContactForm />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
