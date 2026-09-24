import "server-only";

import { draftMode } from "next/headers";

import {
  getAllContent as getAllFileContent,
  getContentBySlug as getFileContentBySlug,
  getContentSlugs as getFileContentSlugs,
  getTranslationSlug as getFileTranslationSlug,
  type Frontmatter,
} from "@/lib/content";
import {
  getAllWordPressContent,
  getWordPressItemByLegacyKey,
  getWordPressItemBySlug,
  resolveWordPressTranslation,
} from "@/lib/wordpress/content";
import type { WordPressCollectionType, WordPressContentItem } from "@/lib/wordpress/types";
import type { Locale } from "@/types";

export type SiteContentType = "blog" | "projects" | "about" | "privacy-policy";

export interface SiteContentItem {
  id?: number;
  slug: string;
  frontmatter: Frontmatter;
  content: string;
  format: "mdx" | "html";
}

function usesWordPress(): boolean {
  return process.env.CONTENT_SOURCE === "wordpress";
}

function collectionFor(type: SiteContentType): WordPressCollectionType {
  if (type === "blog") return "posts";
  if (type === "projects") return "projects";
  return "pages";
}

function fromWordPress(item: WordPressContentItem): SiteContentItem {
  return {
    id: item.id,
    slug: item.slug,
    format: "html",
    content: item.contentHtml,
    frontmatter: {
      title: item.title,
      description: item.summary,
      date: item.date,
      tags: item.tags.map((tag) => tag.name),
      coverImage: item.featuredImage?.url,
      coverImageAlt: item.featuredImage?.alt,
      translationGroupId: item.translationGroupId,
      cuisine: item.recipe?.cuisine,
      servings: item.recipe?.servings,
      prepTime: item.recipe?.prepTime,
      cookTime: item.recipe?.cookTime,
      totalTime: item.recipe?.totalTime,
      story: item.recipe?.story,
      status: item.project?.status,
      githubUrl: item.project?.githubUrl,
      liveUrl: item.project?.liveUrl,
    },
  };
}

export async function getAllSiteContent(
  type: SiteContentType,
  locale: Locale,
): Promise<SiteContentItem[]> {
  if (!usesWordPress()) {
    return getAllFileContent(type, locale).map((item) => ({ ...item, format: "mdx" as const }));
  }

  return (await getAllWordPressContent(collectionFor(type), locale)).map(fromWordPress);
}

export async function getSiteContentBySlug(
  type: SiteContentType,
  slug: string,
  locale: Locale,
): Promise<SiteContentItem | null> {
  // Privacy notices are versioned with the frontend so policy text cannot lag a deployment.
  if (!usesWordPress() || type === "privacy-policy") {
    const item = getFileContentBySlug(type, slug, locale);
    return item ? { ...item, format: "mdx" } : null;
  }

  const preview = (await draftMode()).isEnabled;
  const singleton = type === "about";
  const item = singleton
    ? await getWordPressItemByLegacyKey("pages", `${locale}/${type}/index`, locale, preview)
    : await getWordPressItemBySlug(
        collectionFor(type),
        slug,
        locale,
        preview,
      );
  return item ? fromWordPress(item) : null;
}

export async function getSiteContentSlugs(
  type: SiteContentType,
  locale: Locale,
): Promise<string[]> {
  if (!usesWordPress()) return getFileContentSlugs(type, locale);
  return (await getAllSiteContent(type, locale)).map((item) => item.slug);
}

export async function getSiteTranslationSlug(
  type: SiteContentType,
  item: SiteContentItem,
  currentLocale: Locale,
  targetLocale: Locale,
): Promise<string | null> {
  if (!usesWordPress() || !item.id) {
    return getFileTranslationSlug(type, item.slug, currentLocale, targetLocale);
  }

  return (await resolveWordPressTranslation(item.id, targetLocale))?.slug ?? null;
}
