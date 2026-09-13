import { randomUUID } from "node:crypto";
import type { HybridRetrievalDiagnostics } from "./retrieval";
import type { MultiToolTrace } from "./tool-calling";

export const CHAT_CORRELATION_HEADER = "X-Chat-Correlation-Id";
export const CHAT_OBSERVABILITY_EVENT = "chat_request_completed";
export const CHAT_OBSERVABILITY_SCHEMA_VERSION = 1;
export const CHAT_ROUTE = "/api/chat";

export const GEMINI_FLASH_STANDARD_PRICING = {
  model: "gemini-2.5-flash",
  currency: "USD",
  pricingSource: "https://ai.google.dev/gemini-api/docs/pricing",
  pricingVerifiedOn: "2026-09-12",
  pricingVersion: "gemini-2.5-flash-standard-text-2026-09-12",
  uncachedInputUsdPerMillion: 0.30,
  cachedInputUsdPerMillion: 0.03,
  outputUsdPerMillion: 2.50,
} as const;

export type ChatOutcome = "success" | "failure" | "cancelled";

export type ChatFailureCategory =
  | "unsupported_media_type"
  | "invalid_session"
  | "invalid_request"
  | "body_too_large"
  | "service_unavailable"
  | "rate_limited"
  | "cancelled"
  | "preparation_timeout"
  | "preparation_failure"
  | "retrieval_failure"
  | "model_timeout"
  | "provider_error"
  | "tool_error"
  | "empty_output"
  | "output_limit"
  | null;

export type ChatStopReason =
  | "stop"
  | "length"
  | "safety"
  | "recitation"
  | "tool_error"
  | "unspecified"
  | "other"
  | "unknown"
  | null;

export interface ProviderUsageMetadata {
  promptTokenCount?: number;
  cachedContentTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  toolUsePromptTokenCount?: number;
  totalTokenCount?: number;
}

export interface NormalizedTokenUsage {
  promptTokens: number | null;
  cachedInputTokens: number | null;
  candidateTokens: number | null;
  thinkingTokens: number | null;
  toolPromptTokens: number | null;
  totalTokens: number | null;
}

export interface GeminiTextCostEstimate {
  currency: "USD";
  estimateUsd: number;
  pricingSource: string;
  pricingVerifiedOn: string;
  pricingVersion: string;
  model: string;
  completeness: "partial" | "complete";
}

export interface ChatCompletionEvent {
  event: typeof CHAT_OBSERVABILITY_EVENT;
  schemaVersion: typeof CHAT_OBSERVABILITY_SCHEMA_VERSION;
  timestamp: string;
  correlationId: string;
  route: typeof CHAT_ROUTE;
  locale: "en" | "tr" | null;
  httpStatus: number;
  outcome: ChatOutcome;
  failureCategory: ChatFailureCategory;
  durationMs: number;
  stages: {
    validationMs: number | null;
    rateLimitingMs: number | null;
    preparationMs: number | null;
    generationMs: number | null;
  };
  diagnostics: {
    totalDurationMs: number | null;
    rewrite: {
      used: boolean;
      reason: string;
      fallback: boolean;
      durationMs: number;
    } | null;
    embedding: {
      durationMs: number;
      fallback: boolean;
      error: boolean;
      reason: string;
    } | null;
    retrieval: {
      stage: string;
      durationMs: number;
      candidateCount: number;
      fallback: boolean;
      error: boolean;
      reason: string;
    } | null;
    reranking: {
      durationMs: number;
      inputCount: number;
      outputCount: number;
      coverageAdjusted: number;
    } | null;
  };
  retrieval: {
    resultCount: number | null;
    candidateCount: number | null;
    noContext: boolean | null;
  };
  generatedUtf8Bytes: number | null;
  citationCount: number | null;
  hasCitations: boolean | null;
  usage: {
    generation: NormalizedTokenUsage | null;
    rewrite: NormalizedTokenUsage | null;
    embeddingTokens: null;
  };
  cost: {
    generation: GeminiTextCostEstimate | null;
    rewrite: GeminiTextCostEstimate | null;
    totalUsd: number | null;
  };
  toolCallCount: number;
  stopReason: ChatStopReason;
  agentStopReason: null;
  model: string | null;
}

