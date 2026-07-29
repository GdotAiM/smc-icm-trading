// Minimal logger for TV MCP server
export const logger = {
  info: (msg: string | object, data?: unknown) => console.error(`[tv-mcp] INFO:`, typeof msg === "string" ? msg : JSON.stringify(msg), data ?? ""),
  warn: (msg: string | object, data?: unknown) => console.error(`[tv-mcp] WARN:`, typeof msg === "string" ? msg : JSON.stringify(msg), data ?? ""),
  error: (msg: string | object, data?: unknown) => console.error(`[tv-mcp] ERROR:`, typeof msg === "string" ? msg : JSON.stringify(msg), data ?? ""),
  debug: (msg: string | object, data?: unknown) => console.error(`[tv-mcp] DEBUG:`, typeof msg === "string" ? msg : JSON.stringify(msg), data ?? ""),
};
