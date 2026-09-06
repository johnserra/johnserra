import type { Locale } from "@/types";

export const ASSESSMENT_VERSION = "data-audit-v1" as const;

export const PILLARS = ["metrics", "data", "reporting", "ownership"] as const;
export type Pillar = (typeof PILLARS)[number];

export const PILLAR_WEIGHTS: Record<Pillar, number> = {
  metrics: 0.3,
  data: 0.3,
  reporting: 0.25,
  ownership: 0.15,
};

export const SCORED_RESPONSES = ["yes", "partial", "no", "unsure"] as const;
export type ScoredResponse = (typeof SCORED_RESPONSES)[number];

export const FLAG_RESPONSES = ["yes", "no", "unsure"] as const;
export type FlagResponse = (typeof FLAG_RESPONSES)[number];

export const SCORED_QUESTION_IDS = [
  "M1", "M2", "M3", "M4", "M5",
  "D1", "D2", "D3", "D4", "D5",
  "R1", "R2", "R3", "R4", "R5",
  "O1", "O2", "O3", "O4", "O5",
] as const;
export type ScoredQuestionId = (typeof SCORED_QUESTION_IDS)[number];

export const FLAG_IDS = ["F1", "F2", "F3", "F4", "F5"] as const;
export type FlagId = (typeof FLAG_IDS)[number];

export type ActionId = `action_${ScoredQuestionId}`;

export interface ScoredQuestion {
  id: ScoredQuestionId;
  pillar: Pillar;
  actionId: ActionId;
}

export const QUESTION_CATALOG: readonly ScoredQuestion[] = SCORED_QUESTION_IDS.map((id) => ({
  id,
  pillar: id.startsWith("M")
    ? "metrics"
    : id.startsWith("D")
      ? "data"
      : id.startsWith("R")
        ? "reporting"
        : "ownership",
  actionId: `action_${id}`,
}));

export const ACTION_IDS = QUESTION_CATALOG.map((question) => question.actionId) as ActionId[];

export const BARRIERS = {
  metrics: "Metrics Without Direction",
  data: "Data-Rich but Untrusted",
  reporting: "Reporting Without Action",
  ownership: "Ownerless Analytics",
} as const;
export type Barrier = (typeof BARRIERS)[Pillar];

export const MATURITY_BANDS = [
  "Ready to Scale",
  "Functional but Fragile",
  "Developing",
  "Flying Blind",
] as const;
export type MaturityBand = (typeof MATURITY_BANDS)[number];

export const CTA_ROUTES = [
  "self_service",
  "guided_diagnostic",
  "implementation",
  "optimization",
] as const;
export type CtaRoute = (typeof CTA_ROUTES)[number];

export const ROLES = ["owner", "executive", "operations", "finance", "marketing", "other"] as const;
export const EMPLOYEE_BANDS = ["1-9", "10-24", "25-49", "50-99", "100-plus"] as const;
export const REVENUE_BANDS = ["pre-revenue", "under-1m", "1m-5m", "5m-20m", "20m-plus", "prefer-not"] as const;
export const OUTCOMES = ["growth", "profitability", "cash-flow", "operations", "customer", "reporting"] as const;

export type BusinessContext = {
  role: (typeof ROLES)[number];
  employeeBand: (typeof EMPLOYEE_BANDS)[number];
  revenueBand: (typeof REVENUE_BANDS)[number];
  primaryOutcome: (typeof OUTCOMES)[number];
};

export type ScoredAnswers = Record<ScoredQuestionId, ScoredResponse>;
export type RedFlagAnswers = Record<FlagId, FlagResponse>;

export type IncompleteAssessmentResult = {
  complete: false;
  version: typeof ASSESSMENT_VERSION;
  missingScoredIds: ScoredQuestionId[];
};

export type CompletedAssessmentResult = {
  complete: true;
  version: typeof ASSESSMENT_VERSION;
  overallRaw: number;
  overallScore: number;
  pillarScores: Record<Pillar, number>;
  rawMaturity: MaturityBand;
  displayedMaturity: MaturityBand;
  barrierPillar: Pillar;
  barrier: Barrier;
  opportunityKind: "barrier" | "growth_opportunity";
  triggeredFlagIds: FlagId[];
  uncertaintyCount: number;
  profile: "verification" | "optimization" | "foundation";
  actionIds: [ActionId, ActionId, ActionId];
  firstRecommendation: ActionId;
  ctaRoute: CtaRoute;
};

export type AssessmentResult = IncompleteAssessmentResult | CompletedAssessmentResult;

const RESPONSE_POINTS: Record<ScoredResponse, number> = {
  yes: 3,
  partial: 2,
  no: 0,
  unsure: 0,
};

// Earlier entries are prerequisites for later analytics work. In particular,
// definitions precede reconciliation and trustworthy data precedes dashboard tuning.
const UPSTREAM_ORDER: readonly ScoredQuestionId[] = [
  "M1", "M2", "M3",
  "D1", "D2", "D3", "D4", "D5",
  "M4", "M5",
  "O1", "O2", "O3", "O4", "O5",
  "R1", "R2", "R3", "R4", "R5",
];

const upstreamRank = new Map(UPSTREAM_ORDER.map((id, index) => [id, index]));

export function isScoredQuestionId(value: unknown): value is ScoredQuestionId {
  return typeof value === "string" && (SCORED_QUESTION_IDS as readonly string[]).includes(value);
}

export function isFlagId(value: unknown): value is FlagId {
  return typeof value === "string" && (FLAG_IDS as readonly string[]).includes(value);
}

