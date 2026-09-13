# Chat observability runbook

`POST /api/chat` emits privacy-safe structured Vercel runtime logs. A completion event is emitted after the stream terminates, including provider errors, tool failures, timeouts, output-limit termination, and client cancellation. The current bounded agent also emits one sanitized `chat_agent_trace` for its terminal state. Neither event is persisted in Supabase or another application store.

## Correlation

The server creates a UUID v4 before request validation. A client-supplied value is ignored. The same value is returned in `X-Chat-Correlation-Id` on JSON errors and the NDJSON streaming response. Use that value to join the response, `chat_request_completed`, `chat_agent_trace`, and any `chat_tool_execution` events. It is the only request identity retained in these logs.

## Completion event

The event name is `chat_request_completed`, schema version `1`. The following is a synthetic shape with synthetic values; it is not a captured production trace:

```json
{
  "event": "chat_request_completed",
  "schemaVersion": 1,
  "timestamp": "2026-09-13T12:34:56.789Z",
  "correlationId": "00000000-0000-4000-8000-000000000000",
  "route": "/api/chat",
  "locale": "en",
  "httpStatus": 200,
  "outcome": "success",
  "failureCategory": null,
  "durationMs": 842,
  "stages": { "validationMs": 1, "rateLimitingMs": 8, "preparationMs": 270, "generationMs": 563 },
  "retrieval": { "resultCount": 4, "candidateCount": 12, "noContext": false },
  "generatedUtf8Bytes": 516,
  "citationCount": 2,
  "hasCitations": true,
  "toolCallCount": 2,
  "stopReason": "stop",
  "agentStopReason": "supported_evidence",
  "model": "gemini-2.5-flash"
}
```

The full event also carries sanitized `diagnostics`, usage/cost fields, and the route's normalized failure category. Unreached stages and unavailable metrics are `null`; zero means a reached value whose true count is zero. `stopReason` is the normalized provider finish reason. `agentStopReason` is the finite agent outcome and is no longer an always-null field. Possible agent reasons are `direct_no_tools`, `supported_evidence`, `qualified_completion`, `insufficient_evidence`, `all_tools_failure`, `verifier_failure`, `inspection_failure`, `deadline_exceeded`, `budget_exceeded`, `provider_failure`, `output_limit`, and `cancellation`.

The 45-second agent/model deadline should be interpreted separately from HTTP transport behavior. A client disconnect or platform timeout can end the stream before the agent completes, and a successful HTTP status does not establish that the answer was supported.

## Agent trace

The terminal `chat_agent_trace` is correlated by the same UUID and contains only bounded metadata:

```json
{
  "event": "chat_agent_trace",
  "schemaVersion": 1,
  "correlationId": "00000000-0000-4000-8000-000000000000",
  "stopReason": "supported_evidence",
  "stageSequence": ["interpret", "retrieve", "inspect", "draft", "verify", "stop"],
  "stepCount": 7,
  "selectedCallCount": 2,
  "acceptedToolExecutions": 2,
  "duplicateCallCount": 0,
  "retrievalRounds": 1,
  "verificationPasses": 1,
  "toolFailureCount": 0,
  "evidenceAvailable": true,
  "draftCreated": true,
  "revisionApplied": false,
  "claimTotals": { "supported": 3, "qualified": 0, "removed": 0 },
  "usage": { "tokenCount": 1900, "costUsd": 0.005, "completeness": "complete" }
}
```

Counts are sanitized and capped by the logger. The trace excludes prompts, message history, answer text, query/rewrite text, tool arguments, source content, citations/URLs, source IDs, scores, provider errors, credentials, and stack traces. It is useful for proving control-flow shape, not for reconstructing a conversation.

## Tool events

`chat_tool_execution` is emitted for attempted dispatches with stable metadata: tool name or `unknown`, outcome, duration, and output bytes. It never contains inputs, outputs, query text, content, IDs, scores, provider errors, or stack traces. The registry has five allowlisted names: `search_knowledge`, `get_cv_timeline`, `get_project_details`, `list_articles`, and `get_contact_options`. `toolCallCount` increments only after a validated handler returns an accepted bounded result; failed attempts and duplicate aliases do not increase it.

Successful `search_knowledge` dispatches may also populate completion retrieval fields. `candidateCount` is the retrieval candidate pool exposed by the preparation layer and is not a count of all rows in the database. Direct no-tool and non-search tool paths leave retrieval fields `null` where no retrieval occurred.

## Metrics

Use completion events as the denominator:

- request count: all `chat_request_completed` events;
- failure rate: `outcome = failure` divided by all completions; report `cancelled` separately;
- no-context rate: `retrieval.noContext = true` divided by reached events where it is non-null;
- citation rate: `hasCitations = true` divided by generated events where it is non-null;
- latency: p50/p95/p99 of `durationMs`, split by outcome, locale, failure category, or non-null stage as needed;
- agent control-flow: distributions of `agentStopReason`, accepted tool count, retrieval rounds, verifier passes, step count, and revision rate;
- cost/tokens: sum the latest usage snapshot once per provider turn, keeping `complete`, `partial`, and `unknown` completeness visible.

Citation metrics count transient Markdown HTTP(S) links; the text and URLs are discarded before logging. Embedding token usage and cost remain `null` when the SDK does not expose them; do not infer them.

## Investigation procedure

1. Get `X-Chat-Correlation-Id` from the client response.
2. Filter Vercel Runtime Logs for `event = chat_request_completed` and the correlation ID; locate the matching `chat_agent_trace` and tool events.
3. Check `outcome`, `httpStatus`, `failureCategory`, `stopReason`, and `agentStopReason`.
4. Compare non-null stage timings, retrieval counts, tool failures, step count, and deadline/limit outcomes.
5. For supported-output incidents, check `evidenceAvailable`, `draftCreated`, `verificationPasses`, `revisionApplied`, and claim totals. These are model-review signals, not semantic proof.
6. Record the stable category and deployment ID. Do not copy raw prompts, responses, URLs, or provider error payloads into an incident ticket.

Runtime logs are operational evidence, not a durable transcript. Retention is governed by the Vercel project and may differ from application data retention. A real trace or media capture must be labeled with its date, deployment, correlation ID, and redaction review; fixture examples such as those above cannot stand in for live evidence.

## Failure categories and response

Treat `rate_limited`, `preparation_timeout`, `retrieval_failure`, `tool_error`, `provider_error`, `empty_output`, `output_limit`, `deadline_exceeded`, `verifier_failure`, and `cancellation` as distinct categories. For repeated retrieval/tool errors, inspect Supabase and WordPress indexing health before changing prompts. For repeated deadline or output-limit events, compare model stage duration and bounded counters before considering configuration changes. For a provider quota/auth error, stop live evaluation and preserve the failure record; do not retry blindly into a quota boundary.

The [Digital Twin architecture](digital-twin-architecture.md) explains the fail-closed semantics and the [operations runbook](digital-twin-operations.md) explains deployment and rollback boundaries. The [persona/privacy guardrails](persona-privacy-guardrails.md) remain the policy source for what may be logged or retained.
