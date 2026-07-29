// Quick fix: fetch DXY with correct TradingView symbol
const CDP = require("chrome-remote-interface");
const fs = require("fs");
const path = require("path");

const ROOT = "C:\\Users\\cash\\smc-icm-trading";
const DATE = "2026-07-29";
const DXY_SYMBOLS = ["TVC:DXY", "USDOLLAR", "DX1!", "DX-Y.NYB"];

async function evalExpr(client, expr) {
  const r = await client.Runtime.evaluate({ expression: expr, returnByValue: true });
  try { return JSON.parse(r.result.value); } catch { return r.result.value; }
}

(async () => {
  const resp = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await resp.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!chart) { console.error("No chart tab found"); process.exit(1); }

  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();

  for (const symbol of DXY_SYMBOLS) {
    console.error(`Trying ${symbol}...`);
    await evalExpr(client, `(function() {
      window.TradingViewApi._activeChartWidgetWV.value().setSymbol("${symbol}", {});
      return "ok";
    })()`);
    await new Promise(r => setTimeout(r, 3000));

    // Try 1D first
    await evalExpr(client, `(function() {
      window.TradingViewApi._activeChartWidgetWV.value().setResolution("1D");
      return "ok";
    })()`);
    await new Promise(r => setTimeout(r, 2500));

    const data = await evalExpr(client, `(function() {
      try {
        var api = window.TradingViewApi._activeChartWidgetWV.value();
        var bars = api._chartWidget.model().mainSeries().bars();
        var end = bars.lastIndex();
        var start = Math.max(bars.firstIndex(), end - 90 + 1);
        var candles = [];
        for (var i = start; i <= end; i++) {
          var v = bars.valueAt(i);
          if (v && v.length >= 6) candles.push({
            time: v[0]*1000, open: v[1], high: v[2], low: v[3], close: v[4], volume: v[5]||0
          });
        }
        return JSON.stringify({ symbol: "${symbol}", count: candles.length, last: candles[candles.length-1] });
      } catch(e) { return JSON.stringify({ error: e.message }); }
    })()`);

    if (data.count > 0) {
      console.error(`  ✓ ${symbol}: ${data.count} candles, last close: ${data.last?.close}`);
      // Now fetch all timeframes properly
      const TFS = [
        { label: "1d", resolution: "1D", wait: 3000 },
        { label: "4h", resolution: "240", wait: 2500 },
        { label: "1h", resolution: "60", wait: 2000 },
        { label: "15m", resolution: "15", wait: 2000 },
        { label: "5m", resolution: "5", wait: 2000 },
        { label: "1m", resolution: "1", wait: 1500 },
      ];

      const pairDir = path.join(ROOT, "shared", DATE, "DXY");
      fs.mkdirSync(pairDir, { recursive: true });

      for (const tf of TFS) {
        process.stderr.write(`  ${tf.label}... `);
        await evalExpr(client, `(function() {
          window.TradingViewApi._activeChartWidgetWV.value().setResolution("${tf.resolution}");
          return "ok";
        })()`);
        await new Promise(r => setTimeout(r, tf.wait));

        const tfData = await evalExpr(client, `(function() {
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
            return JSON.stringify({ count: candles.length, candles: candles });
          } catch(e) { return JSON.stringify({ error: e.message }); }
        })()`);
        console.error(`${tfData.count} candles`);
        fs.writeFileSync(path.join(pairDir, `candles_${tf.label}.json`), JSON.stringify(tfData.candles || [], null, 2));
      }
      await client.close();
      console.error(`\nDXY fetched as ${symbol}`);
      process.exit(0);
    } else {
      console.error(`  ✗ ${symbol}: no data`);
    }
  }

  console.error("No working DXY symbol found");
  await client.close();
  process.exit(1);
})();
