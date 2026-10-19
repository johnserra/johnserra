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
    <header className="sticky top-0 z-50 w-full bg-ground text-ink">
      {/* Row 1: Masthead */}
      <div className="max-w-6xl mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between py-2.5">
          <Link
            href="/"
            className="flex items-center gap-3 no-underline"
          >
            <Image src="/logo.png" alt="" width={32} height={32} priority />
            <span className="font-sans text-lg font-medium tracking-tight text-ink">
              John <span className="font-serif text-accent">Serra</span>
            </span>
          </Link>

          <div className="flex items-center gap-3 sm:gap-4">
            <LanguageSwitcher alternateLocalePath={alternateLocalePath} />
            <Link
              href={dataAuditPath(locale)}
              className="hidden sm:inline-flex items-center bg-accent text-on-accent hover:bg-accent-dim px-3.5 py-1.5 rounded-[6px] font-mono text-xs uppercase tracking-[0.08em] transition-colors no-underline"
            >
              {t("dataAudit")}
            </Link>
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

      {/* Row 2: Full-width dark gray (#666666 / bg-nav) navigation bar, narrower h-6 */}
      <nav aria-label="Primary" className="w-full bg-nav">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          {/* Desktop Navigation */}
          <div className="hidden md:flex items-stretch h-6">
            {NAV_LINK_HREFS.map((link) => (
              <Link
                key={link.href}
                href={hrefFor(link.key, link.href)}
                className="flex items-center px-3.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-white no-underline transition-colors hover:bg-white/15 focus:text-white"
              >
                {t(link.key)}
              </Link>
            ))}
          </div>

          {/* Mobile Navigation */}
          <div
            className={cn(
              "bg-nav overflow-hidden transition-all duration-300 ease-in-out md:hidden",
              mobileMenuOpen ? "max-h-80 py-2.5 px-2" : "h-6"
            )}
          >
            <div className={cn("flex flex-col gap-1", !mobileMenuOpen && "hidden")}>
              {NAV_LINK_HREFS.map((link) => (
                <Link
                  key={link.href}
                  href={hrefFor(link.key, link.href)}
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-2.5 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-white no-underline transition-colors hover:bg-white/15 focus:text-white"
                >
                  {t(link.key)}
                </Link>
              ))}
              <div className="mt-2 pt-2 border-t border-white/20 flex items-center justify-between px-2.5">
                <Link
                  href="/contact"
                  onClick={() => setMobileMenuOpen(false)}
                  className="font-mono text-[11px] uppercase tracking-[0.08em] text-white no-underline hover:underline"
                >
                  {t("contact")}
                </Link>
                <Link
                  href={dataAuditPath(locale)}
                  onClick={() => setMobileMenuOpen(false)}
                  className="bg-nav-band text-white px-3 py-1 rounded-[4px] font-mono text-[11px] uppercase tracking-[0.08em] no-underline"
                >
                  {t("dataAudit")}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Row 3: 1px white separator + #0085C0 / --color-nav-band contextual bar, narrower h-6 */}
      <div className="h-6 border-t border-white bg-nav-band text-white">
        <div className="max-w-6xl mx-auto h-full px-4 md:px-6 flex items-center justify-between gap-4 font-mono text-[11px] uppercase tracking-[0.08em] overflow-hidden whitespace-nowrap">
          {breadcrumbs.length === 0 ? (
            <span className="truncate text-white">{t("tagline")}</span>
          ) : (
            <nav aria-label="Breadcrumb" className="min-w-0 flex-1 overflow-hidden">
              <ol className="flex items-center gap-2 min-w-0 overflow-hidden">
                <li className="shrink-0">
                  <Link
                    href="/"
                    className="text-white no-underline transition-colors hover:underline"
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
                      <span aria-hidden="true" className="text-white/75">
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
                          className="text-white no-underline transition-colors hover:underline"
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
