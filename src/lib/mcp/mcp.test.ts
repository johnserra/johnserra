import assert from "node:assert/strict";
import test from "node:test";
import type { ChatDependencies, ChatStreamChunk, GenerationRequest } from "@/lib/chat/core";
import { ChatRateLimitServiceError, hashChatIdentities } from "@/lib/chat/rate-limit";
import { createChatToolRegistry } from "@/lib/chat/tools";
import { loadRegisteredCv } from "@/lib/knowledge/cv";
import { extractPublicCitations, mapStopReasonToStatus } from "./ask-twin";
import { createMcpHttpHandlers } from "./http-handler";
import {
  MCP_CORRELATION_HEADER,
  MCP_MAX_BODY_BYTES,
  MCP_RATE_LIMIT_ASK_LIMIT,
  MCP_RATE_LIMIT_IP_LIMIT,
  MCP_RATE_LIMIT_WINDOW_SECONDS,
} from "./limits";
import {
  consumeMcpRateLimitWithRpc,
  extractMcpClientIp,
  hashMcpIdentities,
  type McpRateLimitBucket,
} from "./rate-limit";

const TEST_SECRET = "a".repeat(32);

function createMockRegistry() {
  return createChatToolRegistry({
    async searchKnowledge() {
      return [
        {
          title: "CareerTalkLab project",
          excerpt: "CareerTalkLab is an active community platform in development.",
          url: "https://johnserra.com/projects/careertalklab",
        },
      ];
    },
    async loadCv() {
      return loadRegisteredCv();
    },
    async getProject() {
      return null;
    },
    async listArticles() {
      return [];
    },
    async getContactOptions(locale) {
      const prefix = locale === "tr" ? "/tr" : "";
      return [
        {
          label: "Contact form",
          url: `https://johnserra.com${prefix}/contact`,
          description: "Public contact route.",
        },
      ];
    },
  });
}

function createGroundedChatDependencies(finalAnswer: string): ChatDependencies {
  return {
    async embedQuery() {
      throw new Error("unexpected direct embedQuery");
    },
    async matchCareerContext() {
      throw new Error("unexpected direct matchCareerContext");
    },
    async generateContentStream(request: GenerationRequest) {
      const schema = request.config.responseJsonSchema as { properties?: Record<string, unknown> } | undefined;
      if (request.config.tools) {
        return (async function* (): AsyncGenerator<ChatStreamChunk> {
          yield {
            functionCalls: [
              { id: "cv-1", name: "get_cv_timeline", args: { locale: "en" } },
              { id: "search-1", name: "search_knowledge", args: { query: "CareerTalkLab", locale: "en" } },
            ],
          };
        })();
      }
      if (schema?.properties && "status" in schema.properties) {
        return (async function* (): AsyncGenerator<ChatStreamChunk> {
          yield { text: JSON.stringify({ status: "sufficient", query: null }) };
        })();
      }
      if (schema?.properties && "decision" in schema.properties) {
        return (async function* (): AsyncGenerator<ChatStreamChunk> {
          yield {
            text: JSON.stringify({
              decision: "accept",
              finalAnswer,
              supportedClaims: 1,
              qualifiedClaims: 0,
              removedClaims: 0,
            }),
          };
        })();
      }
      return (async function* (): AsyncGenerator<ChatStreamChunk> {
        yield { text: finalAnswer };
      })();
    },
  };
}

