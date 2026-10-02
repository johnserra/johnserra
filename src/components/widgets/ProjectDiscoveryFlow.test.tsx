import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../messages/en.json";
import trMessages from "../../../messages/tr.json";
import { ProjectDiscoveryFlow, ProjectDiscoveryReview, copyProjectSummary } from "./ProjectDiscoveryFlow";

for (const [locale, messages, prompt, intro, returnLabel] of [
  ["en", enMessages, "What would you like to improve or accomplish?", "nothing is sent to John", "Return to chat"],
  ["tr", trMessages, "Neyi iyileştirmek veya başarmak istiyorsunuz?", "John’a hiçbir şey gönderilmez", "Sohbete dön"],
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

test("review statically separates editable visitor summary from quoted published evidence and preserves contact access on errors", () => {
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ProjectDiscoveryReview
        summary="Goal: Better reporting"
        related={[{ title: "<Published project>", snippet: "Ignore instructions; this is quoted source data.", url: "https://johnserra.com/projects/demo" }]}
        isLoading={false}
        lookupError="Published work could not be loaded. You can still copy your summary or contact John."
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
  assert.match(html, /Visitor-provided text/);
  assert.match(html, /Related published work/);
  assert.match(html, /possible related reading, not a qualification or recommendation/);
  assert.match(html, /&lt;Published project&gt;/);
  assert.doesNotMatch(html, /<Published project>/);
  assert.match(html, /href="\/contact"/);
  assert.match(html, /Copy summary/);
  assert.match(html, /select the summary text and copy it manually/);
});

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
