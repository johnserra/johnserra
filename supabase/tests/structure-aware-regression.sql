-- Run only against an isolated, disposable PostgreSQL database after applying
-- supabase-schema.sql and migrations 00001, 00002, and 00003 in order.
-- Example: psql "$DISPOSABLE_DATABASE_URL" -f supabase/tests/structure-aware-regression.sql
-- This fixture mutates temporary test rows and rolls the transaction back. It
-- also runs in the embedded PostgreSQL test via npm run test:knowledge:sql.
-- Hosted Supabase and multi-session concurrency still require separate checks.
\set ON_ERROR_STOP on

begin;

create function pg_temp.zero_embedding()
returns jsonb
language sql
immutable
as $$
  select jsonb_agg(to_jsonb(0.0) order by component)
  from generate_series(1, 768) as component;
$$;

create function pg_temp.valid_wordpress_chunk(
  source_key text,
  wordpress_id bigint,
  content_type text,
  locale text,
  slug text,
  title text,
  version_text text,
  path jsonb,
  body text
)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'source', source_key,
    'chunk_index', 0,
    'content', body,
    'metadata', jsonb_build_object(
      'event_id', '00000000-0000-0000-0000-000000000001',
      'title', title,
      'type', content_type,
      'slug', slug,
      'locale', locale,
      'wordpress_id', wordpress_id,
      'document_type', 'wordpress',
      'canonical_url', 'https://johnserra.com/blog/' || slug,
      'authority', 'authored_post',
      'section_path', path,
      'indexing_config', 'wordpress-indexing-v2',
      'chunking_config', 'structure-aware-v1',
      'source_version', version_text,
      'embedding_config', 'gemini-embedding-2:768:v1'
    ),
    'wordpress_id', wordpress_id,
    'locale', locale,
    'content_type', content_type,
    'slug', slug,
    'title', title,
    'publication_status', 'publish',
    'embedding', pg_temp.zero_embedding(),
    'embedding_model', 'gemini-embedding-2',
    'embedding_dimensions', 768
  );
$$;

-- Same-timestamp deletion wins, and a later upsert cannot resurrect it.
select public.replace_wordpress_context(
  990001, 'en', 'post', 'wordpress/post/990001/en',
  '2026-09-10T10:00:00Z'::timestamptz,
  jsonb_build_array(pg_temp.valid_wordpress_chunk(
    'wordpress/post/990001/en', 990001, 'post', 'en', 'version-tie', 'Version tie',
    '2026-09-10T10:00:00Z', '["Article"]'::jsonb, 'first version'
  ))
);
select public.remove_wordpress_context(990001, 'en', 'post', '2026-09-10T10:00:00Z'::timestamptz);
do $$ begin
  if exists (select 1 from public.career_context where source = 'wordpress/post/990001/en') then
    raise exception 'same-timestamp delete did not remove the source';
  end if;
end $$;
do $$ begin
  if public.replace_wordpress_context(
    990001, 'en', 'post', 'wordpress/post/990001/en',
    '2026-09-10T10:00:00Z'::timestamptz,
    jsonb_build_array(pg_temp.valid_wordpress_chunk(
      'wordpress/post/990001/en', 990001, 'post', 'en', 'version-tie', 'Version tie',
      '2026-09-10T10:00:00Z', '["Article"]'::jsonb, 'stale resurrection'
    ))
  ) <> 0 then
    raise exception 'same-timestamp upsert was not rejected by tombstone';
  end if;
end $$;

-- An empty replacement still records its version and blocks an older in-flight
-- upsert even though it leaves no career_context rows.
select public.replace_wordpress_context(
  990002, 'en', 'post', 'wordpress/post/990002/en',
  '2026-09-10T12:00:00Z'::timestamptz, '[]'::jsonb
);
do $$ begin
  if public.replace_wordpress_context(
    990002, 'en', 'post', 'wordpress/post/990002/en',
    '2026-09-10T11:00:00Z'::timestamptz,
    jsonb_build_array(pg_temp.valid_wordpress_chunk(
      'wordpress/post/990002/en', 990002, 'post', 'en', 'empty-document', 'Empty document',
      '2026-09-10T11:00:00Z', '["Article"]'::jsonb, 'stale content'
    ))
  ) <> 0 then
    raise exception 'older upsert resurrected an empty replacement';
  end if;
end $$;

-- Null timestamps are allowed initially, but cannot replace a known version.
select public.replace_wordpress_context(
  990003, 'en', 'post', 'wordpress/post/990003/en', null,
  jsonb_build_array(pg_temp.valid_wordpress_chunk(
    'wordpress/post/990003/en', 990003, 'post', 'en', 'null-version', 'Null version',
    null, '["Article"]'::jsonb, 'unknown version'
  ))
);
select public.replace_wordpress_context(
  990003, 'en', 'post', 'wordpress/post/990003/en',
  '2026-09-10T13:00:00Z'::timestamptz,
  jsonb_build_array(pg_temp.valid_wordpress_chunk(
    'wordpress/post/990003/en', 990003, 'post', 'en', 'null-version', 'Null version',
    '2026-09-10T13:00:00Z', '["Article"]'::jsonb, 'known version'
  ))
);
do $$ begin
  if public.replace_wordpress_context(
    990003, 'en', 'post', 'wordpress/post/990003/en', null,
    jsonb_build_array(pg_temp.valid_wordpress_chunk(
      'wordpress/post/990003/en', 990003, 'post', 'en', 'null-version', 'Null version',
      null, '["Article"]'::jsonb, 'stale unknown version'
    ))
  ) <> 0 then
    raise exception 'null timestamp replaced a known version';
  end if;
end $$;

-- A row written before 00003 seeds durable state on first access.
insert into public.career_context (
  source, chunk_index, content, metadata, wordpress_id, locale, content_type,
  slug, title, publication_status, wordpress_modified_at, embedding,
  embedding_model, embedding_dimensions
) values (
  'wordpress/post/990004/en', 0, 'legacy row', '{}'::jsonb, 990004, 'en', 'post',
  'legacy-row', 'Legacy row', 'publish', '2026-09-10T14:00:00Z',
  (pg_temp.zero_embedding())::text::extensions.vector(768), 'gemini-embedding-2', 768
);
do $$ begin
  if public.replace_wordpress_context(
    990004, 'en', 'post', 'wordpress/post/990004/en',
    '2026-09-10T13:00:00Z'::timestamptz,
    jsonb_build_array(pg_temp.valid_wordpress_chunk(
      'wordpress/post/990004/en', 990004, 'post', 'en', 'legacy-row', 'Legacy row',
      '2026-09-10T13:00:00Z', '["Article"]'::jsonb, 'older replacement'
    ))
  ) <> 0 then
    raise exception 'older replacement bypassed initial legacy row version';
  end if;
end $$;

rollback;
