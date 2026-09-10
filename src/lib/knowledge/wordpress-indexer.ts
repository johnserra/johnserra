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
import {
  parseCvIndexingJob,
  processCvIndexingJob,
  registeredCvIndexingDependencies,
  type CvIndexingJob,
} from "./cv-indexer";

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
export type AnyContentIndexingJob = ContentIndexingJob | CvIndexingJob;
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

function isWordPressJob(value: unknown): value is ContentIndexingJob {
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

export function parseContentIndexingJob(value: unknown): AnyContentIndexingJob {
  if (value && typeof value === "object" && !Array.isArray(value) && (value as { document_type?: unknown }).document_type === "cv") {
    return parseCvIndexingJob(value);
  }
  if (!isWordPressJob(value)) throw new Error("Invalid content indexing job payload.");
  return value;
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

async function replaceCvContext(input: Parameters<ReturnType<typeof registeredCvIndexingDependencies>["replaceCvContext"]>[0]): Promise<void> {
  const chunks = input.rows.map((row) => ({
    ...row,
    metadata: { ...row.metadata, embedding_config: EMBEDDING_CONFIG_VERSION },
    embedding_model: EMBEDDING_MODEL,
    embedding_dimensions: EMBEDDING_DIMENSIONS,
  }));
  const { error } = await createAdminClient().rpc("replace_cv_context", {
    cv_document_id: input.documentId,
    cv_locale: input.locale,
    cv_content_sha256: input.approvalDigest,
    cv_chunks: chunks,
  });
  if (error) throw new Error(`Failed to atomically replace CV context: ${error.message}`);
}

export async function processContentIndexingJob(job: AnyContentIndexingJob): Promise<void> {
  if ("cv_id" in job) {
    await processCvIndexingJob(job, registeredCvIndexingDependencies(embedDocument, replaceCvContext));
  } else if (job.operation === "delete") await removeContent(job);
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
      const job = parseContentIndexingJob(queued.message);
      await processContentIndexingJob(job);
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
          job: sanitizeFailedJob(queued.message),
          error_message: message,
        });
        if (failureError) console.error("Failed to dead-letter content indexing job", failureError);
      }
    }
  }

  return { read: jobs.length, completed, failed };
}

function sanitizeFailedJob(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { invalid_payload: true };
  const job = value as Record<string, unknown>;
  if (job.document_type !== "cv") return value;
  return {
    document_type: "cv",
    event_id: typeof job.event_id === "string" ? job.event_id : null,
    cv_id: typeof job.cv_id === "string" ? job.cv_id : null,
    locale: typeof job.locale === "string" ? job.locale : null,
    operation: typeof job.operation === "string" ? job.operation : null,
    content_sha256: typeof job.content_sha256 === "string" ? job.content_sha256 : null,
  };
}
