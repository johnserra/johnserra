import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { CareerContextRpcInvoker } from "../../src/lib/chat/core";
import type { HybridRpcResult } from "../../src/lib/chat/retrieval";
import {
  loadAndValidateRetrievalCorpus,
  runRetrievalEvaluation,
  validateRetrievalCorpus,
  validateRetrievalSourceManifest,
  type RetrievalEvalCase,
  type RetrievalEvalDependencies,
  type ValidatedRetrievalCorpus,
} from "./retrieval";
import { hasExactToken } from "../../src/lib/chat/retrieval";
import { parseRetrievalArguments } from "./retrieval-cli";

const root = process.cwd();
const corpusPromise = loadAndValidateRetrievalCorpus(
  `${root}/evals/retrieval/cases.json`,
  `${root}/evals/retrieval/sources.json`,
);

function fakeDeps(opts: {
  embedding?: number[];
  hybridResult?: HybridRpcResult;
  throwOnEmbed?: Error;
  throwOnRpc?: unknown;
  invokeFilteredRpc?: CareerContextRpcInvoker;
} = {}) {
  return {
    embedQuery: async () => {
      if (opts.throwOnEmbed) throw opts.throwOnEmbed;
      return opts.embedding ?? [1];
    },
    invokeHybridRpc: async () => {
      if (opts.throwOnRpc) throw opts.throwOnRpc;
      return opts.hybridResult ?? { data: [], error: null };
    },
    ...(opts.invokeFilteredRpc ? { invokeFilteredRpc: opts.invokeFilteredRpc } : {}),
  };
}

function evaluateCases(
  corpus: ValidatedRetrievalCorpus,
  cases: RetrievalEvalCase[],
  dependencies: RetrievalEvalDependencies,
  options: { deadlineMs?: number } = {},
) {
  return runRetrievalEvaluation(corpus, dependencies, {
    ...options,
    caseIds: cases.map((testCase) => testCase.id),
  });
}

function hybridResult(sources: Array<{ source: string; content: string; metadata?: Record<string, unknown> }>): HybridRpcResult {
  return {
    data: sources.map((s, i) => ({
      id: i + 1,
      source: s.source,
      content: s.content,
      metadata: s.metadata ?? {},
      semantic_similarity: 0.8,
      lexical_rank: i + 1,
      final_rank: i + 1,
      fusion_score: 0.1,
    })),
    error: null,
  };
}

test("retrieval corpus validates all source references and coverage requirements", async () => {
  const corpus = await corpusPromise;
  assert.ok(corpus.caseFile.cases.length >= 10);
  assert.ok(corpus.caseFile.cases.filter((c) => c.locale === "tr").length >= 3);
  assert.ok(corpus.caseFile.cases.filter((c) => c.categories.includes("followup")).length >= 2);
  assert.ok(corpus.caseFile.cases.filter((c) => c.categories.includes("unknown")).length >= 1);
  assert.ok(corpus.caseFile.cases.some((c) => c.categories.includes("date")));
  for (const c of corpus.caseFile.cases) {
    for (const sid of c.expectedSourceIds) {
      assert.ok(corpus.sourceManifest.sources.some((s) => s.sourceId === sid), `Case ${c.id} references unknown source ${sid}`);
    }
  }
});

test("retrieval corpus rejects a corpus with no date case", async () => {
  const corpus = await corpusPromise;
  const withoutDate = structuredClone(corpus.caseFile);
  const dateCase = withoutDate.cases.find((c) => c.categories.includes("date"));
  assert.ok(dateCase);
  dateCase.categories = dateCase.categories.filter((category) => category !== "date");
  assert.throws(
    () => validateRetrievalCorpus(withoutDate, corpus.sourceManifest),
    /at least 1 date case/,
  );
});

