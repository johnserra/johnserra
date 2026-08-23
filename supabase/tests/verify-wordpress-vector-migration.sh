#!/usr/bin/env bash

set -euo pipefail

migration=${1:-supabase/migrations/00001_wordpress_vector_queue.sql}

rg -q "create extension if not exists vector" "$migration"
rg -q "embedding extensions\.vector\(768\)" "$migration"
rg -q "query_embedding extensions\.vector\(768\)" "$migration"
rg -q "context\.publication_status = 'publish'" "$migration"
rg -q "context\.locale = query_locale" "$migration"
rg -Fq 'operator(extensions.<=>)' "$migration"
rg -q "greatest\(1, least\(20, match_count\)\)" "$migration"
rg -q "pgmq\.create\('content_indexing'\)" "$migration"
rg -q "visibility_timeout_seconds" "$migration"
rg -q "content_indexing_failures" "$migration"
rg -q "fail_content_indexing_job" "$migration"
rg -q "grant execute.*service_role" "$migration"

if rg -q "vector\(1536\)|text-embedding-004" "$migration"; then
  echo "Retired or incorrect embedding configuration detected." >&2
  exit 1
fi

echo "WordPress vector and queue migration contract checks passed."
