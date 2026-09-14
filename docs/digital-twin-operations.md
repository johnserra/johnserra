# Digital Twin operations runbook

This runbook documents setup, deployment verification, indexing, inspection, and rollback procedures. The commands below describe operational procedures; this documentation verification did not apply migrations, seed content, reindex, roll back, or publish CMS records.

## Operating principles

- Treat WordPress content, application deployments, queues, and the vector/index database as separate state domains.
- Snapshot identifiers, counts, queue state, source versions, and deployment IDs before a change.
- Pause or drain old WordPress workers before a 00003 structure-aware worker cutover.
- Never enqueue a CV update without reviewing the exact artifact and its approval digest.
- Stop live evaluation on credential or quota errors; retain the failure category and do not retry blindly.
- A deployment in `READY` state is not proof of a supported chat answer. Verify behavior separately.

## Prerequisites and local setup

Use Node.js 20 and npm. From the repository root, install dependencies with `npm ci`, then configure `.env.local` from the variable table in [README.md](../README.md). Required server-side capabilities depend on the task:

- chat: `GEMINI_API_KEY`, Supabase URL, and service-role key;
- CMS reads/indexing: `WORDPRESS_API_URL` and the appropriate WordPress credentials/secrets;
- protected cron/webhooks: `CRON_SECRET` and `WORDPRESS_WEBHOOK_SECRET`;
- page adapter: `CONTENT_SOURCE=wordpress` plus the CMS URL, or unset/other value for the filesystem adapter.

Keep all non-`NEXT_PUBLIC_` values server-side. Do not print `.env.local`, provider responses, service-role tokens, WordPress application passwords, raw prompts, or raw content in artifacts.

Safe offline checks include:

```bash
npm run eval:agent-loop:validate
npm run eval:agent-loop:offline -- --output-dir /tmp/johnserra-issue11/agent-loop-offline
npm run eval:cv -- --validate
```

These commands validate fixtures or replay deterministic cases. They do not prove live provider behavior. The broader repository check list is in [README.md](../README.md).

## Deployment verification

Record this tuple for every verification: deployment ID, deployment URL, target, state, serving commit, check time, active `CONTENT_SOURCE`, and the EN/TR URLs tested. The [case study](digital-twin-case-study.md) and [dated deployment record](../evals/production/2026-09-13-after/deployment.json) identify the production runtime used for the 2026-09-13 capture. Its prior deployment is preserved as rollback provenance in the same record. Check current hosting state before an operational change; this snapshot is not a live status page.

The verification sequence is:

1. Confirm the deployment target and state in the hosting control plane; confirm the commit matches the intended merge.
2. Determine the active `CONTENT_SOURCE` from the deployed environment. `wordpress` means page content is CMS-backed; any other value uses the retained filesystem adapter. This choice does not change chat retrieval or indexing.
3. Load the English and Turkish home/project routes. Confirm canonical locale paths, page content source, and citation destinations where applicable.
4. Make a single approved public chat request per scenario. Record the response correlation ID and HTTP status, then inspect `chat_request_completed`, `chat_agent_trace`, and `chat_tool_execution` events. Do not count HTTP 200 alone as success.
5. Verify a real trace only from the live request. For the agent evidence target, require two distinct accepted tools and one verifier pass; record failures as failures.
6. Confirm indexing health separately: queue visibility, worker outcomes, source versions, failure/dead-letter records, and expected public row counts.
7. Label screenshots/video with the deployment, timestamp, locale, correlation ID where safe, and redaction review. A fixture or storyboard is not live evidence.

The case study links dated live evidence and its limitations. The procedures here also cover checks not executed during that capture, including database recovery and indexing health.

## Migration order and cutover

Start from the repository's base `supabase-schema.sql`, then apply the numbered migrations in this exact order:

| Order | Migration | Operational purpose | Gate |
| ---: | --- | --- | --- |
| 1 | [`00001_wordpress_vector_queue.sql`](../supabase/migrations/00001_wordpress_vector_queue.sql) | pgvector extension, WordPress metadata, and durable queue support | Base schema and compatible queue worker |
| 2 | [`00002_cv_knowledge.sql`](../supabase/migrations/00002_cv_knowledge.sql) | Reviewed CV shape, visibility constraints, and filtered retrieval | CV-aware application/worker deployed before CV jobs |
| 3 | [`00003_wordpress_structure_aware.sql`](../supabase/migrations/00003_wordpress_structure_aware.sql) | Section metadata and version-ordered atomic replacement | Pause/drain workers that bypass this metadata |
| 4 | [`00004_hybrid_retrieval.sql`](../supabase/migrations/00004_hybrid_retrieval.sql) | Additive lexical FTS plus semantic rank fusion | Validate RPC grants and query compatibility |
| 5 | [`00005_chat_api_hardening.sql`](../supabase/migrations/00005_chat_api_hardening.sql) | Private HMAC session/IP rate-limit counters | Verify service-role-only access |

For a production change:

