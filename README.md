# John Serra — personal site and Digital Twin

Have a project you'd like to discuss? [Let's talk.](https://johnserra.com/contact)

English/Turkish portfolio, professional writing, and a personal AI assistant built with Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, and next-intl. The assistant retrieves published knowledge from Supabase pgvector and streams Gemini answers about John Serra's documented public work.

The [Digital Twin architecture and baseline](docs/digital-twin-architecture.md) documents the current request flow, indexing pipeline, limitations, and six-week AI Engineering challenge mapping. The [persona, privacy, and prompt-injection guardrails](docs/persona-privacy-guardrails.md) are the canonical policy for assistant behavior and chat retention. The [assistant evaluation harness](evals/assistant/README.md) provides the reproducible corpus and runner for [#10](https://github.com/johnserra/johnserra/issues/10). The [first live report](evals/assistant/reports/baseline-2026-09-10T02-27-41-980Z.md) records 34 attempted cases: 33 completed and one embedding quota failure. It remains marked incomplete; automated quality scores are proxies, with semantic support awaiting human review.

## Current implementation

- **Chat:** the homepage loads a floating chat panel on demand. It sends browser-held conversation history to `POST /api/chat`, embeds the latest message with `gemini-embedding-2` (768 dimensions), retrieves up to six matching public/published chunks for the selected locale (plus only the reviewed English CV for Turkish queries), then streams `gemini-2.5-flash` text back to the panel.
- **Knowledge:** published WordPress posts, pages, and projects are indexed through a durable Supabase `pgmq` queue. A reviewed, structured English CV is a registered source and uses the same queue with approval-bound jobs and atomic replacement. Its production migration and 18-section index were completed on 2026-09-10; the bounded live retrieval evaluation passed 12/12 English and Turkish cases against the current approval digest. Signed publishing webhooks invalidate page caches and enqueue WordPress updates; an immediate worker attempt and a scheduled worker process jobs. Recipe posts were removed on 2026-08-23, and John reaffirmed the broader exclusion of cooking on 2026-09-09.
- **Page content:** `CONTENT_SOURCE=wordpress` selects the WordPress REST adapter. Any other value, including an unset variable, selects the retained filesystem Markdown/MDX adapter. This setting does **not** change chat retrieval or the WordPress knowledge seeder.
- **Other services:** contact submissions use Supabase and Resend; contact and data-audit routes can sync leads to Jetpack CRM. These integrations are separate from the assistant and are not model-callable tools.

The current assistant performs one retrieval step before generation. Model-selected tools, conversation-aware retrieval, reliable public citations, and bounded answer verification are planned work, not completed capabilities.

## Local setup

Use Node.js 20 (the version configured in [CI](.github/workflows/ci.yml)) and npm. From the repository root:

```bash
npm ci
```

Create `.env.local` using the variable reference below. Next.js loads it for development; the seeder and WordPress importer load it explicitly. Environment files are ignored by Git. Use credentials for the intended development services, since chat makes paid model calls and indexing writes to the configured database.

For a filesystem-backed page preview, leave `CONTENT_SOURCE` unset. For CMS-backed pages, set `CONTENT_SOURCE=wordpress` and configure `WORDPRESS_API_URL`. A working assistant additionally needs Gemini credentials and a Supabase database initialized as described under indexing.

```bash
npm run dev
```

Open `http://localhost:3000` for English or `http://localhost:3000/tr` for Turkish. The chat widget is on the homepage. Its history survives closing/reopening the panel, but a reload or component unmount clears it.

### Environment variables

Names and purposes only; supply actual values through local or hosting secrets. Variables without `NEXT_PUBLIC_` must remain on the server.

| Variable | Required for / behavior |
| --- | --- |
| `GEMINI_API_KEY` | Chat generation, query embeddings, and WordPress document embeddings. |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL used by chat, indexing, contact storage, and keep-alive. Public configuration. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server database access for those features; bypasses RLS. Never expose to browser code. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Only needed if using the exported `getSupabaseClient()` helper. Current chat/indexing paths use the service-role client; no current call sites use this helper. |
| `CONTENT_SOURCE` | `wordpress` enables CMS page reads; unset or any other value uses filesystem pages. Independent of chat/indexing. |
| `WORDPRESS_API_URL` | WordPress REST root, such as `https://cms.example.com/wp-json/`; required for CMS pages and seeding/indexing. Published reads are anonymous. |
| `WORDPRESS_MEDIA_URL` | Optional media host URL for Next.js image configuration; falls back to `WORDPRESS_API_URL`. Allows that origin's `/wp-content/uploads/**` path. |
| `WORDPRESS_WEBHOOK_SECRET` | Shared HMAC secret for publishing webhooks and signed draft-preview links. Must match WordPress's `JOHNSERRA_WEBHOOK_SECRET`. |
| `WORDPRESS_PREVIEW_USERNAME` | Restricted WordPress account used for draft preview. |
| `WORDPRESS_PREVIEW_APPLICATION_PASSWORD` | Application Password for that preview account; not needed for public reads or indexing. |
| `CRON_SECRET` | Bearer token protecting both cron routes; configure it in the deployed environment. |
| `RESEND_API_KEY` | Contact email delivery; optional email notification in the data-audit route. Sender and recipient settings are currently in the route code. |
| `JETPACK_CRM_API_URL` | Optional CRM API base URL for contact/data-audit lead sync. |
| `JETPACK_CRM_API_KEY` | CRM key; sync runs only when all three CRM variables are present. |
| `JETPACK_CRM_API_SECRET` | CRM secret. |
| `NEXT_PUBLIC_GA_ID` | Optional public Google Analytics measurement ID. |
| `WORDPRESS_USERNAME` | Importer-only account for `npm run wordpress:import`; not required by the deployed frontend. |
| `WORDPRESS_APPLICATION_PASSWORD` | Importer-only Application Password; keep local or in import-job secrets. |

See the [WordPress plugin installation instructions](wordpress/wp-content/plugins/johnserra-core/README.md) for the CMS-side `JOHNSERRA_FRONTEND_URL`, `JOHNSERRA_FRONTEND_WEBHOOK_URL`, and `JOHNSERRA_WEBHOOK_SECRET` constants. Point the webhook at the intended frontend's `/api/revalidate/wordpress` endpoint.

## Database and knowledge indexing

1. Install WordPress, Advanced Custom Fields, and the repository's [John Serra Site Core plugin](wordpress/wp-content/plugins/johnserra-core/README.md). Configure published EN/TR records and the signed webhook. The [adapter contract](src/lib/wordpress/README.md) specifies the REST fields and locale filters.
2. Apply [supabase-schema.sql](supabase-schema.sql), then [00001_wordpress_vector_queue.sql](supabase/migrations/00001_wordpress_vector_queue.sql). For a fresh CV installation, follow the original code-first 00002 rollout: verify a CV-aware worker before applying [00002_cv_knowledge.sql](supabase/migrations/00002_cv_knowledge.sql), and do not enqueue CV work until both are verified. For structure-aware indexing, apply additive [00003_wordpress_structure_aware.sql](supabase/migrations/00003_wordpress_structure_aware.sql) **before switching to this worker version**. Pause/drain old WordPress workers during cutover because their direct writes bypass the new version state. The new migration preserves retrieval signatures and accepts old CV payloads. Its SQL behavior is tested locally with embedded PostgreSQL; it has not been applied to production. See [indexing operations](docs/wordpress-knowledge.md) and the [paired retrieval comparison](evals/chunking/comparison-2026-09-11.md).
3. Set the Gemini, Supabase, and WordPress API variables in `.env.local`. To index all published posts, pages, and projects in both locales:

   ```bash
   npm run seed
   ```

   This enqueues WordPress records and processes batches of five until no jobs are currently visible. It makes embedding API calls and upserts database rows. Failed jobs can remain invisible for their retry interval; an empty batch does not prove that the queue has no pending work. The script exits nonzero when it observes failures.
4. Inspect worker output and `public.content_indexing_failures` for failures. Successful jobs are archived. Retries become visible after 180 seconds; a failure on the fifth or later read is recorded and archived. The daily cron processes at most five jobs per invocation, so a large backlog needs additional worker invocations.
5. After confirming WordPress coverage, `npm run seed -- --prune-legacy` can remove genuine legacy rows where both `wordpress_id` and `document_type` are null. CV rows are protected. It is optional and destructive. The flag is not gated on every indexing job succeeding; omit it during initial setup or recovery.

The reviewed CV workflow is deliberately separate:

```bash
# Offline: validate the strict JSON source, render/check Markdown, and print the
# canonical approval digest over both validated data and the readable artifact.
npm run seed:cv

# Live write, only after reviewing that exact artifact and deploying code + 00002.
npm run seed:cv -- --apply --approved-sha256 <exact-printed-digest>

# Offline corpus validation; live retrieval remains an explicit read-only action.
npm run eval:cv -- --validate
npm run eval:cv -- --live --limit 3
```

The apply command enqueues one approval-bound CV upsert and never drains unrelated WordPress jobs. Its SQL version check does not verify deployed worker code; apply the additive migrations first, then switch workers and verify the deployed code before enqueueing. During cutover, pause or drain old WordPress workers because they do not emit the 00003 metadata contract; old CV workers remain accepted by the compatibility extension. The shared scheduled worker validates its statically imported registered source and verifies the same canonical approval digest before any embedding call. Unfiltered retrieval reserves up to two qualifying CV slots within the total, caps CV rows at three, and fills remaining slots by similarity; explicit CV-only retrieval honors the clamped count up to 20. See [CV knowledge operations](docs/cv-knowledge.md) for authority, filtering, EN/TR behavior, ranking, rollout, and rollback details.

Normal publication uses the webhook rather than a full reseed. Upserts replace matching `(source, chunk_index)` rows and remove excess old chunks for that source; delete jobs remove the matching WordPress ID/locale. The durable per-source version/tombstone state survives empty replacements and deletions, so stale in-flight events cannot resurrect content; equal-timestamp deletes win ties. To reindex after applying 00003, run `npm run seed` for the published WordPress snapshot. A full seed only visits currently published records, so it is not a complete reconciliation of missed deletion events.

For a one-time MDX-to-WordPress import, see [HEADLESS_WORDPRESS_IMPLEMENTATION.md](HEADLESS_WORDPRESS_IMPLEMENTATION.md). `npm run wordpress:import:dry` previews the import; `npm run wordpress:import` applies it. Import and knowledge indexing are separate steps.

## Checks and production build

Run the existing local checks from the repository root:

```bash
npm run lint
npm run eval:assistant:validate
npm run test:assistant
npm run test:cv
npm run test:knowledge:sql
npm run eval:cv -- --validate
npm run test:data-audit
bash wordpress/wp-content/plugins/johnserra-core/tests/verify-contract.sh
bash src/lib/wordpress/tests/verify-contract.sh
bash supabase/tests/verify-wordpress-vector-migration.sh
bash supabase/tests/verify-cv-migration.sh
```

The data-audit tests cover the assessment feature. Assistant tests and validation are offline; they do not call providers. The shell checks inspect source contracts; they do not execute a database migration or prove a working CMS/model integration. Production build is a separate environment-dependent check because it loads local secrets and external fonts; it was not run for the CV correction. See the [evaluation guide](evals/assistant/README.md) for the bounded live command and dated reports. GitHub Actions runs install, lint, knowledge tests, the embedded SQL regression, and build.

Use `npm run start` after a successful build to inspect the production build locally. WordPress-backed builds need access to the configured CMS for content reads. The repository records a local development CSS issue in [CLAUDE.md](CLAUDE.md); if it recurs, compare the production build before changing styles.

## Deployment and operations

The recorded topology is **Vercel frontend/API → external WordPress, Supabase, and Gemini**, with Resend and optional CRM for non-chat features. The public frontend is `johnserra.com`. Repository history records Vercel's Git integration with `main`: pushing to `main` triggers production deployment. Current deployment health and environment values have not been reverified as part of this source-documentation baseline.

For a deployment, configure the variables above in the intended Vercel environment, apply database schema changes separately, deploy the WordPress plugin separately, and initialize knowledge before accepting chat behavior. After local checks, create and inspect a preview before promoting changes to production. The recorded CLI preview workflow is `vercel deploy` from a checkout linked to the intended project; it requires Vercel authentication. Verify EN/TR pages, a streamed chat response, a published content update, and queue processing in the intended environment.

[vercel.json](vercel.json) schedules these authenticated GET routes (UTC):

| Route | Schedule | Work per invocation |
| --- | --- | --- |
| `/api/cron/process-content-indexing` | `15 8 * * *` — daily at 08:15 | Process up to five queue jobs; route declares `maxDuration=300`. |
| `/api/cron/keep-alive` | `0 8 */3 * *` — 08:00 on every third day-of-month starting on day 1 | Count `career_context` rows to exercise the database connection. |

For manual worker invocation, send `Authorization: Bearer <CRON_SECRET>` to the indexing cron route using the target environment's secret. The webhook's immediate `after()` attempt processes one available queued job, which may be older than the event just received. Check Vercel function logs for processing errors and WordPress PHP logs for webhook delivery failures; the plugin logs delivery failure but does not implement a durable delivery retry queue.

For page-content rollback, set `CONTENT_SOURCE=filesystem` (or unset it) and redeploy an accepted build. Retain `content/` and the MDX dependencies for that path. This does not roll back the vector database, queued jobs, or chat model behavior; those need separate recovery. Production verification and a demonstrated rollback procedure belong to [#11](https://github.com/johnserra/johnserra/issues/11).

## Documentation map

- [Digital Twin architecture and baseline](docs/digital-twin-architecture.md): current behavior, diagrams, source map, limitations, and challenge mapping.
- [Assistant evaluation harness](evals/assistant/README.md): case/source schemas, offline checks, bounded live runner, metrics, and human-review rubric.
- [CV knowledge operations](docs/cv-knowledge.md): public artifact review, approval-bound indexing, authority, filtering, locale behavior, evaluation, and rollback.
- [WordPress knowledge indexing](docs/wordpress-knowledge.md): structure-aware chunking, public canonical URLs, claim-domain authority, atomic replacement, version ordering, and the isolated retrieval comparison plan.
- [WordPress implementation guide](HEADLESS_WORDPRESS_IMPLEMENTATION.md): migration setup and acceptance checklist.
- [WordPress migration review](HEADLESS_WORDPRESS_MIGRATION_REVIEW.md): historical design proposal; its descriptions of the pre-migration implementation are not the current baseline.
- [Roadmap #22](https://github.com/johnserra/johnserra/issues/22): implementation order and completion criteria.
