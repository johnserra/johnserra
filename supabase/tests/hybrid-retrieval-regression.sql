-- Test fixtures for the hybrid retrieval PGlite test.
-- \set ON_ERROR_STOP on is expected at the top of the calling script.
-- Inserts deterministic WordPress and CV rows with known embeddings and text
-- so the hybrid RPC can be exercised without external services.

-- Use a fixed 768-dimensional embedding vector for deterministic tests.
-- Two distinct vectors allow semantic separation:
--  vector_a: [1, 0, 0, ..., 0]  (close to query [1, 0, ...])
--  vector_b: [0, 1, 0, ..., 0]  (far from query [1, 0, ...])

-- WordPress post about Premium Parking (EN)
insert into public.career_context (
  source, chunk_index, content, metadata, wordpress_id, locale, content_type,
  slug, title, publication_status, wordpress_modified_at, embedding,
  embedding_model, embedding_dimensions, document_type, organization, role,
  visibility, canonical_url, authority, section_path, indexing_config,
  chunking_config
)
values (
  'wordpress/post/100/en', 0,
  'Premium Parking export market development. John led the sales development for Premium Parking across new export markets in Turkey.',
  '{"event_id":"test-100","title":"Premium Parking Export","type":"post","slug":"premium-parking","locale":"en","wordpress_id":"100","document_type":"wordpress","canonical_url":"https://johnserra.com/blog/premium-parking","authority":"authored_post","section_path":[],"indexing_config":"wordpress-indexing-v2","chunking_config":"structure-aware-v1","source_version":"2026-09-10T10:00:00Z","embedding_config":"gemini-embedding-2:768:v1"}'::jsonb,
  100, 'en', 'post', 'premium-parking', 'Premium Parking Export', 'publish',
  '2026-09-10T10:00:00Z',
  array[1.0]::float8[] || array_fill(0.0, array[767])::float8[],
  'gemini-embedding-2', 768, 'wordpress', null, null,
  'public', 'https://johnserra.com/blog/premium-parking', 'authored_post',
  '[]'::jsonb, 'wordpress-indexing-v2', 'structure-aware-v1'
)
on conflict (source, chunk_index) do update set
  content = excluded.content,
  metadata = excluded.metadata,
  embedding = excluded.embedding,
  wordpress_modified_at = excluded.wordpress_modified_at,
  title = excluded.title,
  slug = excluded.slug,
  organization = excluded.organization,
  role = excluded.role,
  authority = excluded.authority,
  section_path = excluded.section_path,
  indexing_config = excluded.indexing_config,
  chunking_config = excluded.chunking_config;

-- WordPress project about CareerTalkLab (EN)
insert into public.career_context (
  source, chunk_index, content, metadata, wordpress_id, locale, content_type,
  slug, title, publication_status, wordpress_modified_at, embedding,
  embedding_model, embedding_dimensions, document_type, organization, role,
  visibility, canonical_url, authority, section_path, indexing_config,
  chunking_config
)
values (
  'wordpress/js_project/200/en', 0,
  'CareerTalkLab is a platform for career conversation practice. John built it with Next.js and React.',
  '{"event_id":"test-200","title":"CareerTalkLab","type":"js_project","slug":"careertalklab","locale":"en","wordpress_id":"200","document_type":"wordpress","canonical_url":"https://johnserra.com/projects/careertalklab","authority":"project_page","section_path":[],"indexing_config":"wordpress-indexing-v2","chunking_config":"structure-aware-v1","source_version":"2026-09-10T10:00:00Z","embedding_config":"gemini-embedding-2:768:v1"}'::jsonb,
  200, 'en', 'js_project', 'careertalklab', 'CareerTalkLab', 'publish',
  '2026-09-10T10:00:00Z',
  array[0.0]::float8[] || array[1.0]::float8[] || array_fill(0.0, array[766])::float8[],
  'gemini-embedding-2', 768, 'wordpress', null, null,
  'public', 'https://johnserra.com/projects/careertalklab', 'project_page',
  '[]'::jsonb, 'wordpress-indexing-v2', 'structure-aware-v1'
)
on conflict (source, chunk_index) do update set
  content = excluded.content,
  metadata = excluded.metadata,
  embedding = excluded.embedding,
  wordpress_modified_at = excluded.wordpress_modified_at,
  title = excluded.title,
  slug = excluded.slug,
  organization = excluded.organization,
  role = excluded.role,
  authority = excluded.authority,
  section_path = excluded.section_path,
  indexing_config = excluded.indexing_config,
  chunking_config = excluded.chunking_config;

