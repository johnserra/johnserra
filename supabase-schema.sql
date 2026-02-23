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


-- ============================================================
-- OPTIONAL: pgvector for semantic similarity search
-- Enable this once you're ready to add embedding-based search.
-- ============================================================
--
-- 1. Enable the extension (Settings → Extensions → vector):
--    create extension if not exists vector;
--
-- 2. Add an embedding column:
--    alter table public.career_context
--      add column if not exists embedding vector(1536);
--
-- 3. Create an HNSW index for fast ANN search:
--    create index if not exists career_context_embedding_idx
--      on public.career_context
--      using hnsw (embedding vector_cosine_ops);
--
-- 4. Add the match function used by the chat route:
--    create or replace function match_career_context (
--      query_embedding  vector(1536),
--      match_threshold  float   default 0.7,
--      match_count      int     default 4
--    )
--    returns table (source text, content text, similarity float)
--    language sql stable
--    as $$
--      select source, content,
--             1 - (embedding <=> query_embedding) as similarity
--      from   public.career_context
--      where  1 - (embedding <=> query_embedding) > match_threshold
--      order  by similarity desc
--      limit  match_count;
--    $$;
