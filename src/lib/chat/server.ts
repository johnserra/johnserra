import "server-only";

import { GoogleGenAI } from "@google/genai";
import { embedQuery } from "@/lib/knowledge/embeddings";
import { createAdminClient } from "@/lib/supabase";
import {
  retrieveCareerContext,
  type ChatDependencies,
  type GenerationRequest,
} from "./core";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export const serverChatDependencies: ChatDependencies = {
  embedQuery,
  async matchCareerContext(request, signal) {
    const supabase = createAdminClient();
    return retrieveCareerContext(request, {
      allowLegacyFallback: true,
      async invokeRpc(name, args, rpcSignal) {
        const rpc = supabase.rpc(name, args);
        const result = rpcSignal ? await rpc.abortSignal(rpcSignal) : await rpc;
        return result as Awaited<ReturnType<ChatDependencies["matchCareerContext"]>>;
      },
    }, signal);
  },
  async generateContentStream(request: GenerationRequest, signal) {
    if (!signal) return ai.models.generateContentStream(request);
    return ai.models.generateContentStream({
      ...request,
      config: { ...request.config, abortSignal: signal },
    });
  },
};
