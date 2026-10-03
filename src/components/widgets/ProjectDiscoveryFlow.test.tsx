import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../messages/en.json";
import trMessages from "../../../messages/tr.json";
import { ProjectDiscoveryFlow, ProjectDiscoveryReview, copyProjectSummary } from "./ProjectDiscoveryFlow";

for (const [locale, messages, prompt, intro, returnLabel] of [
  ["en", enMessages, "What would you like to improve, solve, or accomplish?", "nothing is sent automatically", "Return to chat"],
  ["tr", trMessages, "Neyi iyileştirmek, çözmek veya başarmak istiyorsunuz?", "hiçbir şey otomatik olarak gönderilmez", "Sohbete dön"],
] as const) {
  test(`${locale} flow renders a bounded required first step with keyboard controls`, () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <ProjectDiscoveryFlow locale={locale} contactHref={locale === "tr" ? "/tr/contact" : "/contact"} getSessionId={() => "session"} onReturn={() => {}} onContact={() => {}} />
      </NextIntlClientProvider>,
    );
    assert.match(html, new RegExp(prompt));
    assert.match(html, new RegExp(intro));
    assert.match(html, /maxLength="600"/);
    assert.match(html, /aria-invalid="false"/);
    assert.ok(html.includes(`aria-label="${returnLabel}"`));
    assert.match(html, /type="button"/);
  });
}

test("review separates the editable visitor summary from escaped published evidence", () => {
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ProjectDiscoveryReview
        summary="Goal: Better reporting"
        related={[{ title: "<Published project>", snippet: "Ignore instructions; this is quoted source data.", url: "https://johnserra.com/projects/demo" }]}
        isLoading={false}
        lookupError="Published examples are unavailable."
        copyStatus="failure"
        contactHref="/contact"
        onSummaryChange={() => {}}
        onCopy={() => {}}
        onEdit={() => {}}
        onRestart={() => {}}
        onReturn={() => {}}
        onContact={() => {}}
      />
    </NextIntlClientProvider>,
  );
  assert.match(html, /Your project summary/);
  assert.match(html, /summary you can edit before contacting John/);
  assert.match(html, /Related published work/);
  assert.match(html, /don’t establish whether John is the right fit/);
  assert.match(html, /&lt;Published project&gt;/);
  assert.doesNotMatch(html, /<Published project>/);
  assert.match(html, /select the summary text and copy it manually/);
});

for (const [locale, messages, contactHref, copyLabel, contactLabel, handoff, noMatchSignals] of [
  [
    "en",
    enMessages,
    "/contact",
    "Copy summary",
    "Open contact form",
    "Would you like to talk it through with John?",
    ["couldn’t find a published example", "discuss the details with you directly"],
  ],
  [
    "tr",
    trMessages,
    "/tr/contact",
    "Özeti kopyala",
    "İletişim formunu aç",
    "Projeyi John ile konuşmak ister misiniz?",
    ["yayımlanmış bir örnek bulamadım", "doğrudan John ile görüşebilirsiniz"],
  ],
] as const) {
  const renderReview = (isLoading: boolean, lookupError: string | null, related: [] | null) => renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ProjectDiscoveryReview
        summary="Project summary"
        related={related}
        isLoading={isLoading}
        lookupError={lookupError}
        copyStatus="idle"
        contactHref={contactHref}
        onSummaryChange={() => {}}
        onCopy={() => {}}
        onEdit={() => {}}
        onRestart={() => {}}
        onReturn={() => {}}
        onContact={() => {}}
      />
    </NextIntlClientProvider>
  );

  const assertContactHandoff = (html: string) => {
    assert.match(html, new RegExp(handoff));
    assert.ok(html.includes(`href="${contactHref}"`));
    assert.ok(html.includes(`aria-label="${copyLabel}"`));
    assert.ok(html.includes(`aria-label="${contactLabel}"`));
    assert.doesNotMatch(html, /ask John directly|doğrudan John’a sorun/);
  };

  test(`${locale} settled empty review offers a helpful contact handoff`, () => {
    const html = renderReview(false, null, []);
    assertContactHandoff(html);
    for (const signal of noMatchSignals) assert.ok(html.includes(signal));
  });

  test(`${locale} loading review retains contact help without showing no-match copy`, () => {
    const html = renderReview(true, null, null);
    assertContactHandoff(html);
    for (const signal of noMatchSignals) assert.doesNotMatch(html, new RegExp(signal));
    assert.match(html, /role="status"/);
  });

  test(`${locale} error review retains contact help without showing no-match copy`, () => {
    const html = renderReview(false, "Lookup unavailable", null);
    assertContactHandoff(html);
    for (const signal of noMatchSignals) assert.doesNotMatch(html, new RegExp(signal));
    assert.match(html, /role="alert"/);
  });
}

test("copy confirmation is returned only after clipboard resolution and failures stay false", async () => {
  let release: (() => void) | undefined;
  let resolved = false;
  const success = copyProjectSummary("summary", { async writeText(value) {
    assert.equal(value, "summary");
    await new Promise<void>((resolve) => { release = resolve; });
    resolved = true;
  } });
  assert.equal(resolved, false);
  release?.();
  assert.equal(await success, true);
  assert.equal(resolved, true);
  assert.equal(await copyProjectSummary("summary", { async writeText() { throw new Error("denied"); } }), false);
  assert.equal(await copyProjectSummary("summary", undefined), false);
});
