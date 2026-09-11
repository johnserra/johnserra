import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWordPressReplacementRows,
  processWordPressIndexingJob,
  wordPressModifiedAt,
  type ContentIndexingJob,
  type WordPressIndexingDependencies,
} from "./wordpress-indexing";
import { chunkWordPressHtml } from "./wordpress-chunking";

const job: ContentIndexingJob = {
  event_id: "12345678-1234-1234-1234-123456789abc",
  wordpress_id: 44,
  content_type: "js_project",
  locale: "tr",
  operation: "upsert",
  modified_gmt: "2026-09-10T10:00:00Z",
};

const item = {
  id: 44,
  type: "js_project" as const,
  slug: "careertalklab",
  status: "publish",
  modified_gmt: "2026-09-10T10:00:00Z",
  title: { rendered: "CareerTalkLab" },
  content: { rendered: "<h2>Project</h2><p>Project details.</p>" },
  acf: { locale: "tr" as const },
};

test("replacement rows carry section, public URL, authority, locale, and config metadata", () => {
  const chunks = chunkWordPressHtml("CareerTalkLab", item.content.rendered);
  const rows = buildWordPressReplacementRows(job, item, chunks, chunks.map(() => [1, 2]));
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].metadata, {
    event_id: job.event_id,
    title: "CareerTalkLab",
    type: "js_project",
    slug: "careertalklab",
    locale: "tr",
    wordpress_id: 44,
    document_type: "wordpress",
    canonical_url: "https://johnserra.com/tr/projeler/careertalklab",
    authority: "project_page",
    section_path: ["Project"],
    indexing_config: "wordpress-indexing-v2",
    chunking_config: "structure-aware-v1",
    source_version: "2026-09-10T10:00:00.000Z",
    embedding_config: "gemini-embedding-2:768:v1",
  });
});

test("WordPress GMT timestamps are UTC regardless of the runtime timezone", () => {
  assert.equal(wordPressModifiedAt("2026-09-10T10:00:00"), "2026-09-10T10:00:00.000Z");
  assert.equal(wordPressModifiedAt("2026-09-10T05:00:00-05:00"), "2026-09-10T10:00:00.000Z");
  assert.equal(wordPressModifiedAt(undefined), null);
  assert.throws(() => wordPressModifiedAt("bad"), /timestamp/);
});

test("embedding failure makes no replacement call", async () => {
  let replacements = 0;
  const dependencies: WordPressIndexingDependencies = {
    async fetchContent() { return item; },
    async embedDocument() { throw new Error("embedding failed"); },
    async replaceWordPressContext() { replacements += 1; },
    async removeWordPressContext() { throw new Error("unexpected removal"); },
  };
  await assert.rejects(() => processWordPressIndexingJob(job, dependencies), /embedding failed/);
  assert.equal(replacements, 0);
});

test("all embeddings complete before replacement is called", async () => {
  const events: string[] = [];
  const multiChunkItem = {
    ...item,
    content: { rendered: `<h2>Project</h2><p>${"word ".repeat(700)}</p>` },
  };
  const dependencies: WordPressIndexingDependencies = {
    async fetchContent() { return multiChunkItem; },
    async embedDocument() {
      events.push("embed-start");
      await Promise.resolve();
      events.push("embed-complete");
      return [1, 2];
    },
    async replaceWordPressContext() {
      events.push("replace");
    },
    async removeWordPressContext() { throw new Error("unexpected removal"); },
  };
  await processWordPressIndexingJob(job, dependencies);
  const replacementIndex = events.indexOf("replace");
  assert.ok(replacementIndex > 0);
  assert.equal(events.filter((event) => event === "embed-start").length, events.filter((event) => event === "embed-complete").length);
  assert.ok(events.slice(0, replacementIndex).every((event) => event !== "replace"));
  assert.equal(events.at(-1), "replace");
});

test("response identity failure makes no replacement or removal call", async () => {
  let replacements = 0;
  let removals = 0;
  const dependencies: WordPressIndexingDependencies = {
    async fetchContent() { return { ...item, id: 45 }; },
    async embedDocument() { return [1, 2]; },
    async replaceWordPressContext() { replacements += 1; },
    async removeWordPressContext() { removals += 1; },
  };
  await assert.rejects(() => processWordPressIndexingJob(job, dependencies), /identity/);
  assert.equal(replacements, 0);
  assert.equal(removals, 0);
});
