const CDP = require("chrome-remote-interface");

(async () => {
  const r = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await r.json();

  console.log("=== TradingView Tabs ===");
  targets.filter(t => t.type === "page").forEach(t => {
    const isChart = /tradingview\.com\/chart/i.test(t.url || "");
    console.log(`  ${isChart ? "📊" : "📄"} ${t.title.slice(0, 60)} | ${(t.url || "").slice(0, 80)}`);
  });

  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!chart) {
    console.log("\n❌ NO CHART TAB FOUND — open a TradingView chart tab first");
    process.exit(1);
  }

  console.log(`\nConnecting to: ${chart.title}`);

  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();

  // Check current chart state
  const state = await client.Runtime.evaluate({
    expression: `(function() {
      try {
        var api = window.TradingViewApi._activeChartWidgetWV.value();
        var cw = api._chartWidget;
        return JSON.stringify({
          symbol: cw._symbol || "unknown",
          interval: cw._interval || "unknown",
          hasShapes: typeof api.removeAllShapes === "function"
        });
      } catch(e) { return JSON.stringify({ error: e.message }); }
    })()`,
    returnByValue: true
  });

  const s = JSON.parse(state.result.value);
  console.log(`Symbol: ${s.symbol} | Interval: ${s.interval} | Shapes API: ${s.hasShapes}`);

  // Count existing drawings
  const shapes = await client.Runtime.evaluate({
    expression: `(function() {
      try {
        var api = window.TradingViewApi._activeChartWidgetWV.value();
        var all = api.getShapes ? api.getShapes() : [];
        return JSON.stringify({ count: all.length });
      } catch(e) { return JSON.stringify({ count: -1, error: e.message }); }
    })()`,
    returnByValue: true
  });
  console.log(`Existing drawings: ${JSON.parse(shapes.result.value).count}`);

  await client.close();
})();
