import type { ChatMessage } from "./core";

export const SOCIAL_INTENT_MAX_BYTES = 256;

export type SocialIntent = "greeting" | "acknowledgment" | "capability";

const GREETINGS = new Set([
  "hi", "hello", "hey", "hiya", "howdy", "greetings", "hey there", "hi there", "hello there",
  "good morning", "good afternoon", "good evening",
  "how are you", "how are you doing", "how s it going", "hows it going",
  "nice to meet you", "good to meet you",
  "merhaba", "selam", "günaydın", "iyi günler", "iyi akşamlar", "iyi sabahlar",
  "nasılsın", "nasılsınız", "memnun oldum",
]);

const ACKNOWLEDGMENTS = new Set([
  "thanks", "thank you", "thanks a lot", "many thanks", "thx", "ty",
  "ok", "okay", "got it", "understood", "noted", "sounds good", "all right", "alright",
  "ok thanks", "okay thanks", "ok thank you", "okay thank you",
  "got it thanks", "got it thank you", "understood thanks", "understood thank you",
  "noted thanks", "noted thank you", "sounds good thanks", "sounds good thank you",
  "perfect thanks", "perfect thank you", "great thanks", "great thank you",
  "tamam", "teşekkürler", "teşekkür ederim", "çok teşekkürler", "çok teşekkür ederim",
  "sağ ol", "sağ olun", "çok sağ ol", "çok sağ olun", "eyvallah",
  "tamam teşekkürler", "tamam teşekkür ederim", "ok teşekkürler", "ok teşekkür ederim",
  "okay teşekkürler", "okay teşekkür ederim", "anladım teşekkürler", "anladım teşekkür ederim",
  "anladım sağ ol", "anladım sağ olun", "anlaşıldı teşekkürler", "oldu teşekkürler", "iyi oldu teşekkürler",
]);

const ENGLISH_CAPABILITY = /^(?:(?:hi|hello|hey|hiya|howdy|greetings) )?(?:what can you help me (?:with|learn)|how can you help me|who are you|what are you)(?: about john(?: serra)?)?$/u;
const TURKISH_CAPABILITY = /^(?:(?:merhaba|selam) )?(?:(?:bana )?nasıl yardımcı olabilirsin|neler yapabilirsin|sen kimsin|kimsin|john serra hakkında (?:neler öğrenmeme yardımcı olabilirsin|bana nasıl yardımcı olabilirsin))$/u;

function normalizedVariants(content: string): string[] {
  if (new TextEncoder().encode(content).byteLength > SOCIAL_INTENT_MAX_BYTES) return [];

  const normalized = content.normalize("NFKC");
  // Format/control characters are rejected rather than removed. Removing a
  // zero-width character could turn an obfuscated instruction into a greeting.
  if (/[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}]/u.test(normalized)) return [];

  const variants = ["en-US", "tr"].map((locale) => normalized
    .toLocaleLowerCase(locale)
    .replace(/[\p{P}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim());
  return [...new Set(variants.filter(Boolean))];
}

function classifyNormalized(value: string): SocialIntent | null {
  if (GREETINGS.has(value)) return "greeting";
  if (ACKNOWLEDGMENTS.has(value)) return "acknowledgment";
  if (ENGLISH_CAPABILITY.test(value) || TURKISH_CAPABILITY.test(value)) return "capability";
  return null;
}

/** Classify only the complete latest user message; conversation history is context, never a signal. */
export function classifySocialIntent(messages: readonly ChatMessage[]): SocialIntent | null {
  const latest = messages.at(-1);
  if (!latest || latest.role !== "user" || typeof latest.content !== "string") return null;
  for (const variant of normalizedVariants(latest.content)) {
    const intent = classifyNormalized(variant);
    if (intent) return intent;
  }
  return null;
}

export function staticSocialResponse(intent: SocialIntent, locale: "en" | "tr"): string {
  if (locale === "tr") {
    if (intent === "acknowledgment") return "Rica ederim! John’un projeleri, yayımlanmış çalışmaları veya belgelenmiş deneyimi hakkında dilediğinizi sorabilirsiniz.";
    if (intent === "capability") return "Ben John Serra’nın yapay zekâ asistanıyım. John’un projeleri, yayımlanmış analitik yazıları veya belgelenmiş deneyimi hakkında yardımcı olabilirim—ne öğrenmek istersiniz?";
    return "Merhaba! Ben John Serra’nın yapay zekâ asistanıyım. John’un projeleri, yayımlanmış çalışmaları veya belgelenmiş deneyimi hakkında size nasıl yardımcı olabilirim?";
  }
  if (intent === "acknowledgment") return "You’re welcome! Feel free to ask about John’s projects, published work, or documented experience.";
  if (intent === "capability") return "I’m John Serra’s AI assistant. I can help you explore John’s projects, published analytics writing, or documented experience—what would you like to know?";
  return "Hi! I’m John Serra’s AI assistant. Happy to help with John’s projects, published articles, or documented experience—what are you curious about?";
}
