import { FunctionCallingConfigMode } from "@google/genai";
import type { Content, FunctionCall } from "@google/genai";
import type { Locale } from "@/types";
import {
  buildGenerationRequest,
  type ChatDependencies,
  type ChatMessage,
  type ChatStreamChunk,
  type GenerationRequest,
} from "./core";
import {
  canonicalToolCallIdentity,
  dispatchToolCall,
  isDegradableToolFailureCategory,
  summarizeAcceptedToolResult,
  ToolDispatchError,
  type ToolExecutionLogger,
  type ChatToolName,
  type SafeToolFailureResponse,
  type ToolRegistry,
} from "./tools";
import { CHAT_MAX_TOOL_CALLS } from "./limits";

export type MultiToolFinalStopState =
  | "direct_no_tools"
  | "answered_with_evidence"
  | "partial_evidence"
  | "all_tools_failed"
  | "fatal_failure"
  | "cancelled";

export interface MultiToolTraceCall {
  tool: ChatToolName | "unknown";
  disposition: "success" | "safe_failure" | "duplicate" | "fatal_failure";
  category: string | null;
  acceptedResultKind: string | null;
  acceptedResultCount: number | null;
  citationCount: number | null;
}

export interface MultiToolTrace {
  event: "chat_multi_tool_trace";
  schemaVersion: 1;
  correlationId: string;
  selectedCount: number;
  uniqueExecutionCount: number;
  duplicateCount: number;
  calls: MultiToolTraceCall[];
  finalStopState: MultiToolFinalStopState;
}

export interface ToolCallingOptions {
  correlationId: string;
  logger?: ToolExecutionLogger;
  onMultiToolTrace?: (trace: MultiToolTrace) => void;
}

function emitMultiToolTrace(options: ToolCallingOptions, trace: MultiToolTrace): void {
  try {
    options.onMultiToolTrace?.(trace);
  } catch {
    // Development/evaluation telemetry must never change chat behavior.
  }
}

function functionCallsFromChunk(chunk: ChatStreamChunk): FunctionCall[] {
  const direct = chunk.functionCalls ?? [];
  const fromParts = chunk.modelContent?.parts?.flatMap((part) => part.functionCall ? [part.functionCall] : []) ?? [];
  return [...direct, ...fromParts];
}

function providerCallKey(call: FunctionCall): string {
  if (call.id) return `id:${call.id}`;
  return `call:${canonicalToolCallIdentity(call) ?? `${call.name ?? ""}:${JSON.stringify(call.args ?? null)}`}`;
}

type GenerationContent = GenerationRequest["contents"][number];

function addUniqueCalls(target: FunctionCall[], calls: readonly FunctionCall[]): void {
  const existing = new Set(target.map((call) => callKey(call)));
  calls.forEach((call) => {
    const key = callKey(call);
    if (!existing.has(key)) {
      existing.add(key);
      target.push(call);
    }
  });
}

function callKey(call: FunctionCall): string {
  return providerCallKey(call);
}

function modelFunctionContent(calls: readonly FunctionCall[], modelContent: Content | undefined): Content {
  const parts: NonNullable<Content["parts"]> = [];
  const seen = new Set<string>();
  for (const part of modelContent?.parts ?? []) {
    if (!part.functionCall) continue;
    const key = providerCallKey(part.functionCall);
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(part);
  }
  for (const functionCall of calls) {
    const key = providerCallKey(functionCall);
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push({ functionCall });
  }
  return { role: "model", parts };
}

type AcceptedExecution = Awaited<ReturnType<typeof dispatchToolCall>>;
type SafeExecutionFailure = SafeToolFailureResponse;
type ExecutionOutcome =
  | { accepted: AcceptedExecution; failure?: never }
  | { accepted?: never; failure: SafeExecutionFailure };

interface FinalToolResponse {
  call: FunctionCall;
  response: Record<string, unknown>;
}

function toolName(call: FunctionCall): ChatToolName | "unknown" {
  return typeof call.name === "string" && [
    "search_knowledge",
    "get_cv_timeline",
    "get_project_details",
    "list_articles",
    "get_contact_options",
  ].includes(call.name)
    ? call.name as ChatToolName
    : "unknown";
}

function traceForFatalCalls(
  calls: readonly FunctionCall[],
  category: string,
  finalStopState: MultiToolFinalStopState,
  correlationId: string,
): MultiToolTrace {
  return {
    event: "chat_multi_tool_trace",
    schemaVersion: 1,
    correlationId,
    selectedCount: calls.length,
    uniqueExecutionCount: 0,
    duplicateCount: 0,
    calls: calls.map((call) => ({
      tool: toolName(call),
      disposition: "fatal_failure",
      category,
      acceptedResultKind: null,
      acceptedResultCount: null,
      citationCount: null,
    })),
    finalStopState,
  };
}

