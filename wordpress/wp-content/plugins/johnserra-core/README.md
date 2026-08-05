# John Serra Site Core

Site-specific WordPress content model and REST extensions for the headless `johnserra.com` frontend.

## Requirements

- WordPress 6.5 or newer.
- PHP 8.1 or newer.
- Advanced Custom Fields 6.x (free or Pro).
- HTTPS in staging and production.

## Installation

1. Copy `johnserra-core` into `wp-content/plugins/` or deploy it through the WordPress host's Git workflow.
2. Install and activate Advanced Custom Fields.
3. Activate **John Serra Site Core**.
4. Open **Custom Fields → Tools** and confirm the four JSON-backed field groups are available. If ACF reports them as available for sync, sync them once.
5. In **Settings → Permalinks**, save once after initial installation if another plugin or host requires a rewrite refresh.

Do not edit production field groups without committing the resulting `acf-json` changes back to this repository.

Repository-level contract checks can be run with:

```bash
bash wordpress/wp-content/plugins/johnserra-core/tests/verify-contract.sh
```

These checks validate the JSON and expected hooks but do not replace PHP linting or integration tests against WordPress and ACF.

## Content model

- Blog and recipe content uses core WordPress posts.
- Projects use the REST-enabled `js_project` post type at `/wp-json/wp/v2/projects`.
- About and Privacy Policy use core pages.
- Posts and projects use core tags. A `recipe` tag identifies recipe posts.
- Featured images use WordPress featured media.
- ACF fields provide locale, summary, migration identity, recipe metadata, project metadata, and translation relationships.

## Translation workflow

1. Create both content records and set their locales.
2. On either record, choose the other under **Translation Peer**.
3. Save the record. The plugin assigns the same UUID to both records and links them bidirectionally.
4. Never edit `translation_group_id` directly.

Public translation lookup:

```text
GET /wp-json/js/v1/translation?content_id=123&locale=tr
```

The source and result must both be published, use the same post type, and share a valid UUID. The endpoint returns `404` for a missing translation and `409` if corrupt data produces more than one match.

Example response:

```json
{
  "id": 456,
  "type": "post",
  "slug": "ornek-yazi",
  "locale": "tr",
  "translation_group_id": "c0fbe9c5-251e-4d42-814f-e3a42148c203",
  "link": "/tr/blog/ornek-yazi",
  "modified_gmt": "2026-08-05T01:00:00+00:00"
}
```

## REST exposure

ACF field groups used by the frontend have `show_in_rest` enabled. The editor-only `translation_peer` group is deliberately excluded. Public consumers should request only required fields with `_fields` and must not use authenticated `edit` context for ordinary page rendering.

## Deliberate omissions from phase one

- WordPress-to-Next.js signed webhook and preview integration.
- Content importer.
- Supabase queue, pgvector migration, and embedding worker.
- Next.js WordPress client.

Those belong to later migration phases and should use this plugin's content contract.
