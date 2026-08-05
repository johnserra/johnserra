import type { Locale } from "@/types";
import type {
  ContentTag,
  WordPressApiItem,
  WordPressContentItem,
  WordPressMedia,
} from "./types";

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

export function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] === "#") {
      const hexadecimal = code[1]?.toLowerCase() === "x";
      const numeric = Number.parseInt(code.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      return Number.isFinite(numeric) && numeric >= 0 && numeric <= 0x10ffff
        ? String.fromCodePoint(numeric)
        : entity;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? entity;
  });
}

function assertApiItem(value: WordPressApiItem, allowUnpublished: boolean): void {
  if (
    !value ||
    !Number.isInteger(value.id) ||
    !value.slug ||
    !value.type ||
    (!allowUnpublished && value.status !== "publish") ||
    typeof value.title?.rendered !== "string" ||
    typeof value.content?.rendered !== "string"
  ) {
    throw new TypeError("WordPress returned an invalid published content item.");
  }
}

function tags(item: WordPressApiItem): ContentTag[] {
  return (item._embedded?.["wp:term"] ?? [])
    .flat()
    .filter((term) => term.taxonomy === "post_tag")
    .map((term) => ({ id: term.id, name: decodeHtmlEntities(term.name), slug: term.slug }));
}

function featuredImage(item: WordPressApiItem): WordPressMedia | undefined {
  return item._embedded?.["wp:featuredmedia"]?.[0];
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalPlainText(value: unknown): string | undefined {
  const text = optionalText(value);
  if (!text) return undefined;
  return decodeHtmlEntities(text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function optionalNumber(value: unknown): number | undefined {
  if (value === "" || value === null || value === undefined) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function normalizeWordPressItem(
  item: WordPressApiItem,
  expectedLocale: Locale,
  allowUnpublished = false,
): WordPressContentItem {
  assertApiItem(item, allowUnpublished);

  const acf = item.acf ?? {};
  const locale = acf.locale;
  if (locale !== expectedLocale) {
    throw new TypeError(`WordPress item ${item.id} has locale ${String(locale)}, expected ${expectedLocale}.`);
  }

  const media = featuredImage(item);
  const recipeValues = {
    cuisine: optionalText(acf.cuisine),
    servings: optionalNumber(acf.servings),
    prepTime: optionalText(acf.prep_time),
    cookTime: optionalText(acf.cook_time),
    totalTime: optionalText(acf.total_time),
    story: Boolean(acf.story),
  };
  const hasRecipe = Object.values(recipeValues).some((value) => value !== undefined && value !== false);

  return {
    id: item.id,
    type: item.type,
    slug: item.slug,
    locale,
    status: item.status,
    title: decodeHtmlEntities(item.title.rendered),
    summary: optionalPlainText(acf.summary) ?? optionalPlainText(item.excerpt?.rendered),
    date: optionalText(item.date_gmt),
    modified: optionalText(item.modified_gmt),
    contentHtml: item.content.rendered,
    tags: tags(item),
    featuredImage: media
      ? {
          id: media.id,
          url: media.source_url,
          alt: media.alt_text?.trim() || decodeHtmlEntities(item.title.rendered),
          width: media.media_details?.width,
          height: media.media_details?.height,
        }
      : undefined,
    translationGroupId: optionalText(acf.translation_group_id),
    legacySourceKey: optionalText(acf.legacy_source_key),
    recipe: hasRecipe ? recipeValues : undefined,
    project:
      item.type === "js_project"
        ? {
            status: optionalText(acf.project_status),
            githubUrl: optionalText(acf.github_url),
            liveUrl: optionalText(acf.live_url),
          }
        : undefined,
  };
}
