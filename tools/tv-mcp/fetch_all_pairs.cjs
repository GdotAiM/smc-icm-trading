// Batch fetch all primary pairs × all timeframes from TradingView CDP
const CDP = require("chrome-remote-interface");
const fs = require("fs");
const path = require("path");

const ROOT = "C:\\Users\\cash\\smc-icm-trading";
const DATE = "2026-07-29";
const PAIRS = ["EURUSD", "GBPUSD", "XAUUSD", "NAS100", "DXY"];

const TFS = [
  { label: "1d", resolution: "1D", wait: 3000 },
  { label: "4h", resolution: "240", wait: 2500 },
  { label: "1h", resolution: "60", wait: 2000 },
  { label: "15m", resolution: "15", wait: 2000 },
  { label: "5m", resolution: "5", wait: 2000 },
  { label: "1m", resolution: "1", wait: 1500 },
];

async function evalExpr(client, expr) {
  const r = await client.Runtime.evaluate({ expression: expr, returnByValue: true });
  try { return JSON.parse(r.result.value); } catch { return r.result.value; }
}

async function fetchTF(client, symbol, resolution, tfLabel, waitMs) {
  await evalExpr(client, `(function() {
    window.TradingViewApi._activeChartWidgetWV.value().setResolution("${resolution}");
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, waitMs));

  const data = await evalExpr(client, `(function() {
    try {
      var api = window.TradingViewApi._activeChartWidgetWV.value();
      var bars = api._chartWidget.model().mainSeries().bars();
      var end = bars.lastIndex();
      var start = Math.max(bars.firstIndex(), end - 400 + 1);
      var candles = [];
      for (var i = start; i <= end; i++) {
        var v = bars.valueAt(i);
        if (v && v.length >= 6) candles.push({
          time: v[0]*1000, open: v[1], high: v[2], low: v[3], close: v[4], volume: v[5]||0
        });
      }
      return JSON.stringify({ tf: "${tfLabel}", count: candles.length, candles: candles });
    } catch(e) { return JSON.stringify({ error: e.message }); }
  })()`);

  return data;
}

(async () => {
  const resp = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await resp.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!chart) { console.error("No chart tab found"); process.exit(1); }

  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();
  console.error("Connected to TV chart");

  for (const pair of PAIRS) {
    console.error(`\n=== ${pair} ===`);
    const pairDir = path.join(ROOT, "shared", DATE, pair);
    fs.mkdirSync(pairDir, { recursive: true });

    // Switch symbol
    await evalExpr(client, `(function() {
      window.TradingViewApi._activeChartWidgetWV.value().setSymbol("${pair}", {});
      return "ok";
    })()`);
    await new Promise(r => setTimeout(r, 3500));
    console.error(`  Symbol set to ${pair}`);

    for (const tf of TFS) {
      process.stderr.write(`  ${tf.label}... `);
      const result = await fetchTF(client, pair, tf.resolution, tf.label, tf.wait);
      const count = result.count || 0;
      console.error(`${count} candles`);

      // Save to shared directory
      const outPath = path.join(pairDir, `candles_${tf.label}.json`);
      fs.writeFileSync(outPath, JSON.stringify(result.candles || [], null, 2));
    }
  }

  await client.close();
  console.error("\nDone! All pairs fetched.");
})();
