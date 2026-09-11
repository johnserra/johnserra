import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { cvApprovalDigest, cvChunks, loadRegisteredCv } from "../../src/lib/knowledge/cv";

interface HybridRow {
  id: number;
  source: string;
  content: string;
  metadata: Record<string, unknown>;
  semantic_similarity: number | null;
  lexical_rank: number | null;
  final_rank: number;
  fusion_score: number;
}

function embedding(first: number, second: number): number[] {
  const arr = new Array(768).fill(0);
  arr[0] = first;
  arr[1] = second;
  return arr;
}

function vectorA(): number[] {
  return embedding(1, 0);
}

function vectorB(): number[] {
  return embedding(0, 1);
}

function vectorC(): number[] {
  return embedding(0.5, 0.5);
}

async function insertWordPressRow(
  db: PGlite,
  opts: {
    source: string;
    content: string;
    title: string;
    locale: string;
    embedding: number[];
    publicationStatus?: string;
    organization?: string | null;
    role?: string | null;
    authority?: string;
    sectionPath?: string[];
  },
) {
  await db.query(
    `insert into public.career_context (
      source, chunk_index, content, metadata, locale, content_type,
      slug, title, publication_status, embedding, embedding_model,
      embedding_dimensions, document_type, organization, role, visibility,
      canonical_url, authority, section_path, indexing_config, chunking_config
    ) values ($1, 0, $2, $3, $4, 'post', $5, $6, $7, $8::extensions.vector(768), 'gemini-embedding-2', 768,
      'wordpress', $9, $10, 'public', $11, $12, $13::jsonb, 'wordpress-indexing-v2', 'structure-aware-v1')`,
    [
      opts.source,
      opts.content,
      JSON.stringify({
        document_type: "wordpress",
        title: opts.title,
        organization: opts.organization ?? null,
        role: opts.role ?? null,
        locale: opts.locale,
        source_locale: opts.locale,
        visibility: "public",
        authority: opts.authority ?? "authored_post",
        canonical_url: `https://johnserra.com/${opts.source}`,
        section_path: opts.sectionPath ?? [],
        indexing_config: "wordpress-indexing-v2",
        chunking_config: "structure-aware-v1",
        embedding_config: "gemini-embedding-2:768:v1",
      }),
      opts.locale,
      opts.source.split("/").pop() ?? "test",
      opts.title,
      opts.publicationStatus ?? "publish",
      JSON.stringify(opts.embedding),
      opts.organization ?? null,
      opts.role ?? null,
      `https://johnserra.com/${opts.source}`,
      opts.authority ?? "authored_post",
      JSON.stringify(opts.sectionPath ?? []),
    ],
  );
}

