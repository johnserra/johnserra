# Bounded multi-tool evaluation

Issue #16 demonstrates and evaluates the issue #18 tool architecture without turning chat into an open-ended agent. One Gemini selection response may request several approved functions. The server validates the complete batch, rejects more than five requested calls before dispatch, canonicalizes equivalent validated calls, executes each distinct call in deterministic provider order, and permits at most one tool-disabled final model response. Production issue #19 now uses the bounded evidence agent documented in [bounded-evidence-agent.md](bounded-evidence-agent.md); this evaluator remains a compatibility corpus for the reusable tool validation/dispatch safety layer.

## Corpus and commands

The dedicated versioned corpus is [`evals/tool-calling/cases.json`](../evals/tool-calling/cases.json), validated by [`tool-calling-schema.ts`](../scripts/evaluation/tool-calling-schema.ts). It contains ten public fixture cases: five multi-source cases with at least two complementary successful tools expected, the public AI-product-role demo, a partial-failure case, an all-failure case, a call-cap control, and two simple greeting controls. The demo expectation is project-oriented public evidence plus the reviewed CV; it does not encode an answer or fabricate a project slug.

```bash
npm run eval:tool-calling:validate
npm run eval:tool-calling:offline -- --output-dir /tmp/johnserra-tool-calling-report
```

Validate-only performs strict schema checks and writes nothing. Offline mode uses only checked-in fixtures and writes sanitized JSON/Markdown reports to the selected directory. It runs without Gemini, Supabase, WordPress, or credentials. Live mode is intentionally not implemented for this issue; no live reliability claim is made. The repository reports directory contains only `.gitkeep`; use a temporary directory for reports or an intentionally reviewed dated baseline.

Schema validation rejects unknown fields, duplicate case IDs, duplicate nested result IDs, invalid tool names, invalid regexes/URLs, citations to project slugs absent from the repository's public project sources, impossible minimum-success expectations, inconsistent call-cap expectations, mismatched or unreferenced fixture results, fewer than five multi-source cases, and fewer than two no-tool controls. Fixture answers and evidence are sanitized summaries grounded in the repository's public project files, public article, and reviewed CV; private conversations and secrets are not accepted as corpus material.

## Metrics and interpretation

The evaluator records per case: selected tools, result dispositions, requested/unique/executed/duplicate counts, successful distinct tool count, call-limit compliance, graceful-degradation outcome, and answer scoring. Aggregate numerators and denominators cover:

- selected-tool precision and recall;
- unnecessary-tool and incorrect-tool rates;
- redundant requested and accepted-executed calls;
- call-limit compliance;
- successful distinct tools;
- graceful-degradation pass/fail;
- separate evidence and citation support; and
- answer-faithfulness and no-tool control accuracy.

A conclusion is marked faithful only when every configured required fact and citation reference is present in a successful fixture result and the answer passes configured deterministic phrase/citation checks. Those checks are proxies, not semantic proof that a generated sentence is correct or that a citation supports its nearby claim. Infrastructure failures must be reported separately and never converted into quality passes.

## Runtime limits, degradation, and privacy

The five-tool allowlist, strict argument/result schemas, UTF-8 result caps, per-tool deadlines, request deadline, NDJSON framing, and production completion/per-dispatch logs remain unchanged. Equivalent calls use validated tool name plus recursively sorted validated arguments, so different provider IDs or argument key order execute once while every original ID receives the same accepted result. `toolCallCount` and the evaluator's executed-call metric count accepted bounded results, not failed attempts or response aliases.

Handler errors, per-tool timeouts, invalid results, and oversized results become small typed function-response errors with stable category and retryable boolean. Successful sibling evidence is retained and the final model is told to acknowledge unavailable evidence. If every selected call fails, the final model is not asked to answer without evidence. Unknown tools, invalid arguments, cancellation, and over-limit batches fail the whole request before unsafe execution.

Development/evaluation can receive one `chat_multi_tool_trace` after direct selection, safe degradation, all-failure termination, cancellation, or final completion. It contains only correlation ID, stable tool names/unknown marker, selected/unique/duplicate counts, per-call disposition/category, accepted result kind/count/citation count, and final stop state. It never contains raw prompts, arguments, evidence, answers, provider IDs, scores, provider errors, secrets, or stack traces. Production suppresses this trace and retains the existing completion and per-dispatch events. Direct no-tool answers record zero selected and executed tools.

## Rollback

Rollback is a normal code rollback of the owned route/chat/evaluation/docs changes; no database migration or data rollback is needed. If multi-tool behavior is unavailable, redeploy the last accepted build and verify the existing NDJSON framing, then leave the fixture corpus/report history unchanged. This task ran no live Gemini request and no production test.
