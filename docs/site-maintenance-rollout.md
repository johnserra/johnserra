# Site maintenance rollout — October 13, 2026

This document is a rollout plan, not evidence of a production change. The repository can be locally complete while WordPress, the deployed application, the queue, and indexed rows remain unchanged.

## Changed public sources

- EN/TR CareerTalkLab project pages now distinguish the existing English-learning LMS from the planned data/software career-learning direction. Grain First is the public series title; its curriculum and CareerTalkLab integration are planned.
- EN/TR portfolio teasers use the same existing-versus-planned distinction. Blog positioning no longer promises food or cooking content.
- EN/TR privacy pages, dated October 13, 2026, describe inquiry origin/submission paths, optional referral context stored with the message, session-scoped browser attribution, and aggregate GA4 completion events.
- The canonical public CV names Premium Parking as the current employer while continuing to omit the regional-location paragraph. The generated Markdown matches the canonical JSON. The prior anonymization candidate was superseded before publication. Its current offline candidate digest is `fc886f716d7ce40bfd617957855c34422872b38b16ff106a2a87e59026030f86`; this record is not production approval.
- The sitemap uses only explicit, valid modified timestamps for dynamic content. Static routes and content with unknown dates omit `lastModified`.
- Reviewed CV and factual employment-history answers may name Premium Parking and documented role, dates, duties, and parking experience. Separately, SMB analytics content must omit the company and every current or prospective location. General parking/property analytics remains educational-only through anonymized industry or synthetic examples; consulting, audits, lead collection, and sales/contact calls to action remain excluded across the full user-message history.
- Custom inquiry-completion events carry path classes plus a canonical query-free `page_location` and empty `page_referrer`; no referral host or submitted personal/form content is sent in those events. Automatic page-view behavior is outside this change.
- Active English and Turkish CV/retrieval fixtures target the stable Premium Parking employment-history source. Historical evaluation reports and baselines describe their prior corpus and are not a new evaluation against the current source or proof of live LLM compliance.

## Source and CMS boundary

Editing MDX updates the filesystem source and rollback path only. It does **not** update current WordPress production records when `CONTENT_SOURCE=wordpress`. Publish the matching EN/TR CareerTalkLab copy through the established CMS workflow as a separate, reviewed operation. Page publishing and knowledge indexing are separate operations.

## Ordered production work

1. Review the combined code/content diff and run the repository checks without live providers or production writes.
2. Apply migration `00006` before deploying or enabling the table-aware WordPress worker. Confirm the migration contract in the target database; a local PGlite pass is not proof of hosted state.
3. Deploy compatible application and worker code using caller-owned deployment procedures. Do not infer a provider, environment, or promotion target from this document.
4. Publish the exact EN/TR CareerTalkLab copy to WordPress if production is CMS-backed. Confirm the active `CONTENT_SOURCE` and verify both canonical routes.
5. Run a full published-WordPress reindex after the table-aware worker is active. Wait for queue completion, then verify the new chunking configuration and retrieval of table header-plus-row facts.
6. Run `npm run seed:cv` offline, review the canonical JSON and generated Markdown together, and record the newly printed digest. Only after human approval, run `npm run seed:cv -- --apply --approved-sha256 <new-digest>`. Never reuse the historical digest.
7. Let the compatible shared worker replace all CV chunks. Verify all expected CV rows carry the new digest and that the Premium Parking employment-history source is retrievable without regional disclosure or leakage into employer-specific SMB analytics.
8. Verify preview EN/TR pages, stable sitemap output, inquiry attribution storage, GA4 completion payloads, public-string scans, queue state, and indexed retrieval before promotion.

None of the production, CMS, database, queue, indexing, analytics-validation, or deployment steps above has been performed by this repository maintenance work. The CV digest recorded above remains a staged offline candidate, not approved or live state. The superseded anonymization candidate was likewise never approved or made live.

## Rollback limits

Application rollback or selecting the filesystem content adapter does not undo WordPress records, migrations, queued jobs, analytics already received, or vector rows. CMS copy must be reverted separately. Queue work must be paused or corrected through the operational procedure, and indexed WordPress/CV data must be restored or replaced explicitly. The CV's prior digest is historical evidence, not authorization to republish the old disclosure. Database migration rollback requires its own reviewed recovery plan; this document does not claim it is automatically reversible.

## Local verification receipt — October 13

Selected assistant, CV/chunking, attribution/API/sitemap/boundary, SQL migration, hybrid retrieval, and data-audit suites passed, along with TypeScript, changed-file ESLint, diff whitespace checks, and the normal Turbopack production build (41 static pages). Final build receipt: Ringer run `johnserra-site-maintenance-20261013T192812Z-p84395`. Tests use mocked providers and placeholder credentials. No live-provider evaluation is claimed.

Chrome verification against the filesystem preview confirmed EN/TR services routes, the opened English services chat panel, and chat launchers on English and Turkish article pages. No real inquiry or chat message was submitted. Start this local preview with `next start --hostname localhost --port 4317` and visit `http://localhost:4317`: binding to `127.0.0.1` produced self-redirects with internal `localhost` rewrites. Restarting with `localhost` resolved them without code changes. The subsequent routing scout correctly reproduced the original loop but its proposed routing refactor was rejected because the hostname-only restart fixed the tested routes.
