-- Run only against an isolated, disposable PostgreSQL database after applying
-- supabase-schema.sql and migrations 00001 and 00002 in order.
-- Example: psql "$DISPOSABLE_DATABASE_URL" -f supabase/tests/cv-regression.sql
-- This file intentionally changes fixture rows and the pgmq queue, then rolls
-- the entire test transaction back. Never point it at a live database.
\set ON_ERROR_STOP on

begin;

create function pg_temp.regression_embedding(similarity double precision)
returns jsonb
language sql
immutable
strict
as $$
  select jsonb_agg(
    case
      when component = 1 then to_jsonb(similarity)
      when component = 2 then to_jsonb(sqrt(greatest(0.0, 1.0 - similarity * similarity)))
      else '0'::jsonb
    end
    order by component
  )
  from generate_series(1, 768) as component;
$$;

create function pg_temp.valid_cv_chunk(
  section_id text,
  similarity double precision,
  organization_name text
)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'source', 'cv/john-serra/en/' || section_id,
    'chunk_index', 0,
    'content', 'Regression fixture for ' || section_id,
    'metadata', jsonb_build_object(
      'document_id', 'john-serra',
      'section_id', section_id,
      'title', 'Regression ' || section_id,
      'organization', organization_name,
      'role', null,
      'dates', jsonb_build_object(
        'kind', 'undated',
        'start', null,
        'end', null,
        'ongoing', false,
        'start_unknown', true,
        'end_unknown', true
      ),
      'locale', 'en',
      'source_locale', 'en',
      'visibility', 'public',
      'document_type', 'cv',
      'authority', 'reviewed_public_cv',
      'canonical_url', 'https://johnserra.com/cv/john-serra.en.md',
      'content_sha256', repeat('a', 64),
      'embedding_config', 'gemini-embedding-2:768:v1'
    ),
    'embedding', pg_temp.regression_embedding(similarity),
    'embedding_model', 'gemini-embedding-2',
    'embedding_dimensions', 768
  );
$$;

-- Exact-error queue validation: JSON null cannot satisfy a required CV field,
-- and an unknown document type cannot fall through to the WordPress contract.
do $$
declare
  caught boolean := false;
begin
  begin
    perform public.enqueue_content_indexing_job(jsonb_build_object(
      'event_id', null,
      'document_type', 'cv',
      'cv_id', 'john-serra',
      'locale', 'en',
      'operation', 'upsert',
      'content_sha256', repeat('a', 64)
    ));
  exception when others then
    if sqlerrm is distinct from 'Invalid registered CV indexing job' then
      raise;
    end if;
    caught := true;
  end;
  if not caught then
    raise exception 'Expected null CV event_id validation failure';
  end if;

  caught := false;
  begin
    perform public.enqueue_content_indexing_job(jsonb_build_object(
      'document_type', 'resume',
      'wordpress_id', 1,
      'operation', 'upsert',
      'locale', 'en'
    ));
  exception when others then
    if sqlerrm is distinct from 'Unsupported content document type' then
      raise;
    end if;
    caught := true;
  end;
  if not caught then
    raise exception 'Expected unknown document_type validation failure';
  end if;

  -- A valid legacy-style WordPress job (without document_type) remains accepted.
  perform public.enqueue_content_indexing_job(jsonb_build_object(
    'event_id', '00000000-0000-0000-0000-000000000001',
    'wordpress_id', 900001,
    'content_type', 'post',
    'locale', 'en',
    'operation', 'delete'
  ));
end;
$$;

select public.replace_cv_context(
  'john-serra',
  'en',
  repeat('a', 64),
  jsonb_build_array(pg_temp.valid_cv_chunk('regression-preserved', 0.80, 'CV Org'))
);

-- SQL-null arguments and malformed nested metadata must raise the exact public
-- validation errors. Each failed replacement must leave the prior CV intact.
do $$
declare
  bad_chunk jsonb;
  caught boolean;
  preserved_count integer;
