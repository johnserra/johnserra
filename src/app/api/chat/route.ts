import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase";
import { getAllContent, getContentBySlug } from "@/lib/content";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface Message {
  role: "user" | "assistant";
  content: string;
}

async function getCareerContext(query: string): Promise<string> {
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

function getSiteContent(query: string): string {
  const sections: string[] = [];

  // About page — always include
  const about = getContentBySlug("about", "index");
  if (about) {
    sections.push(`## About John\n${about.content.trim()}`);
  }

  // Blog posts — always include (posts are short)
  const posts = getAllContent("blog");
  if (posts.length) {
    const blogSection = posts
      .map((p) => {
        const meta = `### ${p.frontmatter.title}${p.frontmatter.date ? ` (${p.frontmatter.date})` : ""}`;
        return `${meta}\n${p.content.trim()}`;
      })
      .join("\n\n---\n\n");
    sections.push(`## Blog Posts\n${blogSection}`);
  }

  // Recipes — always include an index with URLs; include the story for a matched recipe
  const recipes = getAllContent("recipes");
  if (recipes.length) {
    const index = recipes
      .map((r) => {
        const meta = [r.frontmatter.cuisine, r.frontmatter.totalTime]
          .filter(Boolean)
          .join(", ");
        const url = `/recipes/${r.slug}`;
        return `- **${r.frontmatter.title}**${meta ? ` (${meta})` : ""}: ${r.frontmatter.description ?? ""} — page: ${url}`;
      })
      .join("\n");

    const queryLower = query.toLowerCase();
    const match = recipes.find((r) => {
      const title = r.frontmatter.title.toLowerCase();
      const slugWords = r.slug.replace(/-/g, " ");
      // Match on full title, slug words, or any meaningful word in the title
      return (
        queryLower.includes(title) ||
        queryLower.includes(slugWords) ||
        title.split(" ").some((w) => w.length > 4 && queryLower.includes(w))
      );
    });

    const recipeStory = match
      ? `\n\n### About this recipe: ${match.frontmatter.title} (/recipes/${match.slug})\n${match.content.trim()}`
      : "";

    sections.push(`## Recipes\n${index}${recipeStory}`);
  }

  return sections.join("\n\n===\n\n");
}

export async function POST(req: Request) {
  const { messages }: { messages: Message[] } = await req.json();

  if (!messages?.length) {
    return Response.json({ error: "No messages provided" }, { status: 400 });
  }

  const latestUserMessage = messages.at(-1)?.content ?? "";

  const [careerContext, siteContent] = await Promise.all([
    getCareerContext(latestUserMessage),
    Promise.resolve(getSiteContent(latestUserMessage)),
  ]);

  const contextBlock = [
    careerContext,
    siteContent,
  ]
    .filter(Boolean)
    .join("\n\n===\n\n");

  const systemPrompt = `You are John Serra's personal AI assistant — a warm, knowledgeable alter ego who speaks in first person as John across all aspects of his life: his career, his writing, and his cooking.

John Serra is a business development professional with experience spanning manufacturing (patented process innovation for polystyrene foam trays), education (COVID-19 digital transformation of a language school in Istanbul), and urban mobility (parking market development in Central New York). He is passionate about using data to drive growth and solving complex, cross-industry challenges. He also cooks seriously — making fresh pasta from scratch, hosting dinners, and writing recipes that often carry a personal story.

When answering questions:
- Speak as John in first person ("I led...", "My experience includes...", "That lasagna is one of my favorites...")
- Be warm, direct, and confident — not corporate or stiff
- Draw on the context provided below when relevant
- For recipe questions, share the story behind the recipe if there is one, then invite them to view the full recipe by linking to its page — do not recite the full ingredients list or method in chat
- When linking, always use descriptive anchor text (e.g. [Lasagna Bolognese](/recipes/lasagna-bolognese)) — never use generic text like "here" or "this link"
- If asked about something outside the context, answer based on what you know about John's background, or say you'd love to chat more about it directly
- Keep answers conversational and concise (2–4 paragraphs max)
- Never invent specific facts not in the context

${contextBlock ? `\n<context>\n${contextBlock}\n</context>` : ""}`;

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
