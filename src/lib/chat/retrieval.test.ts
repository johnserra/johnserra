import assert from "node:assert/strict";
import test from "node:test";
import { prepareChat, type CareerContextRpcInvoker, type ChatMessage } from "./core";
import {
  hasExactToken,
  performHybridRetrieval,
  rerankCandidates,
  RERANK_MAX_RESULTS,
  type HybridCandidate,
  type HybridRpcRequest,
} from "./retrieval";

function candidate(
  id: number,
  source: string,
  content = `chunk ${id}`,
  fusionScore = 0.1,
): HybridCandidate {
  return {
    id,
    source,
    content,
    metadata: {},
    semantic_similarity: 0.8,
    lexical_rank: id,
    final_rank: id,
    fusion_score: fusionScore,
  };
}

const singleTurn: ChatMessage[] = [{ role: "user", content: "What did John build?" }];

test("embedding deadline settles when the adapter ignores AbortSignal and continues lexically", async () => {
  let rpcRequest: HybridRpcRequest | undefined;
  const started = Date.now();
  const result = await performHybridRetrieval(singleTurn, "en", {
    embedQuery: () => new Promise<number[]>(() => {}),
    invokeHybridRpc: async (request) => {
      rpcRequest = request;
      return { data: [], error: null };
    },
  }, undefined, { embeddingDeadlineMs: 5, rpcDeadlineMs: 50 });

  assert.ok(Date.now() - started < 250, "ignored embedding abort must not hang retrieval");
  assert.equal(rpcRequest?.query_embedding, null);
  assert.deepEqual(result.diagnostics.embedding, {
    durationMs: result.diagnostics.embedding.durationMs,
    fallback: true,
    error: true,
    reason: "embedding_timeout",
  });
  assert.equal(result.diagnostics.retrieval.stage, "lexical_fallback");
  assert.equal(result.diagnostics.retrieval.fallback, true);
  assert.equal(result.diagnostics.retrieval.error, false);
  assert.equal(result.retrievalError, false);
});

test("RPC deadline settles when the adapter ignores AbortSignal", async () => {
  const started = Date.now();
  const result = await performHybridRetrieval(singleTurn, "en", {
    embedQuery: async () => [1],
    invokeHybridRpc: () => new Promise(() => {}),
  }, undefined, { embeddingDeadlineMs: 50, rpcDeadlineMs: 5 });

  assert.ok(Date.now() - started < 250, "ignored RPC abort must not hang retrieval");
  assert.equal(result.diagnostics.retrieval.stage, "empty_error");
  assert.equal(result.diagnostics.retrieval.fallback, true);
  assert.equal(result.diagnostics.retrieval.error, true);
  assert.equal(result.diagnostics.retrieval.reason, "hybrid_rpc_timeout");
  assert.equal(result.retrievalError, true);
});

test("fallback RPC deadline also settles when the adapter ignores AbortSignal", async () => {
  const started = Date.now();
  const result = await performHybridRetrieval(singleTurn, "en", {
    embedQuery: async () => [1],
    invokeHybridRpc: async () => ({ data: null, error: { code: "PGRST202" } }),
    invokeFilteredRpc: () => new Promise(() => {}),
  }, undefined, { rpcDeadlineMs: 5 });

  assert.ok(Date.now() - started < 250, "ignored fallback abort must not hang retrieval");
  assert.equal(result.diagnostics.retrieval.stage, "empty_error");
  assert.equal(result.diagnostics.retrieval.reason, "filtered_fallback_timeout");
  assert.equal(result.diagnostics.retrieval.error, true);
});

test("external cancellation is propagated during embedding and RPC work", async (t) => {
  for (const stage of ["embedding", "rpc"] as const) {
    await t.test(stage, async () => {
      const controller = new AbortController();
      const reason = new Error(`${stage} cancelled by caller`);
      let reachedRpc = false;
      const pending = performHybridRetrieval(singleTurn, "en", {
        embedQuery: stage === "embedding"
          ? () => new Promise<number[]>(() => {})
          : async () => [1],
        invokeHybridRpc: () => {
          reachedRpc = true;
          return new Promise(() => {});
        },
      }, undefined, {
        signal: controller.signal,
        embeddingDeadlineMs: 1_000,
        rpcDeadlineMs: 1_000,
      });
      setTimeout(() => controller.abort(reason), 5);
      await assert.rejects(pending, (error) => error === reason);
      assert.equal(reachedRpc, stage === "rpc");
    });
  }
});

