/**
 * TradingView Desktop — Pane/Layout Tools
 *
 * Multi-chart layout management: list panes, set layout grid, focus/switch
 * panes, set symbols on individual panes.
 */

import { z } from "zod";
import { evaluate, evaluateAsync, safeString, KNOWN_PATHS } from "./core/connection.js";
import type { ToolDef } from "./index.js";

const CWC = KNOWN_PATHS.CHART_COLLECTION;

const LAYOUT_NAMES: Record<string, string> = {
  s: "1 chart", "2h": "2 horizontal", "2v": "2 vertical", "2-1": "2 top, 1 bottom",
  "1-2": "1 top, 2 bottom", "3h": "3 horizontal", "3v": "3 vertical",
  "3s": "3 custom", "4": "2x2 grid", "4h": "4 horizontal", "4v": "4 vertical",
  "4s": "4 custom", "6": "6 charts", "8": "8 charts", "10": "10 charts",
  "12": "12 charts", "14": "14 charts", "16": "16 charts",
};

export const paneTools: ToolDef[] = [
  {
    name: "tv_pane_list",
    description: "List all panes/charts in the current multi-chart layout with their symbols, resolutions, and active index.",
    parameters: z.object({}),
    execute: async () => {
      const result = await evaluate(`
        (function() {
          var cwc = ${CWC};
          var lt = cwc._layoutType; if (typeof lt === 'object' && lt && typeof lt.value === 'function') lt = lt.value();
          var count = cwc.inlineChartsCount; if (typeof count === 'object' && count && typeof count.value === 'function') count = count.value();
          var all = cwc.getAll();
          var panes = [];
          for (var i = 0; i < all.length; i++) {
            try {
              var c = all[i]; var m = c.model ? c.model() : null; var ms = m ? m.mainSeries() : null;
              panes.push({ index: i, symbol: ms ? ms.symbol() : 'unknown', resolution: ms ? ms.interval() : null });
            } catch(e) { panes.push({ index: i, error: e.message }); }
          }
          var active = ${KNOWN_PATHS.CHART_API};
          var activeIndex = null;
          for (var j = 0; j < all.length; j++) { try { if (all[j].model && active._chartWidget && all[j] === active._chartWidget) { activeIndex = j; break; } } catch(e) {} }
          return { layout: lt, chart_count: count, active_index: activeIndex, panes: panes };
        })()
      `);
      return {
        layout: result?.layout, layout_name: result?.layout ? (LAYOUT_NAMES[result.layout] || result.layout) : null,
        chart_count: result?.chart_count, active_index: result?.active_index, panes: result?.panes || [],
      };
    },
  },
  {
    name: "tv_pane_set_layout",
    description: "Change the chart layout grid. Codes: s (single), 2h (2 horizontal), 2v (2 vertical), 4 (2x2 grid), 3h, 3v, 6, 8, etc.",
    parameters: z.object({
      layout: z.string().describe("Layout code: s, 2h, 2v, 2-1, 1-2, 4, 6, 8, 10, 12, etc."),
    }),
    execute: async ({ layout }: { layout: string }) => {
      const code = layout.toLowerCase().replace(/\s+/g, "");
      const aliases: Record<string, string> = { single: "s", "1": "s", "1x1": "s", "2x1": "2h", "1x2": "2v", "2x2": "4", grid: "4", quad: "4", "3x1": "3h", "1x3": "3v" };
      const resolved = aliases[code] || code;
      if (!LAYOUT_NAMES[resolved]) throw new Error(`Unknown layout "${layout}". Available: ${Object.entries(LAYOUT_NAMES).map(([k, v]) => `${k} (${v})`).join(", ")}`);
      await evaluateAsync(`${CWC}.setLayout(${safeString(resolved)})`);
      await new Promise(r => setTimeout(r, 500));
      return { success: true, layout: resolved, layout_name: LAYOUT_NAMES[resolved] };
    },
  },
  {
    name: "tv_pane_focus",
    description: "Focus/activate a specific pane by index.",
    parameters: z.object({ index: z.number().describe("Pane index to focus (0-based)") }),
    execute: async ({ index }: { index: number }) => {
      const result = await evaluate(`
        (function() {
          var all = ${CWC}.getAll();
          if (${index} >= all.length) return { error: 'Pane index ' + ${index} + ' out of range (have ' + all.length + ' panes)' };
          var chart = all[${index}]; if (chart._mainDiv) chart._mainDiv.click();
          return { focused: ${index}, total: all.length };
        })()
      `);
      if (result?.error) throw new Error(result.error);
      return { success: true, focused_index: result?.focused, total_panes: result?.total };
    },
  },
  {
    name: "tv_pane_set_symbol",
    description: "Set the symbol on a specific pane by index.",
    parameters: z.object({
      index: z.number().describe("Pane index (0-based)"),
      symbol: z.string().describe("Symbol to set, e.g. BTCUSDT, AAPL"),
    }),
    execute: async ({ index, symbol }: { index: number; symbol: string }) => {
      await evaluate(`${CWC}.getAll()[${index}]._mainDiv.click()`);
      await new Promise(r => setTimeout(r, 300));
      await evaluateAsync(`${KNOWN_PATHS.CHART_API}.setSymbol(${safeString(symbol)}, {})`);
      await new Promise(r => setTimeout(r, 500));
      return { success: true, index, symbol };
    },
  },
];
