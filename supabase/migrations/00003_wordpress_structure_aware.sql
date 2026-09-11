-- Structure-aware WordPress metadata and atomic, version-ordered replacement.
-- Apply before switching to the worker that calls these RPCs. This migration
-- is additive and leaves the four-argument retrieval RPC unchanged.

alter table public.career_context
  add column if not exists authority text,
  add column if not exists section_path jsonb,
  add column if not exists indexing_config text,
  add column if not exists chunking_config text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'career_context_authority_check'
      and conrelid = 'public.career_context'::regclass
  ) then
    alter table public.career_context add constraint career_context_authority_check
      check (authority is null or authority in ('reviewed_public_cv', 'authored_post', 'project_page', 'site_page'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'career_context_section_path_check'
      and conrelid = 'public.career_context'::regclass
  ) then
    alter table public.career_context add constraint career_context_section_path_check
      check (section_path is null or jsonb_typeof(section_path) = 'array');
  end if;
end;
$$;

create table if not exists public.wordpress_context_versions (
  source text primary key,
  wordpress_id bigint not null,
  locale text not null,
  content_type text not null,
  modified_at timestamptz,
  operation text not null,
  updated_at timestamptz not null default now(),
  constraint wordpress_context_versions_identity_check check (
    wordpress_id > 0 and locale in ('en', 'tr') and content_type in ('post', 'page', 'js_project')
    and operation in ('upsert', 'delete')
  )
);

alter table public.wordpress_context_versions enable row level security;

revoke all on table public.wordpress_context_versions from public, anon, authenticated;
grant select, insert, update, delete on table public.wordpress_context_versions to service_role;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'career_context_cv_shared_metadata_check'
      and conrelid = 'public.career_context'::regclass
  ) then
    alter table public.career_context add constraint career_context_cv_shared_metadata_check
      check (document_type is distinct from 'cv' or coalesce(
        ((metadata ? 'section_path') = (metadata ? 'indexing_config'))
        and ((metadata ? 'section_path') = (metadata ? 'chunking_config'))
        and (
          not (metadata ? 'section_path')
          or (
            jsonb_typeof(metadata->'section_path') = 'array'
            and jsonb_array_length(metadata->'section_path') > 0
            and metadata->>'indexing_config' = 'cv-indexing-v1'
            and metadata->>'chunking_config' = 'cv-section-v1'
          )
        ), false));
  end if;
end;
$$;

create index if not exists career_context_wordpress_public_lookup
  on public.career_context (wordpress_id, locale, content_type, source, chunk_index)
  where document_type = 'wordpress' and visibility = 'public';

