import { FunctionCallingConfigMode } from "@google/genai";
import type { FunctionCall } from "@google/genai";
import type { Locale } from "@/types";
import {
  AGENT_MAX_ACCEPTED_TOOL_EXECUTIONS,
  AGENT_MAX_ESTIMATED_COST_USD,
  AGENT_MAX_INTERNAL_OUTPUT_BYTES,
  AGENT_MAX_INTERNAL_OUTPUT_TOKENS,
  AGENT_MAX_RESERVED_TOKENS,
  AGENT_MAX_RETRIEVAL_ROUNDS,
  AGENT_MAX_STEPS,
  AGENT_MAX_VERIFICATION_PASSES,
  AGENT_PROVIDER_MAX_OUTPUT_TOKENS,
  AGENT_QUALIFIED_ANSWER,
  AGENT_SAFE_ANSWER,
  AGENT_VERIFIER_MAX_OUTPUT_TOKENS,
} from "./limits";
import { buildGenerationRequest, type ChatDependencies, type ChatMessage, type ChatStreamChunk, type GenerationRequest } from "./core";
import {
  canonicalToolCallIdentity,
  dispatchToolCall,
  isDegradableToolFailureCategory,
  type AcceptedToolExecution,
  type ChatToolName,
  type SafeToolFailureResponse,
  type ToolRegistry,
} from "./tools";
import { ToolDispatchError, type ToolExecutionLogger } from "./tools";

export type AgentStopReason =
  | "direct_no_tools"
  | "supported_evidence"
  | "qualified_completion"
  | "insufficient_evidence"
  | "all_tools_failure"
  | "verifier_failure"
  | "inspection_failure"
  | "deadline_exceeded"
  | "budget_exceeded"
  | "provider_failure"
  | "output_limit"
  | "cancellation";

export type AgentStage = "interpret" | "retrieve" | "inspect" | "draft" | "verify" | "revise" | "stop";

/** Typed control decisions keep provider text outside the state machine. */
export type AgentDecision =
  | { kind: "direct_answer" }
  | { kind: "retrieve"; queryHint: string | null }
  | { kind: "inspect"; status: "sufficient" | "insufficient"; query: string | null }
  | { kind: "draft" }
  | { kind: "verify" }
  | { kind: "stop"; reason: AgentStopReason };

export type AgentState =
  | { phase: "interpret"; step: number }
  | { phase: "retrieve"; round: number; step: number }
  | { phase: "inspect"; round: number; step: number }
  | { phase: "draft"; step: number }
  | { phase: "verify"; step: number }
  | { phase: "revise"; step: number }
  | { phase: "stop"; reason: AgentStopReason; step: number };

export interface AgentTraceSummary {
  event: "chat_agent_trace";
  schemaVersion: 1;
  correlationId: string;
  stopReason: AgentStopReason;
  stageSequence: AgentStage[];
  stepCount: number;
  selectedCallCount: number;
  acceptedToolExecutions: number;
  duplicateCallCount: number;
  retrievalRounds: number;
  verificationPasses: number;
  toolFailureCount: number;
  evidenceAvailable: boolean;
  draftCreated: boolean;
  revisionApplied: boolean;
  claimTotals: { supported: number; qualified: number; removed: number };
  usage: { tokenCount: number | null; costUsd: number | null; completeness: "complete" | "partial" | "unknown" };
  durationMs: number;
  latencyBucket: "lt_1s" | "1_to_5s" | "5_to_15s" | "15_to_45s" | "over_45s";
}

export interface AgentLoopOptions {
  correlationId: string;
  logger?: ToolExecutionLogger;
  onAgentTrace?: (trace: AgentTraceSummary) => void;
}

interface AgentStats {
  stages: AgentStage[];
  steps: number;
  selectedCallCount: number;
  acceptedToolExecutions: number;
  duplicateCallCount: number;
  retrievalRounds: number;
  verificationPasses: number;
  toolFailureCount: number;
  evidenceAvailable: boolean;
  draftCreated: boolean;
  revisionApplied: boolean;
  claimTotals: { supported: number; qualified: number; removed: number };
  tokenCount: number | null;
  reservedTokens: number;
  reservedCostUsd: number;
  hasCompleteUsage: boolean;
  hasPartialUsage: boolean;
  costUsd: number | null;
}

interface InternalTurn {
  text: string;
  calls: FunctionCall[];
  usage: ChatStreamChunk["usageMetadata"][];
}