export interface ChatLogger {
  info(message: string): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function finiteNonNegative(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export function createCorrelationId(): string {
  return randomUUID();
}

export function normalizeUsageMetadata(value: unknown): NormalizedTokenUsage | null {
  if (!isRecord(value)) return null;
  const promptTokens = finiteNonNegativeInteger(value.promptTokenCount);
  const cachedInputTokens = finiteNonNegativeInteger(value.cachedContentTokenCount);
  const candidateTokens = finiteNonNegativeInteger(value.candidatesTokenCount);
  const thinkingTokens = finiteNonNegativeInteger(value.thoughtsTokenCount);
  const toolPromptTokens = finiteNonNegativeInteger(value.toolUsePromptTokenCount);
  const totalTokens = finiteNonNegativeInteger(value.totalTokenCount);
  if ([promptTokens, cachedInputTokens, candidateTokens, thinkingTokens, toolPromptTokens, totalTokens]
    .every((count) => count === undefined)) return null;
  return {
    promptTokens: promptTokens ?? null,
    cachedInputTokens: cachedInputTokens ?? null,
    candidateTokens: candidateTokens ?? null,
    thinkingTokens: thinkingTokens ?? null,
    toolPromptTokens: toolPromptTokens ?? null,
    totalTokens: totalTokens ?? null,
  };
}

/** Merge the latest provider snapshot; streaming snapshots are cumulative, never additive. */
export function mergeLatestUsage(
  previous: NormalizedTokenUsage | null,
  latest: NormalizedTokenUsage | null,
): NormalizedTokenUsage | null {
  if (!latest) return previous;
  if (!previous) return latest;
  return {
    promptTokens: latest.promptTokens ?? previous.promptTokens,
    cachedInputTokens: latest.cachedInputTokens ?? previous.cachedInputTokens,
    candidateTokens: latest.candidateTokens ?? previous.candidateTokens,
    thinkingTokens: latest.thinkingTokens ?? previous.thinkingTokens,
    toolPromptTokens: latest.toolPromptTokens ?? previous.toolPromptTokens,
    totalTokens: latest.totalTokens ?? previous.totalTokens,
  };
}

function sumKnownUsageField(values: readonly (number | null)[]): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length ? known.reduce((total, value) => total + value, 0) : null;
}

/** Sum one latest snapshot per independent provider turn; never sum chunks within a turn. */
export function sumSeparateUsageSnapshots(
  snapshots: readonly (NormalizedTokenUsage | null)[],
): NormalizedTokenUsage | null {
  const present = snapshots.filter((snapshot): snapshot is NormalizedTokenUsage => snapshot !== null);
  if (!present.length) return null;
  return {
    promptTokens: sumKnownUsageField(present.map((snapshot) => snapshot.promptTokens)),
    cachedInputTokens: sumKnownUsageField(present.map((snapshot) => snapshot.cachedInputTokens)),
    candidateTokens: sumKnownUsageField(present.map((snapshot) => snapshot.candidateTokens)),
    thinkingTokens: sumKnownUsageField(present.map((snapshot) => snapshot.thinkingTokens)),
    toolPromptTokens: sumKnownUsageField(present.map((snapshot) => snapshot.toolPromptTokens)),
    totalTokens: sumKnownUsageField(present.map((snapshot) => snapshot.totalTokens)),
  };
}

export function normalizeStopReason(value: unknown): ChatStopReason {
  if (typeof value !== "string") return null;
  switch (value) {
    case "STOP": return "stop";
    case "MAX_TOKENS":
    case "LENGTH": return "length";
    case "SAFETY":
    case "BLOCKLIST":
    case "PROHIBITED_CONTENT":
    case "SPII": return "safety";
    case "RECITATION": return "recitation";
    case "MALFORMED_FUNCTION_CALL":
    case "UNEXPECTED_TOOL_CALL": return "tool_error";
    case "FINISH_REASON_UNSPECIFIED": return "unspecified";
    case "OTHER": return "other";
    default: return "unknown";
  }
}

export function countCitations(answer: string): number {
  const matches = answer.match(/\[[^\]\n]{1,200}\]\(https?:\/\/[^)\s]{1,2000}\)/gu);
  return matches?.length ?? 0;
}

