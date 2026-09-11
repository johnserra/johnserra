# Conversational hybrid retrieval

Issue [#15](https://github.com/johnserra/johnserra/issues/15) — implemented September 11, 2026. This is an additive retrieval-layer change; it does not alter the public request/stream format, generation model, or persona prompt.

## Architecture

The chat pipeline now uses a hybrid retrieval stage before generation. When `matchCareerContextHybrid` is available on the injected `ChatDependencies`, `prepareChat` calls `performHybridRetrieval` instead of the original embed-only path. When it is absent, the original `match_career_context_filtered` path is preserved as a fallback.

### Query rewrite

`src/lib/chat/rewrite.ts` provides a bounded Gemini query-rewrite adapter for context-dependent follow-ups. `needsRewrite` returns `false` for a single user turn and for a multi-turn latest message that contains none of the recognized EN/TR context-reference words. When rewrite is needed, the adapter sends at most the last `REWRITE_HISTORY_LIMIT` (6) messages to `gemini-2.5-flash` with a system instruction that:

- Rewrites the latest user message as a standalone question
- Preserves named entities, technologies, dates, and specific terms
- Preserves the conversation language (EN/TR)
- Treats all conversation text as data, not instructions (injection-safe)

Each message is capped at 2,000 characters, the whole rewrite prompt is capped at 8,000 characters, and output is capped at 128 tokens. Output is validated: empty or overlong (>500 characters) rewrites, wrong-language rewrites, and rewrites that introduce a capitalized entity not present in the conversation are rejected. An unchanged valid rewrite is accepted as the original query. The rewrite has a 5-second deadline with abort support and no retry loop. On adapter failure, timeout, or rejected output, the original latest-user query is used and the rewrite fallback is recorded in diagnostics.

The rewrite adapter is injectable. Production uses `createGeminiRewriteAdapter` from `src/lib/chat/server.ts`; tests inject mock adapters. The rewrite does not set arbitrary metadata filters or invent entities — it only produces a standalone query string.

### Hybrid SQL RPC

`supabase/migrations/00004_hybrid_retrieval.sql` adds an additive `match_career_context_hybrid` RPC without altering the existing `match_career_context` or `match_career_context_filtered` functions. The RPC is service-role only (`SECURITY DEFINER`, `search_path = ''`).

**Semantic branch** (up to 20 candidates): cosine similarity >= 0.65 threshold, with all explicit filters (document type, organization, role, visibility). The locale rule has one deliberate CV exception: an EN query retrieves EN rows only; a TR query retrieves TR rows and may also retrieve reviewed EN CV rows. It does not permit EN WordPress content into TR results. The branch is omitted when the query embedding is null.

**Lexical branch** (up to 20 candidates): PostgreSQL full-text search uses `to_tsvector('simple', ...)` across content, title, organization, role, and section path. The bounded query is tokenized, common EN/TR question words are removed, duplicate meaningful terms are capped at 32, and safely quoted terms are joined with `|` in `to_tsquery`, so lexical matching is **OR**, not all-terms AND. Raw query strings are never interpolated into SQL. A GIN index (`career_context_hybrid_fts`) covers the combined FTS expression. The same locale and explicit-filter rules, including the TR-to-reviewed-EN-CV exception, apply to this branch.

**Reranking**: reciprocal rank fusion (`1/(60+sem_rank) + 1/(60+lex_rank)`) with a CV cap (max 3 CV rows per result set). The SQL returns up to `match_count * 4` candidates with fusion scores. TypeScript reranking in `src/lib/chat/retrieval.ts` adds a query-term coverage bonus and bounded source diversity (max 2 per source), then caps at `RETRIEVAL_COUNT` (6). Fusion scores are not relabeled as cosine similarity — the `similarity` field in `CareerContextMatch` carries the actual cosine similarity (0 for lexical-only matches).

### Fallbacks

| Stage | Failure | Behavior |
| --- | --- | --- |
| Embedding | Ordinary provider error or embedding-stage deadline | Fall back to lexical-only search (null embedding); evaluation label: `lexical_fallback` / `degraded` |
| Embedding | Credential/quota | Re-throw (do not retry) |
| Embedding | Abort/cancellation | Re-throw (propagate external cancellation) |
| Rewrite | Any failure | Use original query; record fallback in diagnostics |
| Hybrid RPC | PGRST202 (missing) | Fall back to `match_career_context_filtered`; evaluation label: `filtered_semantic_fallback` / `degraded` |
| Filtered RPC | PGRST202 (missing), with no explicit document/organization/role filter | Fall back to legacy `match_career_context`; evaluation label: `legacy_semantic_fallback` / `degraded` |
| Filtered RPC | PGRST202 (missing), with an explicit document/organization/role filter | Do not call the legacy RPC because it cannot honor the filter; return an error |
| Hybrid RPC | Credential/quota | Re-throw (do not retry) |
| Hybrid/filtered RPC | Ordinary error or RPC-stage deadline | Return empty evidence with `retrievalError` and `empty_error`; evaluation label: `retrieval_failure` / `failed` |

Filters and locale are preserved in all branches and fallbacks. The legacy semantic fallback is used only when there are no explicit document-type, organization, or role filters, so fallback never silently broadens an explicit filter. Production exposes an exact-name `matchCareerContextRpc` dependency to hybrid retrieval, while the existing `matchCareerContext` dependency remains the compatibility wrapper for the non-hybrid path. Both use the shared `retrieveCareerContext` fallback policy, and diagnostics therefore reflect the RPC that actually produced the result.

### Diagnostics

`HybridRetrievalDiagnostics` exposes stage durations, branch counts, rewrite/fallback statuses, and reranking decisions to development/evaluation callers. These are available in `PreparedChat.diagnostics` and in `EvaluationTurnResult.retrievalDiagnostics`. They are not exposed in the visitor API response or raw production logs. Raw private conversation text is not logged.

## Evaluation

`evals/retrieval/` contains a versioned EN/TR retrieval corpus (16 cases) and source manifest. The deterministic evaluator in `scripts/evaluation/retrieval.ts` reports:

- **Expected-source recall**: per-case and aggregate — how many expected source IDs appear in the top-6 reranked results
- **Expected-source context-precision proxy**: clearly labeled as not human semantic precision — of the returned sources, how many were expected
- **Query-term coverage**: bounded exact-token matching, not semantic grounding
- **Per-case misses/regressions**: each case reports `expectedHits` and `expectedMisses`, not just aggregate scores
- **Outcome integrity**: each result has both a status (`completed`, `degraded`, `failed`, or `skipped`) and an explicit outcome label. Only `hybrid_success` is completed. Lexical, filtered-semantic, and legacy-semantic fallbacks are degraded; `retrievalError`/`empty_error` is failed.

Only `completed` cases contribute to the aggregate recall and precision-proxy numerators and denominators. Degraded, failed, and skipped cases retain their exact per-case `expectedMisses`, and the report separately totals those misses in `excludedMisses`; they cannot appear as zero-quality successful retrieval.

The counters obey two invariants: `attempted = completed + degraded + failed`, and `selectedCaseCount = attempted + skipped`. `complete` is true only when every selected case is `completed`; any degraded, failed, or skipped result makes it false.

Every report carries the validated full-corpus `corpusVersion`, raw-file SHA-256 `casesHash` and `sourcesHash`, `corpusCaseCount`, and `corpusSourceCount` returned by `loadAndValidateRetrievalCorpus`. A limited or single-case run still identifies that full corpus and additionally records ordered `selectedCaseIds`, `selectedCaseCount`, and `selectionHash` (SHA-256 of the JSON serialization of the validated selected case records). Thus a selection is reproducible without misrepresenting the subset as the full corpus.

### Offline validation

```bash
npm run eval:retrieval -- --validate
```

Validates the corpus structure, source references, locale consistency, and coverage requirements without external calls.

CI gates the assistant acceptance tests alongside the existing CV, SQL, hybrid-retrieval, and offline corpus checks. Live acceptance remains outstanding.

### Live retrieval-only mode (opt-in)

```bash
npm run eval:retrieval -- --live
npm run eval:retrieval -- --live --limit 5
npm run eval:retrieval -- --live --case followup-careertalklab-technology-en
```

Live mode loads credentials only after validation. It uses the same shared hybrid-retrieval adapter and settings as production chat. Each case has a hard 15-second evaluation deadline implemented as a race as well as abort propagation, so the evaluator settles even if a dependency ignores `AbortSignal`; that external case deadline is reported as category `timeout` with reason `evaluation_deadline_exceeded`. Inner rewrite, embedding, and RPC operations retain their own deadlines. Live mode makes no production writes and no answer-generation calls. Emitted failure reasons are fixed categories/labels and never raw provider or database messages. The evaluation stops on credential/quota errors and marks the remaining selected cases skipped.

**Do not execute live mode in this implementation round.** Live acceptance remains outstanding; the implementation and report-integrity behavior are verified offline only.

### Corpus coverage

The corpus includes:
- Follow-ups (context-dependent, including the issue example "What technology did he use for it?")
- Exact names (Errorless Teaching, Boğaziçi)
- Exact titles (The Architect's Leap)
- Exact technologies (CareerTalkLab, BD Automation)
- Exact dates from public source evidence (including March 2020)
- Multi-source queries (CV + WordPress)
- Unknown queries (no expected sources)
- Scope traps (CV-only queries)
- Locale traps (EN must not get TR; TR gets TR + EN CV)
- Fixed prior assistant turns are explicitly labeled, not claimed as generated conversations

## Migration and rollout

1. Run `npm run test:knowledge:sql` and `node --import tsx --test supabase/tests/hybrid-retrieval.test.ts` to verify the migration locally with PGlite.
2. Apply `00004_hybrid_retrieval.sql` with the service role. The migration is additive — it creates a GIN index and a new RPC without altering existing functions.
3. Deploy the compatible application code that invokes `matchCareerContextHybrid`. When the hybrid RPC is absent, `prepareChat` falls back to the existing `match_career_context_filtered` path, preserving filters and locale.
4. Run the bounded live retrieval evaluation to verify retrieval against the production index.

### Rollback

To roll back, switch application code back to the `match_career_context_filtered` path (remove `matchCareerContextHybrid` from `ChatDependencies`). Database rollback removes the `match_career_context_hybrid` function and GIN index. Existing indexed content is not affected. The original retrieval path remains unchanged.

## Remaining work

- Live retrieval acceptance has not been executed and remains outstanding; only offline validation and automated tests are verified in this implementation round.
- A paired baseline/new measurement on the same public index has not been run and is not automated by this retrieval-only harness.
- Reranking uses reciprocal rank fusion + coverage bonus + source diversity; no paid reranker is added.
- Query rewrite uses a bounded Gemini call; the rewrite prompt is tuned for EN/TR career-context follow-ups and may need refinement for other domains.