test("reranking deterministically deduplicates and never refills past the per-source cap", () => {
  const candidates = [
    candidate(1, "source/a", "lower duplicate", 0.1),
    candidate(1, "source/a", "winning duplicate", 0.9),
    candidate(2, "source/a", "a2", 0.8),
    candidate(3, "source/a", "a3", 0.7),
    candidate(4, "source/a", "a4", 0.6),
    candidate(5, "source/b", "b1", 0.5),
    candidate(6, "source/b", "b2", 0.4),
    candidate(7, "source/c", "c1", 0.3),
    candidate(8, "source/c", "c2", 0.2),
    candidate(9, "source/d", "d1", 0.1),
  ];

  const forward = rerankCandidates(candidates, "unmatched", 100);
  const reverse = rerankCandidates([...candidates].reverse(), "unmatched", 100);
  assert.deepEqual(forward.map((row) => row.match.content), reverse.map((row) => row.match.content));
  assert.ok(forward.length <= RERANK_MAX_RESULTS);
  assert.equal(forward.filter((row) => row.match.source === "source/a").length, 2);
  assert.ok(forward.some((row) => row.match.content === "winning duplicate"));
  assert.ok(!forward.some((row) => row.match.content === "lower duplicate"));
  for (const source of new Set(forward.map((row) => row.match.source))) {
    assert.ok(forward.filter((row) => row.match.source === source).length <= 2);
  }
});

test("coverage requires exact token boundaries and matches punctuation-bearing technologies", () => {
  assert.equal(hasExactToken("internet", "net"), false);
  assert.equal(hasExactToken("Built with Next.js and React", "Next.js"), true);
  assert.equal(hasExactToken(`${"x".repeat(600)} Next.js`, "Next.js"), true);

  const reranked = rerankCandidates([
    candidate(1, "source/a", "The internet platform", 0.9),
    candidate(2, "source/b", "Built with Next.js and React", 0.1),
  ], "net Next.js", 2);
  assert.equal(reranked.find((row) => row.match.source === "source/a")?.coverageAdjustment, 0);
  assert.ok((reranked.find((row) => row.match.source === "source/b")?.coverageAdjustment ?? 0) > 0);
});

test("diagnostics report actual candidate, output, and coverage-adjustment counts", async () => {
  const result = await performHybridRetrieval(
    [{ role: "user", content: "CareerTalkLab technology" }],
    "en",
    {
      embedQuery: async () => [1],
      invokeHybridRpc: async () => ({
        data: [
          candidate(1, "source/a", "CareerTalkLab used React"),
          candidate(2, "source/a", "unrelated chunk"),
          candidate(2, "source/a", "duplicate unrelated chunk", 0.01),
          candidate(3, "source/a", "third chunk excluded by source cap"),
        ],
        error: null,
      }),
    },
  );

  assert.equal(result.diagnostics.retrieval.candidateCount, 4);
  assert.equal(result.diagnostics.reranking.inputCount, 4);
  assert.equal(result.diagnostics.reranking.outputCount, 2);
  assert.equal(result.diagnostics.reranking.coverageAdjusted, 1);
});

