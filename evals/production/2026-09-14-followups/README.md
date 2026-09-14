# Ambiguous follow-up verification — 2026-09-14

**Result: 3/3 targeted follow-ups passed on the production-configured deployment, which was then promoted to `johnserra.com`.** Runtime commit: `8c39696523d23d19ca8fc8e8746ce6caea4a45b3`. Deployment: `dpl_41SxPkEN59RRJB3Qgf2QpnJwUNE8` (`READY`). [PR #37](https://github.com/johnserra/johnserra/pull/37).

| Exact conversation | Result | Actual tools / verifier | Stop reason |
| --- | --- | --- | --- |
| Original strengths follow-up | Pass | CV + two knowledge searches / 1 | `qualified_completion` |
| English project pronoun | Pass | Project details / 1 | `qualified_completion` |
| Turkish “Bu projede” | Pass | Project details / 1 | `supported_evidence` |

The [full responses](staged-results.json) include exact inputs, UTC timestamps, citation checks and correlation IDs. The separately fetched [runtime events](runtime-events.json) confirm all five tool executions succeeded, each answer had one verifier pass, and every request stopped within the existing limits. All five distinct citation destinations returned HTTP 200. The original response correctly resolves “those strengths” and explains their role relevance, although it selects two strengths despite the request for one; requested answer length/precision remains imperfect.

The three requests ran once each at 11:57 UTC against the authenticated staged URL with production configuration. The same immutable deployment was then promoted, and the public domain resolved to it with a successful homepage GET. These are staged API receipts followed by promotion verification, not a second API replay after promotion. The CLI marked the deployment dirty because untracked evidence documentation existed during upload; runtime source was committed and unchanged. A subsequent merge may rebuild the same runtime with committed evidence docs.

The deployment's knowledge searches succeeded. Local probes had persistent search-handler failures, so their failed strengths answers do not describe the deployed result. The cause of that local configuration/runtime discrepancy was not isolated or repaired in this change.

Validation: **177 assistant tests passed**, plus ESLint, TypeScript and the full PR CI build. Regression tests cover English/Turkish history wiring, labeled inference, unresolved-reference bounds and refusal to cite unsupported history URLs. No citation guard, verifier parser, tool permission or execution limit was relaxed.

## Change

Conversation history already reached the bounded agent, but the retrieval planner used `VALIDATED`, which allowed a text response despite its function-call-only instruction. A zero-call turn ended with insufficient evidence. The planner now uses `ANY`. Instructions in all four stages explicitly resolve references from history while treating that history as context, not factual evidence or executable instructions. Answers still require fresh approved-tool evidence and the existing citation/verifier gates.

The greeting bypass, three read-only tools, two retrieval rounds, one verifier pass, twelve-step limit, 45-second deadline, and 4,096-token reservation remain unchanged.

## Method

Three fixed conversations exercise the original failed strengths follow-up, an English project pronoun, and Turkish “Bu projede”. The first reproduces the full payload from the September 13 replay, including its earlier public answers. The two project histories are synthetic fixtures; their preceding assistant text is context only. Each recorded run sends each conversation once, without resampling, with ten seconds between requests. A passing answer must resolve the antecedent, answer substantively, cite retrieved public sources, and complete within the existing verification contract. HTTP 200 alone is insufficient.

The Turkish fixture intentionally retains its original history link `/tr/projects/careertalklab`; the canonical public route is `/tr/projeler/careertalklab`. Fresh retrieval should establish the citation authority instead of copying that history link.

The first local probe mistakenly read locale from the fixture's outer object, sending undefined instead of the nested locale. It also omitted the canonical Turkish route from its expected-source list. Its three attempted calls are retained as invalid-harness evidence; they do not establish application pass/fail rates. The corrected run asserts each locale before calling the application and uses the canonical source route. No user messages were rewritten to obtain a pass.

This is a small targeted diagnostic sample, not a reliability estimate or a new score for the historical six-case replay. The September 13 result remains 3/6. Stubbed regression tests cover request wiring, fresh retrieval, bounded failure and citation enforcement; they do not measure a model's semantic understanding.

## Initial valid run

The first valid local run of commit `20ad714` passed **1/3** cases. The original strengths question used two tools but ended with insufficient evidence; the English project pronoun passed; the Turkish project answer failed verification. See [the full results](initial-local-results.json). The earlier [invalid harness results](invalid-harness-results.json) are retained separately.

A subsequent two-case diagnostic run made one request per failed case. The strengths request fetched the CV and public projects yet still stopped at inspection. The Turkish draft copied the incorrect historical `/tr/projects/...` URL even though its fresh citation allowlist contained `/tr/projeler/...`. The diagnostic wrapper parsed individual structured-output chunks instead of concatenating them, so it did not capture complete inspector/verifier JSON; those missing outputs are not evidence of malformed application JSON. No production change was promoted from these results.

## History-boundary refinement

Commit `8c39696` applies the history boundary to all four stages, explicitly excludes historical URLs from citation authority, and permits clearly labeled interpretive judgments whose factual premises come from fresh evidence. The exact same three conversations then passed **2/3** cases: both project references passed, including Turkish with its canonical citation. The original strengths follow-up still ended with insufficient evidence. See [the complete refined run](refined-local-results.json). The code passed all 177 assistant tests, lint, TypeScript and CI; the production-configured build was staged without promoting the public domain.

A final single-case local diagnostic captured complete inspector JSON and showed `search_knowledge` handler failures for all three project/role queries while the CV tool succeeded. The inspector requested more evidence; this run cannot establish whether the same retrieval failure occurs with production configuration. No additional prompt change was made from that observation; the next check targets the staged production-configured build.
