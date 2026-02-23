/**
 * Knowledge base seeder
 *
 * Reads all content files, chunks them, and upserts into the
 * Supabase `career_context` table for use in RAG chat.
 *
 * Run once (and re-run whenever content changes):
 *   npx tsx scripts/seed-knowledge-base.ts
 *
 * Requirements:
 *   npm install -D tsx dotenv
 *   (Supabase pgvector embeddings are stored as text for now —
 *    upgrade to vector embeddings by adding an OpenAI/Anthropic
 *    embedding step and changing the match function to use cosine similarity)
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import matter from "gray-matter";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CONTENT_DIR = path.join(process.cwd(), "content");
const CHUNK_SIZE = 800; // characters per chunk (roughly 200 tokens)
const CHUNK_OVERLAP = 100;

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end).trim());
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks.filter((c) => c.length > 50);
}

async function processDirectory(dir: string, type: string) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      await processDirectory(fullPath, type);
      continue;
    }
    if (!entry.endsWith(".md")) continue;

    const raw = fs.readFileSync(fullPath, "utf-8");
    const { data: frontmatter, content } = matter(raw);
    const slug = entry.replace(".md", "");
    const source = `${type}/${slug}`;

    // Build a plain-text representation
    const title = frontmatter.title ?? slug;
    const description = frontmatter.description ?? "";
    const fullText = `# ${title}\n${description ? `\n${description}\n` : ""}\n${content}`;
    const chunks = chunkText(fullText);

    console.log(`  Seeding ${source} → ${chunks.length} chunks`);

    for (let i = 0; i < chunks.length; i++) {
      const { error } = await supabase.from("career_context").upsert(
        {
          source,
          chunk_index: i,
          content: chunks[i],
          metadata: { title, type, slug },
        },
        { onConflict: "source,chunk_index" }
      );
      if (error) console.error(`    Error on ${source}[${i}]:`, error.message);
    }
  }
}

async function main() {
  console.log("Seeding knowledge base...\n");

  await processDirectory(path.join(CONTENT_DIR, "about"), "about");
  await processDirectory(path.join(CONTENT_DIR, "portfolio"), "portfolio");
  await processDirectory(path.join(CONTENT_DIR, "recipes"), "recipes");

  console.log("\nDone!");
}

main().catch(console.error);
