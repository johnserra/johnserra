import type { Locale } from "@/types";
import { RETRIEVAL_COUNT, RETRIEVAL_THRESHOLD } from "./config";
import type { CareerContextMatch, CareerContextRpcName, ChatMessage, CareerContextRpcInvoker, RetrievalRequest } from "./core";
import { retrieveCareerContext } from "./core";
import type { RewriteAdapter, RewriteDiagnostics } from "./rewrite";
import { rewriteQuery } from "./rewrite";

export { RETRIEVAL_COUNT, RETRIEVAL_THRESHOLD } from "./config";

export const HYBRID_SEMANTIC_LIMIT = 20;
export const HYBRID_LEXICAL_LIMIT = 20;
export const RERANK_MAX_RESULTS = 6;
export const MAX_PER_SOURCE = 2;
export const COVERAGE_BONUS_WEIGHT = 0.01;
export const HYBRID_QUERY_MAX_CHARS = 500;
export const HYBRID_EMBEDDING_DEADLINE_MS = 5_000;
export const HYBRID_RETRIEVAL_DEADLINE_MS = 10_000;
export const HYBRID_MAX_DEADLINE_MS = 60_000;

export interface HybridCandidate {
  id: number;
  source: string;
  content: string;
  metadata: Record<string, unknown>;
  semantic_similarity: number | null;
  lexical_rank: number | null;
  final_rank: number;
  fusion_score: number;
}

export interface HybridRpcRequest {
  query_embedding: number[] | null;
  query_text: string;
  query_locale: Locale;
  match_threshold: number;
  match_count: number;
  filter_document_type: string | null;
  filter_organization: string | null;
  filter_role: string | null;
  filter_visibility: "public";
}

export interface HybridRpcResult {
  data: HybridCandidate[] | null;
  error: unknown;
}

export type HybridRpcInvoker = (
  request: HybridRpcRequest,
  signal?: AbortSignal,
) => Promise<HybridRpcResult>;

export interface HybridRetrievalDependencies {
  embedQuery(query: string, signal?: AbortSignal): Promise<number[]>;
  invokeHybridRpc: HybridRpcInvoker;
  invokeFilteredRpc?: CareerContextRpcInvoker;
  rewriteAdapter?: RewriteAdapter;
}

export interface HybridRetrievalDiagnostics {
  rewrite: RewriteDiagnostics;
  embedding: { durationMs: number; fallback: boolean; error: boolean; reason: string };
  retrieval: {
    stage: "hybrid" | "filtered_fallback" | "semantic_fallback" | "lexical_fallback" | "empty_error";
    durationMs: number;
    candidateCount: number;
    fallback: boolean;
    error: boolean;
    reason: string;
  };
  reranking: {
    durationMs: number;
    inputCount: number;
    outputCount: number;
    coverageAdjusted: number;
  };
  totalDurationMs: number;
}

export interface HybridRetrievalResult {
  matches: CareerContextMatch[];
  diagnostics: HybridRetrievalDiagnostics;
  retrievalError: boolean;
}

export interface HybridRetrievalOptions {
  signal?: AbortSignal;
  rewriteDeadlineMs?: number;
  embeddingDeadlineMs?: number;
  rpcDeadlineMs?: number;
  retrievalDeadlineMs?: number;
}

class HybridDeadlineError extends Error {
  override name = "TimeoutError";

  constructor(readonly stage: "embedding" | "rpc") {
    super(`Hybrid retrieval ${stage} deadline exceeded.`);
  }
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
}

function boundedDeadline(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(HYBRID_MAX_DEADLINE_MS, Math.floor(value)));
}

async function withDeadline<T>(
  stage: "embedding" | "rpc",
  deadlineMs: number,
  work: (signal: AbortSignal) => Promise<T>,
  externalSignal?: AbortSignal,
): Promise<T> {
  externalSignal?.throwIfAborted();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onExternalAbort: (() => void) | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new HybridDeadlineError(stage);
      controller.abort(error);
      reject(error);
    }, deadlineMs);
  });
  const cancellation = externalSignal
    ? new Promise<never>((_resolve, reject) => {
        onExternalAbort = () => {
          const reason = abortReason(externalSignal);
          controller.abort(reason);
          reject(reason);
        };
        externalSignal.addEventListener("abort", onExternalAbort, { once: true });
      })
    : undefined;

  try {
    const pending = work(controller.signal);
    return await Promise.race(cancellation ? [pending, deadline, cancellation] : [pending, deadline]);
  } finally {
    if (timer) clearTimeout(timer);
    if (externalSignal && onExternalAbort) {
      externalSignal.removeEventListener("abort", onExternalAbort);
    }
  }
}

