# Structure-aware retrieval comparison — 2026-09-11 UTC

The paired comparison completed with **no lost expected sources** across 39 cases. Production was read only; the candidate index existed only in an embedded PostgreSQL database.

| Measure | Current index | Structure-aware index |
| --- | ---: | ---: |
| Cases retrieving an expected source | 32/39 | 36/39 |
| Expected sources retrieved | 33/42 | 37/42 |
| WordPress chunks | 208 | 182 |
| CV chunks (fixed in both indexes) | 18 | 18 |

All 12 CV cases retained their expected section hit. Four WordPress cases gained a source hit: English professional identity, English manufacturing history, Turkish current role, and Turkish manufacturing history. No case lost a previously retrieved expected source. Three WordPress cases still miss their expected source, so this is evidence of non-regression on this corpus, not perfect retrieval.

The [machine-readable report](comparison-2026-09-11.json) contains every case's expected identities, old/new retrieved identities and scores, snapshot/corpus hashes, parameters, and counters. It preserves the earlier assistant baseline reports unchanged.

## Method and scope

- Read 226 public/published rows from the current index and fetched the 24 associated public WordPress documents. Every fetched modified timestamp matched its indexed version.
- Used the unchanged `match_career_context_filtered` SQL, threshold 0.65, count 6, and `gemini-embedding-2:768:v1` on both local indexes. CV vectors and content stayed fixed.
- Evaluated the final user turn of all 27 assistant cases with expected sources plus the 12 CV cases. Each query embedding was shared by old/new retrieval. No synthetic injection or generated-answer scores enter these retrieval metrics.
- The completed run made 221 Gemini embedding calls (39 queries and 182 candidate chunks), no generation calls, and zero production writes. Content and embedding snapshots remain in private local scratch, outside this repository.
- This compares today's current index with the candidate, rather than reusing the earlier baseline's incomplete provider run. Existing source content may have evolved since that report; paired sources were timestamp-checked here.

## Other verification

`npm run test:knowledge:sql` executes the new migration and rollback fixtures using embedded PostgreSQL with pgvector. It verifies reapplication, legacy rows, stale-chunk removal, timestamp/tombstone ordering, null validation, insert-failure rollback of both rows and version state, CV old/new payload compatibility, source isolation, and RPC grants. The isolated setup omits pgmq provisioning. Hosted Supabase rollout and multi-session concurrency remain separate operational checks.

No production migration, deployment, or reindex was performed. Generated-answer quality and human grounding were not evaluated.

Final local checks passed: assistant/CV tests, both corpus validators, lint, TypeScript, all migration contract checks, the embedded SQL regression, and `CONTENT_SOURCE=filesystem npm run build` (39 generated pages). The build used network access for external assets; it does not verify WordPress-backed production page reads.
