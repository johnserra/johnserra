import assert from "node:assert/strict";
import test from "node:test";
import {
  addCorrelationHeader,
  CHAT_CORRELATION_HEADER,
  countCitations,
  createChatRequestTrace,
  createCorrelationId,
  estimateGeminiTextCost,
  mergeLatestUsage,
  normalizeStopReason,
  normalizeUsageMetadata,
  serializeChatCompletionEvent,
  sumSeparateUsageSnapshots,
} from "./observability";

const correlationId = "123e4567-e89b-42d3-a456-426614174000";

test("completion logging is idempotent and stage timing keeps unreached stages null", () => {
  let current = 1_000;
  const lines: string[] = [];
  const trace = createChatRequestTrace({
    correlationId,
    now: () => current,
    logger: { info(line) { lines.push(line); } },
  });
  trace.beginStage("validation");
  current += 4;
  trace.endStage("validation");
  trace.setLocale("en");
  const first = trace.complete({ httpStatus: 400, outcome: "failure", failureCategory: "invalid_request" });
  const second = trace.complete({ httpStatus: 200, outcome: "success", failureCategory: null });

  assert.equal(lines.length, 1);
  assert.strictEqual(first, second);
  const event = JSON.parse(lines[0]) as Record<string, unknown>;
  assert.equal(event.event, "chat_request_completed");
  assert.deepEqual(event.stages, {
    validationMs: 4,
    rateLimitingMs: null,
    preparationMs: null,
    generationMs: null,
  });
  assert.equal((event.retrieval as Record<string, unknown>).noContext, null);
});

test("correlation IDs are UUIDs and the response helper does not accept a client value", async () => {
  assert.match(createCorrelationId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu);
  const response = addCorrelationHeader(new Response(JSON.stringify({ error: "safe" })), correlationId);
  assert.equal(response.headers.get(CHAT_CORRELATION_HEADER), correlationId);
  assert.deepEqual(await response.json(), { error: "safe" });
});

test("usage normalization rejects invalid counts and streaming snapshots are latest values, not sums", () => {
  const first = normalizeUsageMetadata({
    promptTokenCount: 100,
    candidatesTokenCount: 20,
    totalTokenCount: 120,
    providerError: "DO_NOT_LOG",
  });
  const invalid = normalizeUsageMetadata({ promptTokenCount: -1, totalTokenCount: Number.POSITIVE_INFINITY });
  const latest = normalizeUsageMetadata({ promptTokenCount: 140, candidatesTokenCount: 30, totalTokenCount: 170 });
  assert.deepEqual(invalid, null);
  assert.deepEqual(mergeLatestUsage(first, latest), {
    promptTokens: 140,
    cachedInputTokens: null,
    candidateTokens: 30,
    thinkingTokens: null,
    toolPromptTokens: null,
    totalTokens: 170,
  });
  assert.deepEqual(mergeLatestUsage(first, null), first);
});

test("separate selection and final turn snapshots are summed after each turn keeps its latest value", () => {
  const trace = createChatRequestTrace({ correlationId, logger: { info() {} } });
  trace.setModel("gemini-2.5-flash");
  trace.observeGenerationChunk({
    usageTurn: "selection",
    usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 4, totalTokenCount: 104 },
  });
  trace.observeGenerationChunk({
    usageTurn: "selection",
    usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 6, totalTokenCount: 126 },
  });
  trace.observeGenerationChunk({
    usageTurn: "final",
    usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 8, totalTokenCount: 208 },
  });
  trace.observeGenerationChunk({
    usageTurn: "final",
    usageMetadata: { promptTokenCount: 230, candidatesTokenCount: 10, totalTokenCount: 240 },
  });
  assert.deepEqual(trace.complete({ httpStatus: 200, outcome: "success", failureCategory: null }).usage.generation, {
    promptTokens: 350,
    cachedInputTokens: null,
    candidateTokens: 16,
    thinkingTokens: null,
    toolPromptTokens: null,
    totalTokens: 366,
  });
  assert.deepEqual(sumSeparateUsageSnapshots([
    normalizeUsageMetadata({ promptTokenCount: 3, totalTokenCount: 3 }),
    normalizeUsageMetadata({ promptTokenCount: 4, totalTokenCount: 4 }),
  ]), {
    promptTokens: 7,
    cachedInputTokens: null,
    candidateTokens: null,
    thinkingTokens: null,
    toolPromptTokens: null,
    totalTokens: 7,
  });
});

