#!/usr/bin/env bash

set -euo pipefail

migration="supabase/migrations/00003_wordpress_structure_aware.sql"
regression="supabase/tests/structure-aware-regression.sql"

test -f "$migration"
grep -Fq "add column if not exists authority text" "$migration"
grep -Fq "add column if not exists section_path jsonb" "$migration"
grep -Fq "add column if not exists indexing_config text" "$migration"
grep -Fq "add column if not exists chunking_config text" "$migration"
grep -Fq "create table if not exists public.wordpress_context_versions" "$migration"
grep -Fq "alter table public.wordpress_context_versions enable row level security" "$migration"
grep -Fq "wordpress_modified_at is not distinct from existing_modified" "$migration"
grep -Fq "existing_operation = 'delete'" "$migration"
grep -Fq "source, wordpress_id, locale, content_type, modified_at, operation" "$migration"
grep -Fq "create or replace function public.replace_wordpress_context" "$migration"
grep -Fq "create or replace function public.remove_wordpress_context" "$migration"
grep -Fq "pg_advisory_xact_lock(hashtextextended" "$migration"
grep -Fq "return 0;" "$migration"
grep -Fq "Validate the complete replacement before deleting" "$migration"
grep -Fq "delete from public.career_context" "$migration"
grep -Fq "Duplicate WordPress source/chunk identity" "$migration"
grep -Fq "structure-aware-v1" "$migration"
grep -Fq "wordpress-indexing-v2" "$migration"
grep -Fq "https://johnserra.com/%" "$migration"
grep -Fq "like '%wp/v2%'" "$migration"
grep -Fq "coalesce(chunk_metadata->>'canonical_url' not like" "$migration"
grep -Fq "document_type = 'wordpress'" "$migration"
grep -Fq "document_type is distinct from 'cv'" "$migration"
grep -Fq "alter function public.replace_cv_context(text, text, text, jsonb)" "$migration"
grep -Fq "replace_cv_context_legacy" "$migration"
grep -Fq "cv-indexing-v1" "$migration"
grep -Fq "cv-section-v1" "$migration"
grep -Fq "from public, anon, authenticated" "$migration"
grep -Fq "to service_role" "$migration"

validation_line=$(grep -nF "Validate the complete replacement before deleting" "$migration" | cut -d: -f1)
delete_line=$(grep -nF "delete from public.career_context" "$migration" | head -n 1 | cut -d: -f1)
if [[ -z "$validation_line" || -z "$delete_line" || "$validation_line" -ge "$delete_line" ]]; then
  echo "WordPress replacement must validate every chunk before deleting existing rows" >&2
  exit 1
fi

if grep -Fq "like '%wordpress%'" "$migration"; then
  echo "Canonical URL validation must not reject valid blog slugs containing wordpress" >&2
  exit 1
fi

test -f "$regression"
grep -Fq '\set ON_ERROR_STOP on' "$regression"
grep -Fq 'begin;' "$regression"
grep -Fq 'rollback;' "$regression"
grep -Fq 'Same-timestamp deletion wins' "$regression"
grep -Fq 'empty replacement' "$regression"
grep -Fq 'Null timestamps' "$regression"
grep -Fq 'initial legacy row' "$regression"

# This is a static contract check only. It does not execute SQL or prove that
# the migration has been applied to a live Supabase project.
echo "Structure-aware WordPress migration contract verified (not a migrated/live database proof)."