test("malformed retrieval cases and stale sources fail visibly", async () => {
  const corpus = await corpusPromise;
  const malformed = structuredClone(corpus.caseFile) as unknown as { schemaVersion: string; cases: unknown[] };
  malformed.cases[0] = { ...malformed.cases[0] as object, locale: "fr" };
  assert.throws(() => validateRetrievalCorpus(malformed, corpus.sourceManifest), /invalid locale/);
  malformed.cases[0] = { ...corpus.caseFile.cases[0], expectedSourceIds: ["wordpress/nonexistent/1/en"] };
  assert.throws(() => validateRetrievalCorpus(malformed, corpus.sourceManifest), /unknown source/);
  malformed.schemaVersion = "0";
  assert.throws(() => validateRetrievalCorpus(malformed, corpus.sourceManifest), /schemaVersion/);
});

test("retrieval CLI arguments are validated", () => {
  assert.deepEqual(parseRetrievalArguments(["--validate"]), { mode: "validate" });
  assert.deepEqual(parseRetrievalArguments(["--live", "--limit", "5"]), { mode: "live", limit: 5 });
  assert.throws(() => parseRetrievalArguments([]), /exactly one/);
  assert.throws(() => parseRetrievalArguments(["--live", "--validate"]), /exactly one/);
  assert.throws(() => parseRetrievalArguments(["--live", "--limit", "0"]), /between 1/);
  assert.throws(() => parseRetrievalArguments(["--validate", "--case", "x"]), /cannot be combined/);
  assert.throws(() => parseRetrievalArguments(["--wat"]), /Unknown argument/);
});

test("reports preserve validated corpus provenance and hash the exact selection", async () => {
  const corpus = await corpusPromise;
  const selected = [corpus.caseFile.cases[2], corpus.caseFile.cases[0]];
  const report = await evaluateCases(corpus, selected, fakeDeps());
  const expectedSelectionHash = createHash("sha256")
    .update(JSON.stringify(selected))
    .digest("hex");

  assert.equal(report.corpusVersion, corpus.caseFile.corpusVersion);
  assert.equal(report.casesHash, corpus.casesHash);
  assert.equal(report.sourcesHash, corpus.sourcesHash);
  assert.match(report.casesHash, /^[a-f0-9]{64}$/);
  assert.match(report.sourcesHash, /^[a-f0-9]{64}$/);
  assert.equal(report.corpusCaseCount, corpus.caseFile.cases.length);
  assert.equal(report.corpusSourceCount, corpus.sourceManifest.sources.length);
  assert.deepEqual(report.selectedCaseIds, selected.map((testCase) => testCase.id));
  assert.equal(report.selectedCaseCount, selected.length);
  assert.equal(report.selectionHash, expectedSelectionHash);
});

test("selection rejects missing and duplicate case IDs", async () => {
  const corpus = await corpusPromise;
  const id = corpus.caseFile.cases[0].id;
  await assert.rejects(
    runRetrievalEvaluation(corpus, fakeDeps(), { caseIds: [id, id] }),
    /Duplicate retrieval case selection/,
  );
  await assert.rejects(
    runRetrievalEvaluation(corpus, fakeDeps(), { caseIds: ["not-in-corpus"] }),
    /Unknown retrieval case ID/,
  );
});

test("evaluation refuses empty hashes or mismatched validated corpus versions", async () => {
  const corpus = await corpusPromise;
  await assert.rejects(
    runRetrievalEvaluation({ ...corpus, casesHash: "" }, fakeDeps()),
    /must include SHA-256 case and source hashes/,
  );
  await assert.rejects(
    runRetrievalEvaluation({
      ...corpus,
      sourceManifest: { ...corpus.sourceManifest, corpusVersion: "different-version" },
    }, fakeDeps()),
    /versions do not match/,
  );
});

