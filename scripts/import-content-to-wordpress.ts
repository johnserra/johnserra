/**
 * Idempotent repository-content importer for the John Serra WordPress model.
 *
 * Dry run (default):
 *   bun scripts/import-content-to-wordpress.ts
 *
 * Apply to WordPress:
 *   bun scripts/import-content-to-wordpress.ts --apply
 *
 * Required in apply mode:
 *   WORDPRESS_API_URL=https://cms.example.com/wp-json/
 *   WORDPRESS_USERNAME=...
 *   WORDPRESS_APPLICATION_PASSWORD=...
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { evaluate } from "@mdx-js/mdx";
import matter from "gray-matter";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsxRuntime from "react/jsx-runtime";
import remarkGfm from "remark-gfm";

type Locale = "en" | "tr";
type Collection = "posts" | "pages" | "projects";

interface ImportFrontmatter {
  title?: string;
  description?: string;
  date?: string | Date;
  tags?: string[];
  coverImage?: string;
  cuisine?: string;
  servings?: number;
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  story?: boolean;
  status?: string;
  githubUrl?: string;
  liveUrl?: string;
  translationOf?: string;
}

interface SourceRecord {
  absolutePath: string;
  sourceKey: string;
  locale: Locale;
  sourceType: string;
  collection: Collection;
  slug: string;
  frontmatter: ImportFrontmatter;
  markdown: string;
  translationKey: string;
}

interface ImportedRecord {
  wordpressId: number;
  collection: Collection;
  slug: string;
  locale: Locale;
  translationGroupId: string;
  modifiedAt: string;
}

interface ImportManifest {
  version: 1;
  generatedAt: string;
  records: Record<string, ImportedRecord>;
  translationGroups: Record<string, string>;
  media: Record<string, number>;
  warnings: string[];
}

interface WordPressRecord {
  id: number;
  slug: string;
  modified_gmt?: string;
}

interface WordPressTerm {
  id: number;
  slug: string;
}

const projectRoot = resolve(import.meta.dirname, "..");
const contentRoot = join(projectRoot, "content");
const applyChanges = process.argv.includes("--apply");
const manifestArgument = process.argv.find((argument) => argument.startsWith("--manifest="));
const manifestPath = resolve(
  projectRoot,
  manifestArgument?.slice("--manifest=".length) ?? "workspace/wordpress-import-manifest.json",
);

function emptyManifest(): ImportManifest {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    records: {},
    translationGroups: {},
    media: {},
    warnings: [],
  };
}

function loadManifest(): ImportManifest {
  if (!existsSync(manifestPath)) return emptyManifest();
  const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as ImportManifest;
  if (parsed.version !== 1) throw new Error(`Unsupported import manifest version: ${parsed.version}`);
  parsed.warnings = [];
  return parsed;
}

function saveManifest(manifest: ImportManifest): void {
  if (!applyChanges) return;
  manifest.generatedAt = new Date().toISOString();
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const absolutePath = join(directory, entry);
    return statSync(absolutePath).isDirectory() ? walk(absolutePath) : [absolutePath];
  });
}

function collectionFor(sourceType: string): Collection {
  if (sourceType === "blog") return "posts";
  if (sourceType === "projects") return "projects";
  if (sourceType === "about" || sourceType === "privacy-policy") return "pages";
  throw new Error(`Unsupported source content type: ${sourceType}`);
}

function slugFor(sourceType: string, filename: string): string {
  const fileSlug = filename.replace(/\.mdx?$/, "");
  return fileSlug === "index" ? sourceType : fileSlug;
}

function loadSourceRecords(): SourceRecord[] {
  const files = walk(contentRoot).filter((path) => /\.mdx?$/.test(path));
  const provisional = files.map((absolutePath) => {
    const sourceKey = relative(contentRoot, absolutePath).replaceAll("\\", "/").replace(/\.mdx?$/, "");
    const [localeValue, sourceType] = sourceKey.split("/");
    if (localeValue !== "en" && localeValue !== "tr") throw new Error(`Unsupported locale in ${sourceKey}`);
    if (!sourceType) throw new Error(`Missing content type in ${sourceKey}`);

    const parsed = matter(readFileSync(absolutePath, "utf8"));
    const frontmatter = parsed.data as ImportFrontmatter;
    if (!frontmatter.title?.trim() && (sourceType === "about" || sourceType === "privacy-policy")) {
      frontmatter.title = parsed.content.match(/^#\s+(.+)$/m)?.[1]?.trim();
    }
    if (!frontmatter.title?.trim()) throw new Error(`Missing title in ${sourceKey}`);

    return {
      absolutePath,
      sourceKey,
      locale: localeValue,
      sourceType,
      collection: collectionFor(sourceType),
      slug: slugFor(sourceType, absolutePath.split("/").at(-1) ?? ""),
      frontmatter,
      markdown: parsed.content,
      translationKey: "",
    } satisfies SourceRecord;
  });

  const englishKeys = new Set(
    provisional.filter((record) => record.locale === "en").map((record) => `${record.sourceType}/${record.slug}`),
  );

  return provisional.map((record) => {
    const translatedSlug = record.frontmatter.translationOf?.trim();
    const sameSlugKey = `${record.sourceType}/${record.slug}`;
    const translationKey =
      record.locale === "en"
        ? sameSlugKey
        : translatedSlug
          ? `${record.sourceType}/${translatedSlug}`
          : englishKeys.has(sameSlugKey)
            ? sameSlugKey
            : `${sameSlugKey}:tr-unpaired`;

    return { ...record, translationKey };
  });
}

async function markdownToHtml(markdown: string): Promise<string> {
  const evaluated = await evaluate(markdown, {
    ...jsxRuntime,
    remarkPlugins: [remarkGfm],
    useMDXComponents: () => ({}),
  });
  return renderToStaticMarkup(createElement(evaluated.default));
}

function apiBaseUrl(): URL {
  const configured = process.env.WORDPRESS_API_URL;
  if (!configured) throw new Error("WORDPRESS_API_URL is required in --apply mode.");
  return new URL(configured.endsWith("/") ? configured : `${configured}/`);
}

function credentials(): string {
  const username = process.env.WORDPRESS_USERNAME;
  const password = process.env.WORDPRESS_APPLICATION_PASSWORD;
  if (!username || !password) {
    throw new Error("WORDPRESS_USERNAME and WORDPRESS_APPLICATION_PASSWORD are required in --apply mode.");
  }
  return Buffer.from(`${username}:${password}`).toString("base64");
}

async function wordpressRequest<T>(
  path: string,
  init: RequestInit = {},
  query: Record<string, string | number> = {},
): Promise<T> {
  const url = new URL(path.replace(/^\//, ""), apiBaseUrl());
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));

  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${credentials()}`,
      ...(init.body && typeof init.body === "string" ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`WordPress ${init.method ?? "GET"} ${url.pathname} failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
  }
  return (await response.json()) as T;
}

function endpoint(collection: Collection): string {
  return `wp/v2/${collection}`;
}

async function existingRecord(record: SourceRecord): Promise<WordPressRecord | null> {
  const matches = await wordpressRequest<WordPressRecord[]>(endpoint(record.collection), {}, {
    context: "edit",
    status: "any",
    js_legacy_source_key: record.sourceKey,
    per_page: 2,
  });
  if (matches.length > 1) throw new Error(`Multiple WordPress records use legacy key ${record.sourceKey}`);
  return matches[0] ?? null;
}

async function ensureTag(name: string): Promise<number> {
  const slug = name.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
  const existing = await wordpressRequest<WordPressTerm[]>("wp/v2/tags", {}, { slug, per_page: 1 });
  if (existing[0]) return existing[0].id;
  const created = await wordpressRequest<WordPressTerm>("wp/v2/tags", {
    method: "POST",
    body: JSON.stringify({ name, slug }),
  });
  return created.id;
}

function mimeType(path: string): string {
  const extension = extname(path).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  return "image/jpeg";
}

function localMediaPath(coverImage: string): string {
  const normalized = coverImage.trim().replace(/^\//, "");
  return join(projectRoot, "public", normalized);
}

async function ensureMedia(
  record: SourceRecord,
  manifest: ImportManifest,
): Promise<number | undefined> {
  const coverImage = record.frontmatter.coverImage?.trim();
  if (!coverImage) return undefined;

  const absolutePath = localMediaPath(coverImage);
  if (!existsSync(absolutePath)) {
    manifest.warnings.push(`${record.sourceKey}: missing cover image ${coverImage}`);
    return undefined;
  }

  const mediaKey = relative(projectRoot, absolutePath).replaceAll("\\", "/");
  if (manifest.media[mediaKey]) return manifest.media[mediaKey];

  const filename = absolutePath.split("/").at(-1) ?? "cover-image";
  const media = await wordpressRequest<WordPressRecord>("wp/v2/media", {
    method: "POST",
    headers: {
      "Content-Disposition": `attachment; filename="${filename.replaceAll('"', "")}"`,
      "Content-Type": mimeType(absolutePath),
    },
    body: readFileSync(absolutePath),
  });

  await wordpressRequest(`wp/v2/media/${media.id}`, {
    method: "POST",
    body: JSON.stringify({ alt_text: record.frontmatter.title ?? "" }),
  });
  manifest.media[mediaKey] = media.id;
  saveManifest(manifest);
  return media.id;
}

function dateValue(date: ImportFrontmatter["date"]): string | undefined {
  if (!date) return undefined;
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid content date: ${String(date)}`);
  return parsed.toISOString();
}

async function importRecord(record: SourceRecord, manifest: ImportManifest): Promise<void> {
  const translationGroupId =
    manifest.translationGroups[record.translationKey] ?? (manifest.translationGroups[record.translationKey] = randomUUID());
  const html = await markdownToHtml(record.markdown);

  if (!applyChanges) {
    console.log(`[dry-run] ${record.sourceKey} -> ${record.collection}/${record.slug} (${html.length} HTML chars)`);
    return;
  }

  const [existing, tagIds, featuredMedia] = await Promise.all([
    existingRecord(record),
    Promise.all((record.frontmatter.tags ?? []).map(ensureTag)),
    ensureMedia(record, manifest),
  ]);

  const payload = {
    title: record.frontmatter.title,
    slug: record.slug,
    status: "publish",
    content: html,
    excerpt: record.frontmatter.description ?? "",
    date_gmt: dateValue(record.frontmatter.date),
    tags: tagIds,
    featured_media: featuredMedia ?? 0,
    acf: {
      locale: record.locale,
      translation_group_id: translationGroupId,
      summary: record.frontmatter.description ?? "",
      legacy_source_key: record.sourceKey,
      cuisine: record.frontmatter.cuisine ?? "",
      servings: record.frontmatter.servings ?? null,
      prep_time: record.frontmatter.prepTime ?? "",
      cook_time: record.frontmatter.cookTime ?? "",
      total_time: record.frontmatter.totalTime ?? "",
      story: Boolean(record.frontmatter.story),
      project_status: record.frontmatter.status ?? "",
      github_url: record.frontmatter.githubUrl ?? "",
      live_url: record.frontmatter.liveUrl ?? "",
    },
  };

  const imported = await wordpressRequest<WordPressRecord>(
    existing ? `${endpoint(record.collection)}/${existing.id}` : endpoint(record.collection),
    { method: "POST", body: JSON.stringify(payload) },
  );

  manifest.records[record.sourceKey] = {
    wordpressId: imported.id,
    collection: record.collection,
    slug: imported.slug,
    locale: record.locale,
    translationGroupId,
    modifiedAt: imported.modified_gmt ?? new Date().toISOString(),
  };
  saveManifest(manifest);
  console.log(`${existing ? "Updated" : "Created"} ${record.sourceKey} -> WordPress ${imported.id}`);
}

async function main(): Promise<void> {
  const manifest = loadManifest();
  const records = loadSourceRecords().sort((a, b) => a.locale.localeCompare(b.locale) || a.sourceKey.localeCompare(b.sourceKey));

  console.log(`${applyChanges ? "Applying" : "Dry-running"} ${records.length} content records.`);
  if (!applyChanges) console.log("Pass --apply to write to WordPress.");

  for (const record of records) await importRecord(record, manifest);

  const unpaired = records.filter((record) => record.translationKey.endsWith(":tr-unpaired"));
  for (const record of unpaired) {
    manifest.warnings.push(`${record.sourceKey}: no English translation relationship inferred`);
  }

  saveManifest(manifest);
  console.log(`Completed with ${manifest.warnings.length} warning(s).`);
  for (const warning of manifest.warnings) console.warn(`- ${warning}`);
  if (applyChanges) console.log(`Manifest: ${manifestPath}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
