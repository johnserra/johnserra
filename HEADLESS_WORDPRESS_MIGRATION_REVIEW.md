# Keystatic to Headless WordPress Migration Review

Reviewed: August 4, 2026

## Executive summary

This is a moderate migration, not a full-site rebuild. Keystatic itself is thinly integrated and can be removed cleanly, but the public site does **not** read through Keystatic: it reads Markdown/MDX synchronously from the repository. Moving to headless WordPress therefore means replacing the site's entire file-backed content adapter, rendering WordPress HTML instead of MDX, migrating 34 documents and their metadata, and adding cache invalidation and publishing operations.

The recommended target is:

- WordPress as an independently hosted CMS on a subdomain such as `cms.johnserra.com`.
- The native WordPress REST API, rather than WPGraphQL. This site's queries are small and map directly to posts, pages, custom post types, taxonomies, and media; GraphQL would add a plugin and schema layer without a clear current benefit.
- Standard WordPress posts for blog posts and a `js_project` custom post type for projects.
- WordPress pages for About and Privacy Policy.
- Tags as a REST-enabled taxonomy and recipe/project metadata as typed custom fields.
- A small site-specific WordPress plugin that owns the custom post type, field registration, locale/translation relationship, webhook, and any editor restrictions. Keeping this in a plugin prevents the content model from being coupled to a theme.
- Server-only fetch functions in Next.js, cached and tagged by content type, locale, and item. A signed WordPress webhook calls a Next.js route to revalidate those tags after publish/update/delete.
- WordPress-rendered block HTML for article bodies. There are currently no used MDX-only components to recreate.

Expected implementation effort is **64–116 engineering hours (roughly 8–15 working days)**, plus WordPress hosting selection/provisioning. A narrower MVP without draft preview, automated reindexing, and polished editor guardrails is about **40–60 hours**, but it would leave publishing workflow gaps.

## What exists today

### Content inventory

There are 34 repository-backed MDX documents:

| Content | English | Turkish | Total |
|---|---:|---:|---:|
| Blog posts (recipes are tagged posts) | 17 | 7 | 24 |
| Projects | 3 | 3 | 6 |
| About | 1 | 1 | 2 |
| Privacy Policy | 1 | 1 | 2 |
| **Total** | **22** | **12** | **34** |

The body-content migration is simpler than the `.mdx` extension suggests:

- No `<Callout>` components are currently used.
- No Obsidian `[[wiki links]]` are currently used.
- No Markdown inline images are currently used.
- Cover images are frontmatter paths rather than body content.

The content model currently uses these fields:

- Common: `title`, `description`, `date`, `tags`, `coverImage`.
- Recipe: `cuisine`, `servings`, `prepTime`, `cookTime`, `totalTime`, `story`.
- Project: `status`, `githubUrl`, `liveUrl`.
- Translation: `translationOf` (only sparsely populated).

### How content flows through the application

`src/lib/content.ts` is the central file-backed adapter. It reads the `content/{locale}/{type}` directories with Node `fs`, parses YAML frontmatter with `gray-matter`, sorts posts by date, resolves slugs, and transforms wiki links.

Its functions feed:

- Blog and project indexes.
- Blog and project detail pages, metadata, static parameters, and JSON-LD.
- About and Privacy Policy pages.
- The home-page blog teaser.
- The generated sitemap.
- The chat endpoint, which currently loads all About/blog/project bodies on every request.
- Translation lookup utilities (although `getTranslationSlug` is currently unused by the language switcher).

The knowledge-base seed script separately walks the filesystem. It will also need a WordPress-aware replacement or, preferably, automatic reindexing from the publish webhook.

### Keystatic's actual footprint

Keystatic is confined to:

- `keystatic.config.ts`.
- `src/app/keystatic/**`.
- `src/app/api/keystatic/**`.
- Two dependencies: `@keystatic/core` and `@keystatic/next`.
- `/keystatic` exclusions in `src/proxy.ts` and `src/app/robots.ts`.

