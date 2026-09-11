import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EvaluationCaseResult, FailureCategory } from "./runner";

export interface BaselineReport {
  schemaVersion: "1.0.0";
  metadata: {
    startedAt: string;
    completedAt: string;
    gitRevision: string;
    gitDirty: boolean | null;
    casesHash: string;
    corpusHash: string;
    sourceContentHashes: Record<string, string>;
    chatModel: string;
    embeddingModel: string;
    embeddingDimensions: number;
    retrievalThreshold: number;
    retrievalCount: number;
    executionMode: "live_with_synthetic_fixture" | "live" | "synthetic_fixture";
    availableCount: number;
    requestedCount: number;
    attemptedCount: number;
    executedCount: number;
    skippedCount: number;
    notRunCount: number;
    complete: boolean;
    qualityGateRequested: boolean;
    qualityGatePassed: boolean;
    scoringLimitations: string[];
  };
  metrics: {
    live: unknown;
    syntheticFixtures: unknown;
  };
  failures: Array<{
    caseId: string;
    stage: "initialization" | "retrieval" | "generation";
    category: FailureCategory;
  }>;
  cases: EvaluationCaseResult[];
  humanReview: {
    status: "unreviewed";
    rubric: string[];
  };
}

function fraction(value: unknown): string {
  const item = value as { numerator?: number; denominator?: number };
  return `${item?.numerator ?? 0}/${item?.denominator ?? 0}`;
}

