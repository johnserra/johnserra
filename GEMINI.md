# Gemini Context: John Serra's Personal Site

This project is the personal website and portfolio for John Serra, built with Next.js, TypeScript, and Tailwind CSS. It serves as a digital hub for his career and professional writing. Recipe posts were removed on 2026-08-23, and John reaffirmed the broader exclusion of cooking on 2026-09-09. Stale About/persona references were not all removed in August and remain a documented baseline mismatch.

## Tech Stack
- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4 (with Typography plugin)
- **Database/Auth:** Supabase
- **AI:** Google Gemini via `@google/genai` (query/document embeddings and streamed generation)
- **Email:** Resend
- **Content:** WordPress REST/HTML when `CONTENT_SOURCE=wordpress`; retained Markdown/MDX adapter otherwise

Use [README.md](README.md) for setup and operations and [docs/digital-twin-architecture.md](docs/digital-twin-architecture.md) for the source-backed architecture, limitations, and AI Engineering challenge baseline. Those documents supersede historical pre-migration descriptions.

## Project Structure
- `src/app/`: Next.js App Router pages and API routes.
- `src/components/`: Reusable React components (UI, layout including `Header.tsx` with the `Search / Ask AI` trigger, homepage bento widgets, blog components such as `NewsletterSignup.tsx`, data-audit assessment, and chat/discovery widgets).
- `src/lib/`: Core logic, including the shared chat path (`chat/`), content-source switch (`site-content.ts`), WordPress adapter, knowledge indexing/embeddings, and Supabase clients (`supabase.ts`).
- `content/`: Retained locale-organized Markdown/MDX content for filesystem rendering and import.
- `scripts/`: Utility scripts, such as `seed-knowledge-base.ts` for populating the RAG system.
- `supabase-schema.sql`: Base database schema for contact messages, newsletter subscribers (`newsletter_subscribers`), and career context.
- `supabase/migrations/00001_wordpress_vector_queue.sql`–`00006_wordpress_table_chunking.sql`: Ordered migrations for vectors and durable `pgmq` indexing (`00001`), reviewed CV knowledge (`00002`), structure-aware WordPress replacement/versioning (`00003`), hybrid semantic+lexical retrieval (`00004`), HMAC chat rate limiting (`00005`), and table-aware `structure-aware-v2` chunking (`00006`).

## Key Features & Conventions
### 1. Content Management
`src/lib/site-content.ts` selects WordPress or filesystem page reads. Projects use the `projects` routes. Do not restore or create cooking/recipe content for this site. WordPress publishing sends signed cache-invalidation/indexing events. Preserve Obsidian-style `[[wiki links]]` transformation in the filesystem adapter.

