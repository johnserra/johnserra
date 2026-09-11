import assert from "node:assert/strict";
import test from "node:test";
import { rewriteQuery } from "./rewrite";

const followup = [
  { role: "user" as const, content: "Tell me about CareerTalkLab." },
  { role: "assistant" as const, content: "CareerTalkLab is a hybrid learning platform." },
  { role: "user" as const, content: "What technology did he use for it?" },
];

test("rewrite deadline settles even if adapter ignores AbortSignal", async () => {
  const result = await Promise.race([
    rewriteQuery(followup, "en", { rewrite: () => new Promise<string>(() => {}) }, { deadlineMs: 10 }),
    new Promise<"hung">((resolve) => setTimeout(() => resolve("hung"), 250)),
  ]);
  assert.notEqual(result, "hung", "deadline must settle rather than only abort a signal");
});

test("English questions may contain Turkish proper names", async () => {
  const messages = [
    { role: "user" as const, content: "Tell me about John at Pakiş." },
    { role: "assistant" as const, content: "Pakiş is in his career history." },
    { role: "user" as const, content: "What was his role there?" },
  ];
  const query = "What was John’s role at Pakiş?";
  const result = await rewriteQuery(messages, "en", { rewrite: async () => query });
  assert.equal(result.query, query);
});

test("standalone topic switch avoids rewrite call", async () => {
  let calls = 0;
  const messages = [...followup.slice(0, 2), { role: "user" as const, content: "What is John’s contact email?" }];
  const result = await rewriteQuery(messages, "en", {
    rewrite: async () => { calls += 1; return "CareerTalkLab contact email"; },
  });
  assert.equal(calls, 0);
  assert.equal(result.query, messages.at(-1)!.content);
});

test("caller cancellation rejects and does not call provider", async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  await assert.rejects(rewriteQuery(followup, "en", {
    rewrite: async () => { calls += 1; return "query"; },
  }, { signal: controller.signal }));
  assert.equal(calls, 0);
});
