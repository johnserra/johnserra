-- Hybrid conversational retrieval: additive semantic + lexical branches with
-- rank-fusion reranking. This migration is additive — it does not alter the
-- existing match_career_context or match_career_context_filtered RPCs.
-- Apply after 00001–00003. Service-role only; SECURITY DEFINER; search_path locked.

-- GIN index for lexical (full-text) search across content, title, organization,
-- role, and heading path. Uses the 'simple' text-search configuration so both
-- English and Turkish text tokenize meaningfully without requiring language-
-- specific dictionaries that may be absent in embedded or hosted PostgreSQL.
create index if not exists career_context_hybrid_fts
  on public.career_context
  using gin (to_tsvector('simple',
    coalesce(content, '') || ' ' ||
    coalesce(title, '') || ' ' ||
    coalesce(organization, '') || ' ' ||
    coalesce(role, '') || ' ' ||
    coalesce(section_path::text, '')
  ))
  where publication_status = 'publish' and visibility = 'public';

create or replace function public.match_career_context_hybrid(
  query_embedding extensions.vector(768) default null,
  query_text text default null,
  query_locale text default 'en',
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
  semantic_similarity double precision,
  lexical_rank bigint,
  final_rank bigint,
  fusion_score double precision
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  effective_threshold double precision;
  semantic_limit integer := 20;
  lexical_limit integer := 20;
  effective_count integer;
  effective_locale text;
  bounded_query text;
  lexical_query tsquery;
begin
  if query_locale is null or query_locale not in ('en', 'tr') then
    raise exception 'Hybrid retrieval requires a valid locale (en or tr).';
  end if;

  if filter_visibility is null or filter_visibility <> 'public' then
    raise exception 'Hybrid retrieval requires public visibility.';
  end if;

  effective_threshold := case
    when match_threshold is null or match_threshold::text = 'NaN' then 0.65
    else greatest(0.0, least(1.0, match_threshold))
  end;
  effective_count := greatest(1, least(10, coalesce(match_count, 6)));
  effective_locale := query_locale;
  bounded_query := left(trim(coalesce(query_text, '')), 500);

  -- Build a bounded OR query from meaningful terms. plainto_tsquery joins all
  -- input tokens with AND, which makes ordinary questions fail whenever a
  -- filler word is absent from a relevant chunk. The simple configuration is
  -- retained for language-neutral EN/TR tokenization; common question and
  -- function words are removed explicitly.
  select to_tsquery(
    'simple',
    string_agg(quote_literal(term), ' | ' order by term)
  )
  into lexical_query
  from (
    select term
    from unnest(tsvector_to_array(to_tsvector('simple', bounded_query))) as terms(term)
    where char_length(term) >= 2
      and term <> all (array[
        'a', 'about', 'an', 'and', 'are', 'at', 'be', 'did', 'do', 'does',
        'for', 'from', 'how', 'in', 'is', 'it', 'of', 'on', 'or', 'the', 'to',
        'was', 'were', 'what', 'when', 'where', 'which', 'who', 'why', 'with',
        'acaba', 'ama', 'bir', 'bu', 'da', 'de', 'hakkında', 'hangi', 'için',
        'ile', 'kim', 'mı', 'mi', 'mu', 'mü', 'nasıl', 'ne', 'neden', 'nedir',
        'nerede', 'niçin', 'o', 'şu', 've'
      ]::text[])
    order by term
    limit 32
  ) as meaningful_terms;

  return query
  with
  semantic_branch as (
    select
      ctx.id,
      ctx.source,
      ctx.content,
      ctx.metadata,
      (1 - (ctx.embedding operator(extensions.<=>) query_embedding)) as semantic_similarity,
      row_number() over (
        order by (1 - (ctx.embedding operator(extensions.<=>) query_embedding)) desc, ctx.id asc
      ) as semantic_rank
    from public.career_context as ctx
    where query_embedding is not null
      and ctx.embedding is not null
      and ctx.publication_status = 'publish'
      and ctx.visibility = 'public'
      and filter_visibility = 'public'
      and (
        ctx.locale = effective_locale
        or (effective_locale = 'tr' and ctx.document_type = 'cv' and ctx.locale = 'en')
      )
      and (filter_document_type is null or coalesce(ctx.document_type, 'wordpress') = filter_document_type)
      and (filter_organization is null or ctx.organization = filter_organization)
      and (filter_role is null or ctx.role = filter_role)
      and (1 - (ctx.embedding operator(extensions.<=>) query_embedding)) >= effective_threshold
    order by (1 - (ctx.embedding operator(extensions.<=>) query_embedding)) desc, ctx.id asc
    limit semantic_limit
  ),
  lexical_branch as (
    select
      ctx.id,
      ctx.source,
      ctx.content,
      ctx.metadata,
      row_number() over (
        order by
          ts_rank_cd(
            to_tsvector('simple',
              coalesce(ctx.content, '') || ' ' ||
              coalesce(ctx.title, '') || ' ' ||
              coalesce(ctx.organization, '') || ' ' ||
              coalesce(ctx.role, '') || ' ' ||
              coalesce(ctx.section_path::text, '')
            ),
            lexical_query
          ) desc,
          ctx.id asc
      ) as lexical_rank_val
    from public.career_context as ctx
    where ctx.publication_status = 'publish'
      and ctx.visibility = 'public'
      and filter_visibility = 'public'
      and (
        ctx.locale = effective_locale
        or (effective_locale = 'tr' and ctx.document_type = 'cv' and ctx.locale = 'en')
      )
      and (filter_document_type is null or coalesce(ctx.document_type, 'wordpress') = filter_document_type)
      and (filter_organization is null or ctx.organization = filter_organization)
      and (filter_role is null or ctx.role = filter_role)
      and lexical_query is not null
      and to_tsvector('simple',
        coalesce(ctx.content, '') || ' ' ||
        coalesce(ctx.title, '') || ' ' ||
        coalesce(ctx.organization, '') || ' ' ||
        coalesce(ctx.role, '') || ' ' ||
        coalesce(ctx.section_path::text, '')
      ) @@ lexical_query
    order by
      ts_rank_cd(
        to_tsvector('simple',
          coalesce(ctx.content, '') || ' ' ||
          coalesce(ctx.title, '') || ' ' ||
          coalesce(ctx.organization, '') || ' ' ||
          coalesce(ctx.role, '') || ' ' ||
          coalesce(ctx.section_path::text, '')
        ),
        lexical_query
      ) desc,
      ctx.id asc
    limit lexical_limit
  ),
  combined as (
    select
      coalesce(s.id, l.id) as chunk_id,
      coalesce(s.source, l.source) as chunk_source,
      coalesce(s.content, l.content) as chunk_content,
      coalesce(s.metadata, l.metadata) as chunk_metadata,
      coalesce(s.semantic_similarity, 0.0::float8) as sem_sim,
      coalesce(s.semantic_rank, 100) as sem_rank,
      l.lexical_rank_val as lex_rank
    from semantic_branch s
    full outer join lexical_branch l on s.id = l.id
  ),
  fused as (
    select
      chunk_id,
      chunk_source,
      chunk_content,
      chunk_metadata,
      sem_sim,
      lex_rank,
      (coalesce(1.0::float8 / (60.0::float8 + sem_rank::float8), 0.0::float8)
       + coalesce(1.0::float8 / (60.0::float8 + lex_rank::float8), 0.0::float8))::float8 as base_fusion_score,
      case when (chunk_metadata->>'document_type') = 'cv' then 'cv' else 'wp' end as doc_kind
    from combined
  ),
  cv_capped as (
    select
      f.chunk_id, f.chunk_source, f.chunk_content, f.chunk_metadata,
      f.sem_sim, f.lex_rank, f.base_fusion_score, f.doc_kind,
      row_number() over (
        partition by f.doc_kind
        order by f.base_fusion_score desc, f.sem_sim desc, f.chunk_id asc
      ) as kind_rank
    from fused f
  )
  select
    c.chunk_id as id,
    c.chunk_source as source,
    c.chunk_content as content,
    c.chunk_metadata as metadata,
    c.sem_sim as semantic_similarity,
    c.lex_rank as lexical_rank,
    row_number() over (
      order by c.base_fusion_score desc, c.sem_sim desc, c.chunk_id asc
    ) as final_rank,
    c.base_fusion_score as fusion_score
  from cv_capped c
  where filter_document_type = 'cv' or c.doc_kind <> 'cv' or c.kind_rank <= 3
  order by c.base_fusion_score desc, c.sem_sim desc, c.chunk_id asc
  limit least(40, effective_count * 4);
end;
$$;

revoke all on function public.match_career_context_hybrid(extensions.vector, text, text, double precision, integer, text, text, text, text) from public, anon, authenticated;
grant execute on function public.match_career_context_hybrid(extensions.vector, text, text, double precision, integer, text, text, text, text) to service_role;
