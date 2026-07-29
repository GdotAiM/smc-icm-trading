/**
 * TradingView Desktop — Data Tools
 *
 * OHLCV bars, quotes, depth of market, indicator values, strategy performance,
 * and Pine Script graphics (lines, labels, boxes, tables).
 */

import { z } from "zod";
import { evaluate, evaluateAsync, safeString, requireFinite, KNOWN_PATHS } from "./core/connection.js";
import type { ToolDef } from "./index.js";

const CHART_API = KNOWN_PATHS.CHART_API;
const BARS_PATH = KNOWN_PATHS.BARS_PATH;

// Helper: round price to 8dp (kills float noise without destroying forex precision)
const roundPrice = (v: number | null | undefined) =>
  v == null ? null : Math.round(v * 1e8) / 1e8;

export const dataTools: ToolDef[] = [
  // ── tv_data_get_ohlcv ────────────────────────────────────────────────────
  {
    name: "tv_data_get_ohlcv",
    description: "Extract OHLCV bar data from the chart. Returns up to 500 bars with time, open, high, low, close, volume.",
    parameters: z.object({
      count: z.number().optional().describe("Number of most recent bars to return (max 500, default 100)"),
      summary: z.boolean().optional().describe("If true, returns summary stats instead of individual bars"),
    }),
    execute: async ({ count, summary }: { count?: number; summary?: boolean }) => {
      const limit = Math.min(count || 100, 500);
      const data = await evaluate(`
        (function() {
          var bars = ${BARS_PATH};
          if (!bars || typeof bars.lastIndex !== 'function') return null;
          var result = [];
          var end = bars.lastIndex();
          var start = Math.max(bars.firstIndex(), end - ${limit} + 1);
          for (var i = start; i <= end; i++) {
            var v = bars.valueAt(i);
            if (v) result.push({ time: v[0], open: v[1], high: v[2], low: v[3], close: v[4], volume: v[5] || 0 });
          }
          return { bars: result, total_bars: bars.size(), source: 'direct_bars' };
        })()
      `);
      if (!data || !data.bars || data.bars.length === 0) {
        throw new Error("Could not extract OHLCV data. The chart may still be loading.");
      }
      if (summary) {
        const bars = data.bars;
        const highs = bars.map((b: any) => b.high);
        const lows = bars.map((b: any) => b.low);
        const volumes = bars.map((b: any) => b.volume);
        const first = bars[0];
        const last = bars[bars.length - 1];
        return {
          bar_count: bars.length,
          period: { from: first.time, to: last.time },
          open: first.open, close: last.close,
          high: Math.max(...highs), low: Math.min(...lows),
          range: roundPrice(Math.max(...highs) - Math.min(...lows)),
          change: roundPrice(last.close - first.open),
          change_pct: Math.round(((last.close - first.open) / first.open) * 10000) / 100 + "%",
          avg_volume: Math.round(volumes.reduce((a: number, b: number) => a + b, 0) / volumes.length),
          last_5_bars: bars.slice(-5),
        };
      }
      return { bar_count: data.bars.length, total_available: data.total_bars, source: data.source, bars: data.bars };
    },
  },

  // ── tv_data_get_quote ────────────────────────────────────────────────────
  {
    name: "tv_data_get_quote",
    description: "Get a real-time quote for the current chart symbol (or a specific symbol). Temporarily switches symbol if specified, then restores it. Returns last price, bid, ask, open, high, low, volume.",
    parameters: z.object({
      symbol: z.string().optional().describe("Symbol to get a quote for (optional — defaults to current chart symbol)"),
    }),
    execute: async ({ symbol }: { symbol?: string }) => {
      const run = async () => {
        const data = await evaluate(`
          (function() {
            var api = ${CHART_API};
            var sym = ''; try { sym = api.symbol(); } catch(e) { try { sym = api.symbolExt().symbol; } catch(e2) {} }
            var ext = {}; try { ext = api.symbolExt() || {}; } catch(e) {}
            var bars = ${BARS_PATH};
            var quote = { symbol: sym };
            if (bars && typeof bars.lastIndex === 'function') {
              var last = bars.valueAt(bars.lastIndex());
              if (last) { quote.time = last[0]; quote.open = last[1]; quote.high = last[2]; quote.low = last[3]; quote.close = last[4]; quote.last = last[4]; quote.volume = last[5] || 0; }
            }
            try {
              var bidEl = document.querySelector('[class*="bid"] [class*="price"], [class*="dom-"] [class*="bid"]');
              var askEl = document.querySelector('[class*="ask"] [class*="price"], [class*="dom-"] [class*="ask"]');
              if (bidEl) quote.bid = parseFloat(bidEl.textContent.replace(/[^0-9.\\-]/g, ''));
              if (askEl) quote.ask = parseFloat(askEl.textContent.replace(/[^0-9.\\-]/g, ''));
            } catch(e) {}
            try {
              var hdr = document.querySelector('[class*="headerRow"] [class*="last-"]');
              if (hdr) { var hp = parseFloat(hdr.textContent.replace(/[^0-9.\\-]/g, '')); if (!isNaN(hp)) quote.header_price = hp; }
            } catch(e) {}
            if (ext.description) quote.description = ext.description;
            if (ext.exchange) quote.exchange = ext.exchange;
            if (ext.type) quote.type = ext.type;
            return quote;
          })()
        `);
        return data;
      };

      if (symbol) {
        // Get current symbol, switch, read, restore
        const original = (await evaluate(`${CHART_API}.symbol()`)) ?? "";
        const bare = (s: string) => s.toString().split(":").pop()?.toUpperCase() ?? "";
        if (bare(original) !== bare(symbol)) {
          await evaluateAsync(`
            (function() { var chart = ${CHART_API}; return new Promise(function(r) { chart.setSymbol(${safeString(symbol)}, {}); setTimeout(r, 500); }); })()
          `);
          await new Promise(r => setTimeout(r, 1500));
          const data = await run();
          await evaluateAsync(`
            (function() { var chart = ${CHART_API}; return new Promise(function(r) { chart.setSymbol(${safeString(original)}, {}); setTimeout(r, 500); }); })()
          `);
          await new Promise(r => setTimeout(r, 1000));
          return { success: true, ...data };
        }
      }
      const data = await run();
      if (!data || (!data.last && !data.close)) throw new Error("Could not retrieve quote.");
      return { success: true, ...data };
    },
  },

  // ── tv_data_get_depth ────────────────────────────────────────────────────
  {
    name: "tv_data_get_depth",
    description: "Read the Depth of Market (DOM) / order book from TradingView if visible. Returns bid and ask levels with sizes, plus spread.",
    parameters: z.object({}),
    execute: async () => {
      const data = await evaluate(`
        (function() {
          var domPanel = document.querySelector('[class*="depth"],[class*="orderBook"],[class*="dom-"],[data-name="dom"]');
          if (!domPanel) return { found: false, error: 'DOM / Depth of Market panel not found.' };
          var bids = [], asks = [];
          var rows = domPanel.querySelectorAll('[class*="row"], tr');
          for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            var priceEl = row.querySelector('[class*="price"]');
            var sizeEl = row.querySelector('[class*="size"],[class*="volume"],[class*="qty"]');
            if (!priceEl) continue;
            var price = parseFloat(priceEl.textContent.replace(/[^0-9.\\-]/g, ''));
            var size = sizeEl ? parseFloat(sizeEl.textContent.replace(/[^0-9.\\-]/g, '')) : 0;
            if (isNaN(price)) continue;
            var rc = (row.className || '') + (row.innerHTML || '');
            if (/bid|buy/i.test(rc)) bids.push({ price, size });
            else if (/ask|sell/i.test(rc)) asks.push({ price, size });
            else if (i < rows.length / 2) asks.push({ price, size });
            else bids.push({ price, size });
          }
          bids.sort(function(a, b) { return b.price - a.price; });
          asks.sort(function(a, b) { return a.price - b.price; });
          var spread = asks.length && bids.length ? +(asks[0].price - bids[0].price).toFixed(6) : null;
          return { found: true, bids: bids.slice(0, 20), asks: asks.slice(0, 20), spread: spread };
        })()
      `);
      if (!data || !data.found) throw new Error(data?.error || "DOM panel not found.");
      return { bid_levels: data.bids?.length || 0, ask_levels: data.asks?.length || 0, spread: data.spread, bids: data.bids, asks: data.asks };
    },
  },

  // ── tv_data_get_indicator_values ─────────────────────────────────────────
  {
    name: "tv_data_get_indicator_values",
    description: "Get all active indicator/study values from the chart. Returns study names, IDs, inputs, and current values for each indicator.",
    parameters: z.object({}),
    execute: async () => {
      const data = await evaluate(`
        (function() {
          var chart = ${CHART_API}._chartWidget;
          var model = chart.model();
          var sources = model.model().dataSources();
          var results = [];
          for (var si = 0; si < sources.length; si++) {
            var s = sources[si]; if (!s.metaInfo) continue;
            try {
              var meta = s.metaInfo();
              var name = meta.description || meta.shortDescription || ''; if (!name) continue;
              var values = {};
              try {
                var dwv = s.dataWindowView();
                if (dwv) { var items = dwv.items();
                  for (var i = 0; i < items.length; i++) {
                    var item = items[i];
                    if (item._value && item._value !== '∅' && item._title) values[item._title] = item._value;
                  }
                }
              } catch(e) {}
              var id = null; try { id = s.id ? s.id() : null; } catch(e) {}
              var inputs = null; try { var ip = s.inputs ? s.inputs() : null; if (ip && Object.keys(ip).length) inputs = ip; } catch(e) {}
              if (Object.keys(values).length > 0) results.push({ id, name, inputs, values });
            } catch(e) {}
          }
          return results;
        })()
      `);
      return { study_count: (data || []).length, studies: data || [] };
    },
  },

  // ── tv_data_get_pine_lines ───────────────────────────────────────────────
  {
    name: "tv_data_get_pine_lines",
    description: "Read Pine Script line drawings (hline, line.new) from indicators on the chart. Returns horizontal levels and line details.",
    parameters: z.object({
      study_filter: z.string().optional().describe("Optional study name filter (case-insensitive contains)"),
      verbose: z.boolean().optional().describe("If true, returns full line details (coordinates, style, width, color)"),
    }),
    execute: async ({ study_filter, verbose }: { study_filter?: string; verbose?: boolean }) => {
      const filter = study_filter || "";
      const raw = await evaluate(`
        (function() {
          var chart = ${CHART_API}._chartWidget;
          var model = chart.model();
          var sources = model.model().dataSources();
          var results = [];
          var filter = ${safeString(filter)};
          for (var si = 0; si < sources.length; si++) {
            var s = sources[si]; if (!s.metaInfo) continue;
            try {
              var meta = s.metaInfo(); var name = meta.description || meta.shortDescription || ''; if (!name) continue;
              if (filter && name.indexOf(filter) === -1) continue;
              var g = s._graphics; if (!g || !g._primitivesCollection) continue;
              var outer = g._primitivesCollection.dwglines;
              if (!outer) continue;
              var inner = outer.get('lines'); if (!inner) continue;
              var coll = inner.get(false); if (!coll || !coll._primitivesDataById) continue;
              var items = []; coll._primitivesDataById.forEach(function(v, id) { items.push({id: id, raw: v}); });
              if (items.length) results.push({name: name, count: items.length, items: items});
            } catch(e) {}
          }
          return results;
        })()
      `);
      if (!raw || raw.length === 0) return { study_count: 0, studies: [] };
      const studies = raw.map((s: any) => {
        const hLevels: number[] = [];
        const seen: Record<number, boolean> = {};
        const allLines: any[] = [];
        for (const item of s.items) {
          const v = item.raw; const y1 = roundPrice(v.y1); const y2 = roundPrice(v.y2);
          if (verbose) allLines.push({ id: item.id, y1, y2, x1: v.x1, x2: v.x2, horizontal: v.y1 === v.y2, style: v.st, width: v.w, color: v.ci });
          if (y1 != null && v.y1 === v.y2 && !seen[y1]) { hLevels.push(y1); seen[y1] = true; }
        }
        hLevels.sort((a, b) => b - a);
        const result: any = { name: s.name, total_lines: s.count, horizontal_levels: hLevels };
        if (verbose) result.all_lines = allLines;
        return result;
      });
      return { study_count: studies.length, studies };
    },
  },

  // ── tv_data_get_pine_labels ──────────────────────────────────────────────
  {
    name: "tv_data_get_pine_labels",
    description: "Read Pine Script label drawings (label.new) from indicators on the chart. Returns label text and price.",
    parameters: z.object({
      study_filter: z.string().optional().describe("Optional study name filter"),
      max_labels: z.number().optional().describe("Maximum labels to return (default 50)"),
    }),
    execute: async ({ study_filter, max_labels }: { study_filter?: string; max_labels?: number }) => {
      const filter = study_filter || "";
      const limit = max_labels || 50;
      const raw = await evaluate(buildGraphicsJS("dwglabels", "labels", filter));
      if (!raw || raw.length === 0) return { study_count: 0, studies: [] };
      const studies = raw.map((s: any) => {
        let labels = s.items.map((item: any) => {
          const v = item.raw; return { text: v.t || "", price: roundPrice(v.y) };
        }).filter((l: any) => l.text || l.price != null);
        if (labels.length > limit) labels = labels.slice(-limit);
        return { name: s.name, total_labels: s.count, showing: labels.length, labels };
      });
      return { study_count: studies.length, studies };
    },
  },

  // ── tv_data_get_pine_boxes ───────────────────────────────────────────────
  {
    name: "tv_data_get_pine_boxes",
    description: "Read Pine Script box drawings (box.new) from indicators. Returns price zones (high/low pairs).",
    parameters: z.object({
      study_filter: z.string().optional().describe("Optional study name filter"),
    }),
    execute: async ({ study_filter }: { study_filter?: string }) => {
      const filter = study_filter || "";
      const raw = await evaluate(buildGraphicsJS("dwgboxes", "boxes", filter));
      if (!raw || raw.length === 0) return { study_count: 0, studies: [] };
      const studies = raw.map((s: any) => {
        const zones: any[] = []; const seen: Record<string, boolean> = {};
        for (const item of s.items) {
          const v = item.raw;
          const high = v.y1 != null && v.y2 != null ? roundPrice(Math.max(v.y1, v.y2)) : null;
          const low = v.y1 != null && v.y2 != null ? roundPrice(Math.min(v.y1, v.y2)) : null;
          if (high != null && low != null) { const key = high + ":" + low; if (!seen[key]) { zones.push({ high, low }); seen[key] = true; } }
        }
        zones.sort((a, b) => b.high - a.high);
        return { name: s.name, total_boxes: s.count, zones };
      });
      return { study_count: studies.length, studies };
    },
  },

  // ── tv_data_get_pine_tables ──────────────────────────────────────────────
  {
    name: "tv_data_get_pine_tables",
    description: "Read Pine Script table drawings (table.new) from indicators. Returns formatted table rows.",
    parameters: z.object({
      study_filter: z.string().optional().describe("Optional study name filter"),
    }),
    execute: async ({ study_filter }: { study_filter?: string }) => {
      const filter = study_filter || "";
      const raw = await evaluate(buildGraphicsJS("dwgtablecells", "tableCells", filter));
      if (!raw || raw.length === 0) return { study_count: 0, studies: [] };
      const studies = raw.map((s: any) => {
        const tables: Record<number, any> = {};
        for (const item of s.items) {
          const v = item.raw; const tid = v.tid || 0;
          if (!tables[tid]) tables[tid] = {};
          if (!tables[tid][v.row]) tables[tid][v.row] = {};
          tables[tid][v.row][v.col] = v.t || "";
        }
        const tableList = Object.entries(tables).map(([tid, rows]: any) => {
          const rowNums = Object.keys(rows).map(Number).sort((a, b) => a - b);
          const formatted = rowNums.map((rn: number) => {
            const cols = rows[rn];
            const colNums = Object.keys(cols).map(Number).sort((a, b) => a - b);
            return colNums.map((cn: number) => cols[cn]).filter(Boolean).join(" | ");
          }).filter(Boolean);
          return { rows: formatted };
        });
        return { name: s.name, tables: tableList };
      });
      return { study_count: studies.length, studies };
    },
  },

  // ── tv_data_get_strategy_results ─────────────────────────────────────────
  {
    name: "tv_data_get_strategy_results",
    description: "Get strategy backtest results from the Strategy Tester. Returns metrics: net profit, profit factor, max drawdown, total trades, win rate, Sharpe ratio, etc.",
    parameters: z.object({}),
    execute: async () => {
      const ready = await evaluate(`
        (function() {
          ${FIND_STRATEGY_JS}
          try {
            var bwb = window.TradingView && window.TradingView.bottomWidgetBar;
            if (bwb && typeof bwb.showWidget === 'function') bwb.showWidget('backtesting');
          } catch(e) {}
          return unhideStrategies();
        })()
      `);
      // Wait for strategy report to compute
      await new Promise(r => setTimeout(r, 2000));
      const results = await evaluate(`
        (function() {
          ${FIND_STRATEGY_JS}
          try {
            var found = findStrategy();
            if (!found) return { metrics: {}, error: 'No strategy found on chart.' };
            var rd = found.report;
            if (!rd || !rd.performance) return { metrics: {}, error: 'Strategy report not computed. Open Strategy Tester panel.' };
            var perf = rd.performance; var all = perf.all || {};
            var metrics = {
              net_profit: all.netProfit, net_profit_percent: all.netProfitPercent,
              gross_profit: all.grossProfit, gross_loss: all.grossLoss,
              profit_factor: all.profitFactor, max_drawdown: perf.maxStrategyDrawDown,
              max_drawdown_percent: perf.maxStrategyDrawDownPercent,
              total_trades: (all.numberOfWiningTrades||0) + (all.numberOfLosingTrades||0),
              winning_trades: all.numberOfWiningTrades, losing_trades: all.numberOfLosingTrades,
              percent_profitable: all.percentProfitable, avg_trade: all.avgTrade,
              sharpe_ratio: perf.sharpeRatio, sortino_ratio: perf.sortinoRatio,
            };
            var clean = {};
            for (var k in metrics) { if (metrics[k] !== null && metrics[k] !== undefined) clean[k] = metrics[k]; }
            return { metrics: clean, strategy: found.name, currency: rd.currency || null };
          } catch(e) { return { metrics: {}, error: e.message }; }
        })()
      `);
      return {
        success: Object.keys(results?.metrics || {}).length > 0,
        strategy: results?.strategy, currency: results?.currency,
        metrics: results?.metrics || {}, error: results?.error,
      };
    },
  },

  // ── tv_data_get_trades ───────────────────────────────────────────────────
  {
    name: "tv_data_get_trades",
    description: "Get individual trade list from the strategy backtest results. Returns entry/exit prices, side, P&L.",
    parameters: z.object({
      max_trades: z.number().optional().describe("Max trades to return (default 20)"),
    }),
    execute: async ({ max_trades }: { max_trades?: number }) => {
      const limit = Math.min(max_trades || 20, 100);
      await new Promise(r => setTimeout(r, 1000));
      const trades = await evaluate(`
        (function() {
          ${FIND_STRATEGY_JS}
          try {
            var found = findStrategy();
            if (!found) return { error: 'No strategy found on chart.' };
            var orders = found.strat.ordersData();
            if (orders && typeof orders.value === 'function') orders = orders.value();
            if (!orders || !Array.isArray(orders)) return { error: 'Orders not computed. Open Strategy Tester.' };
            var total = orders.length;
            var start = Math.max(0, total - ${limit});
            var result = [];
            for (var t = start; t < total; t++) {
              var o = orders[t];
              if (typeof o === 'object' && o !== null) {
                result.push({ id: o.id, type: o.tp, side: o.b ? 'buy' : 'sell', entry: o.e, price: o.p, qty: o.q, time_index: o.tm });
              }
            }
            return { trades: result, total_orders: total };
          } catch(e) { return { error: e.message }; }
        })()
      `);
      return { trade_count: trades?.trades?.length || 0, total_orders: trades?.total_orders ?? 0, trades: trades?.trades || [], error: trades?.error };
    },
  },

  // ── tv_data_get_equity ───────────────────────────────────────────────────
  {
    name: "tv_data_get_equity",
    description: "Get the equity curve data from the strategy backtest. Returns per-bar equity values.",
    parameters: z.object({}),
    execute: async () => {
      await new Promise(r => setTimeout(r, 1000));
      const equity = await evaluate(`
        (function() {
          ${FIND_STRATEGY_JS}
          try {
            var found = findStrategy();
            if (!found) return { error: 'No strategy found.' };
            var rd = found.report;
            if (!rd) return { error: 'Report not computed.' };
            var curve = rd.equity || rd.equityChart || null;
            if (Array.isArray(curve)) return { data: curve, points: curve.length };
            if (Array.isArray(rd.buyHold)) return { buy_hold_points: rd.buyHold.length, note: 'Per-bar equity not exposed; buyHold baseline has ' + rd.buyHold.length + ' points.' };
            return { note: 'Equity curve not available via internal API.' };
          } catch(e) { return { error: e.message }; }
        })()
      `);
      return { data_points: equity?.data?.length || 0, data: equity?.data || [], note: equity?.note, error: equity?.error };
    },
  },
];

