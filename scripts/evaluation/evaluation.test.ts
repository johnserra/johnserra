import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import type { ChatDependencies } from "../../src/lib/chat/core";
import { parseArguments } from "./arguments";
import { runCli } from "./cli";
import { writeReports, type BaselineReport } from "./report";
import { runCase, runEvaluation } from "./runner";
import { aggregateScores, scoreCase } from "./scoring";
import {
  loadAndValidateCorpus,
  validateCaseFile,
  validateSourceManifest,
  type AssistantCase,
} from "./schema";

const root = process.cwd();
const corpusPromise = loadAndValidateCorpus(
  path.join(root, "evals/assistant/cases.json"),
  path.join(root, "evals/assistant/sources.json"),
);

interface SourceManifestShape {
  generatedAt: string;
  sources: Array<{ wordpressModifiedAt: string; contentHash: string }>;
}

function fakeDependencies(answer = "answer"): ChatDependencies {
  return {
    async embedQuery() { return [1]; },
    async matchCareerContext() { return { data: [], error: null }; },
    async generateContentStream() { return (async function* () { yield { text: answer }; })(); },
  };
}

function runSubprocess(
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const environment = { ...options.env };
    delete environment.NODE_TEST_CONTEXT;
    const child = spawn(process.execPath, args, { ...options, env: environment });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("the real corpus validates all evidence references and required coverage counts", async () => {
  const corpus = await corpusPromise;
  assert.equal(corpus.caseFile.cases.length, 34);
  assert.equal(corpus.sourceManifest.sources.length, 15);
  assert.ok(corpus.caseFile.cases.filter((item) => item.locale === "tr").length >= 7);
  assert.ok(corpus.caseFile.cases.every((item) => item.evidenceReferences.every((reference) =>
    corpus.sourceManifest.sources.some((source) => source.sourceId === reference.sourceId && source.excerpts.some((excerpt) => excerpt.id === reference.excerptId)),
  )));
  assert.ok(corpus.caseFile.cases.every((item) => !item.turns.some((turn) => /cook|recipe|yemek|tarif/iu.test(turn.user))));
  assert.ok(corpus.sourceManifest.sources.every((source) => !source.excerpts.some((excerpt) => /fresh pasta|yemek yapıyorum|recipe/iu.test(excerpt.text))));
});

test("the Errorless Teaching case uses the published Independent Performance phase evidence", async () => {
  const corpus = await corpusPromise;
  const definition = corpus.caseFile.cases.find((item) => item.id === "errorless-teaching-method-en")!;
  const source = corpus.sourceManifest.sources.find((item) => item.sourceId === "wordpress/post/32/en")!;
  assert.deepEqual(
    definition.evidenceReferences.map((reference) => reference.excerptId),
    ["four-phases", "phase-receptive", "phase-recognition", "phase-production", "phase-independent"],
  );
  assert.deepEqual(
    source.excerpts.filter((excerpt) => excerpt.id.startsWith("phase-")).map((excerpt) => excerpt.text),
    [
      "Phase 1 — Receptive Orientation",
      "Phase 2 — Guided Recognition",
      "Phase 3 — Guided Production",
      "Phase 4 — Independent Performance",
    ],
  );
  assert.deepEqual(
    definition.requiredFacts.find((fact) => fact.id === "independent-performance")?.patterns,
    ["Independent Performance"],
  );
});

test("malformed cases and stale evidence references fail visibly", async () => {
  const corpus = await corpusPromise;
  const malformed = structuredClone(corpus.caseFile) as unknown as { schemaVersion: string; cases: AssistantCase[]; corpusVersion: string };
  malformed.cases[0].evidenceReferences[0].excerptId = "missing";
  assert.throws(() => validateCaseFile(malformed, corpus.sourceManifest), /unknown excerpt/);
  malformed.schemaVersion = "0";
  assert.throws(() => validateCaseFile(malformed, corpus.sourceManifest), /Unsupported case schemaVersion/);
});

test("preflight rejects malformed uncertainty, citation, locale, timestamp, hash, and similarity data", async () => {
  const corpus = await corpusPromise;
  const caseClone = () => structuredClone(corpus.caseFile) as unknown as {
    schemaVersion: string;
    cases: AssistantCase[];
    corpusVersion: string;
  };

  const invalidUncertainty = caseClone();
  invalidUncertainty.cases.find((item) => item.id === "unknown-degree-en")!.uncertainty.patterns = ["["];
  assert.throws(() => validateCaseFile(invalidUncertainty, corpus.sourceManifest), /uncertainty\.patterns contains an invalid regular expression/);

  const optionalInvalidUncertainty = caseClone();
  optionalInvalidUncertainty.cases[0].uncertainty.patterns = ["["];
  assert.throws(() => validateCaseFile(optionalInvalidUncertainty, corpus.sourceManifest), /uncertainty\.patterns contains an invalid regular expression/);

  const missingUncertainty = caseClone();
  missingUncertainty.cases.find((item) => item.id === "unknown-degree-en")!.uncertainty.patterns = [];
  assert.throws(() => validateCaseFile(missingUncertainty, corpus.sourceManifest), /cannot be empty when uncertainty is required/);

  const missingCitation = caseClone();
  missingCitation.cases[0].citations.expectedUrls = [];
  assert.throws(() => validateCaseFile(missingCitation, corpus.sourceManifest), /cannot be empty when citations are required/);

  const unknownCitation = caseClone();
  unknownCitation.cases[0].citations.expectedUrls = ["https://johnserra.com/blog/not-in-manifest"];
  assert.throws(() => validateCaseFile(unknownCitation, corpus.sourceManifest), /absent from the source manifest/);

  const wrongLocale = caseClone();
  const turkishSource = corpus.sourceManifest.sources.find((source) => source.locale === "tr")!;
  wrongLocale.cases[0].expectedSourceIds = [turkishSource.sourceId];
  wrongLocale.cases[0].evidenceReferences = [{ sourceId: turkishSource.sourceId, excerptId: turkishSource.excerpts[0].id }];
  assert.throws(() => validateCaseFile(wrongLocale, corpus.sourceManifest), /wrong locale/);

  for (const similarity of [Number.NaN, Number.POSITIVE_INFINITY]) {
    const invalidFixture = caseClone();
    invalidFixture.cases.find((item) => item.fixture)!.fixture!.similarity = similarity;
    assert.throws(() => validateCaseFile(invalidFixture, corpus.sourceManifest), /similarity must be between zero and one/);
  }

  const sourceClone = () => structuredClone(corpus.sourceManifest) as unknown;
  const invalidGeneratedAt = sourceClone() as SourceManifestShape;
  invalidGeneratedAt.generatedAt = "2026-09-10";
  assert.throws(() => validateSourceManifest(invalidGeneratedAt), /ISO-8601 UTC timestamp/);

  const invalidModifiedAt = sourceClone() as SourceManifestShape;
  invalidModifiedAt.sources[0].wordpressModifiedAt = "2026-02-30T00:00:00Z";
  assert.throws(() => validateSourceManifest(invalidModifiedAt), /valid ISO-8601 UTC timestamp/);

  const invalidHash = sourceClone() as SourceManifestShape;
  invalidHash.sources[0].contentHash = "sha256:not-a-digest";
  assert.throws(() => validateSourceManifest(invalidHash), /invalid content hash/);
});

test("retrieval hit denominators exclude no-source and fixture cases", async () => {
  const corpus = await corpusPromise;
  const factual = corpus.caseFile.cases.find((item) => item.id === "identity-professional-summary-en")!;
  const unknown = corpus.caseFile.cases.find((item) => item.id === "unknown-degree-en")!;
  const fixture = corpus.caseFile.cases.find((item) => item.fixture)!;
  const scores = [
    scoreCase({ caseDefinition: factual, turns: [{ response: "", retrieval: [{ source: "wordpress/page/27/en", similarity: 0.9 }] }] }),
    scoreCase({ caseDefinition: unknown, turns: [{ response: "not documented", retrieval: [] }] }),
    scoreCase({ caseDefinition: fixture, turns: [{ response: "unsupported", retrieval: [{ source: fixture.fixture!.sourceId, similarity: 0.99 }] }] }),
  ];
  assert.deepEqual(aggregateScores(scores).retrievalCaseHits, { numerator: 1, denominator: 1, notApplicable: 2 });
  assert.deepEqual(aggregateScores(scores).retrievalExpectedSourceHits, { numerator: 1, denominator: 1 });
});

test("primary retrieval scores only the final turn and keeps conversation-wide coverage diagnostic", async () => {
  const corpus = await corpusPromise;
  const definition = corpus.caseFile.cases.find((item) => item.id === "followup-careertalklab-stack-en")!;
  const expected = definition.expectedSourceIds[0];
  const firstOnly = scoreCase({
    caseDefinition: definition,
    turns: [
      { response: "first", retrieval: [{ source: expected, similarity: 0.9 }] },
      { response: "final", retrieval: [] },
    ],
  });
  assert.deepEqual(firstOnly.retrieval.matched, []);
  assert.deepEqual(firstOnly.retrieval.missing, [expected]);
  assert.deepEqual(firstOnly.conversationWideRetrieval.matched, [expected]);

  const finalOnly = scoreCase({
    caseDefinition: definition,
    turns: [
      { response: "first", retrieval: [] },
      { response: "final", retrieval: [{ source: expected, similarity: 0.9 }] },
    ],
  });
  assert.deepEqual(finalOnly.retrieval.matched, [expected]);
  assert.deepEqual(finalOnly.conversationWideRetrieval.matched, [expected]);
});

test("citation matching accepts correct EN/TR routes and rejects wrong routes", async () => {
  const corpus = await corpusPromise;
  const english = corpus.caseFile.cases.find((item) => item.id === "careertalklab-overview-en")!;
  const turkish = corpus.caseFile.cases.find((item) => item.id === "digital-transformation-tr")!;
  assert.equal(scoreCase({ caseDefinition: english, turns: [{ response: "[project](/projects/careertalklab)", retrieval: [] }] }).citations.matching, true);
  assert.equal(scoreCase({ caseDefinition: turkish, turns: [{ response: "[proje](https://johnserra.com/tr/projeler/dijital-donusum/)", retrieval: [] }] }).citations.matching, true);
  assert.equal(scoreCase({ caseDefinition: turkish, turns: [{ response: "[wrong](/projects/digital-transformation)", retrieval: [] }] }).citations.matching, false);
});

test("deterministic citation evaluation requires all expected paths, rejects unexpected johnserra.com paths, and handles edge cases", async () => {
  const corpus = await corpusPromise;
  const english = corpus.caseFile.cases.find((item) => item.id === "careertalklab-overview-en")!;
  const turkish = corpus.caseFile.cases.find((item) => item.id === "digital-transformation-tr")!;
  const multiSource = corpus.caseFile.cases.find((item) => item.id === "current-urban-mobility-role-en")!;

  // 1. Absolute and relative EN canonical URLs
  assert.equal(scoreCase({ caseDefinition: english, turns: [{ response: "[CTL](/projects/careertalklab)", retrieval: [] }] }).citations.matching, true);
  assert.equal(scoreCase({ caseDefinition: english, turns: [{ response: "[CTL](https://johnserra.com/projects/careertalklab)", retrieval: [] }] }).citations.matching, true);
  assert.equal(scoreCase({ caseDefinition: english, turns: [{ response: "[CTL](https://johnserra.com/projects/careertalklab/)", retrieval: [] }] }).citations.matching, true);
  assert.equal(scoreCase({ caseDefinition: english, turns: [{ response: "[CTL](https://www.johnserra.com/projects/careertalklab)", retrieval: [] }] }).citations.matching, true);

  // 2. Absolute and relative TR canonical URLs
  assert.equal(scoreCase({ caseDefinition: turkish, turns: [{ response: "[proje](/tr/projeler/dijital-donusum)", retrieval: [] }] }).citations.matching, true);
  assert.equal(scoreCase({ caseDefinition: turkish, turns: [{ response: "[proje](https://johnserra.com/tr/projeler/dijital-donusum/)", retrieval: [] }] }).citations.matching, true);

  // 3. Multiple required citations: all required must be cited, partial or unexpected fails
  const allCited = scoreCase({
    caseDefinition: multiSource,
    turns: [{ response: "Details in [post](/blog/orchestrating-agency-multi-track-world) and [about](https://johnserra.com/about).", retrieval: [] }],
  });
  assert.equal(allCited.citations.matching, true);
  assert.deepEqual(allCited.citations.missingExpectedPaths, []);
  assert.deepEqual(allCited.citations.unexpectedJohnSerraPaths, []);

  const partialCited = scoreCase({
    caseDefinition: multiSource,
    turns: [{ response: "Only mentioned in [post](/blog/orchestrating-agency-multi-track-world).", retrieval: [] }],
  });
  assert.equal(partialCited.citations.matching, false);
  assert.deepEqual(partialCited.citations.missingExpectedPaths, ["/about"]);

  const unexpectedCited = scoreCase({
    caseDefinition: multiSource,
    turns: [{ response: "[post](/blog/orchestrating-agency-multi-track-world), [about](/about), and [extra](/projects/careertalklab).", retrieval: [] }],
  });
  assert.equal(unexpectedCited.citations.matching, false);
  assert.deepEqual(unexpectedCited.citations.unexpectedJohnSerraPaths, ["/projects/careertalklab"]);
  assert.deepEqual(unexpectedCited.citations.missingExpectedPaths, []);

  // 4. Wrong locale routes fail
  const wrongLocaleEn = scoreCase({
    caseDefinition: english,
    turns: [{ response: "[project](/tr/projeler/careertalklab)", retrieval: [] }],
  });
  assert.equal(wrongLocaleEn.citations.matching, false);
  assert.deepEqual(wrongLocaleEn.citations.unexpectedJohnSerraPaths, ["/tr/projeler/careertalklab"]);
  assert.deepEqual(wrongLocaleEn.citations.missingExpectedPaths, ["/projects/careertalklab"]);

  // 5. Duplicate URLs succeed without penalization
  const duplicateCited = scoreCase({
    caseDefinition: english,
    turns: [{ response: "See [CTL](/projects/careertalklab) and [again](https://johnserra.com/projects/careertalklab).", retrieval: [] }],
  });
  assert.equal(duplicateCited.citations.matching, true);
  assert.deepEqual(duplicateCited.citations.missingExpectedPaths, []);
  assert.deepEqual(duplicateCited.citations.unexpectedJohnSerraPaths, []);

  // 6. Malformed and foreign URLs fail when expected citation is missing
  const foreignCited = scoreCase({
    caseDefinition: english,
    turns: [{ response: "See [example](https://example.com/some-page).", retrieval: [] }],
  });
  assert.equal(foreignCited.citations.matching, false);
  assert.deepEqual(foreignCited.citations.missingExpectedPaths, ["/projects/careertalklab"]);

  const malformedCited = scoreCase({
    caseDefinition: english,
    turns: [{ response: "Check [broken](not-a-valid-url) or [bad](http://).", retrieval: [] }],
  });
  assert.equal(malformedCited.citations.matching, false);
  assert.deepEqual(malformedCited.citations.missingExpectedPaths, ["/projects/careertalklab"]);

  // 7. No citation when required fails
  const noCitation = scoreCase({
    caseDefinition: english,
    turns: [{ response: "CareerTalkLab was built as an English learning platform.", retrieval: [] }],
  });
  assert.equal(noCitation.citations.present, false);
  assert.equal(noCitation.citations.matching, false);
  assert.deepEqual(noCitation.citations.urls, []);
  assert.deepEqual(noCitation.citations.missingExpectedPaths, ["/projects/careertalklab"]);
});

test("unknown cases require uncertainty and negated prohibited words become review flags", async () => {
  const corpus = await corpusPromise;
  const unknown = corpus.caseFile.cases.find((item) => item.id === "unknown-degree-en")!;
  const safe = scoreCase({
    caseDefinition: unknown,
    turns: [{ response: "I don't know whether I have an MBA; that degree is not documented.", retrieval: [] }],
  });
  assert.equal(safe.uncertainty.passed, true);
  assert.equal(safe.prohibitedClaims.violations, 0);
  assert.equal(safe.prohibitedClaims.reviewFlags, 1);
  const unsafe = scoreCase({ caseDefinition: unknown, turns: [{ response: "I earned an MBA.", retrieval: [] }] });
  assert.equal(unsafe.prohibitedClaims.violations, 1);
  assert.equal(unsafe.uncertainty.passed, false);
});

test("bad arguments never silently narrow coverage", () => {
  assert.throws(() => parseArguments(["--wat"]), /Unknown argument/);
  assert.throws(() => parseArguments(["--limit", "0"]), /positive integer/);
  assert.throws(() => parseArguments(["--case", "x", "--limit", "1"]), /cannot be combined/);
  assert.throws(() => parseArguments(["--validate", "--output", "tmp"]), /cannot be combined/);
  assert.deepEqual(parseArguments(["--case", "known"]), { validate: false, qualityGate: false, caseId: "known" });
});

test("follow-up history uses the generated prior answer, not hand-written assistant text", async () => {
  const corpus = await corpusPromise;
  const definition = structuredClone(corpus.caseFile.cases.find((item) => item.id === "followup-careertalklab-stack-en")!);
  const requests: Array<{ contents: Array<{ role: string; parts: Array<{ text: string }> }> }> = [];
  let generation = 0;
  const deps = fakeDependencies();
  deps.generateContentStream = async (request) => {
    requests.push(request);
    generation += 1;
    return (async function* () { yield { text: generation === 1 ? "ACTUAL FIRST ANSWER" : "SECOND ANSWER" }; })();
  };
  const result = await runCase(definition, deps, 100);
  assert.equal(result.turns.length, 2);
  assert.equal(requests[1].contents[1].role, "model");
  assert.equal(requests[1].contents[1].parts[0].text, "ACTUAL FIRST ANSWER");
  assert.equal(result.turns[1].historySent[1].content, "ACTUAL FIRST ANSWER");
});

test("the evaluator propagates one AbortSignal through embedding, RPC, and generation", async () => {
  const corpus = await corpusPromise;
  const definition = structuredClone(corpus.caseFile.cases[0]);
  definition.turns = [{ user: "one" }];
  const signals: AbortSignal[] = [];
  const deps = fakeDependencies();
  deps.embedQuery = async (_query, signal) => {
    assert.ok(signal);
    signals.push(signal);
    return [1];
  };
  deps.matchCareerContext = async (_request, signal) => {
    assert.ok(signal);
    signals.push(signal);
    return { data: [], error: null };
  };
  deps.generateContentStream = async (_request, signal) => {
    assert.ok(signal);
    signals.push(signal);
    return (async function* () { yield { text: "answer" }; })();
  };
  const result = await runCase(definition, deps, 100);
  assert.equal(result.turns[0].failure, undefined);
  assert.equal(signals.length, 3);
  assert.ok(signals.every((signal) => signal === signals[0]));
  assert.equal(signals[0].aborted, false);
});

test("the total turn deadline aborts embedding and RPC work", async () => {
  const corpus = await corpusPromise;
  const definition = structuredClone(corpus.caseFile.cases[0]);
  definition.turns = [{ user: "one" }];

  let embeddingAborted = false;
  const embedding = await runCase(definition, {
    ...fakeDependencies(),
    embedQuery: async (_query, signal) => new Promise<number[]>((_, reject) => {
      assert.ok(signal);
      signal.addEventListener("abort", () => {
        embeddingAborted = true;
        reject(signal.reason);
      }, { once: true });
    }),
  }, 15);
  assert.equal(embedding.turns[0].failure?.category, "timeout");
  assert.equal(embeddingAborted, true);

  let rpcAborted = false;
  const rpc = await runCase(definition, {
    ...fakeDependencies(),
    matchCareerContext: async (_request, signal) => new Promise((_, reject) => {
      assert.ok(signal);
      signal.addEventListener("abort", () => {
        rpcAborted = true;
        reject(signal.reason);
      }, { once: true });
    }),
  }, 15);
  assert.equal(rpc.turns[0].failure?.category, "timeout");
  assert.equal(rpcAborted, true);
});

test("retrieval and generation share one deadline and delayed generation stops on abort", async () => {
  const corpus = await corpusPromise;
  const definition = structuredClone(corpus.caseFile.cases[0]);
  definition.turns = [{ user: "one" }];
  let generationAborted = false;
  let backgroundCompletion = false;
  const started = Date.now();
  const result = await runCase(definition, {
    ...fakeDependencies(),
    async matchCareerContext() {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return { data: [], error: null };
    },
    async generateContentStream(_request, signal) {
      assert.ok(signal);
      return (async function* () {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            backgroundCompletion = true;
            resolve();
          }, 100);
          signal.addEventListener("abort", () => {
            clearTimeout(timer);
            generationAborted = true;
            reject(signal.reason);
          }, { once: true });
        });
        yield { text: "too late" };
      })();
    },
  }, 45);
  const elapsed = Date.now() - started;
  assert.equal(result.turns[0].failure?.category, "timeout");
  assert.equal(result.turns[0].failure?.stage, "generation");
  assert.equal(generationAborted, true);
  assert.ok(elapsed >= 35 && elapsed < 90, `turn took ${elapsed} ms`);
  await new Promise((resolve) => setTimeout(resolve, 110));
  assert.equal(backgroundCompletion, false);
});

