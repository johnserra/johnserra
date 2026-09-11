import assert from "node:assert/strict";
import test from "node:test";
import type { ChatMessage } from "./core";
import { buildGenerationRequest } from "./core";
import {
  createGeminiRewriteAdapter,
  needsRewrite,
  rewriteQuery,
  REWRITE_HISTORY_LIMIT,
  REWRITE_MAX_MESSAGE_CHARS,
  REWRITE_MAX_OUTPUT_CHARS,
  REWRITE_MAX_OUTPUT_TOKENS,
  REWRITE_MAX_PROMPT_CHARS,
  type RewriteAdapter,
  type GeminiGenerateContent,
} from "./rewrite";

function conversation(): ChatMessage[] {
  return [
    { role: "user", content: "Tell me about CareerTalkLab." },
    { role: "assistant", content: "[FIXED] CareerTalkLab is a platform for career conversation practice." },
    { role: "user", content: "What technology did he use for it?" },
  ];
}

function fakeAdapter(response: string): RewriteAdapter {
  return {
    async rewrite() { return response; },
  };
}

function delayedAdapter(delayMs: number, response = "rewritten"): RewriteAdapter {
  return {
    async rewrite(_conv, _locale, signal) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, delayMs);
        signal?.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason ?? new Error("aborted")); }, { once: true });
      });
      return response;
    },
  };
}

test("needsRewrite returns false for single-turn and true for multi-turn", () => {
  assert.equal(needsRewrite([{ role: "user", content: "hello" }]), false);
  assert.equal(needsRewrite([
    { role: "user", content: "first" },
    { role: "assistant", content: "answer" },
    { role: "user", content: "What did he do there?" },
  ]), true);
});

test("needsRewrite skips an explicit standalone topic switch but rewrites referential follow-ups", async () => {
  let calls = 0;
  const adapter: RewriteAdapter = {
    async rewrite() {
      calls += 1;
      return "What technology was used for CareerTalkLab?";
    },
  };
  const history = conversation().slice(0, 2);
  const standalone = "What is John’s contact email?";

  const skipped = await rewriteQuery([...history, { role: "user", content: standalone }], "en", adapter);
  assert.equal(skipped.query, standalone);
  assert.equal(skipped.diagnostics.reason, "standalone_latest_message");
  assert.equal(calls, 0);

  const rewritten = await rewriteQuery(conversation(), "en", adapter);
  assert.equal(rewritten.query, "What technology was used for CareerTalkLab?");
  assert.equal(calls, 1);
});

test("rewrite is skipped for standalone single-turn queries", async () => {
  const result = await rewriteQuery(
    [{ role: "user", content: "What is Premium Parking?" }],
    "en",
    fakeAdapter("should not be called"),
  );
  assert.equal(result.diagnostics.used, false);
  assert.equal(result.diagnostics.reason, "standalone_single_turn");
  assert.equal(result.query, "What is Premium Parking?");
});

test("rewrite is skipped when no adapter is provided", async () => {
  const result = await rewriteQuery(conversation(), "en", undefined);
  assert.equal(result.diagnostics.used, false);
  assert.equal(result.diagnostics.reason, "no_adapter");
  assert.equal(result.query, "What technology did he use for it?");
});

test("rewrite produces a standalone query for context-dependent follow-ups", async () => {
  const result = await rewriteQuery(
    conversation(),
    "en",
    fakeAdapter("What technology was used for CareerTalkLab?"),
  );
  assert.equal(result.diagnostics.used, true);
  assert.equal(result.diagnostics.fallback, false);
  assert.equal(result.query, "What technology was used for CareerTalkLab?");
});

test("rewrite returns original when adapter produces the same query", async () => {
  const result = await rewriteQuery(
    conversation(),
    "en",
    fakeAdapter("What technology did he use for it?"),
  );
  assert.equal(result.diagnostics.used, false);
  assert.equal(result.diagnostics.reason, "unchanged");
  assert.equal(result.query, "What technology did he use for it?");
});

