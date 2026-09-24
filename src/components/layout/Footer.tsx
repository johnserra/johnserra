import { LogoLinkedin, Email } from "@carbon/icons-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { privacyPolicyPath } from "@/lib/routes";

export async function Footer() {
  const currentYear = new Date().getFullYear();
  const locale = await getLocale();
  const t = await getTranslations("Footer");

  return (
    <footer className="w-full border-t border-hair bg-ground font-sans">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Social Links */}
          <div className="flex items-center gap-6">
            <a
              href="https://linkedin.com/in/johnserra"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted transition-colors hover:text-accent"
              aria-label="LinkedIn"
            >
              <LogoLinkedin size={20} />
            </a>
            <a
              href="mailto:john@serra.us"
              className="text-muted transition-colors hover:text-accent"
              aria-label="Email"
            >
              <Email size={20} />
            </a>
          </div>

          <div className="flex items-center gap-6 font-mono text-xs text-faint">
            <Link
              href={`${locale === "tr" ? "/tr" : ""}${privacyPolicyPath(locale)}`}
              className="transition-colors hover:text-accent"
            >
              {t("privacyPolicy")}
            </Link>
            <p>Copyright &copy; {currentYear}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