test("search tool retrieval observations are bounded and other paths stay null", () => {
  const searchTrace = createChatRequestTrace({ correlationId, logger: { info() {} } });
  searchTrace.observeGenerationChunk({ retrieval: { resultCount: 2, candidateCount: null, noContext: false } });
  const searchEvent = searchTrace.complete({ httpStatus: 200, outcome: "success", failureCategory: null });
  assert.deepEqual(searchEvent.retrieval, { resultCount: 2, candidateCount: null, noContext: false });

  const emptySearchTrace = createChatRequestTrace({ correlationId, logger: { info() {} } });
  emptySearchTrace.observeGenerationChunk({ retrieval: { resultCount: 0, candidateCount: null, noContext: true } });
  assert.deepEqual(emptySearchTrace.complete({ httpStatus: 200, outcome: "success", failureCategory: null }).retrieval, {
    resultCount: 0,
    candidateCount: null,
    noContext: true,
  });

  const directTrace = createChatRequestTrace({ correlationId, logger: { info() {} } });
  assert.deepEqual(directTrace.complete({ httpStatus: 200, outcome: "success", failureCategory: null }).retrieval, {
    resultCount: null,
    candidateCount: null,
    noContext: null,
  });
});

test("Gemini 2.5 Flash standard cost arithmetic avoids cached and thinking double counts", () => {
  const cost = estimateGeminiTextCost("gemini-2.5-flash", {
    promptTokens: 1_000,
    cachedInputTokens: 200,
    candidateTokens: 400,
    thinkingTokens: 50,
    toolPromptTokens: 10,
    totalTokens: 1_460,
  });
  assert.ok(cost);
  assert.ok(Math.abs(cost.estimateUsd - 0.001374) < Number.EPSILON);
  assert.equal(cost.completeness, "complete");
  assert.equal(estimateGeminiTextCost("unknown-model", cost ? {
    promptTokens: 1,
    cachedInputTokens: null,
    candidateTokens: 1,
    thinkingTokens: null,
    toolPromptTokens: null,
    totalTokens: 2,
  } : null), null);
  assert.equal(estimateGeminiTextCost("gemini-2.5-flash", null), null);
});

test("partial usage produces a marked partial estimate and missing usage stays unavailable", () => {
  const partial = estimateGeminiTextCost("gemini-2.5-flash", {
    promptTokens: 100,
    cachedInputTokens: null,
    candidateTokens: null,
    thinkingTokens: null,
    toolPromptTokens: null,
    totalTokens: null,
  });
  assert.ok(partial);
  assert.equal(partial.completeness, "partial");
  assert.equal(estimateGeminiTextCost("gemini-2.5-flash", {
    promptTokens: null,
    cachedInputTokens: null,
    candidateTokens: null,
    thinkingTokens: null,
    toolPromptTokens: null,
    totalTokens: 100,
  }), null);
});

test("rewrite cost is unavailable when usage came from an unknown rewrite model", () => {
  const trace = createChatRequestTrace({ correlationId, logger: { info() {} } });
  trace.setPreparedData({
    matches: [],
    generationRequest: { model: "gemini-2.5-flash" },
    diagnostics: {
      rewrite: {
        used: true,
        reason: "rewritten",
        originalQuery: "not logged",
        rewrittenQuery: "not logged",
        durationMs: 3,
        fallback: false,
        usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 5 },
        model: "custom-rewrite-model",
      },
      embedding: { durationMs: 2, fallback: false, error: false, reason: "success" },
      retrieval: { stage: "hybrid", durationMs: 4, candidateCount: 0, fallback: false, error: false, reason: "success" },
      reranking: { durationMs: 1, inputCount: 0, outputCount: 0, coverageAdjusted: 0 },
      totalDurationMs: 10,
    },
  });
  const event = trace.complete({ httpStatus: 200, outcome: "success", failureCategory: null });
  assert.equal(event.usage.rewrite?.promptTokens, 20);
  assert.equal(event.cost.rewrite, null);
  assert.equal(event.cost.totalUsd, null);
});