function markdown(report: BaselineReport): string {
  const live = report.metrics.live as Record<string, unknown>;
  const fixture = report.metrics.syntheticFixtures as Record<string, unknown>;
  const lines = [
    `# Digital Twin baseline — ${report.metadata.completedAt.slice(0, 10)}`,
    "",
    `Status: **${report.metadata.complete ? "COMPLETE" : "INCOMPLETE — infrastructure run"}**`,
    "",
    "## Reproducibility metadata",
    "",
    `- UTC start: ${report.metadata.startedAt}`,
    `- UTC completion: ${report.metadata.completedAt}`,
    `- Git: ${report.metadata.gitRevision} (${report.metadata.gitDirty === null ? "status unavailable" : report.metadata.gitDirty ? "dirty" : "clean"})`,
    `- Cases SHA-256: ${report.metadata.casesHash}`,
    `- Corpus SHA-256: ${report.metadata.corpusHash}`,
    `- Models: ${report.metadata.chatModel}; ${report.metadata.embeddingModel} (${report.metadata.embeddingDimensions} dimensions)`,
    `- Retrieval: threshold ${report.metadata.retrievalThreshold}; count ${report.metadata.retrievalCount}`,
    `- Counts: ${report.metadata.requestedCount} requested, ${report.metadata.attemptedCount} attempted, ${report.metadata.executedCount} recorded as executed, ${report.metadata.skippedCount} skipped, ${report.metadata.notRunCount} not run`,
    "",
    "## Live metrics",
    "",
    `- Final-turn retrieval case hits: ${fraction(live.retrievalCaseHits)} (cases without expected sources are not applicable)`,
    `- Final-turn expected source hits: ${fraction(live.retrievalExpectedSourceHits)}`,
    `- Conversation-wide retrieval case hits (diagnostic only): ${fraction(live.conversationWideRetrievalCaseHits)}`,
    `- Conversation-wide expected source hits (diagnostic only): ${fraction(live.conversationWideRetrievalExpectedSourceHits)}`,
    `- Required-fact phrase/regex coverage: ${fraction(live.requiredFactCoverage)}`,
    `- Uncertainty checks: ${fraction(live.uncertaintyChecks)}`,
    `- Citation presence: ${fraction(live.citationPresence)}`,
    `- Citation expected-source match: ${fraction(live.citationExpectedSourceMatch)}`,
    `- Prohibited-claim violations: ${String(live.prohibitedClaimViolations ?? 0)}; negated/review flags: ${String(live.prohibitedClaimReviewFlags ?? 0)}`,
    `- Cases excluded from answer-quality denominators due to infrastructure failure: ${String(live.excludedInfrastructureCases ?? 0)}`,
    "",
    "## Synthetic indirect-injection fixture",
    "",
    `- Required-fact phrase/regex coverage: ${fraction(fixture.requiredFactCoverage)}`,
    `- Prohibited-claim violations: ${String(fixture.prohibitedClaimViolations ?? 0)}`,
    `- Fixtures excluded from answer-quality denominators due to infrastructure failure: ${String(fixture.excludedInfrastructureCases ?? 0)}`,
    "- Fixture results are robustness observations and are excluded from live retrieval metrics.",
    "",
    "## Method limits",
    "",
    ...report.metadata.scoringLimitations.map((limit) => `- ${limit}`),
    "",
    "## Infrastructure failures",
    "",
    ...(report.failures.length
      ? report.failures.map((failure) => `- ${failure.caseId}: ${failure.stage}/${failure.category}`)
      : ["- None recorded."]),
    "",
    "## Case results",
    "",
  ];
  for (const result of report.cases) {
    lines.push(`### ${result.id}`, "", `Mode/status: ${result.mode} / ${result.status}`, "");
    if (result.status === "not_run") {
      lines.push(`Not run: ${result.notRunReason}`, "");
      continue;
    }
    const score = result.score!;
    lines.push(
      `Final-turn retrieval expected/matched/missing: ${score.retrieval.expected.join(", ") || "n/a"} / ${score.retrieval.matched.join(", ") || "none"} / ${score.retrieval.missing.join(", ") || "none"}`,
      "",
      `Conversation-wide retrieval expected/matched/missing (diagnostic): ${score.conversationWideRetrieval.expected.join(", ") || "n/a"} / ${score.conversationWideRetrieval.matched.join(", ") || "none"} / ${score.conversationWideRetrieval.missing.join(", ") || "none"}`,
      "",
      `Facts: ${score.facts.matched}/${score.facts.total}. ${score.facts.details.map((fact) => `${fact.id}=${fact.matched ? `matched ${fact.matchedPattern}` : "missing"}`).join("; ") || "n/a"}`,
      "",
      `Citations: present=${score.citations.present}, expected-match=${score.citations.matching}, resolution=${score.citations.linkResolution}, semantic-support=${score.citations.semanticSupport}`,
      "",
      `Citation URLs/matches: ${score.citations.urls.join(", ") || "none"} / ${score.citations.matchingUrls.join(", ") || "none"}`,
      "",
      `Uncertainty: required=${score.uncertainty.required}, passed=${score.uncertainty.passed}, matched=${score.uncertainty.matchedPattern ?? "none"}`,
      "",
      `Prohibited claims: ${score.prohibitedClaims.details.map((claim) => `${claim.id}=${claim.violation ? "violation" : claim.reviewFlag ? "negated-review" : "not-matched"}`).join("; ") || "n/a"}`,
      "",
    );
    result.turns.forEach((turn, index) => {
      lines.push(
        `Turn ${index + 1} retrieval (${turn.retrievalLatencyMs} ms): ${turn.retrieval.map((item) => `${item.source} (${item.similarity.toFixed(3)})`).join(", ") || "none"}`,
        "",
      );
      if (turn.retrievalDiagnostics) {
        const rd = turn.retrievalDiagnostics;
        lines.push(
          `Turn ${index + 1} retrieval diagnostics: rewrite=${rd.rewrite.used ? "yes" : "no"}(${rd.rewrite.reason}); embedding=${rd.embedding.fallback ? "fallback" : "ok"}(${rd.embedding.reason}); retrieval=${rd.retrieval.stage}(${rd.retrieval.reason}, ${rd.retrieval.candidateCount} candidates); reranking=${rd.reranking.inputCount}→${rd.reranking.outputCount} (${rd.reranking.durationMs} ms); total=${rd.totalDurationMs} ms`,
          "",
        );
      }
      lines.push(
        `Turn ${index + 1} answer (${turn.generationLatencyMs} ms):`,
        "",
        "````text",
        turn.response.replace(/````/g, "``` `"),
        "````",
        "",
      );
    });
  }
  lines.push(
    "## Human review rubric",
    "",
    "Semantic support remains **unreviewed** until a reviewer checks:",
    "",
    ...report.humanReview.rubric.map((item) => `- ${item}`),
    "",
  );
  return `${lines.join("\n")}\n`;
}

export async function writeReports(report: BaselineReport, outputDirectory: string): Promise<{
  jsonPath: string;
  markdownPath: string;
}> {
  await mkdir(outputDirectory, { recursive: true });
  const timestamp = report.metadata.completedAt.replace(/[:.]/g, "-");
  for (let suffix = 1; suffix < 1_000; suffix += 1) {
    const basename = `baseline-${timestamp}${suffix === 1 ? "" : `-${suffix}`}`;
    const jsonPath = path.join(outputDirectory, `${basename}.json`);
    const markdownPath = path.join(outputDirectory, `${basename}.md`);
    try {
      await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
      try {
        await writeFile(markdownPath, markdown(report), { flag: "wx" });
      } catch (error) {
        await writeFile(jsonPath, "", { flag: "a" });
        throw error;
      }
      return { jsonPath, markdownPath };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  throw new Error("Could not allocate a unique report filename.");
}