export function isScoredResponse(value: unknown): value is ScoredResponse {
  return typeof value === "string" && (SCORED_RESPONSES as readonly string[]).includes(value);
}

export function isFlagResponse(value: unknown): value is FlagResponse {
  return typeof value === "string" && (FLAG_RESPONSES as readonly string[]).includes(value);
}

export function isActionId(value: unknown): value is ActionId {
  return typeof value === "string" && (ACTION_IDS as readonly string[]).includes(value);
}

export function isMaturityBand(value: unknown): value is MaturityBand {
  return typeof value === "string" && (MATURITY_BANDS as readonly string[]).includes(value);
}

export function isBarrier(value: unknown): value is Barrier {
  return typeof value === "string" && Object.values(BARRIERS).includes(value as Barrier);
}

export function isBusinessContext(value: unknown): value is BusinessContext {
  if (!value || typeof value !== "object") return false;
  const context = value as Partial<BusinessContext>;
  return (ROLES as readonly unknown[]).includes(context.role)
    && (EMPLOYEE_BANDS as readonly unknown[]).includes(context.employeeBand)
    && (REVENUE_BANDS as readonly unknown[]).includes(context.revenueBand)
    && (OUTCOMES as readonly unknown[]).includes(context.primaryOutcome);
}

export function maturityForScore(score: number): MaturityBand {
  if (score >= 80) return "Ready to Scale";
  if (score >= 65) return "Functional but Fragile";
  if (score >= 40) return "Developing";
  return "Flying Blind";
}

export function selectActions(
  answers: ScoredAnswers,
  weakestPillar: Pillar,
): [ActionId, ActionId, ActionId] {
  const compareQuestions = (a: ScoredQuestion, b: ScoredQuestion) => {
    const severityDifference = RESPONSE_POINTS[answers[a.id]] - RESPONSE_POINTS[answers[b.id]];
    return severityDifference || (upstreamRank.get(a.id) ?? 99) - (upstreamRank.get(b.id) ?? 99);
  };

  const weakest = QUESTION_CATALOG
    .filter((question) => question.pillar === weakestPillar)
    .sort(compareQuestions)
    .slice(0, 2);
  const supporting = QUESTION_CATALOG
    .filter((question) => question.pillar !== weakestPillar)
    .sort(compareQuestions)[0];
  const selected = [...weakest, supporting].sort((a, b) =>
    (upstreamRank.get(a.id) ?? 99) - (upstreamRank.get(b.id) ?? 99),
  );

  return [selected[0].actionId, selected[1].actionId, selected[2].actionId];
}

export function scoreAssessment(
  answers: Partial<Record<ScoredQuestionId, ScoredResponse>>,
  redFlags: Partial<Record<FlagId, FlagResponse>> = {},
): AssessmentResult {
  const missingScoredIds = SCORED_QUESTION_IDS.filter((id) => !isScoredResponse(answers[id]));
  if (missingScoredIds.length > 0) {
    return { complete: false, version: ASSESSMENT_VERSION, missingScoredIds };
  }

  const completeAnswers = answers as ScoredAnswers;
  const pillarScores = Object.fromEntries(PILLARS.map((pillar) => {
    const questions = QUESTION_CATALOG.filter((question) => question.pillar === pillar);
    const points = questions.reduce((total, question) => total + RESPONSE_POINTS[completeAnswers[question.id]], 0);
    return [pillar, (points / 15) * 100];
  })) as Record<Pillar, number>;

  const overallRaw = PILLARS.reduce(
    (total, pillar) => total + pillarScores[pillar] * PILLAR_WEIGHTS[pillar],
    0,
  );
  const rawMaturity = maturityForScore(overallRaw);
  const triggeredFlagIds = FLAG_IDS.filter((id) => redFlags[id] === "yes" || redFlags[id] === "unsure");
  const displayedMaturity = rawMaturity === "Ready to Scale" && triggeredFlagIds.length > 0
    ? "Functional but Fragile"
    : rawMaturity;
  const barrierPillar = PILLARS.reduce((lowest, pillar) =>
    pillarScores[pillar] < pillarScores[lowest] ? pillar : lowest,
  PILLARS[0]);
  const uncertaintyCount = SCORED_QUESTION_IDS.filter((id) => completeAnswers[id] === "unsure").length;
  const actionIds = selectActions(completeAnswers, barrierPillar);
  const ctaRoute: CtaRoute = displayedMaturity === "Ready to Scale"
    ? "optimization"
    : displayedMaturity === "Functional but Fragile"
      ? "guided_diagnostic"
      : displayedMaturity === "Developing"
        ? "implementation"
        : "self_service";

  return {
    complete: true,
    version: ASSESSMENT_VERSION,
    overallRaw,
    overallScore: Math.round(overallRaw),
    pillarScores,
    rawMaturity,
    displayedMaturity,
    barrierPillar,
    barrier: BARRIERS[barrierPillar],
    opportunityKind: rawMaturity === "Ready to Scale" ? "growth_opportunity" : "barrier",
    triggeredFlagIds,
    uncertaintyCount,
    profile: uncertaintyCount > 0
      ? "verification"
      : rawMaturity === "Ready to Scale"
        ? "optimization"
        : "foundation",
    actionIds,
    firstRecommendation: actionIds[0],
    ctaRoute,
  };
}

export function dataAuditCtaPath(route: CtaRoute, locale: Locale | string): string {
  const services = locale === "tr" ? "/hizmetler" : "/services";
  return `${services}?assessment=${route}#inquiry`;
}
