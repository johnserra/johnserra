# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server (http://localhost:3000)
npm run build    # Production build
npm run lint     # Run ESLint
npm run seed     # Populate Supabase career_context table for RAG system
```

No test suite is configured.

## Architecture

This is John Serra's personal portfolio site built with **Next.js 16 App Router**, TypeScript (strict mode), Tailwind CSS v4, Supabase, and Anthropic Claude SDK.

### Content Layer (`content/`)
Markdown files organized into `blog/`, `portfolio/`, `about/`, and `recipes/`. Loaded and rendered via `next-mdx-remote` with `gray-matter` frontmatter parsing. All content goes through `src/lib/content.ts` which also handles transformation of Obsidian-style `[[wiki links]]` via `transformObsidianLinks()` — always preserve this transform when modifying content processing.

### AI Chat Widget
`src/components/widgets/AIChatWidget.tsx` renders a floating chat UI that streams responses from `src/app/api/chat/route.ts`. The route performs RAG by querying the `career_context` Supabase table (full-text search) plus pulling live MDX content, then calls Claude with a system prompt written in John's voice. When updating the chat route, keep the system prompt aligned with John's persona.

### Supabase
Two tables defined in `supabase-schema.sql`:
- `career_context` — RAG knowledge base, populated by `npm run seed`; uses full-text search
- `contact_messages` — stores contact form submissions; RLS enabled, accessible only via service role key

Client setup is in `src/lib/supabase.ts` with separate anon/service-role clients.

### API Routes
- `POST /api/chat` — returns a streaming `text/plain` response (Server-Sent Events) for the chat widget
- `POST /api/contact` — validates form input, stores to Supabase, sends email via Resend from the `contactform.serra.us` sender domain

### Bento Grid
Homepage (`src/app/page.tsx`) uses a bento-style grid assembled from components in `src/components/bento/`. Static content for navigation, features, and portfolio entries lives in `src/lib/constants.ts`.

### Path Alias
`@/*` maps to `./src/*` (configured in `tsconfig.json`).

## Key Conventions
- Use TypeScript interfaces for all data structures — see `src/types/index.ts` for existing types
- React Compiler is enabled (`next.config.ts`) — no need to manually memoize
- `transformObsidianLinks` must be applied whenever content is processed
