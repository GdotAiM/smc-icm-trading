/**
 * TradingView Desktop — Tab Management Tools
 *
 * List, create, close, and switch between chart tabs in TV Desktop.
 * Tab bar operations interact with the Electron shell window's DOM.
 */

import { z } from "zod";
import { listTargets, reconnectTo, getCdpHost, getCdpPort, evaluate } from "./core/connection.js";
import type { ToolDef } from "./index.js";
import CDP from "chrome-remote-interface";

export const tabTools: ToolDef[] = [
  {
    name: "tv_tab_list",
    description: "List all open chart tabs in TradingView Desktop with their target IDs, titles, and chart IDs.",
    parameters: z.object({}),
    execute: async () => {
      const targets = await listTargets();
      const tabs = targets
        .filter(t => t.is_chart || t.title === "New tab")
        .map((t, i) => ({
          index: i, id: t.id, title: t.title.replace(/^Live stock.*charts on /, ""),
          url: t.url, chart_id: t.chart_id, is_chart: t.is_chart,
        }));
      return { tab_count: tabs.length, tabs };
    },
  },
  {
    name: "tv_tab_switch",
    description: "Switch to a specific chart tab by index. All subsequent tool calls follow the switched tab.",
    parameters: z.object({ index: z.number().describe("Tab index to switch to (0-based)") }),
    execute: async ({ index }: { index: number }) => {
      const all = await listTargets();
      const tabs = all.filter(t => t.is_chart || t.title === "New tab");
      if (index >= tabs.length) throw new Error(`Tab index ${index} out of range (have ${tabs.length} tabs)`);
      const target = tabs[index];
      try {
        await reconnectTo(target.id);
      } catch (e: any) {
        throw new Error(`Failed to switch tabs: ${e.message}`);
      }
      return { success: true, index, tab_id: target.id, chart_id: target.chart_id };
    },
  },
  {
    name: "tv_tab_new",
    description: "Open a new chart tab in TradingView Desktop.",
    parameters: z.object({}),
    execute: async () => {
      const targetsBefore = await listTargets();
      const chartIdsBefore = new Set(targetsBefore.filter(t => t.is_chart).map(t => t.id));
      // Click the shell's new-tab button via CDP
      const resp = await fetch(`http://${getCdpHost()}:${getCdpPort()}/json/list`);
      const allTargets = await resp.json() as any[];
      const shellTarget = allTargets.find(t => t.type === "page" && /\/window\/index\.html/i.test(t.url || ""));
      if (shellTarget) {
        let c = null;
        try {
          c = await CDP({ host: getCdpHost(), port: getCdpPort(), target: shellTarget.id });
          await c.Runtime.evaluate({
            expression: `document.querySelector('[class*="create-new-tab"]')?.click()`,
          });
          await c.close();
        } catch { if (c) try { await c.close(); } catch {} }
      }
      await new Promise(r => setTimeout(r, 2000));
      return { success: true, action: "new_tab_opened" };
    },
  },
];