export function estimateGeminiTextCost(
  model: string,
  usage: NormalizedTokenUsage | null,
): GeminiTextCostEstimate | null {
  if (model !== GEMINI_FLASH_STANDARD_PRICING.model || !usage) return null;

  const hasPrompt = usage.promptTokens !== null;
  const hasCached = usage.cachedInputTokens !== null;
  const hasToolPrompt = usage.toolPromptTokens !== null;
  const hasOutput = usage.candidateTokens !== null || usage.thinkingTokens !== null;
  if (!hasPrompt && !hasCached && !hasToolPrompt && !hasOutput) return null;

  const cached = usage.cachedInputTokens ?? 0;
  const uncachedPrompt = usage.promptTokens === null
    ? 0
    : Math.max(0, usage.promptTokens - cached);
  const toolPrompt = usage.toolPromptTokens ?? 0;
  const output = (usage.candidateTokens ?? 0) + (usage.thinkingTokens ?? 0);
  const inputCost = (uncachedPrompt * GEMINI_FLASH_STANDARD_PRICING.uncachedInputUsdPerMillion
    + cached * GEMINI_FLASH_STANDARD_PRICING.cachedInputUsdPerMillion
    + toolPrompt * GEMINI_FLASH_STANDARD_PRICING.uncachedInputUsdPerMillion) / 1_000_000;
  const outputCost = output * GEMINI_FLASH_STANDARD_PRICING.outputUsdPerMillion / 1_000_000;

  return {
    currency: "USD",
    estimateUsd: inputCost + outputCost,
    pricingSource: GEMINI_FLASH_STANDARD_PRICING.pricingSource,
    pricingVerifiedOn: GEMINI_FLASH_STANDARD_PRICING.pricingVerifiedOn,
    pricingVersion: GEMINI_FLASH_STANDARD_PRICING.pricingVersion,
    model,
    completeness: hasPrompt && hasOutput ? "complete" : "partial",
  };
}

function stableRewriteReason(reason: unknown): string {
  if (typeof reason !== "string") return "unknown";
  if (reason.startsWith("language_mismatch")) return "language_mismatch";
  if (reason.startsWith("rejected_")) return "rejected";
  return new Set([
    "no_adapter", "standalone_single_turn", "standalone_latest_message", "unchanged", "rewritten",
    "empty", "overlong", "invented_entity", "timeout_or_cancelled", "adapter_error",
  ]).has(reason) ? reason : "unknown";
}

function stableReason(reason: unknown, allowed: readonly string[]): string {
  return typeof reason === "string" && allowed.includes(reason) ? reason : "unknown";
}

