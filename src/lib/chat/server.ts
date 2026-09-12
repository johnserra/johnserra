import "server-only";

import { GoogleGenAI } from "@google/genai";
import { embedQuery } from "@/lib/knowledge/embeddings";
import { createAdminClient } from "@/lib/supabase";
import {
  retrieveCareerContext,
  type CareerContextRpcInvoker,
  type ChatDependencies,
  type GenerationRequest,
} from "./core";
import { createGeminiRewriteAdapter } from "./rewrite";
import type { HybridRpcRequest, HybridRpcResult } from "./retrieval";
import {
  CHAT_RATE_LIMIT_IP_LIMIT,
  CHAT_RATE_LIMIT_SESSION_LIMIT,
  CHAT_RATE_LIMIT_WINDOW_SECONDS,
} from "./limits";
import { ChatRateLimitServiceError, hashChatIdentities, hasUsableRateLimitSecret } from "./rate-limit";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const matchCareerContextRpc: CareerContextRpcInvoker = async (name, args, signal) => {
  const supabase = createAdminClient();
  const rpc = supabase.rpc(name, args);
  const result = signal ? await rpc.abortSignal(signal) : await rpc;
  return result as Awaited<ReturnType<CareerContextRpcInvoker>>;
};

export interface ChatRateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export async function consumeChatRateLimit(sessionId: string, ip: string, signal?: AbortSignal): Promise<ChatRateLimitResult> {
  const secret = process.env.CHAT_RATE_LIMIT_SECRET;
  if (!hasUsableRateLimitSecret(secret)) throw new ChatRateLimitServiceError();

  const hashes = hashChatIdentities(secret!, sessionId, ip);
  const rpc = createAdminClient().rpc("check_chat_rate_limit", {
    p_session_hash: hashes.sessionHash,
    p_ip_hash: hashes.ipHash,
    p_window_seconds: CHAT_RATE_LIMIT_WINDOW_SECONDS,
    p_session_limit: CHAT_RATE_LIMIT_SESSION_LIMIT,
    p_ip_limit: CHAT_RATE_LIMIT_IP_LIMIT,
  });
  const { data, error } = signal ? await rpc.abortSignal(signal) : await rpc;
  if (error) throw new ChatRateLimitServiceError();

  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!row || typeof row !== "object" || typeof row.allowed !== "boolean") {
    throw new ChatRateLimitServiceError();
  }
  const retryAfter = Number(row.retry_after_seconds);
  if (!Number.isFinite(retryAfter) || retryAfter < 0) throw new ChatRateLimitServiceError();
  return { allowed: row.allowed, retryAfterSeconds: Math.min(3_600, Math.ceil(retryAfter)) };
}

export const serverChatDependencies: ChatDependencies = {
  embedQuery,
  async matchCareerContext(request, signal) {
    return retrieveCareerContext(request, {
      allowLegacyFallback: true,
      invokeRpc: matchCareerContextRpc,
    }, signal);
  },
  matchCareerContextRpc,
  async matchCareerContextHybrid(request: HybridRpcRequest, signal?: AbortSignal): Promise<HybridRpcResult> {
    const supabase = createAdminClient();
    const rpc = supabase.rpc("match_career_context_hybrid", request);
    const result = signal ? await rpc.abortSignal(signal) : await rpc;
    return result as HybridRpcResult;
  },
  rewriteAdapter: createGeminiRewriteAdapter(async (request) => {
    const response = await ai.models.generateContent(request);
    return { text: response.text };
  }),
  async generateContentStream(request: GenerationRequest, signal) {
    if (!signal) return ai.models.generateContentStream(request);
    return ai.models.generateContentStream({
      ...request,
      config: { ...request.config, abortSignal: signal },
    });
  },
};