test("expected-source recall counts source IDs not chunks", async () => {
  const corpus = await corpusPromise;
  const testCase = corpus.caseFile.cases.find((c) => c.expectedSourceIds.length === 1)!;
  const deps = fakeDeps({
    hybridResult: hybridResult([
      { source: testCase.expectedSourceIds[0], content: "relevant" },
      { source: "wordpress/post/999/en", content: "irrelevant" },
    ]),
  });
  const report = await evaluateCases(corpus, [testCase], deps);
  assert.equal(report.results[0].status, "completed");
  assert.equal(report.results[0].outcome, "hybrid_success");
  assert.equal(report.results[0].recall, 1.0);
  assert.equal(report.results[0].expectedHits.length, 1);
  assert.equal(report.results[0].precisionProxy, 0.5);
  assert.equal(report.aggregateRecall.numerator, 1);
  assert.equal(report.aggregateRecall.denominator, 1);
});

test("unknown case with no expected sources has recall=1 and precision=1 on empty retrieval", async () => {
  const corpus = await corpusPromise;
  const unknownCase = corpus.caseFile.cases.find((c) => c.categories.includes("unknown"))!;
  const deps = fakeDeps({ hybridResult: { data: [], error: null } });
  const report = await evaluateCases(corpus, [unknownCase], deps);
  assert.equal(report.results[0].recall, 1);
  assert.equal(report.results[0].precisionProxy, 1);
  assert.equal(report.results[0].expectedMisses.length, 0);
});

test("missing expected source is reported as a miss, not silently ignored", async () => {
  const corpus = await corpusPromise;
  const testCase = corpus.caseFile.cases.find((c) => c.expectedSourceIds.length === 1)!;
  const deps = fakeDeps({
    hybridResult: hybridResult([{ source: "wordpress/post/999/en", content: "wrong" }]),
  });
  const report = await evaluateCases(corpus, [testCase], deps);
  assert.equal(report.results[0].recall, 0);
  assert.deepEqual(report.results[0].expectedMisses, [testCase.expectedSourceIds[0]]);
  assert.equal(report.results[0].expectedHits.length, 0);
});

test("multi-source case counts each expected source independently", async () => {
  const corpus = await corpusPromise;
  const multiCase = corpus.caseFile.cases.find((c) => c.expectedSourceIds.length === 2)!;
  if (!multiCase) return;
  const deps = fakeDeps({
    hybridResult: hybridResult([
      { source: multiCase.expectedSourceIds[0], content: "first" },
      { source: "wordpress/post/999/en", content: "irrelevant" },
    ]),
  });
  const report = await evaluateCases(corpus, [multiCase], deps);
  assert.equal(report.results[0].recall, 0.5);
  assert.equal(report.results[0].expectedHits.length, 1);
  assert.equal(report.results[0].expectedMisses.length, 1);
});

test("embedding failure is visibly degraded lexical fallback, not hybrid success", async () => {
  const corpus = await corpusPromise;
  const [testCase] = corpus.caseFile.cases;
  const deps = fakeDeps({ throwOnEmbed: new Error("embedding provider failed") });
  const report = await evaluateCases(corpus, [testCase], deps);
  assert.equal(report.results[0].status, "degraded");
  assert.equal(report.results[0].outcome, "lexical_fallback");
  assert.equal(report.results[0].retrievedSources.length, 0);
  assert.equal(report.completed, 0);
  assert.equal(report.degraded, 1);
  assert.equal(report.complete, false);
  assert.equal(report.aggregateRecall.denominator, 0);
  assert.equal(report.excludedMisses.degraded, testCase.expectedSourceIds.length);
});

