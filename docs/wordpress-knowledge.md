# WordPress knowledge indexing

WordPress knowledge now uses a structure-aware, versioned indexing contract.

## Chunk and metadata contract

The worker parses headings, paragraphs, and list items. Heading levels build a section path such as `Role > Project`; every continuation repeats the document title and full section path. Short meaningful sections are retained. Oversized sections are split at word boundaries with a maximum rendered chunk size of 2,400 characters and at most 300 characters of overlap. Overlap is reset at every section boundary, so role/project sections cannot bleed into one another. HTML without structural blocks follows the same deterministic bounded fallback.

The chunker configuration is `structure-aware-v1`; the surrounding indexing contract is `wordpress-indexing-v2`. An empty section path denotes the document body before any heading. Each indexed chunk records title, section path, locale, `document_type=wordpress`, canonical frontend URL, authority, source version, embedding configuration, and both configuration versions. Canonical URLs follow the application routes: English posts use `/blog/<slug>`, Turkish posts `/tr/blog/<slug>`, English projects `/projects/<slug>`, Turkish projects `/tr/projeler/<slug>`, and localized About/privacy pages use their established slugs. Raw WordPress API URLs and internal source IDs are not canonical URLs.

Authority is claim-domain metadata, not a general truth score:

- `reviewed_public_cv` is the authority for career facts when the reviewed CV covers the claim.
- `project_page` is the authority for implementation and project details on a public project page.
- `authored_post` is the authority for John's published views and examples in an authored article. An article example must not be presented as John's personal accomplishment solely because it appears in an authored post.
- `site_page` covers other public WordPress pages and is not a substitute for the reviewed CV for career facts.

## Migration and operational order

1. Run `npm run test:cv`, `npm run test:knowledge:sql`, and the static SQL contract checks. The SQL test executes migration 00003 and transaction fixtures using [PGlite with pgvector](https://pglite.dev/extensions/), without credentials or remote services. It covers rollback, version/tombstone behavior, stale chunks, CV compatibility, and grants. It excludes pgmq provisioning and cannot prove hosted Supabase behavior or concurrent sessions. The shell contract check only reads SQL text.
2. Apply additive migration `00003_wordpress_structure_aware.sql` with the service role before switching to the worker that emits its metadata. It adds nullable metadata columns, durable per-source version/tombstone state, source-scoped replacement RPCs, an advisory transaction lock, and service-role-only grants. The existing four-argument `match_career_context` signature is unchanged.
3. Pause/drain old WordPress workers before switching workers: the old code writes rows directly and bypasses the new version state. Deploy the compatible worker, then reindex published WordPress content with `npm run seed`. The reindex path is the normal queue path; no source artifact changes are needed. Old CV workers remain accepted by 00003's backward-compatible CV RPC extension. Reindex the unchanged reviewed CV using its existing approval digest to populate the additional metadata.

Replacement validates every candidate row before deleting the current source. The delete and inserts then run in one database transaction, so embedding, validation, cast, constraint, or insert failures leave the old source intact. Successful replacement deletes all prior rows for that exact `content_type/id/locale` source before inserting the new set, which removes stale trailing chunks. The source predicate excludes CV rows and unrelated WordPress documents. Version state is updated in the same transaction as replacement/removal, survives an empty document, seeds from initial legacy rows, treats null timestamps as older than known timestamps, and gives deletes precedence over same-timestamp upserts.

Concurrent replacements for the same source serialize on an advisory transaction lock. The database compares the durable per-source version state before replacement; an older event is a no-op and can be archived safely rather than overwriting a newer version. A replacement with no version cannot overwrite an already-versioned source. Initial legacy rows seed that state, while empty replacements and deletes leave a tombstone behind. Equal-timestamp deletes win over upserts. Independent sources can continue concurrently. Deletes use the same source lock and version guard.

The rollback limit is intentional: rolling back application code or the migration does not restore rows already replaced, queued jobs, provider calls, or prior embeddings. Recovery requires re-running the prior compatible indexer against a known source snapshot or restoring database backup state. The reviewed CV source and its approval digest are independent of this migration and must not be rewritten as part of a WordPress reindex.

## Isolated retrieval comparison

The [2026-09-11 paired comparison](../evals/chunking/comparison-2026-09-11.md) completed against isolated old/new indexes: expected-source case hits rose from 32/39 to 36/39, source hits from 33/42 to 37/42, with no lost expected sources. The existing baseline reports and corpora remain unchanged. This is retrieval evidence on the fixed corpus; generated-answer grounding remains a separate check. The [hosted rollout](../evals/chunking/production-2026-09-11.md) subsequently reproduced the retrieval result.

To produce a reproducible comparison in an isolated Supabase project:

1. Snapshot the old `career_context` rows and record the exact embedding model, retrieval RPC arguments, commit, corpus version, and source manifest.
2. Restore the snapshot into an isolated database, run the same assistant evaluation queries against the old four-argument retrieval RPC, and save retrieval rows with source IDs, canonical URLs, and scores.
3. Apply `00003_wordpress_structure_aware.sql` to a separate clone, reindex the same published WordPress snapshot with the same embedding model, and run the identical queries and thresholds.
4. Compare final-turn expected-source hits, source identity, section-path coverage, canonical URL validity, stale-source counts, and error/latency distributions. Keep query text, corpus, embedding configuration, and RPC parameters fixed; version any intentional change.
5. Review answer grounding separately. Lexical/offline tests, unchanged production retrieval, and phrase matches do not prove semantic non-regression.

For a paired comparison against the current public index, run:

```bash
npm run eval:chunking -- --live --output /tmp/chunking-comparison
```

This reads a bounded public Supabase snapshot and corresponding public WordPress records, verifies matching source timestamps, and creates old/new indexes in an embedded database. It uses the unchanged filtered retrieval RPC, 0.65 threshold, six-result limit, all assistant cases with expected sources, and the CV corpus. Each latest-turn query embedding is shared between both indexes. CV content/vectors stay fixed. Only Gemini embedding calls use a paid provider; there are no production writes or generated answers. Scratch files include public content, embeddings, and a comparison report; keep them outside the repository. Cached embeddings are keyed by content, title, task type, and embedding configuration. Infrastructure failures produce an incomplete report and stop rather than retrying into quota limits. Aggregate case/source hit counts and individual lost-source cases are both reported; an aggregate improvement does not erase individual regressions.