1. Save a private database/index snapshot and record queue counts, failures, source versions, and the current deployment.
2. Run migration contract and embedded SQL tests in CI or an isolated environment. These tests do not provision hosted `pgmq` or prove multi-session hosted concurrency.
3. Apply schema changes transactionally through the approved database change process. Treat migration SQL as a reviewed operational procedure; this verification did not execute it.
4. Deploy the compatible application and worker. Before 00003 cutover, pause or drain old WordPress workers because direct writes do not emit the new version metadata contract.
5. Verify the deployed worker and RPC permissions. Only then enqueue a reviewed CV job or reindex WordPress content.
6. Verify the queue drains, failures are classified, and source row counts/metadata match the expected public snapshot.

## Safe indexing and inspection

### WordPress

Prefer the signed publication webhook for normal changes. It enqueues a specific public source and lets the worker perform atomic replacement. Use a full seed only for a controlled published snapshot rebuild. A full seed does not prove that every missed deletion webhook has been repaired.

Before a seed or reindex, confirm:

- the CMS snapshot is published-only and the intended EN/TR locales are selected;
- the worker understands the installed migrations, especially 00003 metadata;
- the queue is empty or its existing jobs are recorded so the new run is distinguishable;
- the expected source IDs, modified timestamps, and current index counts are captured;
- failure/dead-letter handling is enabled and the run stops nonzero on observed failures.

Afterward, inspect successful/failed job counts, visibility/retry times, durable source versions, stale-chunk removal, locale, authority, canonical URL, section path, and indexing/chunking configuration. Do not interpret an empty batch as proof that no delayed jobs exist; failed jobs may be invisible during their retry interval.

### Reviewed CV

Run the offline validator and review the exact rendered artifact and digest first:

```bash
npm run seed:cv
```

Only after a human approves that exact artifact, a deployed CV-aware worker, and migration 00002, use the apply procedure with the exact printed digest:

```bash
npm run seed:cv -- --apply --approved-sha256 <exact-printed-digest>
```

This enqueues one approval-bound CV upsert and must not drain unrelated WordPress jobs. The worker must verify the same digest before any embedding call. If the digest differs, stop and review; do not bypass the approval flag.

### Read-only evaluation and log inspection

Use corpus validators and offline agent replay to check structure without provider calls. A live retrieval check, when explicitly approved, is read-only but still consumes provider quota; run one bounded case at a time, keep output private, and stop on auth/quota errors. For chat behavior, use the [observability procedure](chat-observability.md): correlate the response header with sanitized runtime events and never copy payload text into logs or tickets.

## Rollback boundaries

Rollback must name the state domain being changed. No single rollback restores all four domains.

### 1. Application deployment aliases

If application code or configuration is faulty, promote a previously accepted Vercel deployment or redeploy a known commit using the approved hosting workflow. For a page-only emergency, setting `CONTENT_SOURCE=filesystem` (or unsetting it) and redeploying selects the retained filesystem adapter. This changes application routing only; it does not revert WordPress records, queued jobs, vector rows, or chat model state. Verify EN/TR routes and record the new deployment ID.

### 2. CMS content

If a WordPress post/page/project is wrong, correct or revert the CMS record through the reviewed WordPress workflow, then allow the signed webhook to enqueue the source update. Confirm the source ID, locale, modified timestamp, and resulting canonical URL. A page rollback does not remove already-indexed rows until the corresponding delete/update job succeeds. Do not edit production CMS content as a substitute for an application rollback.

### 3. Queues

If indexing is unhealthy, pause the worker, inspect visible/in-flight/retry/dead-letter jobs, and preserve their source identities and payload categories. Resume or retry only after the code/schema gate is corrected. Do not delete a queue to make it look empty: queue state is separate from indexed rows, and a queued job may represent a required deletion. WordPress webhook delivery has no durable delivery-retry queue; after successful receipt, the source job is placed on the separate durable Supabase `pgmq` indexing queue. Use the documented worker/cron recovery path for indexing jobs and record webhook delivery failures separately.

### 4. Database and vector/index state

If the database or index is wrong, stop writers, preserve a snapshot and migration/version identifiers, and choose the narrowest recovery: restore/rebuild the affected public source, restore a known-good index snapshot, or apply a reviewed forward fix. Atomic replacement and version/tombstone ordering are intended to keep partial source replacements from becoming visible. CV recovery must use a previously reviewed artifact and matching approval digest. Do not drop `career_context`, `pgmq`, or the vector extension as a generic rollback.

Migration rollback is not the same as application rollback. 00004 is additive and changes retrieval behavior through the hybrid RPC/index; 00005 protects rate-limit state. A database rollback can remove schema or rate-limit history while leaving a deployed application expecting it. Coordinate schema, worker, and application versions, and verify RPC grants after recovery.

## Incident handoff

The handoff should include deployment ID/commit, active content adapter, locale, correlation ID if chat-related, queue/source identity if indexing-related, stable failure category, timestamps, and the exact state domain affected. Exclude credentials, raw prompts, generated text, URLs, source content, IPs, session identifiers, and provider error payloads. Link to the [architecture](digital-twin-architecture.md), [observability](chat-observability.md), [WordPress knowledge guide](wordpress-knowledge.md), or [CV knowledge guide](cv-knowledge.md) as appropriate.
