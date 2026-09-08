// openai-tools.ts — Export all MCP ToolDefs as OpenAI-compatible function-calling defs
//
// Allows the Node.js LLM operator loop (operator_loop.cjs, setup_auditor.cjs)
// to use the same tool registry that powers the MCP server — no duplication.
//
// Usage:
//   import { toOpenAITools } from "./openai-tools.js";
//   const defs = toOpenAITools(); // Array of OpenAI function-calling shapes

import type { ToolDef } from "./index.js";

/**
 * Convert a single ToolDef into an OpenAI function-calling tool definition.
 */
export function toolDefToOpenAI(tool: ToolDef): {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
} {
  // Build a minimal JSON Schema from the Zod parameter shape
  // The MCP server's zodToJsonSchema does a basic conversion; we mirror it here.
  function zodToSchema(zodObj: any): Record<string, unknown> {
    const shape = zodObj?.shape;
    if (!shape) return { type: "object", properties: {}, required: [] };
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, field] of Object.entries(shape)) {
      const def = (field as any)?._def;
      const isOptional = (field as any)?.isOptional?.() ?? false;
      if (!isOptional) required.push(key);
      const typeMap: Record<string, string> = {
        ZodString: "string",
        ZodNumber: "number",
        ZodBoolean: "boolean",
        ZodArray: "array",
        ZodObject: "object",
        ZodEnum: "string",
        ZodOptional: "string", // unwrap optional
        ZodNullable: "string",
      };
      const typeName = def?.typeName as string;
      properties[key] = {
        type: typeMap[typeName] ?? "string",
        description: def?.description ?? "",
      };
      if (typeName === "ZodEnum") {
        (properties[key] as any).enum = def?.values;
      }
    }
    return { type: "object", properties, ...(required.length ? { required } : {}) };
  }

  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: zodToSchema(tool.parameters),
    },
  };
}

/**
 * Convert ALL_TOOLS into an array of OpenAI function-calling tool definitions.
 * Callers pass this array as the `tools` option to llm_client.chatCompletion().
 */
export function toOpenAITools(tools: ToolDef[]): Array<{ type: "function"; function: any }> {
  return tools.map(toolDefToOpenAI);
}
