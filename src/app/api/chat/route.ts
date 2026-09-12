import { generatePreparedChat, prepareChat } from "@/lib/chat/core";
import { serverChatDependencies, consumeChatRateLimit } from "@/lib/chat/server";
import {
  CHAT_MAX_OUTPUT_BYTES,
  CHAT_MAX_BODY_BYTES,
  CHAT_MODEL_DEADLINE_MS,
  CHAT_PREPARATION_DEADLINE_MS,
  appendUtf8Output,
} from "@/lib/chat/limits";
import { ChatDeadlineError, createLinkedAbortController, streamWithChatDeadline, withChatDeadline } from "@/lib/chat/deadline";
import { createChatErrorResponse } from "@/lib/chat/http";
import { encodeChatFrame, terminalChatFrame } from "@/lib/chat/protocol";
import { CHAT_SESSION_HEADER, extractTrustedVercelIp, isValidChatSession, ChatRateLimitServiceError } from "@/lib/chat/rate-limit";
import { parseChatJson, validateChatRequest, validateContentType, type ChatErrorCode } from "@/lib/chat/validation";

export const runtime = "nodejs";
export const maxDuration = 60;

const errorResponse = createChatErrorResponse;

function safeError(error: unknown, fallbackCode: ChatErrorCode): { code: ChatErrorCode; message: string; status: number } {
  if (error instanceof ChatDeadlineError) {
    return error.stage === "preparation"
      ? { code: "PREPARATION_TIMEOUT", message: "Preparing the answer took too long. Please try again.", status: 504 }
      : { code: "MODEL_TIMEOUT", message: "Generating the answer took too long. Please try again.", status: 504 };
  }
  if (error instanceof ChatRateLimitServiceError) {
    return { code: "SERVICE_UNAVAILABLE", message: "Chat is temporarily unavailable. Please try again shortly.", status: 503 };
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return { code: "CLIENT_ABORTED", message: "The request was cancelled.", status: 499 };
  }
  return { code: fallbackCode, message: fallbackCode === "RETRIEVAL_ERROR"
    ? "Knowledge retrieval is temporarily unavailable. Please try again shortly."
    : "The assistant is temporarily unavailable. Please try again shortly.", status: 503 };
}

export async function POST(req: Request) {
  if (!validateContentType(req.headers.get("content-type"))) {
    return errorResponse(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json.");
  }

  const sessionId = req.headers.get(CHAT_SESSION_HEADER);
  if (!isValidChatSession(sessionId)) {
    return errorResponse(400, "INVALID_SESSION", "A valid chat session is required.");
  }
  const ip = extractTrustedVercelIp(req.headers);
  if (!ip) {
    return errorResponse(503, "SERVICE_UNAVAILABLE", "Chat is temporarily unavailable. Please try again shortly.");
  }

  const contentLength = req.headers.get("content-length");
  if (contentLength && Number.isSafeInteger(Number(contentLength)) && Number(contentLength) > CHAT_MAX_BODY_BYTES) {
    return errorResponse(413, "BODY_TOO_LARGE", "The request body is too large.");
  }

  let bodyBytes: Uint8Array;
  try {
    bodyBytes = new Uint8Array(await req.arrayBuffer());
  } catch {
    return errorResponse(400, "INVALID_JSON", "The request body must contain valid JSON.");
  }
  if (bodyBytes.byteLength > CHAT_MAX_BODY_BYTES) {
    return errorResponse(413, "BODY_TOO_LARGE", "The request body is too large.");
  }
  let rawBody: string;
  try {
    rawBody = new TextDecoder("utf-8", { fatal: true }).decode(bodyBytes);
  } catch {
    return errorResponse(400, "INVALID_JSON", "The request body must contain valid JSON.");
  }
  const parsed = parseChatJson(rawBody);
  if (!parsed.ok) return errorResponse(parsed.code === "BODY_TOO_LARGE" ? 413 : 400, parsed.code, parsed.message);
  const validated = validateChatRequest(parsed.value, bodyBytes.byteLength);
  if (!validated.ok) return errorResponse(validated.status, validated.code, validated.message);

  let rateLimit: Awaited<ReturnType<typeof consumeChatRateLimit>>;
  try {
    rateLimit = await consumeChatRateLimit(sessionId, ip, req.signal);
  } catch (error) {
    if (error instanceof ChatRateLimitServiceError) {
      return errorResponse(503, "SERVICE_UNAVAILABLE", "Chat is temporarily unavailable. Please try again shortly.");
    }
    return errorResponse(503, "SERVICE_UNAVAILABLE", "Chat is temporarily unavailable. Please try again shortly.");
  }
  if (!rateLimit.allowed) {
    return errorResponse(429, "RATE_LIMITED", "Chat is busy. Please wait a moment and try again.", rateLimit.retryAfterSeconds);
  }

  if (req.signal.aborted) {
    return errorResponse(499, "CLIENT_ABORTED", "The request was cancelled.");
  }

  let prepared: Awaited<ReturnType<typeof prepareChat>>;
  try {
    prepared = await withChatDeadline(
      (signal) => prepareChat(validated.value.messages, validated.value.locale, serverChatDependencies, undefined, signal),
      { stage: "preparation", deadlineMs: CHAT_PREPARATION_DEADLINE_MS, signal: req.signal },
    );
  } catch (error) {
    const safe = safeError(error, "RETRIEVAL_ERROR");
    return errorResponse(safe.status, safe.code, safe.message);
  }
  if (prepared.retrievalError) {
    return errorResponse(503, "RETRIEVAL_ERROR", "Knowledge retrieval is temporarily unavailable. Please try again shortly.");
  }

  const linkedModelController = createLinkedAbortController(req.signal);
  let streamCancelled = false;
  const stream = new ReadableStream({
    async start(controller) {
      let outputBytes = 0;
      let hasOutput = false;
      let sentTerminalFrame = false;
      const send = (frame: Parameters<typeof encodeChatFrame>[0]) => {
        if (!sentTerminalFrame && !streamCancelled) controller.enqueue(encodeChatFrame(frame));
      };
      try {
        for await (const text of streamWithChatDeadline(
          async (signal) => generatePreparedChat(prepared, serverChatDependencies, signal),
          { stage: "model", deadlineMs: CHAT_MODEL_DEADLINE_MS, signal: linkedModelController.signal },
        )) {
          if (linkedModelController.signal.aborted) break;
          const bounded = appendUtf8Output(outputBytes, text, CHAT_MAX_OUTPUT_BYTES);
          if (bounded.overLimit) {
            const prefix = bounded.accepted;
            if (prefix) {
              send({ type: "delta", text: prefix });
              outputBytes = bounded.bytes;
            }
            send({ type: "error", code: "OUTPUT_TOO_LARGE", message: "The generated answer was too large. Please ask a shorter question." });
            sentTerminalFrame = true;
            break;
          }
          if (text) {
            hasOutput = true;
            send({ type: "delta", text });
            outputBytes = bounded.bytes;
          }
        }
        if (!linkedModelController.signal.aborted && !sentTerminalFrame) {
          send(terminalChatFrame(hasOutput));
          sentTerminalFrame = true;
        }
      } catch (error) {
        if (!linkedModelController.signal.aborted) {
          const safe = safeError(error, error instanceof ChatDeadlineError ? "MODEL_TIMEOUT" : "MODEL_ERROR");
          send({ type: "error", code: safe.code, message: safe.message });
          sentTerminalFrame = true;
        }
      } finally {
        linkedModelController.dispose();
        if (!streamCancelled) controller.close();
      }
    },
    cancel(reason) {
      streamCancelled = true;
      linkedModelController.abort(reason);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