begin
  caught := false;
  begin
    perform public.replace_cv_context(null, 'en', repeat('a', 64), '[]'::jsonb);
  exception when others then
    if sqlerrm is distinct from 'Invalid registered CV replacement' then
      raise;
    end if;
    caught := true;
  end;
  if not caught then
    raise exception 'Expected SQL-null replacement identity validation failure';
  end if;

  bad_chunk := pg_temp.valid_cv_chunk('regression-missing-section', 0.80, 'CV Org') #- '{metadata,section_id}';
  caught := false;
  begin
    perform public.replace_cv_context('john-serra', 'en', repeat('a', 64), jsonb_build_array(bad_chunk));
  exception when others then
    if sqlerrm is distinct from 'Invalid CV replacement chunk' then
      raise;
    end if;
    caught := true;
  end;
  if not caught then
    raise exception 'Expected missing metadata.section_id validation failure';
  end if;

  bad_chunk := jsonb_set(
    pg_temp.valid_cv_chunk('regression-null-title', 0.80, 'CV Org'),
    '{metadata,title}',
    'null'::jsonb
  );
  caught := false;
  begin
    perform public.replace_cv_context('john-serra', 'en', repeat('a', 64), jsonb_build_array(bad_chunk));
  exception when others then
    if sqlerrm is distinct from 'Invalid CV replacement chunk' then
      raise;
    end if;
    caught := true;
  end;
  if not caught then
    raise exception 'Expected JSON-null metadata.title validation failure';
  end if;

  bad_chunk := jsonb_set(
    pg_temp.valid_cv_chunk('regression-invalid-dates', 0.80, 'CV Org'),
    '{metadata,dates,ongoing}',
    'true'::jsonb
  );
  caught := false;
  begin
    perform public.replace_cv_context('john-serra', 'en', repeat('a', 64), jsonb_build_array(bad_chunk));
  exception when others then
    if sqlerrm is distinct from 'Invalid CV replacement chunk' then
      raise;
    end if;
    caught := true;
  end;
  if not caught then
    raise exception 'Expected inconsistent dates validation failure';
  end if;

  bad_chunk := jsonb_set(
    pg_temp.valid_cv_chunk('regression-nonnumeric-embedding', 0.80, 'CV Org'),
    '{embedding,0}',
    '"not-a-number"'::jsonb
  );
  caught := false;
  begin
    perform public.replace_cv_context('john-serra', 'en', repeat('a', 64), jsonb_build_array(bad_chunk));
  exception when others then
    if sqlerrm is distinct from 'Invalid CV replacement chunk' then
      raise;
    end if;
    caught := true;
  end;
  if not caught then
    raise exception 'Expected nonnumeric embedding validation failure';
  end if;

  select count(*) into preserved_count
  from public.career_context
  where source = 'cv/john-serra/en/regression-preserved';
  if preserved_count <> 1 then
    raise exception 'Failed replacement deleted the prior CV before validation completed';
  end if;
end;
$$;

-- The table-level constraint independently rejects a CV row missing required
-- identity metadata. Check both SQLSTATE and the exact constraint name.
do $$
declare
  caught boolean := false;
  failed_constraint text;
begin
  begin
    insert into public.career_context (
      source, chunk_index, content, metadata, wordpress_id, locale, content_type,
      slug, title, publication_status, embedding, embedding_model,
      embedding_dimensions, document_id, document_type, organization, role,
      visibility, canonical_url, content_sha256
    )
    select
      'cv/john-serra/en/regression-row-boundary', 0, content,
      (metadata || jsonb_build_object(
        'section_id', 'regression-row-boundary',
        'title', 'Regression row boundary'
      )) - 'authority',
      null, 'en', null, null, 'Regression row boundary', 'publish', embedding,
      'gemini-embedding-2', 768, 'john-serra', 'cv', organization, role, 'public',
      'https://johnserra.com/cv/john-serra.en.md', repeat('a', 64)
    from public.career_context
    where source = 'cv/john-serra/en/regression-preserved';
  exception when check_violation then
    get stacked diagnostics failed_constraint = constraint_name;
    if failed_constraint is distinct from 'career_context_cv_shape_check' then
      raise exception 'Unexpected constraint: %', failed_constraint;
    end if;
    caught := true;
  when others then
    raise;
  end;
  if not caught then
    raise exception 'Expected career_context_cv_shape_check violation';
  end if;
end;
$$;

-- Ranking fixtures: six higher-similarity English narratives, four qualifying
-- CV sections, one below-threshold CV, plus Turkish and unpublished controls.
select public.replace_cv_context(
  'john-serra',
  'en',
  repeat('a', 64),
  jsonb_build_array(
    pg_temp.valid_cv_chunk('regression-cv-1', 0.90, 'CV Org'),
    pg_temp.valid_cv_chunk('regression-cv-2', 0.89, 'CV Org'),
    pg_temp.valid_cv_chunk('regression-cv-3', 0.88, 'CV Org'),
    pg_temp.valid_cv_chunk('regression-cv-4', 0.87, 'CV Org'),
    pg_temp.valid_cv_chunk('regression-cv-null-organization', 0.86, null),
    pg_temp.valid_cv_chunk('regression-cv-below-threshold', 0.40, 'Below')
  )
);

insert into public.career_context (
  source, chunk_index, content, metadata, wordpress_id, locale, content_type,
  slug, title, publication_status, embedding, embedding_model,
  embedding_dimensions, document_type, organization, role, visibility
)
select
  'wordpress/post/' || (910000 + fixture_number)::text || '/en',
  0,
  'Regression narrative ' || fixture_number,
  jsonb_build_object('fixture', 'ranking', 'number', fixture_number),
  910000 + fixture_number,
  'en',
  'post',
  'regression-narrative-' || fixture_number,
  'Regression narrative ' || fixture_number,
  'publish',
  (pg_temp.regression_embedding(1.00 - fixture_number * 0.01)::text)::extensions.vector(768),
  'gemini-embedding-2',
  768,
  'wordpress',
  'Narrative Org',
  'Narrative Role',
  'public'
from generate_series(1, 6) as fixture_number;

