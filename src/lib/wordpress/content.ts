import "server-only";

import type { Locale } from "@/types";
import { wordpressFetch, wordpressFetchPage, WordPressApiError } from "./client";
import { normalizeWordPressItem } from "./normalize";
import type {
  WordPressApiItem,
  WordPressCollectionType,
  WordPressContentItem,
  WordPressPage,
  WordPressTranslation,
} from "./types";

const ITEM_FIELDS = [
  "id",
  "date_gmt",
  "modified_gmt",
  "slug",
  "status",
  "type",
  "title",
  "content",
  "excerpt",
  "featured_media",
  "acf",
  "_embedded",
].join(",");

const ENDPOINTS: Record<WordPressCollectionType, string> = {
  posts: "wp/v2/posts",
  pages: "wp/v2/pages",
  projects: "wp/v2/projects",
};

function previewAuth(): { username: string; applicationPassword: string } {
  const username = process.env.WORDPRESS_PREVIEW_USERNAME;
  const applicationPassword = process.env.WORDPRESS_PREVIEW_APPLICATION_PASSWORD;
  if (!username || !applicationPassword) {
    throw new Error("WORDPRESS_PREVIEW_USERNAME and WORDPRESS_PREVIEW_APPLICATION_PASSWORD are required for draft preview.");
  }
  return { username, applicationPassword };
}

function collectionTag(type: WordPressCollectionType, locale: Locale): string {
  return `wp:${type}:${locale}`;
}

export function contentCacheTags(
  type: WordPressCollectionType,
  locale: Locale,
  id?: number,
): string[] {
  return ["wp:content", collectionTag(type, locale), ...(id ? [`wp:item:${id}`] : [])];
}

export async function getWordPressCollection(
  type: WordPressCollectionType,
  locale: Locale,
  page = 1,
  perPage = 100,
): Promise<WordPressPage<WordPressContentItem>> {
  const response = await wordpressFetchPage<WordPressApiItem>(ENDPOINTS[type], {
    query: {
      status: "publish",
      js_locale: locale,
      page,
      per_page: Math.min(Math.max(perPage, 1), 100),
      order: "desc",
      orderby: type === "pages" ? "menu_order" : "date",
      _embed: "wp:featuredmedia,wp:term",
      _fields: ITEM_FIELDS,
    },
    tags: contentCacheTags(type, locale),
  });

  return {
    ...response,
    items: response.items.map((item) => normalizeWordPressItem(item, locale)),
  };
}

export async function getWordPressItemBySlug(
  type: WordPressCollectionType,
  slug: string,
  locale: Locale,
  preview = false,
): Promise<WordPressContentItem | null> {
  const response = await wordpressFetchPage<WordPressApiItem>(ENDPOINTS[type], {
    query: {
      slug,
      status: preview ? "any" : "publish",
      context: preview ? "edit" : "view",
      js_locale: locale,
      per_page: 1,
      _embed: "wp:featuredmedia,wp:term",
      _fields: ITEM_FIELDS,
    },
    tags: contentCacheTags(type, locale),
    revalidate: preview ? 0 : undefined,
    auth: preview ? previewAuth() : undefined,
  });

  const item = response.items[0];
  return item ? normalizeWordPressItem(item, locale, preview) : null;
}

export async function getWordPressItemByLegacyKey(
  type: WordPressCollectionType,
  legacySourceKey: string,
  locale: Locale,
  preview = false,
): Promise<WordPressContentItem | null> {
  const response = await wordpressFetchPage<WordPressApiItem>(ENDPOINTS[type], {
    query: {
      js_legacy_source_key: legacySourceKey,
      status: preview ? "any" : "publish",
      context: preview ? "edit" : "view",
      js_locale: locale,
      per_page: 1,
      _embed: "wp:featuredmedia,wp:term",
      _fields: ITEM_FIELDS,
    },
    tags: contentCacheTags(type, locale),
    revalidate: preview ? 0 : undefined,
    auth: preview ? previewAuth() : undefined,
  });

  const item = response.items[0];
  return item ? normalizeWordPressItem(item, locale, preview) : null;
}

export async function getWordPressPreviewById(
  type: WordPressCollectionType,
  contentId: number,
): Promise<WordPressApiItem> {
  return wordpressFetch<WordPressApiItem>(`${ENDPOINTS[type]}/${contentId}`, {
    query: { context: "edit", _fields: ITEM_FIELDS },
    revalidate: 0,
    auth: previewAuth(),
  });
}

export async function resolveWordPressTranslation(
  contentId: number,
  locale: Locale,
): Promise<WordPressTranslation | null> {
  try {
    return await wordpressFetch<WordPressTranslation>("js/v1/translation", {
      query: { content_id: contentId, locale },
      tags: ["wp:translations", `wp:item:${contentId}`],
    });
  } catch (error) {
    if (error instanceof WordPressApiError && error.status === 404) return null;
    throw error;
  }
}

export async function getAllWordPressContent(
  type: WordPressCollectionType,
  locale: Locale,
): Promise<WordPressContentItem[]> {
  const first = await getWordPressCollection(type, locale, 1, 100);
  if (first.totalPages <= 1) return first.items;

  const remaining = await Promise.all(
    Array.from({ length: first.totalPages - 1 }, (_, index) =>
      getWordPressCollection(type, locale, index + 2, 100),
    ),
  );

  return [first, ...remaining].flatMap((page) => page.items);
}
