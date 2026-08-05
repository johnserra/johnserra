# Headless WordPress Implementation Guide

This repository now supports a controlled migration from file-backed MDX to headless WordPress. The filesystem remains the default rollback source until staging content is imported and accepted.

## Architecture

```text
WordPress + ACF
  ├── REST content → Next.js server content adapter
  ├── signed preview → Next.js Draft Mode
  └── signed publish event → cache revalidation + Supabase Queue
                                               ↓
                                      Gemini embedding worker
                                               ↓
                                    Supabase pgvector retrieval
                                               ↓
                                           AI chat
```

## Environment variables

### Next.js/Vercel

```text
# Keep unset or use "filesystem" until WordPress staging is accepted.
CONTENT_SOURCE=wordpress

WORDPRESS_API_URL=https://cms.example.com/wp-json/
WORDPRESS_MEDIA_URL=https://cms.example.com
WORDPRESS_WEBHOOK_SECRET=<long-random-shared-secret>

# Restricted WordPress user with read access to drafts only as needed.
WORDPRESS_PREVIEW_USERNAME=<preview-user>
WORDPRESS_PREVIEW_APPLICATION_PASSWORD=<application-password>

NEXT_PUBLIC_SUPABASE_URL=<existing-value>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<existing-value>
SUPABASE_SERVICE_ROLE_KEY=<existing-value>
GEMINI_API_KEY=<existing-value>
CRON_SECRET=<long-random-secret>
```

Importer-only credentials stay in local/CI secrets and are not required by the deployed frontend:

```text
WORDPRESS_USERNAME=<import-user>
WORDPRESS_APPLICATION_PASSWORD=<application-password>
```

### WordPress `wp-config.php`

```php
define( 'JOHNSERRA_FRONTEND_URL', 'https://johnserra.com' );
define( 'JOHNSERRA_FRONTEND_WEBHOOK_URL', 'https://johnserra.com/api/revalidate/wordpress' );
define( 'JOHNSERRA_WEBHOOK_SECRET', '<same-value-as-WORDPRESS_WEBHOOK_SECRET>' );
```

## Deployment order

1. Provision staging WordPress with HTTPS and backups.
2. Install ACF and deploy/activate `wordpress/wp-content/plugins/johnserra-core`.
3. Confirm or sync the four ACF JSON field groups.
4. Apply `supabase/migrations/00001_wordpress_vector_queue.sql` through the Supabase SQL editor or migration workflow.
5. Configure staging frontend and WordPress secrets.
6. Run the importer dry run:

   ```bash
   npm run wordpress:import:dry
   ```

7. Review the missing-media and translation warnings, then import:

   ```bash
   npm run wordpress:import
   ```

8. Manually pair any non-inferred translations in WordPress.
9. Seed semantic search:

   ```bash
   npm run seed
   ```

10. Deploy a preview with `CONTENT_SOURCE=wordpress` and complete the acceptance checks below.
11. Enable WordPress in production only after preview acceptance.

## Verification

Repository-level checks:

```bash
bash wordpress/wp-content/plugins/johnserra-core/tests/verify-contract.sh
bash supabase/tests/verify-wordpress-vector-migration.sh
bash src/lib/wordpress/tests/verify-contract.sh
npx tsc --noEmit --incremental false
npx eslint .
npm run build
```

Staging integration checks:

- `/wp-json/wp/v2/projects?js_locale=en` returns only published English projects.
- `/wp-json/js/v1/translation?content_id=<id>&locale=tr` returns the paired Turkish record.
- Draft preview opens the correct localized frontend URL and public requests cannot read the draft.
- Publishing changes the frontend without deployment.
- Unpublishing removes the page from lists, sitemap, translations, and vector retrieval.
- Queue messages archive after success; repeated failures appear in `content_indexing_failures`.
- An unavailable WordPress origin leaves cached pages usable.
- Chat retrieval returns only the requested locale and refuses low-similarity context.

## Rollback

Set `CONTENT_SOURCE=filesystem` (or remove it) and redeploy the last accepted artifact. Do not delete `content/`, its MDX runtime dependencies, or the import manifest until the production rollback window closes. The WordPress plugin deliberately retains data when uninstalled.

## Known content exceptions

- Several referenced cover images are missing from `public/images`; the importer reports rather than fabricates them.
- `tr/blog/mimarin-atilimi-cok-kanalli-bir-dunyada-eylem-gucunu-yonetmek` has no explicit `translationOf` value and must be paired with its English equivalent during staging review.
- Privacy Policy files have no frontmatter; the importer derives their titles from the first level-one heading.
