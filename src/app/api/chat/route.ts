import { CHAT_MODEL } from "@/lib/chat/core";
import { streamModelSelectedChat } from "@/lib/chat/tool-calling";
import { serverChatDependencies, serverChatToolRegistry, consumeChatRateLimit } from "@/lib/chat/server";
import {
  CHAT_MAX_OUTPUT_BYTES,
  CHAT_MAX_BODY_BYTES,
  CHAT_MODEL_DEADLINE_MS,
  appendUtf8Output,
} from "@/lib/chat/limits";
import { ChatDeadlineError, createLinkedAbortController, streamWithChatDeadline } from "@/lib/chat/deadline";
import { createChatErrorResponse } from "@/lib/chat/http";
import { encodeChatFrame, terminalChatFrame } from "@/lib/chat/protocol";
import { CHAT_SESSION_HEADER, extractTrustedVercelIp, isValidChatSession, ChatRateLimitServiceError } from "@/lib/chat/rate-limit";
import { parseChatJson, validateChatRequest, validateContentType, type ChatErrorCode } from "@/lib/chat/validation";
import { ToolDispatchError } from "@/lib/chat/tools";
import {
  addCorrelationHeader,
  createChatRequestTrace,
  failureCategoryForCode,
  type ChatRequestTrace,
} from "@/lib/chat/observability";

export const runtime = "nodejs";
export const maxDuration = 60;

function safeError(error: unknown, fallbackCode: ChatErrorCode): { code: ChatErrorCode; message: string; status: number } {
  if (error instanceof ChatDeadlineError) {
    return error.stage === "preparation"
      ? { code: "PREPARATION_TIMEOUT", message: "Preparing the answer took too long. Please try again.", status: 504 }
      : { code: "MODEL_TIMEOUT", message: "Generating the answer took too long. Please try again.", status: 504 };
  }
  if (error instanceof ChatRateLimitServiceError) {
    return { code: "SERVICE_UNAVAILABLE", message: "Chat is temporarily unavailable. Please try again shortly.", status: 503 };
  }
  if (error instanceof ToolDispatchError) {
    return { code: "TOOL_ERROR", message: error.safeMessage, status: 503 };
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return { code: "CLIENT_ABORTED", message: "The request was cancelled.", status: 499 };
  }
  return { code: fallbackCode, message: fallbackCode === "RETRIEVAL_ERROR"
    ? "Knowledge retrieval is temporarily unavailable. Please try again shortly."
    : "The assistant is temporarily unavailable. Please try again shortly.", status: 503 };
}

function completeJsonError(
  trace: ChatRequestTrace,
  status: number,
  code: ChatErrorCode,
  message: string,
  retryAfter?: number,
): Response {
  const response = createChatErrorResponse(status, code, message, retryAfter);
  trace.complete({
    httpStatus: status,
    outcome: code === "CLIENT_ABORTED" ? "cancelled" : "failure",
    failureCategory: failureCategoryForCode(code),
  });
  return addCorrelationHeader(response, trace.correlationId);
}

