"use client";

import { useState } from "react";
import Image from "next/image";
import { Menu, Close } from "@carbon/icons-react";
import { useTranslations, useLocale } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import {
  aboutPath,
  dataAuditPath,
  privacyPolicyPath,
  projectsPath,
  servicesPath,
} from "@/lib/routes";
import { IconButton } from "@/components/ui/IconButton";

const NAV_LINK_HREFS = [
  { key: "home", href: "/" },
  { key: "about", href: "/about" },
  { key: "blog", href: "/blog" },
  { key: "portfolio", href: "/projects" },
  { key: "services", href: "/services" },
  { key: "contact", href: "/contact" },
] as const;

function humanizeSlug(slug: string): string {
  return decodeURIComponent(slug).replace(/-/g, " ");
}

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

export function Header({
  alternateLocalePath,
  breadcrumbTitle,
}: {
  alternateLocalePath?: string;
  breadcrumbTitle?: string;
} = {}) {
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
        : key === "services"
          ? servicesPath(locale)
          : href;

  const isLinkActive = (key: string, href: string) => {
    const resolved = hrefFor(key, href);
    if (key === "home") return pathname === "/";
    if (key === "portfolio") {
      return (
        pathname === "/projects" ||
        pathname.startsWith("/projects/") ||
        pathname === "/projeler" ||
        pathname.startsWith("/projeler/")
      );
    }
    if (key === "blog") {
      return pathname === "/blog" || pathname.startsWith("/blog/");
    }
    if (key === "about") {
      return pathname === "/about" || pathname === "/hakkimda";
    }
    if (key === "services") {
      return pathname === "/services" || pathname === "/hizmetler";
    }
    return pathname === resolved || pathname.startsWith(`${resolved}/`);
  };

  const breadcrumbs = (() => {
    if (!pathname || pathname === "/") return [];
    const segments = pathname.split("/").filter(Boolean);
    const items: Array<{ label: string; href: string }> = [];

    const first = segments[0];
    if (first === "about" || first === "hakkimda") {
      items.push({ label: t("about"), href: aboutPath(locale) });
    } else if (first === "blog") {
      items.push({ label: t("blog"), href: "/blog" });
      if (segments[1]) {
        items.push({
          label: breadcrumbTitle ?? humanizeSlug(segments[1]),
          href: `/blog/${segments[1]}`,
        });
      }
    } else if (first === "projects" || first === "projeler") {
      items.push({ label: t("portfolio"), href: projectsPath(locale) });
      if (segments[1]) {
        items.push({
          label: breadcrumbTitle ?? humanizeSlug(segments[1]),
          href: projectsPath(locale, segments[1]),
        });
      }
    } else if (first === "services" || first === "hizmetler") {
      items.push({ label: t("services"), href: servicesPath(locale) });
    } else if (first === "contact") {
      items.push({ label: t("contact"), href: "/contact" });
    } else if (first === "data-audit" || first === "veri-denetimi") {
      items.push({ label: t("dataAudit"), href: dataAuditPath(locale) });
    } else if (first === "privacy-policy" || first === "gizlilik-politikasi") {
      items.push({ label: t("privacyPolicy"), href: privacyPolicyPath(locale) });
    } else {
      segments.forEach((seg, idx) => {
        const isLast = idx === segments.length - 1;
        items.push({
          label: isLast && breadcrumbTitle ? breadcrumbTitle : humanizeSlug(seg),
          href: "/" + segments.slice(0, idx + 1).join("/"),
        });
      });
    }
    return items;
  })();

  return (
    <header className="sticky top-0 z-50 w-full bg-ground">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
        <div className="flex items-center justify-between py-3">
          <Link
            href="/"
            className="flex items-center gap-3.5 text-xl font-medium text-ink no-underline"
          >
            <Image src="/logo.png" alt="" width={48} height={48} priority />
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

      {/* Upper stripe: ArsDigita #999999 left gutter + 1px white keyline aligned with logo/body + #666666 main navigation */}
      <nav
        aria-label="Primary"
        className="bg-[linear-gradient(to_right,var(--color-nav-split)_0%,var(--color-nav-split)_50%,var(--color-nav)_50%,var(--color-nav)_100%)]"
      >
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
          {/* Desktop Navigation */}
          <div className="hidden md:flex items-stretch h-8 bg-nav border-l border-white">
            {NAV_LINK_HREFS.map((link) => {
              const active = isLinkActive(link.key, link.href);
              return (
                <Link
                  key={link.href}
                  href={hrefFor(link.key, link.href)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center px-4 font-mono text-xs uppercase tracking-[0.1em] text-white no-underline transition-colors focus:text-white",
                    active
                      ? "bg-nav-split font-semibold border-r border-white/60 first:border-l-0 border-l"
                      : "font-medium hover:bg-white/15"
                  )}
                >
                  {t(link.key)}
                </Link>
              );
            })}
          </div>

          {/* Mobile Navigation */}
          <div
            className={cn(
              "bg-nav border-l border-white overflow-hidden transition-all duration-300 ease-in-out md:hidden",
              mobileMenuOpen ? "max-h-72 py-3 px-2" : "h-8"
            )}
          >
            <div className={cn("flex flex-col gap-1", !mobileMenuOpen && "hidden")}>
              {NAV_LINK_HREFS.map((link) => {
                const active = isLinkActive(link.key, link.href);
                return (
                  <Link
                    key={link.href}
                    href={hrefFor(link.key, link.href)}
                    onClick={() => setMobileMenuOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "px-2.5 py-1.5 font-mono text-xs uppercase tracking-[0.1em] text-white no-underline focus:text-white",
                      active ? "bg-nav-split font-semibold" : "font-medium"
                    )}
                  >
                    {t(link.key)}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </nav>

      {/* Lower stripe: 1px white separator + #0085C0 / --color-nav-band contextual breadcrumb bar (same h-8 height) */}
      <div className="h-8 border-t border-white bg-nav-band text-white">
        <div className="max-w-7xl mx-auto h-full px-4 md:px-6 lg:px-8 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.08em] overflow-hidden whitespace-nowrap">
          {breadcrumbs.length === 0 ? (
            <span className="truncate text-white/95">{t("tagline")}</span>
          ) : (
            <nav aria-label="Breadcrumb" className="min-w-0 flex-1 overflow-hidden">
              <ol className="flex items-center gap-2 min-w-0 overflow-hidden">
                <li className="shrink-0">
                  <Link
                    href="/"
                    className="text-white/90 no-underline transition-colors hover:text-white hover:underline"
                  >
                    {t("home")}
                  </Link>
                </li>
                {breadcrumbs.map((crumb, index) => {
                  const isLast = index === breadcrumbs.length - 1;
                  return (
                    <li
                      key={crumb.href}
                      className={cn(
                        "flex items-center gap-2",
                        isLast ? "min-w-0 overflow-hidden" : "shrink-0"
                      )}
                    >
                      <span aria-hidden="true" className="text-white/60">
                        /
                      </span>
                      {isLast ? (
                        <span
                          aria-current="page"
                          className="truncate font-semibold text-white"
                        >
                          {crumb.label}
                        </span>
                      ) : (
                        <Link
                          href={crumb.href}
                          className="text-white/90 no-underline transition-colors hover:text-white hover:underline"
                        >
                          {crumb.label}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>
          )}
        </div>
      </div>
    </header>
  );
}
