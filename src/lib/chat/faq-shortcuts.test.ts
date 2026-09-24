import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { FAQ_SHORTCUTS, createFaqExchange, getFaqShortcuts, validateFaqShortcuts } from "./faq-shortcuts";

const reviewed = new Date("2026-09-24T12:00:00Z");

function mutated(change: (entries: Array<Record<string, unknown>>) => void): unknown[] {
  const entries = structuredClone(FAQ_SHORTCUTS) as unknown as Array<Record<string, unknown>>;
  change(entries);
  return entries;
}

test("approved registry is complete and exposes five localized shortcuts", () => {
  assert.deepEqual(validateFaqShortcuts(FAQ_SHORTCUTS, reviewed), []);
  assert.equal(getFaqShortcuts("en", reviewed).length, 5);
  assert.equal(getFaqShortcuts("tr", reviewed).length, 5);
  assert.equal(getFaqShortcuts("fr", reviewed).length, 0);
  assert.equal(getFaqShortcuts("en", new Date("2026-12-24T00:00:00Z")).length, 0);
  assert.match(getFaqShortcuts("en", reviewed)[3].answer, /He has taught/);
  assert.match(getFaqShortcuts("tr", reviewed)[3].answer, /Daha önce ders verdi/);
});

test("registry preserves John's approved prompts and answers verbatim", () => {
  const proposal = readFileSync("docs/digital-twin-faq-shortcuts-proposal.md", "utf8");
  for (const entry of FAQ_SHORTCUTS) {
    for (const locale of ["en", "tr"] as const) {
      const copy = entry.locales[locale];
      assert.ok(proposal.includes(`${locale.toUpperCase()} prompt: ${copy.prompt}`), `${entry.id} ${locale} prompt differs`);
      assert.ok(proposal.includes(`${locale.toUpperCase()} answer: ${copy.answer}`), `${entry.id} ${locale} answer differs`);
    }
  }
});

test("rejects malformed, duplicate, missing-locale and stale entries", () => {
  assert.match(validateFaqShortcuts([null], reviewed).join(" "), /malformed/);
  assert.match(validateFaqShortcuts(mutated((entries) => { entries.push(structuredClone(entries[0])); }), reviewed).join(" "), /duplicate/);
  assert.match(validateFaqShortcuts(mutated((entries) => { delete (entries[0].locales as Record<string, unknown>).tr; }), reviewed).join(" "), /missing tr/);
  assert.match(validateFaqShortcuts(FAQ_SHORTCUTS, new Date("2026-12-24T00:00:00Z")).join(" "), /stale/);
  assert.match(validateFaqShortcuts(mutated((entries) => { entries[0].expiresOn = "2027-09-24"; }), reviewed).join(" "), /stale/);
});

test("rejects oversized or uncited answers and unsafe, noncanonical links", () => {
  assert.match(validateFaqShortcuts(mutated((entries) => {
    ((entries[0].locales as Record<string, unknown>).en as Record<string, unknown>).answer = "a".repeat(1201);
  }), reviewed).join(" "), /invalid en answer/);
  assert.match(validateFaqShortcuts(mutated((entries) => {
    ((entries[0].locales as Record<string, unknown>).en as Record<string, unknown>).citations = ["javascript:alert(1)"];
  }), reviewed).join(" "), /invalid en citations/);
  assert.match(validateFaqShortcuts(mutated((entries) => {
    ((entries[0].locales as Record<string, unknown>).en as Record<string, unknown>).citations = ["https://johnserra.com.evil.test/projects/careertalklab"];
  }), reviewed).join(" "), /invalid en citations/);
  assert.match(validateFaqShortcuts(mutated((entries) => {
    ((entries[0].locales as Record<string, unknown>).en as Record<string, unknown>).answer = "No link";
  }), reviewed).join(" "), /invalid en citations/);
});

test("explicit shortcut creates a paired exchange without a fetch", () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => { calls += 1; throw new Error("unexpected fetch"); }) as typeof fetch;
  try {
    const shortcut = getFaqShortcuts("en", reviewed)[0];
    assert.deepEqual(createFaqExchange(shortcut, "u1", "a1"), [
      { id: "u1", role: "user", content: shortcut.prompt },
      { id: "a1", role: "assistant", content: shortcut.answer },
    ]);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
