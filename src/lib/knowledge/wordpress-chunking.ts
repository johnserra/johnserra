import { decodeHtmlEntities } from "@/lib/wordpress/normalize";

export const WORDPRESS_MAX_CHUNK_CHARACTERS = 2_400;
export const WORDPRESS_MAX_CHUNK_OVERLAP_CHARACTERS = 300;
export const WORDPRESS_MAX_CHUNKS_PER_DOCUMENT = 100;

export interface WordPressStructureBlock {
  kind: "heading" | "paragraph" | "list-item" | "table";
  text: string;
  level?: number;
  headers?: string[];
  rows?: string[][];
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

const BLOCK_TAGS = new Set(["address", "article", "blockquote", "div", "figure", "footer", "header", "main", "pre", "section"]);

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
function plainCellText(html: string): string {
  return normalizeText(html.replace(/<br\b[^>]*>/gi, " ").replace(/<[^>]+>/g, " "));
}

function parseTable(html: string): WordPressStructureBlock {
  const parsedRows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) => {
    const cells = [...row[1].matchAll(/<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi)];
    return { cells: cells.map((cell) => plainCellText(cell[2])), header: cells.length > 0 && cells.every((cell) => cell[1].toLowerCase() === "th") };
  }).filter((row) => row.cells.length > 0);
  const headerIndex = parsedRows.findIndex((row) => row.header);
  const headers = headerIndex >= 0 ? parsedRows[headerIndex].cells : [];
  const rows = parsedRows.filter((_, index) => index !== headerIndex).map((row) => row.cells);
  return { kind: "table", text: "", headers, rows };
}

function parseNonTableHtml(html: string): WordPressStructureBlock[] {
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

export function parseWordPressHtml(html: string): WordPressStructureBlock[] {
  const sanitizedHtml = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
  const blocks: WordPressStructureBlock[] = [];
  let cursor = 0;
  for (const table of sanitizedHtml.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)) {
    const index = table.index ?? cursor;
    blocks.push(...parseNonTableHtml(sanitizedHtml.slice(cursor, index)), parseTable(table[0]));
    cursor = index + table[0].length;
  }
  blocks.push(...parseNonTableHtml(sanitizedHtml.slice(cursor)));
  return blocks;
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
  if (block.kind === "table") return "Table";
  return "Paragraph";
}

function pipeCell(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}

function tableHeader(headers: string[], tableNumber: number): string {
  return headers.length
    ? `Table ${tableNumber} headers: ${headers.map(pipeCell).join(" | ")}`
    : `Table ${tableNumber} headers: (none)`;
}

function tableUnits(block: WordPressStructureBlock, tableNumber: number, capacity: number): Array<{ text: string; header: string }> {
  const headers = block.headers ?? [];
  const header = tableHeader(headers, tableNumber);
  if (header.length > capacity) throw new Error("WordPress table header cannot fit within the configured chunk limit.");
  const rows = block.rows ?? [];
  if (!rows.length) return [{ text: `Table ${tableNumber} row: (no data)`, header }];
  return rows.flatMap((row, rowIndex) => {
    const rowText = `Table ${tableNumber} row ${rowIndex + 1}: ${row.map(pipeCell).join(" | ")}`;
    if (header.length + 1 + rowText.length <= capacity) return [{ text: rowText, header }];
    return row.flatMap((cell, columnIndex) => {
      const column = headers[columnIndex] || `column ${columnIndex + 1}`;
      const prefix = `Table ${tableNumber} row ${rowIndex + 1}, ${pipeCell(column)} (continued): `;
      const available = capacity - header.length - 1 - prefix.length - 24;
      if (available < 1) throw new Error("WordPress table row context cannot fit within the configured chunk limit.");
      const pieces = splitWords(pipeCell(cell), available);
      return (pieces.length ? pieces : [""]).map((piece, partIndex) => ({
        text: `${prefix.slice(0, -2)}, part ${partIndex + 1}: ${piece}`,
        header,
      }));
    });
  });
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

  let tableNumber = 0;
  const units = section.blocks.flatMap((block): Array<{ text: string; tableHeader?: string }> => {
    if (block.kind === "table") {
      tableNumber += 1;
      return tableUnits(block, tableNumber, capacity).map((unit) => ({ text: unit.text, tableHeader: unit.header }));
    }
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
    return splitWords(block.text, textCapacity).map((part, index) => ({ text: `${index ? `${blockLabel(block)} (continued)` : blockLabel(block)}: ${part}` }));
  });
  if (!units.length) return [];

  const output: WordPressChunk[] = [];
  let body = "";
  let bodyContainsTable = false;
  const emit = () => {
    if (!body) return;
    output.push({
      chunkIndex: output.length,
      content: `${prefix}\n${body}`,
      sectionPath: [...section.sectionPath],
    });
  };

  for (const unit of units) {
    const tableText = unit.tableHeader ? `${unit.tableHeader}\n${unit.text}` : unit.text;
    const candidate = body
      ? `${body}\n${unit.tableHeader && !body.includes(unit.tableHeader) ? `${unit.tableHeader}\n` : ""}${unit.text}`
      : tableText;
    if (candidate.length <= capacity) {
      body = candidate;
      bodyContainsTable ||= Boolean(unit.tableHeader);
      continue;
    }
    emit();
    const roomForOverlap = capacity - tableText.length - 1;
    const overlap = !bodyContainsTable && !unit.tableHeader && roomForOverlap > 0
      ? overlapTail(body, Math.min(roomForOverlap, WORDPRESS_MAX_CHUNK_OVERLAP_CHARACTERS))
      : "";
    body = overlap ? `${overlap}\n${tableText}` : tableText;
    bodyContainsTable = Boolean(unit.tableHeader);
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
    .flatMap((section) => section.blocks.flatMap((block) => block.kind === "table"
      ? [
          (block.headers?.length ?? 0) ? `Table headers: ${block.headers!.map(pipeCell).join(" | ")}` : "Table headers: (none)",
          ...(block.rows ?? []).map((row) => `Table row: ${row.map(pipeCell).join(" | ")}`),
        ]
      : [`${block.kind === "list-item" ? "- " : ""}${block.text}`]))
    .join("\n")
    .trim();
}
