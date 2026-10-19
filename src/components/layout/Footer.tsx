import { LogoLinkedin, Email } from "@carbon/icons-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { privacyPolicyPath } from "@/lib/routes";

export async function Footer() {
  const currentYear = new Date().getFullYear();
  const locale = await getLocale();
  const t = await getTranslations("Footer");

  return (
    <footer className="w-full border-t border-hair bg-ground text-ink font-sans">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <p className="font-sans text-sm font-semibold tracking-wide text-ink">
              John <span className="font-serif text-accent">Serra</span>
            </p>
            <p className="font-sans text-xs text-muted mt-1">
              {t("tagline")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-6 font-mono text-xs text-faint">
            <div className="flex items-center gap-4">
              <a
                href="https://linkedin.com/in/johnserra"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent transition-colors hover:text-accent-dim"
                aria-label="LinkedIn"
              >
                <LogoLinkedin size={18} />
              </a>
              <a
                href="mailto:john@serra.us"
                className="text-accent transition-colors hover:text-accent-dim"
                aria-label="Email"
              >
                <Email size={18} />
              </a>
            </div>
            <Link
              href={`${locale === "tr" ? "/tr" : ""}/blog`}
              className="text-accent transition-colors hover:underline"
            >
              {t("blog")}
            </Link>
            <Link
              href={`${locale === "tr" ? "/tr" : ""}${privacyPolicyPath(locale)}`}
              className="text-accent transition-colors hover:underline"
            >
              {t("privacyPolicy")}
            </Link>
            <p>Copyright &copy; {currentYear}</p>
          </div>
        </div>
      </div>
      {/* ArsDigita double-bar footer bookend */}
      <div aria-hidden="true" className="h-2.5 w-full bg-nav" />
      <div aria-hidden="true" className="h-2.5 border-t border-white bg-nav-band" />
    </footer>
  );
}
