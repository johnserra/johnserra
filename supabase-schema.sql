-- ============================================================
-- johnserra.com — Supabase Schema
-- Run this in your Supabase project's SQL Editor.
-- ============================================================

-- 1. Contact messages ----------------------------------------
create table if not exists public.contact_messages (
  id          bigint generated always as identity primary key,
  name        text        not null,
  email       text        not null,
  message     text        not null,
  created_at  timestamptz not null default now()
);

-- Only the service role can read/write contact messages.
alter table public.contact_messages enable row level security;

-- (No public policy — accessed exclusively via service role key
--  in the /api/contact API route.)


-- 2. Career context (RAG knowledge base) ---------------------
create table if not exists public.career_context (
  id           bigint generated always as identity primary key,
  source       text        not null,   -- e.g. "portfolio/cny-market-development"
  chunk_index  int         not null,
  content      text        not null,
  metadata     jsonb       default '{}'::jsonb,
  created_at   timestamptz not null default now(),

  unique (source, chunk_index)
);

-- Full-text search index (used immediately by the chat route)
create index if not exists career_context_content_fts
  on public.career_context
  using gin (to_tsvector('english', content));

-- Only the service role can read/write career context.
alter table public.career_context enable row level security;


-- 3. WordPress vector search and indexing queue ----------------
-- Apply supabase/migrations/00001_wordpress_vector_queue.sql after this
-- base schema. It adds:
--   - pgvector with 768-dimensional Gemini embeddings
--   - locale/status-aware match_career_context RPC
--   - durable pgmq content_indexing queue and service-role RPCs
--   - WordPress identity and embedding-version metadata
-- Apply supabase/migrations/00002_cv_knowledge.sql only after deploying the
-- code-first, CV-aware worker that tolerates the migration being absent. It adds
-- the reviewed CV schema, atomic replacement, and separately named filtered
-- retrieval without changing the four-argument RPC. Its contract-version RPC
-- proves SQL availability only; it does not identify the deployed app version.
