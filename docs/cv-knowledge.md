# Reviewed public CV knowledge

This feature adds a sanitized English CV as a registered, first-class retrieval source. Production rollout completed on September 10, 2026: migration `00002` was applied, all 18 reviewed sections were indexed with canonical approval digest `a8c652af5a1dd8ee2fb513c81548a9e4342fe8240f43b352832bc41b8fc2f013`, and the bounded live retrieval evaluation passed all 12 English and Turkish cases. The evaluation verifies retrieval and current-source identity; it does not evaluate generated answer quality.

## Source and artifact

`content/knowledge/cv.en.json` is the sole canonical source. Runtime code statically imports this registered JSON source and validates it; it does not resolve a source path from the process working directory, so deployment does not depend on copying an unregistered runtime asset. Its strict allowlist fixes the document ID, English locale, public visibility, `cv` document type, reviewed-CV authority, and canonical URL. Every section repeats that metadata and has a stable ID, truthful date precision/state, and nullable organization/role. `documented_from` means January 2026 is the earliest documented BD-automation work, not a claimed inception date; the modular suite is separately documented from February 2026 and the end remains unknown. Unknown education credentials and dates and unknown language proficiency levels are stated explicitly. Each course or teaching credential remains an individual item; neither employer ISO work nor those individual courses imply a broader personal certification program.

`public/cv/john-serra.en.md` is generated deterministically from the JSON. `npm run seed:cv` validates the JSON, rejects unexpected/private fields and malformed or duplicate identities, renders or verifies the Markdown, prints every public section, and prints the canonical approval SHA-256. `cvApprovalDigest` is domain-separated and covers both the complete normalized, validated canonical document and the exact readable Markdown artifact; metadata-only changes such as organization, role, stable section ID, or date semantics therefore invalidate approval even when Markdown bytes do not change. `cvMarkdownSha256` is the distinctly named Markdown-only diagnostic and is not accepted as approval. This default path does not load `.env.local`, import provider/database modules, access the queue, or write the database.

The public Markdown is approved by content, not by time or an unrelated switch. A live enqueue requires both flags and an exact reviewed digest:

```bash
npm run seed:cv -- --apply --approved-sha256 <digest-printed-by-offline-run>
```

Missing, malformed, or mismatched approval fails before credentials are loaded or external code is imported. The job's legacy-named `content_sha256` field carries the canonical approval digest, not the Markdown-only digest. The job contains only its event ID, fixed document ID/type/locale, operation, and approval digest; it contains no CV text or arbitrary path/URL. The worker validates even an injected typed document before hashing or chunking, and chunks always calculate their own approval metadata rather than accepting a caller-supplied digest.

The original archive resume and editorial review document are excluded by exact `.gitignore` entries. They are not imported by runtime code, seed code, evaluation code, or the public artifact.

## Data flow and safe indexing order

1. Review `content/knowledge/cv.en.json` and the generated `public/cv/john-serra.en.md` together.
2. Run all offline checks, including `npm run seed:cv`, `npm run test:cv`, `npm run eval:cv -- --validate`, and the SQL contract scripts.
3. For a fresh 00002 installation, first verify a CV-aware worker as required by the original code-first rollout, then apply `00002_cv_knowledge.sql`. On that existing contract, apply `00003_wordpress_structure_aware.sql` before switching to the worker that emits the additional metadata. Its wrapper preserves the 00002 validation and accepts old-worker CV payloads. Verify RPC grants in the target database; the existing version RPC proves only the 00002 contract, not deployment or 00003 availability. `npm run test:knowledge:sql` executes the new SQL locally; it is not proof of hosted rollout.
4. Deploy the compatible shared worker and manually verify that it recognizes the strict CV job shape and canonical approval-digest algorithm. During any overlap, pause or drain old WordPress workers before they consume jobs that require 00003 metadata. Do not enqueue a CV job until the compatible worker and live SQL contract are verified. The chat fallback for an absent filtered RPC remains limited to the preserved four-argument WordPress retrieval RPC and cannot honor explicit document, organization, or role filters.
5. Only after both the manual deployed-worker verification and live SQL-contract verification, run the explicit hash-approved apply command. The command checks the database SQL contract version and enqueues one CV job; it does not verify deployed worker code, drain the queue, or silently process WordPress work.
6. Let the deployed shared worker process the queue. The worker validates the exact job allowlist, loads only its statically registered source, regenerates the canonical approval digest, and compares it before any embedding. Stale approvals and unknown IDs, locales, operations, paths, URLs, and extra fields are rejected without logging CV text. After 00003 is applied, rerun the reviewed hash-approved CV upsert to backfill `section_path`, `indexing_config`, and `chunking_config` on all CV rows; 00003 still accepts old-worker CV payloads during the rollout.
7. The worker embeds every complete semantic section and calls one transactional replacement RPC. Stable sources have the form `cv/john-serra/en/<section-id>` with chunk index `0`. A duplicate job produces the same identities. The RPC deletes prior chunks and inserts the complete new set in one transaction, so an insertion failure rolls back the deletion and old document. Removed sections disappear on a successful replacement.
8. Inspect queue/dead-letter state and exact stored section/hash coverage before acceptance. Only then run the bounded live read-only evaluation.

