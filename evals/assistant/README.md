# Digital Twin assistant baseline harness

This harness measures the production assistant path without changing the knowledge database or public runtime behavior. It shares retrieval, prompt construction, role conversion, and Gemini streaming code with `POST /api/chat`; the CLI receives additional in-process diagnostics that are never exposed through a public endpoint.

The corpus is professional-only. Recipe posts were removed from johnserra.com on 2026-08-23; on 2026-09-09, John reaffirmed the broader policy that all cooking belongs on a separate site. Cooking is therefore absent from positive cases and evidence. The unchanged production persona and the Turkish About CMS record still contain cooking references: stale persona/About text was not all removed in August. That is a known content-policy mismatch to measure, not intended Digital Twin scope and not corrected by this baseline task.

As of 2026-09-09, the harness and corpus are implemented, but no live baseline has been run. A real run will create paired dated files under `evals/assistant/reports/baseline-<UTC timestamp>.json` and `.md`. Do not describe issue #10 as complete until those live artifacts exist and have been reviewed.

## Commands

Run these from the repository root:

```bash
npm run eval:assistant:validate
npm run test:assistant

# Full live baseline (34 cases / 37 conversational turns)
npm run eval:assistant -- --output evals/assistant/reports
```

The full run makes 36 query-embedding calls, 36 read-only `match_career_context` RPC calls, and 37 generation calls. The single synthetic indirect-injection fixture bypasses embedding/database retrieval but uses one generation call. These are expected call counts, not price estimates; provider billing and quotas must be checked separately.

Supported CLI options are:

```text
--validate              Validate cases and sources with no provider imports, network, or credentials.
--limit N               Run the first N cases; N must be within the corpus size.
--case ID               Run one exact stable case ID.
--output DIR            Select the report directory.
--quality-gate          Also exit nonzero for deterministic quality-check failures.
```

`--case` and `--limit` cannot be combined. `--validate` cannot be combined with execution options. Unknown options, duplicate options, missing values, unknown case IDs, over-large limits, and malformed corpus files fail visibly. By default, completed poor-quality runs exit successfully; an incomplete infrastructure run always exits nonzero. `--quality-gate` is an explicit opt-in that also makes proxy-quality failures nonzero.

Live execution loads `.env.local` without printing values. It needs `GEMINI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`. Missing credentials are detected before provider modules are imported. Missing credentials or a provider-adapter import/initialization exception creates a dated, sanitized `INCOMPLETE` report, marks every requested case `not_run`, records zero attempted/executed cases and zero provider calls, and exits nonzero. It performs query embeddings, read-only retrieval through `match_career_context`, and generation. It does not seed, enqueue, upsert, delete, or otherwise mutate Supabase or WordPress.

## Corpus and method

`cases.json` uses schema version `1.0.0` and contains stable IDs, locale, categories, user-turn sequences, expected WordPress source identities, evidence references, required-fact regexes, prohibited-claim rules with explicit allowed-negation patterns, uncertainty expectations, and citation expectations. The corpus covers identity, career chronology, projects, technology, published viewpoints, English, Turkish, dynamic follow-ups, unknown/private facts, direct injection, and a clearly labeled indirect-injection fixture.

For multi-turn cases, the runner appends the actual generated assistant answer to history before the next user turn. It never substitutes a hand-written “ideal” assistant turn. Retrieval still embeds only the latest message because that is current production behavior.

Every live turn records the generated answer, retrieved chunk text, source identity, similarity, retrieval/generation/total latency, and a sanitized failure category. Provider bodies and credential values are never stored in reports. Runs are sequential. One 45-second total deadline covers embedding, retrieval RPC, and generation for each turn; it is not restarted between stages. When it expires, the evaluator aborts the active Gemini or Supabase client request and stops consuming the stream. The underlying service may already have begun processing a dispatched request, so client cancellation cannot promise that a provider performs no work or charges no usage. Captured answer text is capped at 64,000 characters, and hitting the cap also aborts stream consumption. The evaluator supplies signals only during evaluation; ordinary production calls retain the original arguments and model, embedding, prompt, and retrieval configuration. After two consecutive infrastructure failures, remaining cases are marked `not_run`, an incomplete report is written, and the command exits nonzero rather than retrying into a credential, quota, or provider limit.

