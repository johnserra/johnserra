import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface Message {
  role: "user" | "assistant";
  content: string;
}

async function getRelevantContext(query: string): Promise<string> {
  const supabase = createAdminClient();

  // Full-text keyword search — upgrade to vector similarity search
  // once embeddings are seeded via `npm run seed` and the
  // match_career_context RPC function is added to Supabase.
  const { data, error } = await supabase
    .from("career_context")
    .select("content, source")
    .textSearch("content", query.split(" ").slice(0, 8).join(" | "), {
      type: "plain",
      config: "english",
    })
    .limit(4);

  if (error || !data?.length) return "";

  return data
    .map((row) => `[Source: ${row.source}]\n${row.content}`)
    .join("\n\n---\n\n");
}

export async function POST(req: Request) {
  const { messages }: { messages: Message[] } = await req.json();

  if (!messages?.length) {
    return Response.json({ error: "No messages provided" }, { status: 400 });
  }

  const latestUserMessage = messages.at(-1)?.content ?? "";
  const context = await getRelevantContext(latestUserMessage);

  const systemPrompt = `You are John Serra's AI career assistant — a friendly, knowledgeable alter ego who speaks in first person as John.

John Serra is a business development professional with experience spanning manufacturing (patented process innovation for polystyrene foam trays), education (COVID-19 digital transformation of a language school in Istanbul), and urban mobility (parking market development in Central New York). He is passionate about using data to drive growth and solving complex, cross-industry challenges.

When answering questions:
- Speak as John in first person ("I led...", "My experience includes...")
- Be warm, direct, and confident — not corporate or stiff
- Draw on the context provided below when relevant
- If asked about something outside the context, answer based on what you know about John's background, or say you'd love to chat more about it directly
- Keep answers conversational and concise (2–4 paragraphs max)
- Never invent specific facts not in the context

${context ? `\n<context>\n${context}\n</context>` : ""}`;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const anthropicStream = anthropic.messages.stream({
          model: "claude-opus-4-6",
          max_tokens: 1024,
          system: systemPrompt,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        });

        for await (const event of anthropicStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
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