insert into public.career_context (
  source, chunk_index, content, metadata, wordpress_id, locale, content_type,
  slug, title, publication_status, embedding, embedding_model,
  embedding_dimensions, document_type, organization, role, visibility
)
values
  (
    'wordpress/post/920001/en', 0, 'Below-threshold control narrative', '{}'::jsonb,
    920001, 'en', 'post', 'below-control', 'Below control', 'publish',
    (pg_temp.regression_embedding(0.80)::text)::extensions.vector(768),
    'gemini-embedding-2', 768, 'wordpress', 'Below', null, 'public'
  ),
  (
    'wordpress/post/920002/tr', 0, 'Turkish regression narrative', '{}'::jsonb,
    920002, 'tr', 'post', 'turkish-control', 'Turkish control', 'publish',
    (pg_temp.regression_embedding(0.99)::text)::extensions.vector(768),
    'gemini-embedding-2', 768, 'wordpress', 'Narrative Org', null, 'public'
  ),
  (
    'wordpress/post/920003/en', 0, 'Unpublished regression narrative', '{}'::jsonb,
    920003, 'en', 'post', 'draft-control', 'Draft control', 'draft',
    (pg_temp.regression_embedding(1.00)::text)::extensions.vector(768),
    'gemini-embedding-2', 768, 'wordpress', 'Narrative Org', null, 'public'
  );

do $$
declare
  query_vector extensions.vector(768) := (pg_temp.regression_embedding(1.0)::text)::extensions.vector(768);
  result_count integer;
  cv_count integer;
  tr_count integer;
begin
  if not exists (
    select 1 from public.career_context
    where source = 'cv/john-serra/en/regression-cv-null-organization'
      and organization is null
      and role is null
  ) then
    raise exception 'Legitimate nullable CV organization/role values were not preserved';
  end if;

  select count(*), count(*) filter (where source like 'cv/%')
  into result_count, cv_count
  from public.match_career_context_filtered(query_vector, 'en', 0.50, 6, null, null, null, 'public');
  if result_count <> 6 then
    raise exception 'Expected six mixed retrieval rows, got %', result_count;
  end if;
  if cv_count <> 2 then
    raise exception 'Expected exactly two reserved CV rows in the six-result mixed retrieval, got %', cv_count;
  end if;

  select count(*), count(*) filter (where source like 'cv/%')
  into result_count, cv_count
  from public.match_career_context_filtered(query_vector, 'en', 0.50, 1, null, null, null, 'public');
  if result_count <> 1 or cv_count <> 1 then
    raise exception 'Count-one retrieval did not reserve exactly one CV row';
  end if;

  select count(*), count(*) filter (where source like 'cv/%')
  into result_count, cv_count
  from public.match_career_context_filtered(query_vector, 'en', 0.50, 2, null, null, null, 'public');
  if result_count <> 2 or cv_count <> 2 then
    raise exception 'Count-two retrieval did not reserve exactly two CV rows';
  end if;

  select count(*) into result_count
  from public.match_career_context_filtered(query_vector, 'en', 0.50, 6, null, 'Narrative Org', null, 'public');
  if result_count <> 6 then
    raise exception 'No-CV retrieval did not fill all six slots';
  end if;

  select count(*), count(*) filter (where source like 'cv/%')
  into result_count, cv_count
  from public.match_career_context_filtered(query_vector, 'en', 0.50, 6, null, 'CV Org', null, 'public');
  if result_count <> 3 or cv_count <> 3 then
    raise exception 'Only-CV unfiltered retrieval must return the capped three CV rows';
  end if;

  select count(*) into result_count
  from public.match_career_context_filtered(query_vector, 'en', 0.50, 4, 'cv', 'CV Org', null, 'public');
  if result_count <> 4 then
    raise exception 'Pure CV filter must honor requested count beyond the unfiltered cap';
  end if;

  select count(*), count(*) filter (where source like 'cv/%')
  into result_count, cv_count
  from public.match_career_context_filtered(query_vector, 'en', 0.50, 6, null, 'Below', null, 'public');
  if result_count <> 1 or cv_count <> 0 then
    raise exception 'Below-threshold CV row bypassed the similarity threshold';
  end if;

  select count(*) filter (where source like 'cv/%')
  into cv_count
  from public.match_career_context_filtered(query_vector, 'tr', 0.50, 1, null, null, null, 'public');
  if cv_count <> 1 then
    raise exception 'Turkish retrieval did not reserve the eligible English CV fallback';
  end if;

  select count(*) into tr_count
  from public.match_career_context_filtered(query_vector, 'en', 0.50, 20, null, null, null, 'public') as matched
  join public.career_context as context on context.id = matched.id
  where context.locale = 'tr';
  if tr_count <> 0 then
    raise exception 'English retrieval included Turkish-only context';
  end if;

  if exists (
    select 1
    from public.match_career_context_filtered(query_vector, 'en', 0.0, 20, null, null, null, 'public')
    where source = 'wordpress/post/920003/en'
  ) then
    raise exception 'Unpublished context passed the retrieval filter';
  end if;
end;
$$;

rollback;
