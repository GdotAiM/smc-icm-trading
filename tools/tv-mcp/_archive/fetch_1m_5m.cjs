const CDP = require("chrome-remote-interface");
const fs = require("fs");
const path = require("path");

async function evalExpr(client, expr) {
  const r = await client.Runtime.evaluate({ expression: expr, returnByValue: true });
  try { return JSON.parse(r.result.value); } catch { return r.result.value; }
}

(async () => {
  const resp = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await resp.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!chart) { console.log("No chart"); process.exit(1); }
  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();

  // Switch to GBPUSD
  await evalExpr(client, '(function() { window.TradingViewApi._activeChartWidgetWV.value().setSymbol("GBPUSD", {}); return "ok"; })()');
  await new Promise(r => setTimeout(r, 3000));

  for (const tf of ["5m", "1m"]) {
    const res = tf === "1m" ? "1" : "5";
    await evalExpr(client, `(function() { window.TradingViewApi._activeChartWidgetWV.value().setResolution("${res}"); return "ok"; })()`);
    await new Promise(r => setTimeout(r, 2000));

    const data = await evalExpr(client, `(function() {
      try {
        var api = window.TradingViewApi._activeChartWidgetWV.value();
        var bars = api._chartWidget.model().mainSeries().bars();
        var end = bars.lastIndex();
        var start = Math.max(bars.firstIndex(), end - 400 + 1);
        var candles = [];
        for (var i = start; i <= end; i++) {
          var v = bars.valueAt(i);
          if (v && v.length >= 6) candles.push({ time: v[0]*1000, open: v[1], high: v[2], low: v[3], close: v[4], volume: v[5]||0 });
        }
        return JSON.stringify({ tf: "${tf}", count: candles.length, candles: candles });
      } catch(e) { return JSON.stringify({ error: e.message }); }
    })()`);

    const outFile = path.join(process.env.TEMP || "/tmp", `GBPUSD_${tf}.json`);
    fs.writeFileSync(outFile, JSON.stringify(data.candles), "utf8");
    console.error(`${tf}: ${data.count} candles`);
  }

  await client.close();
  console.log(JSON.stringify({status:"ok"}));
})();
