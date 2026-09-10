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
- `src/components/`: Reusable React components (UI, layout, bento-style widgets).
- `src/lib/`: Core logic, including the shared chat path (`chat/`), content-source switch (`site-content.ts`), WordPress adapter, knowledge indexing/embeddings, and Supabase clients (`supabase.ts`).
- `content/`: Retained locale-organized Markdown/MDX content for filesystem rendering and import.
- `scripts/`: Utility scripts, such as `seed-knowledge-base.ts` for populating the RAG system.
- `supabase-schema.sql`: Database schema for contact messages and career context.
- `supabase/migrations/00001_wordpress_vector_queue.sql`: Required vector, retrieval RPC, and durable queue migration; apply after the base schema.

## Key Features & Conventions
### 1. Content Management
`src/lib/site-content.ts` selects WordPress or filesystem page reads. Projects use the `projects` routes. Do not restore or create cooking/recipe content for this site. WordPress publishing sends signed cache-invalidation/indexing events. Preserve Obsidian-style `[[wiki links]]` transformation in the filesystem adapter.

### 2. AI Chat Assistant
A RAG (Retrieval-Augmented Generation) powered chat widget (`AIChatWidget.tsx`) allows users to "talk to John."
- **API Route:** `src/app/api/chat/route.ts` streams `gemini-2.5-flash` as raw text, not SSE.
- **RAG System:** `gemini-embedding-2` creates a 768-dimensional query vector; `match_career_context` retrieves up to six published, locale-matching chunks at similarity threshold 0.65. No live MDX lookup or full-text search is used by chat.
- **History:** `AIChatPanel.tsx` keeps messages in React state and sends the history each turn, while retrieval uses only the latest message. No model-selected tools or verification agent exist yet.
- **Seeding:** `npm run seed` enqueues and indexes published WordPress posts, pages, and projects in both locales. Chat/indexing are independent of the page-content switch.

### 3. Bento Grid UI
The homepage uses a bento-style layout (`src/components/bento/`) to showcase different sections of the site.

## Development Commands
- `npm run dev`: Start the development server.
- `npm run build`: Build the production application.
- `npm run lint`: Run ESLint.
- `npm run seed`: Index published WordPress knowledge into Supabase (writes data and calls Gemini embeddings).
- `npm run test:data-audit`: Run existing assessment tests.
- `npm run eval:assistant:validate`: Validate assistant cases and public evidence offline.
- `npm run test:assistant`: Run offline shared-chat and evaluation harness tests. See [evals/assistant/README.md](evals/assistant/README.md); a live dated baseline report is still pending.

## Coding Standards
- **Strict Typing:** Always use TypeScript interfaces for data structures (see `src/types/index.ts`).
- **Surgical Updates:** When modifying content processing, ensure `transformObsidianLinks` is respected.
- **AI Context:** When updating the AI assistant, ensure the `systemPrompt` in the chat route remains aligned with John's persona.
