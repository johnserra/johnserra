/**
 * Enqueue and process all published WordPress content for semantic search.
 *
 * Run after applying the Supabase vector/queue migration:
 *   npm run seed
 *
 * Legacy filesystem-sourced rows are retained unless explicitly requested:
 *   npm run seed -- --prune-legacy
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase";
import {
  processContentIndexingBatch,
  type ContentIndexingJob,
} from "@/lib/knowledge/wordpress-indexer";
import { pruneGenuineLegacyRows, type LegacyPruneClient } from "@/lib/knowledge/legacy-prune";
import { getAllWordPressContent } from "@/lib/wordpress/content";
import type { WordPressCollectionType, WordPressContentType } from "@/lib/wordpress/types";
import type { Locale } from "@/types";

const COLLECTIONS: Array<{
  collection: WordPressCollectionType;
  contentType: WordPressContentType;
}> = [
  { collection: "posts", contentType: "post" },
  { collection: "pages", contentType: "page" },
  { collection: "projects", contentType: "js_project" },
];
const LOCALES: Locale[] = ["en", "tr"];

async function enqueue(job: ContentIndexingJob): Promise<void> {
  const { error } = await createAdminClient().rpc("enqueue_content_indexing_job", { job });
  if (error) throw new Error(`Failed to enqueue WordPress ${job.wordpress_id}: ${error.message}`);
}

async function enqueuePublishedContent(): Promise<number> {
  let count = 0;

  for (const locale of LOCALES) {
    for (const definition of COLLECTIONS) {
      const items = await getAllWordPressContent(definition.collection, locale);
      for (const item of items) {
        await enqueue({
          event_id: randomUUID(),
          wordpress_id: item.id,
          content_type: definition.contentType,
          locale,
          operation: "upsert",
          modified_gmt: item.modified,
        });
        count += 1;
      }
    }
  }

  return count;
}

async function drainQueue(): Promise<{ completed: number; failed: number }> {
  let completed = 0;
  let failed = 0;

  while (true) {
    const result = await processContentIndexingBatch(5);
    completed += result.completed;
    failed += result.failed;
    console.log(`Queue batch: read=${result.read} completed=${result.completed} failed=${result.failed}`);
    if (result.read === 0) return { completed, failed };
  }
}

async function pruneLegacyRows(): Promise<void> {
  if (!process.argv.includes("--prune-legacy")) return;
  await pruneGenuineLegacyRows(createAdminClient() as unknown as LegacyPruneClient);
  console.log("Pruned legacy filesystem-sourced career context rows.");
}

async function main(): Promise<void> {
  console.log("Enqueuing published WordPress content...");
  const queued = await enqueuePublishedContent();
  console.log(`Queued ${queued} content item(s).`);

  const result = await drainQueue();
  await pruneLegacyRows();

  console.log(`Initial indexing finished: completed=${result.completed} failed=${result.failed}.`);
  if (result.failed) {
    console.warn("Some jobs remain queued for retry. Inspect function logs and content_indexing_failures.");
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
