"use client";

import { useState } from "react";
import { Menu, Close } from "@carbon/icons-react";
import { useTranslations, useLocale } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { IconButton } from "@/components/ui/IconButton";

const NAV_LINK_HREFS = [
  { key: "home", href: "/" },
  { key: "about", href: "/about" },
  { key: "blog", href: "/blog" },
  { key: "portfolio", href: "/projects" },
  { key: "contact", href: "/contact" },
] as const;

function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  const otherLocale = locale === "en" ? "tr" : "en";

  return (
    <button
      onClick={() => router.replace(pathname, { locale: otherLocale })}
      className="rounded-field px-2 py-1 font-mono text-xs uppercase tracking-[0.1em] text-muted transition-colors hover:bg-panel-2 hover:text-ink"
    >
      {otherLocale.toUpperCase()}
    </button>
  );
}

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const t = useTranslations("Nav");
  const tCommon = useTranslations("Common");

  return (
    <header className="sticky top-0 z-50 w-full border-b border-hair bg-ground/85 backdrop-blur">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link
            href="/"
            className="text-xl font-medium text-ink transition-colors hover:text-ink-soft"
          >
            John Serra
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-8">
            {NAV_LINK_HREFS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "font-mono text-xs uppercase tracking-[0.1em] text-muted transition-colors hover:text-ink",
                  pathname === link.href && "text-accent"
                )}
              >
                {t(link.key)}
              </Link>
            ))}
            <LanguageSwitcher />
          </nav>

          {/* Mobile Menu Button */}
          <div className="flex items-center gap-2 md:hidden">
            <LanguageSwitcher />
            <IconButton
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              description={tCommon("toggleMenu")}
              kind="ghost"
              size="md"
            >
              {mobileMenuOpen ? <Close size={20} /> : <Menu size={20} />}
            </IconButton>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div
          className={cn(
            "overflow-hidden bg-ground-2 transition-all duration-300 ease-in-out md:hidden",
            mobileMenuOpen ? "max-h-64 pb-4" : "max-h-0"
          )}
        >
          <nav className="flex flex-col gap-4 pt-4">
            {NAV_LINK_HREFS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  "font-mono text-xs uppercase tracking-[0.1em] text-muted transition-colors hover:text-ink",
                  pathname === link.href && "text-accent"
                )}
              >
                {t(link.key)}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}