The CV command never drains the shared queue. Normal cron/batch entry points remain responsible for both WordPress and CV jobs. Deploying compatible worker code before migration/enqueue prevents a CV job from being consumed as an unknown payload by stale code.

## Retrieval, authority, and locale behavior

The original four-argument `match_career_context` RPC remains unchanged for existing callers. Chat uses the separately named `match_career_context_filtered` RPC, avoiding PostgreSQL overload ambiguity while adding optional document type, organization, role, and visibility filters. The function clamps threshold and result count, returns only `publication_status = 'publish'` and `visibility = 'public'`, and exposes source type plus readable section, organization, role, source locale, and canonical URL metadata.

The site still has English and Turkish experiences, but only an English CV has been reviewed. English queries use English sources. Turkish queries can retrieve Turkish WordPress sources plus the reviewed English CV; they do not fall back to unrelated English WordPress records. Returned CV metadata remains `source_locale: en`, and the assistant still answers in Turkish. No Turkish CV translation is claimed.

Similarity thresholding remains mandatory. For unfiltered retrieval, up to two qualifying CV rows are reserved within the requested total count; any remaining slots are filled by similarity rank, and no more than three CV rows can appear. With an explicit CV-only document filter, the CV cap is removed and the clamped requested count (1–20) is honored. Reservation is a deterministic source-priority choice, not evidence that a section is relevant; every returned row must still meet the embedding threshold.

The prompt treats all retrieved text as evidence, never instructions. For professional facts, the reviewed CV outranks WordPress narrative and replaces conflicting hardcoded biography. It explicitly forbids filling unknown degrees, education dates, language levels, employment continuation, formal-title status, metrics, or project completion from narrative prose. Unrelated cooking behavior is unchanged.

## Evaluation

`evals/cv/cases.json` contains 12 bounded EN/TR retrieval cases. Every case asserts a specific section source identity rather than accepting a whole-document match. Coverage includes Premium Parking dates, export technical-sales liaison work, Sunwell independent-contractor and INPAK TS-800 distinctions, Pakiş's descriptive title, Pagysa lot traceability/ISO 9001/HACCP, unknown degree details, languages without invented levels, CareerTalkLab's work-in-progress/planned analytics, and bounded BD automation dates.

```bash
# Schema, case identity, and source coverage only; no external calls.
npm run eval:cv -- --validate

# Explicit live read-only retrieval, with at most 12 sequential cases,
# one embedding + one filtered RPC per attempted case, and 15 seconds per case.
npm run eval:cv -- --live
npm run eval:cv -- --live --case sunwell-contractor-inpak-tr
```

Live mode loads credentials only after validation. It uses the same shared filtered-retrieval adapter and settings as production chat, but disables legacy fallback because acceptance requires proof of the current indexed CV. A hit requires both the exact section source ID and the current canonical approval digest; a stale row with the same section ID is not a hit. It makes no generation calls and no database writes, performs no retries, reports a timestamp, current digest, exact embedding/RPC counters, hits, and returned source/digest identities, and stops remaining work after an authentication or quota failure. Retrieval-only evidence is explicitly separate from answer quality. Offline dependency-injected mocks cover failure counters, stop behavior, deadlines, and stale digests; they and static SQL checks are not presented as live retrieval evidence.

The production acceptance run on September 10, 2026 completed 12 of 12 cases with 12 expected section hits, 12 embedding calls, 12 retrieval RPC calls, and no skipped cases. All hits required the current canonical approval digest.

## Rollback and removal

To stop new CV indexing, do not enqueue further CV jobs. To remove indexed CV rows safely, enqueue a reviewed-approval-bound `delete` job through the same strict queue contract (an operator-facing removal command can be added after live acceptance), or invoke the fixed-identity transactional replacement RPC with an empty chunk array using authorized operational tooling. Do not delete rows by `wordpress_id is null`: the legacy prune path now requires both `wordpress_id` and `document_type` to be null, so it preserves CV data.

Application rollback can switch chat back to the preserved four-argument RPC while leaving WordPress retrieval intact. Database rollback should remove CV rows first, then remove only the additive CV functions/indexes/columns after confirming no CV jobs remain. Preserve the canonical JSON and public Markdown for audit/review unless the content owner explicitly withdraws them. Publishing/deployment rollback is separate from database and queue rollback.
