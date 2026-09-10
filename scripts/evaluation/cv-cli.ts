import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  RETRIEVAL_COUNT,
  RETRIEVAL_THRESHOLD,
  retrieveCareerContext,
  type CareerContextMatch,
  type CareerContextRpcInvoker,
  type RetrievalRequest,
} from "../../src/lib/chat/core";
import {
  CV_SOURCE_ID_PREFIX,
  cvApprovalDigest,
  loadRegisteredCv,
} from "../../src/lib/knowledge/cv";

export const CV_EVAL_MAX_CASES = 12;
export const CV_EVAL_CASE_DEADLINE_MS = 15_000;
const CASE_KEYS = new Set(["id", "locale", "query", "expected_section_id", "expected_source_id"]);

export interface CvEvaluationCase {
  id: string;
  locale: "en" | "tr";
  query: string;
  expected_section_id: string;
  expected_source_id: string;
}

export interface CvEvaluationArguments {
  mode: "validate" | "live";
  limit?: number;
  caseId?: string;
}

export interface CvEvaluationDependencies {
  embedQuery(query: string, signal: AbortSignal): Promise<number[]>;
  invokeRpc: CareerContextRpcInvoker;
}

export interface CvEvaluationResult {
  id: string;
  status: "completed" | "failed" | "skipped";
  expectedSectionId?: string;
  expectedSourceId?: string;
  hit?: boolean;
  category?: "credential" | "quota" | "timeout" | "provider";
  reason?: "stopped_after_auth_or_quota_failure";
  returnedIdentities?: Array<{ source: string; approvalDigest: string | null }>;
}

export interface CvEvaluationReport {
  timestamp: string;
  evidence: "retrieval_only";
  answerQuality: "not_evaluated";
  canonicalApprovalDigest: string;
  attempted: number;
  completed: number;
  skipped: number;
  sectionHits: number;
  embeddingCalls: number;
  retrievalRpcCalls: number;
  results: CvEvaluationResult[];
}

function nonempty(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
  return value;
}

