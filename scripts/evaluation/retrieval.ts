import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { RETRIEVAL_COUNT, RETRIEVAL_THRESHOLD, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from "../../src/lib/chat/config";
import type { ChatMessage, CareerContextMatch } from "../../src/lib/chat/core";
import type { HybridRpcRequest, HybridRpcResult, HybridRetrievalDependencies, HybridRetrievalDiagnostics } from "../../src/lib/chat/retrieval";
import { hasExactToken, performHybridRetrieval } from "../../src/lib/chat/retrieval";

export const RETRIEVAL_EVAL_SCHEMA_VERSION = "1.0.0";
export const RETRIEVAL_EVAL_DEADLINE_MS = 15_000;
export const RETRIEVAL_EVAL_MAX_CASES = 20;

export interface RetrievalEvalSource {
  sourceId: string;
  locale: "en" | "tr";
  type: string;
  title: string;
  slug: string;
  canonicalUrl: string;
  keywords: string[];
}

export interface RetrievalEvalSourceManifest {
  schemaVersion: string;
  corpusVersion: string;
  generatedAt: string;
  normalization: string;
  scope: string;
  sources: RetrievalEvalSource[];
}

export interface RetrievalEvalCase {
  id: string;
  locale: "en" | "tr";
  categories: string[];
  conversation: Array<{ role: "user" | "assistant"; content: string }>;
  expectedSourceIds: string[];
  queryTerms: string[];
  conversationNote?: string;
  localeNote?: string;
  unknownNote?: string;
}

export interface RetrievalEvalCaseFile {
  schemaVersion: string;
  corpusVersion: string;
  generatedAt: string;
  cases: RetrievalEvalCase[];
}

export interface ValidatedRetrievalCorpus {
  caseFile: RetrievalEvalCaseFile;
  sourceManifest: RetrievalEvalSourceManifest;
  casesHash: string;
  sourcesHash: string;
}

export type RetrievalEvalStatus = "completed" | "degraded" | "failed" | "skipped";
export type RetrievalEvalOutcome =
  | "hybrid_success"
  | "lexical_fallback"
  | "filtered_semantic_fallback"
  | "legacy_semantic_fallback"
  | "retrieval_failure"
  | "not_attempted";
export type RetrievalEvalFailureCategory = "credential" | "quota" | "timeout" | "provider";

export interface RetrievalEvalCaseResult {
  id: string;
  locale: string;
  categories: string[];
  status: RetrievalEvalStatus;
  outcome: RetrievalEvalOutcome;
  expectedSourceIds: string[];
  retrievedSources: string[];
  expectedHits: string[];
  expectedMisses: string[];
  recall: number;
  precisionProxy: number;
  queryTerms: string[];
  coverage: number;
  category?: RetrievalEvalFailureCategory;
  reason?: string;
  diagnostics?: HybridRetrievalDiagnostics;
}

export interface RetrievalEvalReport {
  timestamp: string;
  evidence: "retrieval_only";
  answerQuality: "not_evaluated";
  corpusVersion: string;
  casesHash: string;
  sourcesHash: string;
  corpusCaseCount: number;
  corpusSourceCount: number;
  selectedCaseIds: string[];
  selectedCaseCount: number;
  selectionHash: string;
  embeddingModel: string;
  embeddingDimensions: number;
  retrievalThreshold: number;
  retrievalCount: number;
  hybridRpc: string;
  complete: boolean;
  attempted: number;
  completed: number;
  degraded: number;
  failed: number;
  skipped: number;
  aggregateRecall: { numerator: number; denominator: number };
  aggregatePrecisionProxy: { numerator: number; denominator: number };
  excludedMisses: {
    degraded: number;
    failed: number;
    skipped: number;
    total: number;
  };
  results: RetrievalEvalCaseResult[];
  limitations: string[];
}

export interface RetrievalEvalDependencies {
  embedQuery(query: string, signal: AbortSignal): Promise<number[]>;
  invokeHybridRpc: (request: HybridRpcRequest, signal?: AbortSignal) => Promise<HybridRpcResult>;
  invokeFilteredRpc?: HybridRetrievalDependencies["invokeFilteredRpc"];
  rewriteAdapter?: HybridRetrievalDependencies["rewriteAdapter"];
}

function nonempty(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
  return value;
}

export function validateRetrievalCorpus(
  caseFile: unknown,
  sourceManifest: RetrievalEvalSourceManifest,
): RetrievalEvalCaseFile {
  const root = caseFile as Record<string, unknown>;
  if (!root || typeof root !== "object") throw new Error("Retrieval case file must be an object.");
  if (root.schemaVersion !== RETRIEVAL_EVAL_SCHEMA_VERSION) {
    throw new Error(`Unsupported retrieval case schemaVersion; expected ${RETRIEVAL_EVAL_SCHEMA_VERSION}.`);
  }
  if (!Array.isArray(root.cases)) throw new Error("cases must be an array.");
  const sources = new Map(sourceManifest.sources.map((s) => [s.sourceId, s]));
  const ids = new Set<string>();
  const cases: RetrievalEvalCase[] = root.cases.map((item, index) => {
    const entry = item as Record<string, unknown>;
    if (!entry || typeof entry !== "object") throw new Error(`cases[${index}] must be an object.`);
    const id = nonempty(entry.id, `cases[${index}].id`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error(`Case ${id} must use kebab-case ID.`);
    if (ids.has(id)) throw new Error(`Duplicate case ID: ${id}.`);
    ids.add(id);
    const locale = entry.locale;
    if (locale !== "en" && locale !== "tr") throw new Error(`Case ${id} has an invalid locale.`);
    const categories = Array.isArray(entry.categories) ? entry.categories : undefined;
    if (!Array.isArray(categories) || !categories.length) throw new Error(`Case ${id} must have categories.`);
    const conversation = entry.conversation;
    if (!Array.isArray(conversation) || !conversation.length) throw new Error(`Case ${id} must have a conversation.`);
    const turns = conversation.map((turn: unknown, turnIndex: number) => {
      const t = turn as Record<string, unknown>;
      if (!t || typeof t !== "object") throw new Error(`Case ${id}.turns[${turnIndex}] must be an object.`);
      if (t.role !== "user" && t.role !== "assistant") throw new Error(`Case ${id}.turns[${turnIndex}].role must be user or assistant.`);
      return { role: t.role as "user" | "assistant", content: nonempty(t.content, `Case ${id}.turns[${turnIndex}].content`) };
    });
    if (!turns.some((t) => t.role === "user")) throw new Error(`Case ${id} must have at least one user turn.`);
    const expectedSourceIds = Array.isArray(entry.expectedSourceIds) ? entry.expectedSourceIds : undefined;
    if (!Array.isArray(expectedSourceIds)) throw new Error(`Case ${id} must have expectedSourceIds array.`);
    for (const sid of expectedSourceIds) {
      if (!sources.has(sid)) throw new Error(`Case ${id} expects unknown source ${sid}.`);
      const source = sources.get(sid)!;
      if (source.locale !== locale && !(locale === "tr" && source.type === "cv")) {
        throw new Error(`Case ${id} expects ${sid} with incompatible locale.`);
      }
    }
    const queryTerms = Array.isArray(entry.queryTerms) ? entry.queryTerms : [];
    return {
      id,
      locale: locale as "en" | "tr",
      categories: categories as string[],
      conversation: turns,
      expectedSourceIds: expectedSourceIds as string[],
      queryTerms: queryTerms as string[],
      ...(entry.conversationNote ? { conversationNote: nonempty(entry.conversationNote, `${id}.conversationNote`) } : {}),
      ...(entry.localeNote ? { localeNote: nonempty(entry.localeNote, `${id}.localeNote`) } : {}),
      ...(entry.unknownNote ? { unknownNote: nonempty(entry.unknownNote, `${id}.unknownNote`) } : {}),
    };
  });
  if (cases.length < 10) throw new Error(`Retrieval corpus must have at least 10 cases; found ${cases.length}.`);
  if (cases.filter((c) => c.locale === "tr").length < 3) throw new Error("Retrieval corpus must include at least 3 Turkish cases.");
  if (cases.filter((c) => c.categories.includes("followup")).length < 2) throw new Error("Retrieval corpus must include at least 2 follow-up cases.");
  if (cases.filter((c) => c.categories.includes("unknown")).length < 1) throw new Error("Retrieval corpus must include at least 1 unknown case.");
  if (cases.filter((c) => c.categories.includes("date")).length < 1) throw new Error("Retrieval corpus must include at least 1 date case.");
  return {
    schemaVersion: RETRIEVAL_EVAL_SCHEMA_VERSION,
    corpusVersion: nonempty(root.corpusVersion, "corpusVersion"),
    generatedAt: nonempty(root.generatedAt, "generatedAt"),
    cases,
  };
}

export function validateRetrievalSourceManifest(value: unknown): RetrievalEvalSourceManifest {
  const root = value as Record<string, unknown>;
  if (!root || typeof root !== "object") throw new Error("Source manifest must be an object.");
  if (root.schemaVersion !== RETRIEVAL_EVAL_SCHEMA_VERSION) {
    throw new Error(`Unsupported source schemaVersion; expected ${RETRIEVAL_EVAL_SCHEMA_VERSION}.`);
  }
  if (!Array.isArray(root.sources) || !root.sources.length) throw new Error("sources must be a non-empty array.");
  const seen = new Set<string>();
  const sources: RetrievalEvalSource[] = root.sources.map((item: unknown, index: number) => {
    const entry = item as Record<string, unknown>;
    if (!entry || typeof entry !== "object") throw new Error(`sources[${index}] must be an object.`);
    const sourceId = nonempty(entry.sourceId, `sources[${index}].sourceId`);
    if (seen.has(sourceId)) throw new Error(`Duplicate sourceId: ${sourceId}.`);
    seen.add(sourceId);
    const locale = entry.locale;
    if (locale !== "en" && locale !== "tr") throw new Error(`${sourceId} has an invalid locale.`);
    return {
      sourceId,
      locale: locale as "en" | "tr",
      type: nonempty(entry.type, `${sourceId}.type`),
      title: nonempty(entry.title, `${sourceId}.title`),
      slug: nonempty(entry.slug, `${sourceId}.slug`),
      canonicalUrl: nonempty(entry.canonicalUrl, `${sourceId}.canonicalUrl`),
      keywords: Array.isArray(entry.keywords) ? entry.keywords as string[] : [],
    };
  });
  return {
    schemaVersion: RETRIEVAL_EVAL_SCHEMA_VERSION,
    corpusVersion: nonempty(root.corpusVersion, "corpusVersion"),
    generatedAt: nonempty(root.generatedAt, "generatedAt"),
    normalization: nonempty(root.normalization, "normalization"),
    scope: nonempty(root.scope, "scope"),
    sources,
  };
}

export async function loadAndValidateRetrievalCorpus(
  casePath: string,
  sourcePath: string,
): Promise<ValidatedRetrievalCorpus> {
  const [caseBytes, sourceBytes] = await Promise.all([readFile(casePath), readFile(sourcePath)]);
  let rawCases: unknown;
  let rawSources: unknown;
  try { rawCases = JSON.parse(caseBytes.toString("utf8")); } catch { throw new Error("Retrieval case file is not valid JSON."); }
  try { rawSources = JSON.parse(sourceBytes.toString("utf8")); } catch { throw new Error("Retrieval source file is not valid JSON."); }
  const sourceManifest = validateRetrievalSourceManifest(rawSources);
  const caseFile = validateRetrievalCorpus(rawCases, sourceManifest);
  if (caseFile.corpusVersion !== sourceManifest.corpusVersion) {
    throw new Error("Retrieval case and source corpusVersion values must match.");
  }
  return {
    caseFile,
    sourceManifest,
    casesHash: createHash("sha256").update(caseBytes).digest("hex"),
    sourcesHash: createHash("sha256").update(sourceBytes).digest("hex"),
  };
}

function errorCategory(error: unknown): RetrievalEvalFailureCategory {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? "").toLowerCase();
  if (/abort|timeout/.test(message)) return "timeout";
  if (/api.?key|credential|unauthori[sz]ed|permission|forbidden|401|403/.test(message)) return "credential";
  if (/quota|rate.?limit|resource.?exhausted|429/.test(message)) return "quota";
  return "provider";
}

class EvaluationDeadlineError extends Error {
  override name = "TimeoutError";
}

async function withEvaluationDeadline<T>(
  deadlineMs: number,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new EvaluationDeadlineError("Retrieval evaluation case deadline exceeded.");
      reject(error);
      controller.abort(error);
    }, Math.max(0, deadlineMs));
  });
  try {
    return await Promise.race([Promise.resolve().then(() => work(controller.signal)), deadline]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function selectCases(
  corpus: ValidatedRetrievalCorpus,
  caseIds: string[] | undefined,
): RetrievalEvalCase[] {
  if (caseIds === undefined) return corpus.caseFile.cases;
  if (!caseIds.length) throw new Error("Retrieval evaluation selection must not be empty.");
  const requested = new Set<string>();
  const byId = new Map(corpus.caseFile.cases.map((testCase) => [testCase.id, testCase]));
  return caseIds.map((id) => {
    if (requested.has(id)) throw new Error(`Duplicate retrieval case selection: ${id}.`);
    requested.add(id);
    const testCase = byId.get(id);
    if (!testCase) throw new Error(`Unknown retrieval case ID: ${id}.`);
    return testCase;
  });
}

function selectionHash(cases: RetrievalEvalCase[]): string {
  return createHash("sha256").update(JSON.stringify(cases)).digest("hex");
}

function assertCorpusProvenance(corpus: ValidatedRetrievalCorpus): void {
  if (corpus.caseFile.corpusVersion !== corpus.sourceManifest.corpusVersion) {
    throw new Error("Validated retrieval corpus versions do not match.");
  }
  if (!/^[a-f0-9]{64}$/.test(corpus.casesHash) || !/^[a-f0-9]{64}$/.test(corpus.sourcesHash)) {
    throw new Error("Validated retrieval corpus must include SHA-256 case and source hashes.");
  }
}

function successfulOutcome(
  diagnostics: HybridRetrievalDiagnostics,
): { status: "completed" | "degraded"; outcome: RetrievalEvalOutcome } {
  switch (diagnostics.retrieval.stage) {
    case "lexical_fallback":
      return { status: "degraded", outcome: "lexical_fallback" };
    case "filtered_fallback":
      return { status: "degraded", outcome: "filtered_semantic_fallback" };
    case "semantic_fallback":
      return { status: "degraded", outcome: "legacy_semantic_fallback" };
    default:
      return { status: "completed", outcome: "hybrid_success" };
  }
}

function returnedFailure(diagnostics: HybridRetrievalDiagnostics): {
  category: RetrievalEvalFailureCategory;
  reason: string;
} {
  if (diagnostics.retrieval.reason === "hybrid_rpc_timeout") {
    return { category: "timeout", reason: "hybrid_rpc_timeout" };
  }
  if (diagnostics.retrieval.reason === "filtered_fallback_timeout") {
    return { category: "timeout", reason: "filtered_fallback_timeout" };
  }
  return { category: "provider", reason: "retrieval_provider_error" };
}

function computeCoverage(matches: CareerContextMatch[], queryTerms: string[]): number {
  if (!queryTerms.length) return 0;
  const haystack = matches.map((m) => `${m.content} ${m.metadata.title ?? ""} ${m.metadata.organization ?? ""} ${m.metadata.role ?? ""}`).join(" ").toLowerCase();
  const matched = queryTerms.filter((term) => hasExactToken(haystack, term));
  return matched.length / queryTerms.length;
}

export async function runRetrievalEvaluation(
  corpus: ValidatedRetrievalCorpus,
  dependencies: RetrievalEvalDependencies,
  options: {
    deadlineMs?: number;
    now?: () => Date;
    caseIds?: string[];
  } = {},
): Promise<RetrievalEvalReport> {
  assertCorpusProvenance(corpus);
  const deadlineMs = options.deadlineMs ?? RETRIEVAL_EVAL_DEADLINE_MS;
  const cases = selectCases(corpus, options.caseIds);
  const results: RetrievalEvalCaseResult[] = [];
  let stop = false;

  for (const testCase of cases) {
    if (stop) {
      results.push({
        id: testCase.id,
        locale: testCase.locale,
        categories: testCase.categories,
        status: "skipped",
        outcome: "not_attempted",
        expectedSourceIds: testCase.expectedSourceIds,
        retrievedSources: [],
        expectedHits: [],
        expectedMisses: [...testCase.expectedSourceIds],
        recall: 0,
        precisionProxy: 0,
        queryTerms: testCase.queryTerms,
        coverage: 0,
        reason: "stopped_after_auth_or_quota_failure",
      });
      continue;
    }
    try {
      const messages = testCase.conversation as ChatMessage[];
      const result = await withEvaluationDeadline(
        deadlineMs,
        (signal) => performHybridRetrieval(
          messages,
          testCase.locale,
          {
            embedQuery: dependencies.embedQuery,
            invokeHybridRpc: dependencies.invokeHybridRpc,
            ...(dependencies.invokeFilteredRpc ? { invokeFilteredRpc: dependencies.invokeFilteredRpc } : {}),
            ...(dependencies.rewriteAdapter ? { rewriteAdapter: dependencies.rewriteAdapter } : {}),
          },
          { documentType: null, organization: null, role: null },
          { signal },
        ),
      );
      const retrievedSources = result.matches.map((m) => m.source);
      const retrievedSet = new Set(retrievedSources);
      const expectedHits = testCase.expectedSourceIds.filter((sid) => retrievedSet.has(sid));
      const expectedMisses = testCase.expectedSourceIds.filter((sid) => !retrievedSet.has(sid));
      const recall = testCase.expectedSourceIds.length > 0
        ? expectedHits.length / testCase.expectedSourceIds.length
        : 1;
      const precisionProxy = retrievedSources.length > 0
        ? expectedHits.length / retrievedSources.length
        : (testCase.expectedSourceIds.length === 0 ? 1 : 0);
      const coverage = computeCoverage(result.matches, testCase.queryTerms);
      if (result.retrievalError || result.diagnostics.retrieval.stage === "empty_error") {
        const failure = returnedFailure(result.diagnostics);
        results.push({
          id: testCase.id,
          locale: testCase.locale,
          categories: testCase.categories,
          status: "failed",
          outcome: "retrieval_failure",
          expectedSourceIds: testCase.expectedSourceIds,
          retrievedSources,
          expectedHits,
          expectedMisses,
          recall,
          precisionProxy,
          queryTerms: testCase.queryTerms,
          coverage,
          category: failure.category,
          reason: failure.reason,
          diagnostics: result.diagnostics,
        });
        continue;
      }
      const successful = successfulOutcome(result.diagnostics);
      results.push({
        id: testCase.id,
        locale: testCase.locale,
        categories: testCase.categories,
        status: successful.status,
        outcome: successful.outcome,
        expectedSourceIds: testCase.expectedSourceIds,
        retrievedSources,
        expectedHits,
        expectedMisses,
        recall,
        precisionProxy,
        queryTerms: testCase.queryTerms,
        coverage,
        diagnostics: result.diagnostics,
      });
    } catch (error) {
      const deadlineExceeded = error instanceof EvaluationDeadlineError;
      const category = deadlineExceeded ? "timeout" : errorCategory(error);
      results.push({
        id: testCase.id,
        locale: testCase.locale,
        categories: testCase.categories,
        status: "failed",
        outcome: "retrieval_failure",
        expectedSourceIds: testCase.expectedSourceIds,
        retrievedSources: [],
        expectedHits: [],
        expectedMisses: [...testCase.expectedSourceIds],
        recall: 0,
        precisionProxy: 0,
        queryTerms: testCase.queryTerms,
        coverage: 0,
        category,
        reason: deadlineExceeded ? "evaluation_deadline_exceeded" : `${category}_error`,
        diagnostics: undefined,
      });
      if (category === "credential" || category === "quota") stop = true;
    }
  }

  const completedResults = results.filter((result) => result.status === "completed");
  const attempted = results.filter((result) => result.status !== "skipped").length;
  const completed = completedResults.length;
  const degraded = results.filter((result) => result.status === "degraded").length;
  const failed = results.filter((result) => result.status === "failed").length;
  const skipped = results.filter((result) => result.status === "skipped").length;
  const recallNumer = completedResults.reduce((sum, result) => sum + result.expectedHits.length, 0);
  const recallDenom = completedResults.reduce((sum, result) => sum + result.expectedSourceIds.length, 0);
  const precisionNumer = completedResults.reduce((sum, result) => sum + result.expectedHits.length, 0);
  const precisionDenom = completedResults.reduce((sum, result) => sum + result.retrievedSources.length, 0);
  const excludedMisses = {
    degraded: results.filter((result) => result.status === "degraded").reduce((sum, result) => sum + result.expectedMisses.length, 0),
    failed: results.filter((result) => result.status === "failed").reduce((sum, result) => sum + result.expectedMisses.length, 0),
    skipped: results.filter((result) => result.status === "skipped").reduce((sum, result) => sum + result.expectedMisses.length, 0),
    total: 0,
  };
  excludedMisses.total = excludedMisses.degraded + excludedMisses.failed + excludedMisses.skipped;

  return {
    timestamp: (options.now ?? (() => new Date()))().toISOString(),
    evidence: "retrieval_only",
    answerQuality: "not_evaluated",
    corpusVersion: corpus.caseFile.corpusVersion,
    casesHash: corpus.casesHash,
    sourcesHash: corpus.sourcesHash,
    corpusCaseCount: corpus.caseFile.cases.length,
    corpusSourceCount: corpus.sourceManifest.sources.length,
    selectedCaseIds: cases.map((testCase) => testCase.id),
    selectedCaseCount: cases.length,
    selectionHash: selectionHash(cases),
    embeddingModel: EMBEDDING_MODEL,
    embeddingDimensions: EMBEDDING_DIMENSIONS,
    retrievalThreshold: RETRIEVAL_THRESHOLD,
    retrievalCount: RETRIEVAL_COUNT,
    hybridRpc: "match_career_context_hybrid",
    complete: results.length === cases.length && completed === cases.length,
    attempted,
    completed,
    degraded,
    failed,
    skipped,
    aggregateRecall: { numerator: recallNumer, denominator: recallDenom },
    aggregatePrecisionProxy: { numerator: precisionNumer, denominator: precisionDenom },
    excludedMisses,
    results,
    limitations: [
      "Context-precision proxy counts source-level ID matches, not human semantic precision.",
      "Recall measures expected-source presence in the top-6 reranked results, not all candidates.",
      "Query-term coverage uses bounded exact-token matching, not semantic grounding.",
      "No answer generation or human review is performed.",
      "Live mode is retrieval-only; it makes no production writes and no generation calls.",
    ],
  };
}
