-- Rolling compatibility for table-aware WordPress chunking.
-- Keep v1 accepted until the application is deployed and the full WordPress corpus is reindexed.
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
      or coalesce(
        jsonb_typeof(chunk_metadata->'chunking_config') = 'string'
        and chunk_metadata->>'chunking_config' in ('structure-aware-v1', 'structure-aware-v2'),
        false
      ) is not true
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

revoke all on function public.replace_wordpress_context(bigint, text, text, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.replace_wordpress_context(bigint, text, text, text, timestamptz, jsonb) to service_role;
