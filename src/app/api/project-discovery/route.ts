import { createProjectDiscoveryHandler } from "@/lib/chat/project-discovery-handler";
import { consumeChatRateLimit, serverChatToolRegistry } from "@/lib/chat/server";

export const runtime = "nodejs";
export const maxDuration = 15;

export const POST = createProjectDiscoveryHandler({
  consumeRateLimit: consumeChatRateLimit,
  searchKnowledge(args, signal) {
    return serverChatToolRegistry.handlers.search_knowledge(args, signal);
  },
});
