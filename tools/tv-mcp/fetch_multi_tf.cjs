const CDP = require("chrome-remote-interface");

async function evalExpr(client, expr) {
  const r = await client.Runtime.evaluate({ expression: expr, returnByValue: true });
  try { return JSON.parse(r.result.value); } catch { return r.result.value; }
}

async function fetchTF(client, symbol, resolution, label) {
  // Switch
  await evalExpr(client, `(function() {
    var c = window.TradingViewApi._activeChartWidgetWV.value();
    c.setSymbol("${symbol}", {}); return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 2000));
  await evalExpr(client, `(function() {
    var c = window.TradingViewApi._activeChartWidgetWV.value();
    c.setResolution("${resolution}"); return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 2000));

  // Extract
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
      return JSON.stringify({ symbol: "${symbol}", tf: "${label}", count: candles.length, candles: candles });
    } catch(e) { return JSON.stringify({ error: e.message }); }
  })()`);
  console.error(`  ${label}: ${data.count || data.error} candles`);
  return data;
}

(async () => {
  const resp = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await resp.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!chart) { console.log(JSON.stringify({error:"No chart"})); process.exit(1); }

  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();

  console.error("Fetching multi-TF EURUSD data from TradingView...");
  const daily = await fetchTF(client, "EURUSD", "1D", "1d");
  const h4 = await fetchTF(client, "EURUSD", "240", "4h");
  const h1 = await fetchTF(client, "EURUSD", "60", "1h");

  console.log(JSON.stringify({ daily, h4, h1 }));
  await client.close();
})();
