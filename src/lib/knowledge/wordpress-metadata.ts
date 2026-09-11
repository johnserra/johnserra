import type { WordPressApiItem, WordPressContentType } from "@/lib/wordpress/types";
import type { Locale } from "@/types";

export const WORDPRESS_INDEXING_CONFIG_VERSION = "wordpress-indexing-v2";
export const WORDPRESS_CHUNKING_CONFIG_VERSION = "structure-aware-v1";
export const WORDPRESS_DOCUMENT_TYPE = "wordpress" as const;

export type WordPressAuthority = "authored_post" | "project_page" | "site_page";

const PUBLIC_ORIGIN = "https://johnserra.com";

export function wordPressCanonicalUrl(
  contentType: WordPressContentType,
  slug: string,
  locale: Locale,
  legacySourceKey?: string,
): string {
  const prefix = locale === "en" ? "" : "/tr";
  if (contentType === "post") return `${PUBLIC_ORIGIN}${prefix}/blog/${slug}`;
  if (contentType === "js_project") {
    return `${PUBLIC_ORIGIN}${prefix}${locale === "tr" ? "/projeler" : "/projects"}/${slug}`;
  }
  if (legacySourceKey === `${locale}/about/index`) {
    return `${PUBLIC_ORIGIN}${prefix}${locale === "tr" ? "/hakkimda" : "/about"}`;
  }
  if (legacySourceKey === `${locale}/privacy-policy/index`) {
    return `${PUBLIC_ORIGIN}${prefix}${locale === "tr" ? "/gizlilik-politikasi" : "/privacy-policy"}`;
  }
  return `${PUBLIC_ORIGIN}${prefix}/${slug}`;
}

export function wordPressAuthority(contentType: WordPressContentType): WordPressAuthority {
  if (contentType === "post") return "authored_post";
  if (contentType === "js_project") return "project_page";
  return "site_page";
}

export function wordPressSourceMetadata(item: WordPressApiItem, locale: Locale): {
  canonical_url: string;
  authority: WordPressAuthority;
  document_type: typeof WORDPRESS_DOCUMENT_TYPE;
} {
  return {
    canonical_url: wordPressCanonicalUrl(item.type, item.slug, locale, item.acf?.legacy_source_key),
    authority: wordPressAuthority(item.type),
    document_type: WORDPRESS_DOCUMENT_TYPE,
  };
}
