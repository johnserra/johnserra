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
  dispatchToolCall,
  ToolDispatchError,
  type ToolExecutionLogger,
  type ToolRegistry,
} from "./tools";
import { CHAT_MAX_TOOL_CALLS } from "./limits";

export interface ToolCallingOptions {
  correlationId: string;
  logger?: ToolExecutionLogger;
}

function functionCallsFromChunk(chunk: ChatStreamChunk): FunctionCall[] {
  const direct = chunk.functionCalls ?? [];
  const fromParts = chunk.modelContent?.parts?.flatMap((part) => part.functionCall ? [part.functionCall] : []) ?? [];
  return [...direct, ...fromParts];
}

function callKey(call: FunctionCall): string {
  if (call.id) return `id:${call.id}`;
  return `call:${call.name ?? ""}:${JSON.stringify(call.args ?? null)}`;
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

function modelFunctionContent(calls: readonly FunctionCall[], modelContent: Content | undefined): Content {
  const parts: NonNullable<Content["parts"]> = [];
  const seen = new Set<string>();
  for (const part of modelContent?.parts ?? []) {
    if (!part.functionCall) continue;
    const key = callKey(part.functionCall);
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(part);
  }
  for (const functionCall of calls) {
    const key = callKey(functionCall);
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push({ functionCall });
  }
  return { role: "model", parts };
}

function finalRequest(
  request: GenerationRequest,
  calls: readonly FunctionCall[],
  results: readonly Awaited<ReturnType<typeof dispatchToolCall>>[],
): GenerationRequest {
  const modelContent = modelFunctionContent(calls, undefined) as unknown as GenerationContent;
  const functionResponseContent = {
    role: "user",
    parts: results.map((result) => ({
      functionResponse: {
        ...(result.id ? { id: result.id } : {}),
        name: result.name,
        response: { output: result.result },
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

  if (calls.length === 0) {
    for (const chunk of selectionChunks) yield { ...chunk, functionCalls: undefined, toolCallCount: 0 };
    return;
  }

  // Selection data is internal control traffic on the tool path. Preserve only
  // its provider usage snapshots for privacy-safe completion accounting.
  for (const chunk of selectionChunks) {
    if (chunk.usageMetadata) yield { usageMetadata: chunk.usageMetadata, usageTurn: "selection" };
  }

  // Validate the whole selected batch before any handler can observe it.
  if (calls.length > CHAT_MAX_TOOL_CALLS) throw new ToolDispatchError("call_limit");

  let completedToolCalls = 0;
  const executions = [] as Awaited<ReturnType<typeof dispatchToolCall>>[];
  for (const call of calls) {
    const execution = await dispatchToolCall(registry, call, {
      correlationId: options.correlationId,
      logger: options.logger,
      signal,
      completedToolCalls,
    });
    executions.push(execution);
    completedToolCalls += 1;
    // Publish the accepted count before any later call or final-provider failure.
    yield {
      toolCallCount: completedToolCalls,
      ...(execution.retrieval ? { retrieval: execution.retrieval } : {}),
    };
  }

  const requestWithCalls = finalRequest(
    { ...selectionRequest, contents: selectionRequest.contents },
    calls,
    executions,
  );
  // Preserve the exact function-call parts returned by the model where the SDK supplied them.
  requestWithCalls.contents[requestWithCalls.contents.length - 2] = modelFunctionContent(
    calls,
    selectionModelParts.length ? { role: "model", parts: selectionModelParts } : undefined,
  ) as unknown as GenerationRequest["contents"][number];

  const finalStream = await dependencies.generateContentStream(requestWithCalls, signal);
  for await (const chunk of finalStream) {
    // Tools are disabled for this request. Inspect before yielding so a
    // provider follow-on call can never become an accepted response chunk.
    if (functionCallsFromChunk(chunk).length) throw new ToolDispatchError("unexpected_follow_on");
    yield { ...chunk, functionCalls: undefined, usageTurn: "final", toolCallCount: completedToolCalls };
  }
}
