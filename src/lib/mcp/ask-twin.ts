import type { Locale } from "@/types";
import type { ChatDependencies } from "@/lib/chat/core";
import {
  streamBoundedEvidenceAgent,
  type AgentStopReason,
  type AgentTraceSummary,
} from "@/lib/chat/agent-loop";
import { ChatDeadlineError, createLinkedAbortController, streamWithChatDeadline } from "@/lib/chat/deadline";
import {
  CHAT_MAX_OUTPUT_BYTES,
  agentSafeAnswer,
  appendUtf8Output,
  utf8ByteLength,
} from "@/lib/chat/limits";
import { ToolDispatchError, type ToolCitation, type ToolExecutionLogger, type ToolRegistry } from "@/lib/chat/tools";
import {
  MCP_ASK_DEADLINE_MS,
  MCP_DISCLAIMER_BY_LOCALE,
  MCP_MAX_CITATIONS,
  MCP_MAX_QUESTION_BYTES,
  MCP_MAX_QUESTION_CHARS,
} from "./limits";

export type AskDigitalTwinStatus = "supported" | "qualified" | "direct" | "insufficient";

export interface AskDigitalTwinInput {
  question: string;
  locale?: Locale;
}

export interface AskDigitalTwinStructuredOutput {
  [key: string]: unknown;
  answer: string;
  locale: Locale;
  status: AskDigitalTwinStatus;
  citations: ToolCitation[];
  disclaimer: string;
}

export interface AskDigitalTwinExecutionResult {
  ok: true;
  output: AskDigitalTwinStructuredOutput;
  stopReason: AgentStopReason | null;
  outputBytes: number;
}

export interface AskDigitalTwinExecutionError {
  ok: false;
  category: "invalid_arguments" | "model_timeout" | "cancelled" | "provider_error";
  safeMessage: string;
  stopReason: AgentStopReason | null;
}

export type AskDigitalTwinResult = AskDigitalTwinExecutionResult | AskDigitalTwinExecutionError;

const ALLOWED_CITATION_URL = /^(?:https:\/\/johnserra\.com(?:\/[^?#\s)]*)?|https:\/\/linkedin\.com\/in\/johnserra|mailto:john@serra\.us)$/u;

export function extractPublicCitations(markdown: string): ToolCitation[] {
  const citations: ToolCitation[] = [];
  const seen = new Set<string>();
  const linkPattern = /\[([^\]\r\n]{1,500})\]\(([^)\s]{1,2000})\)/gu;

  for (const match of markdown.matchAll(linkPattern)) {
    const title = match[1]?.trim() ?? "";
    const url = match[2]?.trim() ?? "";
    if (!title || !ALLOWED_CITATION_URL.test(url)) continue;
    const key = `${title}\u0000${url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    citations.push({ title, url });
    if (citations.length >= MCP_MAX_CITATIONS) break;
  }

  return citations;
}

export function mapStopReasonToStatus(stopReason: AgentStopReason | null): AskDigitalTwinStatus {
  if (stopReason === "supported_evidence") return "supported";
  if (stopReason === "qualified_completion") return "qualified";
  if (stopReason === "static_completion" || stopReason === "direct_no_tools") return "direct";
  return "insufficient";
}

export interface AskDigitalTwinDependencies {
  chatDependencies: ChatDependencies;
  toolRegistry: ToolRegistry;
  correlationId: string;
  signal?: AbortSignal;
  deadlineMs?: number;
  logger?: ToolExecutionLogger;
  onAgentTrace?: (trace: AgentTraceSummary) => void;
}

export async function askDigitalTwin(
  input: AskDigitalTwinInput,
  deps: AskDigitalTwinDependencies,
): Promise<AskDigitalTwinResult> {
  const locale: Locale = input.locale === "tr" ? "tr" : "en";
  const question = typeof input.question === "string" ? input.question.trim() : "";

  if (!question || question.length > MCP_MAX_QUESTION_CHARS || utf8ByteLength(question) > MCP_MAX_QUESTION_BYTES) {
    return {
      ok: false,
      category: "invalid_arguments",
      safeMessage: "Question must be a non-empty string within the allowed length limit.",
      stopReason: null,
    };
  }

  const linked = createLinkedAbortController(deps.signal);
  const traceRef: { current: AgentTraceSummary | null } = { current: null };
  let answer = "";
  let outputBytes = 0;

  try {
    for await (const chunk of streamWithChatDeadline(
      async (signal) => streamBoundedEvidenceAgent(
        [{ role: "user", content: question }],
        locale,
        deps.chatDependencies,
        deps.toolRegistry,
        signal,
        {
          correlationId: deps.correlationId,
          logger: deps.logger,
          onAgentTrace: (trace) => {
            traceRef.current = trace;
            deps.onAgentTrace?.(trace);
          },
        },
      ),
      {
        stage: "model",
        deadlineMs: deps.deadlineMs ?? MCP_ASK_DEADLINE_MS,
        signal: linked.signal,
      },
    )) {
      if (linked.signal.aborted) break;
      const text = chunk.text ?? "";
      if (!text) continue;
      const bounded = appendUtf8Output(outputBytes, text, CHAT_MAX_OUTPUT_BYTES);
      if (bounded.accepted) {
        answer += bounded.accepted;
        outputBytes = bounded.bytes;
      }
      if (bounded.overLimit) break;
    }

    if (linked.signal.aborted) {
      return {
        ok: false,
        category: "cancelled",
        safeMessage: "The request was cancelled.",
        stopReason: traceRef.current?.stopReason ?? "cancellation",
      };
    }

    const finalText = answer.trim() || agentSafeAnswer(locale);
    const finalBytes = utf8ByteLength(finalText);
    const stopReason: AgentStopReason | null = traceRef.current?.stopReason ?? null;
    const citations = extractPublicCitations(finalText);

    return {
      ok: true,
      output: {
        answer: finalText,
        locale,
        status: mapStopReasonToStatus(stopReason),
        citations,
        disclaimer: MCP_DISCLAIMER_BY_LOCALE[locale],
      },
      stopReason,
      outputBytes: finalBytes,
    };
  } catch (error) {
    if (error instanceof ChatDeadlineError) {
      return {
        ok: false,
        category: "model_timeout",
        safeMessage: "The Digital Twin took too long to answer. Please try a shorter question.",
        stopReason: "deadline_exceeded",
      };
    }
    if (
      deps.signal?.aborted
      || (error instanceof DOMException && error.name === "AbortError")
      || (error instanceof ToolDispatchError && error.category === "cancelled")
    ) {
      return {
        ok: false,
        category: "cancelled",
        safeMessage: "The request was cancelled.",
        stopReason: "cancellation",
      };
    }
    return {
      ok: false,
      category: "provider_error",
      safeMessage: "The Digital Twin is temporarily unavailable. Please try again shortly.",
      stopReason: traceRef.current?.stopReason ?? "provider_failure",
    };
  } finally {
    linked.dispose();
  }
}