test("an otherwise idle subprocess remains alive until the evaluation deadline fires", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "assistant-deadline-liveness-"));
  try {
    const loader = path.join(root, "node_modules/tsx/dist/loader.mjs");
    const runnerUrl = pathToFileURL(path.join(root, "scripts/evaluation/runner.ts")).href;
    const resultPath = path.join(directory, "result.txt");
    const script = `
      const { writeFile } = await import("node:fs/promises");
      const { runCase } = await import(${JSON.stringify(runnerUrl)});
      const definition = {
        id: "deadline-liveness", locale: "en", categories: ["test"], turns: [{ user: "x" }],
        expectedSourceIds: [], evidenceReferences: [], requiredFacts: [], prohibitedClaims: [],
        uncertainty: { required: false, patterns: [] }, citations: { required: false, expectedUrls: [] }
      };
      const dependencies = {
        embedQuery: () => new Promise(() => {}),
        matchCareerContext: async () => ({ data: [], error: null }),
        generateContentStream: async () => (async function* () {})()
      };
      const result = await runCase(definition, dependencies, 25);
      await writeFile(${JSON.stringify(resultPath)}, result.turns[0].failure?.category ?? "missing");
    `;
    const child = await runSubprocess(
      ["--import", loader, "--input-type=module", "--eval", script],
      { cwd: root, env: { ...process.env } },
    );
    assert.equal(child.code, 0, child.stderr);
    assert.equal(await readFile(resultPath, "utf8"), "timeout");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("partial, empty, and provider-error generation are recorded without fabricated answers", async () => {
  const corpus = await corpusPromise;
  const definition = structuredClone(corpus.caseFile.cases[0]);
  definition.turns = [{ user: "one" }];
  const partialDeps = fakeDependencies();
  partialDeps.generateContentStream = async () => (async function* () { yield { text: "partial" }; throw new Error("provider unavailable"); })();
  const partial = await runCase(definition, partialDeps, 100);
  assert.equal(partial.turns[0].response, "partial");
  assert.equal(partial.turns[0].failure?.category, "provider");
  const empty = await runCase(definition, { ...fakeDependencies(), async generateContentStream() { return (async function* () {})(); } }, 100);
  assert.equal(empty.turns[0].response, "");
  assert.equal(empty.turns[0].failure?.category, "empty_generation");
});

test("infrastructure-failed cases retain diagnostics but leave aggregate quality denominators", async () => {
  const corpus = await corpusPromise;
  const definitions = [0, 1].map((index) => {
    const item = structuredClone(corpus.caseFile.cases[0]);
    item.id = `aggregate-infrastructure-${index}`;
    item.turns = [{ user: `turn ${index}` }];
    return item;
  });
  const expectedSource = definitions[0].expectedSourceIds[0];
  let generation = 0;
  const evaluation = await runEvaluation(definitions, {
    ...fakeDependencies(),
    async matchCareerContext() {
      return {
        data: [{ source: expectedSource, content: "evidence", metadata: {}, similarity: 0.9 }],
        error: null,
      };
    },
    async generateContentStream() {
      generation += 1;
      if (generation === 1) {
        return (async function* () {
          yield { text: "partial retained" };
          throw new Error("provider unavailable");
        })();
      }
      return (async function* () { yield { text: "healthy" }; })();
    },
  }, 100);
  assert.equal(evaluation.results[0].turns[0].response, "partial retained");
  assert.equal(evaluation.results[0].score?.retrieval.matched.length, 1);
  assert.equal(evaluation.liveMetrics.excludedInfrastructureCases, 1);
  assert.deepEqual(evaluation.liveMetrics.retrievalCaseHits, { numerator: 1, denominator: 1, notApplicable: 0 });
  assert.equal(evaluation.liveMetrics.requiredFactCoverage.denominator, definitions[1].requiredFacts.length);
});

test("timeouts and mixed repeated infrastructure failures mark remaining cases not-run", async () => {
  const corpus = await corpusPromise;
  const definitions = corpus.caseFile.cases.slice(0, 3).map((item) => ({ ...structuredClone(item), turns: [{ user: "x" }] }));
  const never = new Promise<number[]>(() => undefined);
  const timed = await runCase(definitions[0], { ...fakeDependencies(), embedQuery: () => never }, 5);
  assert.equal(timed.turns[0].failure?.category, "timeout");
  const failed = await runEvaluation(definitions, { ...fakeDependencies(), async embedQuery() { throw new Error("quota exceeded"); } }, 20);
  assert.equal(failed.results[0].status, "executed");
  assert.equal(failed.results[1].status, "executed");
  assert.equal(failed.results[2].status, "not_run");
  assert.equal(failed.complete, false);
  assert.equal(failed.infrastructureFailures.length, 2);
});

test("incomplete error reports are dated, sanitized, and never overwritten", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "assistant-report-"));
  try {
    const base: BaselineReport = {
      schemaVersion: "1.0.0",
      metadata: {
        startedAt: "2026-09-09T00:00:00.000Z",
        completedAt: "2026-09-09T00:01:00.000Z",
        gitRevision: "abc",
        gitDirty: true,
        casesHash: "cases",
        corpusHash: "sources",
        sourceContentHashes: {},
        chatModel: "gemini-2.5-flash",
        embeddingModel: "gemini-embedding-2",
        embeddingDimensions: 768,
        retrievalThreshold: 0.65,
        retrievalCount: 6,
        executionMode: "live",
        availableCount: 3,
        requestedCount: 3,
        attemptedCount: 2,
        executedCount: 2,
        skippedCount: 0,
        notRunCount: 1,
        complete: false,
        qualityGateRequested: false,
        qualityGatePassed: false,
        scoringLimitations: ["Proxy only."],
      },
      metrics: { live: aggregateScores([]), syntheticFixtures: aggregateScores([]) },
      failures: [{ caseId: "a", stage: "generation", category: "quota" }],
      cases: [],
      humanReview: { status: "unreviewed", rubric: ["Check claims."] },
    };
    const first = await writeReports(base, directory);
    const second = await writeReports(base, directory);
    assert.notEqual(first.jsonPath, second.jsonPath);
    const json = JSON.parse(await readFile(first.jsonPath, "utf8")) as BaselineReport;
    const md = await readFile(first.markdownPath, "utf8");
    assert.equal(json.metadata.complete, false);
    assert.deepEqual(json.failures, [{ caseId: "a", stage: "generation", category: "quota" }]);
    assert.doesNotMatch(md, /provider unavailable|raw body/i);
    assert.match(md, /INCOMPLETE.*infrastructure run/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a fresh credential-free CLI subprocess writes a sanitized dated INCOMPLETE report", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "assistant-cli-missing-credentials-"));
  try {
    const corpusDirectory = path.join(directory, "evals/assistant");
    const reportDirectory = path.join(directory, "reports");
    await mkdir(corpusDirectory, { recursive: true });
    await copyFile(path.join(root, "evals/assistant/cases.json"), path.join(corpusDirectory, "cases.json"));
    await copyFile(path.join(root, "evals/assistant/sources.json"), path.join(corpusDirectory, "sources.json"));
    const environment = { ...process.env };
    delete environment.GEMINI_API_KEY;
    delete environment.NEXT_PUBLIC_SUPABASE_URL;
    delete environment.SUPABASE_SERVICE_ROLE_KEY;
    const child = await runSubprocess([
      "--import",
      path.join(root, "node_modules/tsx/dist/loader.mjs"),
      path.join(root, "scripts/evaluation/cli.ts"),
      "--limit",
      "1",
      "--output",
      reportDirectory,
    ], { cwd: directory, env: environment });
    assert.equal(child.code, 1);
    assert.doesNotMatch(`${child.stdout}\n${child.stderr}`, /api.?key.*required|raw provider|credential value/iu);
    const jsonName = (await readdir(reportDirectory)).find((name) => name.endsWith(".json"));
    assert.ok(jsonName);
    assert.match(jsonName, /^baseline-\d{4}-\d{2}-\d{2}T/);
    const rawReport = await readFile(path.join(reportDirectory, jsonName), "utf8");
    const report = JSON.parse(rawReport) as BaselineReport;
    assert.equal(report.metadata.complete, false);
    assert.equal(report.metadata.requestedCount, 1);
    assert.equal(report.metadata.attemptedCount, 0);
    assert.equal(report.metadata.executedCount, 0);
    assert.equal(report.metadata.notRunCount, 1);
    assert.deepEqual(report.failures, [{ caseId: "__evaluation__", stage: "initialization", category: "credential" }]);
    assert.equal(report.cases[0].notRunReason, "initialization_failure");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("an injected adapter initialization error is sanitized before report persistence", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "assistant-cli-adapter-error-"));
  try {
    const logs: string[] = [];
    let loaderCalls = 0;
    const exitCode = await runCli([
      "--case",
      "identity-professional-summary-en",
      "--output",
      directory,
    ], {
      repositoryRoot: root,
      environment: {
        NODE_ENV: "test",
        GEMINI_API_KEY: "test-only-value",
        NEXT_PUBLIC_SUPABASE_URL: "https://example.invalid",
        SUPABASE_SERVICE_ROLE_KEY: "test-only-value",
      },
      runtimeLoader: async () => {
        loaderCalls += 1;
        throw new Error("provider adapter raw response with secret material");
      },
      stdout: (message) => logs.push(message),
      stderr: (message) => logs.push(message),
    });
    assert.equal(exitCode, 1);
    assert.equal(loaderCalls, 1);
    const jsonName = (await readdir(directory)).find((name) => name.endsWith(".json"));
    assert.ok(jsonName);
    const rawReport = await readFile(path.join(directory, jsonName), "utf8");
    const report = JSON.parse(rawReport) as BaselineReport;
    assert.equal(report.metadata.attemptedCount, 0);
    assert.equal(report.metadata.notRunCount, 1);
    assert.deepEqual(report.failures, [{ caseId: "__evaluation__", stage: "initialization", category: "provider" }]);
    assert.doesNotMatch(`${logs.join("\n")}\n${rawReport}`, /raw response|secret material/iu);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
