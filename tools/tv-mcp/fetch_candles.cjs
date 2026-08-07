// TV Candle Fetcher — pulls OHLCV data from TradingView via CDP
// Usage: node tools/tv-mcp/fetch_candles.cjs --pair GBPUSD --tf 5m --output candles.json
//        node tools/tv-mcp/fetch_candles.cjs --pair GOLD --all-tfs --output-dir shared/2026-07-28/GOLD/

const CDP = require("chrome-remote-interface");
const fs = require("fs");
const path = require("path");

// ── Config ────────────────────────────────────────────
// Broker-prefixed TV symbols — plain names resolve to wrong instruments
const TV_SYMBOLS = {
  GBPUSD: "OANDA:GBPUSD", EURUSD: "OANDA:EURUSD", USDJPY: "OANDA:USDJPY",
  AUDUSD: "OANDA:AUDUSD", USDCAD: "OANDA:USDCAD", NZDUSD: "OANDA:NZDUSD",
  GOLD: "OANDA:XAUUSD", XAUUSD: "OANDA:XAUUSD",
  DXY: "FX:USDOLLAR", NAS100: "CAPITALCOM:NAS100",
};
const TV_RESOLUTIONS = {
  "1m": "1", "5m": "5", "15m": "15", "1h": "60",
  "4h": "240", "1d": "1D", "1w": "1W",
};

// ── Parse Args ────────────────────────────────────────
function parseArgs() {
  const args = {};
  const raw = process.argv.slice(2);
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].startsWith("--")) {
      const key = raw[i].slice(2);
      const val = raw[i + 1] && !raw[i + 1].startsWith("--") ? raw[++i] : "true";
      args[key] = val;
    }
  }
  return args;
}

const args = parseArgs();
const PAIR = (args.pair || "GBPUSD").toUpperCase();
const TF = args.tf || "5m";
const ALL_TFS = args["all-tfs"] === "true";
const OUTPUT = args.output || null;
const OUTPUT_DIR = args["output-dir"] || null;
const SILENT = args.silent === "true";
const DEBUG = args.debug === "true";

// TF-aware bar counts — higher TFs get fewer bars to keep structure analysis focused on recent price action
const TF_DEFAULT_BARS = {
  "1m": 400,   // ~6.5 hours of 1m data
  "5m": 400,   // ~33 hours of 5m data
  "15m": 200,  // ~50 hours of 15m data (~2 days)
  "1h": 120,   // ~5 days of 1h data
  "4h": 60,    // ~10 trading days of 4h data — prevents ancient swing contamination
  "1d": 90,    // ~3 months of daily data
  "1w": 52,    // ~1 year of weekly data
};
const BARS = parseInt(args.bars) || TF_DEFAULT_BARS[TF] || 400;

// ── Eval Helper ───────────────────────────────────────
async function evalExpr(client, expr) {
  const r = await client.Runtime.evaluate({ expression: expr, returnByValue: true });
  try { return JSON.parse(r.result.value); } catch { return r.result.value; }
}

// ── Fetch Candles from TV ─────────────────────────────
async function fetchCandles(client, symbol, resolution, barCount) {
  const limit = barCount || BARS;
  // Switch symbol and resolution
  await evalExpr(client, `
    (function() {
      try {
        var chart = window.TradingViewApi._activeChartWidgetWV.value();
        chart.setSymbol("${symbol}", {});
        chart.setResolution("${resolution}");
        return "ok";
      } catch(e) { return "error: " + e.message; }
    })()
  `);
  // Wait for data to load
  await new Promise(r => setTimeout(r, 4000));

  // Extract bar data
  const result = await evalExpr(client, `
    (function() {
      try {
        var chart = window.TradingViewApi._activeChartWidgetWV.value();
        var model = chart._chartWidget.model();
        var mainSeries = model.mainSeries();
        var bars = mainSeries.bars();
        var firstIdx = bars.firstIndex();
        var lastIdx = bars.lastIndex();
        var count = Math.min(${limit}, lastIdx - firstIdx + 1);
        var startIdx = lastIdx - count + 1;

        var candles = [];
        for (var i = startIdx; i <= lastIdx; i++) {
          var bar = bars.valueAt(i);
          if (bar) {
            candles.push({
              time: bar[0] * 1000,   // TV uses seconds, convert to ms
              open: bar[1],
              high: bar[2],
              low: bar[3],
              close: bar[4],
              volume: bar[5] || 0
            });
          }
        }
        return JSON.stringify({ count: candles.length, candles: candles });
      } catch(e) { return JSON.stringify({ error: e.message }); }
    })()
  `);

  if (result.error) throw new Error(result.error);
  return result.candles || [];
}

// ── Main ──────────────────────────────────────────────
(async () => {
  const resp = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await resp.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!chart) { console.log(JSON.stringify({ error: "No TradingView chart tab found" })); process.exit(1); }

  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();

  const TV_SYMBOL = TV_SYMBOLS[PAIR] || PAIR;
  const TFS = ALL_TFS ? ["1m", "5m", "15m", "1h", "4h", "1d"] : [TF];

  const results = { pair: PAIR, fetched: new Date().toISOString(), timeframes: {} };

  for (const tf of TFS) {
    const res = TV_RESOLUTIONS[tf] || "5";
    const tfBars = TF_DEFAULT_BARS[tf] || 400;
    try {
      const candles = await fetchCandles(client, TV_SYMBOL, res, tfBars);
      results.timeframes[tf] = { count: candles.length, last: candles[candles.length - 1] };

      // Save to file
      if (OUTPUT_DIR) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        const filePath = path.join(OUTPUT_DIR, `candles_${tf}.json`);
        fs.writeFileSync(filePath, JSON.stringify(candles));
        if (!SILENT) console.error(`${tf}: ${candles.length} candles saved to ${filePath}`);
      } else if (OUTPUT && TFS.length === 1) {
        fs.writeFileSync(OUTPUT, JSON.stringify(candles));
        if (!SILENT) console.error(`${tf}: ${candles.length} candles saved to ${OUTPUT}`);
      } else {
        results.timeframes[tf].candles = candles.slice(-5); // Preview only
      }
    } catch (e) {
      results.timeframes[tf] = { error: e.message };
      if (!SILENT) console.error(`${tf}: ERROR — ${e.message}`);
    }
  }

  await client.close();

  // Output summary
  if (!SILENT) {
    for (const [tf, data] of Object.entries(results.timeframes)) {
      if (data.last) {
        console.error(`${PAIR}/${tf}: ${data.count} candles, last=${data.last.close}`);
      }
    }
  }

  // JSON result to stdout for piping
  console.log(JSON.stringify(results));
})();
