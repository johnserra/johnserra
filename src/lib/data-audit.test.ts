import assert from "node:assert/strict";
import test from "node:test";
import {
  FLAG_IDS,
  PILLARS,
  QUESTION_CATALOG,
  SCORED_QUESTION_IDS,
  type FlagResponse,
  type RedFlagAnswers,
  type ScoredAnswers,
  type ScoredResponse,
  scoreAssessment,
} from "./data-audit";
import { dataAuditPath } from "./routes";

function answersWith(response: ScoredResponse): ScoredAnswers {
  return Object.fromEntries(SCORED_QUESTION_IDS.map((id) => [id, response])) as ScoredAnswers;
}

function flagsWith(response: FlagResponse = "no"): RedFlagAnswers {
  return Object.fromEntries(FLAG_IDS.map((id) => [id, response])) as RedFlagAnswers;
}

test("data audit paths use the canonical locale-specific slugs", () => {
  assert.equal(dataAuditPath("en"), "/data-audit");
  assert.equal(dataAuditPath("tr"), "/veri-denetimi");
});

test("all yes scores 100 and Ready to Scale", () => {
  const result = scoreAssessment(answersWith("yes"), flagsWith());
  assert.equal(result.complete, true);
  if (!result.complete) return;
  assert.equal(result.overallScore, 100);
  assert.equal(result.rawMaturity, "Ready to Scale");
  assert.equal(result.displayedMaturity, "Ready to Scale");
});

test("all partial scores about 66.7 and Functional but Fragile", () => {
  const result = scoreAssessment(answersWith("partial"), flagsWith());
  assert.equal(result.complete, true);
  if (!result.complete) return;
  assert.ok(Math.abs(result.overallRaw - 66.6667) < 0.01);
  assert.equal(result.displayedMaturity, "Functional but Fragile");
});

test("data all no with other pillars yes scores 70 and identifies Data-Rich but Untrusted", () => {
  const answers = answersWith("yes");
  for (const question of QUESTION_CATALOG.filter(({ pillar }) => pillar === "data")) answers[question.id] = "no";
  const result = scoreAssessment(answers, flagsWith());
  assert.equal(result.complete, true);
  if (!result.complete) return;
  assert.equal(result.overallScore, 70);
  assert.equal(result.barrier, "Data-Rich but Untrusted");
});

test("a red flag downgrades display while retaining raw Ready to Scale", () => {
  const flags = flagsWith();
  flags.F2 = "yes";
  const result = scoreAssessment(answersWith("yes"), flags);
  assert.equal(result.complete, true);
  if (!result.complete) return;
  assert.equal(result.rawMaturity, "Ready to Scale");
  assert.equal(result.displayedMaturity, "Functional but Fragile");
  assert.deepEqual(result.triggeredFlagIds, ["F2"]);
});

test("all no scores zero and Flying Blind", () => {
  const result = scoreAssessment(answersWith("no"), flagsWith());
  assert.equal(result.complete, true);
  if (!result.complete) return;
  assert.equal(result.overallScore, 0);
  assert.equal(result.displayedMaturity, "Flying Blind");
});

test("unsure data answers count uncertainty and select the verification profile", () => {
  const answers = answersWith("yes");
  for (const id of ["D1", "D2", "D3", "D4", "D5"] as const) answers[id] = "unsure";
  const result = scoreAssessment(answers, flagsWith());
  assert.equal(result.complete, true);
  if (!result.complete) return;
  assert.equal(result.uncertaintyCount, 5);
  assert.equal(result.profile, "verification");
});

test("incomplete answers return an explicit incomplete result without a score", () => {
  const result = scoreAssessment({ M1: "yes" }, flagsWith());
  assert.equal(result.complete, false);
  assert.ok(!("overallScore" in result));
  if (result.complete) return;
  assert.equal(result.missingScoredIds.length, 19);
});

test("reporting gaps recommend process improvements rather than tracking software", () => {
  const answers = answersWith("yes");
  for (const question of QUESTION_CATALOG.filter(({ pillar }) => pillar === "reporting")) answers[question.id] = "no";
  const result = scoreAssessment(answers, flagsWith());
  assert.equal(result.complete, true);
  if (!result.complete) return;
  assert.equal(result.barrierPillar, "reporting");
  assert.equal(result.actionIds.filter((id) => id.startsWith("action_R")).length, 2);
  assert.ok(result.actionIds.every((id) => !id.toLowerCase().includes("tracking")));
});

test("selected actions retain prerequisite order", () => {
  const definitionFirst = answersWith("yes");
  definitionFirst.M2 = "no";
  definitionFirst.D4 = "no";
  definitionFirst.D5 = "no";
  const definitionResult = scoreAssessment(definitionFirst, flagsWith());
  assert.equal(definitionResult.complete, true);
  if (definitionResult.complete) {
    assert.ok(definitionResult.actionIds.indexOf("action_M2") < definitionResult.actionIds.indexOf("action_D5"));
  }

  const dataBeforeDashboard = answersWith("yes");
  dataBeforeDashboard.D5 = "no";
  dataBeforeDashboard.R1 = "no";
  dataBeforeDashboard.R2 = "no";
  const reportingResult = scoreAssessment(dataBeforeDashboard, flagsWith());
  assert.equal(reportingResult.complete, true);
  if (reportingResult.complete) {
    assert.ok(reportingResult.actionIds.indexOf("action_D5") < reportingResult.actionIds.indexOf("action_R1"));
  }
});

test("every completed result has exactly three unique actions", () => {
  for (const weakPillar of PILLARS) {
    const answers = answersWith("yes");
    for (const question of QUESTION_CATALOG.filter(({ pillar }) => pillar === weakPillar)) answers[question.id] = "no";
    const result = scoreAssessment(answers, flagsWith());
    assert.equal(result.complete, true);
    if (!result.complete) continue;
    assert.equal(result.actionIds.length, 3);
    assert.equal(new Set(result.actionIds).size, 3);
  }
});
