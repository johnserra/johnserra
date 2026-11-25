import { serverChatDependencies, serverChatToolRegistry } from "@/lib/chat/server";
import { createAdminClient } from "@/lib/supabase";
import { createMcpHttpHandlers } from "@/lib/mcp/http-handler";
import { consumeMcpRateLimitWithRpc, type McpRateLimitRpcInvoker } from "@/lib/mcp/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const invokeRateLimitRpc: McpRateLimitRpcInvoker = async (args, signal) => {
  const rpc = createAdminClient().rpc("check_chat_rate_limit", args);
  const result = signal ? await rpc.abortSignal(signal) : await rpc;
  return { data: result.data, error: result.error };
};

const handlers = createMcpHttpHandlers({
  chatDependencies: serverChatDependencies,
  toolRegistry: serverChatToolRegistry,
  consumeRateLimit: (bucket, ip, signal) =>
    consumeMcpRateLimitWithRpc(bucket, ip, invokeRateLimitRpc, { signal }),
  logger: console,
});

export const GET = handlers.GET;
export const POST = handlers.POST;
export const DELETE = handlers.DELETE;
export const OPTIONS = handlers.OPTIONS;
