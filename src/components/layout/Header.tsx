"use client";

import { useState } from "react";
import Image from "next/image";
import { Menu, Close } from "@carbon/icons-react";
import { useTranslations, useLocale } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { aboutPath, projectsPath, servicesPath } from "@/lib/routes";
import { IconButton } from "@/components/ui/IconButton";

const NAV_LINK_HREFS = [
  { key: "home", href: "/" },
  { key: "about", href: "/about" },
  { key: "blog", href: "/blog" },
  { key: "portfolio", href: "/projects" },
  { key: "services", href: "/services" },
  { key: "contact", href: "/contact" },
] as const;

function LanguageSwitcher({ alternateLocalePath }: { alternateLocalePath?: string }) {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  const otherLocale = locale === "en" ? "tr" : "en";

  return (
    <button
      onClick={() => router.replace(alternateLocalePath ?? pathname, { locale: otherLocale })}
      className="rounded-field border border-line px-2.5 py-1.5 font-mono text-xs uppercase tracking-[0.1em] text-muted transition-colors hover:border-line-strong hover:text-ink"
    >
      {otherLocale.toUpperCase()}
    </button>
  );
}

export function Header({ alternateLocalePath }: { alternateLocalePath?: string } = {}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations("Nav");
  const tCommon = useTranslations("Common");

  const hrefFor = (key: string, href: string) =>
    key === "portfolio"
      ? projectsPath(locale)
      : key === "about"
        ? aboutPath(locale)
        : key === "services" ? servicesPath(locale) : href;

  return (
    <header className="sticky top-0 z-50 w-full bg-ground">
      <div className="h-1.5 bg-brand" />

      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
        <div className="flex items-center justify-between py-3.5">
          <Link
            href="/"
            className="flex items-center gap-3.5 text-xl font-medium text-ink no-underline"
          >
            <Image src="/logo.png" alt="" width={52} height={52} priority />
            John Serra
          </Link>

          <div className="flex items-center gap-2">
            <LanguageSwitcher alternateLocalePath={alternateLocalePath} />
            <div className="md:hidden">
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
        </div>
      </div>

      <nav className="bg-nav">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8 min-h-11">
            {NAV_LINK_HREFS.map((link) => (
              <Link
                key={link.href}
                href={hrefFor(link.key, link.href)}
                className={cn(
                  "py-3 border-b-[3px] border-transparent font-mono text-xs font-medium uppercase tracking-[0.1em] text-white no-underline transition-colors hover:border-white/60",
                  pathname === link.href && "border-white"
                )}
              >
                {t(link.key)}
              </Link>
            ))}
          </div>

          {/* Mobile Navigation */}
          <div
            className={cn(
              "overflow-hidden transition-all duration-300 ease-in-out md:hidden",
              mobileMenuOpen ? "max-h-72 py-4" : "max-h-0"
            )}
          >
            <div className="flex flex-col gap-4">
              {NAV_LINK_HREFS.map((link) => (
                <Link
                  key={link.href}
                  href={hrefFor(link.key, link.href)}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "font-mono text-xs font-medium uppercase tracking-[0.1em] text-white no-underline",
                    pathname === link.href && "underline underline-offset-4"
                  )}
                >
                  {t(link.key)}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
}
