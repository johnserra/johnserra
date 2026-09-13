import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentLoopCorpus } from "./agent-loop-schema";
import type { AgentLoopEvaluation } from "./agent-loop-evaluator";

export function createAgentLoopReport(corpus: AgentLoopCorpus, evaluation: AgentLoopEvaluation, completedAt: string) {
  return {
    reportType: "offline_fixture_replay",
    corpusVersion: corpus.corpusVersion,
    completedAt,
    liveBaseline: false,
    aggregate: evaluation.aggregate,
    cases: evaluation.cases,
  };
}

function markdown(report: ReturnType<typeof createAgentLoopReport>): string {
  const lines = [
    "# Bounded evidence-agent offline report",
    "",
    `Corpus: ${report.corpusVersion}`,
    `Completed: ${report.completedAt}`,
    "Mode: deterministic checked-in fixture replay; no provider, credentials, or network calls.",
    "",
    "## Aggregate",
    "",
    `- Cases: ${report.aggregate.caseCount}; terminated: ${report.aggregate.termination.numerator}/${report.aggregate.termination.denominator}; completed: ${report.aggregate.completion.numerator}/${report.aggregate.completion.denominator}.`,
    `- Stop-reason accuracy: ${report.aggregate.stopReasonAccuracy.numerator}/${report.aggregate.stopReasonAccuracy.denominator}.`,
    `- Claim support proxy: ${report.aggregate.claimSupport.numerator}/${report.aggregate.claimSupport.denominator}; citation support proxy: ${report.aggregate.citationSupport.numerator}/${report.aggregate.citationSupport.denominator}.`,
    `- Shortest-path correctness: ${report.aggregate.shortestPath.numerator}/${report.aggregate.shortestPath.denominator}.`,
    `- Accepted tool executions: ${report.aggregate.acceptedToolExecutions}; retrieval rounds: ${report.aggregate.retrievalRounds}; verification passes: ${report.aggregate.verificationPasses}.`,
    `- Revisions: ${report.aggregate.revisions}; qualifications: ${report.aggregate.qualifications}; removed claims: ${report.aggregate.removedClaims}.`,
    `- Infrastructure failures: ${report.aggregate.infrastructureFailures}; usage completeness complete/partial/unknown: ${report.aggregate.usage.complete}/${report.aggregate.usage.partial}/${report.aggregate.usage.unknown}.`,
    "",
    "## Cases",
    "",
    "| Case | Stop reason | Complete | Tools | Rounds | Verify | Revised | Qualified | Latency ms | Usage | Infra failure |",
    "|---|---|---:|---:|---:|---:|---:|---:|---:|---|---:|",
    ...report.cases.map((item) => `| ${item.id} | ${item.expectedStopReason} | ${item.completion ? "yes" : "no"} | ${item.acceptedToolExecutions} | ${item.retrievalRounds} | ${item.verificationPasses} | ${item.revised ? "yes" : "no"} | ${item.qualified ? "yes" : "no"} | ${item.latencyMs} | ${item.usage.completeness} | ${item.infrastructureFailure ? "yes" : "no"} |`),
    "",
    "These claim and citation figures are deterministic structural proxies over the fixture metadata, not semantic proof. Infrastructure failures are reported separately and never converted into quality passes. Token and cost totals are only meaningful for cases whose usage accounting is marked complete or partial; unknown values remain unknown.",
  ];
  return `${lines.join("\n")}\n`;
}

export async function writeAgentLoopReport(report: ReturnType<typeof createAgentLoopReport>, outputDirectory: string, completedAt: string) {
  await mkdir(outputDirectory, { recursive: true });
  const stem = `agent-loop-${completedAt.replace(/[:.]/gu, "-")}`;
  const jsonPath = path.join(outputDirectory, `${stem}.json`);
  const markdownPath = path.join(outputDirectory, `${stem}.md`);
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, markdown(report), "utf8");
  return { jsonPath, markdownPath };
}