### 2. AI Chat Assistant
A bounded evidence-agent chat widget (`AIChatWidget.tsx` + `AIChatPanel.tsx`) is mounted across primary pages (`/`, `/about`, `/blog`, eligible `/blog/[slug]` articles via `isChatEligibleArticle`, `/projects`, `/services`, and `/contact`) and can also be opened from the header/mobile-menu **Search / Ask AI** (`openChat`) button.
- **API Route & Agent Loop:** `src/app/api/chat/route.ts` enforces `CHAT_RATE_LIMIT_SECRET` HMAC rate limits and streams `gemini-2.5-flash` (`CHAT_MODEL`) responses as NDJSON frames via `src/lib/chat/agent-loop.ts` (at most 3 accepted tool calls across 2 retrieval rounds, 1 buffered draft, and 1 verifier pass within 12 steps / 45s).
- **MCP Server (v1, Read-Only):** `src/app/api/mcp/route.ts` + `src/lib/mcp/` expose a stateless Streamable HTTP MCP endpoint (`POST /api/mcp`, `405` on `GET`/`DELETE`) with a single read-only `ask_digital_twin(question, locale?)` tool wrapping `streamBoundedEvidenceAgent` (38s deadline, Markdown + `structuredContent` citations, MCP-namespaced HMAC IP rate limits via `check_chat_rate_limit`, and privacy-safe `mcp_request_completed` telemetry).
- **Hybrid RAG & Tools:** `gemini-embedding-2` creates 768-dimensional embeddings; `match_career_context_hybrid` fuses semantic `pgvector` similarity (threshold `0.65`, count `6`) with `simple` full-text lexical search. The model may select only five read-only tools (`search_knowledge`, `get_cv_timeline`, `get_project_details`, `list_articles`, `get_contact_options`).
- **Panel Modes & History:** `AIChatPanel.tsx` displays inline welcome actions and wrapped instant FAQ shortcuts, `ProjectDiscoveryFlow.tsx` (`Discuss a project`), safe Markdown rendering, staged progress feedback with stop/retry controls, `Escape` dismissal, and in-memory history by default, with optional visitor opt-in browser-local `localStorage` persistence tucked into a collapsible header settings tray (30-day rolling expiry; no server-side transcript storage).
- **Indexing & Seeding:** WordPress publishing sends signed webhooks to `/api/revalidate/wordpress`, which invalidates Next.js cache tags, enqueues a durable `pgmq` job, and runs an immediate background worker attempt (backed by the daily `/api/cron/process-content-indexing` cron). `npm run seed` indexes all published EN/TR WordPress records; `npm run sync:cv` performs an offline public-boundary-safe sync from `~/Projects/career-ops/cv.md` into `content/knowledge/cv.en.json` and `public/cv/john-serra.en.md`; `npm run seed:cv` manages the separate human-approved CV source. Chat/indexing are independent of `CONTENT_SOURCE`.

### 3. Site Layout, Bento UI & Editorial Surfaces
The homepage uses a bento-style layout (`src/components/bento/`), paired with the site-wide masthead/navigation (`src/components/layout/Header.tsx`), topic-aware editorial footer callouts on `/blog/[slug]`, the self-serve assessment (`/data-audit`), and email update signups (`NewsletterSignup.tsx` → `/api/newsletter`).

## Development Commands
- `npm run dev`: Start the development server.
- `npm run build`: Build the production application.
- `npm run lint`: Run ESLint.
- `npm run seed`: Index published WordPress knowledge into Supabase (writes data and calls Gemini embeddings).
- `npm run sync:cv`: Sync `~/Projects/career-ops/cv.md` (primary) into the sanitized public CV artifacts offline (never writes to Supabase).
- `npm run seed:cv`: Validate the registered public CV offline and print its canonical approval SHA-256 (use `--apply --approved-sha256 <digest>` to enqueue live indexing).
- `npm run test:data-audit`: Run existing assessment tests.
- `npm run eval:assistant:validate`: Validate assistant cases and public evidence offline.
- `npm run test:assistant`: Run offline shared-chat and evaluation harness tests. See [evals/assistant/README.md](evals/assistant/README.md) for the first dated live report: 34 attempted cases, 33 completed, one embedding quota failure, and semantic support still awaiting human review.
- `npm run test:mcp`: Run offline unit and stateless Streamable HTTP transport tests for `POST /api/mcp`.

## Coding Standards
- **Strict Typing:** Always use TypeScript interfaces for data structures (see `src/types/index.ts`).
- **Surgical Updates:** When modifying content processing, ensure `transformObsidianLinks` is respected.
- **AI Context & Guardrails:** The assistant is transparently John's AI assistant (third-person, never impersonating John or making commitments); preserve `buildSystemPrompt` (`src/lib/chat/core.ts`), [docs/persona-privacy-guardrails.md](docs/persona-privacy-guardrails.md), and `src/lib/chat/public-boundaries.ts`.
- **Documentation Sync:** Whenever UI surfaces, routes, environment variables, migrations, or assistant behavior change, update `README.md` and `GEMINI.md` in the same task so project documentation stays aligned with code.
