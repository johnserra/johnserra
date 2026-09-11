# Structure-aware indexing production acceptance — 2026-09-11

[PR #26](https://github.com/johnserra/johnserra/pull/26) merged as `96bf8eea4f0787276cf49c5e602eb626b262bcf8`. Vercel production deployment `dpl_GHKgGtg8Z8riJmVAQiaNyymQdDyJ` reached READY before reindexing.

Migration `00003_wordpress_structure_aware.sql` was applied transactionally to the johnserra Supabase project after saving a private local index snapshot and confirming the queue was empty. The additive migration preserved all 226 existing rows. The deployed worker then completed 25 jobs (24 published WordPress documents and the previously approved, unchanged CV), with zero failures. The queue was empty afterward, and there were no new dead-letter records.

The live index contains 182 WordPress chunks, 18 CV chunks, and 139 retained legacy filesystem chunks: 339 total. All 200 rebuilt WordPress/CV chunks have title, section-path array, locale, document type, canonical URL, authority, and indexing/chunking configuration metadata. Empty WordPress section paths represent document-level introductory text. There are 24 durable WordPress version records. The legacy filesystem rows retain their original metadata and vectors; this rollout did not prune or reindex that separate source population.

The original 226-row snapshot contained **69 WordPress**, **18 CV**, and **139 legacy filesystem** rows. The paired comparison's earlier prose incorrectly labeled all 208 non-CV rows as WordPress; that label is corrected. The underlying machine-readable comparison, source identities, and retrieval results are unchanged.

[Live verification results](production-2026-09-11.json) reproduce the candidate result: **36/39 case hits, 37/42 expected-source hits, and no lost candidate sources**. All 12 CV cases retain their section hits. Verification used the 39 cached query vectors from the paired evaluation with the live filtered Supabase RPC, threshold 0.65 and limit 6; it made no new embedding or generation calls. Three WordPress cases still miss their expected source.

English and Turkish production homepages loaded with current WordPress content, and the English assistant panel opened. Generated-answer quality and multi-session database concurrency were not evaluated during this rollout. Transaction rollback, source isolation, stale-chunk removal, timestamp/tombstone handling, and RPC permissions were covered by the passing SQL regression suite and CI.
