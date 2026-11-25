import { randomUUID } from "node:crypto";
import type { AgentStopReason } from "@/lib/chat/agent-loop";
import type { Locale } from "@/types";
import { MCP_CORRELATION_HEADER, MCP_ROUTE, MCP_TOOL_NAMES, type McpToolName } from "./limits";

export const MCP_OBSERVABILITY_EVENT = "mcp_request_completed";
export const MCP_OBSERVABILITY_SCHEMA_VERSION = 1;

const ALLOWED_RPC_METHODS = new Set([
  "initialize",
  "notifications/initialized",
  "ping",
  "tools/list",
  "tools/call",
]);

export type McpRpcMethod =
  | "initialize"
  | "notifications/initialized"
  | "ping"
  | "tools/list"
  | "tools/call"
  | "unknown"
  | null;

export type McpOutcome = "success" | "failure" | "cancelled";

export type McpFailureCategory =
  | "method_not_allowed"
  | "unsupported_media_type"
  | "body_too_large"
  | "invalid_json"
  | "rate_limited"
  | "service_unavailable"
  | "cancelled"
  | "model_timeout"
  | "provider_error"
  | "tool_error"
  | "transport_error"
  | null;

export interface McpCompletionEvent {
  event: typeof MCP_OBSERVABILITY_EVENT;
  schemaVersion: typeof MCP_OBSERVABILITY_SCHEMA_VERSION;
  timestamp: string;
  correlationId: string;
  route: typeof MCP_ROUTE;
  httpMethod: string;
  rpcMethod: McpRpcMethod;
  toolName: McpToolName | null;
  locale: Locale | null;
  httpStatus: number;
  outcome: McpOutcome;
  failureCategory: McpFailureCategory;
  stopReason: AgentStopReason | null;
  durationMs: number;
  outputBytes: number;
  citationCount: number;
}

export interface McpLogger {
  info(message: string): void;
}

export function normalizeMcpRpcMethod(value: unknown): McpRpcMethod {
  if (typeof value !== "string") return null;
  return ALLOWED_RPC_METHODS.has(value) ? (value as McpRpcMethod) : "unknown";
}

export function normalizeMcpToolName(value: unknown): McpToolName | null {
  if (typeof value !== "string") return null;
  return MCP_TOOL_NAMES.includes(value as McpToolName) ? (value as McpToolName) : null;
}

export function addMcpCorrelationHeader(response: Response, correlationId: string): Response {
  const headers = new Headers(response.headers);
  headers.set(MCP_CORRELATION_HEADER, correlationId);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export interface McpRequestTrace {
  readonly correlationId: string;
  setRpcMethod(method: unknown): void;
  setToolName(name: unknown): void;
  setLocale(locale: Locale | null): void;
  recordToolOutcome(input: { stopReason: AgentStopReason | null; outputBytes: number; citationCount: number }): void;
  complete(input: { httpStatus: number; outcome: McpOutcome; failureCategory: McpFailureCategory }): McpCompletionEvent;
}

export function createMcpRequestTrace(
  httpMethod: string,
  options?: { logger?: McpLogger; now?: () => number; correlationId?: string },
): McpRequestTrace {
  const correlationId = options?.correlationId ?? randomUUID();
  const now = options?.now ?? (() => Date.now());
  const startedAt = now();
  const logger = options?.logger ?? console;

  let rpcMethod: McpRpcMethod = null;
  let toolName: McpToolName | null = null;
  let locale: Locale | null = null;
  let stopReason: AgentStopReason | null = null;
  let outputBytes = 0;
  let citationCount = 0;
  let completed = false;

  return {
    correlationId,
    setRpcMethod(method) {
      rpcMethod = normalizeMcpRpcMethod(method);
    },
    setToolName(name) {
      toolName = normalizeMcpToolName(name);
    },
    setLocale(nextLocale) {
      locale = nextLocale;
    },
    recordToolOutcome(input) {
      stopReason = input.stopReason;
      outputBytes = Math.max(0, input.outputBytes);
      citationCount = Math.max(0, input.citationCount);
    },
    complete(input) {
      const event: McpCompletionEvent = {
        event: MCP_OBSERVABILITY_EVENT,
        schemaVersion: MCP_OBSERVABILITY_SCHEMA_VERSION,
        timestamp: new Date(now()).toISOString(),
        correlationId,
        route: MCP_ROUTE,
        httpMethod,
        rpcMethod,
        toolName,
        locale,
        httpStatus: input.httpStatus,
        outcome: input.outcome,
        failureCategory: input.failureCategory,
        stopReason,
        durationMs: Math.max(0, Math.round(now() - startedAt)),
        outputBytes,
        citationCount,
      };
      if (!completed) {
        completed = true;
        try {
          logger.info(JSON.stringify(event));
        } catch {
          // Telemetry must never affect the MCP response path.
        }
      }
      return event;
    },
  };
}