The current Keystatic schema does not cover all repository content. It has EN/TR blog, EN projects, and EN/TR About, but no TR projects and no Privacy Policy singletons. WordPress should close that editor coverage gap.

## Recommended WordPress content model

| Current concept | WordPress representation | Notes |
|---|---|---|
| Blog post | Core `post` | Keep the existing public slug and publication date. |
| Recipe | Core `post` + `recipe` tag + recipe fields | Preserves `/blog/{slug}` and the current tag-filter behavior. |
| Project | `js_project` custom post type | REST base `projects`; do not let WordPress's public permalink control the Next.js URL. |
| About | Core `page` | One page per locale. |
| Privacy Policy | Core `page` | One page per locale. |
| Tags | Core tags | Ensure stable slugs; use term IDs/slugs rather than comparing display labels where practical. |
| Cover image | Featured media | Return the media source URL and alt text through `_embed` or an explicit media request. |
| Description | Excerpt or a dedicated SEO summary field | A dedicated field avoids WordPress auto-excerpt surprises. |
| Recipe/project fields | ACF fields | Managed via Advanced Custom Fields (ACF) with REST support toggled on. |
| Locale | REST-visible language taxonomy or field | `en` and `tr`; validate against the same locale union as Next.js. |
| Translation relation | Explicit translation-group ID/relationship | Handled through an automatically assigned ACF field, `translation_group_id`, sharing the same UUID across translations. |

For custom fields, Advanced Custom Fields (ACF) has been chosen to minimize editor development time. All custom fields (recipes, projects, and translations) will be configured in the ACF interface and serialized using ACF's local JSON feature (`acf-json`) saved within the custom site core plugin folder, keeping the schema version-controlled under Git. Because the JSON directory is in a plugin rather than the active theme, the plugin must register explicit `acf/settings/save_json` and `acf/settings/load_json` filters. Field groups must have **Show in REST API** enabled.

For multilingual translation mapping, we have decided to implement a lightweight Custom ID Mapping strategy. A custom ACF field `translation_group_id` will store a shared UUID between matching EN and TR post pairs. This keeps the database lightweight and avoids the REST API serialization complexities of Polylang/WPML. The importer and editor integration must generate and assign these IDs automatically; editors should not type or synchronize UUIDs manually.

ACF exposing the UUID in a response does not make arbitrary meta-value filtering available through the core REST API. The site core plugin should therefore provide a narrow, validated translation lookup endpoint (or add a controlled REST query parameter) that returns the published translation for a given content ID and target locale. The Next.js adapter can cache this result or build a cached translation map. The endpoint must not expose draft or private content to unauthenticated callers.

The current language switcher reuses the current pathname in the other locale. That only works when translated slugs match, while at least one Turkish post already has a translated slug. The migration should change detail-page switching to use the explicit translation relationship and fall back to the target locale's blog/projects index when no translation exists.

## Next.js changes required

### 1. Replace the content adapter

Replace `src/lib/content.ts` with an async, server-only WordPress adapter, ideally split into:

- `src/lib/wordpress/client.ts`: URL construction, REST fetch, pagination, errors, timeouts, response validation, and cache tags.
- `src/lib/wordpress/types.ts`: raw API schemas and normalized site types.
- `src/lib/wordpress/content.ts`: `getPost`, `getPosts`, `getProject`, `getProjects`, `getPage`, slugs, and translation lookup.
- `src/lib/wordpress/normalize.ts`: decode entities and map WordPress fields into a stable domain model used by pages and schema helpers.

All current synchronous callers must become async. Fetch only published content for public requests, request only needed fields with `_fields`, handle REST pagination headers, and return controlled `null`/error states instead of letting CMS outages become confusing 500s.

Validate CMS responses at the boundary (for example with Zod or equivalent). This prevents a field/plugin change in WordPress from silently breaking page rendering.

