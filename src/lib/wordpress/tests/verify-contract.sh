#!/usr/bin/env bash

set -euo pipefail

adapter_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

rg -q 'import "server-only"' "$adapter_dir/client.ts"
rg -q 'WORDPRESS_API_URL' "$adapter_dir/client.ts"
rg -q 'js_locale: locale' "$adapter_dir/content.ts"
rg -q '_fields: ITEM_FIELDS' "$adapter_dir/content.ts"
rg -q '"_links"' "$adapter_dir/content.ts"
rg -q '"_embedded"' "$adapter_dir/content.ts"
rg -q 'wp:item:' "$adapter_dir/content.ts"
rg -q 'js/v1/translation' "$adapter_dir/content.ts"
rg -q 'value.status !== "publish"' "$adapter_dir/normalize.ts"
rg -q 'locale !== expectedLocale' "$adapter_dir/normalize.ts"

echo "WordPress adapter contract checks passed."
