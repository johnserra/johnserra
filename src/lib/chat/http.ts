import type { ChatErrorCode } from "./validation";

export function createChatErrorResponse(
  status: number,
  code: ChatErrorCode,
  message: string,
  retryAfter?: number,
): Response {
  const normalizedRetryAfter = retryAfter === undefined || !Number.isFinite(retryAfter)
    ? undefined
    : Math.max(0, Math.ceil(retryAfter));
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  if (normalizedRetryAfter !== undefined) {
    headers.set("Retry-After", String(normalizedRetryAfter));
  }

  return new Response(JSON.stringify({
    error: {
      code,
      message,
      ...(normalizedRetryAfter === undefined ? {} : { retryAfter: normalizedRetryAfter }),
    },
  }), { status, headers });
}
