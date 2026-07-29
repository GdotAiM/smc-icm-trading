const CDP = require("chrome-remote-interface");

async function evalExpr(client, expr) {
  const r = await client.Runtime.evaluate({ expression: expr, returnByValue: true });
  try { return JSON.parse(r.result.value); } catch { return r.result.value; }
}

(async () => {
  const resp = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await resp.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!chart) {
    console.log(JSON.stringify({ error: "No chart tab found" }));
    process.exit(1);
  }
  console.error(`Connected: ${chart.title}`);

  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();

  // Step 1: Switch to EURUSD 4H — use the exact API from chart.ts
  let r = await evalExpr(client, `
    (function() {
      try {
        var chart = window.TradingViewApi._activeChartWidgetWV.value();
        chart.setSymbol("EURUSD", {});
        return JSON.stringify({ status: "switched to EURUSD" });
      } catch(e) { return JSON.stringify({ error: e.message }); }
    })()
  `);
  console.error("Switch:", JSON.stringify(r));
  console.error("Waiting for data load...");
  await new Promise(r => setTimeout(r, 3000));

  // Step 2: Set 4H timeframe
  r = await evalExpr(client, `
    (function() {
      try {
        var chart = window.TradingViewApi._activeChartWidgetWV.value();
        chart.setResolution("240");
        return JSON.stringify({ status: "set 4H" });
      } catch(e) { return JSON.stringify({ error: e.message }); }
    })()
  `);
  console.error("TF:", JSON.stringify(r));
  await new Promise(r => setTimeout(r, 2000));

  // Step 3 & 4: Extract OHLCV — bars are arrays [time, open, high, low, close, volume]
  r = await evalExpr(client, `
    (function() {
      try {
        var api = window.TradingViewApi._activeChartWidgetWV.value();
        var bars = api._chartWidget.model().mainSeries().bars();
        var end = bars.lastIndex();
        var start = Math.max(bars.firstIndex(), end - 400 + 1);
        var candles = [];
        for (var i = start; i <= end; i++) {
          var v = bars.valueAt(i);
          if (v && v.length >= 6) candles.push({
            time: v[0] * 1000,
            open: v[1],
            high: v[2],
            low: v[3],
            close: v[4],
            volume: v[5] || 0
          });
        }
        return JSON.stringify({ symbol: "EURUSD", tf: "4h", count: candles.length, first: candles[0], last: candles[candles.length-1], candles: candles });
      } catch(e) { return JSON.stringify({ error: e.message }); }
    })()
  `);
  const result = JSON.parse(JSON.stringify(r));
  console.log(JSON.stringify({ symbol: "EURUSD", tf: "4h", count: result.count, first: result.first, last: result.last, candles: result.candles }));
  await client.close();
})();
