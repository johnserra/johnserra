# Chat API hardening

The chat endpoint accepts only `application/json` (a `charset` parameter is allowed) with a JSON object containing exactly `locale` (`en` or `tr`) and a nonempty `messages` array. Each message object contains exactly `role` and `content`. Messages must alternate `user`, `assistant`, start with `user`, and end with `user`; every message must contain non-whitespace string content.

## Limits

Text limits are measured in UTF-8 bytes, not JavaScript characters:

| Boundary | Limit |
| --- | ---: |
| Request body | 64 KiB |
| Messages | 21 |
| One message | 8 KiB |
| Aggregate input | 32 KiB |
| Generated output | 32 KiB |

The endpoint returns JSON errors for request, media-type, limit, rate-limit, preparation, and pre-stream service failures. Errors have the stable shape `{ "error": { "code": "...", "message": "...", "retryAfter": 60 } }`, where numeric `retryAfter` is included for rate limits and matches the `Retry-After` header; it is omitted otherwise. Messages never include provider, database, identity, or stack details. Limit failures are `413`, unsupported content is `415`, rate limiting is `429`, and unavailable dependencies are `503`.

Successful responses are Node streams with `Content-Type: application/x-ndjson`. Each line is one frame:

```json
{"type":"delta","text":"..."}
{"type":"error","code":"MODEL_TIMEOUT","message":"..."}
{"type":"done"}
```

Clients must parse frames incrementally and must not add an empty or failed assistant answer to a later request. A model stream with no nonempty output ends with `MODEL_ERROR`, never `done`. Known request, limit, model, retrieval, timeout, rate-limit, and service codes are mapped to localized actionable text in `messages/en.json` and `messages/tr.json`.

## Rate limiting and privacy

The browser creates one UUIDv4 in `sessionStorage` and sends it as `X-Chat-Session`. The server accepts only a strict UUIDv4. The only trusted network identity is the first valid IP in Vercel's `x-vercel-forwarded-for`; ordinary client-controlled forwarding headers are ignored. If Vercel does not provide a valid platform header, the request fails closed with `503`.

The server HMACs the session and IP separately with `CHAT_RATE_LIMIT_SECRET` and sends only the 64-character digests to Supabase. Raw UUIDs and IPs are never stored or logged. The fixed-window limiter uses a session limit of 20 requests and an IP limit of 60 requests per 60 seconds. A blocked request returns `429` and `Retry-After`.

Generate a secret with at least 32 UTF-8 bytes, for example:

```sh
openssl rand -base64 32
```

Set `CHAT_RATE_LIMIT_SECRET` in Vercel for every environment before enabling the route. A missing or undersized secret, failed RPC, malformed RPC result, or missing migration fails closed with the structured `SERVICE_UNAVAILABLE` response.

## Deadlines and rollout

Preparation (embedding, rewrite, and retrieval) has a 12-second deadline. Model startup and streaming have a separate 45-second deadline. Both deadlines abort provider work, and the route also passes through the request abort signal. The route runs on Node and declares a 60-second Vercel function duration.

Apply migrations in order through `00005_chat_api_hardening.sql` after the existing retrieval migrations. The migration creates an RLS-enabled counter table and a bounded atomic `SECURITY DEFINER` RPC with an empty `search_path`; public, anon, and authenticated privileges are revoked and only `service_role` receives table access and function execution. The cleanup operation is bounded to 1,000 stale rows per call and the SQL contract is exercised with PGlite in `supabase/tests/chat-rate-limit.test.ts`.

The limiter is intentionally fail-closed: availability is preferred over allowing unbounded anonymous model access. No conversational content is persisted by this hardening layer.

Every chat response also carries the server-generated `X-Chat-Correlation-Id` header. It is an opaque UUID used to locate the single privacy-safe completion event in Vercel runtime logs; clients cannot choose it. See [chat observability](chat-observability.md) for the event schema, failure categories, stage metrics, and retention boundary.
