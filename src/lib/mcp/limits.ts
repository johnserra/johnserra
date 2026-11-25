/** Public MCP server boundary limits. All byte limits are measured as UTF-8 bytes. */
export const MCP_SERVER_NAME = "johnserra-digital-twin";
export const MCP_SERVER_VERSION = "1.0.0";
export const MCP_ROUTE = "/api/mcp";
export const MCP_CORRELATION_HEADER = "X-Mcp-Correlation-Id";

export const MCP_MAX_BODY_BYTES = 16 * 1024;
export const MCP_MAX_QUESTION_CHARS = 2_000;
export const MCP_MAX_QUESTION_BYTES = 4 * 1024;
export const MCP_MAX_CITATIONS = 25;

/** Leaves safe headroom inside Vercel maxDuration=60s and typical MCP client timeouts. */
export const MCP_ASK_DEADLINE_MS = 38_000;

/** Separate MCP rate-limit windows; reuses check_chat_rate_limit with MCP-namespaced HMACs. */
export const MCP_RATE_LIMIT_WINDOW_SECONDS = 60;
export const MCP_RATE_LIMIT_ASK_LIMIT = 10;
export const MCP_RATE_LIMIT_IP_LIMIT = 30;

export const MCP_TOOL_NAMES = ["ask_digital_twin"] as const;
export type McpToolName = (typeof MCP_TOOL_NAMES)[number];

export const MCP_DISCLAIMER_BY_LOCALE = {
  en: "Answered by John Serra's public AI assistant using documented public sources only.",
  tr: "John Serra'nın kamuya açık yapay zeka asistanı tarafından yalnızca belgelenmiş kamuya açık kaynaklar kullanılarak yanıtlanmıştır.",
} as const;
