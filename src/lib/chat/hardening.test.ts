import assert from "node:assert/strict";
import test from "node:test";
import { appendUtf8Output, CHAT_MAX_BODY_BYTES, CHAT_MAX_INPUT_BYTES, CHAT_MAX_MESSAGE_BYTES, CHAT_MAX_MESSAGES, utf8ByteLength } from "./limits";
import { createLinkedAbortController, streamWithChatDeadline, withChatDeadline, ChatDeadlineError } from "./deadline";
import { encodeChatFrame, NdjsonChatParser, terminalChatFrame } from "./protocol";
import { createChatErrorResponse } from "./http";
import { parseChatJson, validateChatRequest, validateContentType } from "./validation";
import { extractTrustedVercelIp, hasUsableRateLimitSecret, hashChatIdentities, isValidChatSession } from "./rate-limit";
import { chatErrorTranslationKey, filterChatHistory } from "@/components/widgets/AIChatPanel";

const session = "123e4567-e89b-42d3-a456-426614174000";
const user = (content = "question") => ({ role: "user" as const, content });
const assistant = (content = "answer") => ({ role: "assistant" as const, content });

function valid(messages = [user()] as Array<ReturnType<typeof user> | ReturnType<typeof assistant>>) {
  return validateChatRequest({ messages, locale: "en" });
}

test("chat request validation rejects malformed roots, locales, content types, roles, and conversations", () => {
  assert.equal(validateChatRequest(null).ok, false);
  assert.equal(validateChatRequest([]).ok, false);
  assert.equal(validateChatRequest({ messages: [], locale: "en" }).ok, false);
  assert.equal(validateChatRequest({ messages: [assistant()], locale: "en" }).ok, false);
  assert.equal(validateChatRequest({ messages: [user(), user()], locale: "en" }).ok, false);
  assert.equal(validateChatRequest({ messages: [user(), assistant()] as const, locale: "en" }).ok, false);
  assert.equal(validateChatRequest({ messages: [{ role: "user", content: 1 }], locale: "en" }).ok, false);
  assert.equal(validateChatRequest({ messages: [user(" ")], locale: "en" }).ok, false);
  assert.equal(validateChatRequest({ messages: [user()], locale: "en", extra: true }).ok, false);
  assert.equal(validateChatRequest({ messages: [{ role: "user", content: "question", extra: true }], locale: "en" }).ok, false);
  assert.equal(validateChatRequest({ messages: [user()], locale: "fr" }).ok, false);
  const tooMany = validateChatRequest({
    messages: Array.from({ length: CHAT_MAX_MESSAGES + 1 }, () => user()),
    locale: "en",
  });
  assert.equal(tooMany.ok, false);
  if (!tooMany.ok) assert.equal(tooMany.code, "INPUT_TOO_LARGE");
  const exactBoundary = validateChatRequest({
    messages: Array.from({ length: CHAT_MAX_MESSAGES }, (_, index) => index % 2 === 0 ? user(`question ${index}`) : assistant(`answer ${index}`)),
    locale: "en",
  });
  assert.equal(exactBoundary.ok, true);
  assert.equal(validateContentType("application/json; charset=utf-8"), true);
  assert.equal(validateContentType("text/plain"), false);
  assert.equal(parseChatJson("{").ok, false);
  assert.equal(valid().ok, true);
});

test("UTF-8 message, aggregate, and body boundaries are exact", () => {
  const exactMessage = "é".repeat(CHAT_MAX_MESSAGE_BYTES / 2);
  assert.equal(utf8ByteLength(exactMessage), CHAT_MAX_MESSAGE_BYTES);
  assert.equal(validateChatRequest({ messages: [user(exactMessage)], locale: "en" }).ok, true);
  assert.equal(validateChatRequest({ messages: [user(`${exactMessage}é`)], locale: "en" }).ok, false);
  assert.equal(validateChatRequest({ messages: [user()], locale: "en" }, CHAT_MAX_BODY_BYTES).ok, true);
  assert.equal(validateChatRequest({ messages: [user()], locale: "en" }, CHAT_MAX_BODY_BYTES + 1).ok, false);

  const exactAggregate = [user("a".repeat(8191)), assistant("b".repeat(8191)), user("c".repeat(8191)), assistant("d".repeat(8191)), user("tail")];
  // Keep the final conversation role valid while making the aggregate exact.
  exactAggregate[4].content = "e".repeat(CHAT_MAX_INPUT_BYTES - 4 * 8191);
  assert.equal(utf8ByteLength(exactAggregate.map((message) => message.content).join("")), CHAT_MAX_INPUT_BYTES);
  assert.equal(validateChatRequest({ messages: exactAggregate, locale: "en" }).ok, true);
  exactAggregate[4].content += "!";
  const aggregateFailure = validateChatRequest({ messages: exactAggregate, locale: "en" });
  assert.equal(aggregateFailure.ok, false);
  if (!aggregateFailure.ok) assert.equal(aggregateFailure.code, "INPUT_TOO_LARGE");
});

test("session and trusted Vercel IP helpers are strict and never return raw identity values", () => {
  assert.equal(isValidChatSession(session), true);
  assert.equal(isValidChatSession("123e4567-e89b-12d3-a456-426614174000"), false);
  const headers = new Headers({ "x-vercel-forwarded-for": "2001:db8::1, 198.51.100.1", "x-forwarded-for": "203.0.113.9" });
  assert.equal(extractTrustedVercelIp(headers), "2001:db8::1");
  assert.equal(extractTrustedVercelIp(new Headers({ "x-forwarded-for": "203.0.113.9" })), null);
  const hashes = hashChatIdentities("s".repeat(32), session, "2001:db8::1");
  assert.notEqual(hashes.sessionHash, session);
  assert.match(hashes.sessionHash, /^[0-9a-f]{64}$/);
  assert.match(hashes.ipHash, /^[0-9a-f]{64}$/);
  assert.equal(hasUsableRateLimitSecret(undefined), false);
  assert.equal(hasUsableRateLimitSecret("short"), false);
  assert.equal(hasUsableRateLimitSecret("s".repeat(32)), true);
});

