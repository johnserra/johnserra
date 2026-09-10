import type { Locale } from "@/types";
import { CHAT_MODEL, RETRIEVAL_COUNT, RETRIEVAL_THRESHOLD } from "./config";

export { CHAT_MODEL, RETRIEVAL_COUNT, RETRIEVAL_THRESHOLD } from "./config";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CareerContextMatch {
  source: string;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
}

export interface RetrievalRequest {
  query_embedding: number[];
  query_locale: Locale;
  match_threshold: number;
  match_count: number;
}

export interface GenerationRequest {
  model: string;
  contents: Array<{
    role: "user" | "model";
    parts: Array<{ text: string }>;
  }>;
  config: { systemInstruction: string };
}

export interface ChatDependencies {
  embedQuery(query: string, signal?: AbortSignal): Promise<number[]>;
  matchCareerContext(request: RetrievalRequest, signal?: AbortSignal): Promise<{
    data: CareerContextMatch[] | null;
    error: unknown;
  }>;
  generateContentStream(request: GenerationRequest, signal?: AbortSignal): Promise<AsyncIterable<{ text?: string }>>;
}

export interface PreparedChat {
  contentLocale: Locale;
  contextBlock: string;
  matches: CareerContextMatch[];
  retrievalError: boolean;
  generationRequest: GenerationRequest;
}

export function formatCareerContext(matches: CareerContextMatch[]): string {
  return matches
    .map((row) => `[Source: ${row.source}; similarity: ${row.similarity.toFixed(3)}]\n${row.content}`)
    .join("\n\n---\n\n");
}

export function buildSystemPrompt(contextBlock: string, locale: string): string {
  const languageInstruction = locale === "tr"
    ? "\n\nIMPORTANT: The user is browsing the Turkish version of the site. Respond in Turkish. Use a warm, conversational Turkish tone."
    : "";

  return `You are John Serra's personal AI assistant — a warm, knowledgeable alter ego who speaks in first person as John across all aspects of his life: his career, his writing, and his cooking.

John Serra is a business development professional with experience spanning manufacturing (patented process innovation for polystyrene foam trays), education (COVID-19 digital transformation of a language school in Istanbul), and urban mobility (parking market development in Central New York). He is passionate about using data to drive growth and solving complex, cross-industry challenges. He also cooks seriously — making fresh pasta from scratch, hosting dinners, and writing recipes that often carry a personal story.

When answering questions:
- Speak as John in first person ("I led...", "My experience includes...", "That lasagna is one of my favorites...")
- Be warm, direct, and confident — not corporate or stiff
- Draw on the context provided below when relevant
- For recipe questions, share the story behind the recipe if there is one, then invite them to view the full recipe by linking to its page — do not recite the full ingredients list or method in chat
- When linking, always use descriptive anchor text (e.g. [Lasagna Bolognese](/blog/lasagna-bolognese)) — never use generic text like "here" or "this link"
- If asked about something outside the context, answer based on what you know about John's background, or say you'd love to chat more about it directly
- Keep answers conversational and concise (2–4 paragraphs max)
- Never invent specific facts not in the context${languageInstruction}

${contextBlock ? `\n<context>\n${contextBlock}\n</context>` : ""}`;
}

export function buildGenerationRequest(
  messages: ChatMessage[],
  locale: string,
  contextBlock: string,
): GenerationRequest {
  return {
    model: CHAT_MODEL,
    contents: messages.map((message) => ({
      role: message.role === "user" ? "user" : "model",
      parts: [{ text: message.content }],
    })),
    config: { systemInstruction: buildSystemPrompt(contextBlock, locale) },
  };
}

export async function prepareChat(
  messages: ChatMessage[],
  locale: string,
  dependencies: ChatDependencies,
  syntheticMatches?: CareerContextMatch[],
  signal?: AbortSignal,
): Promise<PreparedChat> {
  const latestUserMessage = messages.at(-1)?.content ?? "";
  const contentLocale = (locale === "tr" ? "tr" : "en") as Locale;
  let matches: CareerContextMatch[] = [];
  let retrievalError = false;

  if (syntheticMatches) {
    matches = syntheticMatches;
  } else {
    const queryEmbedding = signal
      ? await dependencies.embedQuery(latestUserMessage, signal)
      : await dependencies.embedQuery(latestUserMessage);
    const retrievalRequest = {
      query_embedding: queryEmbedding,
      query_locale: contentLocale,
      match_threshold: RETRIEVAL_THRESHOLD,
      match_count: RETRIEVAL_COUNT,
    };
    const result = signal
      ? await dependencies.matchCareerContext(retrievalRequest, signal)
      : await dependencies.matchCareerContext(retrievalRequest);
    retrievalError = Boolean(result.error);
    if (!result.error && result.data?.length) matches = result.data;
  }

  const contextBlock = formatCareerContext(matches);
  return {
    contentLocale,
    contextBlock,
    matches,
    retrievalError,
    generationRequest: buildGenerationRequest(messages, locale, contextBlock),
  };
}

export async function* generatePreparedChat(
  prepared: PreparedChat,
  dependencies: ChatDependencies,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const responseStream = signal
    ? await dependencies.generateContentStream(prepared.generationRequest, signal)
    : await dependencies.generateContentStream(prepared.generationRequest);
  for await (const chunk of responseStream) {
    if (chunk.text) yield chunk.text;
  }
}