function safeDiagnostics(diagnostics: HybridRetrievalDiagnostics | undefined): ChatCompletionEvent["diagnostics"] {
  if (!diagnostics) {
    return { totalDurationMs: null, rewrite: null, embedding: null, retrieval: null, reranking: null };
  }
  return {
    totalDurationMs: finiteNonNegative(diagnostics.totalDurationMs) ?? 0,
    rewrite: {
      used: diagnostics.rewrite.used === true,
      reason: stableRewriteReason(diagnostics.rewrite.reason),
      fallback: diagnostics.rewrite.fallback === true,
      durationMs: finiteNonNegative(diagnostics.rewrite.durationMs) ?? 0,
    },
    embedding: {
      durationMs: finiteNonNegative(diagnostics.embedding.durationMs) ?? 0,
      fallback: diagnostics.embedding.fallback === true,
      error: diagnostics.embedding.error === true,
      reason: stableReason(diagnostics.embedding.reason, ["success", "embedding_timeout", "embedding_error"]),
    },
    retrieval: {
      stage: stableReason(diagnostics.retrieval.stage, [
        "hybrid", "filtered_fallback", "semantic_fallback", "lexical_fallback", "empty_error",
      ]),
      durationMs: finiteNonNegative(diagnostics.retrieval.durationMs) ?? 0,
      candidateCount: finiteNonNegativeInteger(diagnostics.retrieval.candidateCount) ?? 0,
      fallback: diagnostics.retrieval.fallback === true,
      error: diagnostics.retrieval.error === true,
      reason: stableReason(diagnostics.retrieval.reason, [
        "success", "embedding_failed_lexical_only", "hybrid_rpc_timeout", "hybrid_rpc_error",
        "filtered_fallback_timeout", "filtered_fallback_error", "hybrid_rpc_absent_legacy_semantic_fallback",
        "hybrid_rpc_absent_filtered_fallback",
      ]),
    },
    reranking: {
      durationMs: finiteNonNegative(diagnostics.reranking.durationMs) ?? 0,
      inputCount: finiteNonNegativeInteger(diagnostics.reranking.inputCount) ?? 0,
      outputCount: finiteNonNegativeInteger(diagnostics.reranking.outputCount) ?? 0,
      coverageAdjusted: finiteNonNegativeInteger(diagnostics.reranking.coverageAdjusted) ?? 0,
    },
  };
}

function safeUsage(usage: NormalizedTokenUsage | null): NormalizedTokenUsage | null {
  if (!usage) return null;
  return {
    promptTokens: finiteNonNegativeInteger(usage.promptTokens) ?? null,
    cachedInputTokens: finiteNonNegativeInteger(usage.cachedInputTokens) ?? null,
    candidateTokens: finiteNonNegativeInteger(usage.candidateTokens) ?? null,
    thinkingTokens: finiteNonNegativeInteger(usage.thinkingTokens) ?? null,
    toolPromptTokens: finiteNonNegativeInteger(usage.toolPromptTokens) ?? null,
    totalTokens: finiteNonNegativeInteger(usage.totalTokens) ?? null,
  };
}

function safeCorrelationId(value: string): string {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
    ? value
    : "invalid-correlation-id";
}

function safeFailureCategory(value: ChatFailureCategory): ChatFailureCategory {
  const allowed: readonly Exclude<ChatFailureCategory, null>[] = [
    "unsupported_media_type", "invalid_session", "invalid_request", "body_too_large", "service_unavailable",
    "rate_limited", "cancelled", "preparation_timeout", "preparation_failure", "retrieval_failure",
    "model_timeout", "provider_error", "tool_error", "empty_output", "output_limit",
  ];
  return value !== null && allowed.includes(value) ? value : null;
}

function safeStopReason(value: ChatStopReason): ChatStopReason {
  return value === null || ["stop", "length", "safety", "recitation", "tool_error", "unspecified", "other", "unknown"]
    .includes(value) ? value : null;
}

