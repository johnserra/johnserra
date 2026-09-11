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

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const matchCareerContextRpc: CareerContextRpcInvoker = async (name, args, signal) => {
  const supabase = createAdminClient();
  const rpc = supabase.rpc(name, args);
  const result = signal ? await rpc.abortSignal(signal) : await rpc;
  return result as Awaited<ReturnType<CareerContextRpcInvoker>>;
};

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
