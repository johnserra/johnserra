import { ChatToolDeadlineError, withToolDeadline } from "./deadline";
import { createChatErrorResponse } from "./http";
import {
  PROJECT_DISCOVERY_MAX_BODY_BYTES,
  buildProjectDiscoveryQuery,
  sanitizeProjectDiscoverySources,
  validateProjectDiscoveryRequest,
  type ProjectDiscoveryRequest,
} from "./project-discovery";
import { CHAT_SESSION_HEADER, extractTrustedVercelIp, isValidChatSession } from "./rate-limit";
import { validateChatToolResult } from "./tools";
import { validateContentType } from "./validation";

export interface ProjectDiscoveryHandlerDependencies {
  consumeRateLimit(sessionId: string, ip: string, signal?: AbortSignal): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
  searchKnowledge(args: { query: string; locale: ProjectDiscoveryRequest["locale"] }, signal: AbortSignal): Promise<unknown>;
  rateLimitDeadlineMs?: number;
  deadlineMs?: number;
}

function errorResponse(status: number, code: Parameters<typeof createChatErrorResponse>[1], message: string, retryAfter?: number): Response {
  return createChatErrorResponse(status, code, message, retryAfter);
}

function aborted(request: Request): Response | null {
  return request.signal.aborted
    ? errorResponse(499, "CLIENT_ABORTED", "The request was cancelled.")
    : null;
}

export function createProjectDiscoveryHandler(dependencies: ProjectDiscoveryHandlerDependencies) {
  return async function handleProjectDiscovery(request: Request): Promise<Response> {
    try {
      if (!validateContentType(request.headers.get("content-type"))) {
        return errorResponse(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json.");
      }
      const sessionId = request.headers.get(CHAT_SESSION_HEADER);
      if (!isValidChatSession(sessionId)) {
        return errorResponse(400, "INVALID_SESSION", "A valid chat session is required.");
      }
      const ip = extractTrustedVercelIp(request.headers);
      if (!ip) {
        return errorResponse(503, "SERVICE_UNAVAILABLE", "Project lookup is temporarily unavailable. Please try again shortly.");
      }
      const contentLength = request.headers.get("content-length");
      if (contentLength && Number.isSafeInteger(Number(contentLength)) && Number(contentLength) > PROJECT_DISCOVERY_MAX_BODY_BYTES) {
        return errorResponse(413, "BODY_TOO_LARGE", "The request body is too large.");
      }

      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await request.arrayBuffer());
      } catch {
        return errorResponse(400, "INVALID_JSON", "The request body must contain valid JSON.");
      }
      if (bytes.byteLength > PROJECT_DISCOVERY_MAX_BODY_BYTES) {
        return errorResponse(413, "BODY_TOO_LARGE", "The request body is too large.");
      }
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        return errorResponse(400, "INVALID_JSON", "The request body must contain valid JSON.");
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        return errorResponse(400, "INVALID_JSON", "The request body must contain valid JSON.");
      }
      const validation = validateProjectDiscoveryRequest(parsed, bytes.byteLength);
      if (!validation.ok) {
        return errorResponse(validation.status, validation.code, validation.message);
      }

      const cancelledBeforeRateLimit = aborted(request);
      if (cancelledBeforeRateLimit) return cancelledBeforeRateLimit;
      let rateLimit: Awaited<ReturnType<ProjectDiscoveryHandlerDependencies["consumeRateLimit"]>>;
      try {
        rateLimit = await withToolDeadline(
          (signal) => dependencies.consumeRateLimit(sessionId, ip, signal),
          { deadlineMs: dependencies.rateLimitDeadlineMs ?? 3_000, signal: request.signal },
        );
      } catch (error) {
        if (request.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
          return errorResponse(499, "CLIENT_ABORTED", "The request was cancelled.");
        }
        if (error instanceof ChatToolDeadlineError) {
          return errorResponse(504, "PREPARATION_TIMEOUT", "Project lookup took too long to prepare. Please try again.");
        }
        return errorResponse(503, "SERVICE_UNAVAILABLE", "Project lookup is temporarily unavailable. Please try again shortly.");
      }
      if (!rateLimit.allowed) {
        return errorResponse(429, "RATE_LIMITED", "Project lookup is busy. Please wait a moment and try again.", rateLimit.retryAfterSeconds);
      }

      const cancelledBeforeRetrieval = aborted(request);
      if (cancelledBeforeRetrieval) return cancelledBeforeRetrieval;
      try {
        const rawResult = await withToolDeadline(
          (signal) => dependencies.searchKnowledge({
            query: buildProjectDiscoveryQuery(validation.value),
            locale: validation.value.locale,
          }, signal),
          { deadlineMs: dependencies.deadlineMs ?? 10_000, signal: request.signal },
        );
        const validatedResult = validateChatToolResult("search_knowledge", rawResult);
        if (!validatedResult) {
          return errorResponse(503, "RETRIEVAL_ERROR", "Published work is temporarily unavailable. Please try again shortly.");
        }
        return Response.json(
          { related: sanitizeProjectDiscoverySources(validatedResult) },
          { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } },
        );
      } catch (error) {
        if (request.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
          return errorResponse(499, "CLIENT_ABORTED", "The request was cancelled.");
        }
        if (error instanceof ChatToolDeadlineError) {
          return errorResponse(504, "PREPARATION_TIMEOUT", "Published work took too long to load. Please try again.");
        }
        return errorResponse(503, "RETRIEVAL_ERROR", "Published work is temporarily unavailable. Please try again shortly.");
      }
    } catch {
      return request.signal.aborted
        ? errorResponse(499, "CLIENT_ABORTED", "The request was cancelled.")
        : errorResponse(503, "SERVICE_UNAVAILABLE", "Project lookup is temporarily unavailable. Please try again shortly.");
    }
  };
}
