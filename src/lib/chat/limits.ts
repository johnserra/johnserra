/** Public chat boundary limits. All text limits are measured as UTF-8 bytes. */
export const CHAT_MAX_BODY_BYTES = 64 * 1024;
export const CHAT_MAX_MESSAGES = 21;
export const CHAT_MAX_MESSAGE_BYTES = 8 * 1024;
export const CHAT_MAX_INPUT_BYTES = 32 * 1024;
export const CHAT_MAX_OUTPUT_BYTES = 32 * 1024;

export const CHAT_PREPARATION_DEADLINE_MS = 12_000;
export const CHAT_MODEL_DEADLINE_MS = 45_000;

/** Model-selected tool limits. Tool result caps are measured as UTF-8 bytes. */
export const CHAT_MAX_TOOL_CALLS = 5;
/** Issue #19 bounded evidence-agent limits. These are deliberately lower than the legacy batch cap. */
export const AGENT_MAX_ACCEPTED_TOOL_EXECUTIONS = 3;
export const AGENT_MAX_RETRIEVAL_ROUNDS = 2;
export const AGENT_MAX_VERIFICATION_PASSES = 1;
export const AGENT_MAX_STEPS = 12;
export const AGENT_OVERALL_DEADLINE_MS = 45_000;
export const AGENT_MAX_INTERNAL_OUTPUT_BYTES = 24 * 1024;
export const AGENT_MAX_INTERNAL_OUTPUT_TOKENS = 1_024;
export const AGENT_MAX_RESERVED_TOKENS = 4_096;
export const AGENT_MAX_ESTIMATED_COST_USD = 0.05;
export const AGENT_PROVIDER_MAX_OUTPUT_TOKENS = 768;
export const AGENT_DRAFT_MAX_OUTPUT_TOKENS = 512;
export const AGENT_VERIFIER_MAX_OUTPUT_TOKENS = 640;
export const AGENT_SAFE_ANSWER_BY_LOCALE = {
  en: "The available public evidence is insufficient to answer that reliably. Please ask about a documented project, career entry, or public contact option.",
  tr: "Mevcut kamuya açık kanıtlar bu soruyu güvenilir biçimde yanıtlamak için yeterli değil. Lütfen belgelenmiş bir proje, kariyer kaydı veya herkese açık iletişim seçeneği hakkında sorun.",
} as const;
export const AGENT_QUALIFIED_ANSWER_BY_LOCALE = {
  en: "I can only confirm what is supported by the available public sources. Some requested details could not be verified, so I’m leaving them out.",
  tr: "Yalnızca mevcut kamuya açık kaynaklarla desteklenen bilgileri doğrulayabilirim. İstenen bazı ayrıntılar doğrulanamadığı için bunları dahil etmiyorum.",
} as const;
// Preserve the existing English exports for consumers that only need the
// default wording; agent-loop selects the locale-keyed variants at emission.
export const AGENT_SAFE_ANSWER = AGENT_SAFE_ANSWER_BY_LOCALE.en;
export const AGENT_QUALIFIED_ANSWER = AGENT_QUALIFIED_ANSWER_BY_LOCALE.en;
export function agentSafeAnswer(locale: "en" | "tr"): string {
  return AGENT_SAFE_ANSWER_BY_LOCALE[locale] ?? AGENT_SAFE_ANSWER_BY_LOCALE.en;
}
export function agentQualifiedAnswer(locale: "en" | "tr"): string {
  return AGENT_QUALIFIED_ANSWER_BY_LOCALE[locale] ?? AGENT_QUALIFIED_ANSWER_BY_LOCALE.en;
}
export const CHAT_TOOL_DEADLINES_MS = {
  search_knowledge: 10_000,
  get_cv_timeline: 4_000,
  get_project_details: 4_000,
  list_articles: 4_000,
  get_contact_options: 2_000,
} as const;
export const CHAT_TOOL_RESULT_BYTES = {
  search_knowledge: 12 * 1024,
  get_cv_timeline: 12 * 1024,
  get_project_details: 12 * 1024,
  list_articles: 8 * 1024,
  get_contact_options: 2 * 1024,
} as const;

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
