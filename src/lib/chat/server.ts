import "server-only";

import { GoogleGenAI } from "@google/genai";
import { embedQuery } from "@/lib/knowledge/embeddings";
import { createAdminClient } from "@/lib/supabase";
import type { ChatDependencies, GenerationRequest } from "./core";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export const serverChatDependencies: ChatDependencies = {
  embedQuery,
  async matchCareerContext(request, signal) {
    const supabase = createAdminClient();
    const rpc = supabase.rpc("match_career_context", request);
    const { data, error } = signal ? await rpc.abortSignal(signal) : await rpc;
    return { data, error } as Awaited<ReturnType<ChatDependencies["matchCareerContext"]>>;
  },
  async generateContentStream(request: GenerationRequest, signal) {
    if (!signal) return ai.models.generateContentStream(request);
    return ai.models.generateContentStream({
      ...request,
      config: { ...request.config, abortSignal: signal },
    });
  },
};