export async function POST(req: Request) {
  const trace = createChatRequestTrace();
  trace.beginStage("validation");

  try {
    if (!validateContentType(req.headers.get("content-type"))) {
      return completeJsonError(trace, 415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json.");
    }

    const sessionId = req.headers.get(CHAT_SESSION_HEADER);
    if (!isValidChatSession(sessionId)) {
      return completeJsonError(trace, 400, "INVALID_SESSION", "A valid chat session is required.");
    }
    const ip = extractTrustedVercelIp(req.headers);
    if (!ip) {
      return completeJsonError(trace, 503, "SERVICE_UNAVAILABLE", "Chat is temporarily unavailable. Please try again shortly.");
    }

    const contentLength = req.headers.get("content-length");
    if (contentLength && Number.isSafeInteger(Number(contentLength)) && Number(contentLength) > CHAT_MAX_BODY_BYTES) {
      return completeJsonError(trace, 413, "BODY_TOO_LARGE", "The request body is too large.");
    }

    let bodyBytes: Uint8Array;
    try {
      bodyBytes = new Uint8Array(await req.arrayBuffer());
    } catch {
      return completeJsonError(trace, 400, "INVALID_JSON", "The request body must contain valid JSON.");
    }
    if (bodyBytes.byteLength > CHAT_MAX_BODY_BYTES) {
      return completeJsonError(trace, 413, "BODY_TOO_LARGE", "The request body is too large.");
    }
    let rawBody: string;
    try {
      rawBody = new TextDecoder("utf-8", { fatal: true }).decode(bodyBytes);
    } catch {
      return completeJsonError(trace, 400, "INVALID_JSON", "The request body must contain valid JSON.");
    }
    const parsed = parseChatJson(rawBody);
    if (!parsed.ok) {
      return completeJsonError(trace, parsed.code === "BODY_TOO_LARGE" ? 413 : 400, parsed.code, parsed.message);
    }
    const validated = validateChatRequest(parsed.value, bodyBytes.byteLength);
    if (!validated.ok) return completeJsonError(trace, validated.status, validated.code, validated.message);
    trace.setLocale(validated.value.locale);
    trace.endStage("validation");

    let rateLimit: Awaited<ReturnType<typeof consumeChatRateLimit>>;
    trace.beginStage("rateLimiting");
    try {
      rateLimit = await consumeChatRateLimit(sessionId, ip, req.signal);
    } catch (error) {
      trace.endStage("rateLimiting");
      if (req.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
        return completeJsonError(trace, 499, "CLIENT_ABORTED", "The request was cancelled.");
      }
      if (error instanceof ChatRateLimitServiceError) {
        return completeJsonError(trace, 503, "SERVICE_UNAVAILABLE", "Chat is temporarily unavailable. Please try again shortly.");
      }
      return completeJsonError(trace, 503, "SERVICE_UNAVAILABLE", "Chat is temporarily unavailable. Please try again shortly.");
    }
    trace.endStage("rateLimiting");
    if (!rateLimit.allowed) {
      return completeJsonError(trace, 429, "RATE_LIMITED", "Chat is busy. Please wait a moment and try again.", rateLimit.retryAfterSeconds);
    }

    if (req.signal.aborted) {
      return completeJsonError(trace, 499, "CLIENT_ABORTED", "The request was cancelled.");
    }

    trace.setModel(CHAT_MODEL);

    const linkedModelController = createLinkedAbortController(req.signal);
    let streamCancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        trace.beginStage("generation");
        trace.recordOutput("", 0);
        let outputBytes = 0;
        let hasOutput = false;
        let sentTerminalFrame = false;
        const finalStatus = 200;
        let finalOutcome: "success" | "failure" | "cancelled" = "failure";
        let finalFailureCategory: ReturnType<typeof failureCategoryForCode> = "provider_error";
        const send = (frame: Parameters<typeof encodeChatFrame>[0]) => {
          if (!sentTerminalFrame && !streamCancelled) controller.enqueue(encodeChatFrame(frame));
        };
        try {
          for await (const chunk of streamWithChatDeadline(
            async (signal) => streamModelSelectedChat(
              validated.value.messages,
              validated.value.locale,
              serverChatDependencies,
              serverChatToolRegistry,
              signal,
              {
                correlationId: trace.correlationId,
                logger: console,
                onMultiToolTrace: trace.recordMultiToolTrace,
              },
            ),
            { stage: "model", deadlineMs: CHAT_MODEL_DEADLINE_MS, signal: linkedModelController.signal },
          )) {
            trace.observeGenerationChunk(chunk);
            if (linkedModelController.signal.aborted) break;
            const text = chunk.text ?? "";
            const bounded = appendUtf8Output(outputBytes, text, CHAT_MAX_OUTPUT_BYTES);
            if (bounded.overLimit) {
              if (bounded.accepted) {
                hasOutput = true;
                send({ type: "delta", text: bounded.accepted });
                trace.recordOutput(bounded.accepted, bounded.bytes);
                outputBytes = bounded.bytes;
              }
              send({ type: "error", code: "OUTPUT_TOO_LARGE", message: "The generated answer was too large. Please ask a shorter question." });
              sentTerminalFrame = true;
              finalFailureCategory = "output_limit";
              break;
            }
            if (bounded.accepted) {
              hasOutput = true;
              send({ type: "delta", text: bounded.accepted });
              trace.recordOutput(bounded.accepted, bounded.bytes);
              outputBytes = bounded.bytes;
            }
          }
          if (linkedModelController.signal.aborted || streamCancelled) {
            finalOutcome = "cancelled";
            finalFailureCategory = "cancelled";
          } else if (!sentTerminalFrame) {
            send(terminalChatFrame(hasOutput));
            sentTerminalFrame = true;
            if (hasOutput) {
              finalOutcome = "success";
              finalFailureCategory = null;
            } else {
              finalFailureCategory = "empty_output";
            }
          }
        } catch (error) {
          if (linkedModelController.signal.aborted || streamCancelled || req.signal.aborted) {
            finalOutcome = "cancelled";
            finalFailureCategory = "cancelled";
          } else {
            const safe = safeError(error, error instanceof ChatDeadlineError ? "MODEL_TIMEOUT" : "MODEL_ERROR");
            send({ type: "error", code: safe.code, message: safe.message });
            sentTerminalFrame = true;
            finalOutcome = safe.code === "CLIENT_ABORTED" ? "cancelled" : "failure";
            finalFailureCategory = failureCategoryForCode(safe.code);
          }
        } finally {
          trace.endStage("generation");
          linkedModelController.dispose();
          if (!streamCancelled) controller.close();
          trace.complete({
            httpStatus: finalStatus,
            outcome: finalOutcome,
            failureCategory: finalFailureCategory,
          });
        }
      },
      cancel(reason) {
        streamCancelled = true;
        linkedModelController.abort(reason);
      },
    });

    return addCorrelationHeader(new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Content-Type-Options": "nosniff",
      },
    }), trace.correlationId);
  } catch {
    return completeJsonError(
      trace,
      req.signal.aborted ? 499 : 503,
      req.signal.aborted ? "CLIENT_ABORTED" : "SERVICE_UNAVAILABLE",
      req.signal.aborted ? "The request was cancelled." : "Chat is temporarily unavailable. Please try again shortly.",
    );
  }
}
