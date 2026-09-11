import { EMBEDDING_CONFIG_VERSION, EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "@/lib/chat/config";
import { decodeHtmlEntities } from "@/lib/wordpress/normalize";
import type { WordPressApiItem, WordPressContentType } from "@/lib/wordpress/types";
import type { Locale } from "@/types";
import { chunkWordPressHtml, type WordPressChunk } from "./wordpress-chunking";
import {
  WORDPRESS_CHUNKING_CONFIG_VERSION,
  WORDPRESS_INDEXING_CONFIG_VERSION,
  WORDPRESS_DOCUMENT_TYPE,
  wordPressSourceMetadata,
} from "./wordpress-metadata";

export interface ContentIndexingJob {
  event_id: string;
  wordpress_id: number;
  content_type: WordPressContentType;
  locale: Locale;
  operation: "upsert" | "delete";
  modified_gmt?: string;
}

export interface WordPressReplacementRow {
  source: string;
  chunk_index: number;
  content: string;
  metadata: Record<string, unknown>;
  wordpress_id: number;
  locale: Locale;
  content_type: WordPressContentType;
  slug: string;
  title: string;
  publication_status: "publish";
  embedding: number[];
  embedding_model: string;
  embedding_dimensions: number;
}

export interface WordPressIndexingDependencies {
  fetchContent(job: ContentIndexingJob): Promise<WordPressApiItem>;
  embedDocument(content: string, title: string): Promise<number[]>;
  replaceWordPressContext(input: {
    job: ContentIndexingJob;
    item: WordPressApiItem;
    rows: WordPressReplacementRow[];
  }): Promise<void>;
  removeWordPressContext(input: { job: ContentIndexingJob; modifiedAt: string | null }): Promise<void>;
}

/** WordPress's *_gmt REST fields omit the zone but are always UTC. */
export function wordPressModifiedAt(value: string | undefined): string | null {
  if (value === undefined) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/.test(value)) {
    throw new Error("Invalid WordPress modified timestamp");
  }
  const qualified = /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`;
  if (!Number.isFinite(Date.parse(qualified))) throw new Error("Invalid WordPress modified timestamp");
  return new Date(qualified).toISOString();
}

export function buildWordPressReplacementRows(
  job: ContentIndexingJob,
  item: WordPressApiItem,
  chunks: WordPressChunk[],
  embeddings: number[][],
): WordPressReplacementRow[] {
  const title = decodeHtmlEntities(item.title.rendered);
  const source = `wordpress/${job.content_type}/${job.wordpress_id}/${job.locale}`;
  const sourceMetadata = wordPressSourceMetadata(item, job.locale);
  const sourceVersion = wordPressModifiedAt(item.modified_gmt ?? job.modified_gmt);
  return chunks.map((chunk, chunkIndex) => ({
    source,
    chunk_index: chunkIndex,
    content: chunk.content,
    metadata: {
      event_id: job.event_id,
      title,
      type: job.content_type,
      slug: item.slug,
      locale: job.locale,
      wordpress_id: job.wordpress_id,
      document_type: WORDPRESS_DOCUMENT_TYPE,
      canonical_url: sourceMetadata.canonical_url,
      authority: sourceMetadata.authority,
      section_path: chunk.sectionPath,
      indexing_config: WORDPRESS_INDEXING_CONFIG_VERSION,
      chunking_config: WORDPRESS_CHUNKING_CONFIG_VERSION,
      source_version: sourceVersion,
      embedding_config: EMBEDDING_CONFIG_VERSION,
    },
    wordpress_id: job.wordpress_id,
    locale: job.locale,
    content_type: job.content_type,
    slug: item.slug,
    title,
    publication_status: "publish",
    embedding: embeddings[chunkIndex],
    embedding_model: EMBEDDING_MODEL,
    embedding_dimensions: EMBEDDING_DIMENSIONS,
  }));
}

export async function processWordPressIndexingJob(
  job: ContentIndexingJob,
  dependencies: WordPressIndexingDependencies,
): Promise<{ chunks: number }> {
  if (job.operation === "delete") {
    await dependencies.removeWordPressContext({ job, modifiedAt: wordPressModifiedAt(job.modified_gmt) });
    return { chunks: 0 };
  }

  const item = await dependencies.fetchContent(job);
  const modifiedAt = wordPressModifiedAt(item.modified_gmt ?? job.modified_gmt);
  if (item.id !== job.wordpress_id || item.type !== job.content_type) {
    throw new Error("WordPress response identity does not match the indexing job.");
  }
  if (item.status !== "publish" || item.acf?.locale !== job.locale) {
    await dependencies.removeWordPressContext({ job, modifiedAt });
    return { chunks: 0 };
  }

  const title = decodeHtmlEntities(item.title.rendered);
  const chunks = chunkWordPressHtml(title, item.content.rendered);
  const embeddings = await Promise.all(chunks.map((chunk) => dependencies.embedDocument(chunk.content, title)));
  const rows = buildWordPressReplacementRows(job, item, chunks, embeddings);
  await dependencies.replaceWordPressContext({ job, item, rows });
  return { chunks: rows.length };
}
