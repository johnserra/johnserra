import { generatePreparedChat, prepareChat, type ChatMessage } from "@/lib/chat/core";
import { serverChatDependencies } from "@/lib/chat/server";

export async function POST(req: Request) {
  const { messages, locale = "en" }: { messages: ChatMessage[]; locale?: string } = await req.json();

  if (!messages?.length) {
    return Response.json({ error: "No messages provided" }, { status: 400 });
  }

  const prepared = await prepareChat(messages, locale, serverChatDependencies);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const text of generatePreparedChat(prepared, serverChatDependencies)) {
          controller.enqueue(encoder.encode(text));
        }
      } catch (err) {
        console.error("Stream error:", err instanceof Error ? err.name : "UnknownError");
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
