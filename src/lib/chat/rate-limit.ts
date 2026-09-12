import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { CHAT_RATE_LIMIT_SECRET_MIN_BYTES } from "./limits";

export const CHAT_SESSION_HEADER = "X-Chat-Session";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ChatRateLimitServiceError extends Error {
  override name = "ChatRateLimitServiceError";
  readonly code = "SERVICE_UNAVAILABLE" as const;
}

export function isValidChatSession(value: string | null): value is string {
  return Boolean(value && value.length === 36 && UUID_V4.test(value) && !value.includes(","));
}

function firstHeaderValue(value: string | null): string | null {
  const first = value?.split(",", 1)[0]?.trim() ?? "";
  return first || null;
}

/** Only Vercel's platform-populated header is trusted. Client-controlled forwarding headers are ignored. */
export function extractTrustedVercelIp(headers: Headers): string | null {
  const candidate = firstHeaderValue(headers.get("x-vercel-forwarded-for"));
  if (!candidate || isIP(candidate) === 0) return null;
  return candidate.toLowerCase();
}

export function hasUsableRateLimitSecret(secret: string | undefined): boolean {
  return Boolean(secret && Buffer.byteLength(secret, "utf8") >= CHAT_RATE_LIMIT_SECRET_MIN_BYTES);
}

export function hashRateLimitIdentity(secret: string, identity: string): string {
  return createHmac("sha256", secret).update(identity, "utf8").digest("hex");
}

export function hashChatIdentities(secret: string, sessionId: string, ip: string): { sessionHash: string; ipHash: string } {
  return {
    sessionHash: hashRateLimitIdentity(secret, `session:${sessionId}`),
    ipHash: hashRateLimitIdentity(secret, `ip:${ip}`),
  };
}
