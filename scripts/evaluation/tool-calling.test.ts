import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { evaluateToolCallingCorpus } from "./tool-calling-evaluator";
import { runToolCallingCli } from "./tool-calling-cli";
import { loadToolCallingCorpus, validateToolCallingCorpus } from "./tool-calling-schema";
import { scoreToolCallingCase } from "./tool-calling-scoring";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const corpusPath = path.join(repositoryRoot, "evals/tool-calling/cases.json");

test("the dedicated corpus has at least five multi-source cases and two no-tool controls", async () => {
  const corpus = await loadToolCallingCorpus(corpusPath);
  assert.ok(corpus.cases.filter((item) => item.expectedTools.length >= 2 && item.minimumDistinctSuccessfulTools >= 2).length >= 5);
  assert.ok(corpus.cases.filter((item) => item.categories.includes("no-tool-control")).length >= 2);
});

test("tool-calling schema rejects unknown fields, duplicate IDs, invalid tools, and impossible expectations", async () => {
  const corpus = await loadToolCallingCorpus(corpusPath);
  const raw = JSON.parse(await readFile(corpusPath, "utf8")) as Record<string, unknown>;
  assert.throws(() => validateToolCallingCorpus({ ...raw, extra: true }), /unknown or missing fields/);
  const duplicateCases = [raw.cases, raw.cases].flat() as Array<Record<string, unknown>>;
  assert.throws(() => validateToolCallingCorpus({ ...raw, cases: duplicateCases }), /Duplicate case ID/);
  const invalidTool = structuredClone(raw) as { cases: Array<Record<string, unknown>> };
  (invalidTool.cases[0].expectedTools as string[])[0] = "not-a-tool";
  assert.throws(() => validateToolCallingCorpus(invalidTool), /invalid tool name/);
  const tooFew = structuredClone(raw) as { cases: Array<Record<string, unknown>> };
  tooFew.cases = tooFew.cases.filter((item) => !((item.expectedTools as string[]).length >= 2 && (item.minimumDistinctSuccessfulTools as number) >= 2)).slice(0, 2);
  assert.throws(() => validateToolCallingCorpus(tooFew), /at least 5/);
  const inventedProject = structuredClone(raw) as { cases: Array<Record<string, unknown>> };
  const firstExpectation = (inventedProject.cases[0].evidenceExpectations as Array<Record<string, unknown>>)[0];
  firstExpectation.requiredCitations = [`https://johnserra.com/projects/${["workflow", "lab"].join("-")}`];
  assert.throws(() => validateToolCallingCorpus(inventedProject), /published project slug/);
  assert.equal(corpus.schemaVersion, "1.0.0");
});

test("offline scoring reports exact bounded-call metrics and no-tool accuracy", async () => {
  const corpus = await loadToolCallingCorpus(corpusPath);
  const evaluation = evaluateToolCallingCorpus(corpus);
  assert.deepEqual(evaluation.metrics.selectedToolPrecision, { numerator: 16, denominator: 16 });
  assert.deepEqual(evaluation.metrics.selectedToolRecall, { numerator: 16, denominator: 16 });
  assert.deepEqual(evaluation.metrics.unnecessaryToolRate, { numerator: 0, denominator: 16 });
  assert.deepEqual(evaluation.metrics.incorrectToolRate, { numerator: 0, denominator: 16 });
  assert.deepEqual(evaluation.metrics.redundantRequestedCalls, { numerator: 0, denominator: 21 });
  assert.deepEqual(evaluation.metrics.redundantExecutedCalls, { numerator: 0, denominator: 12 });
  assert.deepEqual(evaluation.metrics.callLimitCompliance, { numerator: 10, denominator: 10 });
  assert.deepEqual(evaluation.metrics.successfulDistinctToolCount, { numerator: 12, denominator: 10 });
  assert.deepEqual(evaluation.metrics.gracefulDegradation, { numerator: 2, denominator: 2 });
  assert.deepEqual(evaluation.metrics.evidenceSupport, { numerator: 12, denominator: 12 });
  assert.deepEqual(evaluation.metrics.citationSupport, { numerator: 12, denominator: 12 });
  assert.deepEqual(evaluation.metrics.answerFaithfulness, { numerator: 10, denominator: 10 });
  assert.deepEqual(evaluation.metrics.noToolControlAccuracy, { numerator: 2, denominator: 2 });
  assert.equal(evaluation.cases.find((item) => item.id === "greeting-control")?.boundedCounts.executed, 0);
  assert.equal(evaluation.cases.find((item) => item.id === "partial-digital-project-evidence")?.boundedCounts.executed, 1);
  assert.equal(evaluation.cases.find((item) => item.id === "all-tools-unavailable")?.boundedCounts.executed, 0);
});

test("answer faithfulness proxy fails when configured evidence or citations are absent", async () => {
  const corpus = await loadToolCallingCorpus(corpusPath);
  const demo = structuredClone(corpus.cases.find((item) => item.id === "ai-product-role-demo"))!;
  demo.fixture.answer = demo.fixture.answer.replace("https://johnserra.com/cv/john-serra.en.md", "");
  const score = scoreToolCallingCase(demo);
  assert.equal(score.answerScoring.faithful, false);
  assert.equal(score.answerScoring.details.some((detail) => !detail.requiredCitationsInAnswer), true);

  const duplicateCase = structuredClone(corpus.cases[0]);
  duplicateCase.fixture.requestedCalls.push({ tool: "search_knowledge", identity: "search-careertalklab" });
  assert.equal(scoreToolCallingCase(duplicateCase).redundantRequestedCallCount, 1);
});

test("validate-only writes no report and offline CLI writes sanitized versioned reports", async () => {
  const outputDirectory = await mkdtemp(path.join("/tmp", "tool-calling-eval-"));
  try {
    const validationOutput: string[] = [];
    assert.equal(await runToolCallingCli(["--validate-only"], {
      repositoryRoot,
      stdout: (message) => validationOutput.push(message),
      stderr: (message) => { throw new Error(message); },
    }), 0);
    assert.equal(validationOutput[0].includes("no report was written"), true);
    assert.deepEqual(await readdir(outputDirectory), []);

    assert.equal(await runToolCallingCli(["--offline", "--output-dir", outputDirectory], {
      repositoryRoot,
      now: () => new Date("2026-09-13T12:00:00.000Z"),
      gitMetadata: async () => ({ revision: "test-revision", dirty: true }),
      stdout() {},
      stderr: (message) => { throw new Error(message); },
    }), 0);
    const files = await readdir(outputDirectory);
    assert.deepEqual(files.sort(), [
      "tool-calling-2026-09-13T12-00-00-000Z.json",
      "tool-calling-2026-09-13T12-00-00-000Z.md",
    ]);
    const report = await readFile(path.join(outputDirectory, files.find((file) => file.endsWith(".json"))!), "utf8");
    assert.match(report, /"schemaVersion": "1\.0\.0"/);
    assert.match(report, /bounded-multi-tool-2026-09-13/);
    assert.equal(report.includes("Which of John's projects"), false);
    assert.equal(report.includes("CareerTalkLab is the strongest"), false);
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});