function safeEvent(event: ChatCompletionEvent): ChatCompletionEvent {
  const generationCost = event.cost.generation;
  const rewriteCost = event.cost.rewrite;
  return {
    event: CHAT_OBSERVABILITY_EVENT,
    schemaVersion: CHAT_OBSERVABILITY_SCHEMA_VERSION,
    timestamp: typeof event.timestamp === "string" ? event.timestamp : new Date().toISOString(),
    correlationId: safeCorrelationId(event.correlationId),
    route: CHAT_ROUTE,
    locale: event.locale === "en" || event.locale === "tr" ? event.locale : null,
    httpStatus: finiteNonNegativeInteger(event.httpStatus) ?? 500,
    outcome: event.outcome === "success" || event.outcome === "cancelled" ? event.outcome : "failure",
    failureCategory: safeFailureCategory(event.failureCategory),
    durationMs: finiteNonNegative(event.durationMs) ?? 0,
    stages: {
      validationMs: finiteNonNegative(event.stages.validationMs),
      rateLimitingMs: finiteNonNegative(event.stages.rateLimitingMs),
      preparationMs: finiteNonNegative(event.stages.preparationMs),
      generationMs: finiteNonNegative(event.stages.generationMs),
    },
    diagnostics: safeDiagnosticsFromEvent(event.diagnostics),
    retrieval: {
      resultCount: finiteNonNegativeInteger(event.retrieval.resultCount) ?? null,
      candidateCount: finiteNonNegativeInteger(event.retrieval.candidateCount) ?? null,
      noContext: typeof event.retrieval.noContext === "boolean" ? event.retrieval.noContext : null,
    },
    generatedUtf8Bytes: finiteNonNegativeInteger(event.generatedUtf8Bytes) ?? null,
    citationCount: finiteNonNegativeInteger(event.citationCount) ?? null,
    hasCitations: typeof event.hasCitations === "boolean" ? event.hasCitations : null,
    usage: {
      generation: safeUsage(event.usage.generation),
      rewrite: safeUsage(event.usage.rewrite),
      embeddingTokens: null,
    },
    cost: {
      generation: generationCost ? safeCost(generationCost) : null,
      rewrite: rewriteCost ? safeCost(rewriteCost) : null,
      totalUsd: finiteNonNegative(event.cost.totalUsd),
    },
    toolCallCount: finiteNonNegativeInteger(event.toolCallCount) ?? 0,
    stopReason: safeStopReason(event.stopReason),
    agentStopReason: null,
    model: typeof event.model === "string" && event.model.length <= 120 ? event.model : null,
  };
}

function safeDiagnosticsFromEvent(diagnostics: ChatCompletionEvent["diagnostics"]): ChatCompletionEvent["diagnostics"] {
  return {
    totalDurationMs: diagnostics.totalDurationMs === null
      ? null
      : finiteNonNegative(diagnostics.totalDurationMs) ?? 0,
    rewrite: diagnostics.rewrite ? {
      used: diagnostics.rewrite.used === true,
      reason: stableRewriteReason(diagnostics.rewrite.reason),
      fallback: diagnostics.rewrite.fallback === true,
      durationMs: finiteNonNegative(diagnostics.rewrite.durationMs) ?? 0,
    } : null,
    embedding: diagnostics.embedding ? {
      durationMs: finiteNonNegative(diagnostics.embedding.durationMs) ?? 0,
      fallback: diagnostics.embedding.fallback === true,
      error: diagnostics.embedding.error === true,
      reason: stableReason(diagnostics.embedding.reason, ["success", "embedding_timeout", "embedding_error"]),
    } : null,
    retrieval: diagnostics.retrieval ? {
      stage: stableReason(diagnostics.retrieval.stage, [
        "hybrid", "filtered_fallback", "semantic_fallback", "lexical_fallback", "empty_error",
      ]),
      durationMs: finiteNonNegative(diagnostics.retrieval.durationMs) ?? 0,
      candidateCount: finiteNonNegativeInteger(diagnostics.retrieval.candidateCount) ?? 0,
      fallback: diagnostics.retrieval.fallback === true,
      error: diagnostics.retrieval.error === true,
      reason: stableReason(diagnostics.retrieval.reason, [
        "success", "embedding_failed_lexical_only", "hybrid_rpc_timeout", "hybrid_rpc_error",
        "filtered_fallback_timeout", "filtered_fallback_error", "hybrid_rpc_absent_legacy_semantic_fallback",
        "hybrid_rpc_absent_filtered_fallback",
      ]),
    } : null,
    reranking: diagnostics.reranking ? {
      durationMs: finiteNonNegative(diagnostics.reranking.durationMs) ?? 0,
      inputCount: finiteNonNegativeInteger(diagnostics.reranking.inputCount) ?? 0,
      outputCount: finiteNonNegativeInteger(diagnostics.reranking.outputCount) ?? 0,
      coverageAdjusted: finiteNonNegativeInteger(diagnostics.reranking.coverageAdjusted) ?? 0,
    } : null,
  };
}

