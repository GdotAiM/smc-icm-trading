/**
 * TradingView Desktop — Screenshot Tools
 *
 * Capture screenshots of the full chart or specific regions as base64-encoded PNG.
 */

import { z } from "zod";
import { captureScreenshot, evaluate } from "./core/connection.js";
import type { ToolDef } from "./index.js";

export const captureTools: ToolDef[] = [
  {
    name: "tv_capture_screenshot",
    description: "Capture a screenshot of the TradingView chart. Returns a base64-encoded PNG image. Regions: full (entire page), chart (pane only), or strategy_tester.",
    parameters: z.object({
      region: z.enum(["full", "chart", "strategy_tester"]).optional().describe("Capture region: full, chart, or strategy_tester (default: full)"),
    }),
    execute: async ({ region }: { region?: string }) => {
      const data = await captureScreenshot((region as any) || "full");
      if (!data) throw new Error("Screenshot capture failed. Is TV Desktop connected?");
      return { region: region || "full", format: "png", data, size_bytes: Math.round((data.length * 3) / 4) };
    },
  },
];