test("legacy semantic fallback is identified separately from hybrid fusion", async () => {
  const calls: string[] = [];
  const fallbackInvoker: CareerContextRpcInvoker = async (name) => {
    calls.push(name);
    if (name === "match_career_context_filtered") {
      return { data: null, error: { code: "PGRST202" } };
    }
    return {
      data: [{ source: "legacy/source", content: "legacy semantic result", metadata: {}, similarity: 0.9 }],
      error: null,
    };
  };
  const result = await performHybridRetrieval(singleTurn, "en", {
    embedQuery: async () => [1],
    invokeHybridRpc: async () => ({ data: null, error: { code: "PGRST202" } }),
    invokeFilteredRpc: fallbackInvoker,
  });

  assert.deepEqual(calls, ["match_career_context_filtered", "match_career_context"]);
  assert.equal(result.diagnostics.retrieval.stage, "semantic_fallback");
  assert.equal(result.diagnostics.retrieval.fallback, true);
  assert.equal(result.diagnostics.retrieval.error, false);
  assert.equal(result.diagnostics.retrieval.candidateCount, 1);
  assert.match(result.diagnostics.retrieval.reason, /legacy_semantic/);
});

test("prepareChat preserves exact fallback RPC names and reports the legacy semantic label", async () => {
  const calls: string[] = [];
  let compatibilityWrapperCalls = 0;
  const prepared = await prepareChat(singleTurn, "en", {
    embedQuery: async () => [1],
    matchCareerContext: async () => {
      compatibilityWrapperCalls += 1;
      return { data: [], error: null };
    },
    matchCareerContextRpc: async (name) => {
      calls.push(name);
      if (name === "match_career_context_filtered") {
        return { data: null, error: { code: "PGRST202" } };
      }
      return {
        data: [{ source: "legacy/source", content: "legacy semantic result", metadata: {}, similarity: 0.9 }],
        error: null,
      };
    },
    matchCareerContextHybrid: async () => ({ data: null, error: { code: "PGRST202" } }),
    generateContentStream: async () => (async function* () {})(),
  });

  assert.deepEqual(calls, ["match_career_context_filtered", "match_career_context"]);
  assert.equal(compatibilityWrapperCalls, 0);
  assert.equal(prepared.diagnostics?.retrieval.stage, "semantic_fallback");
  assert.equal(prepared.diagnostics?.retrieval.reason, "hybrid_rpc_absent_legacy_semantic_fallback");
  assert.equal(prepared.matches[0]?.source, "legacy/source");
});

test("rewritten text is retrieval-only while generation keeps original messages", async () => {
  const original = "What technology did he use for it?";
  const rewritten = "What technology was used for CareerTalkLab?";
  const messages: ChatMessage[] = [
    { role: "user", content: "Tell me about CareerTalkLab." },
    { role: "assistant", content: "CareerTalkLab is a platform." },
    { role: "user", content: original },
  ];
  let embeddedQuery = "";
  let rpcQuery = "";
  const prepared = await prepareChat(messages, "en", {
    embedQuery: async (query) => { embeddedQuery = query; return [1]; },
    matchCareerContext: async () => ({ data: [], error: null }),
    matchCareerContextHybrid: async (request) => {
      rpcQuery = request.query_text;
      return { data: [], error: null };
    },
    rewriteAdapter: { rewrite: async () => rewritten },
    generateContentStream: async () => (async function* () {})(),
  });

  assert.equal(embeddedQuery, rewritten);
  assert.equal(rpcQuery, embeddedQuery);
  assert.equal(prepared.generationRequest.contents.at(-1)?.parts[0].text, original);
  assert.equal(prepared.diagnostics?.rewrite.rewrittenQuery, rewritten);
});

test("retrieval adapter inputs are bounded independently of the original generation message", async () => {
  const original = `${"x".repeat(700)} CareerTalkLab`;
  let embeddedQuery = "";
  let rpcQuery = "";
  const prepared = await prepareChat([{ role: "user", content: original }], "en", {
    embedQuery: async (query) => { embeddedQuery = query; return [1]; },
    matchCareerContext: async () => ({ data: [], error: null }),
    matchCareerContextHybrid: async (request) => {
      rpcQuery = request.query_text;
      return { data: [], error: null };
    },
    generateContentStream: async () => (async function* () {})(),
  });

  assert.equal(embeddedQuery.length, 500);
  assert.equal(rpcQuery.length, 500);
  assert.equal(prepared.generationRequest.contents[0].parts[0].text, original);
});
