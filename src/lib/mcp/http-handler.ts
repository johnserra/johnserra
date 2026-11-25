import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { ChatDependencies } from "@/lib/chat/core";
import { ChatRateLimitServiceError } from "@/lib/chat/rate-limit";
import type { ToolExecutionLogger, ToolRegistry } from "@/lib/chat/tools";
import { validateContentType } from "@/lib/chat/validation";
import { MCP_MAX_BODY_BYTES } from "./limits";
import {
  addMcpCorrelationHeader,
  createMcpRequestTrace,
  type McpFailureCategory,
  type McpLogger,
  type McpOutcome,
} from "./observability";
import {
  extractMcpClientIp,
  type McpRateLimitBucket,
  type McpRateLimitResult,
} from "./rate-limit";
import { createDigitalTwinMcpServer } from "./server";

export interface McpHttpHandlerDependencies {
  chatDependencies: ChatDependencies;
  toolRegistry: ToolRegistry;
  consumeRateLimit: (
    bucket: McpRateLimitBucket,
    ip: string,
    signal?: AbortSignal,
  ) => Promise<McpRateLimitResult>;
  env?: NodeJS.ProcessEnv;
  logger?: McpLogger & ToolExecutionLogger;
  deadlineMs?: number;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, MCP-Protocol-Version",
  "Access-Control-Expose-Headers": "X-Mcp-Correlation-Id",
};

function withCorsHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function jsonRpcErrorResponse(
  status: number,
  code: number,
  message: string,
  extraHeaders?: Record<string, string>,
): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    ...extraHeaders,
  };
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code, message },
      id: null,
    }),
    { status, headers },
  );
}

function inspectRpcPayload(body: unknown): {
  rpcMethod: unknown;
  toolName: unknown;
  bucket: McpRateLimitBucket;
} {
  const first = Array.isArray(body) ? body[0] : body;
  if (!first || typeof first !== "object" || Array.isArray(first)) {
    return { rpcMethod: null, toolName: null, bucket: "protocol" };
  }
  const record = first as Record<string, unknown>;
  const method = record.method;
  const params = record.params && typeof record.params === "object" && !Array.isArray(record.params)
    ? (record.params as Record<string, unknown>)
    : null;
  const toolName = method === "tools/call" ? params?.name : null;

  const isAsk = Array.isArray(body)
    ? body.some(
      (item) => item
        && typeof item === "object"
        && (item as Record<string, unknown>).method === "tools/call",
    )
    : method === "tools/call";

  return {
    rpcMethod: method,
    toolName,
    bucket: isAsk ? "ask" : "protocol",
  };
}

/**
 * Ensures clients that send `Accept: application/json` without `text/event-stream`
 * still interoperate cleanly with stateless JSON-mode Streamable HTTP transport.
 */
function normalizeStatelessAcceptRequest(req: Request): Request {
  const accept = req.headers.get("accept") ?? "";
  if (accept.includes("application/json") && accept.includes("text/event-stream")) {
    return req;
  }
  const headers = new Headers(req.headers);
  headers.set("accept", "application/json, text/event-stream");
  return new Request(req.url, {
    method: req.method,
    headers,
  });
}

