#!/usr/bin/env node
/**
 * TradingView Desktop MCP Server
 *
 * Exposes 74 tools for controlling TradingView Desktop via CDP.
 * Registered as a Claude Code MCP server in .claude/settings.json.
 *
 * Transports (select via MCP_TRANSPORT env var):
 *   stdio   — default, for Claude Code / CLI agents
 *   http    — StreamableHTTP on :9233, for web clients and cross-model routing
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { logger } from "./logger.js";
import { connect, isConnected } from "./core/connection.js";

// Re-export ToolDef for domain modules to import
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ToolDef {
  name: string;
  description: string;
  parameters: z.ZodObject<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: (args: any) => Promise<any>;
}

// Domain tool imports
import { chartTools } from "./chart.js";
import { drawingTools } from "./drawing.js";
import { dataTools } from "./data.js";
import { alertTools } from "./alerts.js";
import { indicatorTools } from "./indicators.js";
import { paneTools } from "./pane.js";
import { replayTools } from "./replay.js";
import { tabTools } from "./tab.js";
import { uiTools } from "./ui.js";
import { pineTools } from "./pine.js";
import { captureTools } from "./capture.js";
import { watchlistTools } from "./watchlist.js";
import { healthTools } from "./health.js";

export const ALL_TOOLS: ToolDef[] = [
  ...chartTools,
  ...drawingTools,
  ...dataTools,
  ...alertTools,
  ...indicatorTools,
  ...paneTools,
  ...replayTools,
  ...tabTools,
  ...uiTools,
  ...pineTools,
  ...captureTools,
  ...watchlistTools,
  ...healthTools,
];

/**
 * Wrap a tool's execute function with auto-connect logic + tracing.
 */
function withAutoConnect(tool: ToolDef): ToolDef {
  return {
    ...tool,
    execute: async (args: Record<string, unknown>) => {
      if (!(await isConnected())) {
        logger.info(`Auto-connecting for tool: ${tool.name}`);
        await connect();
      }
      return tool.execute(args);
    },
  };
}

/** Convert a ToolDef to MCP tool registration format */
function zodToJsonSchema(zodSchema: z.ZodObject<Record<string, z.ZodTypeAny>>): Record<string, unknown> {
  const def = zodSchema._def;
  const shape = zodSchema.shape;
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, field] of Object.entries(shape)) {
    const fieldDef = (field as z.ZodTypeAny)._def;
    const isOptional = (field as z.ZodTypeAny).isOptional?.() ?? false;
    if (!isOptional) required.push(key);

    const typeMap: Record<string, string> = {
      ZodString: "string",
      ZodNumber: "number",
      ZodBoolean: "boolean",
      ZodArray: "array",
      ZodObject: "object",
      ZodEnum: "string",
    };
    const typeName = fieldDef.typeName as string;
    properties[key] = {
      type: typeMap[typeName] ?? "string",
      description: fieldDef.description ?? "",
    };

    if (typeName === "ZodEnum") {
      (properties[key] as any).enum = (fieldDef as any).values;
    }
  }

  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

/** Register all tools on an MCP server instance */
function registerTools(server: McpServer): void {
  for (const tool of ALL_TOOLS) {
    const wrapped = withAutoConnect(tool);
    server.tool(
      wrapped.name,
      wrapped.description,
      zodToJsonSchema(wrapped.parameters),
      async (args: Record<string, unknown>) => {
        try {
          const result = await wrapped.execute(args);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            content: [{ type: "text" as const, text: `Error: ${message}` }],
            isError: true,
          };
        }
      },
    );
  }
}

/**
 * Start the server on the configured transport.
 * MCP_TRANSPORT=stdio (default) → stdin/stdout
 * MCP_TRANSPORT=http           → HTTP server on :9233
 */
async function main() {
  const server = new McpServer({
    name: "tv-mcp",
    version: "1.0.0",
    description: "TradingView Desktop — 74 chart control, drawing, data, and automation tools",
  });

  registerTools(server);
  logger.info(`Registered ${ALL_TOOLS.length} TV Desktop tools`);

  const transportMode = (process.env.MCP_TRANSPORT || "stdio").toLowerCase();

  if (transportMode === "http") {
    // Lazy-import to avoid hard dependency when running in stdio mode
    const { StreamableHTTPServerTransport } = await import(
      "@modelcontextprotocol/sdk/server/streamableHttp.js"
    );
    const http = await import("node:http");
    const httpPort = Number(process.env.MCP_HTTP_PORT || 9233);

    const server_ = http.createServer(async (req, res) => {
      // Handle CORS preflight
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, Last-Event-ID",
        });
        res.end();
        return;
      }

      // Health endpoint (no MCP transport needed)
      if (req.url === "/health" || req.url === "/") {
        res.writeHead(200, { "Content-Type": "application/json" });
        const connected = await isConnected().catch(() => false);
        res.end(JSON.stringify({
          status: "ok",
          connected,
          cdp: `${process.env.TV_CDP_HOST || "127.0.0.1"}:${process.env.TV_CDP_PORT || 9222}`,
          toolCount: ALL_TOOLS.length,
          timestamp: new Date().toISOString(),
        }));
        return;
      }

      // All other paths → MCP StreamableHTTP transport
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless mode
      });

      res.on("close", () => {
        transport.close().catch(() => {});
      });

      try {
        // transport.handleRequest takes (req, res, parsedBody)
        await transport.handleRequest(req, res);
      } catch (err) {
        logger.error(`HTTP handler error: ${(err as Error).message}`);
        if (!res.headersSent) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: "Internal server error" }));
        }
      }
    });

    server_.listen(httpPort, "127.0.0.1", () => {
      logger.info(`TV MCP server running on HTTP :${httpPort}`);
      logger.info(`  Health: http://127.0.0.1:${httpPort}/health`);
      logger.info(`  MCP endpoint: http://127.0.0.1:${httpPort}/mcp`);
    });

    process.on("SIGINT", () => {
      logger.info("Shutting down HTTP server...");
      server_.close(() => process.exit(0));
    });
  } else {
    // Default: stdio (Claude Code, CLI agents)
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info("TV MCP server running on stdio");
  }
}

main().catch((err) => {
  logger.error("Fatal error", err);
  process.exit(1);
});