function safeCost(cost: GeminiTextCostEstimate): GeminiTextCostEstimate | null {
  const estimateUsd = finiteNonNegative(cost.estimateUsd);
  if (estimateUsd === null || cost.model !== GEMINI_FLASH_STANDARD_PRICING.model) return null;
  return {
    currency: "USD",
    estimateUsd,
    pricingSource: GEMINI_FLASH_STANDARD_PRICING.pricingSource,
    pricingVerifiedOn: GEMINI_FLASH_STANDARD_PRICING.pricingVerifiedOn,
    pricingVersion: GEMINI_FLASH_STANDARD_PRICING.pricingVersion,
    model: cost.model,
    completeness: cost.completeness === "complete" ? "complete" : "partial",
  };
}

export function serializeChatCompletionEvent(event: ChatCompletionEvent): string {
  return JSON.stringify(safeEvent(event));
}

export function logChatCompletion(event: ChatCompletionEvent, logger: ChatLogger = console): void {
  try {
    logger.info(serializeChatCompletionEvent(event));
  } catch {
    // Telemetry must never change the response path or expose an error object.
  }
}

export function addCorrelationHeader(response: Response, correlationId: string): Response {
  response.headers.set(CHAT_CORRELATION_HEADER, correlationId);
  return response;
}

interface TraceStageState {
  startedAt: number | null;
  durationMs: number | null;
}

export interface ChatRequestTraceOptions {
  correlationId?: string;
  logger?: ChatLogger;
  now?: () => number;
}

export interface ChatTraceCompletionInput {
  httpStatus: number;
  outcome: ChatOutcome;
  failureCategory: ChatFailureCategory;
}

export interface ChatRequestTrace {
  readonly correlationId: string;
  beginStage(stage: "validation" | "rateLimiting" | "preparation" | "generation"): void;
  endStage(stage: "validation" | "rateLimiting" | "preparation" | "generation"): void;
  setLocale(locale: "en" | "tr"): void;
  setModel(model: string): void;
  setPreparedData(prepared: {
    matches: readonly unknown[];
    diagnostics?: HybridRetrievalDiagnostics;
    generationRequest: { model: string };
  }): void;
  observeGenerationChunk(chunk: {
    usageMetadata?: unknown;
    usageTurn?: "selection" | "final";
    finishReason?: unknown;
    toolCallCount?: unknown;
    retrieval?: unknown;
  }): void;
  /** Emits only the development/evaluation multi-tool trace; never part of the production completion event. */
  recordMultiToolTrace(trace: MultiToolTrace): void;
  recordOutput(text: string, utf8Bytes: number): void;
  complete(input: ChatTraceCompletionInput): ChatCompletionEvent;
}