test("filtered and legacy semantic fallbacks are degraded and explicitly labeled", async () => {
  const corpus = await corpusPromise;
  const [filteredCase, legacyCase] = corpus.caseFile.cases;
  const expectedMatch = {
    source: filteredCase.expectedSourceIds[0],
    content: "matching filtered content",
    metadata: {},
    similarity: 0.8,
  };
  const missingRpc = { code: "PGRST202" };

  const filteredReport = await evaluateCases(corpus, [filteredCase], fakeDeps({
    hybridResult: { data: null, error: missingRpc },
    invokeFilteredRpc: async (name) => {
      assert.equal(name, "match_career_context_filtered");
      return { data: [expectedMatch], error: null };
    },
  }));
  assert.equal(filteredReport.results[0].status, "degraded");
  assert.equal(filteredReport.results[0].outcome, "filtered_semantic_fallback");
  assert.equal(filteredReport.complete, false);

  const rpcNames: string[] = [];
  const legacyReport = await evaluateCases(corpus, [legacyCase], fakeDeps({
    hybridResult: { data: null, error: missingRpc },
    invokeFilteredRpc: async (name) => {
      rpcNames.push(name);
      if (name === "match_career_context_filtered") return { data: null, error: missingRpc };
      return { data: [], error: null };
    },
  }));
  assert.deepEqual(rpcNames, ["match_career_context_filtered", "match_career_context"]);
  assert.equal(legacyReport.results[0].status, "degraded");
  assert.equal(legacyReport.results[0].outcome, "legacy_semantic_fallback");
  assert.equal(legacyReport.complete, false);
});

test("returned retrieval errors are failed cases with sanitized stable reasons", async () => {
  const corpus = await corpusPromise;
  const [testCase] = corpus.caseFile.cases;
  const secret = "sk-live-sensitive-value";
  const report = await evaluateCases(corpus, [testCase], fakeDeps({
    hybridResult: { data: null, error: new Error(`database exploded ${secret}`) },
  }));

  assert.equal(report.results[0].status, "failed");
  assert.equal(report.results[0].outcome, "retrieval_failure");
  assert.equal(report.results[0].category, "provider");
  assert.equal(report.results[0].reason, "retrieval_provider_error");
  assert.equal(report.failed, 1);
  assert.equal(report.complete, false);
  assert.doesNotMatch(JSON.stringify(report), new RegExp(secret));
});

test("auth and quota failures stop remaining cases without retrying", async () => {
  const corpus = await corpusPromise;
  const [first, second] = corpus.caseFile.cases;
  const deps = fakeDeps({ throwOnRpc: new Error("401 unauthorized API key") });
  const report = await evaluateCases(corpus, [first, second], deps);
  assert.equal(report.results[0].status, "failed");
  assert.equal(report.results[0].category, "credential");
  assert.equal(report.results[1].status, "skipped");
  assert.equal(report.results[1].reason, "stopped_after_auth_or_quota_failure");
  assert.equal(report.results[0].reason, "credential_error");
  assert.equal(report.attempted, 1);
  assert.equal(report.failed, 1);
  assert.equal(report.skipped, 1);
  assert.equal(report.attempted, report.completed + report.degraded + report.failed);
  assert.equal(report.selectedCaseCount, report.attempted + report.skipped);
  assert.equal(report.complete, false);
});

test("case deadline settles when a dependency ignores AbortSignal", async () => {
  const corpus = await corpusPromise;
  const [testCase] = corpus.caseFile.cases;
  const deps: RetrievalEvalDependencies = {
    embedQuery: async () => new Promise<number[]>(() => undefined),
    invokeHybridRpc: async () => ({ data: [], error: null }),
  };
  const started = Date.now();
  const report = await evaluateCases(corpus, [testCase], deps, { deadlineMs: 10 });
  const elapsed = Date.now() - started;
  assert.equal(report.results[0].status, "failed");
  assert.equal(report.results[0].category, "timeout");
  assert.equal(report.results[0].reason, "evaluation_deadline_exceeded");
  assert.ok(elapsed < 250, `ignored-signal dependency settled too slowly: ${elapsed}ms`);
});