export function parseCvEvaluationArguments(argv: string[]): CvEvaluationArguments {
  let mode: CvEvaluationArguments["mode"] | undefined;
  let limit: number | undefined;
  let caseId: string | undefined;
  const seen = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!["--validate", "--live", "--limit", "--case"].includes(argument)) throw new Error(`Unknown argument: ${argument}.`);
    if (seen.has(argument)) throw new Error(`Duplicate argument: ${argument}.`);
    seen.add(argument);
    if (argument === "--validate" || argument === "--live") {
      if (mode) throw new Error("Choose exactly one of --validate or --live.");
      mode = argument === "--live" ? "live" : "validate";
    } else {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.`);
      index += 1;
      if (argument === "--limit") {
        if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > CV_EVAL_MAX_CASES) {
          throw new Error(`--limit must be between 1 and ${CV_EVAL_MAX_CASES}.`);
        }
        limit = Number(value);
      } else caseId = value;
    }
  }
  if (!mode) throw new Error("Choose exactly one of --validate or --live.");
  if (limit && caseId) throw new Error("--limit and --case cannot be combined.");
  if (mode === "validate" && (limit || caseId)) throw new Error("--validate cannot be combined with execution options.");
  return { mode, ...(limit ? { limit } : {}), ...(caseId ? { caseId } : {}) };
}

export function validateCvCases(value: unknown, sectionIds: Set<string>): CvEvaluationCase[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("CV case file must be an object.");
  const root = value as Record<string, unknown>;
  if (Object.keys(root).some((key) => key !== "schema_version" && key !== "cases")) throw new Error("CV case file has unknown fields.");
  if (root.schema_version !== "1.0.0" || !Array.isArray(root.cases)) throw new Error("CV case schema is invalid.");
  if (root.cases.length < 10 || root.cases.length > CV_EVAL_MAX_CASES) throw new Error("CV case corpus must contain 10–12 bounded cases.");
  const ids = new Set<string>();
  const cases = root.cases.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(`CV case ${index} must be an object.`);
    const entry = item as Record<string, unknown>;
    if (Object.keys(entry).some((key) => !CASE_KEYS.has(key))) throw new Error(`CV case ${index} has unknown fields.`);
    const id = nonempty(entry.id, `CV case ${index}.id`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || ids.has(id)) throw new Error(`CV case ${index} has an invalid or duplicate ID.`);
    ids.add(id);
    if (entry.locale !== "en" && entry.locale !== "tr") throw new Error(`CV case ${id} has an invalid locale.`);
    const expectedSectionId = nonempty(entry.expected_section_id, `${id}.expected_section_id`);
    const expectedSourceId = nonempty(entry.expected_source_id, `${id}.expected_source_id`);
    if (!sectionIds.has(expectedSectionId)) throw new Error(`${id} expects an unknown CV section.`);
    if (expectedSourceId !== `${CV_SOURCE_ID_PREFIX}/${expectedSectionId}`) throw new Error(`${id} does not assert the exact section source identity.`);
    return {
      id,
      locale: entry.locale as "en" | "tr",
      query: nonempty(entry.query, `${id}.query`),
      expected_section_id: expectedSectionId,
      expected_source_id: expectedSourceId,
    };
  });
  if (!cases.some((item) => item.locale === "tr")) throw new Error("CV corpus must cover Turkish queries.");
  return cases;
}

function returnedIdentity(match: CareerContextMatch): { source: string; approvalDigest: string | null } {
  return {
    source: match.source,
    approvalDigest: typeof match.metadata.content_sha256 === "string"
      ? match.metadata.content_sha256
      : null,
  };
}

export function isExpectedSectionHit(
  testCase: CvEvaluationCase,
  matches: CareerContextMatch[],
  canonicalApprovalDigest: string,
): boolean {
  return matches.some((match) => (
    match.source === testCase.expected_source_id &&
    match.metadata.content_sha256 === canonicalApprovalDigest
  ));
}

async function loadCases(): Promise<CvEvaluationCase[]> {
  const document = await loadRegisteredCv();
  const bytes = await readFile(path.join(process.cwd(), "evals/cv/cases.json"), "utf8");
  let value: unknown;
  try { value = JSON.parse(bytes); } catch { throw new Error("CV case file is not valid JSON."); }
  return validateCvCases(value, new Set(document.sections.map((section) => section.id)));
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    return [value.code, value.message, value.details, value.hint]
      .filter((item): item is string => typeof item === "string")
      .join(" ");
  }
  return String(error ?? "");
}

export function failureCategory(error: unknown): "credential" | "quota" | "timeout" | "provider" {
  const message = errorText(error).toLowerCase();
  if (/abort|timeout/.test(message)) return "timeout";
  if (/api.?key|credential|unauthori[sz]ed|permission|forbidden|401|403/.test(message)) return "credential";
  if (/quota|rate.?limit|resource.?exhausted|429/.test(message)) return "quota";
  return "provider";
}

function withAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason ?? new Error("CV evaluation aborted."));
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new Error("CV evaluation aborted."));
    signal.addEventListener("abort", abort, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

export async function runCvEvaluationCases(
  cases: CvEvaluationCase[],
  dependencies: CvEvaluationDependencies,
  options: {
    canonicalApprovalDigest: string;
    deadlineMs?: number;
    now?: () => Date;
  },
): Promise<CvEvaluationReport> {
  if (cases.length < 1 || cases.length > CV_EVAL_MAX_CASES) {
    throw new Error(`CV live evaluation requires between 1 and ${CV_EVAL_MAX_CASES} cases.`);
  }
  if (!/^[a-f0-9]{64}$/.test(options.canonicalApprovalDigest)) {
    throw new Error("CV live evaluation requires the canonical approval digest.");
  }
  const deadlineMs = options.deadlineMs ?? CV_EVAL_CASE_DEADLINE_MS;
  if (!Number.isFinite(deadlineMs) || deadlineMs < 1 || deadlineMs > CV_EVAL_CASE_DEADLINE_MS) {
    throw new Error(`CV evaluation deadline must be between 1 and ${CV_EVAL_CASE_DEADLINE_MS} milliseconds.`);
  }

  const results: CvEvaluationResult[] = [];
  let attempted = 0;
  let completed = 0;
  let sectionHits = 0;
  let embeddingCalls = 0;
  let retrievalRpcCalls = 0;
  let stop = false;
  for (const testCase of cases) {
    if (stop) {
      results.push({ id: testCase.id, status: "skipped", reason: "stopped_after_auth_or_quota_failure" });
      continue;
    }
    attempted += 1;
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new Error("CV evaluation case deadline timeout.")),
      deadlineMs,
    );
    try {
      embeddingCalls += 1;
      const queryEmbedding = await withAbort(
        dependencies.embedQuery(testCase.query, controller.signal),
        controller.signal,
      );
      const retrievalRequest: RetrievalRequest = {
        query_embedding: queryEmbedding,
        query_locale: testCase.locale,
        match_threshold: RETRIEVAL_THRESHOLD,
        match_count: RETRIEVAL_COUNT,
        filter_document_type: null,
        filter_organization: null,
        filter_role: null,
        filter_visibility: "public",
      };
      const retrieval = await withAbort(retrieveCareerContext(retrievalRequest, {
        // Acceptance requires the current indexed CV digest. A legacy result
        // cannot establish that, so compatibility fallback is intentionally off.
        allowLegacyFallback: false,
        invokeRpc: dependencies.invokeRpc,
        onRpcCall() { retrievalRpcCalls += 1; },
      }, controller.signal), controller.signal);
      if (retrieval.error) throw retrieval.error;
      const matches = retrieval.data ?? [];
      const hit = isExpectedSectionHit(testCase, matches, options.canonicalApprovalDigest);
      completed += 1;
      if (hit) sectionHits += 1;
      results.push({
        id: testCase.id,
        status: "completed",
        expectedSectionId: testCase.expected_section_id,
        expectedSourceId: testCase.expected_source_id,
        hit,
        returnedIdentities: matches.map(returnedIdentity),
      });
    } catch (error) {
      const category = failureCategory(error);
      results.push({ id: testCase.id, status: "failed", category });
      if (category === "credential" || category === "quota") stop = true;
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    timestamp: (options.now ?? (() => new Date()))().toISOString(),
    evidence: "retrieval_only",
    answerQuality: "not_evaluated",
    canonicalApprovalDigest: options.canonicalApprovalDigest,
    attempted,
    completed,
    skipped: results.filter((item) => item.status === "skipped").length,
    sectionHits,
    embeddingCalls,
    retrievalRpcCalls,
    results,
  };
}

async function runLive(cases: CvEvaluationCase[], canonicalApprovalDigest: string): Promise<void> {
  const dotenv = await import("dotenv");
  dotenv.config({ path: ".env.local", quiet: true });
  const [{ embedQuery }, { createAdminClient }] = await Promise.all([
    import("../../src/lib/knowledge/embeddings"),
    import("../../src/lib/supabase"),
  ]);
  const supabase = createAdminClient();
  const report = await runCvEvaluationCases(cases, {
    embedQuery,
    async invokeRpc(name, request, signal) {
      const rpc = supabase.rpc(name, request);
      const result = signal ? await rpc.abortSignal(signal) : await rpc;
      return result as { data: CareerContextMatch[] | null; error: unknown };
    },
  }, { canonicalApprovalDigest });
  console.log(JSON.stringify(report, null, 2));
  if (report.completed !== cases.length || report.sectionHits !== cases.length) process.exitCode = 1;
}

async function main(): Promise<void> {
  const args = parseCvEvaluationArguments(process.argv.slice(2));
  const allCases = await loadCases();
  const canonicalApprovalDigest = cvApprovalDigest(await loadRegisteredCv());
  if (args.mode === "validate") {
    console.log(`Validated ${allCases.length} CV retrieval cases offline for canonical approval ${canonicalApprovalDigest}; no credentials, provider modules, or network calls were used.`);
    return;
  }
  const selected = args.caseId
    ? allCases.filter((item) => item.id === args.caseId)
    : allCases.slice(0, args.limit ?? allCases.length);
  if (!selected.length) throw new Error(`Unknown CV case ID: ${args.caseId}.`);
  await runLive(selected, canonicalApprovalDigest);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "CV evaluation failed.");
    process.exitCode = 1;
  });
}