export function createChatRequestTrace(options: ChatRequestTraceOptions = {}): ChatRequestTrace {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const stages: Record<"validation" | "rateLimiting" | "preparation" | "generation", TraceStageState> = {
    validation: { startedAt: null, durationMs: null },
    rateLimiting: { startedAt: null, durationMs: null },
    preparation: { startedAt: null, durationMs: null },
    generation: { startedAt: null, durationMs: null },
  };
  const correlationId = options.correlationId ?? createCorrelationId();
  let locale: "en" | "tr" | null = null;
  let diagnostics: HybridRetrievalDiagnostics | undefined;
  let resultCount: number | null = null;
  let candidateCount: number | null = null;
  let model: string | null = null;
  let generationUsage: NormalizedTokenUsage | null = null;
  const turnUsage = new Map<"selection" | "final", NormalizedTokenUsage | null>();
  let rewriteUsage: NormalizedTokenUsage | null = null;
  let rewriteModel: string | null = null;
  let stopReason: ChatStopReason = null;
  let toolCallCount = 0;
  let generatedUtf8Bytes: number | null = null;
  let generatedAnswer = "";
  let completed: ChatCompletionEvent | undefined;

  const trace: ChatRequestTrace = {
    correlationId,
    beginStage(stage) {
      if (stages[stage].startedAt === null) stages[stage].startedAt = now();
    },
    endStage(stage) {
      const state = stages[stage];
      if (state.durationMs !== null) return;
      if (state.startedAt !== null) state.durationMs = Math.max(0, now() - state.startedAt);
    },
    setLocale(value) { locale = value; },
    setModel(value) { model = value; },
    setPreparedData(prepared) {
      resultCount = prepared.matches.length;
      candidateCount = prepared.diagnostics?.retrieval.candidateCount ?? null;
      diagnostics = prepared.diagnostics;
      model = prepared.generationRequest.model;
      rewriteUsage = normalizeUsageMetadata(prepared.diagnostics?.rewrite.usageMetadata);
      rewriteModel = prepared.diagnostics?.rewrite.model ?? null;
    },
    observeGenerationChunk(chunk) {
      const latestUsage = normalizeUsageMetadata(chunk.usageMetadata);
      if (chunk.usageTurn === "selection" || chunk.usageTurn === "final") {
        turnUsage.set(chunk.usageTurn, mergeLatestUsage(turnUsage.get(chunk.usageTurn) ?? null, latestUsage));
      } else {
        // Untagged chunks are the original single-provider no-tool stream.
        generationUsage = mergeLatestUsage(generationUsage, latestUsage);
      }
      if (chunk.finishReason !== undefined && chunk.finishReason !== null) stopReason = normalizeStopReason(chunk.finishReason);
      const count = finiteNonNegativeInteger(chunk.toolCallCount);
      if (count !== undefined) toolCallCount = count;
      const retrieval = chunk.retrieval;
      if (isRecord(retrieval)) {
        const observedResultCount = finiteNonNegativeInteger(retrieval.resultCount);
        const observedCandidateCount = retrieval.candidateCount === null
          ? null
          : finiteNonNegativeInteger(retrieval.candidateCount);
        if (observedResultCount !== undefined
          && (retrieval.candidateCount === null || observedCandidateCount !== undefined)
          && typeof retrieval.noContext === "boolean") {
          resultCount = (resultCount ?? 0) + observedResultCount;
          candidateCount = candidateCount === null || observedCandidateCount === null || observedCandidateCount === undefined
            ? null
            : candidateCount + observedCandidateCount;
        }
      }
    },
    recordMultiToolTrace(value) {
      if (process.env.NODE_ENV === "production") return;
      try {
        const safeCalls = Array.isArray(value.calls)
          ? value.calls.map((call) => ({
            tool: typeof call?.tool === "string" && call.tool.length <= 80 ? call.tool : "unknown",
            disposition: call?.disposition === "success"
              || call?.disposition === "safe_failure"
              || call?.disposition === "duplicate"
              || call?.disposition === "fatal_failure"
              ? call.disposition
              : "fatal_failure",
            category: typeof call?.category === "string" && call.category.length <= 40 ? call.category : null,
            acceptedResultKind: typeof call?.acceptedResultKind === "string" && call.acceptedResultKind.length <= 80
              ? call.acceptedResultKind
              : null,
            acceptedResultCount: finiteNonNegativeInteger(call?.acceptedResultCount) ?? null,
            citationCount: finiteNonNegativeInteger(call?.citationCount) ?? null,
          }))
          : [];
        const stopStates: MultiToolTrace["finalStopState"][] = [
          "direct_no_tools", "answered_with_evidence", "partial_evidence", "all_tools_failed", "fatal_failure", "cancelled",
        ];
        const safeTrace = {
          event: "chat_multi_tool_trace" as const,
          schemaVersion: 1 as const,
          correlationId: safeCorrelationId(correlationId),
          selectedCount: finiteNonNegativeInteger(value.selectedCount) ?? 0,
          uniqueExecutionCount: finiteNonNegativeInteger(value.uniqueExecutionCount) ?? 0,
          duplicateCount: finiteNonNegativeInteger(value.duplicateCount) ?? 0,
          calls: safeCalls,
          finalStopState: stopStates.includes(value.finalStopState) ? value.finalStopState : "fatal_failure" as const,
        };
        (options.logger ?? console).info(JSON.stringify(safeTrace));
      } catch {
        // Development telemetry must never change the response path.
      }
    },
    recordOutput(text, utf8Bytes) {
      generatedAnswer += text;
      generatedUtf8Bytes = finiteNonNegativeInteger(utf8Bytes) ?? generatedUtf8Bytes ?? 0;
    },
    complete(input) {
      if (completed) return completed;
      (Object.keys(stages) as Array<keyof typeof stages>).forEach((stage) => trace.endStage(stage));
      const observedGenerationUsage = turnUsage.size
        ? sumSeparateUsageSnapshots([...turnUsage.values()])
        : generationUsage;
      const generationCost = estimateGeminiTextCost(model ?? "", observedGenerationUsage);
      const rewriteCost = estimateGeminiTextCost(rewriteModel ?? "", rewriteUsage);
      const totalUsd = generationCost || rewriteCost
        ? (generationCost?.estimateUsd ?? 0) + (rewriteCost?.estimateUsd ?? 0)
        : null;
      completed = {
        event: CHAT_OBSERVABILITY_EVENT,
        schemaVersion: CHAT_OBSERVABILITY_SCHEMA_VERSION,
        timestamp: new Date(now()).toISOString(),
        correlationId,
        route: CHAT_ROUTE,
        locale,
        httpStatus: input.httpStatus,
        outcome: input.outcome,
        failureCategory: input.failureCategory,
        durationMs: Math.max(0, now() - startedAt),
        stages: {
          validationMs: stages.validation.durationMs,
          rateLimitingMs: stages.rateLimiting.durationMs,
          preparationMs: stages.preparation.durationMs,
          generationMs: stages.generation.durationMs,
        },
        diagnostics: safeDiagnostics(diagnostics),
        retrieval: {
          resultCount,
          candidateCount,
          noContext: resultCount === null ? null : resultCount === 0,
        },
        generatedUtf8Bytes,
        citationCount: generatedUtf8Bytes === null ? null : countCitations(generatedAnswer),
        hasCitations: generatedUtf8Bytes === null ? null : countCitations(generatedAnswer) > 0,
        usage: { generation: observedGenerationUsage, rewrite: rewriteUsage, embeddingTokens: null },
        cost: { generation: generationCost, rewrite: rewriteCost, totalUsd },
        toolCallCount,
        stopReason,
        agentStopReason: null,
        model,
      };
      logChatCompletion(completed, options.logger);
      generatedAnswer = "";
      return completed;
    },
  };
  return trace;
}

export function failureCategoryForCode(code: string): ChatFailureCategory {
  switch (code) {
    case "UNSUPPORTED_MEDIA_TYPE": return "unsupported_media_type";
    case "INVALID_SESSION": return "invalid_session";
    case "INVALID_JSON":
    case "INVALID_REQUEST":
    case "UNSUPPORTED_LOCALE":
    case "MESSAGE_TOO_LARGE":
    case "INPUT_TOO_LARGE": return "invalid_request";
    case "BODY_TOO_LARGE": return "body_too_large";
    case "RATE_LIMITED": return "rate_limited";
    case "CLIENT_ABORTED": return "cancelled";
    case "PREPARATION_TIMEOUT": return "preparation_timeout";
    case "RETRIEVAL_ERROR": return "retrieval_failure";
    case "MODEL_TIMEOUT": return "model_timeout";
    case "OUTPUT_TOO_LARGE": return "output_limit";
    case "MODEL_ERROR": return "provider_error";
    case "TOOL_ERROR": return "tool_error";
    case "SERVICE_UNAVAILABLE": return "service_unavailable";
    default: return "provider_error";
  }
}
