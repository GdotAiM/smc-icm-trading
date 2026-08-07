// Live Structure Check — reads current forming candle from TV and projects structure
// Usage: node tools/tv-mcp/check_live_structure.cjs --pair GOLD --tf 4h
// Output: { confirmed: "bearish BOS", provisional: "bearish CHoCH", formingCandle: {...} }

const CDP = require("chrome-remote-interface");
const fs = require("fs");
const path = require("path");

// Broker-prefixed TV symbols — plain names resolve to wrong instruments
const TV_SYMBOLS = {
  GBPUSD: "OANDA:GBPUSD", EURUSD: "OANDA:EURUSD",
  GOLD: "OANDA:XAUUSD", XAUUSD: "OANDA:XAUUSD",
  DXY: "FX:USDOLLAR", NAS100: "CAPITALCOM:NAS100",
};
const TV_RESOLUTIONS = { "1m":"1","5m":"5","15m":"15","1h":"60","4h":"240","1d":"1D","1w":"1W" };

const ROOT = path.join(__dirname, "..", "..");

function parseArgs() {
  const args = {};
  const raw = process.argv.slice(2);
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].startsWith("--")) {
      const key = raw[i].slice(2);
      args[key] = raw[i+1] && !raw[i+1].startsWith("--") ? raw[++i] : "true";
    }
  }
  return args;
}

const a = parseArgs();
const PAIR = (a.pair || "GBPUSD").toUpperCase();
const TF = a.tf || "4h";
const DATE = a.date || new Date().toISOString().split("T")[0];

async function evalExpr(client, expr) {
  const r = await client.Runtime.evaluate({ expression: expr, returnByValue: true });
  try { return JSON.parse(r.result.value); } catch { return r.result.value; }
}

(async () => {
  const resp = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await resp.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!chart) { console.log(JSON.stringify({ error: "No chart" })); process.exit(1); }

  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();

  const symbol = TV_SYMBOLS[PAIR] || PAIR;
  const resolution = TV_RESOLUTIONS[TF] || "5";

  await evalExpr(client, `(function() {
    var chart = window.TradingViewApi._activeChartWidgetWV.value();
    chart.setSymbol("${symbol}", {});
    chart.setResolution("${resolution}");
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 4000));

  // Get the current forming candle
  const liveResult = await evalExpr(client, `
    (function() {
      try {
        var chart = window.TradingViewApi._activeChartWidgetWV.value();
        var model = chart._chartWidget.model();
        var mainSeries = model.mainSeries();
        var bars = mainSeries.bars();
        var lastIdx = bars.lastIndex();
        var bar = bars.valueAt(lastIdx);
        return JSON.stringify({
          time: bar[0] * 1000,
          open: bar[1],
          high: bar[2],
          low: bar[3],
          close: bar[4],
          volume: bar[5] || 0
        });
      } catch(e) { return JSON.stringify({ error: e.message }); }
    })()
  `);

  const formingCandle = liveResult.error ? null : liveResult;
  if (!formingCandle) { console.log(JSON.stringify({ error: "Could not read forming candle" })); process.exit(1); }

  // Load the engine data for this TF
  const engineFile = path.join(ROOT, "shared", DATE, PAIR, `engine_${TF.toLowerCase()}.json`);
  if (!fs.existsSync(engineFile)) { console.log(JSON.stringify({ error: "No engine data — run pipeline first" })); process.exit(1); }

  const engine = JSON.parse(fs.readFileSync(engineFile, "utf8"));
  const confirmedBias = engine.structure.bias;
  const confirmedEvent = engine.structure.lastEvent;
  const lastSwingHigh = engine.structure.lastSwingHigh;
  const lastSwingLow = engine.structure.lastSwingLow;

  // Project: what would the structure be if the current candle closes here?
  let provisionalBias = confirmedBias;
  let provisionalEvent = confirmedEvent;
  let provisionalTrigger = null;

  // PROVISIONAL CHECK — wick breaches (no close confirmation needed for live warning)
  if (confirmedBias === "bullish") {
    if (formingCandle.low < lastSwingLow) {
      if (formingCandle.close < lastSwingLow) {
        provisionalBias = "bearish";
        provisionalEvent = "CHoCH";
        provisionalTrigger = `CLOSE-CONFIRMED: Candle closed ${formingCandle.close.toFixed(2)} below swing low ${lastSwingLow.toFixed(2)} → bearish CHoCH`;
      } else {
        provisionalTrigger = `WICK BREACH: Candle wicked to ${formingCandle.low.toFixed(2)} below swing low ${lastSwingLow.toFixed(2)} but closed above at ${formingCandle.close.toFixed(2)}. Bearish CHoCH PENDING — wait for candle close.`;
      }
    }
  } else if (confirmedBias === "bearish") {
    if (formingCandle.high > lastSwingHigh) {
      if (formingCandle.close > lastSwingHigh) {
        provisionalBias = "bullish";
        provisionalEvent = "CHoCH";
        provisionalTrigger = `CLOSE-CONFIRMED: Candle closed ${formingCandle.close.toFixed(2)} above swing high ${lastSwingHigh.toFixed(2)} → bullish CHoCH`;
      } else {
        provisionalTrigger = `WICK BREACH: Candle wicked to ${formingCandle.high.toFixed(2)} above swing high ${lastSwingHigh.toFixed(2)} but closed below at ${formingCandle.close.toFixed(2)}. Bullish CHoCH PENDING — wait for candle close.`;
      }
    }
    if (formingCandle.low < lastSwingLow) {
      if (formingCandle.close < lastSwingLow) {
        provisionalEvent = "BOS";
        provisionalTrigger = `CLOSE-CONFIRMED: Candle closed ${formingCandle.close.toFixed(2)} below swing low ${lastSwingLow.toFixed(2)} → bearish BOS continuation`;
      } else {
        provisionalTrigger = (provisionalTrigger || "") + ` WICK BREACH: Candle wicked to ${formingCandle.low.toFixed(2)} below swing low ${lastSwingLow.toFixed(2)}. Bearish BOS PENDING — wait for close.`;
      }
    }
  }

  const structureChanged = provisionalBias !== confirmedBias || provisionalEvent !== confirmedEvent;

  const result = {
    pair: PAIR,
    tf: TF,
    checked: new Date().toISOString(),
    confirmed: { bias: confirmedBias, event: confirmedEvent, lastSwingHigh, lastSwingLow },
    formingCandle: {
      time: formingCandle.time,
      open: formingCandle.open,
      high: formingCandle.high,
      low: formingCandle.low,
      close: formingCandle.close,
      isComplete: false
    },
    provisional: { bias: provisionalBias, event: provisionalEvent, trigger: provisionalTrigger },
    structureChanged,
    warning: structureChanged
      ? `LIVE STRUCTURE CHANGE: Engine says ${confirmedBias} ${confirmedEvent} based on closed candles, but current forming candle suggests ${provisionalBias} ${provisionalEvent}. Confirm on chart.`
      : `Structure consistent: ${confirmedBias} ${confirmedEvent} holds on live data.`
  };

  await client.close();
  console.log(JSON.stringify(result, null, 2));
})();