function finalRequest(
  request: GenerationRequest,
  calls: readonly FunctionCall[],
  results: readonly FinalToolResponse[],
): GenerationRequest {
  const modelContent = modelFunctionContent(calls, undefined) as unknown as GenerationContent;
  const functionResponseContent = {
    role: "user",
    parts: results.map(({ call, response }) => ({
      functionResponse: {
        ...(call.id ? { id: call.id } : {}),
        name: call.name,
        response,
      },
    })),
  } as unknown as GenerationContent;
  return {
    model: request.model,
    contents: [...request.contents, modelContent, functionResponseContent],
    config: {
      systemInstruction: request.config.systemInstruction,
      toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.NONE } },
      automaticFunctionCalling: { disable: true },
    },
  };
}

/** One bounded model selection turn, followed by one tool-disabled answer turn. */
export async function* streamModelSelectedChat(
  messages: ChatMessage[],
  locale: Locale,
  dependencies: ChatDependencies,
  registry: ToolRegistry,
  signal: AbortSignal,
  options: ToolCallingOptions,
): AsyncGenerator<ChatStreamChunk> {
  if (signal.aborted) {
    emitMultiToolTrace(options, traceForFatalCalls([], "cancelled", "cancelled", options.correlationId));
    throw new ToolDispatchError("cancelled");
  }
  const baseRequest = buildGenerationRequest(messages, locale, "");
  const selectionRequest: GenerationRequest = {
    ...baseRequest,
    config: {
      ...baseRequest.config,
      tools: [{ functionDeclarations: [...registry.declarations] }],
      toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.VALIDATED } },
      automaticFunctionCalling: { disable: true },
    },
  };

  const selectionStream = await dependencies.generateContentStream(selectionRequest, signal);
  const selectionChunks: ChatStreamChunk[] = [];
  const calls: FunctionCall[] = [];
  const selectionModelParts: NonNullable<Content["parts"]> = [];
  for await (const chunk of selectionStream) {
    selectionChunks.push(chunk);
    if (chunk.modelContent?.parts) {
      selectionModelParts.push(...chunk.modelContent.parts.filter((part) => part.functionCall));
    }
    addUniqueCalls(calls, functionCallsFromChunk(chunk));
  }

  if (signal.aborted) {
    emitMultiToolTrace(options, traceForFatalCalls(calls, "cancelled", "cancelled", options.correlationId));
    throw new ToolDispatchError("cancelled");
  }

  if (calls.length === 0) {
    emitMultiToolTrace(options, {
      event: "chat_multi_tool_trace",
      schemaVersion: 1,
      correlationId: options.correlationId,
      selectedCount: 0,
      uniqueExecutionCount: 0,
      duplicateCount: 0,
      calls: [],
      finalStopState: "direct_no_tools",
    });
    for (const chunk of selectionChunks) yield { ...chunk, functionCalls: undefined, toolCallCount: 0 };
    return;
  }

  // Selection data is internal control traffic on the tool path. Preserve only
  // its provider usage snapshots for privacy-safe completion accounting.
  for (const chunk of selectionChunks) {
    if (chunk.usageMetadata) yield { usageMetadata: chunk.usageMetadata, usageTurn: "selection" };
  }

  // Validate the whole selected batch before any handler can observe it. The
  // raw requested count is checked before canonical deduplication so aliases
  // cannot bypass the application cap.
  if (calls.length > CHAT_MAX_TOOL_CALLS) {
    emitMultiToolTrace(options, traceForFatalCalls(calls, "call_limit", "fatal_failure", options.correlationId));
    throw new ToolDispatchError("call_limit");
  }

  const groups = new Map<string, { call: FunctionCall; calls: FunctionCall[]; name: ChatToolName }>();
  for (const call of calls) {
    const name = toolName(call);
    if (name === "unknown") {
      emitMultiToolTrace(options, traceForFatalCalls(calls, "unknown_tool", "fatal_failure", options.correlationId));
      throw new ToolDispatchError("unknown_tool");
    }
    if (!canonicalToolCallIdentity(call)) {
      emitMultiToolTrace(options, traceForFatalCalls(calls, "invalid_arguments", "fatal_failure", options.correlationId));
      throw new ToolDispatchError("invalid_arguments");
    }
    const key = canonicalToolCallIdentity(call) as string;
    const existing = groups.get(key);
    if (existing) existing.calls.push(call);
    else groups.set(key, { call, calls: [call], name });
  }

  let completedToolCalls = 0;
  const outcomes = new Map<string, ExecutionOutcome>();
  for (const [key, group] of groups) {
    if (signal.aborted) {
      emitMultiToolTrace(options, traceForFatalCalls(calls, "cancelled", "cancelled", options.correlationId));
      throw new ToolDispatchError("cancelled");
    }
    try {
      const execution = await dispatchToolCall(registry, group.call, {
        correlationId: options.correlationId,
        logger: options.logger,
        signal,
        completedToolCalls,
      });
      outcomes.set(key, { accepted: execution });
      completedToolCalls += 1;
      // Publish the accepted count before any later call or final-provider failure.
      yield {
        toolCallCount: completedToolCalls,
        ...(execution.retrieval ? { retrieval: execution.retrieval } : {}),
      };
    } catch (error) {
      const category = error instanceof ToolDispatchError ? error.category : "handler_failure";
      if (signal.aborted || category === "cancelled") {
        emitMultiToolTrace(options, traceForFatalCalls(calls, "cancelled", "cancelled", options.correlationId));
        throw new ToolDispatchError("cancelled");
      }
      if (!isDegradableToolFailureCategory(category)) {
        emitMultiToolTrace(options, traceForFatalCalls(calls, category, "fatal_failure", options.correlationId));
        throw error;
      }
      outcomes.set(key, { failure: {
        error: {
          type: "tool_error",
          category,
          retryable: category === "timeout" || category === "handler_failure",
        },
      } });
    }
  }

  const successfulExecutions = [...outcomes.values()].filter((outcome): outcome is { accepted: AcceptedExecution } => Boolean(outcome.accepted));
  if (successfulExecutions.length === 0) {
    emitMultiToolTrace(options, {
      event: "chat_multi_tool_trace",
      schemaVersion: 1,
      correlationId: options.correlationId,
      selectedCount: calls.length,
      uniqueExecutionCount: groups.size,
      duplicateCount: calls.length - groups.size,
      calls: calls.map((call) => {
        const group = groups.get(canonicalToolCallIdentity(call) as string) as { calls: FunctionCall[]; name: ChatToolName };
        const outcome = outcomes.get(canonicalToolCallIdentity(call) as string) as { failure: SafeToolFailureResponse };
        const duplicate = group.calls[0] !== call;
        return {
          tool: group.name,
          disposition: duplicate ? "duplicate" : "safe_failure",
          category: duplicate ? "duplicate" : outcome.failure.error.category,
          acceptedResultKind: null,
          acceptedResultCount: null,
          citationCount: null,
        };
      }),
      finalStopState: "all_tools_failed",
    });
    throw new ToolDispatchError("all_tools_failed");
  }

  const finalResponses: FinalToolResponse[] = calls.map((call) => {
    const outcome = outcomes.get(canonicalToolCallIdentity(call) as string) as ExecutionOutcome;
    if (outcome.accepted) return { call, response: { output: outcome.accepted.result } };
    return { call, response: outcome.failure as unknown as Record<string, unknown> };
  });

  const toolTraceCalls: MultiToolTraceCall[] = calls.map((call) => {
    const key = canonicalToolCallIdentity(call) as string;
    const group = groups.get(key) as { call: FunctionCall; calls: FunctionCall[]; name: ChatToolName };
    const outcome = outcomes.get(key) as ExecutionOutcome;
    const duplicate = group.calls[0] !== call;
    if (outcome.accepted) {
      const summary = summarizeAcceptedToolResult(outcome.accepted.result);
      return {
        tool: group.name,
        disposition: duplicate ? "duplicate" : "success",
        category: duplicate ? "duplicate" : null,
        acceptedResultKind: summary.kind,
        acceptedResultCount: summary.resultCount,
        citationCount: summary.citationCount,
      };
    }
    return {
      tool: group.name,
      disposition: duplicate ? "duplicate" : "safe_failure",
      category: duplicate ? "duplicate" : outcome.failure.error.category,
      acceptedResultKind: null,
      acceptedResultCount: null,
      citationCount: null,
    };
  });
  const finalToolTrace = (finalStopState: MultiToolFinalStopState): MultiToolTrace => ({
    event: "chat_multi_tool_trace",
    schemaVersion: 1,
    correlationId: options.correlationId,
    selectedCount: calls.length,
    uniqueExecutionCount: groups.size,
    duplicateCount: calls.length - groups.size,
    calls: toolTraceCalls,
    finalStopState,
  });

  const requestWithCalls = finalRequest(
    { ...selectionRequest, contents: selectionRequest.contents },
    calls,
    finalResponses,
  );
  // Preserve the exact function-call parts returned by the model where the SDK supplied them.
  requestWithCalls.contents[requestWithCalls.contents.length - 2] = modelFunctionContent(
    calls,
    selectionModelParts.length ? { role: "model", parts: selectionModelParts } : undefined,
  ) as unknown as GenerationRequest["contents"][number];

  try {
    const finalStream = await dependencies.generateContentStream(requestWithCalls, signal);
    for await (const chunk of finalStream) {
      // Tools are disabled for this request. Inspect before yielding so a
      // provider follow-on call can never become an accepted response chunk.
      if (functionCallsFromChunk(chunk).length) throw new ToolDispatchError("unexpected_follow_on");
      yield { ...chunk, functionCalls: undefined, usageTurn: "final", toolCallCount: completedToolCalls };
    }
  } catch (error) {
    emitMultiToolTrace(options, finalToolTrace(signal.aborted ? "cancelled" : "fatal_failure"));
    throw error;
  }
  emitMultiToolTrace(options, finalToolTrace(toolTraceCalls.some((call) => call.disposition === "safe_failure")
    ? "partial_evidence"
    : "answered_with_evidence"));
}
