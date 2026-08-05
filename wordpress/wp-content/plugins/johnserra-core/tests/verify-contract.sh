#!/usr/bin/env bash

set -euo pipefail

plugin_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

for json_file in "$plugin_dir"/acf-json/*.json; do
  jq -e . "$json_file" >/dev/null
done

jq -e '.show_in_rest == 1' "$plugin_dir/acf-json/group_js_content_identity.json" >/dev/null
jq -e '.show_in_rest == 0' "$plugin_dir/acf-json/group_js_translation_link.json" >/dev/null
jq -e '.fields[] | select(.name == "locale") | .choices == {"en":"English","tr":"Turkish"}' "$plugin_dir/acf-json/group_js_content_identity.json" >/dev/null
jq -e '.fields[] | select(.name == "translation_group_id") | .readonly == 1' "$plugin_dir/acf-json/group_js_content_identity.json" >/dev/null

rg -q "rest_base.*projects" "$plugin_dir/includes/class-content-model.php"
rg -q "REST_NAMESPACE = 'js/v1'" "$plugin_dir/includes/class-translations.php"
rg -q "post_status.*=> 'publish'" "$plugin_dir/includes/class-translations.php"
rg -q "js_translation_ambiguous" "$plugin_dir/includes/class-translations.php"
rg -q "acf/settings/save_json" "$plugin_dir/includes/class-acf.php"
rg -q "acf/settings/load_json" "$plugin_dir/includes/class-acf.php"

echo "John Serra Site Core contract checks passed."
