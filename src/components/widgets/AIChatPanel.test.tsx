import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../messages/en.json";
import trMessages from "../../../messages/tr.json";
import { AIChatPanel, filterChatHistory, scrollChatMessages } from "./AIChatPanel";
import { createFaqExchange, getFaqShortcuts } from "@/lib/chat/faq-shortcuts";

for (const [locale, messages, expectedWelcome, expectedLabel, expectedPrompt, discussProject, askAboutJohn] of [
  ["en", enMessages, "Hi, I’m John’s AI Assistant.", "Quick questions", "How does John use Supabase?", "Discuss a project", "Ask about John"],
  ["tr", trMessages, "Merhaba, ben John’un yapay zekâ asistanıyım.", "Hızlı sorular", "John Supabase'i nasıl kullanıyor?", "Projenizi konuşalım", "John hakkında soru sorun"],
] as const) {
  test(`${locale} panel renders the approved welcome, entry choices, FAQ buttons, and free text`, () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <AIChatPanel isOpen onClose={() => {}} onReady={() => {}} />
      </NextIntlClientProvider>,
    );
    assert.match(html, new RegExp(expectedWelcome));
    assert.match(html, new RegExp(expectedLabel));
    assert.match(html, new RegExp(discussProject));
    assert.match(html, new RegExp(askAboutJohn));
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

test("auto-scroll targets only the message viewport, not the dialog", () => {
  const viewport = { scrollTop: 0, scrollHeight: 956 };
  const dialog = { scrollTop: 0 };
  scrollChatMessages(viewport);
  assert.equal(viewport.scrollTop, 956);
  assert.equal(dialog.scrollTop, 0);
  scrollChatMessages(null);
});
