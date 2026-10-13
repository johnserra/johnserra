# Website inquiry measurement

The three inquiry flows emit a completion event only after their server request succeeds:

- `inquiry_completed` for Contact and Services.
- Existing `lead_submitted` for Data Audit.

Parameters are deliberately bounded: `form_kind`, `landing_path_class`, and `submission_path_class`, plus the GA4 standard keys `page_location` and `page_referrer`. For these custom completion events, `page_location` is overwritten with the canonical first-party form URL (without query or hash) and `page_referrer` is empty, so GA4 does not inherit sensitive automatic browser context. The parameters never contain names, email addresses, companies, form text, assessment answers, referral text or host, query strings, or hashes. This override applies only to the custom completion events; it does not redesign or suppress GA4's automatic page views. The first landing path is kept in bounded session storage and safely falls back to the current local path when storage is unavailable. The database record and owner email receive validated local paths plus an optional referral hostname in a marked attribution block.

In GA4, register the three parameters as event-scoped custom dimensions and mark `inquiry_completed` and `lead_submitted` as key events. Use existing GA4 sessions or page views as the denominator; do not add a second traffic counter. Segment by `form_kind` and path class, not raw URL.

Counts and conversion rates are unknown until this code is deployed and GA4 has collected new events. Referral hostname is retained with the inquiry record for operational context but is intentionally excluded from analytics. Landing and submission classes are client-reported attribution, not independently verified server facts. Session storage is browser/session scoped, may be blocked, cleared, or altered, and does not provide cross-device or cross-session attribution. Direct/unknown referral and browser privacy controls therefore limit attribution completeness.