test("request errors expose numeric Retry-After values in both header and JSON", async () => {
  const response = createChatErrorResponse(429, "RATE_LIMITED", "wait", 2.2);
  assert.equal(response.headers.get("Retry-After"), "3");
  assert.deepEqual(await response.json(), {
    error: { code: "RATE_LIMITED", message: "wait", retryAfter: 3 },
  });
});

test("rate-limit errors are actionable and history keeps pairs plus the current trailing user", () => {
  assert.equal(chatErrorTranslationKey("RATE_LIMITED"), "errors.rateLimited");
  assert.equal(chatErrorTranslationKey("SERVICE_UNAVAILABLE"), "errors.service");
  assert.equal(chatErrorTranslationKey("INVALID_REQUEST"), "errors.invalidRequest");
  assert.equal(chatErrorTranslationKey("BODY_TOO_LARGE"), "errors.tooLarge");
  assert.deepEqual(filterChatHistory([
    { id: "welcome", role: "assistant", content: "welcome" },
    { id: "u1", role: "user", content: "question 1" },
    { id: "failed", role: "assistant", content: "partial", failed: true },
    { id: "u2", role: "user", content: "question 2" },
  ]), [
    { role: "user", content: "question 2" },
  ]);
  assert.deepEqual(filterChatHistory([
    { id: "u1", role: "user", content: "question 1" },
    { id: "a1", role: "assistant", content: "answer 1" },
    { id: "u2", role: "user", content: "question 2" },
    { id: "a2", role: "assistant", content: "answer 2" },
    { id: "u3", role: "user", content: "question 3" },
  ]), [
    { role: "user", content: "question 1" },
    { role: "assistant", content: "answer 1" },
    { role: "user", content: "question 2" },
    { role: "assistant", content: "answer 2" },
    { role: "user", content: "question 3" },
  ]);
});

test("empty model output is an error terminal frame, never done", () => {
  assert.deepEqual(terminalChatFrame(false), {
    type: "error",
    code: "MODEL_ERROR",
    message: "The assistant returned an empty answer. Please try again.",
  });
  assert.deepEqual(terminalChatFrame(true), { type: "done" });
});

test("NDJSON parser handles split UTF-8 frames and explicit stream errors", () => {
  const bytes = encodeChatFrame({ type: "delta", text: "Merhaba 🌍" });
  const parser = new NdjsonChatParser();
  const frames = [
    ...parser.push(bytes.slice(0, 5)),
    ...parser.push(bytes.slice(5, 13)),
    ...parser.push(bytes.slice(13)),
    ...parser.push(encodeChatFrame({ type: "error", code: "MODEL_ERROR", message: "safe" })),
    ...parser.push(encodeChatFrame({ type: "done" })),
    ...parser.finish(),
  ];
  assert.deepEqual(frames, [
    { type: "delta", text: "Merhaba 🌍" },
    { type: "error", code: "MODEL_ERROR", message: "safe" },
    { type: "done" },
  ]);
  assert.throws(() => new NdjsonChatParser().push("{\"type\":\"delta\"}\n"));
});

test("output cap accounts for UTF-8 and preserves a parseable bounded prefix", () => {
  const first = appendUtf8Output(0, "é".repeat(3), 4);
  assert.equal(first.accepted, "éé");
  assert.equal(first.bytes, 4);
  assert.equal(first.overLimit, true);
  const second = appendUtf8Output(first.bytes, "x", 4);
  assert.deepEqual(second, { accepted: "", bytes: 4, overLimit: true });
  assert.equal(CHAT_MAX_INPUT_BYTES > CHAT_MAX_MESSAGE_BYTES, true);
});

test("preparation and model deadlines settle ignored abort signals and propagate cancellation", async () => {
  await assert.rejects(
    withChatDeadline(() => new Promise<never>(() => {}), { stage: "preparation", deadlineMs: 10 }),
    (error: unknown) => error instanceof ChatDeadlineError && error.stage === "preparation",
  );

  await assert.rejects(
    (async () => {
      for await (const chunk of streamWithChatDeadline(
        async () => (async function* () { yield await new Promise<string>(() => {}); })(),
        { stage: "model", deadlineMs: 10 },
      )) { void chunk; }
    })(),
    (error: unknown) => error instanceof ChatDeadlineError && error.stage === "model",
  );

  const controller = new AbortController();
  let receivedSignal: AbortSignal | undefined;
  const pending = withChatDeadline(async (signal) => {
    receivedSignal = signal;
    return new Promise<never>(() => {});
  }, { stage: "preparation", deadlineMs: 1_000, signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, /aborted/i);
  assert.equal(receivedSignal?.aborted, true);
});

test("linked response cancellation aborts the model signal", () => {
  const request = new AbortController();
  const linked = createLinkedAbortController(request.signal);
  assert.equal(linked.signal.aborted, false);
  request.abort("client disconnected");
  assert.equal(linked.signal.aborted, true);
  assert.equal(linked.signal.reason, "client disconnected");
  linked.dispose();
});

test("provider stream errors remain errors and do not become successful done frames", async () => {
  await assert.rejects(
    (async () => {
      for await (const chunk of streamWithChatDeadline(
        async () => (async function* () {
          yield "partial";
          throw new Error("provider details must stay server-side");
        })(),
        { stage: "model", deadlineMs: 1_000 },
      )) { void chunk; }
    })(),
    /provider details/,
  );
});
