const CDP = require("chrome-remote-interface");

async function evalExpr(client, expr) {
  const r = await client.Runtime.evaluate({ expression: expr, returnByValue: true });
  try { return JSON.parse(r.result.value); } catch { return r.result.value; }
}

const TFS = [
  { label: "1W", resolution: "1W", wait: 3000 },
  { label: "1D", resolution: "1D", wait: 2500 },
  { label: "4H", resolution: "240", wait: 2500 },
  { label: "1H", resolution: "60", wait: 2000 },
  { label: "15m", resolution: "15", wait: 2000 },
  { label: "5m", resolution: "5", wait: 2000 },
  { label: "1m", resolution: "1", wait: 1500 },
];

(async () => {
  const resp = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await resp.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!chart) { console.log(JSON.stringify({error:"No chart"})); process.exit(1); }

  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();

  // Set symbol once
  await evalExpr(client, `(function() {
    window.TradingViewApi._activeChartWidgetWV.value().setSymbol("EURUSD", {});
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 3000));
  console.error("Symbol set to EURUSD");

  const results = {};
  for (const tf of TFS) {
    console.error(`Fetching ${tf.label}...`);
    await evalExpr(client, `(function() {
      window.TradingViewApi._activeChartWidgetWV.value().setResolution("${tf.resolution}");
      return "ok";
    })()`);
    await new Promise(r => setTimeout(r, tf.wait));

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
        return JSON.stringify({ tf: "${tf.label}", count: candles.length, candles: candles });
      } catch(e) { return JSON.stringify({ error: e.message }); }
    })()`);
    results[tf.label] = data;
    console.error(`  ${tf.label}: ${data.count || data.error} candles`);
  }

  console.log(JSON.stringify(results));
  await client.close();
})();
