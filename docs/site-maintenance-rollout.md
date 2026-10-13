# Site maintenance rollout — October 13, 2026

Production rollout completed on October 13, 2026. The receipts below distinguish the original implementation checks from the later authorized deployment, CMS synchronization, indexing, and live inquiry verification.

## Changed public sources

- EN/TR CareerTalkLab project pages now distinguish the existing English-learning LMS from the planned data/software career-learning direction. Grain First is the public series title; its curriculum and CareerTalkLab integration are planned.
- EN/TR portfolio teasers use the same existing-versus-planned distinction. Blog positioning no longer promises food or cooking content.
- EN/TR privacy pages, dated October 13, 2026, describe inquiry origin/submission paths, optional referral context stored with the message, session-scoped browser attribution, and aggregate GA4 completion events.
- The canonical public CV names Premium Parking as the current employer while continuing to omit the regional-location paragraph. The generated Markdown matches the canonical JSON. The prior anonymization candidate was superseded before publication. Its approved and indexed digest is `fc886f716d7ce40bfd617957855c34422872b38b16ff106a2a87e59026030f86`; production application is recorded below.
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

The ordered work above was subsequently authorized and completed as recorded below. The superseded anonymization candidate was never made live. No live LLM conversation evaluation is claimed.

## Rollback limits

Application rollback or selecting the filesystem content adapter does not undo WordPress records, migrations, queued jobs, analytics already received, or vector rows. CMS copy must be reverted separately. Queue work must be paused or corrected through the operational procedure, and indexed WordPress/CV data must be restored or replaced explicitly. The CV's prior digest is historical evidence, not authorization to republish the old disclosure. Database migration rollback requires its own reviewed recovery plan; this document does not claim it is automatically reversible.

## Local verification receipt — October 13

Selected assistant, CV/chunking, attribution/API/sitemap/boundary, SQL migration, hybrid retrieval, and data-audit suites passed, along with TypeScript, changed-file ESLint, diff whitespace checks, and the normal Turbopack production build (41 static pages). Final build receipt: Ringer run `johnserra-site-maintenance-20261013T192812Z-p84395`. Tests use mocked providers and placeholder credentials. No live-provider evaluation is claimed.

Chrome verification against the filesystem preview confirmed EN/TR services routes, the opened English services chat panel, and chat launchers on English and Turkish article pages. No real inquiry or chat message was submitted. Start this local preview with `next start --hostname localhost --port 4317` and visit `http://localhost:4317`: binding to `127.0.0.1` produced self-redirects with internal `localhost` rewrites. Restarting with `localhost` resolved them without code changes. The subsequent routing scout correctly reproduced the original loop but its proposed routing refactor was rejected because the hostname-only restart fixed the tested routes.

## Production closeout receipt — October 13

- Code commit `5e4435d6d825ad8025c90b8482a567c3c3027b79` passed GitHub CI and deployed READY to production Vercel deployment `dpl_2h12o5gyaw5pz53HFtz4uz2Wu78W`, serving johnserra.com on Node24.
- Supabase migration00006 applied through SQL Editor with function-body MD5 changing from `ead3143922c37537312a8599df2554f6` to `6ad34bdb39fcc8c66ebc29fe7e256a6b`. Verified v1/v2 support and service-role-only execution. No migration-history table existed; no CLI ledger registration is claimed.
- Full published WordPress reindex completed56/56 sources with zero failures. Independent verification found659 chunks, all structure-aware-v2;45 chunks contained pipe-delimited table rows. CV and legacy fingerprints were preserved during that full reindex.
- Five reviewed WordPress content-only updates applied to EN/TR CareerTalkLab projects51/64, EN/TR privacy pages47/62, and article37's employer link. Prior bodies matched the reviewed versions exactly. Metadata stayed unchanged. Public browser checks passed after cache revalidation.
- The corrected CV digest above was separately authorized and indexed. All18 rows matched the canonical CV chunks; Premium Parking remained named and the removed regional paragraph remained absent. Six targeted CMS/CV jobs completed with zero failures and unrelated row fingerprints unchanged. Final physical queue0, failures0.
- Live English contact, services, and data-audit tests were explicitly authorized and submitted through Chrome. All three displayed successful completion. Supabase contact_messages IDs48/49/50 retained landing path `/blog/orchestrating-agency-multi-track-world`, submission paths `/contact`, `/services`, `/data-audit`, and matching form kinds. The assessment also stored referral context `self_service`.
- Four expected emails arrived in the owner's inbox: contact, services, assessment internal notification, and assessment results. The assessment consent checkbox received separate explicit authorization following automatic review.
- GA4 property405360888 realtime received two `inquiry_completed` events (contact/services), with landing_path_class=blog, and one assessment `lead_submitted` event. The assessment intentionally uses its existing event name rather than inquiry_completed.
- Synthetic records and analytics events were retained as evidence; exclude this test session from conversion/baseline interpretation. No customer inquiries were modified. Live Turkish submission/email flows and live LLM conversations were not exercised; earlier offline/bilingual checks remain their evidence.

Ringer receipts: full reindex `johnserra-site-maintenance-20261013T203727Z-p104043`; CMS/CV apply `johnserra-site-maintenance-20261013T205004Z-p109677`. Production migration SQL receipt: https://supabase.com/dashboard/project/ketrztlmxrtiorftgqkb/sql/5f926ec1-3b01-4427-9b6a-8922a79ffebe

The maintenance rollout is complete. Audience-baseline measurement and subsequent editorial planning remain separate tasks.