interface EvidenceRecord {
  key: string;
  result: AcceptedToolExecution["result"];
}

type ToolOutcome = { accepted: AcceptedToolExecution } | { failure: SafeToolFailureResponse };

interface BatchResult {
  outcomes: Map<string, ToolOutcome>;
  accepted: EvidenceRecord[];
  failures: Array<{ tool: string; category: string }>;
  rejectedForBudget: boolean;
}

const VERIFIER_SCHEMA = {
  type: "object",
  properties: {
    decision: { type: "string", enum: ["accept", "revise", "reject"] },
    finalAnswer: { type: ["string", "null"], maxLength: 8_000 },
    supportedClaims: { type: "integer", minimum: 0, maximum: 50 },
    qualifiedClaims: { type: "integer", minimum: 0, maximum: 50 },
    removedClaims: { type: "integer", minimum: 0, maximum: 50 },
  },
  required: ["decision", "finalAnswer", "supportedClaims", "qualifiedClaims", "removedClaims"],
  additionalProperties: false,
} as const;

const INSPECTOR_SCHEMA = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["sufficient", "insufficient"] },
    query: { type: ["string", "null"], maxLength: 2_000 },
  },
  required: ["status", "query"],
  additionalProperties: false,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSimplePleasantry(messages: readonly ChatMessage[]): boolean {
  const latest = messages.at(-1)?.content.trim().toLocaleLowerCase() ?? "";
  if (!latest || latest.length > 80) return false;
  return /^(?:hi|hello|hey|hiya|howdy|thanks|thank you|good morning|good afternoon|good evening|merhaba|selam|sağ ol|teşekkürler)[!,.?\s]*$/u.test(latest);
}

function callsFromChunk(chunk: ChatStreamChunk): FunctionCall[] {
  return [
    ...(chunk.functionCalls ?? []),
    ...(chunk.modelContent?.parts?.flatMap((part) => part.functionCall ? [part.functionCall] : []) ?? []),
  ];
}

