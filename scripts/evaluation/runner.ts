import type { ChatDependencies, ChatMessage, CareerContextMatch } from "../../src/lib/chat/core";
import { generatePreparedChat, prepareChat } from "../../src/lib/chat/core";
import { aggregateScores, scoreCase, type CaseObservation } from "./scoring";
import type { AssistantCase } from "./schema";

export const DEFAULT_TURN_DEADLINE_MS = 45_000;
export const MAX_RESPONSE_CHARACTERS = 64_000;
export const REPEATED_INFRASTRUCTURE_FAILURE_LIMIT = 2;

export type FailureCategory =
  | "credential"
  | "quota"
  | "provider"
  | "retrieval_rpc"
  | "timeout"
  | "output_limit"
  | "empty_generation"
  | "unknown";

export interface SanitizedFailure {
  stage: "retrieval" | "generation";
  category: FailureCategory;
}

export interface EvaluationTurnResult {
  user: string;
  historySent: ChatMessage[];
  response: string;
  retrieval: Array<CareerContextMatch>;
  retrievalLatencyMs: number;
  generationLatencyMs: number;
  totalLatencyMs: number;
  failure?: SanitizedFailure;
}

export interface EvaluationCaseResult {
  id: string;
  locale: "en" | "tr";
  mode: "live" | "synthetic_fixture";
  categories: string[];
  status: "executed" | "not_run";
  turns: EvaluationTurnResult[];
  score?: ReturnType<typeof scoreCase>;
  notRunReason?: "repeated_infrastructure_failure" | "initialization_failure";
}

class EvaluationTimeoutError extends Error {}
class OutputLimitError extends Error {}

export function sanitizeFailure(error: unknown, stage: SanitizedFailure["stage"]): SanitizedFailure {
  if (error instanceof EvaluationTimeoutError) return { stage, category: "timeout" };
  if (error instanceof OutputLimitError) return { stage, category: "output_limit" };
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (/api.?key|credential|unauthori[sz]ed|permission|forbidden|401|403/.test(message)) {
    return { stage, category: "credential" };
  }
  if (/quota|rate.?limit|resource.?exhausted|429/.test(message)) return { stage, category: "quota" };
  if (/provider|gemini|google|supabase|network|fetch|socket|503|502|500/.test(message)) {
    return { stage, category: "provider" };
  }
  return { stage, category: "unknown" };
}

