import assert from "node:assert/strict";
import test from "node:test";
import { streamBoundedEvidenceAgent, type AgentTraceSummary } from "./agent-loop";
import { createChatToolRegistry, type ChatToolDataSources } from "./tools";
import type { ChatDependencies, ChatStreamChunk, GenerationRequest } from "./core";

const correlationId = "123e4567-e89b-42d3-a456-426614174000";

const sources: ChatToolDataSources = {
  async searchKnowledge() {
    return [{ title: "CareerTalkLab", excerpt: "A documented public project.", url: "https://johnserra.com/projects/careertalklab" }];
  },
  async loadCv() {
    return {
      schema_version: "1.0.0", document_id: "john-serra", title: "Reviewed CV", locale: "en", visibility: "public",
      document_type: "cv", authority: "reviewed_public_cv", canonical_url: "https://johnserra.com/cv/john-serra.en.md", sections: [],
    };
  },
  async getProject() { return null; },
  async listArticles() { return []; },
  async getContactOptions() { return []; },
};

function registry(overrides: Partial<ChatToolDataSources> = {}) {
  return createChatToolRegistry({ ...sources, ...overrides });
}

function deps(factory: (request: GenerationRequest, call: number) => AsyncIterable<ChatStreamChunk> | Promise<AsyncIterable<ChatStreamChunk>>): ChatDependencies {
  let call = 0;
  return {
    async embedQuery() { return []; },
    async matchCareerContext() { return { data: [], error: null }; },
    async generateContentStream(request, signal) {
      void signal;
      return factory(request, ++call);
    },
  };
}