// ─── Shared helpers ──────────────────────────────────────────────────────

const FIND_STRATEGY_JS = `
  function _reportOf(s) {
    try { var rd = s.reportData(); if (rd && typeof rd.value === 'function') rd = rd.value(); return rd; } catch(e) { return null; }
  }
  function findStrategies() {
    var chart = ${CHART_API}._chartWidget;
    var sources = chart.model().model().dataSources();
    var strategies = [];
    for (var i = 0; i < sources.length; i++) {
      var s = sources[i], mi = null;
      try { mi = s.metaInfo ? s.metaInfo() : null; } catch(e) {}
      var isStrat = mi && (mi.isTVScriptStrategy || mi.is_strategy);
      if ((isStrat || typeof s.reportData === 'function') && typeof s.reportData === 'function') strategies.push({ s, name: mi ? mi.description : null });
    }
    return strategies;
  }
  function findStrategy() {
    var strategies = findStrategies();
    for (var j = 0; j < strategies.length; j++) { var rd = _reportOf(strategies[j].s); if (rd && rd.performance) return { strat: strategies[j].s, report: rd, name: strategies[j].name, strategy_count: strategies.length }; }
    if (strategies.length) return { strat: strategies[0].s, report: null, name: strategies[0].name, strategy_count: strategies.length };
    return null;
  }
  function unhideStrategies() {
    var unhidden = [];
    var strategies = findStrategies();
    for (var i = 0; i < strategies.length; i++) {
      try { var vis = null; try { vis = strategies[i].s.properties().visible.value(); } catch(e) {} if (vis !== false) continue; try { strategies[i].s.properties().visible.setValue(true); unhidden.push(strategies[i].name || 'strategy'); } catch(e) { try { var st = ${CHART_API}.getStudyById(strategies[i].s.id()); if (st) { st.setVisible(true); unhidden.push(strategies[i].name || 'strategy'); } } catch(e2) {} } }
    } catch(e) {}
    return unhidden;
  }
`;

