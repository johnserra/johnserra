import {
  ChatRateLimitServiceError,
  extractTrustedVercelIp,
  hashRateLimitIdentity,
  hasUsableRateLimitSecret,
} from "@/lib/chat/rate-limit";
import {
  MCP_RATE_LIMIT_ASK_LIMIT,
  MCP_RATE_LIMIT_IP_LIMIT,
  MCP_RATE_LIMIT_WINDOW_SECONDS,
} from "./limits";

export type McpRateLimitBucket = "ask" | "protocol";

export interface McpRateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export type McpRateLimitRpcInvoker = (
  args: {
    p_session_hash: string;
    p_ip_hash: string;
    p_window_seconds: number;
    p_session_limit: number;
    p_ip_limit: number;
  },
  signal?: AbortSignal,
) => Promise<{ data: unknown; error: unknown }>;

/**
 * Namespace MCP HMAC identities so they never collide with browser `/api/chat`
 * buckets inside the shared `public.chat_rate_limits` table.
 */
export function hashMcpIdentities(
  secret: string,
  bucket: McpRateLimitBucket,
  ip: string,
): { bucketHash: string; ipHash: string } {
  return {
    bucketHash: hashRateLimitIdentity(secret, `mcp:bucket:${bucket}:${ip}`),
    ipHash: hashRateLimitIdentity(secret, `mcp:ip:${ip}`),
  };
}

/**
 * Trust only Vercel's platform-populated IP header in production/Vercel.
 * Allows a local loopback identity only during local non-Vercel development.
 */
export function extractMcpClientIp(
  headers: Headers,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const vercelIp = extractTrustedVercelIp(headers);
  if (vercelIp) return vercelIp;
  if (env.NODE_ENV !== "production" && env.VERCEL !== "1") {
    return "127.0.0.1";
  }
  return null;
}

export async function consumeMcpRateLimitWithRpc(
  bucket: McpRateLimitBucket,
  ip: string,
  invokeRpc: McpRateLimitRpcInvoker,
  options?: { secret?: string; signal?: AbortSignal },
): Promise<McpRateLimitResult> {
  const secret = options?.secret ?? process.env.CHAT_RATE_LIMIT_SECRET;
  if (!hasUsableRateLimitSecret(secret)) throw new ChatRateLimitServiceError();

  const hashes = hashMcpIdentities(secret!, bucket, ip);
  const bucketLimit = bucket === "ask" ? MCP_RATE_LIMIT_ASK_LIMIT : MCP_RATE_LIMIT_IP_LIMIT;
  const { data, error } = await invokeRpc(
    {
      p_session_hash: hashes.bucketHash,
      p_ip_hash: hashes.ipHash,
      p_window_seconds: MCP_RATE_LIMIT_WINDOW_SECONDS,
      p_session_limit: bucketLimit,
      p_ip_limit: MCP_RATE_LIMIT_IP_LIMIT,
    },
    options?.signal,
  );
  if (error) throw new ChatRateLimitServiceError();

  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!row || typeof row !== "object" || typeof row.allowed !== "boolean") {
    throw new ChatRateLimitServiceError();
  }
  const retryAfter = Number(row.retry_after_seconds);
  if (!Number.isFinite(retryAfter) || retryAfter < 0) throw new ChatRateLimitServiceError();

  return {
    allowed: row.allowed,
    retryAfterSeconds: Math.min(3_600, Math.ceil(retryAfter)),
  };
}
