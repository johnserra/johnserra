import type { AssistantCase } from "./schema";

export interface RetrievedSourceObservation {
  source: string;
  similarity: number;
}

export interface TurnObservation {
  response: string;
  retrieval: RetrievedSourceObservation[];
  failureCategory?: string;
}

export interface CaseObservation {
  caseDefinition: AssistantCase;
  turns: TurnObservation[];
}

function firstMatch(text: string, patterns: string[]): string | undefined {
  return patterns.find((pattern) => new RegExp(pattern, "iu").test(text));
}

export function extractCitationUrls(text: string): string[] {
  const urls = new Set<string>();
  const markdown = /\[[^\]]+\]\(((?:https?:\/\/[^\s)]+)|(?:\/[^\s)]+))\)/giu;
  const bare = /https?:\/\/[^\s)<>{}\]]+/giu;
  for (const match of text.matchAll(markdown)) urls.add(match[1]);
  for (const match of text.matchAll(bare)) urls.add(match[0].replace(/[.,;:!?]+$/, ""));
  return [...urls];
}

function comparablePath(url: string): string | undefined {
  try {
    const parsed = url.startsWith("/") ? new URL(url, "https://johnserra.com") : new URL(url);
    if (parsed.hostname !== "johnserra.com" && parsed.hostname !== "www.johnserra.com") return undefined;
    return parsed.pathname.length > 1 ? parsed.pathname.replace(/\/$/, "") : parsed.pathname;
  } catch {
    return undefined;
  }
}

export function scoreCase(observation: CaseObservation) {
  const definition = observation.caseDefinition;
  const finalTurn = observation.turns.at(-1);
  const response = finalTurn?.response ?? "";
  const finalTurnRetrieved = new Set(finalTurn?.retrieval.map((match) => match.source) ?? []);
  const conversationRetrieved = new Set(observation.turns.flatMap((turn) => turn.retrieval.map((match) => match.source)));
  const retrievalResult = (retrieved: Set<string>) => ({
    applicable: definition.expectedSourceIds.length > 0 && !definition.fixture,
    expected: definition.expectedSourceIds,
    matched: definition.expectedSourceIds.filter((source) => retrieved.has(source)),
    missing: definition.expectedSourceIds.filter((source) => !retrieved.has(source)),
  });
  const facts = definition.requiredFacts.map((fact) => {
    const pattern = firstMatch(response, fact.patterns);
    return { id: fact.id, matched: Boolean(pattern), matchedPattern: pattern ?? null };
  });
  const prohibitedClaims = definition.prohibitedClaims.map((claim) => {
    const pattern = firstMatch(response, claim.patterns);
    const negationPattern = pattern ? firstMatch(response, claim.allowedNegationPatterns) : undefined;
    return {
      id: claim.id,
      matched: Boolean(pattern),
      violation: Boolean(pattern && !negationPattern),
      reviewFlag: Boolean(pattern && negationPattern),
      matchedPattern: pattern ?? null,
      matchedNegationPattern: negationPattern ?? null,
    };
  });
  const uncertaintyPattern = firstMatch(response, definition.uncertainty.patterns);
  const citationUrls = extractCitationUrls(response);
  const citedPaths = citationUrls.map(comparablePath).filter((path): path is string => Boolean(path));
  const expectedPaths = definition.citations.expectedUrls.map(comparablePath).filter((path): path is string => Boolean(path));
  const matchingCitationUrls = citationUrls.filter((url) => {
    const path = comparablePath(url);
    return Boolean(path && expectedPaths.includes(path));
  });
  const unexpectedJohnSerraPaths = [...new Set(citedPaths.filter((path) => !expectedPaths.includes(path)))];
  const missingExpectedPaths = [...new Set(expectedPaths.filter((path) => !citedPaths.includes(path)))];
  const hasAllExpected = expectedPaths.length > 0 && missingExpectedPaths.length === 0;
  const hasNoUnexpected = unexpectedJohnSerraPaths.length === 0;
  const citationMatching = hasAllExpected && hasNoUnexpected;

  return {
    retrieval: {
      ...retrievalResult(finalTurnRetrieved),
      evaluatedTurn: observation.turns.length,
    },
    conversationWideRetrieval: retrievalResult(conversationRetrieved),
    facts: {
      matched: facts.filter((fact) => fact.matched).length,
      total: facts.length,
      details: facts,
    },
    prohibitedClaims: {
      violations: prohibitedClaims.filter((claim) => claim.violation).length,
      reviewFlags: prohibitedClaims.filter((claim) => claim.reviewFlag).length,
      details: prohibitedClaims,
    },
    uncertainty: {
      required: definition.uncertainty.required,
      passed: !definition.uncertainty.required || Boolean(uncertaintyPattern),
      matchedPattern: uncertaintyPattern ?? null,
    },
    citations: {
      required: definition.citations.required,
      present: citationUrls.length > 0,
      matching: citationMatching,
      urls: citationUrls,
      matchingUrls: matchingCitationUrls,
      unexpectedJohnSerraPaths,
      missingExpectedPaths,
      linkResolution: "not_checked" as const,
      semanticSupport: "unreviewed" as const,
    },
  };
}

