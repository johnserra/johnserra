import assert from "node:assert/strict";
import test from "node:test";
import {
  CHAT_MAX_STORED_BYTES,
  CHAT_RETENTION_MS,
  CHAT_STORAGE_KEY,
  boundedApiHistory,
  deleteSavedConversation,
  disableChatSaving,
  enableChatSaving,
  localeConversations,
  readSavedChats,
  saveCompletedExchange,
  selectSavedConversation,
  startSavedConversation,
  type ChatStorage,
} from "./local-persistence";
import { CHAT_MAX_INPUT_BYTES, CHAT_MAX_MESSAGES, utf8ByteLength } from "./limits";

const NOW = Date.parse("2026-09-24T12:00:00Z");
const id = (number: number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;

class MemoryStorage implements ChatStorage {
  data = new Map<string, string>();
  writes: string[] = [];
  fail: "get" | "set" | "remove" | null = null;
  getItem(key: string): string | null {
    if (this.fail === "get") throw new DOMException("blocked", "SecurityError");
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.fail === "set") throw new DOMException("full", "QuotaExceededError");
    this.writes.push(value);
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    if (this.fail === "remove") throw new DOMException("blocked", "SecurityError");
    this.data.delete(key);
  }
}

test("saving is off by default and consent is durable before content", () => {
  const storage = new MemoryStorage();
  assert.deepEqual(readSavedChats(storage, NOW), { ok: true, value: null });
  assert.deepEqual(saveCompletedExchange(storage, id(1), "en", "secret question", "answer", NOW), { ok: false, reason: "not-enabled" });
  assert.equal(storage.writes.length, 0);
  const enabled = enableChatSaving(storage, NOW);
  assert.equal(enabled.ok, true);
  assert.equal(storage.writes.length, 1);
  assert.equal(storage.writes[0].includes("secret question"), false);
  assert.equal(saveCompletedExchange(storage, id(1), "en", "secret question", "answer", NOW + 1).ok, true);
  assert.equal(storage.writes[1].includes("secret question"), true);
});

test("restores only complete pairs and preserves independent locales", () => {
  const storage = new MemoryStorage();
  enableChatSaving(storage, NOW);
  saveCompletedExchange(storage, id(1), "en", "Hello", "Hi", NOW + 1);
  saveCompletedExchange(storage, id(2), "tr", "Merhaba", "Selam", NOW + 2);
  const restored = readSavedChats(storage, NOW + 3);
  assert.equal(restored.ok, true);
  if (!restored.ok || !restored.value) return;
  assert.deepEqual(localeConversations(restored.value, "en").map((item) => item.id), [id(1)]);
  assert.deepEqual(localeConversations(restored.value, "tr").map((item) => item.id), [id(2)]);
  assert.deepEqual(localeConversations(restored.value, "en")[0].messages, [
    { role: "user", content: "Hello" }, { role: "assistant", content: "Hi" },
  ]);
  assert.equal(restored.value.activeConversationId, id(2));
});

test("expires consent and conversations after 30 days without extending on reads", () => {
  const storage = new MemoryStorage();
  enableChatSaving(storage, NOW);
  assert.equal(readSavedChats(storage, NOW + CHAT_RETENTION_MS - 1).ok, true);
  assert.deepEqual(readSavedChats(storage, NOW + CHAT_RETENTION_MS), { ok: true, value: null });
  assert.equal(storage.getItem(CHAT_STORAGE_KEY), null);

  enableChatSaving(storage, NOW);
  saveCompletedExchange(storage, id(1), "en", "Q", "A", NOW + 100);
  const restored = readSavedChats(storage, NOW + CHAT_RETENTION_MS + 99);
  assert.equal(restored.ok, true);
  assert.equal(restored.ok && restored.value?.conversations.length, 1);
  assert.deepEqual(readSavedChats(storage, NOW + CHAT_RETENTION_MS + 100), { ok: true, value: null });
});

test("malformed, unsupported, oversized, and invalid records are purged", () => {
  const storage = new MemoryStorage();
  for (const raw of ["{", JSON.stringify({ version: 2 }), "x".repeat(CHAT_MAX_STORED_BYTES + 1)]) {
    storage.data.set(CHAT_STORAGE_KEY, raw);
    assert.deepEqual(readSavedChats(storage, NOW), { ok: true, value: null });
    assert.equal(storage.getItem(CHAT_STORAGE_KEY), null);
  }
  enableChatSaving(storage, NOW);
  saveCompletedExchange(storage, id(1), "en", "Q", "A", NOW);
  const valid = JSON.parse(storage.getItem(CHAT_STORAGE_KEY)!) as Record<string, unknown>;
  const mutations = [
    { ...valid, unexpected: "private" },
    { ...valid, activeConversationId: "not-a-uuid" },
    { ...valid, conversations: [{ ...(valid.conversations as object[])[0], locale: "fr" }] },
    { ...valid, conversations: [{ ...(valid.conversations as object[])[0], messages: [{ role: "user", content: "unpaired" }] }] },
    { ...valid, conversations: [{ ...(valid.conversations as object[])[0], messages: [{ role: "assistant", content: "wrong" }, { role: "user", content: "order" }] }] },
    { ...valid, conversations: [{ ...(valid.conversations as object[])[0], messages: [{ role: "user", content: "x".repeat(8193) }, { role: "assistant", content: "A" }] }] },
  ];
  for (const mutation of mutations) {
    storage.data.set(CHAT_STORAGE_KEY, JSON.stringify(mutation));
    assert.deepEqual(readSavedChats(storage, NOW), { ok: true, value: null });
  }
});

