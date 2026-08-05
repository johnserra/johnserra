import "server-only";

import { createAdminClient } from "@/lib/supabase";
import { wordpressFetch } from "@/lib/wordpress/client";
import { decodeHtmlEntities } from "@/lib/wordpress/normalize";
import type { WordPressApiItem, WordPressContentType } from "@/lib/wordpress/types";
import type { Locale } from "@/types";
import {
  EMBEDDING_CONFIG_VERSION,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  embedDocument,
} from "./embeddings";

const CHUNK_SIZE = 2_400;
const CHUNK_OVERLAP = 300;

export interface ContentIndexingJob {
  event_id: string;
  wordpress_id: number;
  content_type: WordPressContentType;
  locale: Locale;
  operation: "upsert" | "delete";
  modified_gmt?: string;
}
interface QueueJob {
  msg_id: number;
  read_ct: number;
  message: unknown;
}

const ENDPOINTS: Record<WordPressContentType, string> = {
  post: "wp/v2/posts",
  page: "wp/v2/pages",
  js_project: "wp/v2/projects",
};

function isJob(value: unknown): value is ContentIndexingJob {
  if (!value || typeof value !== "object") return false;
  const job = value as Partial<ContentIndexingJob>;
  return (
    typeof job.event_id === "string" &&
    Number.isInteger(job.wordpress_id) &&
    job.wordpress_id! > 0 &&
    (job.content_type === "post" || job.content_type === "page" || job.content_type === "js_project") &&
    (job.locale === "en" || job.locale === "tr") &&
    (job.operation === "upsert" || job.operation === "delete")
  );
}

export function htmlToPlainText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

export function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + CHUNK_SIZE, text.length);
    if (end < text.length) {
      const boundary = text.lastIndexOf(" ", end);
      if (boundary > start + CHUNK_SIZE / 2) end = boundary;
    }
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 50) chunks.push(chunk);
    if (end >= text.length) break;
    start = Math.max(start + 1, end - CHUNK_OVERLAP);
  }

  return chunks;
}

async function removeContent(job: ContentIndexingJob): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("career_context")
    .delete()
    .eq("wordpress_id", job.wordpress_id)
    .eq("locale", job.locale);
  if (error) throw new Error(`Failed to delete indexed content: ${error.message}`);
}

async function fetchContent(job: ContentIndexingJob): Promise<WordPressApiItem> {
  return wordpressFetch<WordPressApiItem>(`${ENDPOINTS[job.content_type]}/${job.wordpress_id}`, {
    query: { context: "view", _fields: "id,modified_gmt,slug,status,type,title,content,acf" },
    revalidate: 0,
  });
}

async function upsertContent(job: ContentIndexingJob): Promise<void> {
  const item = await fetchContent(job);
  if (item.status !== "publish" || item.acf?.locale !== job.locale) {
    await removeContent(job);
    return;
  }

  const title = decodeHtmlEntities(item.title.rendered);
  const plainText = htmlToPlainText(item.content.rendered);
  const chunks = chunkText(`# ${title}\n\n${plainText}`);
  const source = `wordpress/${job.content_type}/${job.wordpress_id}/${job.locale}`;
  const embeddings = await Promise.all(chunks.map((chunk) => embedDocument(chunk, title)));
  const supabase = createAdminClient();
  const rows = chunks.map((content, chunkIndex) => ({
    source,
    chunk_index: chunkIndex,
    content,
    metadata: {
      event_id: job.event_id,
      title,
      type: job.content_type,
      slug: item.slug,
      locale: job.locale,
      wordpress_id: job.wordpress_id,
      embedding_config: EMBEDDING_CONFIG_VERSION,
    },
    wordpress_id: job.wordpress_id,
    locale: job.locale,
    content_type: job.content_type,
    slug: item.slug,
    title,
    publication_status: "publish",
    wordpress_modified_at: item.modified_gmt ?? job.modified_gmt ?? null,
    embedding: embeddings[chunkIndex],
    embedding_model: EMBEDDING_MODEL,
    embedding_dimensions: EMBEDDING_DIMENSIONS,
  }));

  if (rows.length) {
    const { error } = await supabase.from("career_context").upsert(rows, { onConflict: "source,chunk_index" });
    if (error) throw new Error(`Failed to upsert indexed content: ${error.message}`);
  }

  const stale = supabase.from("career_context").delete().eq("source", source);
  const { error: staleError } = rows.length
    ? await stale.gte("chunk_index", rows.length)
    : await stale;
  if (staleError) throw new Error(`Failed to remove stale chunks: ${staleError.message}`);
}

export async function processContentIndexingJob(job: ContentIndexingJob): Promise<void> {
  if (job.operation === "delete") await removeContent(job);
  else await upsertContent(job);
}

export async function processContentIndexingBatch(batchSize = 3): Promise<{
  read: number;
  completed: number;
  failed: number;
}> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("read_content_indexing_jobs", {
    visibility_timeout_seconds: 180,
    batch_size: batchSize,
  });
  if (error) throw new Error(`Failed to read content indexing queue: ${error.message}`);

  const jobs = (data ?? []) as QueueJob[];
  let completed = 0;
  let failed = 0;

  for (const queued of jobs) {
    try {
      if (!isJob(queued.message)) throw new Error("Invalid content indexing job payload.");
      await processContentIndexingJob(queued.message);
      const { error: archiveError } = await supabase.rpc("archive_content_indexing_job", {
        message_id: queued.msg_id,
      });
      if (archiveError) throw new Error(`Failed to archive queue job: ${archiveError.message}`);
      completed += 1;
    } catch (caught) {
      failed += 1;
      const message = caught instanceof Error ? caught.message : String(caught);
      console.error("Content indexing job failed", { messageId: queued.msg_id, readCount: queued.read_ct, error: message });

      if (queued.read_ct >= 5) {
        const { error: failureError } = await supabase.rpc("fail_content_indexing_job", {
          message_id: queued.msg_id,
          job: queued.message,
          error_message: message,
        });
        if (failureError) console.error("Failed to dead-letter content indexing job", failureError);
      }
    }
  }

  return { read: jobs.length, completed, failed };
}