test("rewrite rejects empty output and falls back to original", async () => {
  const result = await rewriteQuery(conversation(), "en", fakeAdapter(""));
  assert.equal(result.diagnostics.used, false);
  assert.equal(result.diagnostics.fallback, true);
  assert.match(result.diagnostics.reason, /empty/);
  assert.equal(result.query, "What technology did he use for it?");
});

test("rewrite rejects overlong output and falls back to original", async () => {
  const longText = "x".repeat(REWRITE_MAX_OUTPUT_CHARS + 1);
  const result = await rewriteQuery(conversation(), "en", fakeAdapter(longText));
  assert.equal(result.diagnostics.used, false);
  assert.equal(result.diagnostics.fallback, true);
  assert.match(result.diagnostics.reason, /overlong/);
});

test("rewrite rejects wrong-language output and falls back to original", async () => {
  const result = await rewriteQuery(conversation(), "en", fakeAdapter("John hangi teknolojiyi kullandı?"));
  assert.equal(result.diagnostics.used, false);
  assert.equal(result.diagnostics.fallback, true);
  assert.match(result.diagnostics.reason, /language_mismatch/);
  assert.equal(result.query, "What technology did he use for it?");
});

test("rewrite preserves Turkish locale for Turkish conversations", async () => {
  const trConv: ChatMessage[] = [
    { role: "user", content: "CareerTalkLab hakkında bilgi verir misin?" },
    { role: "assistant", content: "[FIXED] CareerTalkLab bir platformdur." },
    { role: "user", content: "Onu hangi teknoloji ile yaptı?" },
  ];
  const result = await rewriteQuery(trConv, "tr", fakeAdapter("CareerTalkLab'i hangi teknoloji ile yaptı?"));
  assert.equal(result.diagnostics.used, true);
  assert.equal(result.query, "CareerTalkLab'i hangi teknoloji ile yaptı?");
});

test("English rewrites may contain Turkish proper nouns", async () => {
  const messages: ChatMessage[] = [
    { role: "user", content: "Tell me about John at Pakiş." },
    { role: "assistant", content: "Pakiş is in his career history." },
    { role: "user", content: "What was his role there?" },
  ];
  const query = "What was John’s role at Pakiş?";
  const result = await rewriteQuery(messages, "en", fakeAdapter(query));
  assert.equal(result.query, query);
  assert.equal(result.diagnostics.used, true);
});

test("rewrite rejects a model output that invents a named entity", async () => {
  const result = await rewriteQuery(
    conversation(),
    "en",
    fakeAdapter("What technology did Alice use for CareerTalkLab?"),
  );
  assert.equal(result.query, "What technology did he use for it?");
  assert.equal(result.diagnostics.reason, "rejected_invented_entity");
  assert.equal(result.diagnostics.fallback, true);
});

test("rewrite deadline timeout falls back to original", async () => {
  const result = await rewriteQuery(
    conversation(),
    "en",
    delayedAdapter(10_000),
    { deadlineMs: 10 },
  );
  assert.equal(result.diagnostics.used, false);
  assert.equal(result.diagnostics.fallback, true);
  assert.match(result.diagnostics.reason, /timeout_or_cancelled/);
  assert.equal(result.query, "What technology did he use for it?");
});

test("rewrite deadline settles when an adapter ignores AbortSignal", async () => {
  const result = await Promise.race([
    rewriteQuery(
      conversation(),
      "en",
      { rewrite: () => new Promise<string>(() => {}) },
      { deadlineMs: 10 },
    ),
    new Promise<"hung">((resolve) => setTimeout(() => resolve("hung"), 250)),
  ]);
  assert.notEqual(result, "hung");
  assert.equal(typeof result, "object");
  if (typeof result === "object") {
    assert.equal(result.diagnostics.reason, "timeout_or_cancelled");
  }
});

test("rewrite cancellation before start rejects without calling the adapter", async () => {
  const controller = new AbortController();
  const reason = new Error("caller cancelled");
  controller.abort(reason);
  let calls = 0;
  await assert.rejects(rewriteQuery(
    conversation(),
    "en",
    { rewrite: async () => { calls += 1; return "should not be called"; } },
    { signal: controller.signal },
  ), reason);
  assert.equal(calls, 0);
});

