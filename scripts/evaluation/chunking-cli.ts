/** Read-only production snapshot, local old/new indexes, paid embeddings only. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { chunkWordPressHtml } from "../../src/lib/knowledge/wordpress-chunking";
import { buildWordPressReplacementRows, wordPressModifiedAt } from "../../src/lib/knowledge/wordpress-indexing";
import { decodeHtmlEntities } from "../../src/lib/wordpress/normalize";
import { RETRIEVAL_COUNT, RETRIEVAL_THRESHOLD, EMBEDDING_CONFIG_VERSION } from "../../src/lib/chat/config";
import type { WordPressApiItem } from "../../src/lib/wordpress/types";

type Row = Record<string, unknown> & { source: string; locale: string; wordpress_id: number | null;
  content_type: string | null; wordpress_modified_at: string | null; embedding: string };
type Case = { id: string; locale: string; turns: { user: string }[]; expectedSourceIds: string[] };
type Match = { source: string; similarity: number };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 3 || args[0] !== "--live" || args[1] !== "--output") {
    throw new Error("Usage: npm run eval:chunking -- --live --output <private-scratch-directory>");
  }
  const output = path.resolve(args[2]);
  await mkdir(output, { recursive: true, mode: 0o700 });
  const report: Record<string, unknown> = { timestamp: new Date().toISOString(), status: "incomplete",
    method: "paired local indexes from one read-only production snapshot; latest-turn queries; no generation",
    embeddingConfig: EMBEDDING_CONFIG_VERSION, threshold: RETRIEVAL_THRESHOLD, count: RETRIEVAL_COUNT,
    productionWrites: 0, embeddingCalls: 0, limitations: ["No generated answer or human grounding evaluation", "No multi-session concurrency proof"] };
  const db = new PGlite({ extensions: { vector } });
  try {
    const dotenv = await import("dotenv");
    dotenv.config({ path: ".env.local", quiet: true });
    for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "WORDPRESS_API_URL", "GEMINI_API_KEY"]) {
      if (!process.env[key]) throw new Error(`Missing ${key}`);
    }
    const { createAdminClient } = await import("../../src/lib/supabase");
    const { embedDocument, embedQuery } = await import("../../src/lib/knowledge/embeddings");
    const client = createAdminClient();
    const cacheFile = path.join(output, "embedding-cache.json");
    const cache: Record<string, number[]> = await readFile(cacheFile, "utf8").then(JSON.parse).catch(() => ({}));
    const embed = async (text: string, title?: string) => {
      const key = hash(JSON.stringify([EMBEDDING_CONFIG_VERSION, title ?? null, text]));
      if (!cache[key]) {
        if (Number(report.embeddingCalls) >= 600) throw new Error("Embedding call budget exceeded");
        report.embeddingCalls = Number(report.embeddingCalls) + 1;
        const signal = AbortSignal.timeout(45000);
        cache[key] = title === undefined ? await embedQuery(text, signal) : await embedDocument(text, title, signal);
        await writeFile(cacheFile, JSON.stringify(cache), { mode: 0o600 });
      }
      return cache[key];
    };
    // Bound the snapshot and explicitly reject truncation instead of comparing a partial index.
    const { data, error, count } = await client.from("career_context").select("*", { count: "exact" })
      .eq("visibility", "public").eq("publication_status", "publish").order("id").range(0, 999);
    if (error || !data || count !== data.length) throw new Error("Public index snapshot failed or exceeded 1000 rows");
    const rows = data as Row[];
    await writeFile(path.join(output, "index-snapshot.json"), JSON.stringify(rows), { mode: 0o600 });
    report.snapshotHash = hash(JSON.stringify(rows));
    report.baselineChunks = rows.length;
    const rawCorpus = await readFile("evals/assistant/cases.json", "utf8");
    report.corpusHash = hash(rawCorpus);
    const cases = (JSON.parse(rawCorpus).cases as Case[]).filter(c => c.expectedSourceIds.length > 0);
    const cvCorpusText = await readFile("evals/cv/cases.json", "utf8");
    report.cvCorpusHash = hash(cvCorpusText);
    const cvCorpus = JSON.parse(cvCorpusText);
    // CV corpus shape is a separate contract; reuse its explicit source identities.
    for (const c of cvCorpus.cases) cases.push({ id: c.id, locale: c.locale, turns: [{ user: c.query }], expectedSourceIds: [c.expected_source_id] });

    await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
    await db.exec(await readFile("supabase-schema.sql", "utf8"));
    const v1 = await readFile("supabase/migrations/00001_wordpress_vector_queue.sql", "utf8");
    const stop = v1.indexOf("\ndo $$\nbegin\n  if not exists (\n    select 1\n    from pgmq.list_queues()");
    if (stop < 0) throw new Error("Could not isolate queue-free schema setup");
    await db.exec(v1.slice(0, stop).replace("create extension if not exists pgmq cascade;", ""));
    await db.exec(await readFile("supabase/migrations/00002_cv_knowledge.sql", "utf8"));
    const columns = rows.length ? Object.keys(rows[0]) : [];
    if (!rows.length || columns.some(c => !/^[a-z_][a-z0-9_]*$/.test(c))) throw new Error("Invalid snapshot schema");
    for (const row of rows) {
      await db.query(`insert into career_context (${columns.join(",")}) overriding system value values (${columns.map((_, i) => `$${i + 1}`).join(",")})`,
        columns.map(c => row[c] !== null && typeof row[c] === "object" ? JSON.stringify(row[c]) : row[c]));
    }
    await db.exec("select setval(pg_get_serial_sequence('career_context','id'), (select max(id) from career_context));");
    const retrieve = async (c: Case, embedding: number[]) => (await db.query<Match>(
      "select source,similarity from match_career_context_filtered($1::extensions.vector,$2,$3,$4)",
      [JSON.stringify(embedding), c.locale, RETRIEVAL_THRESHOLD, RETRIEVAL_COUNT])).rows;
    const baseline: Match[][] = [];
    const queries: number[][] = [];
    for (const c of cases) {
      const query = await embed(c.turns.at(-1)!.user);
      queries.push(query); baseline.push(await retrieve(c, query));
    }
    console.log(`Captured ${rows.length} rows and ${cases.length} baseline queries.`);
    await db.exec(await readFile("supabase/migrations/00003_wordpress_structure_aware.sql", "utf8"));
    const documents = new Map(rows.filter(r => r.wordpress_id !== null).map(r => [r.source, r]));
    const sources: WordPressApiItem[] = [];
    let newChunks = 0;
    for (const [source, row] of documents) {
      const endpoint = { post: "posts", page: "pages", js_project: "projects" }[row.content_type ?? ""];
      if (!endpoint) throw new Error("Unknown WordPress content type");
      const url = new URL(`wp/v2/${endpoint}/${row.wordpress_id}`, process.env.WORDPRESS_API_URL!.replace(/\/?$/, "/"));
      url.searchParams.set("_fields", "id,modified_gmt,slug,status,type,title,content,acf");
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error("Public WordPress snapshot fetch failed");
      const item = await response.json() as WordPressApiItem;
      if (item.status !== "publish" || item.acf?.locale !== row.locale || item.id !== row.wordpress_id) throw new Error("Source publication or identity changed");
      const utc = (s: string) => Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : `${s}Z`);
      if (!item.modified_gmt || !row.wordpress_modified_at || utc(item.modified_gmt) !== utc(row.wordpress_modified_at)) {
        throw new Error(`Source version differs from baseline: ${source}`);
      }
      sources.push(item);
      const title = decodeHtmlEntities(item.title.rendered);
      const chunks = chunkWordPressHtml(title, item.content.rendered);
      const vectors: number[][] = [];
      for (const chunk of chunks) vectors.push(await embed(chunk.content, title));
      const replacement = buildWordPressReplacementRows({ event_id: "00000000-0000-0000-0000-000000000008",
        wordpress_id: item.id, content_type: item.type, locale: row.locale as "en" | "tr", operation: "upsert" }, item, chunks, vectors);
      await db.query("select replace_wordpress_context($1,$2,$3,$4,$5,$6::jsonb)",
        [item.id, row.locale, item.type, source, wordPressModifiedAt(item.modified_gmt), JSON.stringify(replacement)]);
      newChunks += chunks.length;
      console.log(`Rebuilt ${source}: ${chunks.length} chunks (local only).`);
    }
    await writeFile(path.join(output, "public-sources.json"), JSON.stringify(sources), { mode: 0o600 });
    const results: Array<{ id: string; expected: string[]; baseline: Match[]; candidate: Match[]; baselineHits: string[]; candidateHits: string[] }> = [];
    for (let i = 0; i < cases.length; i++) {
      const c = cases[i];
      const candidate = await retrieve(c, queries[i]);
      const hits = (matches: Match[]) => c.expectedSourceIds.filter(s => matches.some(m => m.source === s));
      results.push({ id: c.id, expected: c.expectedSourceIds, baseline: baseline[i], candidate,
        baselineHits: hits(baseline[i]), candidateHits: hits(candidate) });
    }
    const totals = (key: "baselineHits" | "candidateHits") => ({
      caseHits: results.filter(r => r[key].length > 0).length,
      sourceHits: results.reduce((n, r) => n + r[key].length, 0),
    });
    const before = totals("baselineHits"), after = totals("candidateHits");
    Object.assign(report, { status: "complete", caseCount: cases.length, expectedSources: cases.reduce((n,c) => n+c.expectedSourceIds.length,0),
      candidateWordPressChunks: newChunks, baseline: before, candidate: after, results,
      regressions: results.filter(r => r.baselineHits.some(s => !r.candidateHits.includes(s))).map(r => r.id),
      aggregateNoRegression: after.caseHits >= before.caseHits && after.sourceHits >= before.sourceHits });
    if (!report.aggregateNoRegression) process.exitCode = 1;
    console.log(JSON.stringify({ baseline: before, candidate: after, regressions: report.regressions }));
  } catch (error) {
    // Never persist provider error bodies, URLs with credentials, or headers.
    report.failure = error instanceof Error && /Source version differs|Missing |snapshot|Usage:|Unknown WordPress|Source publication/.test(error.message)
      ? error.message : "Provider, database, or local evaluation failure; comparison incomplete";
    console.error(report.failure); process.exitCode = 1;
  } finally {
    await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
    await db.close();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Evaluation failed"); process.exitCode = 1; });
