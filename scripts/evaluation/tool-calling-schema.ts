import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { CHAT_MAX_TOOL_CALLS } from "../../src/lib/chat/limits";
import { CHAT_TOOL_NAMES, type ChatToolName } from "../../src/lib/chat/tools";

export const TOOL_CALLING_CASE_SCHEMA_VERSION = "1.0.0";
export const TOOL_CALLING_CORPUS_VERSION = "1.0.0";

type DegradationMode = "none" | "partial_success" | "all_failed";
type ExpectedOutcome = "answer" | "call_limit_rejected";
type ReplayDisposition = "success" | "safe_failure";
type ReplayFailureCategory = "timeout" | "handler_failure" | "result_too_large" | "invalid_result";

export interface ToolCallingReplayResult {
  id: string;
  tool: ChatToolName;
  disposition: ReplayDisposition;
  category: ReplayFailureCategory | null;
  retryable: boolean;
  facts: string[];
  citations: string[];
}

export interface ToolCallingReplay {
  requestedCalls: Array<{ tool: ChatToolName; identity: string }>;
  executions: Array<{ tool: ChatToolName; identity: string; resultId: string }>;
  results: ToolCallingReplayResult[];
  answer: string;
}

export interface ToolCallingCase {
  id: string;
  prompt: string;
  categories: string[];
  expectedTools: ChatToolName[];
  allowedTools: ChatToolName[];
  forbiddenTools: ChatToolName[];
  minimumDistinctSuccessfulTools: number;
  expectedOutcome: ExpectedOutcome;
  evidenceExpectations: Array<{
    resultId: string;
    requiredFacts: string[];
    requiredCitations: string[];
  }>;
  answerChecks: {
    requiredPatterns: string[];
    forbiddenPatterns: string[];
  };
  gracefulDegradation: {
    mode: DegradationMode;
    failureCategories: ReplayFailureCategory[];
    requiresSuccessfulSibling: boolean;
    acknowledgementPatterns: string[];
  };
  fixture: ToolCallingReplay;
}

export interface ToolCallingCorpus {
  schemaVersion: typeof TOOL_CALLING_CASE_SCHEMA_VERSION;
  corpusVersion: string;
  cases: ToolCallingCase[];
}

