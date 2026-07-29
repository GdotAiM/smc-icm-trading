/**
 * TradingView Desktop — Health & Status Tools
 *
 * Connection health checks and version info.
 */

import { z } from "zod";
import { isConnected, connect, KNOWN_PATHS } from "./core/connection.js";
import { getTvConfig } from "./config.js";
import type { ToolDef } from "./index.js";

export const healthTools: ToolDef[] = [
  {
    name: "tv_health",
    description: "Check if the TradingView Desktop CDP connection is healthy. Returns connection status, config, and chart info.",
    parameters: z.object({}),
    execute: async () => {
      const config = getTvConfig();
      const connected = await isConnected();
      const result: any = {
        connected,
        enabled: config.enabled,
        connection_type: config.connection.type,
        cdp_port: config.connection.cdpPort,
      };
      if (connected) {
        // Try to read basic chart info as a secondary health check
        const { evaluate } = await import("./core/connection.js");
        const sym = await evaluate(`(function() { try { return ${KNOWN_PATHS.CHART_API}.symbol(); } catch(e) { return null; } })()`);
        if (sym) result.chart_symbol = sym;
      }
      return result;
    },
  },
  {
    name: "tv_connect",
    description: "Force reconnect to TradingView Desktop via CDP.",
    parameters: z.object({}),
    execute: async () => {
      const ok = await connect();
      if (!ok) throw new Error("Failed to connect to TV Desktop. Ensure it's running with --remote-debugging-port=9222.");
      return { success: true, message: "Reconnected to TradingView Desktop" };
    },
  },
];
