import type { Metadata } from "next";
import type { Frontmatter } from "./content";
import type { Locale } from "@/types";

const SITE_URL = "https://johnserra.com";

export function blogArticlePath(locale: Locale, slug: string): string {
  return `${locale === "en" ? "" : "/tr"}/blog/${slug}`;
}

export function getBlogMetadata(
  locale: Locale,
  slug: string,
  frontmatter: Frontmatter,
  translatedSlug: string | null,
): Metadata {
  const path = blogArticlePath(locale, slug);
  const targetLocale = locale === "en" ? "tr" : "en";
  const translatedPath = translatedSlug
    ? blogArticlePath(targetLocale, translatedSlug)
    : null;
  const englishPath = locale === "en" ? path : translatedPath;
  const languages = {
    [locale]: new URL(path, SITE_URL).href,
    ...(translatedPath ? { [targetLocale]: new URL(translatedPath, SITE_URL).href } : {}),
    ...(englishPath ? { "x-default": new URL(englishPath, SITE_URL).href } : {}),
  };
  const url = new URL(path, SITE_URL).href;
  const image = {
    url: new URL(frontmatter.coverImage || `${path}/share-image`, SITE_URL).href,
    alt: frontmatter.coverImageAlt || frontmatter.title,
    ...(!frontmatter.coverImage ? { width: 1200, height: 630 } : {}),
  };

  return {
    title: `${frontmatter.title} — John Serra`,
    description: frontmatter.description,
    alternates: { canonical: url, languages },
    openGraph: {
      type: "article",
      title: frontmatter.title,
      description: frontmatter.description,
      url,
      siteName: "John Serra",
      locale: locale === "en" ? "en_US" : "tr_TR",
      ...(translatedPath ? { alternateLocale: [targetLocale === "en" ? "en_US" : "tr_TR"] } : {}),
      publishedTime: frontmatter.date,
      authors: [SITE_URL],
      tags: frontmatter.tags,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: frontmatter.title,
      description: frontmatter.description,
      images: [image],
    },
  };
}