create or replace function public.replace_wordpress_context(
  wordpress_id bigint,
  wordpress_locale text,
  wordpress_content_type text,
  wordpress_source text,
  wordpress_modified_at timestamptz,
  wordpress_chunks jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  chunk jsonb;
  chunk_metadata jsonb;
  chunk_source_version timestamptz;
  existing_modified timestamptz;
  existing_operation text;
  existing_state boolean := false;
  inserted_count integer := 0;
begin
  if wordpress_id is null or wordpress_id <= 0
    or wordpress_locale is null or wordpress_locale not in ('en', 'tr')
    or wordpress_content_type is null or wordpress_content_type not in ('post', 'page', 'js_project')
    or wordpress_source is distinct from 'wordpress/' || wordpress_content_type || '/' || wordpress_id::text || '/' || wordpress_locale
    or jsonb_typeof(wordpress_chunks) is distinct from 'array'
    or jsonb_array_length(wordpress_chunks) > 100 then
    raise exception 'Invalid WordPress replacement';
  end if;

  -- Serializes replacements for one source while allowing unrelated sources to
  -- proceed concurrently. The check makes an older webhook a no-op rather than
  -- letting it overwrite a newer document version.
  perform pg_advisory_xact_lock(hashtextextended(wordpress_source, 0));
  select state.modified_at, state.operation
  into existing_modified, existing_operation
  from public.wordpress_context_versions as state
  where state.source = wordpress_source;
  existing_state := found;

  -- Rows written before this migration are the initial version only. Seed the
  -- durable state from them while holding the same source lock; an empty
  -- replacement has no rows, so it is recorded in the state table below.
  if not existing_state then
    select max(context.wordpress_modified_at), case when count(*) > 0 then 'upsert' else null end
    into existing_modified, existing_operation
    from public.career_context as context
    where context.document_type is distinct from 'cv'
      and context.source = wordpress_source
      and context.wordpress_id = replace_wordpress_context.wordpress_id
      and context.locale = wordpress_locale;
    existing_state := existing_operation is not null;
  end if;

  if existing_state and (
    (wordpress_modified_at is null and existing_modified is not null)
    or (wordpress_modified_at is not null and existing_modified is not null and wordpress_modified_at < existing_modified)
    or (wordpress_modified_at is not distinct from existing_modified
      and existing_operation = 'delete')
  ) then
    return 0;
  end if;

  -- Validate the complete replacement before deleting the current source.
  for chunk in select value from jsonb_array_elements(wordpress_chunks)
  loop
    if jsonb_typeof(chunk) is distinct from 'object'
      or chunk - array[
        'source', 'chunk_index', 'content', 'metadata', 'wordpress_id', 'locale',
        'content_type', 'slug', 'title', 'publication_status', 'embedding',
        'embedding_model', 'embedding_dimensions'
      ] <> '{}'::jsonb
      or not (chunk ?& array[
        'source', 'chunk_index', 'content', 'metadata', 'wordpress_id', 'locale',
        'content_type', 'slug', 'title', 'publication_status', 'embedding',
        'embedding_model', 'embedding_dimensions'
      ])
      or chunk->>'source' is distinct from wordpress_source
      or jsonb_typeof(chunk->'chunk_index') is distinct from 'number'
      or coalesce(chunk->>'chunk_index' ~ '^[0-9]+$', false) is not true
      or (chunk->>'chunk_index')::integer < 0
      or jsonb_typeof(chunk->'content') is distinct from 'string'
      or length(chunk->>'content') not between 1 and 2400
      or chunk->>'wordpress_id' is distinct from wordpress_id::text
      or chunk->>'locale' is distinct from wordpress_locale
      or chunk->>'content_type' is distinct from wordpress_content_type
      or jsonb_typeof(chunk->'slug') is distinct from 'string'
      or length(btrim(chunk->>'slug')) = 0
      or jsonb_typeof(chunk->'title') is distinct from 'string'
      or length(btrim(chunk->>'title')) = 0
      or chunk->>'publication_status' is distinct from 'publish'
      or chunk->>'embedding_model' is distinct from 'gemini-embedding-2'
      or chunk->'embedding_dimensions' is distinct from '768'::jsonb
      or jsonb_typeof(chunk->'embedding') is distinct from 'array'
      or jsonb_array_length(chunk->'embedding') <> 768
      or exists (
        select 1 from jsonb_array_elements(chunk->'embedding') as component
        where jsonb_typeof(component) is distinct from 'number'
      ) then
      raise exception 'Invalid WordPress replacement chunk';
    end if;

    chunk_metadata := chunk->'metadata';
    if jsonb_typeof(chunk_metadata) is distinct from 'object'
      or chunk_metadata - array[
        'event_id', 'title', 'type', 'slug', 'locale', 'wordpress_id',
        'document_type', 'canonical_url', 'authority', 'section_path',
        'indexing_config', 'chunking_config', 'source_version', 'embedding_config'
      ] <> '{}'::jsonb
      or not (chunk_metadata ?& array[
        'event_id', 'title', 'type', 'slug', 'locale', 'wordpress_id',
        'document_type', 'canonical_url', 'authority', 'section_path',
        'indexing_config', 'chunking_config', 'source_version', 'embedding_config'
      ])
      or jsonb_typeof(chunk_metadata->'event_id') is distinct from 'string'
      or jsonb_typeof(chunk_metadata->'title') is distinct from 'string'
      or length(btrim(chunk_metadata->>'title')) = 0
      or chunk_metadata->>'title' is distinct from chunk->>'title'
      or chunk_metadata->>'type' is distinct from wordpress_content_type
      or chunk_metadata->>'slug' is distinct from chunk->>'slug'
      or chunk_metadata->>'locale' is distinct from wordpress_locale
      or chunk_metadata->>'wordpress_id' is distinct from wordpress_id::text
      or chunk_metadata->>'document_type' is distinct from 'wordpress'
      or jsonb_typeof(chunk_metadata->'canonical_url') is distinct from 'string'
      or length(btrim(coalesce(chunk_metadata->>'canonical_url', ''))) = 0
      or coalesce(chunk_metadata->>'canonical_url' not like 'https://johnserra.com/%', true)
      or coalesce(chunk_metadata->>'canonical_url' like '%wp/v2%', false)
      or not coalesce((
        (wordpress_content_type = 'post' and chunk_metadata->>'canonical_url' =
          'https://johnserra.com/' || case when wordpress_locale = 'tr' then 'tr/' else '' end || 'blog/' || (chunk->>'slug'))
        or (wordpress_content_type = 'js_project' and chunk_metadata->>'canonical_url' =
          'https://johnserra.com/' || case when wordpress_locale = 'tr' then 'tr/projeler/' else 'projects/' end || (chunk->>'slug'))
        or (wordpress_content_type = 'page' and (
          chunk_metadata->>'canonical_url' =
            'https://johnserra.com/' || case when wordpress_locale = 'tr' then 'tr/' else '' end || (chunk->>'slug')
          or chunk_metadata->>'canonical_url' in (
            case when wordpress_locale = 'tr' then 'https://johnserra.com/tr/hakkimda' else 'https://johnserra.com/about' end,
            case when wordpress_locale = 'tr' then 'https://johnserra.com/tr/gizlilik-politikasi' else 'https://johnserra.com/privacy-policy' end
          )
        ))), false)
      or chunk_metadata->>'authority' is distinct from (case
        when wordpress_content_type = 'post' then 'authored_post'
        when wordpress_content_type = 'js_project' then 'project_page'
        else 'site_page'
      end)
      or jsonb_typeof(chunk_metadata->'section_path') is distinct from 'array'
      or exists (
        select 1 from jsonb_array_elements(chunk_metadata->'section_path') as path_part
        where jsonb_typeof(path_part) is distinct from 'string'
          or length(btrim(path_part #>> '{}')) = 0
      )
      or chunk_metadata->>'indexing_config' is distinct from 'wordpress-indexing-v2'
      or chunk_metadata->>'chunking_config' is distinct from 'structure-aware-v1'
      or jsonb_typeof(chunk_metadata->'source_version') not in ('string', 'null')
      or (jsonb_typeof(chunk_metadata->'source_version') = 'null' and wordpress_modified_at is not null)
      or (jsonb_typeof(chunk_metadata->'source_version') = 'string' and coalesce(chunk_metadata->>'source_version' ~ '^\d{4}-\d{2}-\d{2}T', false) is not true)
      or chunk_metadata->>'embedding_config' is distinct from 'gemini-embedding-2:768:v1' then
      raise exception 'Invalid WordPress replacement chunk';
    end if;

    if jsonb_typeof(chunk_metadata->'source_version') = 'string' then
      begin
        chunk_source_version := (chunk_metadata->>'source_version')::timestamptz;
      exception when others then
        raise exception 'Invalid WordPress replacement chunk';
      end;
      if wordpress_modified_at is null or chunk_source_version is distinct from wordpress_modified_at then
        raise exception 'Invalid WordPress replacement chunk';
      end if;
    elsif wordpress_modified_at is not null then
      raise exception 'Invalid WordPress replacement chunk';
    end if;
  end loop;

  if exists (
    select 1
    from jsonb_array_elements(wordpress_chunks) as candidate
    group by candidate->>'source', candidate->>'chunk_index'
    having count(*) > 1
  ) then
    raise exception 'Duplicate WordPress source/chunk identity';
  end if;

  insert into public.wordpress_context_versions (
    source, wordpress_id, locale, content_type, modified_at, operation
  ) values (
    wordpress_source, wordpress_id, wordpress_locale, wordpress_content_type,
    wordpress_modified_at, 'upsert'
  )
  on conflict (source) do update set
    wordpress_id = excluded.wordpress_id,
    locale = excluded.locale,
    content_type = excluded.content_type,
    modified_at = excluded.modified_at,
    operation = excluded.operation,
    updated_at = now();

  -- Deletion and insertion are one transaction. Any validation, cast, or
  -- constraint failure rolls the transaction back and preserves the old rows.
  delete from public.career_context as context
  where context.document_type is distinct from 'cv'
    and context.source = wordpress_source
    and context.wordpress_id = replace_wordpress_context.wordpress_id
    and context.locale = wordpress_locale;

  for chunk in select value from jsonb_array_elements(wordpress_chunks)
  loop
    chunk_metadata := chunk->'metadata';
    insert into public.career_context (
      source, chunk_index, content, metadata, wordpress_id, locale, content_type,
      slug, title, publication_status, wordpress_modified_at, embedding,
      embedding_model, embedding_dimensions, document_id, document_type,
      visibility, canonical_url, authority, section_path, indexing_config,
      chunking_config
    ) values (
      chunk->>'source', (chunk->>'chunk_index')::integer, chunk->>'content', chunk_metadata,
      replace_wordpress_context.wordpress_id, wordpress_locale, wordpress_content_type,
      chunk->>'slug', chunk->>'title', 'publish', wordpress_modified_at,
      (chunk->>'embedding')::extensions.vector(768), chunk->>'embedding_model', 768,
      null, 'wordpress', 'public', chunk_metadata->>'canonical_url',
      chunk_metadata->>'authority', chunk_metadata->'section_path',
      chunk_metadata->>'indexing_config', chunk_metadata->>'chunking_config'
    );
    inserted_count := inserted_count + 1;
  end loop;
  return inserted_count;
end;
$$;

create or replace function public.remove_wordpress_context(
  wordpress_id bigint,
  wordpress_locale text,
  wordpress_content_type text,
  wordpress_modified_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_modified timestamptz;
  existing_operation text;
  existing_state boolean := false;
  deleted_count integer := 0;
begin
  if wordpress_id is null or wordpress_id <= 0
    or wordpress_locale is null or wordpress_locale not in ('en', 'tr')
    or wordpress_content_type is null or wordpress_content_type not in ('post', 'page', 'js_project') then
    raise exception 'Invalid WordPress removal';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'wordpress/' || wordpress_content_type || '/' || wordpress_id::text || '/' || wordpress_locale, 0
  ));
  select state.modified_at, state.operation
  into existing_modified, existing_operation
  from public.wordpress_context_versions as state
  where state.source = 'wordpress/' || wordpress_content_type || '/' || remove_wordpress_context.wordpress_id::text || '/' || wordpress_locale;
  existing_state := found;

  if not existing_state then
    select max(context.wordpress_modified_at), case when count(*) > 0 then 'upsert' else null end
    into existing_modified, existing_operation
    from public.career_context as context
    where context.document_type is distinct from 'cv'
      and context.source = 'wordpress/' || wordpress_content_type || '/' || remove_wordpress_context.wordpress_id::text || '/' || wordpress_locale
      and context.wordpress_id = remove_wordpress_context.wordpress_id
      and context.content_type = wordpress_content_type
      and context.locale = wordpress_locale;
    existing_state := existing_operation is not null;
  end if;

  if existing_state and (
    (wordpress_modified_at is null and existing_modified is not null)
    or (wordpress_modified_at is not null and existing_modified is not null and wordpress_modified_at < existing_modified)
    or (wordpress_modified_at is not distinct from existing_modified
      and existing_operation = 'delete')
  ) then
    return 0;
  end if;

  insert into public.wordpress_context_versions (
    source, wordpress_id, locale, content_type, modified_at, operation
  ) values (
    'wordpress/' || wordpress_content_type || '/' || remove_wordpress_context.wordpress_id::text || '/' || wordpress_locale,
    wordpress_id, wordpress_locale, wordpress_content_type, wordpress_modified_at, 'delete'
  )
  on conflict (source) do update set
    wordpress_id = excluded.wordpress_id,
    locale = excluded.locale,
    content_type = excluded.content_type,
    modified_at = excluded.modified_at,
    operation = excluded.operation,
    updated_at = now();

  delete from public.career_context as context
  where context.document_type is distinct from 'cv'
    and context.source = 'wordpress/' || wordpress_content_type || '/' || remove_wordpress_context.wordpress_id::text || '/' || wordpress_locale
    and context.wordpress_id = remove_wordpress_context.wordpress_id
    and context.content_type = wordpress_content_type
    and context.locale = wordpress_locale;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.replace_wordpress_context(bigint, text, text, text, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.remove_wordpress_context(bigint, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.replace_wordpress_context(bigint, text, text, text, timestamptz, jsonb) to service_role;
grant execute on function public.remove_wordpress_context(bigint, text, text, timestamptz) to service_role;

-- Extend the strict CV contract without changing its signature. The legacy
-- implementation is retained under a private name so old CV workers that send
-- the 00002 metadata shape continue to work; the new fields are validated and
-- merged back into the inserted rows for new workers.
do $$
begin
  if to_regprocedure('public.replace_cv_context(text,text,text,jsonb)') is not null
    and to_regprocedure('public.replace_cv_context_legacy(text,text,text,jsonb)') is null then
    alter function public.replace_cv_context(text, text, text, jsonb)
      rename to replace_cv_context_legacy;
  end if;
end;
$$;

create or replace function public.replace_cv_context(
  cv_document_id text,
  cv_locale text,
  cv_content_sha256 text,
  cv_chunks jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  chunk jsonb;
  chunk_metadata jsonb;
  legacy_chunks jsonb;
begin
  -- Preserve the complete 00002 validation and transaction behavior by
  -- delegating the original payload (with only the additive fields removed)
  -- to the renamed implementation.
  if jsonb_typeof(cv_chunks) is distinct from 'array' then
    return public.replace_cv_context_legacy(cv_document_id, cv_locale, cv_content_sha256, cv_chunks);
  end if;

  for chunk in select value from jsonb_array_elements(cv_chunks)
  loop
    if jsonb_typeof(chunk) = 'object' then
      chunk_metadata := chunk->'metadata';
      if jsonb_typeof(chunk_metadata) = 'object'
        and (
          (chunk_metadata ? 'section_path')
          or (chunk_metadata ? 'indexing_config')
          or (chunk_metadata ? 'chunking_config')
        ) then
        if not (chunk_metadata ?& array['section_path', 'indexing_config', 'chunking_config'])
          or jsonb_typeof(chunk_metadata->'section_path') is distinct from 'array'
          or jsonb_array_length(chunk_metadata->'section_path') = 0
          or exists (
            select 1 from jsonb_array_elements(chunk_metadata->'section_path') as path_part
            where jsonb_typeof(path_part) is distinct from 'string'
              or length(btrim(path_part #>> '{}')) = 0
          )
          or jsonb_typeof(chunk_metadata->'indexing_config') is distinct from 'string'
          or chunk_metadata->>'indexing_config' is distinct from 'cv-indexing-v1'
          or jsonb_typeof(chunk_metadata->'chunking_config') is distinct from 'string'
          or chunk_metadata->>'chunking_config' is distinct from 'cv-section-v1' then
          raise exception 'Invalid CV replacement chunk';
        end if;
      elsif jsonb_typeof(chunk_metadata) = 'object' then
        -- The absence of all additive fields is the backward-compatible 00002
        -- shape accepted from an already-running old worker.
        null;
      end if;
    end if;
  end loop;

  select coalesce(jsonb_agg(
    jsonb_set(
      value,
      '{metadata}',
      case when jsonb_typeof(value->'metadata') = 'object'
        then (value->'metadata') - array['section_path', 'indexing_config', 'chunking_config']
        else value->'metadata'
      end
    )
  ), '[]'::jsonb)
  into legacy_chunks
  from jsonb_array_elements(cv_chunks);

  perform public.replace_cv_context_legacy(cv_document_id, cv_locale, cv_content_sha256, legacy_chunks);

  -- The legacy function has already validated and atomically inserted the
  -- complete document. Merge additive metadata only after that succeeds; any
  -- failure still rolls back the whole function transaction.
  for chunk in select value from jsonb_array_elements(cv_chunks)
  loop
    chunk_metadata := chunk->'metadata';
    if jsonb_typeof(chunk_metadata) = 'object'
      and chunk_metadata ?& array['section_path', 'indexing_config', 'chunking_config'] then
      update public.career_context
      set metadata = chunk_metadata,
          authority = chunk_metadata->>'authority',
          section_path = chunk_metadata->'section_path',
          indexing_config = chunk_metadata->>'indexing_config',
          chunking_config = chunk_metadata->>'chunking_config'
      where document_type = 'cv'
        and document_id = cv_document_id
        and locale = cv_locale
        and source = chunk->>'source';
    end if;
  end loop;

  return jsonb_array_length(cv_chunks);
end;
$$;

revoke all on function public.replace_cv_context_legacy(text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.replace_cv_context(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.replace_cv_context(text, text, text, jsonb) to service_role;