test("rewrite cancellation during adapter work rejects and aborts provider work", async () => {
  const controller = new AbortController();
  let providerStopped = false;
  const adapter: RewriteAdapter = {
    rewrite(_messages, _locale, signal) {
      return new Promise<string>((resolve) => {
        signal?.addEventListener("abort", () => {
          providerStopped = true;
          resolve("fallback work must not be used");
        }, { once: true });
      });
    },
  };
  const pending = rewriteQuery(conversation(), "en", adapter, {
    deadlineMs: 1_000,
    signal: controller.signal,
  });
  const reason = new Error("request disconnected");
  controller.abort(reason);
  await assert.rejects(pending, reason);
  assert.equal(providerStopped, true);
});

test("rewrite adapter error falls back to original without retry", async () => {
  const errorAdapter: RewriteAdapter = {
    async rewrite() { throw new Error("adapter provider unavailable"); },
  };
  const result = await rewriteQuery(conversation(), "en", errorAdapter);
  assert.equal(result.diagnostics.used, false);
  assert.equal(result.diagnostics.fallback, true);
  assert.equal(result.diagnostics.reason, "adapter_error");
  assert.equal(result.query, "What technology did he use for it?");
});

test("rewrite does not change generation history — original messages are preserved", async () => {
  const messages = conversation();
  const request = buildGenerationRequest(messages, "en", "context");
  assert.equal(request.contents[0].parts[0].text, "Tell me about CareerTalkLab.");
  assert.equal(request.contents[1].parts[0].text, "[FIXED] CareerTalkLab is a platform for career conversation practice.");
  assert.equal(request.contents[2].parts[0].text, "What technology did he use for it?");
});

test("createGeminiRewriteAdapter produces a functioning adapter", async () => {
  const mockGenerate: GeminiGenerateContent = async () => ({
    text: "What technology did John use for CareerTalkLab?",
  });
  const adapter = createGeminiRewriteAdapter(mockGenerate);
  const result = await adapter.rewrite(conversation(), "en");
  assert.equal(result, "What technology did John use for CareerTalkLab?");
});

test("createGeminiRewriteAdapter bounds history, message text, aggregate prompt, and output tokens", async () => {
  let captured: Parameters<GeminiGenerateContent>[0] | undefined;
  const mockGenerate: GeminiGenerateContent = async (request) => {
    captured = request;
    return { text: "What did CareerTalkLab use?" };
  };
  const messages: ChatMessage[] = Array.from({ length: REWRITE_HISTORY_LIMIT + 3 }, (_value, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    content: `${index}:`.padEnd(REWRITE_MAX_MESSAGE_CHARS * 2, String(index % 10)),
  }));

  await createGeminiRewriteAdapter(mockGenerate).rewrite(messages, "en");
  assert.ok(captured);
  assert.ok(captured.contents.length <= REWRITE_HISTORY_LIMIT);
  assert.deepEqual(
    captured.contents.map((entry) => entry.role),
    messages.slice(-captured.contents.length).map((message) => message.role === "user" ? "user" : "model"),
  );
  assert.ok(captured.contents.every((entry) => entry.parts[0].text.length <= REWRITE_MAX_MESSAGE_CHARS));
  const aggregateChars = String(captured.config?.systemInstruction).length
    + captured.contents.reduce((sum, entry) => sum + entry.parts[0].text.length, 0);
  assert.ok(aggregateChars <= REWRITE_MAX_PROMPT_CHARS);
  assert.equal(captured.config?.maxOutputTokens, REWRITE_MAX_OUTPUT_TOKENS);
});

test("createGeminiRewriteAdapter throws on empty response", async () => {
  const mockGenerate: GeminiGenerateContent = async () => ({ text: undefined });
  const adapter = createGeminiRewriteAdapter(mockGenerate);
  await assert.rejects(adapter.rewrite(conversation(), "en"), /no text/);
});
