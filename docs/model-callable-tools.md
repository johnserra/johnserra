# Model-callable tools

Issue #18 adds application-controlled Gemini function calling to `POST /api/chat`. The server sends the conversation and five read-only declarations to Gemini with `VALIDATED` function-calling mode and `automaticFunctionCalling.disable=true`. A greeting or other answer that needs no public evidence is returned without executing a tool. If Gemini selects tools, the server validates and dispatches the bounded selection once, then sends matching function responses to one final generation with tools disabled. A final-generation function call is rejected; there is no verification-agent loop from #19.

## Registry and public data

The registry in [`src/lib/chat/tools.ts`](../src/lib/chat/tools.ts) is the only dispatch surface:

| Tool | Public source | Required arguments | Result |
| --- | --- | --- | --- |
| `search_knowledge` | Existing hybrid semantic + lexical retrieval | `query`, `locale` | Bounded public excerpts and citations |
| `get_cv_timeline` | Reviewed registered public CV | `locale` | Public timeline entries with reviewed-CV authority |
| `get_project_details` | Existing filesystem/WordPress site-content adapter | `slug`, `locale` | Bounded published project details |
| `list_articles` | Existing filesystem/WordPress site-content adapter | `locale` | At most 50 article summaries |
| `get_contact_options` | Existing public contact routes | `locale` | Descriptions only; never submits or sends |

Every declaration has an object JSON schema, required fields, and `additionalProperties: false`. Runtime validation repeats the boundary checks because model arguments are untrusted data. The registry does not contain SQL, arbitrary URLs, filesystem paths, writes, CRM, email sending, or secret access.

## Limits and failure behavior

There is one model-selection turn and at most one final turn. The total accepted tool-call cap is 5 per request. Per-tool deadlines are 10 seconds for search, 4 seconds for CV/projects/articles, and 2 seconds for contact options. Accepted serialized result caps are 12 KiB for search/CV/projects, 8 KiB for articles, and 2 KiB for contact options; all caps use UTF-8 bytes. A handler that ignores abort still settles at its deadline, and the request abort signal is propagated.

Unknown tools, invalid arguments, handler failures, timeouts, result overflow, call-cap violations, and unexpected follow-on calls fail closed with stable `TOOL_ERROR` messages. Raw arguments, query text, provider/database errors, internal IDs, scores, secrets, and stack traces never enter safe errors or tool logs; response payloads are projected to the bounded public evidence contract. `toolCallCount` increments only after a bounded result is accepted.

## Logging and citations

Each attempted dispatch emits one `chat_tool_execution` JSON log containing only schema version, event, server correlation ID, allowlisted tool name or `unknown`, outcome, duration, and output bytes. The existing request emits exactly one `chat_request_completed` event; a successful `search_knowledge` dispatch contributes its accepted evidence count and `noContext` to the request retrieval aggregate, while `candidateCount` stays `null` because the registry intentionally does not expose the underlying candidate pool. Direct no-tool and non-search tool requests leave all retrieval fields `null`; queries, content, scores, and candidate details never enter logs. Tool results retain descriptive titles and exact locale-correct canonical public URLs so the final answer can cite them. The CV tool uses only the reviewed public CV authority and never returns the private source.

## Tests and rollback

Offline dependency-injected tests cover all five handlers, declaration exactness, strict argument rejection, UTF-8 caps, ignored-abort deadlines, caller cancellation, safe logs, total caps, direct no-tool answers, selected-tool function-response IDs, provider failures, and unexpected follow-on calls. The standalone retrieval evaluator and `prepareChat` compatibility tests remain in place; production `/api/chat` no longer calls `prepareChat` before Gemini chooses.

Rollback is a code rollback of the route and `src/lib/chat` changes to the previously accepted build; no database migration is required. If tool behavior is unavailable, the safe operational action is to redeploy that prior build and verify the NDJSON contract. No live Gemini or production verification is claimed by this document.
