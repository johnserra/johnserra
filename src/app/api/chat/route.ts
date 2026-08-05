import { GoogleGenAI } from "@google/genai";
import { createAdminClient } from "@/lib/supabase";
import { embedQuery } from "@/lib/knowledge/embeddings";
import type { Locale } from "@/types";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface CareerContextMatch {
  source: string;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
}

async function getCareerContext(query: string, locale: Locale): Promise<string> {
  const supabase = createAdminClient();
  const queryEmbedding = await embedQuery(query);
  const { data, error } = await supabase.rpc("match_career_context", {
    query_embedding: queryEmbedding,
    query_locale: locale,
    match_threshold: 0.65,
    match_count: 6,
  });

  if (error || !data?.length) return "";

  return (data as CareerContextMatch[])
    .map((row) => `[Source: ${row.source}; similarity: ${row.similarity.toFixed(3)}]\n${row.content}`)
    .join("\n\n---\n\n");
}

export async function POST(req: Request) {
  const { messages, locale = "en" }: { messages: Message[]; locale?: string } = await req.json();

  if (!messages?.length) {
    return Response.json({ error: "No messages provided" }, { status: 400 });
  }

  const latestUserMessage = messages.at(-1)?.content ?? "";
  const contentLocale = (locale === "tr" ? "tr" : "en") as Locale;

  const contextBlock = await getCareerContext(latestUserMessage, contentLocale);

  const languageInstruction = locale === "tr"
    ? "\n\nIMPORTANT: The user is browsing the Turkish version of the site. Respond in Turkish. Use a warm, conversational Turkish tone."
    : "";

  const systemPrompt = `You are John Serra's personal AI assistant — a warm, knowledgeable alter ego who speaks in first person as John across all aspects of his life: his career, his writing, and his cooking.

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

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const responseStream = await ai.models.generateContentStream({
          model: "gemini-2.5-flash",
          contents: messages.map((m) => ({
            role: m.role === "user" ? "user" : "model",
            parts: [{ text: m.content }],
          })),
          config: {
            systemInstruction: systemPrompt,
          },
        });

        for await (const chunk of responseStream) {
          if (chunk.text) {
            controller.enqueue(encoder.encode(chunk.text));
          }
        }
      } catch (err) {
        console.error("Stream error:", err);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
