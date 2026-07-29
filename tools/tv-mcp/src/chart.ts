/**
 * TradingView Desktop — Chart Tools
 *
 * Chart state, symbol, timeframe, chart type, visible range, symbol search.
 */

import { z } from "zod";
import { evaluate, evaluateAsync, safeString, requireFinite, KNOWN_PATHS } from "./core/connection.js";
import type { ToolDef } from "./index.js";

const CHART_API = KNOWN_PATHS.CHART_API;
const BARS_PATH = KNOWN_PATHS.BARS_PATH;

export const chartTools: ToolDef[] = [
  // ── tv_chart_get_state ───────────────────────────────────────────────────
  {
    name: "tv_chart_get_state",
    description: "Read the full TradingView chart state: symbol, resolution, chart type, and list of active indicators/studies.",
    parameters: z.object({}),
    execute: async () => {
      const state = await evaluate(`
        (function() {
          var chart = ${CHART_API};
          var studies = [];
          try {
            var all = chart.getAllStudies();
            studies = all.map(function(s) { return { id: s.id, name: s.name || s.title || 'unknown' }; });
          } catch(e) {}
          return {
            symbol: chart.symbol(),
            resolution: chart.resolution(),
            chartType: chart.chartType(),
            studies: studies,
          };
        })()
      `);
      return state ?? { error: "TradingView Desktop not reachable. Ensure it's running with --remote-debugging-port=9222." };
    },
  },

  // ── tv_chart_set_symbol ──────────────────────────────────────────────────
  {
    name: "tv_chart_set_symbol",
    description: "Change the active symbol on the TradingView chart. Waits for the chart to load the new symbol.",
    parameters: z.object({
      symbol: z.string().describe("Trading symbol, e.g. BTCUSDT, AAPL, EURUSD, BINANCE:ETHUSDT"),
    }),
    execute: async ({ symbol }: { symbol: string }) => {
      await evaluateAsync(`
        (function() {
          var chart = ${CHART_API};
          return new Promise(function(resolve) {
            chart.setSymbol(${safeString(symbol)}, {});
            setTimeout(resolve, 500);
          });
        })()
      `);
      // Wait for chart to settle
      await new Promise(r => setTimeout(r, 1500));
      return { success: true, symbol };
    },
  },

  // ── tv_chart_set_timeframe ───────────────────────────────────────────────
  {
    name: "tv_chart_set_timeframe",
    description: "Change the active timeframe on the TradingView chart. Use TV resolution format (1, 5, 15, 60, 240, 1D, 1W, 1M) or friendly format (1m, 5m, 1h, 4h, 1d, 1w).",
    parameters: z.object({
      timeframe: z.string().describe("Timeframe: 1m/5m/15m/1h/4h/1d/1w (friendly) or 1/5/15/60/240/1D/1W (TV native)"),
    }),
    execute: async ({ timeframe }: { timeframe: string }) => {
      const tvTf = timeframe.match(/^(\d+)([mhdw])$/i)
        ? { "m": "1", "5m": "5", "15m": "15", "1h": "60", "4h": "240", "1d": "1D", "1w": "1W" }[timeframe] || timeframe
        : timeframe;
      await evaluate(`
        (function() {
          var chart = ${CHART_API};
          chart.setResolution(${safeString(tvTf)}, {});
        })()
      `);
      await new Promise(r => setTimeout(r, 1000));
      return { success: true, timeframe, resolved: tvTf };
    },
  },

  // ── tv_chart_set_type ────────────────────────────────────────────────────
  {
    name: "tv_chart_set_type",
    description: "Change the chart rendering type: Candles, Line, Area, Bars, HeikinAshi, Renko, Kagi, PointAndFigure, LineBreak, HollowCandles.",
    parameters: z.object({
      chart_type: z.string().describe("Chart type name (Candles, Line, Area, Bars, HeikinAshi, Renko, Kagi, PointAndFigure, LineBreak, HollowCandles) or number 0-9"),
    }),
    execute: async ({ chart_type }: { chart_type: string }) => {
      const typeMap: Record<string, number> = {
        "Bars": 0, "Candles": 1, "Line": 2, "Area": 3,
        "Renko": 4, "Kagi": 5, "PointAndFigure": 6, "LineBreak": 7,
        "HeikinAshi": 8, "HollowCandles": 9,
      };
      const typeNum = typeMap[chart_type] ?? Number(chart_type);
      if (isNaN(typeNum) || typeNum < 0 || typeNum > 9 || !Number.isInteger(typeNum)) {
        throw new Error(`Unknown chart type: ${chart_type}. Use a name (Candles, Line, etc.) or number (0-9).`);
      }
      await evaluate(`${CHART_API}.setChartType(${typeNum})`);
      return { success: true, chart_type, type_num: typeNum };
    },
  },

  // ── tv_chart_visible_range ───────────────────────────────────────────────
  {
    name: "tv_chart_visible_range",
    description: "Get or set the visible time range on the chart. Without arguments, returns current range. With from/to, sets the range.",
    parameters: z.object({
      from: z.number().optional().describe("Start time as Unix timestamp (seconds). Omit to read current range."),
      to: z.number().optional().describe("End time as Unix timestamp (seconds). Omit to read current range."),
    }),
    execute: async ({ from, to }: { from?: number; to?: number }) => {
      if (from != null && to != null) {
        const f = requireFinite(from, "from");
        const t = requireFinite(to, "to");
        await evaluate(`
          (function() {
            var chart = ${CHART_API};
            var m = chart._chartWidget.model();
            var ts = m.timeScale();
            var bars = m.mainSeries().bars();
            var startIdx = bars.firstIndex(), endIdx = bars.lastIndex();
            var fromIdx = startIdx, toIdx = endIdx;
            for (var i = startIdx; i <= endIdx; i++) {
              var v = bars.valueAt(i);
              if (v && v[0] >= ${f} && fromIdx === startIdx) fromIdx = i;
              if (v && v[0] <= ${t}) toIdx = i;
            }
            ts.zoomToBarsRange(fromIdx, toIdx);
          })()
        `);
        await new Promise(r => setTimeout(r, 500));
        const actual = await evaluate(`
          (function() {
            try { var r = ${CHART_API}.getVisibleRange(); return { from: r.from || 0, to: r.to || 0 }; }
            catch(e) { return null; }
          })()
        `);
        return { success: true, requested: { from, to }, actual };
      }
      const range = await evaluate(`
        (function() {
          try {
            var chart = ${CHART_API};
            return { visible_range: chart.getVisibleRange(), bars_range: chart.getVisibleBarsRange() };
          } catch(e) { return null; }
        })()
      `);
      return { success: true, ...range };
    },
  },

  // ── tv_chart_scroll_to_date ──────────────────────────────────────────────
  {
    name: "tv_chart_scroll_to_date",
    description: "Scroll the chart to center on a specific date.",
    parameters: z.object({
      date: z.string().describe("Date to center on. Use ISO format (2024-01-15) or unix timestamp."),
    }),
    execute: async ({ date }: { date: string }) => {
      let timestamp: number;
      if (/^\d+$/.test(date)) timestamp = Number(date);
      else timestamp = Math.floor(new Date(date).getTime() / 1000);
      if (isNaN(timestamp)) throw new Error(`Could not parse date: ${date}. Use ISO format (2024-01-15) or unix timestamp.`);

      const resolution = await evaluate(`${CHART_API}.resolution()`);
      let secsPerBar = 60;
      const res = String(resolution);
      if (res === "D" || res === "1D") secsPerBar = 86400;
      else if (res === "W" || res === "1W") secsPerBar = 604800;
      else if (res === "M" || res === "1M") secsPerBar = 2592000;
      else { const mins = parseInt(res, 10); if (!isNaN(mins)) secsPerBar = mins * 60; }

      const halfWindow = 25 * secsPerBar;
      await evaluate(`
        (function() {
          var chart = ${CHART_API};
          var m = chart._chartWidget.model();
          var ts = m.timeScale();
          var bars = m.mainSeries().bars();
          var startIdx = bars.firstIndex(), endIdx = bars.lastIndex();
          var fromIdx = startIdx, toIdx = endIdx;
          for (var i = startIdx; i <= endIdx; i++) {
            var v = bars.valueAt(i);
            if (v && v[0] >= ${timestamp - halfWindow} && fromIdx === startIdx) fromIdx = i;
            if (v && v[0] <= ${timestamp + halfWindow}) toIdx = i;
          }
          ts.zoomToBarsRange(fromIdx, toIdx);
        })()
      `);
      await new Promise(r => setTimeout(r, 500));
      return { success: true, date, centered_on: timestamp, resolution };
    },
  },

  // ── tv_chart_symbol_info ─────────────────────────────────────────────────
  {
    name: "tv_chart_symbol_info",
    description: "Get detailed symbol information from TradingView: full name, exchange, description, type, pro_name, typespecs.",
    parameters: z.object({}),
    execute: async () => {
      const result = await evaluate(`
        (function() {
          var chart = ${CHART_API};
          var info = chart.symbolExt();
          return {
            symbol: info.symbol, full_name: info.full_name, exchange: info.exchange,
            description: info.description, type: info.type, pro_name: info.pro_name,
            typespecs: info.typespecs, resolution: chart.resolution(), chart_type: chart.chartType(),
          };
        })()
      `);
      return result ?? { error: "Could not read symbol info" };
    },
  },

  // ── tv_chart_symbol_search ───────────────────────────────────────────────
  {
    name: "tv_chart_symbol_search",
    description: "Search for symbols using TradingView's public symbol search API.",
    parameters: z.object({
      query: z.string().describe("Search query, e.g. BTC, Apple, EUR"),
      type: z.string().optional().describe("Optional filter: stock, crypto, forex, futures, index, economic"),
    }),
    execute: async ({ query, type }: { query: string; type?: string }) => {
      const params = new URLSearchParams({ text: query, hl: "1", exchange: "", lang: "en", search_type: type || "", domain: "production" });
      const resp = await fetch(`https://symbol-search.tradingview.com/symbol_search/v3/?${params}`, {
        headers: { Origin: "https://www.tradingview.com", Referer: "https://www.tradingview.com/" },
      });
      if (!resp.ok) throw new Error(`Symbol search API returned ${resp.status}`);
      const data: any = await resp.json();
      const strip = (s: string) => (s || "").replace(/<\/?em>/g, "");
      const results = (data.symbols || data || []).slice(0, 15).map((r: any) => ({
        symbol: strip(r.symbol), description: strip(r.description),
        exchange: r.exchange || r.prefix || "", type: r.type || "",
        full_name: r.exchange ? `${r.exchange}:${strip(r.symbol)}` : strip(r.symbol),
      }));
      return { query, source: "rest_api", results, count: results.length };
    },
  },
];
