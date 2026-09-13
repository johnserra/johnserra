import { readFile } from "node:fs/promises";

export const AGENT_LOOP_SCHEMA_VERSION = 1;
export const AGENT_STOP_REASONS = [
  "direct_no_tools", "supported_evidence", "qualified_completion", "insufficient_evidence",
  "all_tools_failure", "verifier_failure", "inspection_failure", "deadline_exceeded",
  "budget_exceeded", "provider_failure", "output_limit", "cancellation",
] as const;
export const AGENT_USAGE_COMPLETENESS = ["complete", "partial", "unknown"] as const;

export type AgentLoopCase = {
  id: string;
  category: string;
  expectedStopReason: typeof AGENT_STOP_REASONS[number];
  expectedCompletion: boolean;
  expectedShortestPath: boolean;
  fixture: {
    acceptedToolExecutions: number;
    retrievalRounds: number;
    verificationPasses: number;
    revised: boolean;
    qualified: boolean;
    removedClaims: number;
    supportedClaims: number;
    citationSupport: number;
    evidenceItems: number;
    latencyMs: number;
    usage: { tokens: number | null; costUsd: number | null; completeness: typeof AGENT_USAGE_COMPLETENESS[number] };
    infrastructureFailure: boolean;
  };
};

export interface AgentLoopCorpus { schemaVersion: 1; corpusVersion: string; cases: AgentLoopCase[]; }

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(`${label} has unexpected fields.`);
}

function boundedCount(value: unknown, label: string, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > max) throw new Error(`${label} must be an integer from 0 to ${max}.`);
  return value as number;
}

function validateCase(value: unknown, index: number): AgentLoopCase {
  const entry = record(value, `cases[${index}]`);
  exactKeys(entry, ["id", "category", "expectedStopReason", "expectedCompletion", "expectedShortestPath", "fixture"], `cases[${index}]`);
  if (typeof entry.id !== "string" || !/^[a-z0-9][a-z0-9-]+$/u.test(entry.id)) throw new Error(`cases[${index}].id is invalid.`);
  if (typeof entry.category !== "string" || !entry.category) throw new Error(`${entry.id}.category is invalid.`);
  if (!AGENT_STOP_REASONS.includes(entry.expectedStopReason as typeof AGENT_STOP_REASONS[number])) throw new Error(`${entry.id}.expectedStopReason is invalid.`);
  if (typeof entry.expectedCompletion !== "boolean" || typeof entry.expectedShortestPath !== "boolean") throw new Error(`${entry.id} completion flags are invalid.`);
  const fixture = record(entry.fixture, `${entry.id}.fixture`);
  exactKeys(fixture, ["acceptedToolExecutions", "retrievalRounds", "verificationPasses", "revised", "qualified", "removedClaims", "supportedClaims", "citationSupport", "evidenceItems", "latencyMs", "usage", "infrastructureFailure"], `${entry.id}.fixture`);
  const usage = record(fixture.usage, `${entry.id}.fixture.usage`);
  exactKeys(usage, ["tokens", "costUsd", "completeness"], `${entry.id}.fixture.usage`);
  const tokens = usage.tokens === null ? null : boundedCount(usage.tokens, `${entry.id}.usage.tokens`, 100_000);
  const costUsd = usage.costUsd === null ? null : typeof usage.costUsd === "number" && Number.isFinite(usage.costUsd) && usage.costUsd >= 0 ? usage.costUsd : (() => { throw new Error(`${entry.id}.usage.costUsd is invalid.`); })();
  if (!AGENT_USAGE_COMPLETENESS.includes(usage.completeness as typeof AGENT_USAGE_COMPLETENESS[number])) throw new Error(`${entry.id}.usage.completeness is invalid.`);
  for (const key of ["revised", "qualified", "infrastructureFailure"] as const) if (typeof fixture[key] !== "boolean") throw new Error(`${entry.id}.fixture.${key} must be boolean.`);
  const result: AgentLoopCase = {
    id: entry.id,
    category: entry.category,
    expectedStopReason: entry.expectedStopReason as AgentLoopCase["expectedStopReason"],
    expectedCompletion: entry.expectedCompletion,
    expectedShortestPath: entry.expectedShortestPath,
    fixture: {
      acceptedToolExecutions: boundedCount(fixture.acceptedToolExecutions, `${entry.id}.acceptedToolExecutions`, 3),
      retrievalRounds: boundedCount(fixture.retrievalRounds, `${entry.id}.retrievalRounds`, 2),
      verificationPasses: boundedCount(fixture.verificationPasses, `${entry.id}.verificationPasses`, 1),
      revised: fixture.revised as boolean,
      qualified: fixture.qualified as boolean,
      removedClaims: boundedCount(fixture.removedClaims, `${entry.id}.removedClaims`, 50),
      supportedClaims: boundedCount(fixture.supportedClaims, `${entry.id}.supportedClaims`, 50),
      citationSupport: boundedCount(fixture.citationSupport, `${entry.id}.citationSupport`, 50),
      evidenceItems: boundedCount(fixture.evidenceItems, `${entry.id}.evidenceItems`, 100),
      latencyMs: boundedCount(fixture.latencyMs, `${entry.id}.latencyMs`, 60_000),
      usage: { tokens, costUsd, completeness: usage.completeness as AgentLoopCase["fixture"]["usage"]["completeness"] },
      infrastructureFailure: fixture.infrastructureFailure as boolean,
    },
  };
  if (result.fixture.citationSupport > result.fixture.supportedClaims) throw new Error(`${entry.id} has more citation support than supported claims.`);
  if (result.expectedShortestPath !== (result.expectedStopReason === "direct_no_tools")) throw new Error(`${entry.id} shortest-path expectation is inconsistent.`);
  if (result.fixture.verificationPasses > 0 && result.expectedStopReason === "direct_no_tools") throw new Error(`${entry.id} direct path cannot verify.`);
  return result;
}

export function validateAgentLoopCorpus(value: unknown): AgentLoopCorpus {
  const root = record(value, "agent-loop corpus");
  exactKeys(root, ["schemaVersion", "corpusVersion", "cases"], "agent-loop corpus");
  if (root.schemaVersion !== AGENT_LOOP_SCHEMA_VERSION || typeof root.corpusVersion !== "string") throw new Error("Unsupported agent-loop corpus header.");
  if (!Array.isArray(root.cases) || root.cases.length < 10) throw new Error("Agent-loop corpus must contain at least ten cases.");
  const ids = new Set<string>();
  const cases = root.cases.map((item, index) => {
    const parsed = validateCase(item, index);
    if (ids.has(parsed.id)) throw new Error(`Duplicate agent-loop case ID: ${parsed.id}.`);
    ids.add(parsed.id);
    return parsed;
  });
  for (const required of ["shortest_path", "bounded_retrieval", "revision", "degradation", "verification_failure", "termination", "cap_enforcement"]) {
    if (!cases.some((item) => item.category === required)) throw new Error(`Agent-loop corpus is missing category ${required}.`);
  }
  return { schemaVersion: 1, corpusVersion: root.corpusVersion, cases };
}

export async function loadAgentLoopCorpus(path: string): Promise<AgentLoopCorpus> {
  const raw = await readFile(path, "utf8");
  try { return validateAgentLoopCorpus(JSON.parse(raw) as unknown); } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Agent-loop corpus validation failed.");
  }
}
