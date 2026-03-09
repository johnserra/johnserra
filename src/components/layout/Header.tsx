"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const NAV_LINK_HREFS = [
  { key: "home", href: "/" },
  { key: "about", href: "/about" },
  { key: "blog", href: "/blog" },
  { key: "portfolio", href: "/portfolio" },
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
      className="text-sm font-medium px-2 py-1 rounded-md text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
    >
      {otherLocale.toUpperCase()}
    </button>
  );
}

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const t = useTranslations("Nav");
  const tCommon = useTranslations("Common");

  return (
    <header className="sticky top-0 z-50 w-full bg-white/80 dark:bg-black/50 backdrop-blur-xl border-b border-zinc-200 dark:border-zinc-800">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link
            href="/"
            className="text-xl font-bold text-zinc-900 dark:text-zinc-50 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
          >
            John Serra
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-8">
            {NAV_LINK_HREFS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
              >
                {t(link.key)}
              </Link>
            ))}
            <LanguageSwitcher />
          </nav>

          {/* Mobile Menu Button */}
          <div className="flex items-center gap-2 md:hidden">
            <LanguageSwitcher />
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
              aria-label={tCommon("toggleMenu")}
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div
          className={cn(
            "md:hidden overflow-hidden transition-all duration-300 ease-in-out",
            mobileMenuOpen ? "max-h-64 pb-4" : "max-h-0"
          )}
        >
          <nav className="flex flex-col gap-4 pt-4">
            {NAV_LINK_HREFS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
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