function postRpc(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://johnserra.com/api/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "x-vercel-forwarded-for": "203.0.113.10",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

test("initialize and tools/list expose only ask_digital_twin with readOnlyHint and strict schema", async () => {
  const buckets: McpRateLimitBucket[] = [];
  const logs: string[] = [];
  const handlers = createMcpHttpHandlers({
    chatDependencies: createGroundedChatDependencies("Unused"),
    toolRegistry: createMockRegistry(),
    consumeRateLimit: async (bucket) => {
      buckets.push(bucket);
      return { allowed: true, retryAfterSeconds: 0 };
    },
    env: { NODE_ENV: "production", VERCEL: "1" },
    logger: { info: (msg) => logs.push(msg) },
  });

  const initRes = await handlers.POST(
    postRpc({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0.0" },
      },
    }),
  );
  assert.equal(initRes.status, 200);
  assert.ok(initRes.headers.get(MCP_CORRELATION_HEADER));
  const initJson = (await initRes.json()) as { result: { serverInfo: { name: string } } };
  assert.equal(initJson.result.serverInfo.name, "johnserra-digital-twin");

  const listRes = await handlers.POST(
    postRpc({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    }, { Accept: "application/json" }),
  );
  assert.equal(listRes.status, 200);
  const listJson = (await listRes.json()) as {
    result: {
      tools: Array<{
        name: string;
        inputSchema: { additionalProperties?: boolean; required?: string[] };
        annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
      }>;
    };
  };
  assert.equal(listJson.result.tools.length, 1);
  const [tool] = listJson.result.tools;
  assert.equal(tool.name, "ask_digital_twin");
  assert.equal(tool.annotations?.readOnlyHint, true);
  assert.equal(tool.annotations?.destructiveHint, false);
  assert.equal(tool.inputSchema.additionalProperties, false);
  assert.deepEqual(tool.inputSchema.required, ["question"]);
  assert.deepEqual(buckets, ["protocol", "protocol"]);
});

test("tools/call ask_digital_twin returns verified EN/TR cited answers and privacy-safe logs", async () => {
  const enAnswer = "John Serra's [public CV](https://johnserra.com/cv/john-serra.en.md) documents his work on [CareerTalkLab](https://johnserra.com/projects/careertalklab).";
  const trAnswer = "John Serra'nın [kamuya açık özgeçmişi](https://johnserra.com/cv/john-serra.en.md) deneyimlerini belgeliyor.";
  const buckets: McpRateLimitBucket[] = [];
  const logs: string[] = [];

  for (const [locale, expectedAnswer, secretQuestion] of [
    ["en", enAnswer, "SECRET_QUERY_TOKEN_EN what did John build?"],
    ["tr", trAnswer, "SECRET_QUERY_TOKEN_TR John neler geliştirdi?"],
  ] as const) {
    const handlers = createMcpHttpHandlers({
      chatDependencies: createGroundedChatDependencies(expectedAnswer),
      toolRegistry: createMockRegistry(),
      consumeRateLimit: async (bucket) => {
        buckets.push(bucket);
        return { allowed: true, retryAfterSeconds: 0 };
      },
      env: { NODE_ENV: "production", VERCEL: "1" },
      logger: { info: (msg) => logs.push(msg) },
    });

    const res = await handlers.POST(
      postRpc({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "ask_digital_twin",
          arguments: { question: secretQuestion, locale },
        },
      }),
    );
    assert.equal(res.status, 200);
    const payload = (await res.json()) as {
      result: {
        isError?: boolean;
        content: Array<{ type: string; text: string }>;
        structuredContent: {
          answer: string;
          locale: string;
          status: string;
          citations: Array<{ title: string; url: string }>;
          disclaimer: string;
        };
      };
    };

    assert.notEqual(payload.result.isError, true);
    assert.equal(payload.result.content[0]?.text, expectedAnswer);
    assert.equal(payload.result.structuredContent.answer, expectedAnswer);
    assert.equal(payload.result.structuredContent.locale, locale);
    assert.equal(payload.result.structuredContent.status, "supported");
    assert.ok(payload.result.structuredContent.citations.length >= 1);
    assert.ok(payload.result.structuredContent.disclaimer.length > 0);
  }

  assert.deepEqual(buckets, ["ask", "ask"]);
  const completionLogs = logs
    .map((line) => JSON.parse(line) as Record<string, unknown>)
    .filter((entry) => entry.event === "mcp_request_completed");
  assert.equal(completionLogs.length, 2);
  for (const line of logs) {
    assert.doesNotMatch(line, /SECRET_QUERY_TOKEN|johnserra\.com|203\.0\.113\.10|CareerTalkLab/);
  }
});