test("hybrid retrieval: semantic + lexical branches, reranking, locale, filters, fallbacks", async () => {
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
    await db.exec(await sql("supabase/migrations/00003_wordpress_structure_aware.sql"));
    await db.exec(await sql("supabase/migrations/00004_hybrid_retrieval.sql"));
    await db.exec(await sql("supabase/tests/hybrid-retrieval-regression.sql"));

    // Insert WordPress test rows.
    await insertWordPressRow(db, {
      source: "wordpress/post/10/en", content: "Premium Parking export market development in Turkey.",
      title: "Premium Parking Export", locale: "en", embedding: vectorA(),
    });
    await insertWordPressRow(db, {
      source: "wordpress/js_project/20/en", content: "CareerTalkLab platform built with Next.js and React.",
      title: "CareerTalkLab", locale: "en", embedding: vectorB(), authority: "project_page",
    });
    await insertWordPressRow(db, {
      source: "wordpress/post/30/tr", content: "Dijital donusum projeleri Turkce icerik.",
      title: "Dijital Donusum", locale: "tr", embedding: vectorC(),
    });
    await insertWordPressRow(db, {
      source: "wordpress/post/40/en", content: "Unpublished draft content.",
      title: "Draft", locale: "en", embedding: vectorA(), publicationStatus: "draft",
    });

    // Insert proper CV rows via the 00003 RPC.
    const document = await loadRegisteredCv();
    const digest = cvApprovalDigest(document);
    const cvEmbedding = Array.from({ length: 768 }, (_, i) => (i === 0 ? 1 : 0));
    const cvRows = cvChunks(document).map((row) => ({
      ...row,
      embedding: cvEmbedding,
      embedding_model: "gemini-embedding-2",
      embedding_dimensions: 768,
      metadata: { ...row.metadata, embedding_config: "gemini-embedding-2:768:v1" },
    }));
    await db.query("select public.replace_cv_context($1,$2,$3,$4::jsonb)", [
      "john-serra", "en", digest, JSON.stringify(cvRows),
    ]);

    // 1. English query retrieves semantic + lexical, excludes TR and drafts.
    const enResult = await db.query<HybridRow>(
      `select * from public.match_career_context_hybrid($1, $2, $3, $4, $5, null, null, null, 'public')`,
      [JSON.stringify(vectorA()), "Premium Parking", "en", 0.65, 6],
    );
    const enSources = enResult.rows.map((r) => r.source);
    assert.ok(enSources.length > 0, "EN returns results");
    assert.ok(enSources.length <= 6, "capped at 6");
    assert.ok(!enSources.includes("wordpress/post/30/tr"), "EN must not get TR WordPress");
    assert.ok(!enSources.includes("wordpress/post/40/en"), "draft excluded");

    // 2. Turkish query can retrieve TR WordPress + EN CV, not EN WordPress.
    const trResult = await db.query<HybridRow>(
      `select * from public.match_career_context_hybrid($1, $2, $3, $4, $5, null, null, null, 'public')`,
      [JSON.stringify(vectorC()), "dijital donusum", "tr", 0.65, 6],
    );
    const trSources = trResult.rows.map((r) => r.source);
    assert.ok(trSources.includes("wordpress/post/30/tr"), "TR retrieves TR WordPress");
    assert.ok(!trSources.includes("wordpress/post/10/en"), "TR must not get EN WordPress");
    assert.ok(!trSources.includes("wordpress/js_project/20/en"), "TR must not get EN WordPress project");

    // 3. Null embedding → lexical-only fallback.
    const lexicalResult = await db.query<HybridRow>(
      `select * from public.match_career_context_hybrid(null, $1, $2, $3, $4, null, null, null, 'public')`,
      ["CareerTalkLab Next.js React", "en", 0.65, 6],
    );
    const lexicalSources = lexicalResult.rows.map((r) => r.source);
    assert.ok(lexicalSources.includes("wordpress/js_project/20/en"), "lexical matches CareerTalkLab");

    // Natural-language lexical queries match meaningful terms without
    // requiring every English or Turkish question/stop word to be present.
    const naturalEnglish = await db.query<HybridRow>(
      `select * from public.match_career_context_hybrid(null, $1, 'en', 0.65, 6, null, null, null, 'public')`,
      ["What did John do at Premium Parking and why?"],
    );
    assert.ok(
      naturalEnglish.rows.some((r) => r.source === "wordpress/post/10/en"),
      "natural English lexical query retrieves Premium Parking",
    );
    const naturalTurkish = await db.query<HybridRow>(
      `select * from public.match_career_context_hybrid(null, $1, 'tr', 0.65, 6, null, null, null, 'public')`,
      ["John dijital donusum hakkında ne yaptı ve neden?"],
    );
    assert.ok(
      naturalTurkish.rows.some((r) => r.source === "wordpress/post/30/tr"),
      "natural Turkish lexical query retrieves dijital donusum",
    );

    const naturalTurkishCv = await db.query<HybridRow>(
      `select * from public.match_career_context_hybrid(null, $1, 'tr', 0.65, 6, null, null, null, 'public')`,
      ["Sunwell'deki çalışma biçiminiz neydi ve INPAK TS-800 nedir?"],
    );
    const naturalTurkishCvSources = naturalTurkishCv.rows.map((r) => r.source);
    assert.ok(
      naturalTurkishCvSources.includes("cv/john-serra/en/experience-sunwell-global-sales-manager"),
      "Turkish query retrieves the reviewed English CV Sunwell source",
    );
    assert.ok(
      naturalTurkishCvSources.every((source) => !(source.startsWith("wordpress/") && source.endsWith("/en"))),
      "Turkish CV query excludes all English WordPress sources",
    );

    const overlongLexical = await db.query<HybridRow>(
      `select * from public.match_career_context_hybrid(null, $1, 'en', 0.65, 6, null, null, null, 'public')`,
      [`${"x".repeat(501)} CareerTalkLab`],
    );
    assert.equal(overlongLexical.rows.length, 0, "lexical query text is bounded before parsing");

    // 4. Empty query text + null embedding → empty result.
    const emptyResult = await db.query<HybridRow>(
      `select * from public.match_career_context_hybrid(null, null, 'en', 0.65, 6, null, null, null, 'public')`,
    );
    assert.equal(emptyResult.rows.length, 0, "null embedding + null text → empty");

    // 5. CV-only filter returns only CV rows.
    const cvResult = await db.query<HybridRow>(
      `select * from public.match_career_context_hybrid($1, $2, $3, $4, $5, 'cv', null, null, 'public')`,
      [JSON.stringify(vectorA()), "experience", "en", 0.65, 6],
    );
    const cvSources = cvResult.rows.map((r) => r.source);
    assert.ok(cvSources.length > 0, "CV filter returns results");
    assert.ok(cvSources.every((s) => s.startsWith("cv/")), "CV filter returns only CV");
    assert.ok(cvSources.length > 3, "explicit CV filter bypasses the unfiltered three-CV diversity cap");

    const unfilteredCvCount = enResult.rows.filter((r) => r.source.startsWith("cv/")).length;
    assert.ok(unfilteredCvCount <= 3, "unfiltered retrieval retains the three-CV diversity cap");

    // 6. Organization filter preserved.
    const orgResult = await db.query<HybridRow>(
      `select * from public.match_career_context_hybrid($1, $2, $3, $4, $5, null, $6, null, 'public')`,
      [JSON.stringify(vectorA()), "Premium Parking", "en", 0.65, 6, "Premium Parking"],
    );
    assert.ok(orgResult.rows.every((r) =>
      r.metadata.organization === "Premium Parking"),
      "organization filter preserved in all branches");

    // Null-safe and bounded threshold/count inputs.
    const thresholdNull = await db.query<HybridRow>(
      `select * from public.match_career_context_hybrid($1, null, 'en', null, 6, 'wordpress', null, null, 'public')`,
      [JSON.stringify(vectorA())],
    );
    const thresholdNegative = await db.query<HybridRow>(
      `select * from public.match_career_context_hybrid($1, null, 'en', -10, 6, 'wordpress', null, null, 'public')`,
      [JSON.stringify(vectorA())],
    );
    const thresholdZero = await db.query<HybridRow>(
      `select * from public.match_career_context_hybrid($1, null, 'en', 0, 6, 'wordpress', null, null, 'public')`,
      [JSON.stringify(vectorA())],
    );
    const thresholdHuge = await db.query<HybridRow>(
      `select * from public.match_career_context_hybrid($1, null, 'en', 999, 6, 'wordpress', null, null, 'public')`,
      [JSON.stringify(vectorA())],
    );
    assert.deepEqual(
      thresholdNull.rows.map((r) => r.source),
      thresholdHuge.rows.map((r) => r.source),
      "null threshold defaults to 0.65 and huge threshold clamps to 1 for exact matches",
    );
    assert.deepEqual(
      thresholdNegative.rows.map((r) => r.source),
      thresholdZero.rows.map((r) => r.source),
      "negative threshold clamps to zero",
    );
    assert.ok(thresholdNegative.rows.length > thresholdNull.rows.length, "zero threshold admits orthogonal rows");

    const cvCount = async (count: number | null) => db.query<HybridRow>(
      `select * from public.match_career_context_hybrid($1, null, 'en', 0, $2, 'cv', null, null, 'public')`,
      [JSON.stringify(vectorA()), count],
    );
    const countNull = await cvCount(null);
    const countDefault = await cvCount(6);
    const countNegative = await cvCount(-5);
    const countZero = await cvCount(0);
    const countHuge = await cvCount(2_000_000_000);
    assert.deepEqual(countNull.rows, countDefault.rows, "null count uses the default");
    assert.deepEqual(countNegative.rows, countZero.rows, "negative and zero counts clamp identically");
    assert.ok(countZero.rows.length <= 4, "minimum effective count bounds the candidate multiplier");
    assert.ok(countHuge.rows.length <= 40, "huge count is bounded to forty candidates");
    assert.ok(countHuge.rows.length >= countDefault.rows.length, "huge count does not shrink the default result");

    // 7. Non-public visibility rejected.
    await assert.rejects(
      db.query(`select * from public.match_career_context_hybrid(null, 'test', 'en', 0.65, 6, null, null, null, 'private')`),
      /public visibility/,
    );

    // 8. Invalid locale rejected.
    await assert.rejects(
      db.query(`select * from public.match_career_context_hybrid(null, 'test', 'fr', 0.65, 6, null, null, null, 'public')`),
      /valid locale/,
    );

    // 9. Reapplication is idempotent.
    await db.exec(await sql("supabase/migrations/00004_hybrid_retrieval.sql"));

    // 10. Grants: service_role only, anon denied.
    const grants = await db.query<{ allowed: boolean }>(
      `select has_function_privilege('anon', 'public.match_career_context_hybrid(extensions.vector, text, text, double precision, integer, text, text, text, text)', 'EXECUTE') as allowed`,
    );
    assert.equal(grants.rows[0].allowed, false, "anon must not have hybrid RPC access");

    // 11. Fusion scores are not relabeled as cosine similarity.
    assert.ok(enResult.rows.every((r) => r.fusion_score <= 1.0 && r.fusion_score >= 0.0), "fusion score bounded 0-1");

    console.log("Verified hybrid retrieval: semantic+natural-language lexical branches, bounded/null-safe inputs, locale invariants, fallbacks, CV diversity/filtering, organization filtering, visibility/locale rejection, reapplication, grants, and fusion score bounds.");
  } finally {
    await db.close();
  }
});
