# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server (http://localhost:3000)
npm run build    # Production build
npm run lint     # Run ESLint
npm run seed     # Enqueue and index published WordPress content into pgvector
npm run test:data-audit # Existing assessment tests (not assistant evaluations)
```

See [README.md](README.md) for environment variables, database setup, contract checks, and deployment workflows. Assistant evaluations are planned in #10.

## Architecture

This is John Serra's personal portfolio site built with **Next.js 16 App Router**, TypeScript (strict mode), Tailwind CSS v4, Supabase, and Google Gemini. The canonical current architecture is [docs/digital-twin-architecture.md](docs/digital-twin-architecture.md).

### Content Layer
`src/lib/site-content.ts` selects WordPress when `CONTENT_SOURCE=wordpress`; otherwise it uses the retained locale-organized Markdown/MDX content through `src/lib/content.ts`. Preserve `transformObsidianLinks()` in filesystem content processing. WordPress has a separate REST/HTML adapter in `src/lib/wordpress/`. Recipes are blog posts, and project routes use `projects`.

### AI Chat Widget
`AIChatWidget.tsx` lazy-loads `AIChatPanel.tsx` on the homepage. `src/app/api/chat/route.ts` embeds the latest message using Gemini, retrieves locale-filtered pgvector matches via `match_career_context`, and streams Gemini text with a first-person persona prompt. History lives in panel state. Chat does not read live MDX or use the legacy full-text index. Persona/grounding improvements are tracked in #20.

### Supabase
Apply `supabase-schema.sql`, then `supabase/migrations/00001_wordpress_vector_queue.sql`:
- `career_context` — RAG chunks, 768-dimensional Gemini vectors, and WordPress metadata; populated by the indexing queue and `npm run seed`
- `contact_messages` — stores contact form submissions; RLS enabled, accessible only via service role key
- `content_indexing_failures` and the `pgmq` queue — failed jobs and durable indexing work

Client setup is in `src/lib/supabase.ts` with separate anon/service-role clients.

### API Routes
- `POST /api/chat` — raw streaming `text/plain` response, not Server-Sent Events
- `POST /api/contact` — validates form input, stores to Supabase, sends email via Resend, optionally syncs Jetpack CRM
- `POST /api/data-audit` — assessment submission and optional email/CRM integration
- `POST /api/revalidate/wordpress` — signed cache invalidation and indexing enqueue
- `GET /api/cron/process-content-indexing` and `GET /api/cron/keep-alive` — bearer-protected scheduled work
- `GET` / `DELETE /api/preview/wordpress` — signed draft-preview entry / exit

### Bento Grid
Homepage (`src/app/[locale]/page.tsx`) uses a bento-style grid assembled from components in `src/components/bento/`. Static site constants live in `src/lib/constants.ts`; CMS-backed content uses the site-content adapter.

### Path Alias
`@/*` maps to `./src/*` (configured in `tsconfig.json`).

## Key Conventions
- Use TypeScript interfaces for all data structures — see `src/types/index.ts` for existing types
- React Compiler is enabled (`next.config.ts`) — no need to manually memoize
- `transformObsidianLinks` must be applied whenever content is processed

## Gotchas (Editorial Terminal redesign, 2026-07-11)

- **Font tokens referencing next/font variables MUST be in `@theme inline`** in globals.css. Plain `@theme` computes `var(--font-*)` at `:root`, where next/font's body-scoped variables are invisible — fonts silently fall back.
- **Vercel project is git-connected to `main`** (git-main domain exists). `git push origin main` = automatic PRODUCTION deploy. Preview = `vercel deploy` (CLI, no git) only.
- **Turbopack dev server serves fonts-only CSS, dropping globals.css output** (even after `.next` wipe) on this machine. Production build is correct. If the site looks unstyled in `next dev`, verify with `bun run build && bun run start` before debugging CSS.
- Design tokens: `bg-ground/-2/-3`, `bg-panel/-2`, `text-ink/-soft`, `text-muted/faint`, `accent` system, `border-hair/line/line-strong`, `rounded-card/field/pill`, `font-display` (Barlow Condensed). Dark-only — never reintroduce `dark:` variants.
