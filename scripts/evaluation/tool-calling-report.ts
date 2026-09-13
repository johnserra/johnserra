import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ToolCallingEvaluation } from "./tool-calling-evaluator";
import type { LoadedToolCallingCorpus } from "./tool-calling-schema";
import { CHAT_MAX_TOOL_CALLS } from "../../src/lib/chat/limits";

export interface ToolCallingReport {
  schemaVersion: "1.0.0";
  metadata: {
    completedAt: string;
    corpusVersion: string;
    corpusHash: string;
    gitRevision: string;
    gitDirty: boolean | null;
    mode: "offline_fixture";
    caseCount: number;
    maxRequestedToolCalls: number;
    limitations: string[];
  };
  metrics: ToolCallingEvaluation["metrics"];
  cases: ToolCallingEvaluation["cases"];
  infrastructureFailures: [];
}

const LIMITATIONS = [
  "Offline fixtures validate bounded orchestration and deterministic scoring; they do not establish live Gemini tool-selection reliability.",
  "Required phrase and citation checks are automated proxies, not semantic proof that an answer is faithful or that a citation supports a claim.",
  "Fixture evidence is intentionally sanitized and public; no private conversations, provider payloads, credentials, IDs, or stack traces are persisted.",
  "Infrastructure failures are not converted into quality passes; a failed offline run should be reported as infrastructure failure by the caller.",
];

function fraction(metric: { numerator: number; denominator: number }): string {
  return `${metric.numerator}/${metric.denominator}`;
}

function markdown(report: ToolCallingReport): string {
  const lines = [
    "# Bounded multi-tool evaluation",
    "",
    `Mode: **${report.metadata.mode}**; corpus ${report.metadata.corpusVersion} (${report.metadata.corpusHash})`,
    `Completed: ${report.metadata.completedAt}; Git: ${report.metadata.gitRevision} (${report.metadata.gitDirty === null ? "status unavailable" : report.metadata.gitDirty ? "dirty" : "clean"})`,
    "",
    "## Aggregate metrics",
    "",
    `- Selected-tool precision: ${fraction(report.metrics.selectedToolPrecision)}`,
    `- Selected-tool recall: ${fraction(report.metrics.selectedToolRecall)}`,
    `- Unnecessary-tool rate: ${fraction(report.metrics.unnecessaryToolRate)}`,
    `- Incorrect-tool rate: ${fraction(report.metrics.incorrectToolRate)}`,
    `- Redundant requested calls: ${fraction(report.metrics.redundantRequestedCalls)}`,
    `- Redundant executed calls: ${fraction(report.metrics.redundantExecutedCalls)}`,
    `- Call-limit compliance: ${fraction(report.metrics.callLimitCompliance)}`,
    `- Successful distinct tools: ${fraction(report.metrics.successfulDistinctToolCount)} (sum / cases)`,
    `- Graceful degradation: ${fraction(report.metrics.gracefulDegradation)}`,
    `- Evidence support: ${fraction(report.metrics.evidenceSupport)}`,
    `- Citation support: ${fraction(report.metrics.citationSupport)}`,
    `- Answer faithfulness proxy: ${fraction(report.metrics.answerFaithfulness)}`,
    `- No-tool control accuracy: ${fraction(report.metrics.noToolControlAccuracy)}`,
    "- Semantic proof: not_proven",
    "",
    "## Case results",
    "",
  ];
  for (const item of report.cases) {
    lines.push(
      `### ${item.id}`,
      "",
      `Selected: ${item.selectedTools.join(", ") || "none"}`,
      `Counts: requested=${item.boundedCounts.requested}, unique=${item.boundedCounts.uniqueRequested}, executed=${item.boundedCounts.executed}, unique executed=${item.boundedCounts.uniqueExecuted}, redundant requested=${item.boundedCounts.redundantRequested}, redundant executed=${item.boundedCounts.redundantExecuted}`,
      `Call limit: ${item.callLimitCompliant ? "pass" : "fail"}; successful distinct tools: ${item.boundedCounts.successfulDistinctTools}`,
      `Graceful degradation: ${item.gracefulDegradation === null ? "not applicable" : item.gracefulDegradation ? "pass" : "fail"}`,
      `Answer: evidence ${item.answerScoring.evidenceExpectationsPassed}/${item.answerScoring.evidenceExpectationsTotal}, deterministic checks ${item.answerScoring.deterministicChecksPassed ? "pass" : "fail"}, faithful proxy ${item.answerScoring.faithful ? "pass" : "fail"}`,
      `No-tool control: ${item.noToolControlPassed === null ? "not applicable" : item.noToolControlPassed ? "pass" : "fail"}`,
      `Dispositions: ${item.resultDispositions.map((result) => `${result.tool}=${result.disposition}${result.category ? `(${result.category})` : ""}`).join(", ") || "none"}`,
      "",
    );
  }
  lines.push("## Limitations", "", ...report.metadata.limitations.map((item) => `- ${item}`), "");
  return `${lines.join("\n")}\n`;
}

export async function writeToolCallingReport(report: ToolCallingReport, outputDirectory: string, timestamp = report.metadata.completedAt): Promise<{ jsonPath: string; markdownPath: string }> {
  await mkdir(outputDirectory, { recursive: true });
  const safeTimestamp = timestamp.replace(/[:.]/gu, "-");
  for (let suffix = 1; suffix < 1_000; suffix += 1) {
    const base = `tool-calling-${safeTimestamp}${suffix === 1 ? "" : `-${suffix}`}`;
    const jsonPath = path.join(outputDirectory, `${base}.json`);
    const markdownPath = path.join(outputDirectory, `${base}.md`);
    try {
      await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
      await writeFile(markdownPath, markdown(report), { flag: "wx" });
      return { jsonPath, markdownPath };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  throw new Error("Could not allocate a unique tool-calling report filename.");
}

export function createToolCallingReport(
  corpus: LoadedToolCallingCorpus,
  evaluation: ToolCallingEvaluation,
  metadata: Pick<ToolCallingReport["metadata"], "completedAt" | "gitRevision" | "gitDirty">,
): ToolCallingReport {
  return {
    schemaVersion: "1.0.0",
    metadata: {
      ...metadata,
      corpusVersion: corpus.corpusVersion,
      corpusHash: corpus.corpusHash,
      mode: "offline_fixture",
      caseCount: corpus.cases.length,
      maxRequestedToolCalls: CHAT_MAX_TOOL_CALLS,
      limitations: LIMITATIONS,
    },
    metrics: evaluation.metrics,
    cases: evaluation.cases,
    infrastructureFailures: [],
  };
}
