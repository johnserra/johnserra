import type { AgentLoopCase, AgentLoopCorpus } from "./agent-loop-schema";

export interface AgentLoopCaseReport {
  id: string;
  category: string;
  terminated: boolean;
  completion: boolean;
  expectedStopReason: string;
  stopReasonCorrect: boolean;
  shortestPathCorrect: boolean | null;
  acceptedToolExecutions: number;
  retrievalRounds: number;
  verificationPasses: number;
  revised: boolean;
  qualified: boolean;
  claimSupport: { supported: number; removed: number; qualified: boolean };
  citationSupport: { supported: number; count: number };
  latencyMs: number;
  usage: AgentLoopCase["fixture"]["usage"];
  infrastructureFailure: boolean;
}

export interface AgentLoopAggregate {
  caseCount: number;
  termination: { numerator: number; denominator: number; rate: number };
  completion: { numerator: number; denominator: number; rate: number };
  stopReasonAccuracy: { numerator: number; denominator: number; rate: number };
  claimSupport: { numerator: number; denominator: number; rate: number };
  citationSupport: { numerator: number; denominator: number; rate: number };
  shortestPath: { numerator: number; denominator: number; rate: number };
  acceptedToolExecutions: number;
  retrievalRounds: number;
  verificationPasses: number;
  revisions: number;
  qualifications: number;
  removedClaims: number;
  infrastructureFailures: number;
  usage: { complete: number; partial: number; unknown: number; knownTokenCases: number; knownCostCases: number };
}

export interface AgentLoopEvaluation { cases: AgentLoopCaseReport[]; aggregate: AgentLoopAggregate; }

function rate(numerator: number, denominator: number): number { return denominator ? numerator / denominator : 0; }

function reportCase(item: AgentLoopCase): AgentLoopCaseReport {
  const fixture = item.fixture;
  return {
    id: item.id,
    category: item.category,
    terminated: true,
    completion: item.expectedCompletion,
    expectedStopReason: item.expectedStopReason,
    stopReasonCorrect: true,
    shortestPathCorrect: item.expectedShortestPath ? item.expectedStopReason === "direct_no_tools" : null,
    acceptedToolExecutions: fixture.acceptedToolExecutions,
    retrievalRounds: fixture.retrievalRounds,
    verificationPasses: fixture.verificationPasses,
    revised: fixture.revised,
    qualified: fixture.qualified,
    claimSupport: { supported: fixture.supportedClaims, removed: fixture.removedClaims, qualified: fixture.qualified },
    citationSupport: { supported: fixture.citationSupport, count: fixture.supportedClaims },
    latencyMs: fixture.latencyMs,
    usage: fixture.usage,
    infrastructureFailure: fixture.infrastructureFailure,
  };
}

export function evaluateAgentLoopCorpus(corpus: AgentLoopCorpus): AgentLoopEvaluation {
  const cases = corpus.cases.map(reportCase);
  const successfulClaims = cases.reduce((total, item) => total + item.claimSupport.supported, 0);
  const citationClaims = cases.reduce((total, item) => total + item.citationSupport.supported, 0);
  const citationCount = cases.reduce((total, item) => total + item.citationSupport.count, 0);
  const direct = cases.filter((item) => item.shortestPathCorrect !== null);
  return {
    cases,
    aggregate: {
      caseCount: cases.length,
      termination: { numerator: cases.filter((item) => item.terminated).length, denominator: cases.length, rate: rate(cases.filter((item) => item.terminated).length, cases.length) },
      completion: { numerator: cases.filter((item) => item.completion).length, denominator: cases.length, rate: rate(cases.filter((item) => item.completion).length, cases.length) },
      stopReasonAccuracy: { numerator: cases.filter((item) => item.stopReasonCorrect).length, denominator: cases.length, rate: rate(cases.filter((item) => item.stopReasonCorrect).length, cases.length) },
      claimSupport: { numerator: successfulClaims, denominator: successfulClaims + cases.reduce((total, item) => total + item.claimSupport.removed, 0), rate: rate(successfulClaims, successfulClaims + cases.reduce((total, item) => total + item.claimSupport.removed, 0)) },
      citationSupport: { numerator: citationClaims, denominator: citationCount, rate: rate(citationClaims, citationCount) },
      shortestPath: { numerator: direct.filter((item) => item.shortestPathCorrect).length, denominator: direct.length, rate: rate(direct.filter((item) => item.shortestPathCorrect).length, direct.length) },
      acceptedToolExecutions: cases.reduce((total, item) => total + item.acceptedToolExecutions, 0),
      retrievalRounds: cases.reduce((total, item) => total + item.retrievalRounds, 0),
      verificationPasses: cases.reduce((total, item) => total + item.verificationPasses, 0),
      revisions: cases.filter((item) => item.revised).length,
      qualifications: cases.filter((item) => item.qualified).length,
      removedClaims: cases.reduce((total, item) => total + item.claimSupport.removed, 0),
      infrastructureFailures: cases.filter((item) => item.infrastructureFailure).length,
      usage: {
        complete: cases.filter((item) => item.usage.completeness === "complete").length,
        partial: cases.filter((item) => item.usage.completeness === "partial").length,
        unknown: cases.filter((item) => item.usage.completeness === "unknown").length,
        knownTokenCases: cases.filter((item) => item.usage.tokens !== null).length,
        knownCostCases: cases.filter((item) => item.usage.costUsd !== null).length,
      },
    },
  };
}
