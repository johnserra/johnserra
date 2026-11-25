import assert from "node:assert/strict";
import test from "node:test";
import { loadRegisteredCv } from "@/lib/knowledge/cv";
import { buildSystemPrompt, type ChatDependencies, type ChatStreamChunk, type GenerationRequest } from "./core";
import { streamBoundedEvidenceAgent, type AgentTraceSummary } from "./agent-loop";
import { createChatToolRegistry } from "./tools";

const correlationId = "123e4567-e89b-42d3-a456-426614174000";
const cvUrl = "https://johnserra.com/cv/john-serra.en.md";

async function collect(stream: AsyncIterable<ChatStreamChunk>): Promise<string> {
  let answer = "";
  for await (const chunk of stream) answer += chunk.text ?? "";
  return answer;
}

for (const locale of ["en", "tr"] as const) {
  test(`documented teaching inquiry retains past experience and an ${locale} contact route`, async () => {
    const contactUrl = `https://johnserra.com${locale === "tr" ? "/tr" : ""}/contact`;
    const finalAnswer = locale === "tr"
      ? `John'un [özgeçmişi](${cvUrl}) öğretmenlik deneyimini belgeliyor. Şu anda ders verip vermediği doğrulanmış değil; [iletişim sayfasından](${contactUrl}) kendisine sorabilirsiniz.`
      : `John's [CV](${cvUrl}) documents that he has taught. Whether he currently teaches is unconfirmed; you can [contact John](${contactUrl}) to ask.`;
    const requests: GenerationRequest[] = [];
    const calls: string[] = [];
    const traces: AgentTraceSummary[] = [];
    const dependencies: ChatDependencies = {
      async embedQuery() { throw new Error("unexpected embedding"); },
      async matchCareerContext() { throw new Error("unexpected retrieval RPC"); },
      async generateContentStream(request) {
        requests.push(request);
        const schema = request.config.responseJsonSchema as { properties?: Record<string, unknown> } | undefined;
        if (request.config.tools) return (async function* () {
          yield { functionCalls: [
            { id: "cv", name: "get_cv_timeline", args: { locale } },
            { id: "contact", name: "get_contact_options", args: { locale } },
          ] };
        })();
        if (schema?.properties && "status" in schema.properties) return (async function* () {
          yield { text: JSON.stringify({ status: "sufficient", query: null }) };
        })();
        if (schema?.properties && "decision" in schema.properties) return (async function* () {
          yield { text: JSON.stringify({ decision: "accept", finalAnswer, supportedClaims: 1, qualifiedClaims: 1, removedClaims: 0 }) };
        })();
        return (async function* () { yield { text: finalAnswer }; })();
      },
    };
    const registry = createChatToolRegistry({
      async searchKnowledge() { throw new Error("unexpected knowledge search"); },
      async loadCv() { calls.push("cv"); return loadRegisteredCv(); },
      async getProject() { throw new Error("unexpected project lookup"); },
      async listArticles() { throw new Error("unexpected articles lookup"); },
      async getContactOptions() {
        calls.push("contact");
        return [{ label: "Contact form", url: contactUrl, description: "Ask John directly." }];
      },
    });
    const answer = await collect(streamBoundedEvidenceAgent(
      [{ role: "user", content: locale === "tr" ? "John hâlâ ders veriyor mu?" : "Does John teach?" }],
      locale, dependencies, registry, new AbortController().signal,
      { correlationId, onAgentTrace: (trace) => traces.push(trace) },
    ));
    assert.equal(answer, finalAnswer);
    assert.deepEqual(calls, ["cv", "contact"]);
    assert.equal(traces[0].stopReason, "qualified_completion");
    assert.equal(traces[0].acceptedToolExecutions, 2);
    assert.equal(traces[0].verificationPasses, 1);
    assert.equal(requests.length, 4);
    for (const request of requests) {
      assert.match(request.config.systemInstruction, /Professional-inquiry rule/u);
      assert.match(request.config.systemInstruction, /current availability (?:is|are) unconfirmed/u);
      assert.match(request.config.systemInstruction, /Never claim John currently teaches/u);
    }
    const cv = await loadRegisteredCv();
    assert.ok(
      cv.sections.some((section) => /teaching|education coordinator/i.test(`${section.title} ${section.paragraphs.join(" ")} ${section.bullets.join(" ")}`)),
    );
    assert.match(buildSystemPrompt("", locale), /If current availability is not documented/u);
  });
}

test("capability inquiry (e.g. building a sales report) supports CV + published articles + contact CTA", async () => {
  const contactUrl = "https://johnserra.com/contact";
  const articleUrl = "https://johnserra.com/blog/build-first-power-bi-sales-report-excel";
  const finalAnswer = `Yes — based on his documented background, John has relevant experience to build a sales report, depending on scope. His [CV](${cvUrl}) documents Power BI dashboard analysis and PostgreSQL reporting, and he has published tutorials such as [Build Your First Power BI Sales Report from Excel](${articleUrl}). Current availability isn't confirmed here, so you can use his [contact form](${contactUrl}) to discuss scope and possibilities.`;
  const calls: string[] = [];
  const traces: AgentTraceSummary[] = [];
  const dependencies: ChatDependencies = {
    async embedQuery() { throw new Error("unexpected embedding"); },
    async matchCareerContext() { throw new Error("unexpected retrieval RPC"); },
    async generateContentStream(request) {
      const schema = request.config.responseJsonSchema as { properties?: Record<string, unknown> } | undefined;
      if (request.config.tools) return (async function* () {
        yield {
          functionCalls: [
            { id: "cv", name: "get_cv_timeline", args: { locale: "en" } },
            { id: "search", name: "search_knowledge", args: { query: "sales report", locale: "en" } },
            { id: "contact", name: "get_contact_options", args: { locale: "en" } },
          ],
        };
      })();
      if (schema?.properties && "status" in schema.properties) return (async function* () {
        yield { text: JSON.stringify({ status: "sufficient", query: null }) };
      })();
      if (schema?.properties && "decision" in schema.properties) return (async function* () {
        yield { text: JSON.stringify({ decision: "accept", finalAnswer, supportedClaims: 3, qualifiedClaims: 1, removedClaims: 0 }) };
      })();
      return (async function* () { yield { text: finalAnswer }; })();
    },
  };
  const registry = createChatToolRegistry({
    async searchKnowledge() {
      calls.push("search");
      return [{ title: "Build Your First Power BI Sales Report from Excel", excerpt: "Step-by-step Power BI sales reporting guide.", url: articleUrl }];
    },
    async loadCv() { calls.push("cv"); return loadRegisteredCv(); },
    async getProject() { throw new Error("unexpected project lookup"); },
    async listArticles() { throw new Error("unexpected articles lookup"); },
    async getContactOptions() {
      calls.push("contact");
      return [{ label: "Contact form", url: contactUrl, description: "Send a message through the public contact form." }];
    },
  });

  const answer = await collect(streamBoundedEvidenceAgent(
    [{ role: "user", content: "Can John build a sales report?" }],
    "en",
    dependencies,
    registry,
    new AbortController().signal,
    { correlationId, onAgentTrace: (trace) => traces.push(trace) },
  ));

  assert.equal(answer, finalAnswer);
  assert.deepEqual(calls, ["cv", "search", "contact"]);
  assert.equal(traces[0].acceptedToolExecutions, 3);
  assert.equal(traces[0].verificationPasses, 1);
});