function dedupeCalls(calls: readonly FunctionCall[]): FunctionCall[] {
  const result: FunctionCall[] = [];
  const seen = new Set<string>();
  for (const call of calls) {
    const key = call.id ? `provider:${call.id}` : `call:${JSON.stringify(call)}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(call);
    }
  }
  return result;
}

function toolCallKey(call: FunctionCall): string | null {
  return canonicalToolCallIdentity(call);
}

function appendInstruction(request: GenerationRequest, instruction: string): GenerationRequest {
  return {
    ...request,
    config: {
      ...request.config,
      systemInstruction: `${request.config.systemInstruction}\n\n${instruction}`,
    },
  };
}

function noToolsConfig(request: GenerationRequest, maxOutputTokens: number, jsonSchema?: Record<string, unknown>): GenerationRequest {
  return {
    ...request,
    config: {
      ...request.config,
      tools: undefined,
      toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.NONE } },
      automaticFunctionCalling: { disable: true },
      maxOutputTokens,
      temperature: 0,
      ...(jsonSchema ? { responseMimeType: "application/json", responseJsonSchema: jsonSchema } : {}),
    },
  };
}

function safeJson(value: unknown, maxBytes: number): string {
  let serialized = "[]";
  try {
    serialized = JSON.stringify(value) ?? "[]";
  } catch {
    return "[]";
  }
  if (new TextEncoder().encode(serialized).byteLength <= maxBytes) return serialized;
  return `${serialized.slice(0, Math.max(0, maxBytes - 32))}...[bounded]`;
}

function evidencePacket(evidence: readonly EvidenceRecord[], failures: readonly { tool: string; category: string }[] = []): string {
  return safeJson({
    evidence: evidence.map((item) => ({ key: item.key, result: item.result })),
    unavailableReadOnlyTools: failures,
  }, AGENT_MAX_INTERNAL_OUTPUT_BYTES);
}

function parseStrictJson(text: string): Record<string, unknown> | null {
  if (!text || new TextEncoder().encode(text).byteLength > AGENT_MAX_INTERNAL_OUTPUT_BYTES) return null;
  try {
    const value = JSON.parse(text) as unknown;
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function parseInspection(text: string): { status: "sufficient" | "insufficient"; query: string | null } | null {
  const value = parseStrictJson(text);
  if (!value || Object.keys(value).sort().join(",") !== "query,status") return null;
  if (value.status !== "sufficient" && value.status !== "insufficient") return null;
  if (value.query !== null && (typeof value.query !== "string" || value.query.trim().length === 0 || value.query.length > 2_000)) return null;
  return { status: value.status, query: value.query as string | null };
}

function parseVerification(text: string): {
  decision: "accept" | "revise" | "reject";
  finalAnswer: string | null;
  supportedClaims: number;
  qualifiedClaims: number;
  removedClaims: number;
} | null {
  const value = parseStrictJson(text);
  if (!value || Object.keys(value).sort().join(",") !== "decision,finalAnswer,qualifiedClaims,removedClaims,supportedClaims") return null;
  if (value.decision !== "accept" && value.decision !== "revise" && value.decision !== "reject") return null;
  const numbers = [value.supportedClaims, value.qualifiedClaims, value.removedClaims];
  if (!numbers.every((item) => typeof item === "number" && Number.isSafeInteger(item) && item >= 0 && item <= 50)) return null;
  if (value.finalAnswer !== null && (typeof value.finalAnswer !== "string" || value.finalAnswer.trim().length === 0 || value.finalAnswer.length > 8_000)) return null;
  if (value.decision === "revise" && value.finalAnswer === null) return null;
  if (value.finalAnswer !== null && !/\[[^\]\n]{1,200}\]\((?:https?:\/\/|mailto:)[^)\s]{1,2000}\)/u.test(value.finalAnswer)) return null;
  return {
    decision: value.decision,
    finalAnswer: value.finalAnswer as string | null,
    supportedClaims: numbers[0] as number,
    qualifiedClaims: numbers[1] as number,
    removedClaims: numbers[2] as number,
  };
}

function answerCitationsAreSupported(answer: string, evidence: readonly EvidenceRecord[]): boolean {
  const citedUrls = [...answer.matchAll(/\[[^\]\n]{1,200}\]\(((?:https?:\/\/|mailto:)[^)\s]{1,2000})\)/gu)].map((match) => match[1]);
  const evidenceUrls = new Set(evidence.flatMap((item) => item.result.citations.map((citation) => citation.url)));
  return citedUrls.length > 0 && citedUrls.every((url) => evidenceUrls.has(url));
}

function usageCompleteness(stats: AgentStats): "complete" | "partial" | "unknown" {
  if (stats.hasCompleteUsage) return "complete";
  if (stats.hasPartialUsage) return "partial";
  return "unknown";
}

function latencyBucket(durationMs: number): AgentTraceSummary["latencyBucket"] {
  if (durationMs < 1_000) return "lt_1s";
  if (durationMs < 5_000) return "1_to_5s";
  if (durationMs < 15_000) return "5_to_15s";
  if (durationMs <= 45_000) return "15_to_45s";
  return "over_45s";
}

function emitSafe(options: AgentLoopOptions, trace: AgentTraceSummary): void {
  try { options.onAgentTrace?.(trace); } catch { /* telemetry must never affect the answer */ }
}

function makeTrace(options: AgentLoopOptions, startedAt: number, stopReason: AgentStopReason, stats: AgentStats): AgentTraceSummary {
  const durationMs = Math.max(0, Date.now() - startedAt);
  return {
    event: "chat_agent_trace",
    schemaVersion: 1,
    correlationId: options.correlationId,
    stopReason,
    stageSequence: [...stats.stages, "stop"],
    stepCount: stats.steps,
    selectedCallCount: stats.selectedCallCount,
    acceptedToolExecutions: stats.acceptedToolExecutions,
    duplicateCallCount: stats.duplicateCallCount,
    retrievalRounds: stats.retrievalRounds,
    verificationPasses: stats.verificationPasses,
    toolFailureCount: stats.toolFailureCount,
    evidenceAvailable: stats.evidenceAvailable,
    draftCreated: stats.draftCreated,
    revisionApplied: stats.revisionApplied,
    claimTotals: { ...stats.claimTotals },
    usage: {
      tokenCount: stats.tokenCount,
      costUsd: stats.costUsd,
      completeness: usageCompleteness(stats),
    },
    durationMs,
    latencyBucket: latencyBucket(durationMs),
  };
}

function usageCost(stats: AgentStats, usage: ChatStreamChunk["usageMetadata"]): void {
  if (!usage || typeof usage !== "object") return;
  const record = usage as Record<string, unknown>;
  const total = typeof record.totalTokenCount === "number" && Number.isSafeInteger(record.totalTokenCount) && record.totalTokenCount >= 0
    ? record.totalTokenCount
    : null;
  const prompt = typeof record.promptTokenCount === "number" && Number.isSafeInteger(record.promptTokenCount) && record.promptTokenCount >= 0
    ? record.promptTokenCount
    : null;
  const output = typeof record.candidatesTokenCount === "number" && Number.isSafeInteger(record.candidatesTokenCount) && record.candidatesTokenCount >= 0
    ? record.candidatesTokenCount
    : null;
  if (total !== null) stats.tokenCount = (stats.tokenCount ?? 0) + total;
  if (prompt !== null && output !== null) stats.hasCompleteUsage = true;
  else stats.hasPartialUsage = true;
  if (total !== null) stats.costUsd = Math.min(AGENT_MAX_ESTIMATED_COST_USD, (stats.costUsd ?? 0) + total * 2.5 / 1_000_000);
}

function deadlineSignal(signal: AbortSignal): boolean {
  const reason = signal.reason;
  return reason instanceof Error && reason.name === "ChatDeadlineError";
}

function reserveTurn(stats: AgentStats, maxOutputTokens: number): void {
  // Reserve before the provider call. Unknown/delayed usage cannot authorize
  // another turn, and the fixed allowance includes a small prompt overhead.
  const reservation = maxOutputTokens + 128;
  const estimatedCost = reservation * 2.5 / 1_000_000;
  if (stats.reservedTokens + reservation > AGENT_MAX_RESERVED_TOKENS
    || stats.reservedCostUsd + estimatedCost > AGENT_MAX_ESTIMATED_COST_USD) {
    throw new ToolDispatchError("call_limit");
  }
  stats.reservedTokens += reservation;
  stats.reservedCostUsd += estimatedCost;
}

async function collectTurn(
  dependencies: ChatDependencies,
  request: GenerationRequest,
  signal: AbortSignal,
  usage: (value: ChatStreamChunk["usageMetadata"]) => void,
): Promise<InternalTurn> {
  signal.throwIfAborted();
  const stream = await dependencies.generateContentStream(request, signal);
  const texts: string[] = [];
  const calls: FunctionCall[] = [];
  const usages: ChatStreamChunk["usageMetadata"][] = [];
  for await (const chunk of stream) {
    if (signal.aborted) {
      if (deadlineSignal(signal)) throw signal.reason;
      throw new ToolDispatchError("cancelled");
    }
    if (chunk.usageMetadata) {
      usages.push(chunk.usageMetadata);
      usage(chunk.usageMetadata);
    }
    if (chunk.text) texts.push(chunk.text);
    calls.push(...callsFromChunk(chunk));
  }
  const text = texts.join("");
  if (new TextEncoder().encode(text).byteLength > AGENT_MAX_INTERNAL_OUTPUT_BYTES
    || text.length > AGENT_MAX_INTERNAL_OUTPUT_TOKENS * 4) throw new ToolDispatchError("result_too_large");
  return { text, calls: dedupeCalls(calls), usage: usages };
}

function selectionRequest(
  messages: ChatMessage[],
  locale: Locale,
  registry: ToolRegistry,
  evidence: readonly EvidenceRecord[],
  queryHint: string | null,
  failures: readonly { tool: string; category: string }[],
): GenerationRequest {
  const request = buildGenerationRequest(messages, locale, "");
  const context = evidence.length
    ? `Accepted public evidence packet:\n${evidencePacket(evidence, failures)}`
    : "No evidence has been accepted yet.";
  const hint = queryHint ? `Use this explicit retrieval query when formulating the next call: ${queryHint}` : "Formulate the narrowest retrieval query needed for the user request.";
  const plannerRequest = appendInstruction(request, `You are an internal bounded retrieval planner. Interpret the request and select only approved read-only functions. ${hint} ${context} Return function calls only; never answer the user and never emit internal reasoning.`);
  return {
    ...plannerRequest,
    config: {
      ...plannerRequest.config,
      tools: [{ functionDeclarations: [...registry.declarations] }],
      toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.VALIDATED } },
      automaticFunctionCalling: { disable: true },
      maxOutputTokens: AGENT_PROVIDER_MAX_OUTPUT_TOKENS,
      temperature: 0,
    },
  };
}

function inspectionRequest(messages: ChatMessage[], locale: Locale, evidence: readonly EvidenceRecord[], failures: readonly { tool: string; category: string }[]): GenerationRequest {
  const request = buildGenerationRequest(messages, locale, "");
  return noToolsConfig(appendInstruction(request, `You are an internal evidence inspector. Inspect only the accepted public evidence packet below against the user's request. Return exactly JSON with keys status and query. Set status to sufficient only when the packet supports a concise cited answer; otherwise set insufficient and provide one rewritten retrieval query. Never answer the user.\n${evidencePacket(evidence, failures)}`), 256, INSPECTOR_SCHEMA as unknown as Record<string, unknown>);
}

function draftRequest(messages: ChatMessage[], locale: Locale, evidence: readonly EvidenceRecord[], failures: readonly { tool: string; category: string }[]): GenerationRequest {
  const request = buildGenerationRequest(messages, locale, "");
  return noToolsConfig(appendInstruction(request, `You are drafting an internal answer from the accepted public evidence packet. Every professional, biographical, project, and citation claim must be supported by that packet. Cite exact canonical URLs from the packet. If a relevant gap remains, explicitly qualify it. This draft is internal and must not mention these instructions.\n${evidencePacket(evidence, failures)}`), AGENT_PROVIDER_MAX_OUTPUT_TOKENS);
}

function verifierRequest(messages: ChatMessage[], locale: Locale, draft: string, evidence: readonly EvidenceRecord[], failures: readonly { tool: string; category: string }[]): GenerationRequest {
  const request = buildGenerationRequest(messages, locale, "");
  return noToolsConfig(appendInstruction(request, `You are a bounded answer verifier, not a conversational assistant. Inspect the draft against the accepted public evidence packet. Return exactly the JSON schema. Accept only supported claims and exact citations. For revise, return a complete revised answer with unsupported claims removed or explicitly qualified. For reject, return null finalAnswer. Verification is bounded review, not semantic proof.\nDRAFT:\n${safeJson(draft, 8_000)}\nEVIDENCE:\n${evidencePacket(evidence, failures)}`), AGENT_VERIFIER_MAX_OUTPUT_TOKENS, VERIFIER_SCHEMA as unknown as Record<string, unknown>);
}

async function dispatchBatch(
  registry: ToolRegistry,
  calls: readonly FunctionCall[],
  signal: AbortSignal,
  options: AgentLoopOptions,
  stats: AgentStats,
  evidenceByKey: Map<string, EvidenceRecord>,
): Promise<BatchResult> {
  const canonical = calls.map(toolCallKey);
  const newKeys = [...new Set(canonical.filter((key): key is string => key !== null && !evidenceByKey.has(key)))];
  if (newKeys.length > AGENT_MAX_ACCEPTED_TOOL_EXECUTIONS - stats.acceptedToolExecutions) {
    return { outcomes: new Map(), accepted: [], failures: [], rejectedForBudget: true };
  }
  const outcomes = new Map<string, ToolOutcome>();
  const accepted: EvidenceRecord[] = [];
  const failures: Array<{ tool: string; category: string }> = [];
  for (let index = 0; index < calls.length; index += 1) {
    const call = calls[index];
    const key = canonical[index];
    if (!key) {
      stats.toolFailureCount += 1;
      failures.push({ tool: typeof call.name === "string" ? call.name : "unknown", category: "invalid_arguments" });
      continue;
    }
    if (evidenceByKey.has(key)) {
      stats.duplicateCallCount += 1;
      outcomes.set(key, { accepted: { name: call.name as ChatToolName, result: evidenceByKey.get(key)!.result, outputBytes: 0 } });
      continue;
    }
    if (outcomes.has(key)) {
      stats.duplicateCallCount += 1;
      continue;
    }
    try {
      const execution = await dispatchToolCall(registry, call, {
        correlationId: options.correlationId,
        signal,
        completedToolCalls: stats.acceptedToolExecutions,
        logger: options.logger,
      });
      stats.acceptedToolExecutions += 1;
      const record = { key, result: execution.result };
      evidenceByKey.set(key, record);
      accepted.push(record);
      outcomes.set(key, { accepted: execution });
    } catch (error) {
      if (signal.aborted || (error instanceof ToolDispatchError && error.category === "cancelled")) throw new ToolDispatchError("cancelled");
      const category = error instanceof ToolDispatchError ? error.category : "handler_failure";
      if (!isDegradableToolFailureCategory(category)) throw error;
      stats.toolFailureCount += 1;
      failures.push({ tool: typeof call.name === "string" ? call.name : "unknown", category });
      outcomes.set(key, { failure: { error: { type: "tool_error", category, retryable: category === "timeout" || category === "handler_failure" } } });
    }
  }
  return { outcomes, accepted, failures, rejectedForBudget: false };
}

function emitFinal(text: string, toolCallCount: number): ChatStreamChunk {
  return { text, usageTurn: "final", toolCallCount };
}

/**
 * Finite evidence-gathering loop. Internal selection, inspection, draft, and
 * verification text is buffered and never yielded to the client.
 */
export async function* streamBoundedEvidenceAgent(
  messages: ChatMessage[],
  locale: Locale,
  dependencies: ChatDependencies,
  registry: ToolRegistry,
  signal: AbortSignal,
  options: AgentLoopOptions,
): AsyncGenerator<ChatStreamChunk> {
  const startedAt = Date.now();
  const stats: AgentStats = {
    stages: [], steps: 0, selectedCallCount: 0, acceptedToolExecutions: 0, duplicateCallCount: 0,
    retrievalRounds: 0, verificationPasses: 0, toolFailureCount: 0, evidenceAvailable: false,
    draftCreated: false, revisionApplied: false, claimTotals: { supported: 0, qualified: 0, removed: 0 },
    tokenCount: null, reservedTokens: 0, reservedCostUsd: 0, hasCompleteUsage: false, hasPartialUsage: false, costUsd: null,
  };
  let state: AgentState = { phase: "interpret", step: 0 };
  let decision: AgentDecision = { kind: "retrieve", queryHint: null };
  const failures: Array<{ tool: string; category: string }> = [];
  let terminalEmitted = false;
  const terminal = (reason: AgentStopReason) => {
    if (terminalEmitted) return;
    terminalEmitted = true;
    void state;
    void decision;
    emitSafe(options, makeTrace(options, startedAt, reason, stats));
  };
  const step = (stage: AgentStage) => {
    stats.steps += 1;
    if (stats.steps > AGENT_MAX_STEPS) throw new ToolDispatchError("call_limit");
    if (stats.stages.at(-1) !== stage) stats.stages.push(stage);
    if (stage === "interpret") state = { phase: "interpret", step: stats.steps };
    if (stage === "retrieve") state = { phase: "retrieve", round: stats.retrievalRounds, step: stats.steps };
    if (stage === "inspect") state = { phase: "inspect", round: stats.retrievalRounds, step: stats.steps };
    if (stage === "draft") state = { phase: "draft", step: stats.steps };
    if (stage === "verify") state = { phase: "verify", step: stats.steps };
    if (stage === "revise") state = { phase: "revise", step: stats.steps };
  };
  const usage = (value: ChatStreamChunk["usageMetadata"]) => usageCost(stats, value);
  try {
    step("interpret");
    const base = buildGenerationRequest(messages, locale, "");
    if (isSimplePleasantry(messages)) {
      decision = { kind: "direct_answer" };
      reserveTurn(stats, AGENT_PROVIDER_MAX_OUTPUT_TOKENS);
      const turn = await collectTurn(dependencies, noToolsConfig(base, AGENT_PROVIDER_MAX_OUTPUT_TOKENS), signal, usage);
      for (const chunk of turn.usage) yield { usageMetadata: chunk, usageTurn: "direct", toolCallCount: 0 };
      state = { phase: "stop", reason: "direct_no_tools", step: stats.steps };
      terminal("direct_no_tools");
      for (const text of turn.text ? [turn.text] : []) yield { ...emitFinal(text, 0), usageTurn: "direct" };
      return;
    }

    const evidenceByKey = new Map<string, EvidenceRecord>();
    let queryHint: string | null = null;
    let inspection: { status: "sufficient" | "insufficient"; query: string | null } | null = null;
    for (let round = 0; round < AGENT_MAX_RETRIEVAL_ROUNDS; round += 1) {
      step("retrieve");
      stats.retrievalRounds += 1;
      reserveTurn(stats, AGENT_PROVIDER_MAX_OUTPUT_TOKENS);
      const selection = await collectTurn(dependencies, selectionRequest(messages, locale, registry, [...evidenceByKey.values()], queryHint, failures), signal, usage);
      for (const chunk of selection.usage) yield { usageMetadata: chunk, usageTurn: "selection", toolCallCount: stats.acceptedToolExecutions };
      const calls = selection.calls;
      stats.selectedCallCount += calls.length;
      if (!calls.length) break;
      const batch = await dispatchBatch(registry, calls, signal, options, stats, evidenceByKey);
      failures.push(...batch.failures);
      if (batch.rejectedForBudget) {
        decision = { kind: "stop", reason: "budget_exceeded" };
        terminal("budget_exceeded");
        state = { phase: "stop", reason: "budget_exceeded", step: stats.steps };
        yield emitFinal(AGENT_QUALIFIED_ANSWER, stats.acceptedToolExecutions);
        return;
      }
      stats.evidenceAvailable = evidenceByKey.size > 0;
      if (!stats.evidenceAvailable) {
        decision = { kind: "stop", reason: "all_tools_failure" };
        terminal("all_tools_failure");
        state = { phase: "stop", reason: "all_tools_failure", step: stats.steps };
        yield emitFinal(AGENT_SAFE_ANSWER, stats.acceptedToolExecutions);
        return;
      }
      step("inspect");
      reserveTurn(stats, 256);
      let inspected: InternalTurn;
      try {
        inspected = await collectTurn(dependencies, inspectionRequest(messages, locale, [...evidenceByKey.values()], failures), signal, usage);
      } catch {
        if (signal.aborted) throw new ToolDispatchError("cancelled");
        decision = { kind: "stop", reason: "inspection_failure" };
        terminal("inspection_failure");
        state = { phase: "stop", reason: "inspection_failure", step: stats.steps };
        yield emitFinal(AGENT_QUALIFIED_ANSWER, stats.acceptedToolExecutions);
        return;
      }
      for (const chunk of inspected.usage) yield { usageMetadata: chunk, usageTurn: "inspection", toolCallCount: stats.acceptedToolExecutions };
      inspection = parseInspection(inspected.text);
      if (!inspection) {
        decision = { kind: "stop", reason: "inspection_failure" };
        terminal("inspection_failure");
        state = { phase: "stop", reason: "inspection_failure", step: stats.steps };
        yield emitFinal(AGENT_QUALIFIED_ANSWER, stats.acceptedToolExecutions);
        return;
      }
      decision = { kind: "inspect", status: inspection.status, query: inspection.query };
      if (inspection.status === "sufficient") break;
      queryHint = inspection.query;
      if (round === AGENT_MAX_RETRIEVAL_ROUNDS - 1 || !queryHint) {
        decision = { kind: "stop", reason: "insufficient_evidence" };
        terminal("insufficient_evidence");
        state = { phase: "stop", reason: "insufficient_evidence", step: stats.steps };
        yield emitFinal(AGENT_QUALIFIED_ANSWER, stats.acceptedToolExecutions);
        return;
      }
    }

    if (!stats.evidenceAvailable || inspection?.status !== "sufficient") {
      decision = { kind: "stop", reason: "insufficient_evidence" };
      terminal("insufficient_evidence");
      state = { phase: "stop", reason: "insufficient_evidence", step: stats.steps };
      yield emitFinal(AGENT_SAFE_ANSWER, stats.acceptedToolExecutions);
      return;
    }
    step("draft");
    decision = { kind: "draft" };
    reserveTurn(stats, AGENT_PROVIDER_MAX_OUTPUT_TOKENS);
    const draftTurn = await collectTurn(dependencies, draftRequest(messages, locale, [...evidenceByKey.values()], failures), signal, usage);
    for (const chunk of draftTurn.usage) yield { usageMetadata: chunk, usageTurn: "draft", toolCallCount: stats.acceptedToolExecutions };
    if (!draftTurn.text.trim()) {
      decision = { kind: "stop", reason: "provider_failure" };
      terminal("provider_failure");
      state = { phase: "stop", reason: "provider_failure", step: stats.steps };
      yield emitFinal(AGENT_QUALIFIED_ANSWER, stats.acceptedToolExecutions);
      return;
    }
    stats.draftCreated = true;
    step("verify");
    decision = { kind: "verify" };
    stats.verificationPasses += 1;
    if (stats.verificationPasses > AGENT_MAX_VERIFICATION_PASSES) {
      decision = { kind: "stop", reason: "budget_exceeded" };
      terminal("budget_exceeded");
      state = { phase: "stop", reason: "budget_exceeded", step: stats.steps };
      yield emitFinal(AGENT_QUALIFIED_ANSWER, stats.acceptedToolExecutions);
      return;
    }
    let verified: ReturnType<typeof parseVerification> = null;
    try {
      reserveTurn(stats, AGENT_VERIFIER_MAX_OUTPUT_TOKENS);
      const verifier = await collectTurn(dependencies, verifierRequest(messages, locale, draftTurn.text, [...evidenceByKey.values()], failures), signal, usage);
      for (const chunk of verifier.usage) yield { usageMetadata: chunk, usageTurn: "verification", toolCallCount: stats.acceptedToolExecutions };
      verified = parseVerification(verifier.text);
    } catch {
      if (signal.aborted) throw new ToolDispatchError("cancelled");
      decision = { kind: "stop", reason: "verifier_failure" };
      terminal("verifier_failure");
      state = { phase: "stop", reason: "verifier_failure", step: stats.steps };
      yield emitFinal(AGENT_QUALIFIED_ANSWER, stats.acceptedToolExecutions);
      return;
    }
    if (!verified) {
      decision = { kind: "stop", reason: "verifier_failure" };
      terminal("verifier_failure");
      state = { phase: "stop", reason: "verifier_failure", step: stats.steps };
      yield emitFinal(AGENT_QUALIFIED_ANSWER, stats.acceptedToolExecutions);
      return;
    }
    stats.claimTotals = {
      supported: verified.supportedClaims,
      qualified: verified.qualifiedClaims,
      removed: verified.removedClaims,
    };
    if (verified.decision === "reject" || !verified.finalAnswer || !answerCitationsAreSupported(verified.finalAnswer, [...evidenceByKey.values()])) {
      decision = { kind: "stop", reason: "verifier_failure" };
      terminal("verifier_failure");
      state = { phase: "stop", reason: "verifier_failure", step: stats.steps };
      yield emitFinal(AGENT_QUALIFIED_ANSWER, stats.acceptedToolExecutions);
      return;
    }
    if (verified.decision === "revise") {
      step("revise");
      decision = { kind: "stop", reason: "qualified_completion" };
      stats.revisionApplied = true;
      state = { phase: "stop", reason: "qualified_completion", step: stats.steps };
      terminal("qualified_completion");
      yield emitFinal(verified.finalAnswer, stats.acceptedToolExecutions);
      return;
    }
    decision = { kind: "stop", reason: verified.qualifiedClaims || verified.removedClaims ? "qualified_completion" : "supported_evidence" };
    state = { phase: "stop", reason: decision.reason, step: stats.steps };
    terminal(decision.reason);
    yield emitFinal(verified.finalAnswer, stats.acceptedToolExecutions);
  } catch (error) {
    if (deadlineSignal(signal)) {
      decision = { kind: "stop", reason: "deadline_exceeded" };
      terminal("deadline_exceeded");
      state = { phase: "stop", reason: "deadline_exceeded", step: stats.steps };
      throw error;
    }
    if (signal.aborted || (error instanceof ToolDispatchError && error.category === "cancelled")) {
      decision = { kind: "stop", reason: "cancellation" };
      terminal("cancellation");
      state = { phase: "stop", reason: "cancellation", step: stats.steps };
      throw new ToolDispatchError("cancelled");
    }
    if (error instanceof ToolDispatchError && (error.category === "call_limit" || error.category === "result_too_large")) {
      decision = { kind: "stop", reason: error.category === "result_too_large" ? "output_limit" : "budget_exceeded" };
      terminal(error.category === "result_too_large" ? "output_limit" : "budget_exceeded");
      state = { phase: "stop", reason: decision.reason, step: stats.steps };
      yield emitFinal(AGENT_QUALIFIED_ANSWER, stats.acceptedToolExecutions);
      return;
    }
    decision = { kind: "stop", reason: "provider_failure" };
    terminal("provider_failure");
    state = { phase: "stop", reason: "provider_failure", step: stats.steps };
    throw error;
  }
}

export const AGENT_BUDGETS = {
  maxAcceptedToolExecutions: AGENT_MAX_ACCEPTED_TOOL_EXECUTIONS,
  maxRetrievalRounds: AGENT_MAX_RETRIEVAL_ROUNDS,
  maxVerificationPasses: AGENT_MAX_VERIFICATION_PASSES,
  maxSteps: AGENT_MAX_STEPS,
  maxReservedTokens: AGENT_MAX_RESERVED_TOKENS,
  maxInternalOutputTokens: AGENT_MAX_INTERNAL_OUTPUT_TOKENS,
};
