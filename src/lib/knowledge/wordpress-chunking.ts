import { decodeHtmlEntities } from "@/lib/wordpress/normalize";

export const WORDPRESS_MAX_CHUNK_CHARACTERS = 2_400;
export const WORDPRESS_MAX_CHUNK_OVERLAP_CHARACTERS = 300;
export const WORDPRESS_MAX_CHUNKS_PER_DOCUMENT = 100;

export interface WordPressStructureBlock {
  kind: "heading" | "paragraph" | "list-item";
  text: string;
  level?: number;
}

export interface WordPressSection {
  sectionPath: string[];
  blocks: WordPressStructureBlock[];
}

export interface WordPressChunk {
  chunkIndex: number;
  content: string;
  sectionPath: string[];
}

const BLOCK_TAGS = new Set(["address", "article", "blockquote", "div", "figure", "footer", "header", "main", "pre", "section", "table", "td", "th", "tr"]);

function normalizeText(value: string): string {
  return decodeHtmlEntities(value).replace(/\s+/g, " ").trim();
}

function addLooseText(blocks: WordPressStructureBlock[], value: string): void {
  for (const paragraph of value.split(/\n\s*\n/)) {
    const text = normalizeText(paragraph);
    if (text) blocks.push({ kind: "paragraph", text });
  }
}

/**
 * Parses the small, stable HTML vocabulary emitted by WordPress into blocks.
 * Inline markup is deliberately ignored while headings, paragraphs, and list
 * items remain separate. Text without block markup is treated as paragraphs.
 */
export function parseWordPressHtml(html: string): WordPressStructureBlock[] {
  const blocks: WordPressStructureBlock[] = [];
  const sanitized = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
  const tokenPattern = /<!--[\s\S]*?-->|<\/?([a-z0-9]+)(?:\s[^>]*)?\/?>|([^<]+)/gi;
  let active: { tag: string; kind: WordPressStructureBlock["kind"]; level?: number; parts: string[] } | null = null;
  let loose: string[] = [];

  const flushLoose = () => {
    if (loose.length) addLooseText(blocks, loose.join(""));
    loose = [];
  };
  const flushActive = () => {
    if (!active) return;
    const text = normalizeText(active.parts.join(""));
    if (text) blocks.push({ kind: active.kind, text, level: active.level });
    active = null;
  };

  for (const match of sanitized.matchAll(tokenPattern)) {
    const token = match[0];
    const tag = match[1]?.toLowerCase();
    const text = match[2];
    if (!tag) {
      if (active) active.parts.push(text ?? "");
      else if (!token.startsWith("<!--")) loose.push(text ?? "");
      continue;
    }

    const closing = token.startsWith("</");
    if (tag === "br" && !closing) {
      if (active) active.parts.push("\n");
      else loose.push("\n");
      continue;
    }

    const heading = /^h[1-6]$/.test(tag);
    if (!closing && (heading || tag === "p" || tag === "li")) {
      flushLoose();
      flushActive();
      active = {
        tag,
        kind: heading ? "heading" : tag === "li" ? "list-item" : "paragraph",
        level: heading ? Number(tag[1]) : undefined,
        parts: [],
      };
      continue;
    }

    if (closing && active?.tag === tag) {
      flushActive();
      continue;
    }

    if (!closing && BLOCK_TAGS.has(tag)) flushLoose();
    if (closing && BLOCK_TAGS.has(tag)) flushLoose();
  }

  flushActive();
  flushLoose();
  return blocks.map(({ kind, text, level }) => ({ kind, text, ...(level ? { level } : {}) }));
}

export function structureWordPressBlocks(blocks: WordPressStructureBlock[]): WordPressSection[] {
  const sections: WordPressSection[] = [];
  const headingPath: Array<{ level: number; text: string }> = [];
  let current: WordPressSection = { sectionPath: [], blocks: [] };

  const startSection = (path: string[]) => {
    if (current.blocks.length) sections.push(current);
    current = { sectionPath: path, blocks: [] };
  };

  for (const block of blocks) {
    if (block.kind === "heading") {
      const level = block.level ?? 1;
      while (headingPath.at(-1)?.level !== undefined && headingPath.at(-1)!.level >= level) headingPath.pop();
      headingPath.push({ level, text: block.text });
      startSection(headingPath.map((heading) => heading.text));
      current.blocks.push(block);
    } else {
      current.blocks.push(block);
    }
  }
  if (current.blocks.length) sections.push(current);
  return sections;
}

