import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../messages/en.json";
import trMessages from "../../../messages/tr.json";
import { AIChatPanel, filterChatHistory } from "./AIChatPanel";
import { createFaqExchange, getFaqShortcuts } from "@/lib/chat/faq-shortcuts";

for (const [locale, messages, expectedLabel, expectedPrompt] of [
  ["en", enMessages, "Quick questions", "How does John use Supabase?"],
  ["tr", trMessages, "Hızlı sorular", "John Supabase'i nasıl kullanıyor?"],
] as const) {
  test(`${locale} panel renders keyboard-operable FAQ buttons alongside free text`, () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <AIChatPanel isOpen onClose={() => {}} onReady={() => {}} />
      </NextIntlClientProvider>,
    );
    assert.match(html, new RegExp(expectedLabel));
    assert.ok(html.includes(`aria-label="${expectedPrompt.replaceAll("'", "&#x27;")}"`));
    assert.match(html, /type="button"/);
    assert.match(html, /type="text"/);
    assert.match(html, /type="submit"/);
  });
}

test("shortcut pair remains in follow-up history", () => {
  const shortcut = getFaqShortcuts("en", new Date("2026-09-24T12:00:00Z"))[0];
  const exchange = createFaqExchange(shortcut, "u1", "a1");
  assert.deepEqual(filterChatHistory([
    { id: "welcome", role: "assistant", content: "Welcome" },
    ...exchange,
    { id: "u2", role: "user", content: "What about its auth?" },
  ]), [
    { role: "user", content: shortcut.prompt },
    { role: "assistant", content: shortcut.answer },
    { role: "user", content: "What about its auth?" },
  ]);
});
