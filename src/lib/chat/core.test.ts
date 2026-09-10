import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  buildGenerationRequest,
  buildSystemPrompt,
  CHAT_MODEL,
  generatePreparedChat,
  prepareChat,
  RETRIEVAL_COUNT,
  RETRIEVAL_THRESHOLD,
  type ChatDependencies,
  type GenerationRequest,
} from "./core";

const ORIGINAL_EN_PROMPT_WITHOUT_CONTEXT = `You are John Serra's personal AI assistant — a warm, knowledgeable alter ego who speaks in first person as John across all aspects of his life: his career, his writing, and his cooking.

John Serra is a business development professional with experience spanning manufacturing (patented process innovation for polystyrene foam trays), education (COVID-19 digital transformation of a language school in Istanbul), and urban mobility (parking market development in Central New York). He is passionate about using data to drive growth and solving complex, cross-industry challenges. He also cooks seriously — making fresh pasta from scratch, hosting dinners, and writing recipes that often carry a personal story.

When answering questions:
- Speak as John in first person ("I led...", "My experience includes...", "That lasagna is one of my favorites...")
- Be warm, direct, and confident — not corporate or stiff
- Draw on the context provided below when relevant
- For recipe questions, share the story behind the recipe if there is one, then invite them to view the full recipe by linking to its page — do not recite the full ingredients list or method in chat
- When linking, always use descriptive anchor text (e.g. [Lasagna Bolognese](/blog/lasagna-bolognese)) — never use generic text like "here" or "this link"
- If asked about something outside the context, answer based on what you know about John's background, or say you'd love to chat more about it directly
- Keep answers conversational and concise (2–4 paragraphs max)
- Never invent specific facts not in the context

`;

function dependencies(overrides: Partial<ChatDependencies> = {}): ChatDependencies {
  return {
    async embedQuery() { return [1, 2, 3]; },
    async matchCareerContext() { return { data: [], error: null }; },
    async generateContentStream() {
      return (async function* () { yield { text: "answer" }; })();
    },
    ...overrides,
  };
}

test("extracted English prompt remains byte-for-byte equal to the preserved original", () => {
  assert.equal(buildSystemPrompt("", "en"), ORIGINAL_EN_PROMPT_WITHOUT_CONTEXT);
  assert.equal(
    createHash("sha256").update(buildSystemPrompt("", "en")).digest("hex"),
    createHash("sha256").update(ORIGINAL_EN_PROMPT_WITHOUT_CONTEXT).digest("hex"),
  );
});

test("Turkish locale appends only the original language instruction", () => {
  const expected = ORIGINAL_EN_PROMPT_WITHOUT_CONTEXT.replace(
    "Never invent specific facts not in the context\n\n",
    "Never invent specific facts not in the context\n\nIMPORTANT: The user is browsing the Turkish version of the site. Respond in Turkish. Use a warm, conversational Turkish tone.\n\n",
  );
  assert.equal(buildSystemPrompt("", "tr"), expected);
});

test("request model, role conversion, and context framing preserve the original contract", () => {
  const request = buildGenerationRequest([
    { role: "user", content: "one" },
    { role: "assistant", content: "two" },
  ], "en", "retrieved");
  assert.deepEqual(request.contents, [
    { role: "user", parts: [{ text: "one" }] },
    { role: "model", parts: [{ text: "two" }] },
  ]);
  assert.equal(request.model, "gemini-2.5-flash");
  assert.equal(CHAT_MODEL, "gemini-2.5-flash");
  assert.deepEqual(Object.keys(request.config), ["systemInstruction"]);
  assert.match(request.config.systemInstruction, /\n<context>\nretrieved\n<\/context>$/);
});

test("ordinary production-style calls do not add optional signal arguments", async () => {
  let embedArgumentCount = 0;
  let rpcArgumentCount = 0;
  let generationArgumentCount = 0;
  const deps: ChatDependencies = {
    async embedQuery() {
      embedArgumentCount = arguments.length;
      return [1];
    },
    async matchCareerContext() {
      rpcArgumentCount = arguments.length;
      return { data: [], error: null };
    },
    async generateContentStream() {
      generationArgumentCount = arguments.length;
      return (async function* () { yield { text: "answer" }; })();
    },
  };
  const prepared = await prepareChat([{ role: "user", content: "x" }], "en", deps);
  for await (const text of generatePreparedChat(prepared, deps)) assert.equal(text, "answer");
  assert.equal(embedArgumentCount, 1);
  assert.equal(rpcArgumentCount, 1);
  assert.equal(generationArgumentCount, 1);
  assert.deepEqual(Object.keys(prepared.generationRequest.config), ["systemInstruction"]);
});

test("retrieval uses latest message, locale, threshold, count, and reports matches", async () => {
  let query = "";
  let request: unknown;
  const prepared = await prepareChat([
    { role: "user", content: "first" },
    { role: "assistant", content: "answer" },
    { role: "user", content: "latest" },
  ], "tr", dependencies({
    async embedQuery(value) { query = value; return [9]; },
    async matchCareerContext(value) {
      request = value;
      return {
        data: [{ source: "wordpress/page/54/tr", content: "body", metadata: {}, similarity: 0.7777 }],
        error: null,
      };
    },
  }));
  assert.equal(query, "latest");
  assert.deepEqual(request, {
    query_embedding: [9],
    query_locale: "tr",
    match_threshold: RETRIEVAL_THRESHOLD,
    match_count: RETRIEVAL_COUNT,
  });
  assert.equal(prepared.contextBlock, "[Source: wordpress/page/54/tr; similarity: 0.778]\nbody");
});

test("RPC-empty and RPC-error paths both preserve an empty context", async () => {
  const empty = await prepareChat([{ role: "user", content: "x" }], "en", dependencies());
  const error = await prepareChat([{ role: "user", content: "x" }], "en", dependencies({
    async matchCareerContext() { return { data: null, error: { hidden: "provider body" } }; },
  }));
  assert.equal(empty.contextBlock, "");
  assert.equal(empty.retrievalError, false);
  assert.equal(error.contextBlock, "");
  assert.equal(error.retrievalError, true);
});

test("shared generation exposes partial output and honestly permits an empty stream", async () => {
  const request: GenerationRequest = {
    model: CHAT_MODEL,
    contents: [{ role: "user", parts: [{ text: "x" }] }],
    config: { systemInstruction: "prompt" },
  };
  const partial = dependencies({
    async generateContentStream() {
      return (async function* () { yield { text: "par" }; yield { text: "tial" }; })();
    },
  });
  const pieces: string[] = [];
  for await (const piece of generatePreparedChat({
    contentLocale: "en",
    contextBlock: "",
    matches: [],
    retrievalError: false,
    generationRequest: request,
  }, partial)) pieces.push(piece);
  assert.equal(pieces.join(""), "partial");

  const empty = dependencies({ async generateContentStream() { return (async function* () {})(); } });
  const emptyPieces: string[] = [];
  for await (const piece of generatePreparedChat({
    contentLocale: "en",
    contextBlock: "",
    matches: [],
    retrievalError: false,
    generationRequest: request,
  }, empty)) emptyPieces.push(piece);
  assert.deepEqual(emptyPieces, []);
});
