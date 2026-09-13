import type { ToolCallingCase } from "./tool-calling-schema";
import { CHAT_MAX_TOOL_CALLS } from "../../src/lib/chat/limits";

export interface FractionMetric {
  numerator: number;
  denominator: number;
}

export interface ToolCallingCaseScore {
  selectedTools: string[];
  expectedTools: string[];
  allowedTools: string[];
  forbiddenTools: string[];
  requestedCallCount: number;
  uniqueRequestedCallCount: number;
  executedCallCount: number;
  uniqueExecutedCallCount: number;
  redundantRequestedCallCount: number;
  redundantExecutedCallCount: number;
  successfulDistinctTools: string[];
  resultDispositions: Array<{
    tool: string;
    disposition: string;
    category: string | null;
    resultId: string | null;
  }>;
  callLimitCompliant: boolean;
  gracefulDegradationPassed: boolean | null;
  answerScoring: {
    evidenceExpectationsPassed: number;
    evidenceExpectationsTotal: number;
    deterministicChecksPassed: boolean;
    faithful: boolean;
    details: Array<{
      resultId: string;
      successfulEvidencePresent: boolean;
      requiredFactsInEvidence: boolean;
      requiredCitationsInEvidence: boolean;
      requiredFactsInAnswer: boolean;
      requiredCitationsInAnswer: boolean;
    }>;
  };
  noToolControlPassed: boolean | null;
}

export interface ToolCallingAggregateMetrics {
  selectedToolPrecision: FractionMetric;
  selectedToolRecall: FractionMetric;
  unnecessaryToolRate: FractionMetric;
  incorrectToolRate: FractionMetric;
  redundantRequestedCalls: FractionMetric;
  redundantExecutedCalls: FractionMetric;
  callLimitCompliance: FractionMetric;
  successfulDistinctToolCount: FractionMetric;
  gracefulDegradation: FractionMetric;
  evidenceSupport: FractionMetric;
  citationSupport: FractionMetric;
  answerFaithfulness: FractionMetric;
  noToolControlAccuracy: FractionMetric;
  semanticProof: "not_proven";
}

function matches(pattern: string, text: string): boolean {
  return new RegExp(pattern, "iu").test(text);
}

function everyPattern(patterns: readonly string[], text: string): boolean {
  return patterns.every((pattern) => matches(pattern, text));
}

function fraction(numerator: number, denominator: number): FractionMetric {
  return { numerator, denominator };
}

export function scoreToolCallingCase(item: ToolCallingCase): ToolCallingCaseScore {
  const replay = item.fixture;
  const selectedTools = [...new Set(replay.requestedCalls.map((call) => call.tool))];
  const uniqueRequested = new Set(replay.requestedCalls.map((call) => call.identity));
  const resultById = new Map(replay.results.map((result) => [result.id, result]));
  const executedResults = replay.executions.map((execution) => ({
    execution,
    result: resultById.get(execution.resultId)!,
  }));
  const acceptedExecutions = executedResults.filter(({ result }) => result.disposition === "success");
  const uniqueExecuted = new Set(acceptedExecutions.map(({ execution }) => execution.identity));
  const successfulDistinctTools = [...new Set(acceptedExecutions
    .map(({ execution }) => execution.tool)
  )];
  const resultDispositions = executedResults.map(({ execution, result }) => ({
    tool: execution.tool,
    disposition: result.disposition,
    category: result.category,
    resultId: result.id,
  }));
  const evidenceDetails = item.evidenceExpectations.map((expectation) => {
    const result = replay.results.find((candidate) => candidate.id === expectation.resultId);
    const successfulEvidencePresent = Boolean(result && result.disposition === "success");
    const requiredFactsInEvidence = Boolean(result && everyPattern(expectation.requiredFacts, result.facts.join("\n")));
    const requiredCitationsInEvidence = Boolean(result && expectation.requiredCitations.every((citation) => result.citations.includes(citation)));
    const requiredFactsInAnswer = everyPattern(expectation.requiredFacts, replay.answer);
    const requiredCitationsInAnswer = expectation.requiredCitations.every((citation) => replay.answer.includes(citation));
    return {
      resultId: expectation.resultId,
      successfulEvidencePresent,
      requiredFactsInEvidence,
      requiredCitationsInEvidence,
      requiredFactsInAnswer,
      requiredCitationsInAnswer,
    };
  });
  const evidenceExpectationsPassed = evidenceDetails.filter((detail) => detail.successfulEvidencePresent
    && detail.requiredFactsInEvidence
    && detail.requiredCitationsInEvidence
    && detail.requiredFactsInAnswer
    && detail.requiredCitationsInAnswer).length;
  const deterministicChecksPassed = everyPattern(item.answerChecks.requiredPatterns, replay.answer)
    && item.answerChecks.forbiddenPatterns.every((pattern) => !matches(pattern, replay.answer));
  const faithful = evidenceExpectationsPassed === evidenceDetails.length && deterministicChecksPassed;
  const failedResults = executedResults.filter(({ result }) => result.disposition === "safe_failure").map(({ result }) => result);
  const successfulResultCount = new Set(acceptedExecutions.map(({ result }) => result.id)).size;
  let gracefulDegradationPassed: boolean | null = null;
  if (item.gracefulDegradation.mode !== "none") {
    const categoryMatch = failedResults.some((result) => item.gracefulDegradation.failureCategories.includes(result.category!));
    const siblingMatch = !item.gracefulDegradation.requiresSuccessfulSibling || successfulResultCount > 0;
    const acknowledgementMatch = everyPattern(item.gracefulDegradation.acknowledgementPatterns, replay.answer);
    gracefulDegradationPassed = item.gracefulDegradation.mode === "partial_success"
      ? categoryMatch && siblingMatch && successfulResultCount > 0 && acknowledgementMatch
      : categoryMatch && successfulResultCount === 0;
  }
  const noToolControlPassed = item.categories.includes("no-tool-control")
    ? selectedTools.length === 0 && deterministicChecksPassed
    : null;
  const callLimitCompliant = item.expectedOutcome === "call_limit_rejected"
    ? replay.requestedCalls.length > CHAT_MAX_TOOL_CALLS && replay.executions.length === 0
    : replay.requestedCalls.length <= CHAT_MAX_TOOL_CALLS;
  return {
    selectedTools,
    expectedTools: item.expectedTools,
    allowedTools: item.allowedTools,
    forbiddenTools: item.forbiddenTools,
    requestedCallCount: replay.requestedCalls.length,
    uniqueRequestedCallCount: uniqueRequested.size,
    executedCallCount: acceptedExecutions.length,
    uniqueExecutedCallCount: uniqueExecuted.size,
    redundantRequestedCallCount: replay.requestedCalls.length - uniqueRequested.size,
    redundantExecutedCallCount: acceptedExecutions.length - uniqueExecuted.size,
    successfulDistinctTools,
    resultDispositions,
    callLimitCompliant,
    gracefulDegradationPassed,
    answerScoring: {
      evidenceExpectationsPassed,
      evidenceExpectationsTotal: evidenceDetails.length,
      deterministicChecksPassed,
      faithful,
      details: evidenceDetails,
    },
    noToolControlPassed,
  };
}

