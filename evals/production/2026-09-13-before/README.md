# Production evidence — failed pre-fix baseline

Date: 2026-09-13 UTC  
Deployment: `dpl_8XC7fqNb273vLovd2Eq4KgaApwpn`  
Deployment lookup: `2026-09-13T21:22:30Z`  
Evidence collection: `2026-09-13T21:29:18Z`–`2026-09-13T21:30:13Z`

This is the initial production baseline for issue #11. It is a failed behavioral baseline, not a successful demo and not a closure of the issue. The six public synthetic scenarios below all failed their behavioral criteria.

## Reproduction and grading

Each scenario was sent as a streaming `POST /api/chat` request with JSON body shaped as:

```json
{"messages":[{"role":"user","content":"<prompt>"}],"locale":"en"}
```

Use `Content-Type: application/json` and `Accept: application/x-ndjson`. Preserve the prompt text exactly. For the follow-up scenario, preserve the prior conversation messages and append the exact user prompt shown below. Record the response `X-Chat-Correlation-Id`, HTTP status, and every terminal frame. A terminal `done` frame is transport evidence only; grade the answer content, citations, locale, and runtime trace separately.

| ID | Exact synthetic prompt | Behavioral criterion | Observed result |
| --- | --- | --- | --- |
| `greeting` | `Hello — what can you help me learn about John Serra?` | Useful greeting/help content | HTTP 200/done, generic uncited evidence-insufficient fallback — **fail** |
| `cited-professional-cv` | `What are John Serra's professional strengths and experience? Use his published portfolio and reviewed CV evidence, and cite the source links for each material claim.` | Supported answer with source links for material claims | HTTP 200/done, generic uncited fallback — **fail** |
| `ambiguous-follow-up` | `Which one of those strengths would be most relevant to an AI product role, and why?` | Answer the follow-up using persistent prior conversation context | HTTP 200/done, same generic fallback — **fail** |
| `turkish-professional` | `John Serra'nın profesyonel deneyimini ve özellikle veri/analitik projelerini Türkçe olarak, kaynak bağlantılarıyla açıklar mısın?` | Turkish-language answer with source links | HTTP 200/done, English generic uncited fallback — **fail** |
| `unknown-factual-qualification` | `Did John Serra win the 2019 Nobel Prize in Economics? If that is not supported by the public evidence, say so clearly and explain what can actually be verified.` | Explicitly qualify the unsupported premise and state what is verifiable | HTTP 200/done, generic fallback that did not address the premise — **fail** |
| `multi-tool-public-ai-product-role` | `Combine the published project evidence on this site with the reviewed CV evidence to assess whether John Serra is a strong fit for an AI product role. Use multiple public sources or tools if available, cite every claim, and clearly qualify anything that cannot be verified.` | Multiple accepted tools, supported citations, and verifier-backed answer | HTTP 503 at the rate-limit stage (`service_unavailable`) — **fail** |

The first five failures were HTTP 200 with a `done` terminal frame but generic, uncited fallbacks. The sixth failed with HTTP 503 during the rate-limit stage. The exact answers, correlation IDs, terminal frames, and elapsed times are in [initial browser results](initial-browser-results.json).

## Runtime observations

Two sampled CV traces (`9a49403f-8df8-40f2-a8bf-49b74af37381` and `6a8cb596-de6c-44b9-a006-a9ebe74e694a`) each show `get_cv_timeline` succeeding, followed by `chat_agent_trace.stopReason = inspection_failure`. Both have zero verifier passes. The sanitized events are in [runtime traces](sanitized-runtime-traces.json).

The greeting correlation `8ef39550-dea5-45d0-9618-c7270866ee41` stopped `insufficient_evidence` with zero selected calls and zero accepted tool executions. Therefore HTTP 200/done does not establish a useful greeting. See [greeting trace](greeting-runtime-trace.json).

The harness kept `locale=en` even for the Turkish-language prompt. This is evidence about a Turkish-language request sent under the English locale, not a test of the `tr` locale and not production `tr`-locale regression proof.

## Infrastructure versus model behavior

Deployment availability is separate from assistant behavior: the deployment was `READY` and the homepage smoke later reported HTTP 200, but the assistant scenarios above still failed. Initial media collection failed. The capture environment subsequently recovered using the installed headless shell, as recorded by the [later smoke status](later-smoke-status.json), but representative cited screenshots/video still await a working assistant capture. The smoke homepage/status is not the requested demo evidence.

The [offline fixture JSON](offline-fixture-replay-2026-09-13T21-31-27-381Z.json) and [offline fixture report](offline-fixture-replay-2026-09-13T21-31-27-381Z.md) are deterministic metadata replays. They do not call live providers and do not test the runtime state machine. Their passes must not be counted as production passes. The later browser smoke status is retained only as infrastructure evidence.

## Pending after-fix acceptance

The runtime fix is ongoing; no after-fix results are present here. Re-run these same six prompts with the same request shape and headers, then capture sanitized response frames and runtime events. Issue #11 remains open until the greeting is useful, factual answers carry supported citations, the Turkish-language request is answered appropriately, the unsupported Nobel premise is explicitly qualified, the follow-up is answered from conversation context, and the multi-tool scenario demonstrates at least two distinct accepted tools plus one verifier pass. Also capture representative cited screenshots and the requested approximately two-minute video. Do not defer these criteria to #27.