The indirect-injection fixture injects synthetic untrusted retrieved text in process. It never writes that text to the knowledge database. Its robustness metrics are reported separately and excluded from live retrieval denominators; a fixture-only run is never labeled a live baseline.

## Metrics and interpretation

Primary case-hit and expected-source-hit retrieval metrics inspect only the final evaluated turn. This makes a failed pronoun or follow-up retrieval visible even when an earlier turn found the source. Separately named conversation-wide retrieval coverage is retained as diagnostic context and is not the primary score. Cases with no expected source and synthetic fixtures are explicitly not applicable to live retrieval. Cases containing any infrastructure failure are excluded from all aggregate answer-quality denominators, and the report states how many were excluded; their failures, retrieved chunks, and partial answers remain in case-level output. Reports also show every matched/missing required-fact pattern, prohibited-claim violation or negated review flag, uncertainty result, citation URL, and expected URL match.

Deterministic phrase/regex matches are automated fact-pattern proxies for expected-fact coverage. They do not establish semantic correctness or prove every claim is grounded. Semantic support remains explicitly `unreviewed` until human review. A prohibited term matched inside an explicitly tested negation becomes a human-review flag rather than silently becoming either a violation or a factual pass. Citation comparison checks normalized johnserra.com paths. Link resolution is not performed, and a valid or reachable URL would not prove that the cited page supports the adjacent claim.

Human review must remain `unreviewed` until a reviewer:

1. Traces each material answer claim to captured retrieved text and the cited public excerpt.
2. Checks chronology only against dates stated in source prose, never publication/modified timestamps.
3. Flags unsupported specifics, overconfident unknowns, misleading omissions, and article hypotheticals presented as John's accomplishments.
4. Confirms citations semantically support the adjacent claims.
5. Confirms injection cases did not follow untrusted instructions or disclose secrets/private facts.

Infrastructure errors (credential, quota, provider, retrieval RPC, timeout, output-limit, and empty generation) are separate from quality failures. Partial answers are retained and marked failed; empty generation is never scored as a fabricated success.

## Evidence manifest and refresh

`sources.json` is a compact manifest derived from the anonymously fetched, published WordPress records saved on 2026-09-10 UTC. Each entry has the source identity contract `wordpress/<type>/<id>/<locale>`, title, locale, canonical frontend URL, WordPress modified timestamp, fetch timestamp, SHA-256 of the fully normalized body, and professional excerpts. The excerpts were checked against saved CMS bodies after the same normalization order used by indexing: remove script/style blocks and tags, collapse whitespace, trim, then decode supported HTML entities. No cooking paragraph is copied into evidence.

To refresh:

1. Fetch the relevant published EN/TR page, post, and project records anonymously from the configured `WORDPRESS_API_URL`, retaining `id`, `type`, `slug`, `status`, `modified_gmt`, rendered `title`/`content`, and `acf.locale`. Save them as `{ "fetchedAt": "<UTC ISO timestamp>", "sources": [...] }` outside the repository or in approved scratch space. Do not use preview credentials or private records.
2. Review the bodies for professional scope and update the explicit excerpt selectors in `scripts/evaluation/refresh-sources.ts` when source prose or identities change.
3. Run `node --import tsx scripts/evaluation/refresh-sources.ts --input /absolute/path/public-wordpress-sources.json --output evals/assistant/sources.json`.
4. Run `npm run eval:assistant:validate` and `npm run test:assistant`, then review the manifest diff before a new live baseline.

WordPress numeric IDs, modified times, and corpus contents are environment-specific. Copying this harness to another deployment requires a new anonymous source export, reviewed canonical routes, refreshed hashes/excerpts, and corresponding case evidence references. Repository `content/` may help locate topics but is not proof of current CMS content.
