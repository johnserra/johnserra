import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { buildWordPressReplacementRows } from "../../src/lib/knowledge/wordpress-indexing";
import { chunkWordPressHtml } from "../../src/lib/knowledge/wordpress-chunking";

test("00006 accepts v1/v2 rolling writes while preserving replacement and tombstone safety", async () => {
  const db = new PGlite({ extensions: { vector } });
  const sql = (path: string) => readFile(path, "utf8");
  try {
    await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
    await db.exec(await sql("supabase-schema.sql"));
    const v1 = await sql("supabase/migrations/00001_wordpress_vector_queue.sql");
    const queueStart = v1.indexOf("\ndo $$\nbegin\n  if not exists (\n    select 1\n    from pgmq.list_queues()");
    assert.ok(queueStart > 0);
    await db.exec(v1.slice(0, queueStart).replace("create extension if not exists pgmq cascade;", ""));
    await db.exec(await sql("supabase/migrations/00002_cv_knowledge.sql"));
    await db.exec(await sql("supabase/migrations/00003_wordpress_structure_aware.sql"));
    const migration = await sql("supabase/migrations/00006_wordpress_table_chunking.sql");
    await db.exec(migration);
    await db.exec(migration);

    const embedding = Array.from({ length: 768 }, (_, index) => index === 0 ? 1 : 0);
    const job = { event_id: "00000000-0000-0000-0000-000000000006", wordpress_id: 60,
      content_type: "post" as const, locale: "en" as const, operation: "upsert" as const };
    const item = { id: 60, type: "post" as const, slug: "table-notes", status: "publish",
      modified_gmt: "2026-10-13T12:00:00Z", title: { rendered: "Table Notes" },
      content: { rendered: "<table><tr><th>A</th><th>B</th></tr><tr><td>one</td><td>two</td></tr></table>" },
      acf: { locale: "en" as const } };
    const chunks = chunkWordPressHtml("Table Notes", item.content.rendered);
    const current = buildWordPressReplacementRows(job, item, chunks, chunks.map(() => embedding));
    const legacy = structuredClone(current);
    for (const row of legacy) row.metadata.chunking_config = "structure-aware-v1";
    const replace = (rows: unknown) => db.query<{ count: number }>(
      "select public.replace_wordpress_context($1,$2,$3,$4,$5,$6::jsonb) as count",
      [60, "en", "post", current[0].source, item.modified_gmt, JSON.stringify(rows)],
    );

    assert.equal((await replace(legacy)).rows[0].count, legacy.length, "v1 remains accepted during rollout");
    assert.equal((await replace(current)).rows[0].count, current.length, "same-timestamp v2 reindex replaces v1");
    const stored = await db.query<{ chunking_config: string }>("select chunking_config from career_context where source=$1", [current[0].source]);
    assert.deepEqual(stored.rows.map((row) => row.chunking_config), current.map(() => "structure-aware-v2"));

    for (const invalidValue of ["structure-aware-v3", null, 42, undefined]) {
      const invalid = structuredClone(current) as Array<{ metadata: Record<string, unknown> }>;
      if (invalidValue === undefined) delete invalid[0].metadata.chunking_config;
      else invalid[0].metadata.chunking_config = invalidValue;
      await assert.rejects(replace(invalid), /Invalid WordPress/);
      assert.deepEqual(
        (await db.query<{ chunking_config: string }>("select chunking_config from career_context where source=$1", [current[0].source])).rows,
        stored.rows,
        `invalid chunking_config ${String(invalidValue)} leaves prior rows intact`,
      );
    }

    const removed = await db.query<{ count: number }>(
      "select public.remove_wordpress_context($1,$2,$3,$4) as count",
      [60, "en", "post", item.modified_gmt],
    );
    assert.equal(removed.rows[0].count, current.length);
    assert.equal((await replace(current)).rows[0].count, 0, "same-timestamp delete tombstone wins");

    const grants = await db.query<{ anon: boolean; authenticated: boolean; service: boolean; cv_exists: boolean }>(`
      select
        has_function_privilege('anon', 'public.replace_wordpress_context(bigint,text,text,text,timestamptz,jsonb)', 'EXECUTE') as anon,
        has_function_privilege('authenticated', 'public.replace_wordpress_context(bigint,text,text,text,timestamptz,jsonb)', 'EXECUTE') as authenticated,
        has_function_privilege('service_role', 'public.replace_wordpress_context(bigint,text,text,text,timestamptz,jsonb)', 'EXECUTE') as service,
        to_regprocedure('public.replace_cv_context(text,text,text,jsonb)') is not null as cv_exists`);
    assert.deepEqual(grants.rows[0], { anon: false, authenticated: false, service: true, cv_exists: true });
  } finally {
    await db.close();
  }
});
