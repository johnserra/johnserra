import type { Metadata } from "next";
import type { Locale } from "@/types";

export const SITE_URL = "https://johnserra.com";
export const SITE_NAME = "John Serra";
export const SITE_OG_IMAGE = {
  url: `${SITE_URL}/opengraph-image`,
  width: 1200,
  height: 630,
  alt: "John Serra — Practical Analytics for Better Small-Business Decisions",
  type: "image/png",
} as const;

const HOME_LANGUAGES = {
  en: SITE_URL,
  tr: `${SITE_URL}/tr`,
  "x-default": SITE_URL,
} as const;

function localeMetadataFields(locale: Locale) {
  const ogLocale = locale === "tr" ? "tr_TR" : "en_US";
  const alternateLocale = locale === "tr" ? "en_US" : "tr_TR";
  const url = locale === "tr" ? `${SITE_URL}/tr` : SITE_URL;
  return { ogLocale, alternateLocale, url };
}

export function getLocaleLayoutMetadata(
  locale: Locale,
  title: string,
  description: string,
): Metadata {
  const { ogLocale, alternateLocale } = localeMetadataFields(locale);

  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    alternates: {
      languages: { ...HOME_LANGUAGES },
    },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: ogLocale,
      alternateLocale: [alternateLocale],
      title,
      description,
      images: [{ ...SITE_OG_IMAGE }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ ...SITE_OG_IMAGE }],
    },
  };
}

export function getHomeMetadata(
  locale: Locale,
  title: string,
  description: string,
): Metadata {
  const { ogLocale, alternateLocale, url } = localeMetadataFields(locale);

  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: { ...HOME_LANGUAGES },
    },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: ogLocale,
      alternateLocale: [alternateLocale],
      url,
      title,
      description,
      images: [{ ...SITE_OG_IMAGE }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ ...SITE_OG_IMAGE }],
    },
  };
}
