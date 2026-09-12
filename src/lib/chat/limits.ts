/** Public chat boundary limits. All text limits are measured as UTF-8 bytes. */
export const CHAT_MAX_BODY_BYTES = 64 * 1024;
export const CHAT_MAX_MESSAGES = 21;
export const CHAT_MAX_MESSAGE_BYTES = 8 * 1024;
export const CHAT_MAX_INPUT_BYTES = 32 * 1024;
export const CHAT_MAX_OUTPUT_BYTES = 32 * 1024;

export const CHAT_PREPARATION_DEADLINE_MS = 12_000;
export const CHAT_MODEL_DEADLINE_MS = 45_000;

export const CHAT_RATE_LIMIT_WINDOW_SECONDS = 60;
export const CHAT_RATE_LIMIT_SESSION_LIMIT = 20;
export const CHAT_RATE_LIMIT_IP_LIMIT = 60;
export const CHAT_RATE_LIMIT_SECRET_MIN_BYTES = 32;

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

/** Return the longest prefix that fits a UTF-8 byte budget without splitting a code point. */
export function utf8Prefix(value: string, maxBytes: number): string {
  if (maxBytes <= 0) return "";
  if (utf8ByteLength(value) <= maxBytes) return value;

  let bytes = 0;
  let end = 0;
  for (const character of value) {
    const characterBytes = utf8ByteLength(character);
    if (bytes + characterBytes > maxBytes) break;
    bytes += characterBytes;
    end += character.length;
  }
  return value.slice(0, end);
}

export function appendUtf8Output(
  currentBytes: number,
  delta: string,
  maxBytes = CHAT_MAX_OUTPUT_BYTES,
): { accepted: string; bytes: number; overLimit: boolean } {
  const remaining = Math.max(0, maxBytes - currentBytes);
  const accepted = utf8Prefix(delta, remaining);
  const bytes = currentBytes + utf8ByteLength(accepted);
  return { accepted, bytes, overLimit: utf8ByteLength(delta) > remaining };
}