function splitWords(text: string, maxCharacters: number): string[] {
  if (text.length <= maxCharacters) return [text];
  const words = text.split(/\s+/).filter(Boolean);
  const pieces: string[] = [];
  let current = "";
  for (const word of words) {
    if (word.length > maxCharacters) {
      if (current) pieces.push(current);
      current = "";
      for (let index = 0; index < word.length; index += maxCharacters) {
        pieces.push(word.slice(index, index + maxCharacters));
      }
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharacters) {
      pieces.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

function overlapTail(text: string, maxCharacters = WORDPRESS_MAX_CHUNK_OVERLAP_CHARACTERS): string {
  const words = text.split(/\s+/).filter(Boolean);
  const selected: string[] = [];
  let length = 0;
  for (let index = words.length - 1; index >= 0; index -= 1) {
    const nextLength = length ? words[index].length + 1 + length : words[index].length;
    if (nextLength > maxCharacters) break;
    selected.unshift(words[index]);
    length = nextLength;
  }
  return selected.join(" ");
}

function blockLabel(block: WordPressStructureBlock): string {
  if (block.kind === "heading") return "Heading";
  if (block.kind === "list-item") return "List item";
  return "Paragraph";
}

function sectionPrefix(title: string, sectionPath: string[]): string {
  return [
    `Document: ${title || "Untitled"}`,
    `Section path: ${sectionPath.length ? sectionPath.join(" > ") : "(document body)"}`,
  ].join("\n");
}

function sectionChunks(title: string, section: WordPressSection): WordPressChunk[] {
  const prefix = sectionPrefix(title, section.sectionPath);
  const capacity = WORDPRESS_MAX_CHUNK_CHARACTERS - prefix.length - 1;
  if (capacity < 1) throw new Error("WordPress section context exceeds the configured chunk limit.");

  const units = section.blocks.flatMap((block) => {
    const initialLabel = `${blockLabel(block)}: `;
    const continuationLabel = `${blockLabel(block)} (continued): `;
    const labelLength = Math.max(initialLabel.length, continuationLabel.length);
    const overlapBudget = Math.min(
      WORDPRESS_MAX_CHUNK_OVERLAP_CHARACTERS,
      Math.max(0, Math.floor((capacity - labelLength - 1) / 4)),
    );
    const textCapacity = capacity - labelLength - overlapBudget;
    if (textCapacity < 1) {
      throw new Error(
        `WordPress ${blockLabel(block).toLowerCase()} context for section ${section.sectionPath.join(" > ") || "(document body)"} cannot fit within the configured chunk limit.`,
      );
    }
    return splitWords(block.text, textCapacity).map((part, index) => `${index ? `${blockLabel(block)} (continued)` : blockLabel(block)}: ${part}`);
  });
  if (!units.length) return [];

  const output: WordPressChunk[] = [];
  let body = "";
  const emit = () => {
    if (!body) return;
    output.push({
      chunkIndex: output.length,
      content: `${prefix}\n${body}`,
      sectionPath: [...section.sectionPath],
    });
  };

  for (const unit of units) {
    const candidate = body ? `${body}\n${unit}` : unit;
    if (candidate.length <= capacity) {
      body = candidate;
      continue;
    }
    emit();
    const roomForOverlap = capacity - unit.length - 1;
    const overlap = roomForOverlap > 0 ? overlapTail(body, Math.min(roomForOverlap, WORDPRESS_MAX_CHUNK_OVERLAP_CHARACTERS)) : "";
    body = overlap ? `${overlap}\n${unit}` : unit;
  }
  emit();
  return output;
}

export function chunkWordPressHtml(title: string, html: string): WordPressChunk[] {
  const sections = structureWordPressBlocks(parseWordPressHtml(html));
  const chunks = sections.flatMap((section) => sectionChunks(title, section));
  if (chunks.length > WORDPRESS_MAX_CHUNKS_PER_DOCUMENT) {
    throw new Error(`WordPress document exceeds the configured ${WORDPRESS_MAX_CHUNKS_PER_DOCUMENT}-chunk limit.`);
  }
  return chunks.map((chunk, index) => ({ ...chunk, chunkIndex: index }));
}

/** Deterministic fallback retained for callers that only have plain text. */
export function chunkUnstructuredText(title: string, text: string): WordPressChunk[] {
  const blocks: WordPressStructureBlock[] = [];
  addLooseText(blocks, text);
  const chunks = structureWordPressBlocks(blocks).flatMap((section) => sectionChunks(title, section));
  if (chunks.length > WORDPRESS_MAX_CHUNKS_PER_DOCUMENT) {
    throw new Error(`WordPress document exceeds the configured ${WORDPRESS_MAX_CHUNKS_PER_DOCUMENT}-chunk limit.`);
  }
  return chunks.map((chunk, index) => ({ ...chunk, chunkIndex: index }));
}

export function htmlToStructuredPlainText(html: string): string {
  return structureWordPressBlocks(parseWordPressHtml(html))
    .flatMap((section) => section.blocks.map((block) => `${block.kind === "list-item" ? "- " : ""}${block.text}`))
    .join("\n")
    .trim();
}