test("serialization drops malformed cost metadata instead of fabricating a zero estimate", () => {
  const trace = createChatRequestTrace({ correlationId, logger: { info() {} } });
  const event = trace.complete({ httpStatus: 200, outcome: "success", failureCategory: null });
  event.cost.generation = {
    currency: "USD",
    estimateUsd: Number.NaN,
    pricingSource: "hostile",
    pricingVerifiedOn: "hostile",
    pricingVersion: "hostile",
    model: "gemini-2.5-flash",
    completeness: "complete",
  };
  const serialized = JSON.parse(serializeChatCompletionEvent(event));
  assert.equal(serialized.cost.generation, null);
});

test("citation metrics are numeric only and hostile conversation/provider data cannot enter the event", () => {
  const marker = "HOSTILE_CONVERSATION_MARKER";
  assert.equal(countCitations(`[Public](https://johnserra.com/projects/demo) [Second](https://example.com/source)`), 2);
  const lines: string[] = [];
  const trace = createChatRequestTrace({ correlationId, logger: { info(line) { lines.push(line); } } });
  trace.setLocale("tr");
  trace.setPreparedData({
    matches: [{ source: marker, content: marker, metadata: { title: marker, canonical_url: marker } }],
    generationRequest: { model: "gemini-2.5-flash" },
    diagnostics: {
      rewrite: {
        used: true,
        reason: marker,
        originalQuery: marker,
        rewrittenQuery: marker,
        durationMs: 3,
        fallback: false,
        usageMetadata: { promptTokenCount: 2 },
      },
      embedding: { durationMs: 2, fallback: false, error: false, reason: marker },
      retrieval: { stage: "hybrid", durationMs: 4, candidateCount: 1, fallback: false, error: false, reason: marker },
      reranking: { durationMs: 1, inputCount: 1, outputCount: 1, coverageAdjusted: 0 },
      totalDurationMs: 10,
    },
  });
  trace.observeGenerationChunk({
    usageMetadata: { promptTokenCount: 2 },
    finishReason: "STOP",
    toolCallCount: 0,
  });
  trace.recordOutput(`[Evidence ${marker}](https://johnserra.com/private/${marker})`, 64);
  const event = JSON.parse(serializeChatCompletionEvent(trace.complete({
    httpStatus: 503,
    outcome: "failure",
    failureCategory: "provider_error",
  })));
  const serialized = JSON.stringify(event);
  assert.equal(serialized.includes(marker), false);
  assert.equal(serialized.includes("originalQuery"), false);
  assert.equal(event.citationCount, 1);
  assert.equal(event.hasCitations, true);
  assert.equal(event.stopReason, "stop");
  assert.equal(event.toolCallCount, 0);
  assert.equal(event.agentStopReason, null);
});

test("safe logging swallows logger failures and stop reasons are stable enums", () => {
  const trace = createChatRequestTrace({ correlationId, logger: { info() { throw new Error("provider stack marker"); } } });
  assert.doesNotThrow(() => trace.complete({ httpStatus: 500, outcome: "failure", failureCategory: "provider_error" }));
  assert.equal(normalizeStopReason("MAX_TOKENS"), "length");
  assert.equal(normalizeStopReason("made-up-provider-value"), "unknown");
  assert.equal(normalizeStopReason({ marker: "must not log" }), null);
});

test("development multi-tool traces contain bounded counts only and direct answers can record zero tools", () => {
  const lines: string[] = [];
  const trace = createChatRequestTrace({
    correlationId,
    logger: { info(line) { lines.push(line); } },
  });
  trace.recordMultiToolTrace({
    event: "chat_multi_tool_trace",
    schemaVersion: 1,
    correlationId,
    selectedCount: 0,
    uniqueExecutionCount: 0,
    duplicateCount: 0,
    calls: [],
    finalStopState: "direct_no_tools",
  });
  if (process.env.NODE_ENV !== "production") {
    assert.equal(lines.length, 1);
    const event = JSON.parse(lines[0]) as Record<string, unknown>;
    assert.deepEqual(event, {
      event: "chat_multi_tool_trace",
      schemaVersion: 1,
      correlationId,
      selectedCount: 0,
      uniqueExecutionCount: 0,
      duplicateCount: 0,
      calls: [],
      finalStopState: "direct_no_tools",
    });
    assert.equal(JSON.stringify(event).includes("query"), false);
  }
});