### 2. Change body rendering

Replace `MDXRemote`, `remark-gfm`, and `rehype-slug` with a trusted/sanitized HTML renderer using WordPress's `content.rendered`. Add styles for the Gutenberg HTML/classes actually permitted in the editor. If arbitrary custom blocks are later introduced, either provide server-rendered HTML for them or map known block data to React components; that is not required for the current corpus.

The current `Callout` component needs no migration because no document uses it. If callouts are desired later, register a WordPress block or pattern before editors begin using them.

### 3. Update routes and build behavior

Change blog/project `generateStaticParams`, index pages, detail pages, metadata, sitemap, home teaser, and JSON-LD helpers to await WordPress data. Preserve all public URLs exactly:

- `/blog/{slug}` and `/tr/blog/{slug}`.
- `/projects/{slug}` and `/tr/projects/{slug}`.
- `/about`, `/privacy-policy`, and locale-prefixed equivalents.

Do not require a full Vercel deployment for every edit. Cache content reads with tags such as `wp:posts:en`, `wp:post:{id}`, and `wp:projects:tr`, then invalidate them from a signed route handler. Current Next.js guidance recommends tag-based revalidation for CMS content because it avoids over-invalidating unrelated pages.

WordPress media URLs are remote, so add the exact CMS/media host and path to `images.remotePatterns`. Preserve featured-image alt text. Decide whether existing files remain under `johnserra.com/images` or are imported into the WordPress media library; importing is recommended so editors have one source of truth.

### 4. Publishing webhook and preview

Add a route such as `POST /api/revalidate/wordpress` that:

- Requires an HMAC signature or high-entropy shared secret.
- Accepts post ID, type, locale, old/new slug, status, and operation.
- Rejects unknown types/locales and applies rate limits/body limits.
- Invalidates collection, item, sitemap, and relevant home-page tags.
- Handles unpublish/delete and slug changes, not just publish/update.
- Enqueues knowledge-base reindex/delete work idempotently without blocking the webhook response.

Add draft preview using a Next.js preview/draft route and an authenticated WordPress request. WordPress Application Passwords are revocable per-application credentials intended for API access; keep them server-side in Vercel environment variables. Public published-content reads need no credential.

### 5. Chat and knowledge base

`src/app/api/chat/route.ts` currently reads the complete site corpus from disk on every chat request. With a remote CMS, doing equivalent uncached network reads would add latency and a runtime dependency on WordPress.

To solve this, we will upgrade the RAG pipeline to use **Vector Similarity Search (pgvector)**:

- Enable the pgvector extension and add a 768-dimension `embedding` column to the Supabase `career_context` table.
- Use Gemini `gemini-embedding-2` with `outputDimensionality: 768`. The former `text-embedding-004` model was shut down on January 14, 2026 and must not be used.
- Generate document embeddings with the retrieval-document task type and query embeddings with the retrieval-query task type. Both sides must use the same model, output dimensions, normalization assumptions, and versioned embedding configuration.
- Stop dynamically fetching post bodies inside the Next.js chat API route. Generate an embedding for the user's latest query, call a parameterized Supabase similarity-search RPC, and supply only the highest-scoring authorized chunks to the chat model.
- Update `scripts/seed-knowledge-base.ts` to fetch WordPress content, strip HTML, chunk content, generate embeddings using the Gemini SDK, and seed them into Supabase.
- Give every chunk a durable identity based on WordPress content ID, locale, and chunk index. Store the content type, slug, title, publication status, embedding model/config version, and WordPress modification timestamp in metadata.
- Make indexing idempotent: replace all chunks for a changed content item transactionally where practical, and delete all chunks immediately when content is unpublished or deleted.
- Do not calculate embeddings inside the publishing/revalidation request. After authenticating and revalidating content, the webhook should enqueue an idempotent indexing job and return promptly. The worker performs WordPress retrieval, chunking, embedding, retries, and upsert/deletion. Failed jobs must be observable and safely replayable.
- Define a similarity threshold, maximum result count, and a no-results behavior so weak semantic matches are not presented to the chat model as facts.

