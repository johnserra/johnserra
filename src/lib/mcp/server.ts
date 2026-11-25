import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ChatDependencies } from "@/lib/chat/core";
import type { AgentStopReason, AgentTraceSummary } from "@/lib/chat/agent-loop";
import type { ToolExecutionLogger, ToolRegistry } from "@/lib/chat/tools";
import type { Locale } from "@/types";
import { askDigitalTwin } from "./ask-twin";
import {
  MCP_MAX_CITATIONS,
  MCP_MAX_QUESTION_CHARS,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
} from "./limits";

export const ASK_DIGITAL_TWIN_INPUT_SCHEMA = z.strictObject({
  question: z
    .string()
    .trim()
    .min(1, "Question must not be empty.")
    .max(MCP_MAX_QUESTION_CHARS, `Question must be at most ${MCP_MAX_QUESTION_CHARS} characters.`)
    .describe("Question about John Serra's documented public career, projects, articles, or public contact options."),
  locale: z
    .enum(["en", "tr"])
    .optional()
    .default("en")
    .describe("Response language ('en' for English, 'tr' for Turkish). Defaults to 'en'."),
});

export const ASK_DIGITAL_TWIN_OUTPUT_SCHEMA = z.strictObject({
  answer: z
    .string()
    .describe("Verified or explicitly qualified third-person Markdown answer citing canonical public URLs."),
  locale: z.enum(["en", "tr"]),
  status: z
    .enum(["supported", "qualified", "direct", "insufficient"])
    .describe("Bounded verification outcome mapped from the evidence agent stop reason."),
  citations: z
    .array(
      z.strictObject({
        title: z.string().min(1).max(500),
        url: z.string().regex(
          /^(?:https:\/\/johnserra\.com(?:\/|$)|https:\/\/linkedin\.com\/in\/johnserra$|mailto:john@serra\.us$)/u,
        ),
      }),
    )
    .max(MCP_MAX_CITATIONS),
  disclaimer: z
    .string()
    .describe("Short attribution noting this response comes from John Serra's public AI assistant using public sources only."),
});

export interface DigitalTwinMcpServerDependencies {
  chatDependencies: ChatDependencies;
  toolRegistry: ToolRegistry;
  correlationId: string;
  signal?: AbortSignal;
  deadlineMs?: number;
  logger?: ToolExecutionLogger;
  onAgentTrace?: (trace: AgentTraceSummary) => void;
  onToolExecution?: (summary: {
    locale: Locale;
    stopReason: AgentStopReason | null;
    outputBytes: number;
    citationCount: number;
    isError: boolean;
    errorCategory?: "invalid_arguments" | "model_timeout" | "cancelled" | "provider_error";
  }) => void;
}

export function createDigitalTwinMcpServer(deps: DigitalTwinMcpServerDependencies): McpServer {
  const server = new McpServer({
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
  });

  server.registerTool(
    "ask_digital_twin",
    {
      title: "Ask John Serra's Digital Twin",
      description:
        "Ask John Serra's public AI assistant a question about John's documented career history, projects, analytics writing, or public contact options. Returns a third-person, evidence-verified, source-cited answer in English or Turkish from public sources only.",
      inputSchema: ASK_DIGITAL_TWIN_INPUT_SCHEMA,
      outputSchema: ASK_DIGITAL_TWIN_OUTPUT_SCHEMA,
      annotations: {
        title: "Ask John Serra's Digital Twin",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ question, locale }, extra) => {
      const resolvedLocale: Locale = locale === "tr" ? "tr" : "en";
      const result = await askDigitalTwin(
        { question, locale: resolvedLocale },
        {
          chatDependencies: deps.chatDependencies,
          toolRegistry: deps.toolRegistry,
          correlationId: deps.correlationId,
          signal: extra.signal ?? deps.signal,
          deadlineMs: deps.deadlineMs,
          logger: deps.logger,
          onAgentTrace: deps.onAgentTrace,
        },
      );

      if (!result.ok) {
        deps.onToolExecution?.({
          locale: resolvedLocale,
          stopReason: result.stopReason,
          outputBytes: 0,
          citationCount: 0,
          isError: true,
          errorCategory: result.category,
        });
        return {
          isError: true,
          content: [{ type: "text" as const, text: result.safeMessage }],
        };
      }

      deps.onToolExecution?.({
        locale: result.output.locale,
        stopReason: result.stopReason,
        outputBytes: result.outputBytes,
        citationCount: result.output.citations.length,
        isError: false,
      });

      return {
        content: [{ type: "text" as const, text: result.output.answer }],
        structuredContent: result.output,
      };
    },
  );

  return server;
}
