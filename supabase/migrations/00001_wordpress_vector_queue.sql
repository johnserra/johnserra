-- Headless WordPress RAG storage and durable indexing queue.
-- Safe to run after the original supabase-schema.sql.

create schema if not exists extensions;
create extension if not exists vector with schema extensions;
create extension if not exists pgmq cascade;

alter table public.career_context
  add column if not exists wordpress_id bigint,
  add column if not exists locale text,
  add column if not exists content_type text,
  add column if not exists slug text,
  add column if not exists title text,
  add column if not exists publication_status text not null default 'publish',
  add column if not exists wordpress_modified_at timestamptz,
  add column if not exists embedding extensions.vector(768),
  add column if not exists embedding_model text,
  add column if not exists embedding_dimensions integer,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'career_context_locale_check'
      and conrelid = 'public.career_context'::regclass
  ) then
    alter table public.career_context
      add constraint career_context_locale_check
      check (locale is null or locale in ('en', 'tr'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'career_context_embedding_dimensions_check'
      and conrelid = 'public.career_context'::regclass
  ) then
    alter table public.career_context
      add constraint career_context_embedding_dimensions_check
      check (
        (embedding is null and embedding_dimensions is null)
        or (embedding is not null and embedding_dimensions = 768)
      );
  end if;
end;
$$;

create index if not exists career_context_embedding_hnsw
  on public.career_context
  using hnsw (embedding extensions.vector_cosine_ops)
  where embedding is not null;

create index if not exists career_context_wordpress_lookup
  on public.career_context (wordpress_id, locale, chunk_index)
  where wordpress_id is not null;

create table if not exists public.content_indexing_failures (
  id bigint generated always as identity primary key,
  queue_message_id bigint not null,
  job jsonb not null,
  error_message text not null,
  failed_at timestamptz not null default now()
);

alter table public.content_indexing_failures enable row level security;

create or replace function public.set_career_context_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists career_context_set_updated_at on public.career_context;
create trigger career_context_set_updated_at
before update on public.career_context
for each row execute function public.set_career_context_updated_at();

create or replace function public.match_career_context(
  query_embedding extensions.vector(768),
  query_locale text,
  match_threshold double precision default 0.65,
  match_count integer default 6
)
returns table (
  id bigint,
  source text,
  content text,
  metadata jsonb,
  similarity double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    candidate.id,
    candidate.source,
    candidate.content,
    candidate.metadata,
    candidate.similarity
  from (
    select
      context.id,
      context.source,
      context.content,
      context.metadata,
      1 - (context.embedding <=> query_embedding) as similarity
    from public.career_context as context
    where context.embedding is not null
      and context.publication_status = 'publish'
      and context.locale = query_locale
  ) as candidate
  where candidate.similarity >= greatest(0.0, least(1.0, match_threshold))
  order by candidate.similarity desc, candidate.id asc
  limit greatest(1, least(20, match_count));
$$;

revoke all on function public.match_career_context(extensions.vector, text, double precision, integer) from public;
revoke all on function public.match_career_context(extensions.vector, text, double precision, integer) from anon;
revoke all on function public.match_career_context(extensions.vector, text, double precision, integer) from authenticated;
grant execute on function public.match_career_context(extensions.vector, text, double precision, integer) to service_role;

do $$
begin
  if not exists (
    select 1
    from pgmq.list_queues()
    where queue_name = 'content_indexing'
  ) then
    perform pgmq.create('content_indexing');
  end if;
end;
$$;

create or replace function public.enqueue_content_indexing_job(job jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  message_id bigint;
begin
  if jsonb_typeof(job) <> 'object'
    or not (job ? 'wordpress_id')
    or not (job ? 'operation')
    or not (job ? 'locale') then
    raise exception 'Invalid content indexing job payload';
  end if;

  if job->>'operation' not in ('upsert', 'delete') then
    raise exception 'Unsupported content indexing operation';
  end if;

  if job->>'locale' not in ('en', 'tr') then
    raise exception 'Unsupported content locale';
  end if;

  select result
  into message_id
  from pgmq.send('content_indexing', job) as result;

  return message_id;
end;
$$;

create or replace function public.read_content_indexing_jobs(
  visibility_timeout_seconds integer default 120,
  batch_size integer default 5
)
returns table (
  msg_id bigint,
  read_ct integer,
  enqueued_at timestamptz,
  vt timestamptz,
  message jsonb
)
language sql
security definer
set search_path = ''
as $$
  select job.msg_id, job.read_ct, job.enqueued_at, job.vt, job.message
  from pgmq.read(
    'content_indexing',
    greatest(30, least(900, visibility_timeout_seconds)),
    greatest(1, least(20, batch_size))
  ) as job;
$$;

create or replace function public.archive_content_indexing_job(message_id bigint)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select pgmq.archive('content_indexing', message_id);
$$;

create or replace function public.fail_content_indexing_job(
  message_id bigint,
  job jsonb,
  error_message text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  archived boolean;
begin
  insert into public.content_indexing_failures (queue_message_id, job, error_message)
  values (message_id, job, left(error_message, 4000));

  select pgmq.archive('content_indexing', message_id) into archived;
  return archived;
end;
$$;

revoke all on function public.enqueue_content_indexing_job(jsonb) from public, anon, authenticated;
revoke all on function public.read_content_indexing_jobs(integer, integer) from public, anon, authenticated;
revoke all on function public.archive_content_indexing_job(bigint) from public, anon, authenticated;
revoke all on function public.fail_content_indexing_job(bigint, jsonb, text) from public, anon, authenticated;

grant execute on function public.enqueue_content_indexing_job(jsonb) to service_role;
grant execute on function public.read_content_indexing_jobs(integer, integer) to service_role;
grant execute on function public.archive_content_indexing_job(bigint) to service_role;
grant execute on function public.fail_content_indexing_job(bigint, jsonb, text) to service_role;