export function aggregateToolCallingScores(
  cases: ToolCallingCase[],
  scores: ToolCallingCaseScore[],
): ToolCallingAggregateMetrics {
  const selected = scores.reduce((sum, score) => sum + score.selectedTools.length, 0);
  const expected = scores.reduce((sum, score) => sum + score.expectedTools.length, 0);
  const selectedExpected = scores.reduce((sum, score) => sum + score.selectedTools.filter((tool) => score.expectedTools.includes(tool)).length, 0);
  const unnecessary = scores.reduce((sum, score) => sum + score.selectedTools.filter((tool) => !score.expectedTools.includes(tool)).length, 0);
  const incorrect = scores.reduce((sum, score) => sum + score.selectedTools.filter((tool) => score.forbiddenTools.includes(tool) || !score.allowedTools.includes(tool)).length, 0);
  const requested = scores.reduce((sum, score) => sum + score.requestedCallCount, 0);
  const executed = scores.reduce((sum, score) => sum + score.executedCallCount, 0);
  const redundantRequested = scores.reduce((sum, score) => sum + score.redundantRequestedCallCount, 0);
  const redundantExecuted = scores.reduce((sum, score) => sum + score.redundantExecutedCallCount, 0);
  const graceful = scores.filter((score) => score.gracefulDegradationPassed !== null);
  const evidenceTotal = scores.reduce((sum, score) => sum + score.answerScoring.evidenceExpectationsTotal, 0);
  const evidencePassed = scores.reduce((sum, score) => sum + score.answerScoring.evidenceExpectationsPassed, 0);
  const citationPassed = scores.reduce((sum, score) => sum + score.answerScoring.details.filter((detail) => detail.successfulEvidencePresent
    && detail.requiredCitationsInEvidence
    && detail.requiredCitationsInAnswer).length, 0);
  const controls = scores.filter((score) => score.noToolControlPassed !== null);
  return {
    selectedToolPrecision: fraction(selectedExpected, selected),
    selectedToolRecall: fraction(selectedExpected, expected),
    unnecessaryToolRate: fraction(unnecessary, selected),
    incorrectToolRate: fraction(incorrect, selected),
    redundantRequestedCalls: fraction(redundantRequested, requested),
    redundantExecutedCalls: fraction(redundantExecuted, executed),
    callLimitCompliance: fraction(scores.filter((score) => score.callLimitCompliant).length, scores.length),
    successfulDistinctToolCount: fraction(scores.reduce((sum, score) => sum + score.successfulDistinctTools.length, 0), scores.length),
    gracefulDegradation: fraction(graceful.filter((score) => score.gracefulDegradationPassed === true).length, graceful.length),
    evidenceSupport: fraction(evidencePassed, evidenceTotal),
    citationSupport: fraction(citationPassed, evidenceTotal),
    answerFaithfulness: fraction(scores.filter((score) => score.answerScoring.faithful).length, cases.length),
    noToolControlAccuracy: fraction(controls.filter((score) => score.noToolControlPassed === true).length, controls.length),
    semanticProof: "not_proven",
  };
}
