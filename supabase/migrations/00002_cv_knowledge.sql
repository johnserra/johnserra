-- Reviewed public CV knowledge source, strict queue validation, and filtered retrieval.
-- Apply only after application code that understands CV queue jobs is deployed.

alter table public.career_context
  add column if not exists document_id text,
  add column if not exists document_type text,
  add column if not exists organization text,
  add column if not exists role text,
  add column if not exists visibility text not null default 'public',
  add column if not exists canonical_url text,
  add column if not exists content_sha256 text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'career_context_document_type_check'
      and conrelid = 'public.career_context'::regclass
  ) then
    alter table public.career_context add constraint career_context_document_type_check
      check (document_type is null or document_type in ('wordpress', 'cv'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'career_context_visibility_check'
      and conrelid = 'public.career_context'::regclass
  ) then
    alter table public.career_context add constraint career_context_visibility_check
      check (visibility = 'public');
  end if;
  alter table public.career_context
    drop constraint if exists career_context_cv_shape_check;
  alter table public.career_context add constraint career_context_cv_shape_check check (
    document_type is distinct from 'cv' or coalesce((
        document_id = 'john-serra'
        and wordpress_id is null
        and locale = 'en'
        and chunk_index = 0
        and length(content) between 1 and 4000
        and publication_status = 'publish'
        and visibility = 'public'
        and canonical_url = 'https://johnserra.com/cv/john-serra.en.md'
        and content_sha256 ~ '^[a-f0-9]{64}$'
        and source ~ '^cv/john-serra/en/[a-z0-9]+(?:-[a-z0-9]+)*$'
        and embedding is not null
        and embedding_model = 'gemini-embedding-2'
        and embedding_dimensions = 768
        and jsonb_typeof(metadata) = 'object'
        and metadata ?& array[
          'document_id', 'section_id', 'title', 'organization', 'role', 'dates',
          'locale', 'source_locale', 'visibility', 'document_type', 'authority',
          'canonical_url', 'content_sha256', 'embedding_config'
        ]
        and metadata->>'document_id' = document_id
        and metadata->>'section_id' ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
        and length(metadata->>'section_id') <= 100
        and source = 'cv/john-serra/en/' || (metadata->>'section_id')
        and jsonb_typeof(metadata->'title') = 'string'
        and length(btrim(metadata->>'title')) > 0
        and metadata->>'title' = title
        and jsonb_typeof(metadata->'organization') in ('string', 'null')
        and (jsonb_typeof(metadata->'organization') = 'null' or length(btrim(metadata->>'organization')) > 0)
        and metadata->>'organization' is not distinct from organization
        and jsonb_typeof(metadata->'role') in ('string', 'null')
        and (jsonb_typeof(metadata->'role') = 'null' or length(btrim(metadata->>'role')) > 0)
        and metadata->>'role' is not distinct from role
        and jsonb_typeof(metadata->'dates') = 'object'
        and metadata->>'locale' = locale
        and metadata->>'source_locale' = 'en'
        and metadata->>'visibility' = visibility
        and metadata->>'document_type' = document_type
        and metadata->>'authority' = 'reviewed_public_cv'
        and metadata->>'canonical_url' = canonical_url
        and metadata->>'content_sha256' = content_sha256
        and metadata->>'embedding_config' = 'gemini-embedding-2:768:v1'
      ), false)
  );
end;
$$;

create index if not exists career_context_cv_lookup
  on public.career_context (document_id, locale, source, chunk_index)
  where document_type = 'cv' and visibility = 'public';

create index if not exists career_context_public_filtering
  on public.career_context (visibility, document_type, organization, role, locale);

create or replace function public.cv_indexing_contract_version()
returns integer
language sql
stable
security definer
set search_path = ''
as $$ select 1; $$;

revoke all on function public.cv_indexing_contract_version() from public, anon, authenticated;
grant execute on function public.cv_indexing_contract_version() to service_role;

-- Replaces the v1 function without changing its signature. WordPress validation
-- remains in force; CV jobs have a separate exact-key, fixed-source contract.
create or replace function public.enqueue_content_indexing_job(job jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  message_id bigint;
begin
  if jsonb_typeof(job) is distinct from 'object' then
    raise exception 'Invalid content indexing job payload';
  end if;

  if job ? 'document_type'
    and job->>'document_type' is distinct from 'cv'
    and job->>'document_type' is distinct from 'wordpress' then
    raise exception 'Unsupported content document type';
  end if;

  if job->>'document_type' = 'cv' then
    if job - array['event_id', 'document_type', 'cv_id', 'locale', 'operation', 'content_sha256'] <> '{}'::jsonb
      or not (job ?& array['event_id', 'document_type', 'cv_id', 'locale', 'operation', 'content_sha256'])
      or jsonb_typeof(job->'event_id') is distinct from 'string'
      or jsonb_typeof(job->'document_type') is distinct from 'string'
      or jsonb_typeof(job->'cv_id') is distinct from 'string'
      or jsonb_typeof(job->'locale') is distinct from 'string'
      or jsonb_typeof(job->'operation') is distinct from 'string'
      or jsonb_typeof(job->'content_sha256') is distinct from 'string'
      or coalesce(job->>'event_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', false) is not true
      or job->>'document_type' is distinct from 'cv'
      or job->>'cv_id' is distinct from 'john-serra'
      or job->>'locale' is distinct from 'en'
      or coalesce(job->>'operation' in ('upsert', 'delete'), false) is not true
      or coalesce(job->>'content_sha256' ~ '^[a-f0-9]{64}$', false) is not true then
      raise exception 'Invalid registered CV indexing job';
    end if;
  else
    if not (job ?& array['wordpress_id', 'operation', 'locale'])
      or jsonb_typeof(job->'wordpress_id') is distinct from 'number'
      or jsonb_typeof(job->'operation') is distinct from 'string'
      or jsonb_typeof(job->'locale') is distinct from 'string'
      or coalesce(job->>'wordpress_id' ~ '^[1-9][0-9]*$', false) is not true then
      raise exception 'Invalid content indexing job payload';
    end if;
    if job->>'operation' not in ('upsert', 'delete') then
      raise exception 'Unsupported content indexing operation';
    end if;
    if job->>'locale' not in ('en', 'tr') then
      raise exception 'Unsupported content locale';
    end if;
  end if;

  select result into message_id
  from pgmq.send('content_indexing', job) as result;
  return message_id;
end;
$$;

revoke all on function public.enqueue_content_indexing_job(jsonb) from public, anon, authenticated;
grant execute on function public.enqueue_content_indexing_job(jsonb) to service_role;

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
  chunk_dates jsonb;
  date_start jsonb;
  date_end jsonb;
  inserted_count integer := 0;
begin
  if cv_document_id is distinct from 'john-serra'
    or cv_locale is distinct from 'en'
    or coalesce(cv_content_sha256 ~ '^[a-f0-9]{64}$', false) is not true then
    raise exception 'Invalid registered CV replacement';
  end if;

  if jsonb_typeof(cv_chunks) is distinct from 'array' then
    raise exception 'Invalid registered CV replacement';
  end if;

  if jsonb_array_length(cv_chunks) > 50 then
    raise exception 'Invalid registered CV replacement';
  end if;

  -- Validate the complete replacement before deleting the currently indexed CV.
  for chunk in select value from jsonb_array_elements(cv_chunks)
  loop
    if jsonb_typeof(chunk) is distinct from 'object' then
      raise exception 'Invalid CV replacement chunk';
    end if;

    if chunk - array['source', 'chunk_index', 'content', 'metadata', 'embedding', 'embedding_model', 'embedding_dimensions'] <> '{}'::jsonb
      or not (chunk ?& array['source', 'chunk_index', 'content', 'metadata', 'embedding', 'embedding_model', 'embedding_dimensions'])
      or jsonb_typeof(chunk->'source') is distinct from 'string'
      or chunk->'chunk_index' is distinct from '0'::jsonb
      or jsonb_typeof(chunk->'content') is distinct from 'string'
      or length(chunk->>'content') not between 1 and 4000
      or jsonb_typeof(chunk->'metadata') is distinct from 'object'
      or chunk->>'embedding_model' is distinct from 'gemini-embedding-2'
      or chunk->'embedding_dimensions' is distinct from '768'::jsonb then
      raise exception 'Invalid CV replacement chunk';
    end if;

    if jsonb_typeof(chunk->'embedding') is distinct from 'array'
      or jsonb_array_length(chunk->'embedding') <> 768
      or exists (
        select 1 from jsonb_array_elements(chunk->'embedding') as component
        where jsonb_typeof(component) is distinct from 'number'
      ) then
      raise exception 'Invalid CV replacement chunk';
    end if;

    chunk_metadata := chunk->'metadata';
    if chunk_metadata - array['document_id', 'section_id', 'title', 'organization', 'role', 'dates', 'locale', 'source_locale', 'visibility', 'document_type', 'authority', 'canonical_url', 'content_sha256', 'embedding_config'] <> '{}'::jsonb
      or not (chunk_metadata ?& array[
        'document_id', 'section_id', 'title', 'organization', 'role', 'dates',
        'locale', 'source_locale', 'visibility', 'document_type', 'authority',
        'canonical_url', 'content_sha256', 'embedding_config'
      ])
      or jsonb_typeof(chunk_metadata->'document_id') is distinct from 'string'
      or jsonb_typeof(chunk_metadata->'section_id') is distinct from 'string'
      or jsonb_typeof(chunk_metadata->'title') is distinct from 'string'
      or jsonb_typeof(chunk_metadata->'organization') not in ('string', 'null')
      or jsonb_typeof(chunk_metadata->'role') not in ('string', 'null')
      or jsonb_typeof(chunk_metadata->'dates') is distinct from 'object'
      or jsonb_typeof(chunk_metadata->'locale') is distinct from 'string'
      or jsonb_typeof(chunk_metadata->'source_locale') is distinct from 'string'
      or jsonb_typeof(chunk_metadata->'visibility') is distinct from 'string'
      or jsonb_typeof(chunk_metadata->'document_type') is distinct from 'string'
      or jsonb_typeof(chunk_metadata->'authority') is distinct from 'string'
      or jsonb_typeof(chunk_metadata->'canonical_url') is distinct from 'string'
      or jsonb_typeof(chunk_metadata->'content_sha256') is distinct from 'string'
      or jsonb_typeof(chunk_metadata->'embedding_config') is distinct from 'string'
      or chunk_metadata->>'document_id' is distinct from cv_document_id
      or coalesce(chunk_metadata->>'section_id' ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$', false) is not true
      or length(chunk_metadata->>'section_id') > 100
      or chunk->>'source' is distinct from 'cv/john-serra/en/' || (chunk_metadata->>'section_id')
      or length(btrim(chunk_metadata->>'title')) = 0
      or (jsonb_typeof(chunk_metadata->'organization') = 'string' and length(btrim(chunk_metadata->>'organization')) = 0)
      or (jsonb_typeof(chunk_metadata->'role') = 'string' and length(btrim(chunk_metadata->>'role')) = 0)
      or chunk_metadata->>'locale' is distinct from cv_locale
      or chunk_metadata->>'source_locale' is distinct from 'en'
      or chunk_metadata->>'visibility' is distinct from 'public'
      or chunk_metadata->>'document_type' is distinct from 'cv'
      or chunk_metadata->>'authority' is distinct from 'reviewed_public_cv'
      or chunk_metadata->>'canonical_url' is distinct from 'https://johnserra.com/cv/john-serra.en.md'
      or chunk_metadata->>'content_sha256' is distinct from cv_content_sha256
      or chunk_metadata->>'embedding_config' is distinct from 'gemini-embedding-2:768:v1' then
      raise exception 'Invalid CV replacement chunk';
    end if;

    chunk_dates := chunk_metadata->'dates';
    if chunk_dates - array['kind', 'start', 'end', 'ongoing', 'start_unknown', 'end_unknown'] <> '{}'::jsonb
      or not (chunk_dates ?& array['kind', 'start', 'end', 'ongoing', 'start_unknown', 'end_unknown'])
      or jsonb_typeof(chunk_dates->'kind') is distinct from 'string'
      or coalesce(chunk_dates->>'kind' in ('interval', 'issued', 'undated'), false) is not true
      or jsonb_typeof(chunk_dates->'ongoing') is distinct from 'boolean'
      or jsonb_typeof(chunk_dates->'start_unknown') is distinct from 'boolean'
      or jsonb_typeof(chunk_dates->'end_unknown') is distinct from 'boolean'
      or jsonb_typeof(chunk_dates->'start') not in ('object', 'null')
      or jsonb_typeof(chunk_dates->'end') not in ('object', 'null') then
      raise exception 'Invalid CV replacement chunk';
    end if;

    date_start := chunk_dates->'start';
    date_end := chunk_dates->'end';
    if (jsonb_typeof(date_start) = 'object' and (
        date_start - array['value', 'precision'] <> '{}'::jsonb
        or not (date_start ?& array['value', 'precision'])
        or jsonb_typeof(date_start->'value') is distinct from 'string'
        or coalesce(date_start->>'value' ~ '^\d{4}-(?:0[1-9]|1[0-2])$', false) is not true
        or jsonb_typeof(date_start->'precision') is distinct from 'string'
        or coalesce(date_start->>'precision' in ('month', 'documented_from'), false) is not true
      ))
      or (jsonb_typeof(date_end) = 'object' and (
        date_end - array['value', 'precision'] <> '{}'::jsonb
        or not (date_end ?& array['value', 'precision'])
        or jsonb_typeof(date_end->'value') is distinct from 'string'
        or coalesce(date_end->>'value' ~ '^\d{4}-(?:0[1-9]|1[0-2])$', false) is not true
        or jsonb_typeof(date_end->'precision') is distinct from 'string'
        or coalesce(date_end->>'precision' in ('month', 'documented_from'), false) is not true
      )) then
      raise exception 'Invalid CV replacement chunk';
    end if;

    if (chunk_dates->>'kind' = 'undated' and not (
        date_start = 'null'::jsonb and date_end = 'null'::jsonb
        and (chunk_dates->>'ongoing')::boolean = false
        and (chunk_dates->>'start_unknown')::boolean = true
        and (chunk_dates->>'end_unknown')::boolean = true
      ))
      or (chunk_dates->>'kind' = 'issued' and not (
        jsonb_typeof(date_start) = 'object' and date_end = 'null'::jsonb
        and (chunk_dates->>'ongoing')::boolean = false
        and (chunk_dates->>'start_unknown')::boolean = false
        and (chunk_dates->>'end_unknown')::boolean = false
      ))
      or (chunk_dates->>'kind' = 'interval' and not (
        (chunk_dates->>'start_unknown')::boolean = (date_start = 'null'::jsonb)
        and (
          ((chunk_dates->>'ongoing')::boolean = true
            and date_end = 'null'::jsonb
            and (chunk_dates->>'end_unknown')::boolean = false)
          or ((chunk_dates->>'ongoing')::boolean = false
            and (chunk_dates->>'end_unknown')::boolean = (date_end = 'null'::jsonb))
        )
        and not (
          jsonb_typeof(date_start) = 'object'
          and jsonb_typeof(date_end) = 'object'
          and date_end->>'value' < date_start->>'value'
        )
      )) then
      raise exception 'Invalid CV replacement chunk';
    end if;
  end loop;

  if exists (
    select 1
    from jsonb_array_elements(cv_chunks) as candidate
    group by candidate->>'source', candidate->>'chunk_index'
    having count(*) > 1
  ) then
    raise exception 'Duplicate CV source/chunk identity';
  end if;

  -- Deletion and every insertion execute in this single function transaction.
  delete from public.career_context
  where document_type = 'cv' and document_id = cv_document_id and locale = cv_locale;

  for chunk in select value from jsonb_array_elements(cv_chunks)
  loop
    chunk_metadata := chunk->'metadata';
    insert into public.career_context (
      source, chunk_index, content, metadata, wordpress_id, locale, content_type,
      slug, title, publication_status, embedding, embedding_model,
      embedding_dimensions, document_id, document_type, organization, role,
      visibility, canonical_url, content_sha256
    ) values (
      chunk->>'source', 0, chunk->>'content', chunk_metadata, null, cv_locale, null,
      null, chunk_metadata->>'title', 'publish',
      (chunk->>'embedding')::extensions.vector(768), chunk->>'embedding_model', 768,
      cv_document_id, 'cv', nullif(chunk_metadata->>'organization', ''),
      nullif(chunk_metadata->>'role', ''), 'public',
      'https://johnserra.com/cv/john-serra.en.md', cv_content_sha256
    );
    inserted_count := inserted_count + 1;
  end loop;
  return inserted_count;
end;
$$;

revoke all on function public.replace_cv_context(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.replace_cv_context(text, text, text, jsonb) to service_role;

create or replace function public.match_career_context_filtered(
  query_embedding extensions.vector(768),
  query_locale text,
  match_threshold double precision default 0.65,
  match_count integer default 6,
  filter_document_type text default null,
  filter_organization text default null,
  filter_role text default null,
  filter_visibility text default 'public'
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
  with parameters as (
    select greatest(1, least(20, match_count)) as target_count
  ), eligible as (
    select
      context.id,
      context.source,
      context.content,
      context.metadata,
      coalesce(context.document_type, 'wordpress') as source_type,
      1 - (context.embedding operator(extensions.<=>) query_embedding) as similarity
    from public.career_context as context
    where context.embedding is not null
      and context.publication_status = 'publish'
      and context.visibility = 'public'
      and filter_visibility = 'public'
      and (context.locale = query_locale or (query_locale = 'tr' and context.document_type = 'cv' and context.locale = 'en'))
      and (filter_document_type is null or coalesce(context.document_type, 'wordpress') = filter_document_type)
      and (filter_organization is null or context.organization = filter_organization)
      and (filter_role is null or context.role = filter_role)
  ), thresholded as (
    select eligible.*
    from eligible
    where similarity >= greatest(0.0, least(1.0, match_threshold))
  ), source_ranked as (
    select thresholded.*,
      row_number() over (partition by source_type order by similarity desc, id asc) as source_type_rank
    from thresholded
  ), allowed as (
    select source_ranked.*, parameters.target_count
    from source_ranked cross join parameters
    where filter_document_type is not null
      or source_type <> 'cv'
      or source_type_rank <= 3
  ), selected as (
    select allowed.*,
      row_number() over (
        order by
          case
            when filter_document_type is null
              and source_type = 'cv'
              and source_type_rank <= least(2, target_count) then 0
            else 1
          end,
          similarity desc,
          id asc
      ) as selection_rank
    from allowed
  )
  select id, source, content, metadata, similarity
  from selected
  where selection_rank <= target_count
  order by similarity desc, id asc;
$$;

revoke all on function public.match_career_context_filtered(extensions.vector, text, double precision, integer, text, text, text, text) from public;
revoke all on function public.match_career_context_filtered(extensions.vector, text, double precision, integer, text, text, text, text) from anon;
revoke all on function public.match_career_context_filtered(extensions.vector, text, double precision, integer, text, text, text, text) from authenticated;
grant execute on function public.match_career_context_filtered(extensions.vector, text, double precision, integer, text, text, text, text) to service_role;
