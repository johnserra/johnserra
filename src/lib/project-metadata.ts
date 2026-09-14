import { projectsPath } from "@/lib/routes";
import type { Locale } from "@/types";

export interface ProjectMetadataPaths {
  canonical: string;
  languages: Record<string, string>;
}

function localizedProjectPath(locale: Locale, slug: string): string {
  const path = projectsPath(locale, slug);
  return locale === "en" ? path : `/${locale}${path}`;
}

export function getProjectMetadataPaths(
  locale: Locale,
  slug: string,
  translatedSlug: string | null,
): ProjectMetadataPaths {
  const currentPath = localizedProjectPath(locale, slug);
  const targetLocale = locale === "en" ? "tr" : "en";
  const targetPath = translatedSlug
    ? localizedProjectPath(targetLocale, translatedSlug)
    : null;
  const englishPath = locale === "en" ? currentPath : targetPath;

  return {
    canonical: currentPath,
    languages: {
      [locale]: currentPath,
      ...(targetPath ? { [targetLocale]: targetPath } : {}),
      ...(englishPath ? { "x-default": englishPath } : {}),
    },
  };
}
