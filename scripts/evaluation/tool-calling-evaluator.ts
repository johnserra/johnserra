import type { ToolCallingCorpus } from "./tool-calling-schema";
import { aggregateToolCallingScores, scoreToolCallingCase, type ToolCallingAggregateMetrics, type ToolCallingCaseScore } from "./tool-calling-scoring";

export interface ToolCallingEvaluationCase {
  id: string;
  status: "executed";
  selectedTools: string[];
  resultDispositions: ToolCallingCaseScore["resultDispositions"];
  boundedCounts: {
    requested: number;
    uniqueRequested: number;
    executed: number;
    uniqueExecuted: number;
    redundantRequested: number;
    redundantExecuted: number;
    successfulDistinctTools: number;
  };
  callLimitCompliant: boolean;
  gracefulDegradation: boolean | null;
  answerScoring: ToolCallingCaseScore["answerScoring"];
  noToolControlPassed: boolean | null;
}

export interface ToolCallingEvaluation {
  metrics: ToolCallingAggregateMetrics;
  cases: ToolCallingEvaluationCase[];
}

export function evaluateToolCallingCorpus(corpus: ToolCallingCorpus): ToolCallingEvaluation {
  const scores = corpus.cases.map(scoreToolCallingCase);
  return {
    metrics: aggregateToolCallingScores(corpus.cases, scores),
    cases: corpus.cases.map((item, index) => {
      const score = scores[index];
      return {
        id: item.id,
        status: "executed",
        selectedTools: score.selectedTools,
        resultDispositions: score.resultDispositions,
        boundedCounts: {
          requested: score.requestedCallCount,
          uniqueRequested: score.uniqueRequestedCallCount,
          executed: score.executedCallCount,
          uniqueExecuted: score.uniqueExecutedCallCount,
          redundantRequested: score.redundantRequestedCallCount,
          redundantExecuted: score.redundantExecutedCallCount,
          successfulDistinctTools: score.successfulDistinctTools.length,
        },
        callLimitCompliant: score.callLimitCompliant,
        gracefulDegradation: score.gracefulDegradationPassed,
        answerScoring: score.answerScoring,
        noToolControlPassed: score.noToolControlPassed,
      };
    }),
  };
}