test("rejects unknown arguments, empty questions, and invalid locales cleanly", async () => {
  const handlers = createMcpHttpHandlers({
    chatDependencies: createGroundedChatDependencies("Unused"),
    toolRegistry: createMockRegistry(),
    consumeRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }),
    env: { NODE_ENV: "production", VERCEL: "1" },
    logger: { info: () => {} },
  });

  for (const badArgs of [
    { question: "Hi", locale: "en", extraField: true },
    { question: "   ", locale: "en" },
    { question: "Hi", locale: "fr" },
  ]) {
    const res = await handlers.POST(
      postRpc({
        jsonrpc: "2.0",
        id: 10,
        method: "tools/call",
        params: { name: "ask_digital_twin", arguments: badArgs },
      }),
    );
    const body = (await res.json()) as { error?: { code: number }; result?: { isError?: boolean } };
    assert.ok(body.error || body.result?.isError === true);
  }
});

test("enforces HTTP 405, 204 CORS, 415, 413, 400, 429, and 503 fail-closed boundaries", async () => {
  const handlers = createMcpHttpHandlers({
    chatDependencies: createGroundedChatDependencies("Unused"),
    toolRegistry: createMockRegistry(),
    consumeRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }),
    env: { NODE_ENV: "production", VERCEL: "1" },
    logger: { info: () => {} },
  });

  const getRes = await handlers.GET();
  assert.equal(getRes.status, 405);
  assert.equal(getRes.headers.get("Allow"), "POST, OPTIONS");

  const delRes = await handlers.DELETE();
  assert.equal(delRes.status, 405);

  const optRes = await handlers.OPTIONS();
  assert.equal(optRes.status, 204);
  assert.equal(optRes.headers.get("Access-Control-Allow-Methods"), "POST, OPTIONS");

  const wrongTypeRes = await handlers.POST(
    new Request("https://johnserra.com/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "text/plain", "x-vercel-forwarded-for": "203.0.113.10" },
      body: "{}",
    }),
  );
  assert.equal(wrongTypeRes.status, 415);

  const oversizedRes = await handlers.POST(
    postRpc("x".repeat(MCP_MAX_BODY_BYTES + 1)),
  );
  assert.equal(oversizedRes.status, 413);

  const invalidJsonRes = await handlers.POST(postRpc("{not-json"));
  assert.equal(invalidJsonRes.status, 400);

  const missingIpRes = await handlers.POST(
    new Request("https://johnserra.com/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
    }),
  );
  assert.equal(missingIpRes.status, 503);

  const rateLimitedHandlers = createMcpHttpHandlers({
    chatDependencies: createGroundedChatDependencies("Unused"),
    toolRegistry: createMockRegistry(),
    consumeRateLimit: async () => ({ allowed: false, retryAfterSeconds: 42 }),
    env: { NODE_ENV: "production", VERCEL: "1" },
    logger: { info: () => {} },
  });
  const limitedRes = await rateLimitedHandlers.POST(postRpc({ jsonrpc: "2.0", id: 1, method: "ping" }));
  assert.equal(limitedRes.status, 429);
  assert.equal(limitedRes.headers.get("Retry-After"), "42");

  const unavailableHandlers = createMcpHttpHandlers({
    chatDependencies: createGroundedChatDependencies("Unused"),
    toolRegistry: createMockRegistry(),
    consumeRateLimit: async () => {
      throw new ChatRateLimitServiceError();
    },
    env: { NODE_ENV: "production", VERCEL: "1" },
    logger: { info: () => {} },
  });
  const unavailableRes = await unavailableHandlers.POST(postRpc({ jsonrpc: "2.0", id: 1, method: "ping" }));
  assert.equal(unavailableRes.status, 503);
});

