import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { cvApprovalDigest, cvChunks, loadRegisteredCv } from "../../src/lib/knowledge/cv";
import { buildWordPressReplacementRows } from "../../src/lib/knowledge/wordpress-indexing";
import { chunkWordPressHtml } from "../../src/lib/knowledge/wordpress-chunking";

// Execute real PostgreSQL/pgvector SQL in memory. Queue provisioning is excluded:
// pgmq, HTTP integrations, and multi-session concurrency need a Supabase check.
test("structure-aware migration, atomic replacement, and CV compatibility", async () => {
  const db = new PGlite({ extensions: { vector } });
  const sql = (path: string) => readFile(path, "utf8");
  try {
    await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
    await db.exec(await sql("supabase-schema.sql"));
    const v1 = await sql("supabase/migrations/00001_wordpress_vector_queue.sql");
    const queueStart = v1.indexOf("\ndo $$\nbegin\n  if not exists (\n    select 1\n    from pgmq.list_queues()");
    assert.ok(queueStart > 0, "queue boundary must be explicit");
    await db.exec(v1.slice(0, queueStart).replace("create extension if not exists pgmq cascade;", ""));
    await db.exec(await sql("supabase/migrations/00002_cv_knowledge.sql"));
    const migration = await sql("supabase/migrations/00003_wordpress_structure_aware.sql");
    await db.exec(migration);
    await db.exec(migration); // Reapplication must not rename the wrapper again.
    await db.exec((await sql("supabase/tests/structure-aware-regression.sql")).replace(/^\\set.*$/gm, ""));

    const embedding = Array.from({ length: 768 }, (_, i) => i === 0 ? 1 : 0);
    const job = { event_id: "00000000-0000-0000-0000-000000000001", wordpress_id: 42,
      content_type: "post" as const, locale: "en" as const, operation: "upsert" as const };
    const item = { id: 42, type: "post" as const, slug: "wordpress-notes", status: "publish",
      modified_gmt: "2026-09-10T10:00:00Z", title: { rendered: "Notes" },
      content: { rendered: "<h2>First</h2><p>One.</p><h2>Second</h2><p>Two.</p>" },
      acf: { locale: "en" as const } };
    const chunks = chunkWordPressHtml("Notes", item.content.rendered);
    const rows = buildWordPressReplacementRows(job, item, chunks, chunks.map(() => embedding));
    const source = rows[0].source;
    const replace = (payload: unknown, version: string | null = item.modified_gmt, locale: string | null = "en") =>
      db.query("select public.replace_wordpress_context($1,$2,$3,$4,$5,$6::jsonb) as count",
        [42, locale, "post", source, version, JSON.stringify(payload)]);
    const snapshot = async () => (await db.query("select source,chunk_index,content,metadata from career_context order by source,chunk_index")).rows;
    await replace(rows);
    assert.equal((await snapshot()).length, 2);
    const before = await snapshot();
    await assert.rejects(replace(rows, item.modified_gmt, null), /Invalid WordPress/);
    for (const invalid of [null, 12, "", "https://evil.example/notes"]) {
      const bad = structuredClone(rows);
      bad[0].metadata.canonical_url = invalid;
      await assert.rejects(replace(bad), /Invalid WordPress/);
    }
    const badVersion = structuredClone(rows);
    badVersion[0].metadata.source_version = "2026-09-10T11:00:00Z";
    await assert.rejects(replace(badVersion), /Invalid WordPress/);
    await assert.rejects(replace([rows[0], rows[0]]), /Duplicate/);
    assert.deepEqual(await snapshot(), before, "validation failures preserve all old rows");

    // Fail during insertion, after DELETE and the version update have executed.
    await db.exec(`create function public.test_reject_insert() returns trigger language plpgsql as $$
      begin if new.content = 'force insertion failure' then raise exception 'forced failure'; end if; return new; end $$;
      create trigger test_reject_insert before insert on public.career_context
      for each row execute function public.test_reject_insert();`);
    const failed = structuredClone(rows);
    failed[0].content = "force insertion failure";
    for (const row of failed) row.metadata.source_version = "2026-09-10T12:00:00Z";
    await assert.rejects(replace(failed, "2026-09-10T12:00:00Z"), /forced failure/);
    assert.deepEqual(await snapshot(), before, "insert failure rolls deletion back");
    const state = await db.query<{ preserved: boolean }>("select modified_at = $2::timestamptz as preserved from wordpress_context_versions where source=$1", [source, item.modified_gmt]);
    assert.equal(state.rows[0].preserved, true, "failed write rolls version state back");
    await replace([rows[0]]);
    assert.equal((await snapshot()).length, 1, "shorter replacement removes stale chunks");

    const document = await loadRegisteredCv();
    const digest = cvApprovalDigest(document);
    const cvRows = cvChunks(document).map(row => ({ ...row, embedding,
      embedding_model: "gemini-embedding-2", embedding_dimensions: 768,
      metadata: { ...row.metadata, embedding_config: "gemini-embedding-2:768:v1" } }));
    const replaceCv = (payload: unknown) => db.query("select public.replace_cv_context($1,$2,$3,$4::jsonb)",
      ["john-serra", "en", digest, JSON.stringify(payload)]);
    await replaceCv(cvRows);
    const cvSnapshot = await snapshot();
    assert.equal(cvSnapshot.length, cvRows.length + 1, "CV replacement preserves WordPress");
    const stored = await db.query<{ metadata: unknown; section_path: unknown }>("select metadata, section_path from career_context where source=$1", [cvRows[0].source]);
    assert.deepEqual(stored.rows[0].metadata, cvRows[0].metadata);
    assert.deepEqual(stored.rows[0].section_path, cvRows[0].metadata.section_path);
    for (const mutate of [
      (row: typeof cvRows[number]) => { row.metadata.content_sha256 = "0".repeat(64); },
      (row: typeof cvRows[number]) => { row.metadata.section_path = []; },
    ]) {
      const invalid = structuredClone(cvRows);
      mutate(invalid[0]);
      await assert.rejects(replaceCv(invalid), /Invalid CV/);
      assert.deepEqual(await snapshot(), cvSnapshot);
    }
    await assert.rejects(replaceCv([{ content: "missing required metadata" }]), /Invalid CV/);
    const oldRows = cvRows.map(row => {
      const metadata: Record<string, unknown> = { ...row.metadata };
      delete metadata.section_path; delete metadata.indexing_config; delete metadata.chunking_config;
      return { ...row, metadata };
    });
    await replaceCv(oldRows);
    assert.equal((await snapshot()).length, cvRows.length + 1, "old CV workers remain compatible");
    await replace(rows);
    assert.equal((await snapshot()).length, cvRows.length + 2, "WordPress replacement preserves CV");
    const grants = await db.query<{ allowed: boolean }>("select has_function_privilege('anon', 'public.replace_wordpress_context(bigint,text,text,text,timestamptz,jsonb)', 'EXECUTE') as allowed");
    assert.equal(grants.rows[0].allowed, false);
    console.log("Verified migration reapplication, tombstones, empty/legacy versions, validation, rollback, stale chunks, CV compatibility, and grants.");
  } finally {
    await db.close();
  }
});
