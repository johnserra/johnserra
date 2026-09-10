import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  RETRIEVAL_COUNT,
  RETRIEVAL_THRESHOLD,
  type CareerContextMatch,
} from "../../src/lib/chat/core";
import { cvApprovalDigest, loadRegisteredCv } from "../../src/lib/knowledge/cv";
import {
  isExpectedSectionHit,
  parseCvEvaluationArguments,
  runCvEvaluationCases,
  validateCvCases,
  type CvEvaluationCase,
} from "./cv-cli";

const CURRENT_DIGEST = "a".repeat(64);

function currentMatch(testCase: CvEvaluationCase, digest = CURRENT_DIGEST): CareerContextMatch {
  return {
    source: testCase.expected_source_id,
    content: "retrieved content",
    metadata: { content_sha256: digest },
    similarity: 0.9,
  };
}

test("CV evaluation corpus validates exact section identities with English and Turkish coverage", async () => {
  const document = await loadRegisteredCv();
  const raw = JSON.parse(await readFile("evals/cv/cases.json", "utf8"));
  const cases = validateCvCases(raw, new Set(document.sections.map((section) => section.id)));
  assert.equal(cases.length, 12);
  assert.ok(cases.some((item) => item.locale === "tr"));
  assert.ok(cases.every((item) => item.expected_source_id.endsWith(`/${item.expected_section_id}`)));
  assert.equal(isExpectedSectionHit(cases[0], [currentMatch(cases[0])], CURRENT_DIGEST), true);
  assert.equal(isExpectedSectionHit(cases[0], [{ ...currentMatch(cases[0]), source: "cv/john-serra/en" }], CURRENT_DIGEST), false);
});

test("CV evaluation validator rejects shared document IDs and unknown fields", async () => {
  const document = await loadRegisteredCv();
  const raw = JSON.parse(await readFile("evals/cv/cases.json", "utf8"));
  raw.cases[0].expected_source_id = "cv/john-serra/en";
  assert.throws(() => validateCvCases(raw, new Set(document.sections.map((section) => section.id))), /exact section/);
  const fresh = JSON.parse(await readFile("evals/cv/cases.json", "utf8"));
  fresh.cases[0].answer = "not part of retrieval validation";
  assert.throws(() => validateCvCases(fresh, new Set(document.sections.map((section) => section.id))), /unknown fields/);
});

test("CV evaluation live mode is explicit and strictly bounded", () => {
  assert.deepEqual(parseCvEvaluationArguments(["--validate"]), { mode: "validate" });
  assert.deepEqual(parseCvEvaluationArguments(["--live", "--limit", "2"]), { mode: "live", limit: 2 });
  assert.throws(() => parseCvEvaluationArguments([]), /exactly one/);
  assert.throws(() => parseCvEvaluationArguments(["--live", "--validate"]), /exactly one/);
  assert.throws(() => parseCvEvaluationArguments(["--live", "--limit", "13"]), /between 1 and 12/);
  assert.throws(() => parseCvEvaluationArguments(["--validate", "--case", "x"]), /cannot be combined/);
});

test("bounded runner counts embed and RPC failures at their actual call sites", async () => {
  const document = await loadRegisteredCv();
  const raw = JSON.parse(await readFile("evals/cv/cases.json", "utf8"));
  const [testCase] = validateCvCases(raw, new Set(document.sections.map((section) => section.id)));

  const embedFailure = await runCvEvaluationCases([testCase], {
    async embedQuery() { throw new Error("embedding provider failed"); },
    async invokeRpc() { throw new Error("must not be called"); },
  }, { canonicalApprovalDigest: CURRENT_DIGEST });
  assert.equal(embedFailure.embeddingCalls, 1);
  assert.equal(embedFailure.retrievalRpcCalls, 0);
  assert.equal(embedFailure.results[0].category, "provider");

  const rpcFailure = await runCvEvaluationCases([testCase], {
    async embedQuery() { return [1]; },
    async invokeRpc() { return { data: null, error: { message: "ordinary RPC error" } }; },
  }, { canonicalApprovalDigest: CURRENT_DIGEST });
  assert.equal(rpcFailure.embeddingCalls, 1);
  assert.equal(rpcFailure.retrievalRpcCalls, 1);
  assert.equal(rpcFailure.results[0].category, "provider");
});

test("auth and quota failures stop remaining cases without retrying", async () => {
  const document = await loadRegisteredCv();
  const raw = JSON.parse(await readFile("evals/cv/cases.json", "utf8"));
  const cases = validateCvCases(raw, new Set(document.sections.map((section) => section.id))).slice(0, 2);
  for (const failure of ["401 unauthorized API key", "429 quota resource exhausted"]) {
    const report = await runCvEvaluationCases(cases, {
      async embedQuery() { return [1]; },
      async invokeRpc() { return { data: null, error: { message: failure } }; },
    }, { canonicalApprovalDigest: CURRENT_DIGEST });
    assert.equal(report.attempted, 1);
    assert.equal(report.skipped, 1);
    assert.equal(report.embeddingCalls, 1);
    assert.equal(report.retrievalRpcCalls, 1);
    assert.equal(report.results[1].reason, "stopped_after_auth_or_quota_failure");
  }
});

test("deadline abort is bounded and stale same-section digest is not a current-source hit", async () => {
  const document = await loadRegisteredCv();
  const canonicalDigest = cvApprovalDigest(document);
  const raw = JSON.parse(await readFile("evals/cv/cases.json", "utf8"));
  const [testCase] = validateCvCases(raw, new Set(document.sections.map((section) => section.id)));

  let observedSignal: AbortSignal | undefined;
  const timedOut = await runCvEvaluationCases([testCase], {
    embedQuery(_query, signal) {
      observedSignal = signal;
      return new Promise(() => {});
    },
    async invokeRpc() { throw new Error("must not be called"); },
  }, { canonicalApprovalDigest: canonicalDigest, deadlineMs: 5 });
  assert.equal(observedSignal?.aborted, true);
  assert.equal(timedOut.results[0].category, "timeout");
  assert.equal(timedOut.retrievalRpcCalls, 0);

  let rpcName = "";
  let rpcRequest: unknown;
  const stale = await runCvEvaluationCases([testCase], {
    async embedQuery() { return [7]; },
    async invokeRpc(name, request) {
      rpcName = name;
      rpcRequest = request;
      return { data: [currentMatch(testCase, "b".repeat(64))], error: null };
    },
  }, {
    canonicalApprovalDigest: canonicalDigest,
    now: () => new Date("2026-09-10T12:00:00.000Z"),
  });
  assert.equal(rpcName, "match_career_context_filtered");
  assert.deepEqual(rpcRequest, {
    query_embedding: [7],
    query_locale: testCase.locale,
    match_threshold: RETRIEVAL_THRESHOLD,
    match_count: RETRIEVAL_COUNT,
    filter_document_type: null,
    filter_organization: null,
    filter_role: null,
    filter_visibility: "public",
  });
  assert.equal(stale.timestamp, "2026-09-10T12:00:00.000Z");
  assert.equal(stale.canonicalApprovalDigest, canonicalDigest);
  assert.equal(stale.evidence, "retrieval_only");
  assert.equal(stale.answerQuality, "not_evaluated");
  assert.equal(stale.embeddingCalls, 1);
  assert.equal(stale.retrievalRpcCalls, 1);
  assert.equal(stale.sectionHits, 0);
  assert.equal(stale.results[0].hit, false);
  assert.deepEqual(stale.results[0].returnedIdentities, [{
    source: testCase.expected_source_id,
    approvalDigest: "b".repeat(64),
  }]);
});