test("model deadline timeouts return safe MCP tool errors without leaking internals", async () => {
  const slowDependencies: ChatDependencies = {
    async embedQuery() {
      throw new Error("unexpected");
    },
    async matchCareerContext() {
      throw new Error("unexpected");
    },
    async generateContentStream() {
      return (async function* (): AsyncGenerator<ChatStreamChunk> {
        await new Promise(() => {});
        yield {};
      })();
    },
  };
  const handlers = createMcpHttpHandlers({
    chatDependencies: slowDependencies,
    toolRegistry: createMockRegistry(),
    consumeRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }),
    env: { NODE_ENV: "production", VERCEL: "1" },
    deadlineMs: 25,
    logger: { info: () => {} },
  });

  const res = await handlers.POST(
    postRpc({
      jsonrpc: "2.0",
      id: 99,
      method: "tools/call",
      params: { name: "ask_digital_twin", arguments: { question: "Summarize CareerTalkLab" } },
    }),
  );
  assert.equal(res.status, 200);
  const payload = (await res.json()) as {
    result: { isError?: boolean; content: Array<{ text: string }> };
  };
  assert.equal(payload.result.isError, true);
  assert.match(payload.result.content[0]?.text ?? "", /took too long/i);
});

test("MCP HMAC rate-limit identities are isolated from browser chat identities and apply bucket bounds", async () => {
  const ip = "203.0.113.10";
  const browser = hashChatIdentities(TEST_SECRET, "123e4567-e89b-42d3-a456-426614174000", ip);
  const mcpAsk = hashMcpIdentities(TEST_SECRET, "ask", ip);
  const mcpProtocol = hashMcpIdentities(TEST_SECRET, "protocol", ip);

  assert.match(mcpAsk.bucketHash, /^[0-9a-f]{64}$/);
  assert.match(mcpAsk.ipHash, /^[0-9a-f]{64}$/);
  assert.notEqual(mcpAsk.ipHash, browser.ipHash);
  assert.notEqual(mcpAsk.bucketHash, mcpProtocol.bucketHash);

  let captured: Record<string, unknown> | null = null;
  const result = await consumeMcpRateLimitWithRpc(
    "ask",
    ip,
    async (args) => {
      captured = args;
      return { data: [{ allowed: true, retry_after_seconds: 0 }], error: null };
    },
    { secret: TEST_SECRET },
  );
  assert.deepEqual(result, { allowed: true, retryAfterSeconds: 0 });
  assert.deepEqual(captured, {
    p_session_hash: mcpAsk.bucketHash,
    p_ip_hash: mcpAsk.ipHash,
    p_window_seconds: MCP_RATE_LIMIT_WINDOW_SECONDS,
    p_session_limit: MCP_RATE_LIMIT_ASK_LIMIT,
    p_ip_limit: MCP_RATE_LIMIT_IP_LIMIT,
  });

  assert.equal(extractMcpClientIp(new Headers(), { NODE_ENV: "production", VERCEL: "1" }), null);
  assert.equal(extractMcpClientIp(new Headers(), { NODE_ENV: "development" }), "127.0.0.1");
});

test("extractPublicCitations keeps only allowlisted public URLs and maps stop reasons", () => {
  const citations = extractPublicCitations(
    "See [CV](https://johnserra.com/cv/john-serra.en.md), [Evil](https://evil.example/x), and [LinkedIn](https://linkedin.com/in/johnserra).",
  );
  assert.deepEqual(citations, [
    { title: "CV", url: "https://johnserra.com/cv/john-serra.en.md" },
    { title: "LinkedIn", url: "https://linkedin.com/in/johnserra" },
  ]);
  assert.equal(mapStopReasonToStatus("supported_evidence"), "supported");
  assert.equal(mapStopReasonToStatus("qualified_completion"), "qualified");
  assert.equal(mapStopReasonToStatus("static_completion"), "direct");
  assert.equal(mapStopReasonToStatus("verifier_failure"), "insufficient");
});