export function createMcpHttpHandlers(deps: McpHttpHandlerDependencies) {
  const logger = deps.logger ?? console;

  function methodNotAllowed(method: string): Response {
    const trace = createMcpRequestTrace(method, { logger });
    const response = jsonRpcErrorResponse(
      405,
      -32000,
      "Method not allowed. Use POST /api/mcp for stateless Streamable HTTP JSON-RPC requests.",
      { Allow: "POST, OPTIONS" },
    );
    trace.complete({
      httpStatus: 405,
      outcome: "failure",
      failureCategory: "method_not_allowed",
    });
    return withCorsHeaders(addMcpCorrelationHeader(response, trace.correlationId));
  }

  async function OPTIONS(): Promise<Response> {
    return new Response(null, {
      status: 204,
      headers: {
        ...CORS_HEADERS,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  async function GET(): Promise<Response> {
    return methodNotAllowed("GET");
  }

  async function DELETE(): Promise<Response> {
    return methodNotAllowed("DELETE");
  }

  async function POST(req: Request): Promise<Response> {
    const trace = createMcpRequestTrace("POST", { logger });

    const finishError = (
      status: number,
      rpcCode: number,
      message: string,
      failureCategory: McpFailureCategory,
      extraHeaders?: Record<string, string>,
    ): Response => {
      const outcome: McpOutcome = failureCategory === "cancelled" ? "cancelled" : "failure";
      trace.complete({ httpStatus: status, outcome, failureCategory });
      return withCorsHeaders(
        addMcpCorrelationHeader(
          jsonRpcErrorResponse(status, rpcCode, message, extraHeaders),
          trace.correlationId,
        ),
      );
    };

    try {
      if (!validateContentType(req.headers.get("content-type"))) {
        return finishError(415, -32600, "Content-Type must be application/json.", "unsupported_media_type");
      }

      const contentLength = req.headers.get("content-length");
      if (contentLength && Number.isSafeInteger(Number(contentLength)) && Number(contentLength) > MCP_MAX_BODY_BYTES) {
        return finishError(413, -32600, "The MCP request body is too large.", "body_too_large");
      }

      let bodyBytes: Uint8Array;
      try {
        bodyBytes = new Uint8Array(await req.arrayBuffer());
      } catch {
        return finishError(400, -32700, "The request body must contain valid JSON.", "invalid_json");
      }
      if (bodyBytes.byteLength > MCP_MAX_BODY_BYTES) {
        return finishError(413, -32600, "The MCP request body is too large.", "body_too_large");
      }

      let rawBody: string;
      try {
        rawBody = new TextDecoder("utf-8", { fatal: true }).decode(bodyBytes);
      } catch {
        return finishError(400, -32700, "The request body must be valid UTF-8 JSON.", "invalid_json");
      }

      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(rawBody);
      } catch {
        return finishError(400, -32700, "Parse error: invalid JSON payload.", "invalid_json");
      }

      const inspected = inspectRpcPayload(parsedBody);
      trace.setRpcMethod(inspected.rpcMethod);
      trace.setToolName(inspected.toolName);

      const ip = extractMcpClientIp(req.headers, deps.env);
      if (!ip) {
        return finishError(
          503,
          -32000,
          "MCP server is temporarily unavailable. Please try again shortly.",
          "service_unavailable",
        );
      }

      let rateLimit: McpRateLimitResult;
      try {
        rateLimit = await deps.consumeRateLimit(inspected.bucket, ip, req.signal);
      } catch (error) {
        if (req.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
          return finishError(499, -32000, "The request was cancelled.", "cancelled");
        }
        if (error instanceof ChatRateLimitServiceError) {
          return finishError(
            503,
            -32000,
            "MCP server is temporarily unavailable. Please try again shortly.",
            "service_unavailable",
          );
        }
        return finishError(
          503,
          -32000,
          "MCP server is temporarily unavailable. Please try again shortly.",
          "service_unavailable",
        );
      }

      if (!rateLimit.allowed) {
        return finishError(
          429,
          -32001,
          "MCP rate limit exceeded. Please wait and try again.",
          "rate_limited",
          { "Retry-After": String(rateLimit.retryAfterSeconds) },
        );
      }

      if (req.signal.aborted) {
        return finishError(499, -32000, "The request was cancelled.", "cancelled");
      }

      let toolFailure: McpFailureCategory = null;
      const server = createDigitalTwinMcpServer({
        chatDependencies: deps.chatDependencies,
        toolRegistry: deps.toolRegistry,
        correlationId: trace.correlationId,
        signal: req.signal,
        deadlineMs: deps.deadlineMs,
        logger,
        onToolExecution: (summary) => {
          trace.setLocale(summary.locale);
          trace.recordToolOutcome({
            stopReason: summary.stopReason,
            outputBytes: summary.outputBytes,
            citationCount: summary.citationCount,
          });
          if (summary.isError) {
            if (summary.errorCategory === "model_timeout") toolFailure = "model_timeout";
            else if (summary.errorCategory === "cancelled") toolFailure = "cancelled";
            else if (summary.errorCategory === "provider_error") toolFailure = "provider_error";
            else toolFailure = "tool_error";
          }
        },
      });

      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });

      try {
        await server.connect(transport);
        const transportRequest = normalizeStatelessAcceptRequest(req);
        const response = await transport.handleRequest(transportRequest, { parsedBody });

        const outcome: McpOutcome = toolFailure === "cancelled"
          ? "cancelled"
          : (response.status >= 400 || toolFailure !== null)
            ? "failure"
            : "success";
        const failureCategory: McpFailureCategory = toolFailure
          ?? (response.status >= 400 ? "transport_error" : null);

        trace.complete({
          httpStatus: response.status,
          outcome,
          failureCategory,
        });

        return withCorsHeaders(addMcpCorrelationHeader(response, trace.correlationId));
      } finally {
        await Promise.allSettled([transport.close(), server.close()]);
      }
    } catch {
      return finishError(
        req.signal.aborted ? 499 : 503,
        -32000,
        req.signal.aborted
          ? "The request was cancelled."
          : "MCP server is temporarily unavailable. Please try again shortly.",
        req.signal.aborted ? "cancelled" : "service_unavailable",
      );
    }
  }

  return { GET, POST, DELETE, OPTIONS };
}