function buildGraphicsJS(collectionName: string, mapKey: string, filter: string): string {
  return `
    (function() {
      var chart = ${CHART_API}._chartWidget;
      var model = chart.model();
      var sources = model.model().dataSources();
      var results = [];
      var filter = ${safeString(filter || '')};
      for (var si = 0; si < sources.length; si++) {
        var s = sources[si]; if (!s.metaInfo) continue;
        try {
          var meta = s.metaInfo();
          var name = meta.description || meta.shortDescription || '';
          if (!name) continue;
          if (filter && name.indexOf(filter) === -1) continue;
          var g = s._graphics;
          if (!g || !g._primitivesCollection) continue;
          var pc = g._primitivesCollection;
          var items = [];
          try {
            var outer = pc.${collectionName};
            if (outer) {
              var inner = outer.get('${mapKey}');
              if (inner) {
                var coll = inner.get(false);
                if (coll && coll._primitivesDataById && coll._primitivesDataById.size > 0) {
                  coll._primitivesDataById.forEach(function(v, id) { items.push({id: id, raw: v}); });
                }
              }
            }
          } catch(e) {}
          if (items.length === 0 && '${collectionName}' === 'dwgtablecells') {
            try {
              var tcOuter = pc.dwgtablecells;
              if (tcOuter) { var tcColl = tcOuter.get('tableCells');
                if (tcColl && tcColl._primitivesDataById) tcColl._primitivesDataById.forEach(function(v, id) { items.push({id: id, raw: v}); });
              }
            } catch(e) {}
          }
          if (items.length > 0) results.push({name, count: items.length, items});
        } catch(e) {}
      }
      return results;
    })()
  `;
}
