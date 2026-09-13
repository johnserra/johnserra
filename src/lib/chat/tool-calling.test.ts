import assert from "node:assert/strict";
import test from "node:test";
import { streamModelSelectedChat, type MultiToolTrace } from "./tool-calling";
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

test("a throwing trace callback cannot alter the response or duplicate the terminal trace", async () => {
  let traceCalls = 0;
  const result = await collect(streamModelSelectedChat(
    [{ role: "user", content: "Hello" }],
    "en",
    dependencies(async function* (request) {
      if (request.config.tools) {
        yield { functionCalls: [{ id: "call-1", name: "get_contact_options", args: { locale: "en" } }] };
        return;
      }
      yield { text: "Still answered." };
    }),
    createChatToolRegistry(sources),
    new AbortController().signal,
    {
      correlationId: "123e4567-e89b-42d3-a456-426614174000",
      onMultiToolTrace() {
        traceCalls += 1;
        throw new Error("telemetry failure");
      },
    },
  ));
  assert.equal(result.map((chunk) => chunk.text ?? "").join(""), "Still answered.");
  assert.equal(traceCalls, 1);
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

test("the AI product-role demo selects complementary public project and CV tools", async () => {
  const calls: string[] = [];
  const traces: unknown[] = [];
  const registry = createChatToolRegistry({
    ...sources,
    async searchKnowledge() {
      calls.push("search_knowledge");
      return [{ title: "CareerTalkLab", excerpt: "Public project evidence.", url: "https://johnserra.com/projects/careertalklab" }];
    },
    async loadCv(signal) {
      calls.push("get_cv_timeline");
      return sources.loadCv(signal);
    },
  });
  const result = await collect(streamModelSelectedChat(
    [{ role: "user", content: "Which project best fits an AI product role?" }],
    "en",
    dependencies(async function* (request) {
      if (request.config.tools) {
        yield { functionCalls: [
          { id: "project-call", name: "search_knowledge", args: { query: "AI product projects", locale: "en" } },
          { id: "cv-call", name: "get_cv_timeline", args: { locale: "en" } },
        ] };
        return;
      }
      yield { text: "CareerTalkLab is supported by the reviewed CV." };
    }),
    registry,
    new AbortController().signal,
    { correlationId: "123e4567-e89b-42d3-a456-426614174000", onMultiToolTrace: (trace) => traces.push(trace) },
  ));
  assert.deepEqual(calls, ["search_knowledge", "get_cv_timeline"]);
  assert.equal(result.at(-1)?.toolCallCount, 2);
  assert.equal((traces[0] as { uniqueExecutionCount: number }).uniqueExecutionCount, 2);
  assert.deepEqual((traces[0] as { calls: Array<{ tool: string }> }).calls.map((call) => call.tool), ["search_knowledge", "get_cv_timeline"]);
});

test("canonical duplicate calls execute once while every provider ID receives a matching response", async () => {
  let handlerCalls = 0;
  const requests: GenerationRequest[] = [];
  const traces: MultiToolTrace[] = [];
  const registry = createChatToolRegistry({
    ...sources,
    async searchKnowledge() {
      handlerCalls += 1;
      return [{ title: "Project", excerpt: "Evidence.", url: "https://johnserra.com/projects/demo" }];
    },
  });
  const result = await collect(streamModelSelectedChat(
    [{ role: "user", content: "Find project evidence." }],
    "en",
    dependencies(async function* (request) {
      requests.push(request);
      if (request.config.tools) {
        yield { functionCalls: [
          { id: "provider-a", name: "search_knowledge", args: { query: "same", locale: "en" } },
          { id: "provider-b", name: "search_knowledge", args: { locale: "en", query: "same" } },
        ] };
        return;
      }
      yield { text: "Grounded answer." };
    }),
    registry,
    new AbortController().signal,
    { correlationId: "123e4567-e89b-42d3-a456-426614174000", onMultiToolTrace: (trace) => traces.push(trace) },
  ));
  assert.equal(handlerCalls, 1);
  assert.equal(result.at(-1)?.toolCallCount, 1);
  const responses = requests[1].contents.at(-1)?.parts.map((part) => part.functionResponse).filter(Boolean) ?? [];
  assert.deepEqual(responses.map((response) => response?.id), ["provider-a", "provider-b"]);
  assert.equal(traces[0].selectedCount, 2);
  assert.equal(traces[0].uniqueExecutionCount, 1);
  assert.equal(traces[0].duplicateCount, 1);
});

test("partial tool failure preserves sibling evidence and sends only safe failure metadata", async () => {
  const requests: GenerationRequest[] = [];
  const traces: MultiToolTrace[] = [];
  const registry = createChatToolRegistry({
    ...sources,
    async searchKnowledge() {
      return [{ title: "Public project", excerpt: "Successful evidence.", url: "https://johnserra.com/projects/demo" }];
    },
    async loadCv() {
      throw new Error("provider detail must not enter the response");
    },
  });
  await collect(streamModelSelectedChat(
    [{ role: "user", content: "Compare project and CV evidence." }],
    "en",
    dependencies(async function* (request) {
      requests.push(request);
      if (request.config.tools) {
        yield { functionCalls: [
          { id: "project", name: "search_knowledge", args: { query: "project", locale: "en" } },
          { id: "cv", name: "get_cv_timeline", args: { locale: "en" } },
        ] };
        return;
      }
      yield { text: "Use the successful project evidence and acknowledge the CV is unavailable." };
    }),
    registry,
    new AbortController().signal,
    { correlationId: "123e4567-e89b-42d3-a456-426614174000", onMultiToolTrace: (trace) => traces.push(trace) },
  ));
  const responses = requests[1].contents.at(-1)?.parts.map((part) => part.functionResponse?.response) ?? [];
  assert.equal(responses.length, 2);
  assert.ok(responses.some((response) => response && "output" in response));
  const failure = responses.find((response) => response && "error" in response) as { error?: { category?: string; retryable?: boolean } } | undefined;
  assert.deepEqual(failure?.error, { type: "tool_error", category: "handler_failure", retryable: true });
  assert.equal(JSON.stringify(traces).includes("provider detail"), false);
  assert.equal(traces[0].finalStopState, "partial_evidence");
});

test("all selected tool failures stop safely without a final evidence-free model turn", async () => {
  let finalCalls = 0;
  const traces: MultiToolTrace[] = [];
  const registry = createChatToolRegistry({
    ...sources,
    async searchKnowledge() { throw new Error("search provider detail"); },
    async loadCv() { throw new Error("CV provider detail"); },
  });
  await assert.rejects(
    collect(streamModelSelectedChat(
      [{ role: "user", content: "Compare sources." }],
      "en",
      dependencies(async function* (request) {
        if (request.config.tools) {
          yield { functionCalls: [
            { id: "search", name: "search_knowledge", args: { query: "x", locale: "en" } },
            { id: "cv", name: "get_cv_timeline", args: { locale: "en" } },
          ] };
          return;
        }
        finalCalls += 1;
        yield { text: "must not answer" };
      }),
      registry,
      new AbortController().signal,
      { correlationId: "123e4567-e89b-42d3-a456-426614174000", onMultiToolTrace: (trace) => traces.push(trace) },
    )),
    (error: unknown) => error instanceof ToolDispatchError && error.category === "all_tools_failed",
  );
  assert.equal(finalCalls, 0);
  assert.equal(traces[0].finalStopState, "all_tools_failed");
  assert.equal(JSON.stringify(traces).includes("provider detail"), false);
});

test("a per-tool timeout becomes a safe sibling failure and still reaches the final turn", async () => {
  const requests: GenerationRequest[] = [];
  const traces: MultiToolTrace[] = [];
  const registry = createChatToolRegistry({
    ...sources,
    async searchKnowledge() {
      return [{ title: "Project", excerpt: "Successful sibling.", url: "https://johnserra.com/projects/demo" }];
    },
    async getContactOptions() {
      return new Promise<never>(() => {});
    },
  });
  await collect(streamModelSelectedChat(
    [{ role: "user", content: "Use project and contact evidence." }],
    "en",
    dependencies(async function* (request) {
      requests.push(request);
      if (request.config.tools) {
        yield { functionCalls: [
          { id: "project", name: "search_knowledge", args: { query: "project", locale: "en" } },
          { id: "contact", name: "get_contact_options", args: { locale: "en" } },
        ] };
        return;
      }
      yield { text: "The project evidence remains available while contact evidence is unavailable." };
    }),
    registry,
    new AbortController().signal,
    { correlationId: "123e4567-e89b-42d3-a456-426614174000", onMultiToolTrace: (trace) => traces.push(trace) },
  ));
  const responses = requests[1].contents.at(-1)?.parts.map((part) => part.functionResponse?.response) ?? [];
  assert.equal(responses.some((response) => response && "output" in response), true);
  assert.equal(responses.some((response) => {
    const error = response && "error" in response ? response.error as { category?: string } : undefined;
    return error?.category === "timeout";
  }), true);
  assert.equal(traces[0].finalStopState, "partial_evidence");
});

test("invalid sibling results degrade safely and caller cancellation aborts the batch", async () => {
  const traces: MultiToolTrace[] = [];
  const registry = createChatToolRegistry({
    ...sources,
    async searchKnowledge() { return [{ title: "bad", excerpt: "bad", url: "https://evil.example/result" }] as never; },
    async getContactOptions() { return [{ label: "Contact", url: "https://johnserra.com/contact", description: "Public." }]; },
  });
  const result = await collect(streamModelSelectedChat(
    [{ role: "user", content: "Use available sources." }],
    "en",
    dependencies(async function* (request) {
      if (request.config.tools) {
        yield { functionCalls: [
          { id: "bad", name: "search_knowledge", args: { query: "x", locale: "en" } },
          { id: "contact", name: "get_contact_options", args: { locale: "en" } },
        ] };
        return;
      }
      yield { text: "A safe sibling result remains available." };
    }),
    registry,
    new AbortController().signal,
    { correlationId: "123e4567-e89b-42d3-a456-426614174000", onMultiToolTrace: (trace) => traces.push(trace) },
  ));
  assert.equal(result.at(-1)?.toolCallCount, 1);
  assert.equal(traces[0].calls.find((call) => call.tool === "search_knowledge")?.category, "invalid_result");

  const controller = new AbortController();
  const pending = collect(streamModelSelectedChat(
    [{ role: "user", content: "cancel" }],
    "en",
    dependencies(async function* (request) {
      if (request.config.tools) {
        yield { functionCalls: [{ id: "slow", name: "search_knowledge", args: { query: "x", locale: "en" } }] };
        return;
      }
      yield { text: "not reached" };
    }),
    createChatToolRegistry({
      ...sources,
      async searchKnowledge(_args, signal) {
        await new Promise<void>((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
        return [];
      },
    }),
    controller.signal,
    { correlationId: "123e4567-e89b-42d3-a456-426614174000" },
  ));
  setTimeout(() => controller.abort(new Error("cancelled")), 5);
  await assert.rejects(pending, (error: unknown) => error instanceof ToolDispatchError && error.category === "cancelled");
});
