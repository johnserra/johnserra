#!/usr/bin/env bash
set -euo pipefail

migration="supabase/migrations/00002_cv_knowledge.sql"
regression="supabase/tests/cv-regression.sql"

test -f "$migration"
test -f "$regression"
grep -Fq "create or replace function public.replace_cv_context" "$migration"
grep -Fq "create or replace function public.match_career_context_filtered" "$migration"
grep -Fq "create or replace function public.cv_indexing_contract_version" "$migration"
grep -Fq "document_type = 'cv' and document_id = cv_document_id" "$migration"
grep -Fq "query_locale = 'tr' and context.document_type = 'cv' and context.locale = 'en'" "$migration"
grep -Fq "context.visibility = 'public'" "$migration"
grep -Fq "jsonb_typeof(job) is distinct from 'object'" "$migration"
grep -Fq "document_type is distinct from 'cv' or coalesce((" "$migration"
grep -Fq "Unsupported content document type" "$migration"
grep -Fq "not (chunk_metadata ?& array[" "$migration"
grep -Fq "chunk->>'source' is distinct from 'cv/john-serra/en/' || (chunk_metadata->>'section_id')" "$migration"
grep -Fq "where jsonb_typeof(component) is distinct from 'number'" "$migration"
grep -Fq "source_type_rank <= 3" "$migration"
grep -Fq "source_type_rank <= least(2, target_count)" "$migration"
grep -Fq "grant execute on function public.replace_cv_context" "$migration"
grep -Fq "grant execute on function public.match_career_context_filtered" "$migration"
grep -Fq "to service_role" "$migration"
grep -Fq "from public, anon, authenticated" "$migration"

# Validation must finish before the destructive replacement phase.
validation_line=$(grep -nF "Validate the complete replacement before deleting" "$migration" | cut -d: -f1)
delete_line=$(grep -nF "delete from public.career_context" "$migration" | cut -d: -f1)
if [[ -z "$validation_line" || -z "$delete_line" || "$validation_line" -ge "$delete_line" ]]; then
  echo "CV replacement must validate every chunk before deleting existing rows" >&2
  exit 1
fi

# The regression is a rollback-only disposable-database artifact, not something
# this static verifier executes.
grep -Fq '\set ON_ERROR_STOP on' "$regression"
grep -Fq 'begin;' "$regression"
grep -Fq 'rollback;' "$regression"
grep -Fq "Invalid registered CV indexing job" "$regression"
grep -Fq "Invalid CV replacement chunk" "$regression"
grep -Fq "career_context_cv_shape_check" "$regression"
grep -Fq "match_career_context_filtered" "$regression"
grep -Fq "Expected exactly two reserved CV rows in the six-result mixed retrieval" "$regression"

if grep -Fq "then 0.03" "$migration"; then
  echo "Score-only CV boost must not replace bounded result reservation" >&2
  exit 1
fi

# Preserve the compatibility RPC and reject accidental overload changes.
grep -Fq "create or replace function public.match_career_context(" supabase/migrations/00001_wordpress_vector_queue.sql
if grep -Fq "create or replace function public.match_career_context(" "$migration"; then
  echo "00002 must not replace or overload the four-argument compatibility RPC" >&2
  exit 1
fi

echo "CV migration static contract verified (not a migrated/live database proof)."
