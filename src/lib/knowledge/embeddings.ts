import "server-only";

import { GoogleGenAI } from "@google/genai";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "@/lib/chat/config";

export { EMBEDDING_CONFIG_VERSION, EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "@/lib/chat/config";

let client: GoogleGenAI | undefined;

function gemini(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is required for embeddings.");
  client ??= new GoogleGenAI({ apiKey });
  return client;
}
async function embed(
  text: string,
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
  title?: string,
  signal?: AbortSignal,
): Promise<number[]> {
  const response = await gemini().models.embedContent({
    model: EMBEDDING_MODEL,
    contents: text,
    config: {
      taskType,
      outputDimensionality: EMBEDDING_DIMENSIONS,
      ...(taskType === "RETRIEVAL_DOCUMENT" && title ? { title } : {}),
      ...(signal ? { abortSignal: signal } : {}),
    },
  });
  const values = response.embeddings?.[0]?.values;

  if (!values || values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Gemini returned ${values?.length ?? 0} embedding dimensions; expected ${EMBEDDING_DIMENSIONS}.`);
  }

  return values;
}

export function embedDocument(text: string, title: string, signal?: AbortSignal): Promise<number[]> {
  return embed(text, "RETRIEVAL_DOCUMENT", title, signal);
}

export function embedQuery(text: string, signal?: AbortSignal): Promise<number[]> {
  return embed(text, "RETRIEVAL_QUERY", undefined, signal);
}
