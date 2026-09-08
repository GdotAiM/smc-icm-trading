// Structured logger for the TV MCP server.
// Writes JSON lines to stderr; optional Langfuse integration behind LANGFUSE_HOST.

let _langfuse: any = null;

try {
  // Lazy-load Langfuse only when the env var is present (avoid hard dep)
  if (process.env.LANGFUSE_HOST) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Langfuse = require("langfuse") as any;
    _langfuse = new Langfuse({
      baseUrl: process.env.LANGFUSE_HOST,
      publicKey: process.env.LANGFUSE_PUBLIC_KEY || "",
      secretKey: process.env.LANGFUSE_SECRET_KEY || "",
    });
  }
} catch {
  // Langfuse unavailable — continue without it
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

interface LogEntry {
  ts: string;
  level: "debug" | "info" | "warn" | "error";
  tool?: string;
  args?: unknown;
  duration_ms?: number;
  success?: boolean;
  trace_id?: string;
  msg: string;
  data?: unknown;
}

function emit(entry: LogEntry): void {
  process.stderr.write(JSON.stringify(entry) + "\n");
  // Human-readable mirror for stdio clients that can't parse JSON
  const human = `[tv-mcp] [${entry.level.toUpperCase()}] ${entry.msg}${entry.data ? " " + JSON.stringify(entry.data) : ""}`;
  if (entry.level === "error") console.error(human);
  else if (entry.level === "warn") console.warn(human);
  else console.error(human);

  if (_langfuse && entry.tool) {
    try {
      const span = _langfuse.span({
        name: `tool/${entry.tool}`,
        input: entry.args,
        metadata: { trace_id: entry.trace_id },
      });
      span.end({
        output: entry.success !== false ? { ok: true } : { error: entry.msg },
        level: entry.level === "error" ? "ERROR" : entry.level === "warn" ? "WARNING" : "DEFAULT",
      });
    } catch {
      /* non-blocking */
    }
  }
}

export const logger = {
  info(msg: string, data?: unknown) {
    emit({ ts: new Date().toISOString(), level: "info", msg, data });
  },
  warn(msg: string, data?: unknown) {
    emit({ ts: new Date().toISOString(), level: "warn", msg, data });
  },
  error(msg: string, data?: unknown) {
    emit({ ts: new Date().toISOString(), level: "error", msg, data });
  },
  debug(msg: string, data?: unknown) {
    emit({ ts: new Date().toISOString(), level: "debug", msg, data });
  },
  /** Wrap an async tool execution with timing + trace-id + Langfuse span */
  withTrace<T>(toolName: string, fn: () => Promise<T>): Promise<T> {
    const traceId = uid();
    const start = Date.now();
    return fn().then(
      (result) => {
        emit({
          ts: new Date().toISOString(),
          level: "info",
          tool: toolName,
          args: undefined,
          duration_ms: Date.now() - start,
          success: true,
          trace_id: traceId,
          msg: `${toolName} OK`,
          data: result,
        });
        return result;
      },
      (err: any) => {
        emit({
          ts: new Date().toISOString(),
          level: "error",
          tool: toolName,
          duration_ms: Date.now() - start,
          success: false,
          trace_id: traceId,
          msg: `${toolName} FAILED: ${err?.message || String(err)}`,
          data: err,
        });
        throw err;
      }
    );
  },
};
