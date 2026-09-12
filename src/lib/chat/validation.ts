import type { Locale } from "@/types";
import type { ChatMessage } from "./core";
import {
  CHAT_MAX_BODY_BYTES,
  CHAT_MAX_INPUT_BYTES,
  CHAT_MAX_MESSAGE_BYTES,
  CHAT_MAX_MESSAGES,
  utf8ByteLength,
} from "./limits";

export type ChatErrorCode =
  | "UNSUPPORTED_MEDIA_TYPE"
  | "INVALID_JSON"
  | "INVALID_REQUEST"
  | "UNSUPPORTED_LOCALE"
  | "BODY_TOO_LARGE"
  | "MESSAGE_TOO_LARGE"
  | "INPUT_TOO_LARGE"
  | "INVALID_SESSION"
  | "SERVICE_UNAVAILABLE"
  | "RATE_LIMITED"
  | "PREPARATION_TIMEOUT"
  | "MODEL_TIMEOUT"
  | "MODEL_ERROR"
  | "RETRIEVAL_ERROR"
  | "OUTPUT_TOO_LARGE"
  | "CLIENT_ABORTED";

export interface ValidChatRequest {
  messages: ChatMessage[];
  locale: Locale;
}

export interface ChatValidationFailure {
  ok: false;
  status: 400 | 413;
  code: Extract<ChatErrorCode, "INVALID_JSON" | "INVALID_REQUEST" | "UNSUPPORTED_LOCALE" | "BODY_TOO_LARGE" | "MESSAGE_TOO_LARGE" | "INPUT_TOO_LARGE">;
  message: string;
}

export interface ChatValidationSuccess {
  ok: true;
  value: ValidChatRequest;
}

export type ChatValidationResult = ChatValidationSuccess | ChatValidationFailure;

function failure(
  code: ChatValidationFailure["code"],
  message: string,
  status: ChatValidationFailure["status"] = 400,
): ChatValidationFailure {
  return { ok: false, status, code, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actualKeys = Object.keys(value).sort();
  return actualKeys.length === keys.length && actualKeys.every((key, index) => key === [...keys].sort()[index]);
}

export function validateContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  return contentType.split(";", 1)[0].trim().toLowerCase() === "application/json";
}

export function parseChatJson(text: string): { ok: true; value: unknown } | { ok: false; code: "BODY_TOO_LARGE" | "INVALID_JSON"; message: string } {
  if (utf8ByteLength(text) > CHAT_MAX_BODY_BYTES) {
    return { ok: false, code: "BODY_TOO_LARGE", message: "The request body is too large." };
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, code: "INVALID_JSON", message: "The request body must contain valid JSON." };
  }
}

export function validateChatRequest(value: unknown, bodyBytes?: number): ChatValidationResult {
  if (bodyBytes !== undefined && bodyBytes > CHAT_MAX_BODY_BYTES) {
    return failure("BODY_TOO_LARGE", "The request body is too large.", 413);
  }
  if (!isRecord(value)) {
    return failure("INVALID_REQUEST", "The request must be a JSON object.");
  }
  if (!hasExactKeys(value, ["messages", "locale"])) {
    return failure("INVALID_REQUEST", "The request must contain only messages and locale.");
  }

  if (value.locale !== "en" && value.locale !== "tr") {
    return failure("UNSUPPORTED_LOCALE", "Locale must be en or tr.");
  }
  if (!Array.isArray(value.messages) || value.messages.length === 0) {
    return failure("INVALID_REQUEST", "Messages must be a nonempty array.");
  }
  if (value.messages.length > CHAT_MAX_MESSAGES) {
    return failure("INPUT_TOO_LARGE", "The conversation contains too many messages.", 413);
  }

  const messages: ChatMessage[] = [];
  let inputBytes = 0;
  for (let index = 0; index < value.messages.length; index += 1) {
    const message = value.messages[index];
    if (!isRecord(message) || !hasExactKeys(message, ["role", "content"]) ||
      (message.role !== "user" && message.role !== "assistant") || typeof message.content !== "string") {
      return failure("INVALID_REQUEST", "Each message must contain a role and string content.");
    }
    if (!message.content.trim()) {
      return failure("INVALID_REQUEST", "Messages cannot be empty.");
    }
    if (index % 2 === 0 && message.role !== "user") {
      return failure("INVALID_REQUEST", "Messages must alternate starting with a user message.");
    }
    if (index % 2 === 1 && message.role !== "assistant") {
      return failure("INVALID_REQUEST", "Messages must alternate between user and assistant.");
    }

    const messageBytes = utf8ByteLength(message.content);
    if (messageBytes > CHAT_MAX_MESSAGE_BYTES) {
      return failure("MESSAGE_TOO_LARGE", "A message is too large.", 413);
    }
    inputBytes += messageBytes;
    messages.push({ role: message.role, content: message.content });
  }
  if (messages.at(-1)?.role !== "user") {
    return failure("INVALID_REQUEST", "The conversation must end with a user message.");
  }
  if (inputBytes > CHAT_MAX_INPUT_BYTES) {
    return failure("INPUT_TOO_LARGE", "The conversation is too large.", 413);
  }

  return { ok: true, value: { messages, locale: value.locale } };
}