test("new, select, delete-current, and disable only affect intended records", () => {
  const storage = new MemoryStorage();
  enableChatSaving(storage, NOW);
  saveCompletedExchange(storage, id(1), "en", "Q1", "A1", NOW);
  saveCompletedExchange(storage, id(2), "en", "Q2", "A2", NOW + 1);
  assert.equal(startSavedConversation(storage, id(3), NOW + 2).ok, true);
  assert.equal(readSavedChats(storage, NOW + 2).ok, true);
  assert.equal(selectSavedConversation(storage, id(1), "tr", NOW + 3).ok, false);
  assert.equal(selectSavedConversation(storage, id(1), "en", NOW + 3).ok, true);
  const deleted = deleteSavedConversation(storage, id(1), NOW + 4);
  assert.equal(deleted.ok, true);
  if (deleted.ok) {
    assert.equal(deleted.value.activeConversationId, null);
    assert.deepEqual(deleted.value.conversations.map((item) => item.id), [id(2)]);
  }
  assert.deepEqual(disableChatSaving(storage), { ok: true, value: null });
  assert.equal(storage.getItem(CHAT_STORAGE_KEY), null);
});

test("limits saved count, message count and serialized bytes without dropping newest pair", () => {
  const storage = new MemoryStorage();
  enableChatSaving(storage, NOW);
  for (let conversation = 1; conversation <= 6; conversation += 1) {
    for (let pair = 0; pair < 12; pair += 1) {
      assert.equal(saveCompletedExchange(storage, id(conversation), "en", `Q${conversation}-${pair}-` + "q".repeat(1700), `A${conversation}-${pair}-` + "a".repeat(1700), NOW + conversation * 100 + pair).ok, true);
    }
  }
  const restored = readSavedChats(storage, NOW + 1000);
  assert.equal(restored.ok, true);
  if (!restored.ok || !restored.value) return;
  assert.ok(restored.value.conversations.length <= 5);
  assert.equal(restored.value.conversations.some((item) => item.id === id(1)), false);
  assert.ok(restored.value.conversations.every((item) => item.messages.length <= 20));
  assert.ok(utf8ByteLength(storage.getItem(CHAT_STORAGE_KEY)!) <= CHAT_MAX_STORED_BYTES);
  assert.match(restored.value.conversations.find((item) => item.id === id(6))!.messages.at(-1)!.content, /A6-11/);
});

test("bounds API history to 21 messages and 32 KiB, keeping newest user", () => {
  const messages = Array.from({ length: 15 }, (_, index) => [
    { role: "user" as const, content: `Q${index}-` + "q".repeat(1500) },
    { role: "assistant" as const, content: `A${index}-` + "a".repeat(1500) },
  ]).flat();
  const bounded = boundedApiHistory([...messages, { role: "user", content: "latest" }]);
  assert.ok(bounded);
  assert.ok(bounded.length <= CHAT_MAX_MESSAGES);
  assert.ok(bounded.reduce((sum, message) => sum + utf8ByteLength(message.content), 0) <= CHAT_MAX_INPUT_BYTES);
  assert.deepEqual(bounded.at(-1), { role: "user", content: "latest" });
});

test("storage failures never claim consent, save or deletion succeeded", () => {
  assert.deepEqual(enableChatSaving(null, NOW), { ok: false, reason: "unavailable" });
  const storage = new MemoryStorage();
  storage.fail = "get";
  assert.deepEqual(readSavedChats(storage, NOW), { ok: false, reason: "unavailable" });
  storage.fail = "set";
  assert.deepEqual(enableChatSaving(storage, NOW), { ok: false, reason: "unavailable" });
  storage.fail = null;
  enableChatSaving(storage, NOW);
  storage.fail = "set";
  assert.deepEqual(saveCompletedExchange(storage, id(1), "en", "Q", "A", NOW + 1), { ok: false, reason: "unavailable" });
  storage.fail = "remove";
  assert.deepEqual(disableChatSaving(storage), { ok: false, reason: "unavailable" });
  assert.notEqual(storage.data.get(CHAT_STORAGE_KEY), undefined);
});