This also fixes a current mismatch: the seeder looks for `portfolio` directories, but the repository uses `projects`, so project content is not seeded through those paths today.

## Content import and cutover

Build an idempotent one-off importer rather than manually copy/pasting 34 documents. It should:

1. Parse current frontmatter and Markdown.
2. Convert Markdown to Gutenberg-compatible HTML/blocks.
3. Create/update content by a durable legacy key, not title.
4. Preserve slug, locale, publication date, status, tags, excerpts, custom fields, and translation relationships.
5. Upload and attach media, preserve filenames where useful, and set alt text.
6. Emit a manifest mapping old file → WordPress ID → final URL.
7. Report missing files, duplicate slugs, invalid dates/fields, and unresolved links without silently skipping them.

Run it first against staging, compare every route, freeze content edits briefly, run a final incremental import, switch the Next.js environment to production WordPress, and retain the MDX content in Git for at least one rollback window. Removing the runtime content folder can happen in a later cleanup commit after production verification.

### Existing data issues to resolve during import

- Only five image files currently exist under `public/images`, while multiple posts reference recipe and blog cover paths that are absent. At least seven recipe image names and four blog image names are referenced but missing locally.
- One Turkish cover path lacks a leading slash; another related filename uses uppercase characters. Normalize paths during import.
- Several posts have empty `coverImage` values.
- `translationOf` is not consistently populated, so EN/TR pairs must be reviewed or inferred once and saved explicitly in the import manifest.
- Project `liveUrl` exists in content but is not part of the TypeScript `Frontmatter` interface and is not displayed on the project detail page. Decide whether WordPress should expose and the site should render it.
- Keystatic's project schema includes `coverImage`, but project detail currently does not render it. Preserve the field pending a product decision.

## Removal checklist

After WordPress-backed pages pass verification:

- Delete `keystatic.config.ts`.
- Delete `src/app/keystatic` and `src/app/api/keystatic`.
- Remove `@keystatic/core` and `@keystatic/next` from `package.json` and regenerate the lockfile.
- Remove the Keystatic exclusions from `src/proxy.ts` and `src/app/robots.ts`.
- Remove `gray-matter`, `next-mdx-remote`, `remark-gfm`, and `rehype-slug` only after no importer/runtime code uses them.
- Remove or archive `content/` only after the rollback window.
- Update `README.md`, `CLAUDE.md`, `GEMINI.md`, deployment environment documentation, and the site's “Building This Site” article.
- Add CMS health/error monitoring and document backup/restore, plugin updates, credential rotation, and webhook troubleshooting.

## Work estimate

| Workstream | Estimate |
|---|---:|
| Provision/stage WordPress, TLS, backups, base hardening | 4–8 h |
| Content-model plugin, fields, roles, locale/translation model | 8–16 h |
| Typed REST client, normalization, caching, error handling | 10–16 h |
| Convert pages, metadata, sitemap, JSON-LD, body styles, media | 12–20 h |
| Importer, content conversion, media migration, manifest | 8–14 h |
| Signed webhook, revalidation, draft preview | 6–12 h |
| Chat/seeder integration, pgvector migration, and asynchronous reindexing | 8–16 h |
| End-to-end QA, SEO/URL checks, cutover, docs, rollback drill | 8–14 h |
| **Total** | **64–116 h** |

The range is driven mostly by multilingual editor UX, preview fidelity, missing media recovery, and how much Gutenberg styling/block freedom is allowed. It does not include WordPress hosting fees, paid plugin licenses, writing new translations, or redesigning the frontend.

## Risks and controls

