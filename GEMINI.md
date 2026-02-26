# Gemini Context: John Serra's Personal Site

This project is the personal website and portfolio for John Serra, built with Next.js, TypeScript, and Tailwind CSS. It serves as a digital hub for his career, writing, and cooking.

## Tech Stack
- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4 (with Typography plugin)
- **Database/Auth:** Supabase
- **AI:** Anthropic Claude (via Claude SDK)
- **Email:** Resend
- **Content:** Markdown/MDX with `next-mdx-remote` and `gray-matter`

## Project Structure
- `src/app/`: Next.js App Router pages and API routes.
- `src/components/`: Reusable React components (UI, layout, bento-style widgets).
- `src/lib/`: Core logic, including content fetching (`content.ts`) and Supabase clients (`supabase.ts`).
- `content/`: Markdown files for blog posts, portfolio items, and recipes.
- `scripts/`: Utility scripts, such as `seed-knowledge-base.ts` for populating the RAG system.
- `supabase-schema.sql`: Database schema for contact messages and career context.

## Key Features & Conventions
### 1. MDX Content Management
Content is stored in the `content/` directory and categorized into `blog`, `portfolio`, `about`, and `recipes`. 
- **Obsidian Support:** The system supports Obsidian-style `[[wiki links]]` via `transformObsidianLinks` in `src/lib/content.ts`.
- **Recipe Metadata:** Recipes include custom frontmatter such as `cuisine`, `servings`, `prepTime`, etc.

### 2. AI Chat Assistant
A RAG (Retrieval-Augmented Generation) powered chat widget (`AIChatWidget.tsx`) allows users to "talk to John."
- **API Route:** `src/app/api/chat/route.ts` handles the integration with Claude.
- **RAG System:** It pulls context from `career_context` (Supabase) and site content (MDX) to answer questions in John's voice.
- **Seeding:** Run `npm run seed` to populate the career context table in Supabase.

### 3. Bento Grid UI
The homepage uses a bento-style layout (`src/components/bento/`) to showcase different sections of the site.

## Development Commands
- `npm run dev`: Start the development server.
- `npm run build`: Build the production application.
- `npm run lint`: Run ESLint.
- `npm run seed`: Seed the Supabase database with career context for the AI assistant.

## Coding Standards
- **Strict Typing:** Always use TypeScript interfaces for data structures (see `src/types/index.ts`).
- **Surgical Updates:** When modifying content processing, ensure `transformObsidianLinks` is respected.
- **AI Context:** When updating the AI assistant, ensure the `systemPrompt` in the chat route remains aligned with John's persona.
