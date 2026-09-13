# Bounded evidence agent

Issue #19 replaces the production issue #16 selection/batch/final-answer path with a finite evidence-gathering loop. The public `/api/chat` contract is unchanged: the route still emits newline-delimited `delta`, one terminal `done` or typed `error`, and the existing cancellation, backpressure, UTF-8 output cap, and correlation header behavior.

## Runtime architecture

`src/lib/chat/agent-loop.ts` owns a provider-independent state machine:

1. Interpret the request. Greetings and pleasantries take one tool-disabled direct provider turn and stop with `direct_no_tools`.
2. Formulate or rewrite a retrieval query and select only the read-only tool registry functions.
3. Validate the complete raw batch before dispatch. Accepted distinct executions are capped at three across the request; canonical duplicates execute once and reuse their accepted result.
4. Inspect the accepted public evidence. A bounded JSON decision may explicitly request one rewritten retrieval query; at most two retrieval rounds are allowed.
5. Buffer a tool-disabled draft. The draft is never streamed.
6. Invoke one bounded JSON verifier over only the draft and accepted public evidence. An accepted answer or complete revision is the only answer streamed. Malformed verifier output fails closed to a concise qualification.
7. Emit one terminal privacy-safe agent trace summary and record its stop reason on `chat_request_completed.agentStopReason`.

The finite controls are named in `src/lib/chat/limits.ts`: three accepted tool executions, two retrieval rounds, one verification pass, twelve state steps, a 45-second overall model deadline, bounded internal output, conservative token reservation, provider output limits, and an estimated cost ceiling. These are safety ceilings, not semantic proof. Missing or delayed provider usage never grants another turn.

## Stop reasons

The stable vocabulary is `direct_no_tools`, `supported_evidence`, `qualified_completion`, `insufficient_evidence`, `all_tools_failure`, `verifier_failure`, `inspection_failure`, `deadline_exceeded`, `budget_exceeded`, `provider_failure`, `output_limit`, and `cancellation`. Every agent path records exactly one. Tool failures are safe metadata only; successful sibling evidence can still produce a qualified answer. If no evidence is available, or inspection/verifier output cannot be safely validated, the answer is a short qualification rather than an unverified draft.

The verifier is a bounded review step, not deterministic semantic proof. Its claim totals are telemetry/evaluation counters, and the offline evaluator's support/citation numbers are structural proxies over fixture metadata.

## Privacy-safe trace

The one `chat_agent_trace` event contains stable stages, stop reason, counts, booleans, bounded usage/cost completeness, claim totals, latency, and the correlation ID. It excludes prompts, user messages, query strings, arguments, evidence, answer text, URLs, source/provider IDs, raw provider errors, stack traces, credentials, and secrets. Trace callback/logger failures are ignored.

## Offline evaluation

The checked-in deterministic corpus is [`evals/agent-loop/cases.json`](../evals/agent-loop/cases.json). It covers the direct greeting shortest path, first-round success, explicit second-round insufficiency, claim removal/qualification, partial and total tool failure, verifier timeout/malformed output, deadline, budget, cancellation, and raw-cap enforcement.

```bash
pnpm run eval:agent-loop:validate
pnpm run eval:agent-loop:offline -- --output-dir /tmp/johnserra-issue19-agent-report
```

Reports are sanitized JSON/Markdown fixture replays and must be written to an explicitly supplied output directory. They do not establish live Gemini, Supabase, WordPress, latency, or semantic-quality reliability. Infrastructure failures, unknown usage, and partial usage are reported separately rather than treated as quality passes. The issue #16 evaluator remains available under `eval:tool-calling:*` for compatibility and legacy safety coverage.