async function collect(stream: AsyncIterable<ChatStreamChunk>) {
  const chunks: ChatStreamChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

function answer(chunks: ChatStreamChunk[]): string {
  return chunks.map((chunk) => chunk.text ?? "").join("");
}

function verifier(request: GenerationRequest, response: string): AsyncIterable<ChatStreamChunk> {
  if (request.config.tools) {
    return (async function* () {
      yield { functionCalls: [{ id: "search", name: "search_knowledge", args: { query: "project", locale: "en" } }] };
    })();
  }
  const properties = (request.config.responseJsonSchema as { properties?: Record<string, unknown> } | undefined)?.properties;
  if (properties && "status" in properties) {
    return (async function* () { yield { text: JSON.stringify({ status: "sufficient", query: null }) }; })();
  }
  if (properties && "decision" in properties) {
    return (async function* () { yield { text: response }; })();
  }
  return (async function* () { yield { text: "Internal draft with [CareerTalkLab](https://johnserra.com/projects/careertalklab)." }; })();
}

test("greetings take the zero-tool direct path and emit one terminal stop reason", async () => {
  let providerCalls = 0;
  const traces: AgentTraceSummary[] = [];
  const result = await collect(streamBoundedEvidenceAgent(
    [{ role: "user", content: "Hello!" }], "en",
    deps(async function* (request) {
      providerCalls += 1;
      assert.equal(request.config.tools, undefined);
      yield { text: "Hello there!" };
    }), registry(), new AbortController().signal,
    { correlationId, onAgentTrace: (trace) => traces.push(trace) },
  ));
  assert.equal(providerCalls, 1);
  assert.equal(answer(result), "Hello there!");
  assert.deepEqual(traces.map((trace) => trace.stopReason), ["direct_no_tools"]);
  assert.equal(traces[0].acceptedToolExecutions, 0);
});

test("direct success records its trace before a consumer closes after the final chunk", async () => {
  const traces: AgentTraceSummary[] = [];
  const iterator = streamBoundedEvidenceAgent(
    [{ role: "user", content: "Hello!" }], "en",
    deps(async function* () { yield { text: "Hello there!" }; }), registry(), new AbortController().signal,
    { correlationId, onAgentTrace: (trace) => traces.push(trace) },
  );
  const first = await iterator.next();
  assert.equal(first.done, false);
  assert.equal(first.value?.text, "Hello there!");
  await iterator.return(undefined);
  assert.equal(traces.length, 1);
  assert.equal(traces[0].stopReason, "direct_no_tools");
});

test("retrieval selection preserves the bounded planner instruction when applying tool config", async () => {
  let selectionRequest: GenerationRequest | undefined;
  await collect(streamBoundedEvidenceAgent(
    [{ role: "user", content: "Find the relevant public project evidence." }], "en",
    deps((request) => {
      selectionRequest = request;
      return (async function* () {})();
    }), registry(), new AbortController().signal,
    { correlationId },
  ));
  assert.ok(selectionRequest);
  assert.match(selectionRequest.config.systemInstruction, /You are an internal bounded retrieval planner\./u);
  assert.ok(selectionRequest.config.tools);
  assert.equal(selectionRequest.config.automaticFunctionCalling?.disable, true);
});

test("sufficient evidence is inspected, drafted, verified, and only the verified answer is emitted", async () => {
  const traces: AgentTraceSummary[] = [];
  const result = await collect(streamBoundedEvidenceAgent(
    [{ role: "user", content: "Tell me about the project." }], "en",
    deps((request) => verifier(request, JSON.stringify({
      decision: "accept", finalAnswer: "Verified project answer [CareerTalkLab](https://johnserra.com/projects/careertalklab).",
      supportedClaims: 1, qualifiedClaims: 0, removedClaims: 0,
    }))), registry(), new AbortController().signal,
    { correlationId, onAgentTrace: (trace) => traces.push(trace) },
  ));
  assert.equal(answer(result), "Verified project answer [CareerTalkLab](https://johnserra.com/projects/careertalklab).");
  assert.equal(answer(result).includes("Internal draft"), false);
  assert.deepEqual(traces.map((trace) => trace.stopReason), ["supported_evidence"]);
  assert.equal(traces[0].verificationPasses, 1);
  assert.equal(traces[0].draftCreated, true);
});

test("verified success records its trace before a consumer closes after the final chunk", async () => {
  const traces: AgentTraceSummary[] = [];
  const finalAnswer = "Verified project answer [CareerTalkLab](https://johnserra.com/projects/careertalklab).";
  const iterator = streamBoundedEvidenceAgent(
    [{ role: "user", content: "Tell me about the project." }], "en",
    deps((request) => verifier(request, JSON.stringify({
      decision: "accept", finalAnswer, supportedClaims: 1, qualifiedClaims: 0, removedClaims: 0,
    }))), registry(), new AbortController().signal,
    { correlationId, onAgentTrace: (trace) => traces.push(trace) },
  );
  const first = await iterator.next();
  assert.equal(first.done, false);
  assert.equal(first.value?.text, finalAnswer);
  await iterator.return(undefined);
  assert.equal(traces.length, 1);
  assert.equal(traces[0].stopReason, "supported_evidence");
});

test("the inspector can explicitly require one second retrieval round, but never a third", async () => {
  let selections = 0;
  const traces: AgentTraceSummary[] = [];
  const result = await collect(streamBoundedEvidenceAgent(
    [{ role: "user", content: "Find complementary evidence." }], "en",
    deps((request) => {
      if (request.config.tools) {
        selections += 1;
        return (async function* () {
          yield { functionCalls: [{ id: `search-${selections}`, name: "search_knowledge", args: { query: `query-${selections}`, locale: "en" } }] };
        })();
      }
      const properties = (request.config.responseJsonSchema as { properties?: Record<string, unknown> } | undefined)?.properties;
      if (properties && "status" in properties) {
        return (async function* () { yield { text: JSON.stringify({ status: selections === 1 ? "insufficient" : "sufficient", query: "rewritten query" }) }; })();
      }
      if (properties && "decision" in properties) {
        return (async function* () { yield { text: JSON.stringify({ decision: "accept", finalAnswer: "Verified [source](https://johnserra.com/projects/careertalklab).", supportedClaims: 1, qualifiedClaims: 0, removedClaims: 0 }) }; })();
      }
      return (async function* () { yield { text: "Draft." }; })();
    }), registry(), new AbortController().signal,
    { correlationId, onAgentTrace: (trace) => traces.push(trace) },
  ));
  assert.equal(answer(result), "Verified [source](https://johnserra.com/projects/careertalklab).");
  assert.equal(traces[0].retrievalRounds, 2);
  assert.equal(selections, 2);
});

test("partial tool failure keeps successful evidence; all failures stop without drafting", async () => {
  const partial = await collect(streamBoundedEvidenceAgent(
    [{ role: "user", content: "Use the public evidence." }], "en",
    deps((request) => {
      if (request.config.tools) return (async function* () { yield { functionCalls: [
        { id: "good", name: "search_knowledge", args: { query: "project", locale: "en" } },
        { id: "bad", name: "get_cv_timeline", args: { locale: "en" } },
      ] }; })();
      return verifier(request, JSON.stringify({ decision: "accept", finalAnswer: "Verified [source](https://johnserra.com/projects/careertalklab).", supportedClaims: 1, qualifiedClaims: 1, removedClaims: 0 }));
    }), registry({ async loadCv() { throw new Error("private provider marker"); } }), new AbortController().signal,
    { correlationId },
  ));
  assert.equal(answer(partial), "Verified [source](https://johnserra.com/projects/careertalklab).");

  const traces: AgentTraceSummary[] = [];
  const failed = await collect(streamBoundedEvidenceAgent(
    [{ role: "user", content: "Use unavailable sources." }], "en",
    deps((request) => request.config.tools
      ? (async function* () { yield { functionCalls: [{ id: "bad", name: "search_knowledge", args: { query: "x", locale: "en" } }] }; })()
      : (async function* () { yield { text: "must not draft" }; })()),
    registry({ async searchKnowledge() { throw new Error("provider marker"); } }), new AbortController().signal,
    { correlationId, onAgentTrace: (trace) => traces.push(trace) },
  ));
  assert.equal(answer(failed).includes("must not draft"), false);
  assert.equal(traces[0].stopReason, "all_tools_failure");
});

test("malformed verifier output fails closed and unsupported drafts are never emitted", async () => {
  const result = await collect(streamBoundedEvidenceAgent(
    [{ role: "user", content: "Answer from sources." }], "en",
    deps((request) => verifier(request, "not-json")), registry(), new AbortController().signal,
    { correlationId },
  ));
  assert.equal(answer(result).includes("Internal draft"), false);
  assert.match(answer(result), /only confirm/i);
});

test("inspector provider failure degrades to a safe qualified answer", async () => {
  const traces: AgentTraceSummary[] = [];
  const result = await collect(streamBoundedEvidenceAgent(
    [{ role: "user", content: "Inspect this evidence." }], "en",
    deps((request) => {
      if (request.config.tools) return (async function* () { yield { functionCalls: [{ id: "search", name: "search_knowledge", args: { query: "project", locale: "en" } }] }; })();
      const properties = (request.config.responseJsonSchema as { properties?: Record<string, unknown> } | undefined)?.properties;
      if (properties && "status" in properties) throw new Error("inspector provider marker");
      return (async function* () { yield { text: "must not draft" }; })();
    }), registry(), new AbortController().signal,
    { correlationId, onAgentTrace: (trace) => traces.push(trace) },
  ));
  assert.match(answer(result), /only confirm/i);
  assert.equal(traces[0].stopReason, "inspection_failure");
});

test("raw batches exceeding the remaining cap fail before dispatch", async () => {
  let handlers = 0;
  const traces: AgentTraceSummary[] = [];
  const result = await collect(streamBoundedEvidenceAgent(
    [{ role: "user", content: "Need several sources." }], "en",
    deps((request) => request.config.tools ? (async function* () {
      yield { functionCalls: [
        { id: "a", name: "search_knowledge", args: { query: "a", locale: "en" } },
        { id: "b", name: "search_knowledge", args: { query: "b", locale: "en" } },
        { id: "c", name: "search_knowledge", args: { query: "c", locale: "en" } },
        { id: "d", name: "search_knowledge", args: { query: "d", locale: "en" } },
      ] };
    })() : (async function* () { yield { text: "must not draft" }; })()),
    registry({ async searchKnowledge() { handlers += 1; return []; } }), new AbortController().signal,
    { correlationId, onAgentTrace: (trace) => traces.push(trace) },
  ));
  assert.equal(handlers, 0);
  assert.equal(traces[0].stopReason, "budget_exceeded");
  assert.equal(answer(result).includes("must not draft"), false);
});

test("cancellation propagates and records exactly one terminal cancellation trace", async () => {
  const controller = new AbortController();
  controller.abort();
  const traces: AgentTraceSummary[] = [];
  await assert.rejects(
    collect(streamBoundedEvidenceAgent(
      [{ role: "user", content: "cancel" }], "en",
      deps(async function* () { yield { text: "not emitted" }; }), registry(), controller.signal,
      { correlationId, onAgentTrace: (trace) => traces.push(trace) },
    )),
  );
  assert.deepEqual(traces.map((trace) => trace.stopReason), ["cancellation"]);
});

test("an overall deadline records deadline_exceeded rather than an extra cancellation", async () => {
  const controller = new AbortController();
  const deadline = new Error("deadline");
  deadline.name = "ChatDeadlineError";
  controller.abort(deadline);
  const traces: AgentTraceSummary[] = [];
  await assert.rejects(
    collect(streamBoundedEvidenceAgent(
      [{ role: "user", content: "deadline" }], "en",
      deps(async function* () { yield { text: "not emitted" }; }), registry(), controller.signal,
      { correlationId, onAgentTrace: (trace) => traces.push(trace) },
    )),
  );
  assert.deepEqual(traces.map((trace) => trace.stopReason), ["deadline_exceeded"]);
});
