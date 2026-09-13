import assert from "node:assert/strict";
import test from "node:test";
import { streamModelSelectedChat } from "./tool-calling";
import { createChatToolRegistry, ToolDispatchError, type ChatToolDataSources } from "./tools";
import type { ChatDependencies, ChatStreamChunk, GenerationRequest } from "./core";

const sources: ChatToolDataSources = {
  async searchKnowledge() { return []; },
  async loadCv() {
    return {
      schema_version: "1.0.0", document_id: "john-serra", title: "CV", locale: "en", visibility: "public",
      document_type: "cv", authority: "reviewed_public_cv", canonical_url: "https://johnserra.com/cv/john-serra.en.md", sections: [],
    };
  },
  async getProject() { return null; },
  async listArticles() { return []; },
  async getContactOptions() { return []; },
};

function dependencies(factory: (request: GenerationRequest) => AsyncIterable<ChatStreamChunk>): ChatDependencies {
  return {
    async embedQuery() { return []; },
    async matchCareerContext() { return { data: [], error: null }; },
    async generateContentStream(request) { return factory(request); },
  };
}

async function collect(stream: AsyncIterable<ChatStreamChunk>): Promise<ChatStreamChunk[]> {
  const chunks: ChatStreamChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

test("direct no-tool answers execute zero tools and preserve the stream framing", async () => {
  let providerCalls = 0;
  let handlerCalls = 0;
  const registry = createChatToolRegistry({
    ...sources,
    async getContactOptions() { handlerCalls += 1; return []; },
  });
  const result = await collect(streamModelSelectedChat(
    [{ role: "user", content: "Hello" }],
    "en",
    dependencies(async function* () {
      providerCalls += 1;
      yield { text: "Hello!" };
    }),
    registry,
    new AbortController().signal,
    { correlationId: "123e4567-e89b-42d3-a456-426614174000" },
  ));
  assert.equal(providerCalls, 1);
  assert.equal(handlerCalls, 0);
  assert.equal(result.map((chunk) => chunk.text ?? "").join(""), "Hello!");
  assert.ok(result.every((chunk) => chunk.toolCallCount === 0));
});

test("a selected tool is executed once and its matching function response reaches final streamed generation", async () => {
  const requests: GenerationRequest[] = [];
  let handlerCalls = 0;
  const registry = createChatToolRegistry({
    ...sources,
    async getContactOptions() {
      handlerCalls += 1;
      return [{ label: "Contact form", url: "https://johnserra.com/contact", description: "Public form." }];
    },
  });
  const result = await collect(streamModelSelectedChat(
    [{ role: "user", content: "How can I contact John?" }],
    "en",
    dependencies(async function* (request) {
      requests.push(request);
      if (request.config.tools) {
        yield {
          modelContent: {
            role: "model",
            parts: [{ functionCall: { id: "call-1", name: "get_contact_options", args: { locale: "en" } } }],
          },
          functionCalls: [{ id: "call-1", name: "get_contact_options", args: { locale: "en" } }],
        };
        return;
      }
      yield { text: "Use the public contact routes.", finishReason: "STOP" };
    }),
    registry,
    new AbortController().signal,
    { correlationId: "123e4567-e89b-42d3-a456-426614174000" },
  ));
  assert.equal(handlerCalls, 1);
  assert.equal(requests.length, 2);
  const responsePart = requests[1].contents.at(-1)?.parts?.[0]?.functionResponse;
  assert.equal(responsePart?.id, "call-1");
  assert.equal(responsePart?.name, "get_contact_options");
  assert.equal(requests[1].config.toolConfig?.functionCallingConfig?.mode, "NONE");
  assert.equal(requests[1].config.automaticFunctionCalling?.disable, true);
  assert.equal(result.at(-1)?.toolCallCount, 1);
  assert.equal(result.map((chunk) => chunk.text ?? "").join(""), "Use the public contact routes.");
});

test("tool selection exposes usage metadata without leaking selection text or calls", async () => {
  const registry = createChatToolRegistry(sources);
  const result = await collect(streamModelSelectedChat(
    [{ role: "user", content: "How can I contact John?" }],
    "en",
    dependencies(async function* (request) {
      if (request.config.tools) {
        yield {
          text: "selection text must stay internal",
          usageMetadata: { promptTokenCount: 10, totalTokenCount: 10 },
          functionCalls: [{ id: "call-1", name: "get_contact_options", args: { locale: "en" } }],
        };
        return;
      }
      yield { text: "final answer", usageMetadata: { promptTokenCount: 20, totalTokenCount: 20 } };
    }),
    registry,
    new AbortController().signal,
    { correlationId: "123e4567-e89b-42d3-a456-426614174000" },
  ));
  assert.equal(result.map((chunk) => chunk.text ?? "").join(""), "final answer");
  assert.ok(result.some((chunk) => chunk.usageTurn === "selection" && chunk.usageMetadata?.promptTokenCount === 10));
  assert.ok(result.every((chunk) => !chunk.functionCalls));
  assert.equal(result.some((chunk) => chunk.text === "selection text must stay internal"), false);
});

test("an over-limit selected batch fails before any handler runs", async () => {
  let handlerCalls = 0;
  let providerCalls = 0;
  const registry = createChatToolRegistry({
    ...sources,
    async getContactOptions() {
      handlerCalls += 1;
      return [];
    },
  });
  await assert.rejects(
    collect(streamModelSelectedChat(
      [{ role: "user", content: "contact" }],
      "en",
      dependencies(async function* (request) {
        providerCalls += 1;
        if (request.config.tools) {
          yield { functionCalls: Array.from({ length: 6 }, (_, index) => ({
            id: `call-${index}`,
            name: "get_contact_options",
            args: { locale: "en" },
          })) };
        }
      }),
      registry,
      new AbortController().signal,
      { correlationId: "123e4567-e89b-42d3-a456-426614174000" },
    )),
    (error: unknown) => error instanceof ToolDispatchError && error.category === "call_limit",
  );
  assert.equal(handlerCalls, 0);
  assert.equal(providerCalls, 1);
});

test("final text is yielded before the final provider stream completes", async () => {
  const registry = createChatToolRegistry(sources);
  let finalProviderFinished = false;
  let releaseFinalProvider!: () => void;
  const finalProviderPaused = new Promise<void>((resolve) => { releaseFinalProvider = resolve; });
  const iterator = streamModelSelectedChat(
    [{ role: "user", content: "contact" }],
    "en",
    dependencies(async function* (request) {
      if (request.config.tools) {
        yield { functionCalls: [{ id: "call-1", name: "get_contact_options", args: { locale: "en" } }] };
        return;
      }
      yield { text: "first final chunk" };
      await finalProviderPaused;
      finalProviderFinished = true;
    }),
    registry,
    new AbortController().signal,
    { correlationId: "123e4567-e89b-42d3-a456-426614174000" },
  )[Symbol.asyncIterator]();

  let next = await iterator.next();
  while (!next.done && !next.value.text) next = await iterator.next();
  assert.equal(next.value?.text, "first final chunk");
  assert.equal(finalProviderFinished, false);
  releaseFinalProvider();
  while (!(await iterator.next()).done) {
    // Drain the final stream after proving its first chunk was observable.
  }
  assert.equal(finalProviderFinished, true);
});

test("unexpected final follow-on calls fail safely and do not become answer text", async () => {
  const registry = createChatToolRegistry(sources);
  await assert.rejects(
    collect(streamModelSelectedChat(
      [{ role: "user", content: "contact" }],
      "en",
      dependencies(async function* (request) {
        if (request.config.tools) {
          yield { functionCalls: [{ id: "call-1", name: "get_contact_options", args: { locale: "en" } }] };
        } else {
          yield { text: "partial", functionCalls: [{ id: "call-2", name: "get_contact_options", args: { locale: "en" } }] };
        }
      }),
      registry,
      new AbortController().signal,
      { correlationId: "123e4567-e89b-42d3-a456-426614174000" },
    )),
    (error: unknown) => error instanceof ToolDispatchError && error.category === "unexpected_follow_on",
  );
});

test("provider failures remain failures for the route to classify safely", async () => {
  const registry = createChatToolRegistry(sources);
  await assert.rejects(
    collect(streamModelSelectedChat(
      [{ role: "user", content: "hello" }],
      "en",
      dependencies(async function* () { throw new Error("provider secret marker"); }),
      registry,
      new AbortController().signal,
      { correlationId: "123e4567-e89b-42d3-a456-426614174000" },
    )),
    /provider secret marker/,
  );
});