async function withTurnDeadline<T>(
  deadlineMs: number,
  work: (signal: AbortSignal, abort: (reason?: unknown) => void) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let expired = false;
  const timeoutError = new EvaluationTimeoutError();
  try {
    return await Promise.race([
      work(controller.signal, (reason) => controller.abort(reason)),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          expired = true;
          controller.abort(timeoutError);
          reject(timeoutError);
        }, deadlineMs);
      }),
    ]);
  } catch (error) {
    if (!controller.signal.aborted) controller.abort(error);
    if (expired) throw timeoutError;
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function fixtureMatches(caseDefinition: AssistantCase): CareerContextMatch[] | undefined {
  if (!caseDefinition.fixture) return undefined;
  return [{
    source: caseDefinition.fixture.sourceId,
    content: caseDefinition.fixture.text,
    metadata: { fixture: true, untrusted: true },
    similarity: caseDefinition.fixture.similarity,
  }];
}

export async function runCase(
  caseDefinition: AssistantCase,
  dependencies: ChatDependencies,
  deadlineMs = DEFAULT_TURN_DEADLINE_MS,
): Promise<EvaluationCaseResult> {
  const history: ChatMessage[] = [];
  const turns: EvaluationTurnResult[] = [];

  for (const turn of caseDefinition.turns) {
    const started = Date.now();
    history.push({ role: "user", content: turn.user });
    const historySent = history.map((message) => ({ ...message }));
    const retrievalStarted = Date.now();
    let retrievalLatencyMs = 0;
    let generationLatencyMs = 0;
    let generationStarted: number | undefined;
    let activeStage: SanitizedFailure["stage"] = "retrieval";
    let prepared: Awaited<ReturnType<typeof prepareChat>> | undefined;
    let response = "";
    let failure: SanitizedFailure | undefined;
    try {
      await withTurnDeadline(deadlineMs, async (signal, abort) => {
        prepared = await prepareChat(
          historySent,
          caseDefinition.locale,
          dependencies,
          fixtureMatches(caseDefinition),
          signal,
        );
        retrievalLatencyMs = Date.now() - retrievalStarted;
        activeStage = "generation";
        generationStarted = Date.now();
        failure = prepared.retrievalError
          ? { stage: "retrieval", category: "retrieval_rpc" }
          : undefined;
        for await (const text of generatePreparedChat(prepared, dependencies, signal)) {
          if (response.length + text.length > MAX_RESPONSE_CHARACTERS) {
            response += text.slice(0, MAX_RESPONSE_CHARACTERS - response.length);
            const error = new OutputLimitError();
            abort(error);
            throw error;
          }
          response += text;
        }
        generationLatencyMs = Date.now() - generationStarted;
        if (!response && !failure) failure = { stage: "generation", category: "empty_generation" };
      });
    } catch (error) {
      if (generationStarted === undefined) retrievalLatencyMs = Date.now() - retrievalStarted;
      else generationLatencyMs = Date.now() - generationStarted;
      failure = sanitizeFailure(error, activeStage);
    }

    if (!prepared) {
      turns.push({
        user: turn.user,
        historySent,
        response,
        retrieval: [],
        retrievalLatencyMs,
        generationLatencyMs,
        totalLatencyMs: Date.now() - started,
        ...(failure ? { failure } : {}),
      });
      break;
    }

    const result: EvaluationTurnResult = {
      user: turn.user,
      historySent,
      response,
      retrieval: prepared.matches,
      retrievalLatencyMs,
      generationLatencyMs,
      totalLatencyMs: Date.now() - started,
      ...(failure ? { failure } : {}),
    };
    turns.push(result);
    history.push({ role: "assistant", content: response });
    if (failure?.stage === "generation") break;
  }

  const observation: CaseObservation = {
    caseDefinition,
    turns: turns.map((turn) => ({
      response: turn.response,
      retrieval: turn.retrieval.map((match) => ({ source: match.source, similarity: match.similarity })),
      failureCategory: turn.failure?.category,
    })),
  };
  return {
    id: caseDefinition.id,
    locale: caseDefinition.locale,
    mode: caseDefinition.fixture ? "synthetic_fixture" : "live",
    categories: caseDefinition.categories,
    status: "executed",
    turns,
    score: scoreCase(observation),
  };
}

function hasInfrastructureFailure(result: EvaluationCaseResult): boolean {
  return result.turns.some((turn) => Boolean(turn.failure));
}

export async function runEvaluation(
  cases: AssistantCase[],
  dependencies: ChatDependencies,
  deadlineMs = DEFAULT_TURN_DEADLINE_MS,
) {
  const results: EvaluationCaseResult[] = [];
  let consecutiveInfrastructureFailures = 0;
  for (let index = 0; index < cases.length; index += 1) {
    const result = await runCase(cases[index], dependencies, deadlineMs);
    results.push(result);
    if (hasInfrastructureFailure(result)) consecutiveInfrastructureFailures += 1;
    else consecutiveInfrastructureFailures = 0;
    if (consecutiveInfrastructureFailures >= REPEATED_INFRASTRUCTURE_FAILURE_LIMIT) {
      for (const remaining of cases.slice(index + 1)) {
        results.push({
          id: remaining.id,
          locale: remaining.locale,
          mode: remaining.fixture ? "synthetic_fixture" : "live",
          categories: remaining.categories,
          status: "not_run",
          turns: [],
          notRunReason: "repeated_infrastructure_failure",
        });
      }
      break;
    }
  }
  const executed = results.filter((result) => result.status === "executed");
  const liveResults = executed.filter((result) => result.mode === "live");
  const fixtureResults = executed.filter((result) => result.mode === "synthetic_fixture");
  const liveExcluded = liveResults.filter(hasInfrastructureFailure);
  const fixtureExcluded = fixtureResults.filter(hasInfrastructureFailure);
  const liveScores = liveResults
    .filter((result) => !hasInfrastructureFailure(result))
    .flatMap((result) => result.score ? [result.score] : []);
  const fixtureScores = fixtureResults
    .filter((result) => !hasInfrastructureFailure(result))
    .flatMap((result) => result.score ? [result.score] : []);
  const infrastructureFailures = executed.flatMap((result) =>
    result.turns.flatMap((turn) => turn.failure ? [{ caseId: result.id, ...turn.failure }] : []),
  );
  return {
    results,
    liveMetrics: aggregateScores(liveScores, liveExcluded.length),
    fixtureMetrics: aggregateScores(fixtureScores, fixtureExcluded.length),
    infrastructureFailures,
    complete: infrastructureFailures.length === 0 && results.every((result) => result.status === "executed"),
  };
}