test("success aggregates exclude degraded, failed, and skipped cases and retain their misses", async () => {
  const corpus = await corpusPromise;
  const selected = corpus.caseFile.cases.filter((testCase) => testCase.expectedSourceIds.length > 0).slice(0, 4);
  let embedCall = 0;
  let rpcCall = 0;
  const deps: RetrievalEvalDependencies = {
    embedQuery: async () => {
      embedCall += 1;
      if (embedCall === 2) throw new Error("embedding unavailable");
      return [1];
    },
    invokeHybridRpc: async () => {
      rpcCall += 1;
      if (rpcCall === 1) {
        return hybridResult([{ source: selected[0].expectedSourceIds[0], content: "success" }]);
      }
      if (rpcCall === 3) throw new Error("401 credential refused secret-value");
      return { data: [], error: null };
    },
  };
  const report = await evaluateCases(corpus, selected, deps);

  assert.deepEqual(report.results.map((result) => result.status), ["completed", "degraded", "failed", "skipped"]);
  assert.equal(report.attempted, 3);
  assert.equal(report.completed, 1);
  assert.equal(report.degraded, 1);
  assert.equal(report.failed, 1);
  assert.equal(report.skipped, 1);
  assert.equal(report.attempted, report.completed + report.degraded + report.failed);
  assert.equal(report.selectedCaseCount, report.attempted + report.skipped);
  assert.deepEqual(report.aggregateRecall, { numerator: 1, denominator: 1 });
  assert.deepEqual(report.aggregatePrecisionProxy, { numerator: 1, denominator: 1 });
  assert.equal(report.excludedMisses.degraded, selected[1].expectedSourceIds.length);
  assert.equal(report.excludedMisses.failed, selected[2].expectedSourceIds.length);
  assert.equal(report.excludedMisses.skipped, selected[3].expectedSourceIds.length);
  assert.equal(
    report.excludedMisses.total,
    report.excludedMisses.degraded + report.excludedMisses.failed + report.excludedMisses.skipped,
  );
});

test("source manifest validation rejects duplicates and bad locales", async () => {
  const corpus = await corpusPromise;
  const clone = structuredClone(corpus.sourceManifest) as unknown as Record<string, unknown>;
  const sources = clone.sources as Array<Record<string, unknown>>;
  sources[0] = { ...sources[0], locale: "fr" };
  assert.throws(() => validateRetrievalSourceManifest(clone), /invalid locale/);
  const dup = structuredClone(corpus.sourceManifest);
  (dup as unknown as { sources: Array<{ sourceId: string }> }).sources[1].sourceId = dup.sources[0].sourceId;
  assert.throws(() => validateRetrievalSourceManifest(dup), /Duplicate sourceId/);
});

test("report labels precision as proxy and evidence as retrieval-only", async () => {
  const corpus = await corpusPromise;
  const [testCase] = corpus.caseFile.cases;
  const deps = fakeDeps({ hybridResult: { data: [], error: null } });
  const report = await evaluateCases(corpus, [testCase], deps);
  assert.equal(report.evidence, "retrieval_only");
  assert.equal(report.answerQuality, "not_evaluated");
  assert.ok(report.limitations.some((l) => l.includes("proxy")));
  assert.ok(report.limitations.some((l) => l.includes("not human semantic precision")));
});

test("coverage counts query terms in retrieved content", async () => {
  const corpus = await corpusPromise;
  const testCase = corpus.caseFile.cases.find((c) => c.queryTerms.length > 0)!;
  const term = testCase.queryTerms[0];
  const deps = fakeDeps({
    hybridResult: hybridResult([
      { source: testCase.expectedSourceIds[0] ?? "wordpress/post/32/en", content: `This mentions ${term} in the content.` },
    ]),
  });
  const report = await evaluateCases(corpus, [testCase], deps);
  assert.ok(report.results[0].coverage > 0, "coverage should be > 0 when query terms appear in content");
});

test("coverage uses exact token boundaries for short terms and Next.js", () => {
  assert.equal(hasExactToken("internet", "net"), false);
  assert.equal(hasExactToken("Built with Next.js", "Next.js"), true);
  assert.equal(hasExactToken(`${"x".repeat(600)} March 2020`, "March 2020"), true);
});