-- Turkish WordPress post (TR locale)
insert into public.career_context (
  source, chunk_index, content, metadata, wordpress_id, locale, content_type,
  slug, title, publication_status, wordpress_modified_at, embedding,
  embedding_model, embedding_dimensions, document_type, organization, role,
  visibility, canonical_url, authority, section_path, indexing_config,
  chunking_config
)
values (
  'wordpress/post/300/tr', 0,
  'Dijital donusum projeleri. John dijital donusum alaninda calisti ve Turkce icerik sagladi.',
  '{"event_id":"test-300","title":"Dijital Donusum","type":"post","slug":"dijital-donusum","locale":"tr","wordpress_id":"300","document_type":"wordpress","canonical_url":"https://johnserra.com/tr/blog/dijital-donusum","authority":"authored_post","section_path":[],"indexing_config":"wordpress-indexing-v2","chunking_config":"structure-aware-v1","source_version":"2026-09-10T10:00:00Z","embedding_config":"gemini-embedding-2:768:v1"}'::jsonb,
  300, 'tr', 'post', 'dijital-donusum', 'Dijital Donusum', 'publish',
  '2026-09-10T10:00:00Z',
  (array_fill(0.0, array[767]) || array[1.0])::float8[],
  'gemini-embedding-2', 768, 'wordpress', null, null,
  'public', 'https://johnserra.com/tr/blog/dijital-donusum', 'authored_post',
  '[]'::jsonb, 'wordpress-indexing-v2', 'structure-aware-v1'
)
on conflict (source, chunk_index) do update set
  content = excluded.content,
  metadata = excluded.metadata,
  embedding = excluded.embedding,
  wordpress_modified_at = excluded.wordpress_modified_at,
  title = excluded.title,
  slug = excluded.slug,
  organization = excluded.organization,
  role = excluded.role,
  authority = excluded.authority,
  section_path = excluded.section_path,
  indexing_config = excluded.indexing_config,
  chunking_config = excluded.chunking_config;

-- Unpublished WordPress row (must be excluded)
insert into public.career_context (
  source, chunk_index, content, metadata, wordpress_id, locale, content_type,
  slug, title, publication_status, embedding, embedding_model,
  embedding_dimensions, document_type, visibility
)
values (
  'wordpress/post/999/en', 0,
  'Unpublished draft content that must never appear in results.',
  '{"event_id":"test-999","title":"Draft","type":"post","slug":"draft","locale":"en","wordpress_id":"999","document_type":"wordpress","authority":"authored_post","section_path":[],"indexing_config":"wordpress-indexing-v2","chunking_config":"structure-aware-v1","embedding_config":"gemini-embedding-2:768:v1"}'::jsonb,
  999, 'en', 'post', 'draft', 'Draft', 'draft',
  array_fill(0.0, array[768])::float8[],
  'gemini-embedding-2', 768, 'wordpress', 'public'
)
on conflict (source, chunk_index) do nothing;

-- Executable regression assertions for natural-language lexical matching and
-- null-safe/bounded scalar inputs. These deliberately use null embeddings so
-- they never call an embedding provider.
do $$
declare
  english_found boolean;
  turkish_found boolean;
  overlong_found boolean;
  null_threshold_count integer;
  negative_threshold_count integer;
  huge_threshold_count integer;
  zero_count_rows integer;
  huge_count_rows integer;
begin
  select exists (
    select 1
    from public.match_career_context_hybrid(
      null, 'What did John do at Premium Parking and why?', 'en', 0.65, 6,
      null, null, null, 'public'
    )
    where source = 'wordpress/post/100/en'
  ) into english_found;
  if not english_found then
    raise exception 'English natural-language lexical regression failed';
  end if;

  select exists (
    select 1
    from public.match_career_context_hybrid(
      null, 'John dijital donusum hakkında ne yaptı ve neden?', 'tr', 0.65, 6,
      null, null, null, 'public'
    )
    where source = 'wordpress/post/300/tr'
  ) into turkish_found;
  if not turkish_found then
    raise exception 'Turkish natural-language lexical regression failed';
  end if;

  select exists (
    select 1
    from public.match_career_context_hybrid(
      null, repeat('x', 501) || ' CareerTalkLab', 'en', 0.65, 6,
      null, null, null, 'public'
    )
    where source = 'wordpress/js_project/200/en'
  ) into overlong_found;
  if overlong_found then
    raise exception 'Lexical query bound regression failed';
  end if;

  select count(*) into null_threshold_count
  from public.match_career_context_hybrid(
    (array[1.0]::float8[] || array_fill(0.0, array[767])::float8[])::extensions.vector(768),
    null, 'en', null, 6, 'wordpress', null, null, 'public'
  );
  select count(*) into negative_threshold_count
  from public.match_career_context_hybrid(
    (array[1.0]::float8[] || array_fill(0.0, array[767])::float8[])::extensions.vector(768),
    null, 'en', -10, 6, 'wordpress', null, null, 'public'
  );
  select count(*) into huge_threshold_count
  from public.match_career_context_hybrid(
    (array[1.0]::float8[] || array_fill(0.0, array[767])::float8[])::extensions.vector(768),
    null, 'en', 999, 6, 'wordpress', null, null, 'public'
  );
  if null_threshold_count < 1
     or negative_threshold_count < null_threshold_count
     or huge_threshold_count > null_threshold_count then
    raise exception 'Threshold null/clamp regression failed';
  end if;

  select count(*) into zero_count_rows
  from public.match_career_context_hybrid(null, 'John', 'en', 0.65, 0, null, null, null, 'public');
  select count(*) into huge_count_rows
  from public.match_career_context_hybrid(null, 'John', 'en', 0.65, 2000000000, null, null, null, 'public');
  if zero_count_rows > 4 or huge_count_rows > 40 then
    raise exception 'Count clamp regression failed';
  end if;
end;
$$;
