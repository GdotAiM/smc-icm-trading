#!/usr/bin/env node
/**
 * TradingView Desktop MCP Server
 *
 * Exposes 74 tools for controlling TradingView Desktop via CDP.
 * Registered as a Claude Code MCP server in .claude/settings.json.
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

const ALL_TOOLS: ToolDef[] = [
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
 * Wrap a tool's execute function with auto-connect logic.
 * First call will attempt to connect to TV Desktop CDP.
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
  // Use zod's built-in JSON Schema conversion
  const def = zodSchema._def;
  // Simplified: extract shape and convert to JSON schema-compatible object
  const shape = zodSchema.shape;
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, field] of Object.entries(shape)) {
    const fieldDef = (field as z.ZodTypeAny)._def;
    const isOptional = field.isOptional?.() ?? false;
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

async function main() {
  const server = new McpServer({
    name: "tv-mcp",
    version: "1.0.0",
    description: "TradingView Desktop — 74 chart control, drawing, data, and automation tools",
  });

  for (const tool of ALL_TOOLS) {
    const wrapped = withAutoConnect(tool);
    // Register with MCP SDK
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

  logger.info(`Registered ${ALL_TOOLS.length} TV Desktop tools`);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("TV MCP server running on stdio");
}

main().catch((err) => {
  logger.error("Fatal error", err);
  process.exit(1);
});