function isMissingHybridRpc(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    String(error.code) === "PGRST202",
  );
}

function isCredentialOrQuotaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? "").toLowerCase();
  return /api.?key|credential|unauthori[sz]ed|permission|forbidden|401|403|quota|rate.?limit|resource.?exhausted|429/.test(message);
}

const QUERY_STOP_WORDS = new Set([
  "a", "about", "an", "and", "are", "at", "be", "did", "do", "does", "for", "from", "how", "in", "is", "it", "of", "on", "or", "the", "to", "was", "were", "what", "when", "where", "which", "who", "why", "with",
  "acaba", "ama", "bir", "bu", "da", "de", "hakkında", "hangi", "için", "ile", "kim", "mı", "mi", "mu", "mü", "nasıl", "ne", "neden", "nedir", "nerede", "niçin", "o", "şu", "ve",
]);

function extractTerms(text: string): string[] {
  return text.slice(0, HYBRID_QUERY_MAX_CHARS)
    .toLowerCase()
    .split(/[\s,.!?;:()[\]{}'"`~@#$%^&*+=|<>/\\]+/)
    .filter((term) => term.length >= 2)
    .filter((term) => !QUERY_STOP_WORDS.has(term))
    .filter((term, index, arr) => arr.indexOf(term) === index)
    .slice(0, 32);
}

export function hasExactToken(text: string, queryTerm: string): boolean {
  const normalizedText = text.toLowerCase();
  const boundedTerm = queryTerm.trim().slice(0, HYBRID_QUERY_MAX_CHARS).toLowerCase();
  if (!boundedTerm) return false;
  const escapedTerm = boundedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapedTerm}(?![\\p{L}\\p{N}])`, "u").test(normalizedText);
}

function computeCoverage(candidate: HybridCandidate, queryTerms: string[]): number {
  if (!queryTerms.length) return 0;
  const haystack = [
    candidate.content,
    typeof candidate.metadata.title === "string" ? candidate.metadata.title : "",
    typeof candidate.metadata.organization === "string" ? candidate.metadata.organization : "",
    typeof candidate.metadata.role === "string" ? candidate.metadata.role : "",
  ].join(" ").toLowerCase();
  const matched = queryTerms.filter((term) => hasExactToken(haystack, term));
  return matched.length / queryTerms.length;
}

export interface RerankedMatch {
  match: CareerContextMatch;
  semanticSimilarity: number | null;
  lexicalRank: number | null;
  fusionScore: number;
  finalRank: number;
  coverageAdjustment: number;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function rerankCandidates(
  candidates: HybridCandidate[],
  queryText: string,
  maxResults: number,
): RerankedMatch[] {
  const queryTerms = extractTerms(queryText);
  const scored = candidates.map((c) => {
    const coverage = computeCoverage(c, queryTerms);
    return {
      candidate: c,
      adjustedScore: c.fusion_score + coverage * COVERAGE_BONUS_WEIGHT,
      coverage,
    };
  });
  scored.sort((a, b) => {
    if (b.adjustedScore !== a.adjustedScore) return b.adjustedScore - a.adjustedScore;
    const semA = a.candidate.semantic_similarity ?? 0;
    const semB = b.candidate.semantic_similarity ?? 0;
    if (semB !== semA) return semB - semA;
    if (a.candidate.id !== b.candidate.id) return a.candidate.id - b.candidate.id;
    const sourceOrder = compareText(a.candidate.source, b.candidate.source);
    if (sourceOrder !== 0) return sourceOrder;
    return compareText(a.candidate.content, b.candidate.content);
  });
  const unique = scored.filter((item, index, all) =>
    all.findIndex((other) => other.candidate.id === item.candidate.id) === index);
  const result: typeof scored = [];
  const sourceCounts = new Map<string, number>();
  const resultLimit = Number.isFinite(maxResults)
    ? Math.max(0, Math.min(RERANK_MAX_RESULTS, Math.floor(maxResults)))
    : RERANK_MAX_RESULTS;
  for (const item of unique) {
    if (result.length >= resultLimit) break;
    const sourceKey = item.candidate.source;
    const count = sourceCounts.get(sourceKey) ?? 0;
    if (count >= MAX_PER_SOURCE) continue;
    sourceCounts.set(sourceKey, count + 1);
    result.push(item);
  }
  return result.map((item, index) => ({
    match: {
      source: item.candidate.source,
      content: item.candidate.content,
      metadata: item.candidate.metadata,
      similarity: item.candidate.semantic_similarity ?? 0,
    },
    semanticSimilarity: item.candidate.semantic_similarity,
    lexicalRank: item.candidate.lexical_rank,
    fusionScore: item.adjustedScore,
    finalRank: index + 1,
    coverageAdjustment: item.coverage * COVERAGE_BONUS_WEIGHT,
  }));
}

function buildHybridRequest(
  queryEmbedding: number[] | null,
  queryText: string,
  locale: Locale,
  filters: { documentType: string | null; organization: string | null; role: string | null },
): HybridRpcRequest {
  return {
    query_embedding: queryEmbedding,
    query_text: queryText,
    query_locale: locale,
    match_threshold: RETRIEVAL_THRESHOLD,
    match_count: RETRIEVAL_COUNT,
    filter_document_type: filters.documentType,
    filter_organization: filters.organization,
    filter_role: filters.role,
    filter_visibility: "public" as const,
  };
}

function buildFilteredRequest(
  queryEmbedding: number[],
  queryText: string,
  locale: Locale,
  filters: { documentType: string | null; organization: string | null; role: string | null },
): RetrievalRequest {
  return {
    query_embedding: queryEmbedding,
    query_locale: locale,
    match_threshold: RETRIEVAL_THRESHOLD,
    match_count: RETRIEVAL_COUNT,
    filter_document_type: filters.documentType,
    filter_organization: filters.organization,
    filter_role: filters.role,
    filter_visibility: "public" as const,
  };
}

export async function performHybridRetrieval(
  messages: ChatMessage[],
  locale: Locale,
  dependencies: HybridRetrievalDependencies,
  filters: { documentType: string | null; organization: string | null; role: string | null } = {
    documentType: null, organization: null, role: null,
  },
  options: HybridRetrievalOptions = {},
): Promise<HybridRetrievalResult> {
  const totalStart = Date.now();
  options.signal?.throwIfAborted();

  const rewriteResult = await rewriteQuery(messages, locale, dependencies.rewriteAdapter, {
    deadlineMs: options.rewriteDeadlineMs,
    signal: options.signal,
  });
  const effectiveQuery = rewriteResult.query.slice(0, HYBRID_QUERY_MAX_CHARS);
  const embeddingDeadlineMs = boundedDeadline(options.embeddingDeadlineMs, HYBRID_EMBEDDING_DEADLINE_MS);
  const rpcDeadlineMs = boundedDeadline(
    options.rpcDeadlineMs ?? options.retrievalDeadlineMs,
    HYBRID_RETRIEVAL_DEADLINE_MS,
  );

  let queryEmbedding: number[] | null = null;
  let embeddingDiagnostics: HybridRetrievalDiagnostics["embedding"] = {
    durationMs: 0, fallback: false, error: false, reason: "success",
  };
  const embeddingStart = Date.now();
  try {
    queryEmbedding = await withDeadline(
      "embedding",
      embeddingDeadlineMs,
      (signal) => dependencies.embedQuery(effectiveQuery, signal),
      options.signal,
    );
  } catch (error) {
    if (isCredentialOrQuotaError(error)) throw error;
    if (options.signal?.aborted) throw abortReason(options.signal);
    embeddingDiagnostics = {
      durationMs: Date.now() - embeddingStart,
      fallback: true,
      error: true,
      reason: error instanceof HybridDeadlineError ? "embedding_timeout" : "embedding_error",
    };
  }

  const retrievalStart = Date.now();
  let retrievalDiagnostics: HybridRetrievalDiagnostics["retrieval"] = {
    stage: "hybrid", durationMs: 0, candidateCount: 0, fallback: false, error: false, reason: "success",
  };
  let candidates: HybridCandidate[] = [];

  const hybridRequest = buildHybridRequest(queryEmbedding, effectiveQuery, locale, filters);
  try {
    const hybridResult = await withDeadline(
      "rpc",
      rpcDeadlineMs,
      (signal) => dependencies.invokeHybridRpc(hybridRequest, signal),
      options.signal,
    );
    if (hybridResult.error) throw hybridResult.error;
    candidates = hybridResult.data ?? [];
    retrievalDiagnostics = {
      stage: queryEmbedding ? "hybrid" : "lexical_fallback",
      durationMs: Date.now() - retrievalStart,
      candidateCount: candidates.length,
      fallback: !queryEmbedding,
      error: false,
      reason: !queryEmbedding ? "embedding_failed_lexical_only" : "success",
    };
  } catch (error) {
    if (options.signal?.aborted) throw abortReason(options.signal);
    if (isMissingHybridRpc(error) && dependencies.invokeFilteredRpc && queryEmbedding) {
      const filteredRequest = buildFilteredRequest(queryEmbedding, effectiveQuery, locale, filters);
      let fallbackRpcName: CareerContextRpcName | null = null;
      try {
        const filteredResult = await withDeadline(
          "rpc",
          Math.max(1, rpcDeadlineMs - (Date.now() - retrievalStart)),
          (signal) => retrieveCareerContext(filteredRequest, {
            allowLegacyFallback: true,
            invokeRpc: dependencies.invokeFilteredRpc!,
            onRpcCall: (name) => { fallbackRpcName = name; },
          }, signal),
          options.signal,
        );
        if (filteredResult.error) throw filteredResult.error;
        const filteredMatches = filteredResult.data ?? [];
        candidates = filteredMatches.map((m, index) => ({
          id: typeof m.metadata.id === "number" ? m.metadata.id : index,
          source: m.source,
          content: m.content,
          metadata: m.metadata,
          semantic_similarity: m.similarity,
          lexical_rank: null,
          final_rank: index + 1,
          fusion_score: m.similarity,
        }));
        const usedLegacyRpc = fallbackRpcName === "match_career_context";
        retrievalDiagnostics = {
          stage: usedLegacyRpc ? "semantic_fallback" : "filtered_fallback",
          durationMs: Date.now() - retrievalStart,
          candidateCount: candidates.length,
          fallback: true,
          error: false,
          reason: usedLegacyRpc
            ? "hybrid_rpc_absent_legacy_semantic_fallback"
            : "hybrid_rpc_absent_filtered_fallback",
        };
      } catch (fallbackError) {
        if (options.signal?.aborted) throw abortReason(options.signal);
        if (isCredentialOrQuotaError(fallbackError)) throw fallbackError;
        retrievalDiagnostics = {
          stage: "empty_error",
          durationMs: Date.now() - retrievalStart,
          candidateCount: 0,
          fallback: true,
          error: true,
          reason: fallbackError instanceof HybridDeadlineError
            ? "filtered_fallback_timeout"
            : "filtered_fallback_error",
        };
      }
    } else if (isCredentialOrQuotaError(error)) {
      throw error;
    } else {
      retrievalDiagnostics = {
        stage: "empty_error",
        durationMs: Date.now() - retrievalStart,
        candidateCount: 0,
        fallback: true,
        error: true,
        reason: error instanceof HybridDeadlineError ? "hybrid_rpc_timeout" : "hybrid_rpc_error",
      };
    }
  }

  const rerankStart = Date.now();
  const reranked = rerankCandidates(candidates, effectiveQuery, RERANK_MAX_RESULTS);
  const rerankingDiagnostics = {
    durationMs: Date.now() - rerankStart,
    inputCount: candidates.length,
    outputCount: reranked.length,
    coverageAdjusted: reranked.filter((r) => r.coverageAdjustment > 0).length,
  };

  const matches = reranked.map((r) => r.match);
  return {
    matches,
    diagnostics: {
      rewrite: rewriteResult.diagnostics,
      embedding: embeddingDiagnostics,
      retrieval: retrievalDiagnostics,
      reranking: rerankingDiagnostics,
      totalDurationMs: Date.now() - totalStart,
    },
    retrievalError: retrievalDiagnostics.error,
  };
}