| Risk | Control |
|---|---|
| WordPress outage slows or breaks uncached pages/builds | Tagged persistent caching, timeouts, controlled errors, CMS monitoring, and no live CMS fetch in the browser. |
| Stale content after publishing | Signed webhook plus a periodic fallback revalidation window and observable webhook logs. |
| XSS or unsafe editor HTML | Limit editor capabilities/blocks, rely on WordPress sanitization, sanitize at the frontend boundary, and never render untrusted API fields as HTML. |
| URL/SEO loss | Preserve slugs, dates, metadata, canonical/hreflang behavior, sitemap entries, and add redirects only for unavoidable slug changes. Crawl old vs new route manifests before cutover. |
| Translation switch goes to a 404 | Explicit translation relationships and a defined index fallback. |
| Plugin/schema drift | Site-specific schema plugin in version control, staging promotion, response validation, and contract tests. |
| Media hotlink/configuration failures | Import media, use one canonical HTTPS host, configure narrow `remotePatterns`, and verify every image URL. |
| WordPress becomes a larger security/maintenance surface | Managed hosting, automatic core security updates, minimal plugins, 2FA for users, backups, least privilege, and private/noindex CMS frontend. |
| Git-based rollback is lost | Keep the MDX adapter/content until production acceptance and tag the last Keystatic deployment. |

## Acceptance criteria

- All 34 documents exist in WordPress with a recorded source-to-ID manifest.
- Every existing public URL returns the same intended content and correct locale, or an approved redirect.
- Blog tag filtering, recipe metadata, project links, cover images, metadata, JSON-LD, sitemap, and home teaser work from WordPress data.
- Publishing, updating, unpublishing, deleting, and changing a slug update the site without redeployment.
- Draft preview works only for authenticated editors and never leaks drafts into public caches.
- The EN/TR switch follows actual translations and has a tested missing-translation fallback.
- Chat and Supabase indexing reflect content updates and remove unpublished/deleted content.
- A CMS outage test demonstrates acceptable cached-site behavior.
- Keystatic routes return 404, dependencies are absent, and the app builds/lints/tests cleanly.
- Rollback to the last file-backed deployment is documented and tested before deleting repository content.

## Recommended delivery sequence

1. Decide WordPress hosting and media ownership. ACF and UUID-based translation mapping are already selected.
2. Provision a staging WordPress instance and implement the version-controlled content-model plugin.
3. Build the importer and validate all 34 records plus media/translation exceptions.
4. Add the typed WordPress adapter behind the same normalized model and migrate all readers.
5. Add caching, signed revalidation, preview, and knowledge-base updates.
6. Perform route-by-route visual/SEO/structured-data testing and an outage test.
7. Freeze edits briefly, run final import, cut over, monitor, and retain the MDX rollback path.
8. Remove Keystatic and later archive file content after the agreed rollback period.

## References

- [WordPress REST API Handbook](https://developer.wordpress.org/rest-api/)
- [REST support for custom content types](https://developer.wordpress.org/rest-api/extending-the-rest-api/adding-rest-api-support-for-custom-content-types/)
- [Adding registered custom fields to REST responses](https://developer.wordpress.org/rest-api/extending-the-rest-api/modifying-responses/)
- [WordPress REST endpoint reference](https://developer.wordpress.org/rest-api/reference/)
- [WordPress Application Passwords](https://developer.wordpress.org/advanced-administration/security/application-passwords/)
- [ACF REST API integration](https://www.advancedcustomfields.com/resources/wp-rest-api-integration/)
- [Gemini embedding model guidance](https://ai.google.dev/gemini-api/docs/embeddings)
- [Gemini model deprecations](https://ai.google.dev/gemini-api/docs/deprecations)
- [Next.js revalidation guidance](https://nextjs.org/docs/app/getting-started/revalidating)
- [Next.js remote image configuration](https://nextjs.org/docs/app/api-reference/components/image#remotepatterns)