export function aggregateScores(
  scoredCases: Array<ReturnType<typeof scoreCase>>,
  excludedInfrastructureCases = 0,
) {
  const applicableRetrieval = scoredCases.filter((item) => item.retrieval.applicable);
  const applicableConversationRetrieval = scoredCases.filter((item) => item.conversationWideRetrieval.applicable);
  const expectedSourceTotal = applicableRetrieval.reduce((sum, item) => sum + item.retrieval.expected.length, 0);
  const matchedSourceTotal = applicableRetrieval.reduce((sum, item) => sum + item.retrieval.matched.length, 0);
  const conversationExpectedSourceTotal = applicableConversationRetrieval.reduce(
    (sum, item) => sum + item.conversationWideRetrieval.expected.length,
    0,
  );
  const conversationMatchedSourceTotal = applicableConversationRetrieval.reduce(
    (sum, item) => sum + item.conversationWideRetrieval.matched.length,
    0,
  );
  const factTotal = scoredCases.reduce((sum, item) => sum + item.facts.total, 0);
  const factMatches = scoredCases.reduce((sum, item) => sum + item.facts.matched, 0);
  const citationApplicable = scoredCases.filter((item) => item.citations.required);
  const uncertaintyApplicable = scoredCases.filter((item) => item.uncertainty.required);
  return {
    retrievalCaseHits: {
      numerator: applicableRetrieval.filter((item) => item.retrieval.matched.length > 0).length,
      denominator: applicableRetrieval.length,
      notApplicable: scoredCases.length - applicableRetrieval.length,
    },
    retrievalExpectedSourceHits: { numerator: matchedSourceTotal, denominator: expectedSourceTotal },
    conversationWideRetrievalCaseHits: {
      numerator: applicableConversationRetrieval.filter((item) => item.conversationWideRetrieval.matched.length > 0).length,
      denominator: applicableConversationRetrieval.length,
      notApplicable: scoredCases.length - applicableConversationRetrieval.length,
    },
    conversationWideRetrievalExpectedSourceHits: {
      numerator: conversationMatchedSourceTotal,
      denominator: conversationExpectedSourceTotal,
    },
    requiredFactCoverage: { numerator: factMatches, denominator: factTotal },
    prohibitedClaimViolations: scoredCases.reduce((sum, item) => sum + item.prohibitedClaims.violations, 0),
    prohibitedClaimReviewFlags: scoredCases.reduce((sum, item) => sum + item.prohibitedClaims.reviewFlags, 0),
    uncertaintyChecks: {
      numerator: uncertaintyApplicable.filter((item) => item.uncertainty.passed).length,
      denominator: uncertaintyApplicable.length,
    },
    citationPresence: {
      numerator: citationApplicable.filter((item) => item.citations.present).length,
      denominator: citationApplicable.length,
    },
    citationExpectedSourceMatch: {
      numerator: citationApplicable.filter((item) => item.citations.matching).length,
      denominator: citationApplicable.length,
    },
    excludedInfrastructureCases,
    semanticSupport: "unreviewed" as const,
  };
}
