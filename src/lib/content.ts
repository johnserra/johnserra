import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { defaultLocale } from "@/types";
import type { Locale } from "@/types";

const contentRoot = path.join(process.cwd(), "content");

export interface Frontmatter {
  title: string;
  description?: string;
  date?: string;
  tags?: string[];
  status?: string;
  coverImage?: string;
  githubUrl?: string;
  // Recipe-specific
  cuisine?: string;
  servings?: number;
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  story?: boolean;
  translationOf?: string;
  [key: string]: unknown;
}

export interface ContentItem {
  slug: string;
  frontmatter: Frontmatter;
  content: string;
}

/**
 * Transform Obsidian [[wiki links]] into standard markdown links.
 * Handles [[Link]] and [[Link|Display Text]] syntax.
 * For non-default locales, prefixes links with /{locale}.
 */
export function transformObsidianLinks(
  content: string,
  locale: Locale = defaultLocale
): string {
  return content.replace(
    /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_, link: string, displayText?: string) => {
      const text = displayText ?? link;
      const slug = link.toLowerCase().replace(/\s+/g, "-");
      const prefix = locale !== defaultLocale ? `/${locale}` : "";
      return `[${text}](${prefix}/${slug})`;
    }
  );
}

export function getContentSlugs(
  type: string,
  locale: Locale = defaultLocale
): string[] {
  const dir = path.join(contentRoot, locale, type);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".md") || file.endsWith(".mdx"))
    .map((file) => file.replace(/\.mdx?$/, ""));
}

export function getContentBySlug(
  type: string,
  slug: string,
  locale: Locale = defaultLocale
): ContentItem | null {
  const dir = path.join(contentRoot, locale, type);
  const mdPath = path.join(dir, `${slug}.md`);
  const mdxPath = path.join(dir, `${slug}.mdx`);
  const fullPath = fs.existsSync(mdPath) ? mdPath : mdxPath;

  if (!fs.existsSync(fullPath)) return null;

  const fileContents = fs.readFileSync(fullPath, "utf8");
  const { data, content } = matter(fileContents);

  return {
    slug,
    frontmatter: data as Frontmatter,
    content: transformObsidianLinks(content, locale),
  };
}

export function getAllContent(
  type: string,
  locale: Locale = defaultLocale
): ContentItem[] {
  const slugs = getContentSlugs(type, locale);
  const items = slugs
    .map((slug) => getContentBySlug(type, slug, locale))
    .filter((item): item is ContentItem => item !== null);

  return items.sort((a, b) => {
    if (!a.frontmatter.date && !b.frontmatter.date) return 0;
    if (!a.frontmatter.date) return 1;
    if (!b.frontmatter.date) return -1;
    return new Date(b.frontmatter.date).getTime() - new Date(a.frontmatter.date).getTime();
  });
}

/**
 * Find the translated slug for a piece of content in another locale.
 * Looks for content in targetLocale whose `translationOf` frontmatter
 * matches the given slug, or vice versa.
 */
export function getTranslationSlug(
  type: string,
  slug: string,
  currentLocale: Locale,
  targetLocale: Locale
): string | null {
  // Check if the current content has a translationOf field
  const currentContent = getContentBySlug(type, slug, currentLocale);
  const sourceSlug = currentContent?.frontmatter.translationOf || slug;

  // If targeting default locale, the source slug IS the target slug
  if (targetLocale === defaultLocale) {
    const exists = getContentBySlug(type, sourceSlug, targetLocale);
    return exists ? sourceSlug : null;
  }

  // Search target locale for content with matching translationOf
  const targetSlugs = getContentSlugs(type, targetLocale);
  for (const targetSlug of targetSlugs) {
    const targetContent = getContentBySlug(type, targetSlug, targetLocale);
    if (targetContent?.frontmatter.translationOf === sourceSlug) {
      return targetSlug;
    }
    // Also check if same slug exists
    if (targetSlug === slug) {
      return targetSlug;
    }
  }

  return null;
}