export interface LoadedToolCallingCorpus extends ToolCallingCorpus {
  corpusHash: string;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error(`${label} must be a plain object.`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} has unknown or missing fields.`);
  }
}

function stringValue(value: unknown, label: string, maxLength = 2_000): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) throw new Error(`${label} must be a bounded non-empty string.`);
  return value;
}

function stringArray(value: unknown, label: string, maxItems = 100): string[] {
  if (!Array.isArray(value) || value.length > maxItems || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`${label} must be an array of bounded non-empty strings.`);
  }
  return value as string[];
}

function unique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`${label} contains duplicate values.`);
}

function toolArray(value: unknown, label: string): ChatToolName[] {
  const tools = stringArray(value, label, CHAT_TOOL_NAMES.length) as ChatToolName[];
  if (tools.some((tool) => !CHAT_TOOL_NAMES.includes(tool))) throw new Error(`${label} contains an invalid tool name.`);
  unique(tools, label);
  return tools;
}

function patterns(value: unknown, label: string): string[] {
  const values = stringArray(value, label, 50);
  for (const pattern of values) {
    try {
      new RegExp(pattern, "iu");
    } catch {
      throw new Error(`${label} contains an invalid regular expression.`);
    }
  }
  return values;
}

function publicUrl(value: unknown, label: string): string {
  const url = stringValue(value, label, 2_000);
  if (!/^https:\/\/johnserra\.com(?:\/|$)/u.test(url)) throw new Error(`${label} must be a canonical public John Serra URL.`);
  const projectPath = url.match(/^https:\/\/johnserra\.com(?:\/projects|\/tr\/projeler)\/([a-z0-9]+(?:-[a-z0-9]+)*)$/u);
  if (projectPath) {
    const publishedProjectSlugs = new Set([
      "bd-automation-suite",
      "careertalklab",
      "digital-transformation",
      "bd-otomasyon-paketi",
      "dijital-donusum",
    ]);
    if (!publishedProjectSlugs.has(projectPath[1])) {
      throw new Error(`${label} must cite a published project slug from the repository.`);
    }
  }
  return url;
}

function replayResult(value: unknown, label: string): ToolCallingReplayResult {
  const entry = object(value, label);
  exactKeys(entry, ["id", "tool", "disposition", "category", "retryable", "facts", "citations"], label);
  const id = stringValue(entry.id, `${label}.id`, 120);
  const tool = toolArray([entry.tool], `${label}.tool`)[0];
  if (entry.disposition !== "success" && entry.disposition !== "safe_failure") throw new Error(`${label}.disposition is invalid.`);
  const category = entry.category;
  const failureCategory = category === null ? null : stringValue(category, `${label}.category`, 40) as ReplayFailureCategory;
  if (failureCategory && !["timeout", "handler_failure", "result_too_large", "invalid_result"].includes(failureCategory)) {
    throw new Error(`${label}.category is not a safe degradation category.`);
  }
  if (typeof entry.retryable !== "boolean") throw new Error(`${label}.retryable must be boolean.`);
  if (entry.disposition === "success" && (failureCategory !== null || entry.retryable !== false)) {
    throw new Error(`${label} successful results must have category null and retryable false.`);
  }
  if (entry.disposition === "safe_failure" && !failureCategory) throw new Error(`${label} safe failures need a stable category.`);
  if (entry.disposition === "safe_failure" && entry.retryable !== (failureCategory === "timeout" || failureCategory === "handler_failure")) {
    throw new Error(`${label} safe failure retryability does not match its category.`);
  }
  const facts = stringArray(entry.facts, `${label}.facts`, 50);
  const citations = entry.citations as unknown;
  if (!Array.isArray(citations) || citations.length > 50) throw new Error(`${label}.citations must be a bounded array.`);
  return {
    id,
    tool,
    disposition: entry.disposition,
    category: failureCategory,
    retryable: entry.retryable as boolean,
    facts,
    citations: citations.map((url, index) => publicUrl(url, `${label}.citations[${index}]`)),
  };
}

function replay(value: unknown, label: string): ToolCallingReplay {
  const entry = object(value, label);
  exactKeys(entry, ["requestedCalls", "executions", "results", "answer"], label);
  if (!Array.isArray(entry.requestedCalls)) throw new Error(`${label}.requestedCalls must be an array.`);
  const requestedCalls = entry.requestedCalls.map((item, index) => {
    const call = object(item, `${label}.requestedCalls[${index}]`);
    exactKeys(call, ["tool", "identity"], `${label}.requestedCalls[${index}]`);
    return {
      tool: toolArray([call.tool], `${label}.requestedCalls[${index}].tool`)[0],
      identity: stringValue(call.identity, `${label}.requestedCalls[${index}].identity`, 120),
    };
  });
  if (!Array.isArray(entry.executions)) throw new Error(`${label}.executions must be an array.`);
  const executions = entry.executions.map((item, index) => {
    const execution = object(item, `${label}.executions[${index}]`);
    exactKeys(execution, ["tool", "identity", "resultId"], `${label}.executions[${index}]`);
    return {
      tool: toolArray([execution.tool], `${label}.executions[${index}].tool`)[0],
      identity: stringValue(execution.identity, `${label}.executions[${index}].identity`, 120),
      resultId: stringValue(execution.resultId, `${label}.executions[${index}].resultId`, 120),
    };
  });
  const resultsValue = entry.results;
  if (!Array.isArray(resultsValue)) throw new Error(`${label}.results must be an array.`);
  const results = resultsValue.map((item, index) => replayResult(item, `${label}.results[${index}]`));
  unique(results.map((result) => result.id), `${label}.results.id`);
  const resultMap = new Map(results.map((result) => [result.id, result]));
  const referencedResultIds = new Set<string>();
  for (const execution of executions) {
    const result = resultMap.get(execution.resultId);
    if (!result || result.tool !== execution.tool) throw new Error(`${label} execution references a mismatched result.`);
    referencedResultIds.add(result.id);
  }
  if (results.some((result) => !referencedResultIds.has(result.id))) throw new Error(`${label} contains an unreferenced result.`);
  return {
    requestedCalls,
    executions,
    results,
    answer: stringValue(entry.answer, `${label}.answer`, 20_000),
  };
}

export function validateToolCallingCorpus(value: unknown): ToolCallingCorpus {
  const root = object(value, "tool-calling corpus");
  exactKeys(root, ["schemaVersion", "corpusVersion", "cases"], "tool-calling corpus");
  if (root.schemaVersion !== TOOL_CALLING_CASE_SCHEMA_VERSION) throw new Error(`Unsupported tool-calling schemaVersion; expected ${TOOL_CALLING_CASE_SCHEMA_VERSION}.`);
  const corpusVersion = stringValue(root.corpusVersion, "corpusVersion", 80);
  if (!Array.isArray(root.cases) || !root.cases.length) throw new Error("cases must be a non-empty array.");
  const ids = new Set<string>();
  const cases = root.cases.map((item, index) => {
    const entry = object(item, `cases[${index}]`);
    exactKeys(entry, [
      "id", "prompt", "categories", "expectedTools", "allowedTools", "forbiddenTools",
      "minimumDistinctSuccessfulTools", "expectedOutcome", "evidenceExpectations", "answerChecks",
      "gracefulDegradation", "fixture",
    ], `cases[${index}]`);
    const id = stringValue(entry.id, `cases[${index}].id`, 120);
    if (!/^[a-z0-9][a-z0-9-]+$/u.test(id)) throw new Error(`Case ${id} must use a stable kebab-case ID.`);
    if (ids.has(id)) throw new Error(`Duplicate case ID: ${id}.`);
    ids.add(id);
    const categories = stringArray(entry.categories, `${id}.categories`, 20);
    unique(categories, `${id}.categories`);
    const expectedTools = toolArray(entry.expectedTools, `${id}.expectedTools`);
    const allowedTools = toolArray(entry.allowedTools, `${id}.allowedTools`);
    const forbiddenTools = toolArray(entry.forbiddenTools, `${id}.forbiddenTools`);
    if (expectedTools.some((tool) => !allowedTools.includes(tool))) throw new Error(`${id} expects a tool outside its allowlist.`);
    if (forbiddenTools.some((tool) => allowedTools.includes(tool))) throw new Error(`${id} has overlapping allowed and forbidden tools.`);
    const minimumDistinctSuccessfulTools = entry.minimumDistinctSuccessfulTools as number;
    if (!Number.isSafeInteger(minimumDistinctSuccessfulTools) || minimumDistinctSuccessfulTools < 0 || minimumDistinctSuccessfulTools > expectedTools.length) {
      throw new Error(`${id}.minimumDistinctSuccessfulTools is impossible.`);
    }
    if (entry.expectedOutcome !== "answer" && entry.expectedOutcome !== "call_limit_rejected") throw new Error(`${id}.expectedOutcome is invalid.`);
    const evidenceValue = entry.evidenceExpectations;
    if (!Array.isArray(evidenceValue)) throw new Error(`${id}.evidenceExpectations must be an array.`);
    const evidenceIds = new Set<string>();
    const evidenceExpectations = evidenceValue.map((item, evidenceIndex) => {
      const evidence = object(item, `${id}.evidenceExpectations[${evidenceIndex}]`);
      exactKeys(evidence, ["resultId", "requiredFacts", "requiredCitations"], `${id}.evidenceExpectations[${evidenceIndex}]`);
      const resultId = stringValue(evidence.resultId, `${id}.evidenceExpectations[${evidenceIndex}].resultId`, 120);
      if (evidenceIds.has(resultId)) throw new Error(`${id} repeats evidence expectation ${resultId}.`);
      evidenceIds.add(resultId);
      return {
        resultId,
        requiredFacts: patterns(evidence.requiredFacts, `${id}.evidenceExpectations[${evidenceIndex}].requiredFacts`),
        requiredCitations: (evidence.requiredCitations as unknown[]).map((url, citationIndex) => publicUrl(url, `${id}.evidenceExpectations[${evidenceIndex}].requiredCitations[${citationIndex}]`)),
      };
    });
    const answerChecksValue = object(entry.answerChecks, `${id}.answerChecks`);
    exactKeys(answerChecksValue, ["requiredPatterns", "forbiddenPatterns"], `${id}.answerChecks`);
    const answerChecks = {
      requiredPatterns: patterns(answerChecksValue.requiredPatterns, `${id}.answerChecks.requiredPatterns`),
      forbiddenPatterns: patterns(answerChecksValue.forbiddenPatterns, `${id}.answerChecks.forbiddenPatterns`),
    };
    const degradationValue = object(entry.gracefulDegradation, `${id}.gracefulDegradation`);
    exactKeys(degradationValue, ["mode", "failureCategories", "requiresSuccessfulSibling", "acknowledgementPatterns"], `${id}.gracefulDegradation`);
    if (!["none", "partial_success", "all_failed"].includes(degradationValue.mode as string)) throw new Error(`${id}.gracefulDegradation.mode is invalid.`);
    const failureCategories = stringArray(degradationValue.failureCategories, `${id}.gracefulDegradation.failureCategories`, 4) as ReplayFailureCategory[];
    if (failureCategories.some((category) => !["timeout", "handler_failure", "result_too_large", "invalid_result"].includes(category))) throw new Error(`${id}.gracefulDegradation has an invalid failure category.`);
    const gracefulDegradation = {
      mode: degradationValue.mode as DegradationMode,
      failureCategories,
      requiresSuccessfulSibling: degradationValue.requiresSuccessfulSibling as boolean,
      acknowledgementPatterns: patterns(degradationValue.acknowledgementPatterns, `${id}.gracefulDegradation.acknowledgementPatterns`),
    };
    if (typeof gracefulDegradation.requiresSuccessfulSibling !== "boolean") throw new Error(`${id}.gracefulDegradation.requiresSuccessfulSibling must be boolean.`);
    if (gracefulDegradation.mode === "partial_success" && (!gracefulDegradation.requiresSuccessfulSibling || !gracefulDegradation.acknowledgementPatterns.length)) {
      throw new Error(`${id} partial degradation must require sibling evidence and an acknowledgement pattern.`);
    }
    if (gracefulDegradation.mode === "none" && (failureCategories.length || gracefulDegradation.acknowledgementPatterns.length)) throw new Error(`${id} has failure expectations with degradation mode none.`);
    const fixture = replay(entry.fixture, `${id}.fixture`);
    const fixtureResultIds = new Set(fixture.results.filter((result) => result.disposition === "success").map((result) => result.id));
    for (const expectation of evidenceExpectations) {
      if (!fixtureResultIds.has(expectation.resultId)) throw new Error(`${id} evidence expectation ${expectation.resultId} is not a successful fixture result.`);
    }
    if (fixture.requestedCalls.length > CHAT_MAX_TOOL_CALLS && entry.expectedOutcome !== "call_limit_rejected") throw new Error(`${id} exceeds the call cap without expecting rejection.`);
    if (entry.expectedOutcome === "call_limit_rejected" && fixture.requestedCalls.length <= CHAT_MAX_TOOL_CALLS) throw new Error(`${id} expects call-limit rejection without exceeding the call cap.`);
    if (entry.expectedOutcome === "call_limit_rejected" && fixture.executions.length) throw new Error(`${id} call-limit rejection cannot have executions.`);
    if (fixture.requestedCalls.length <= CHAT_MAX_TOOL_CALLS && fixture.executions.length > fixture.requestedCalls.length) throw new Error(`${id} has more executions than requested calls.`);
    if (categories.includes("no-tool-control") && (expectedTools.length || allowedTools.length || minimumDistinctSuccessfulTools !== 0)) throw new Error(`${id} no-tool controls must expect and allow zero tools.`);
    return {
      id,
      prompt: stringValue(entry.prompt, `${id}.prompt`, 4_000),
      categories,
      expectedTools,
      allowedTools,
      forbiddenTools,
      minimumDistinctSuccessfulTools,
      expectedOutcome: entry.expectedOutcome as ExpectedOutcome,
      evidenceExpectations,
      answerChecks,
      gracefulDegradation,
      fixture,
    } satisfies ToolCallingCase;
  });
  const multiSourceCount = cases.filter((item) => item.expectedTools.length >= 2 && (item.minimumDistinctSuccessfulTools as number) >= 2).length;
  if (multiSourceCount < 5) throw new Error(`Tool-calling corpus has ${multiSourceCount} multi-source cases; at least 5 are required.`);
  if (cases.filter((item) => item.categories.includes("no-tool-control")).length < 2) throw new Error("Tool-calling corpus needs at least two no-tool controls.");
  return { schemaVersion: TOOL_CALLING_CASE_SCHEMA_VERSION, corpusVersion, cases };
}

export async function loadToolCallingCorpus(casePath: string): Promise<LoadedToolCallingCorpus> {
  const bytes = await readFile(casePath);
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("Tool-calling corpus is not valid JSON.");
  }
  return { ...validateToolCallingCorpus(value), corpusHash: createHash("sha256").update(bytes).digest("hex") };
}
