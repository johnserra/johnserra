import "server-only";

import { createAdminClient } from "@/lib/supabase";
import { wordpressFetch } from "@/lib/wordpress/client";
import type { WordPressApiItem, WordPressContentType } from "@/lib/wordpress/types";
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
import { htmlToStructuredPlainText, chunkUnstructuredText } from "./wordpress-chunking";
import {
  processWordPressIndexingJob,
  wordPressModifiedAt,
  type ContentIndexingJob,
  type WordPressIndexingDependencies,
} from "./wordpress-indexing";
export type { ContentIndexingJob } from "./wordpress-indexing";
export { buildWordPressReplacementRows, processWordPressIndexingJob } from "./wordpress-indexing";
export type { WordPressIndexingDependencies, WordPressReplacementRow } from "./wordpress-indexing";
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
  return htmlToStructuredPlainText(html);
}

export function chunkText(text: string): string[] {
  return chunkUnstructuredText("", text).map((chunk) => chunk.content);
}

async function fetchContent(job: ContentIndexingJob): Promise<WordPressApiItem> {
  return wordpressFetch<WordPressApiItem>(`${ENDPOINTS[job.content_type]}/${job.wordpress_id}`, {
    query: { context: "view", _fields: "id,modified_gmt,slug,status,type,title,content,acf" },
    revalidate: 0,
  });
}

function registeredWordPressIndexingDependencies(): WordPressIndexingDependencies {
  return {
    fetchContent,
    embedDocument,
    async removeWordPressContext({ job, modifiedAt }) {
      const { error } = await createAdminClient().rpc("remove_wordpress_context", {
        wordpress_id: job.wordpress_id,
        wordpress_locale: job.locale,
        wordpress_content_type: job.content_type,
        wordpress_modified_at: modifiedAt,
      });
      if (error) throw new Error(`Failed to remove indexed content: ${error.message}`);
    },
    async replaceWordPressContext({ job, item, rows }) {
      const { error } = await createAdminClient().rpc("replace_wordpress_context", {
        wordpress_id: job.wordpress_id,
        wordpress_locale: job.locale,
        wordpress_content_type: job.content_type,
        wordpress_source: `wordpress/${job.content_type}/${job.wordpress_id}/${job.locale}`,
        wordpress_modified_at: wordPressModifiedAt(item.modified_gmt ?? job.modified_gmt),
        wordpress_chunks: rows,
      });
      if (error) throw new Error(`Failed to atomically replace indexed content: ${error.message}`);
    },
  };
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
  } else {
    await processWordPressIndexingJob(job, registeredWordPressIndexingDependencies());
  }
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
