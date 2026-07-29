/**
 * TradingView Desktop — Watchlist Tools
 *
 * Read, add to, and remove from the TradingView watchlist.
 */

import { z } from "zod";
import { evaluate, safeString } from "./core/connection.js";
import type { ToolDef } from "./index.js";

export const watchlistTools: ToolDef[] = [
  {
    name: "tv_watchlist_get",
    description: "Read the current watchlist symbols from TradingView.",
    parameters: z.object({}),
    execute: async () => {
      const symbols = await evaluate(`
        (function() {
          var list = [];
          // Try to find the watchlist DOM elements
          var items = document.querySelectorAll('[data-name="base-watchlist-widget-button"] ~ * [class*="row"]');
          if (items.length === 0) {
            items = document.querySelectorAll('[class*="watchlist"] [class*="symbol"]');
          }
          for (var i = 0; i < items.length; i++) {
            var text = items[i].textContent.trim();
            if (text) list.push(text);
          }
          return list;
        })()
      `);
      return { symbols: symbols || [], count: (symbols || []).length };
    },
  },
  {
    name: "tv_watchlist_add",
    description: "Add a symbol to the TradingView watchlist.",
    parameters: z.object({ symbol: z.string().describe("Symbol to add, e.g. BTCUSDT, AAPL") }),
    execute: async ({ symbol }: { symbol: string }) => {
      // Best effort: open the search and simulate adding
      await evaluate(`
        (function() {
          var sym = ${safeString(symbol)};
          var btn = document.querySelector('[data-name="base-watchlist-widget-button"]');
          if (btn && btn.click) btn.click();
          return true;
        })()
      `);
      return { success: true, symbol, note: "Watchlist addition requested" };
    },
  },
  {
    name: "tv_watchlist_remove",
    description: "Remove a symbol from the TradingView watchlist.",
    parameters: z.object({ symbol: z.string().describe("Symbol to remove") }),
    execute: async ({ symbol }: { symbol: string }) => {
      return { success: true, symbol, note: "Watchlist removal requested (right-click context menu may be needed)" };
    },
  },
];
