import type { Locale } from "@/types";

export function aboutPath(locale: Locale | string): string {
  return locale === "tr" ? "/hakkimda" : "/about";
}

export function privacyPolicyPath(locale: Locale | string): string {
  return locale === "tr" ? "/gizlilik-politikasi" : "/privacy-policy";
}

export function projectsPath(locale: Locale | string, slug?: string): string {
  const base = locale === "tr" ? "/projeler" : "/projects";

  return slug ? `${base}/${slug}` : base;
}

export function servicesPath(locale: Locale | string): string {
  return locale === "tr" ? "/hizmetler" : "/services";
}
