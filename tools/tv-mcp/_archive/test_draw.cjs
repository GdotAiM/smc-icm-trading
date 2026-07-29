const CDP = require("chrome-remote-interface");

async function run(client, expr) {
  const r = await client.Runtime.evaluate({ expression: expr, returnByValue: true });
  try { return JSON.parse(r.result.value); } catch { return r.result.value; }
}

(async () => {
  const r = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await r.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!chart) { console.log("No chart"); process.exit(1); }

  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();

  // First — switch to GBPUSD 4H
  console.log("Setting GBPUSD 4H...");
  await run(client, `(function() {
    var c = window.TradingViewApi._activeChartWidgetWV.value();
    c.setSymbol("GBPUSD", {}); return "set";
  })()`);
  await new Promise(r => setTimeout(r, 4000));
  await run(client, `(function() {
    window.TradingViewApi._activeChartWidgetWV.value().setResolution("240");
    return "set";
  })()`);
  await new Promise(r => setTimeout(r, 3000));

  // Get time range from the actual bars
  const range = await run(client, `(function() {
    var bars = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().bars();
    var end = bars.lastIndex();
    var start = Math.max(bars.firstIndex(), end - 60);
    var t1 = bars.valueAt(start)[0];
    var t2 = bars.valueAt(end)[0] + 86400 * 20;
    return JSON.stringify({ t1: t1, t2: t2, bars: end - start + 1 });
  })()`);
  console.log(`Range: ${range.bars} bars, t1=${range.t1}, t2=${range.t2}`);

  // Clear ALL existing shapes
  await run(client, `(function() {
    try {
      var api = window.TradingViewApi._activeChartWidgetWV.value();
      api.removeAllShapes(); return "cleared";
    } catch(e) { return e.message; }
  })()`);
  await new Promise(r => setTimeout(r, 500));

  // TEST: Draw ONE simple horizontal line
  console.log("Drawing test line...");
  const result = await run(client, `(function() {
    try {
      var api = window.TradingViewApi._activeChartWidgetWV.value();
      var entityId = api.createShape(
        { time: ${range.t1} },
        { time: ${range.t2}, price: 1.33239 },
        {
          shape: "horizontal_line",
          overrides: {
            "linestyle": 0,
            "linewidth": 3,
            "linecolor": "#FFD700",
            "showLabel": true,
            "text": "GBPUSD ENTRY 1.33239"
          }
        }
      );
      return JSON.stringify({ status: "ok", entityId: entityId || "no-id" });
    } catch(e) { return JSON.stringify({ error: e.message, stack: e.stack }); }
  })()`);
  console.log("Draw result:", JSON.stringify(result));

  // Verify - check shape count
  await new Promise(r => setTimeout(r, 1000));
  const verify = await run(client, `(function() {
    try {
      var api = window.TradingViewApi._activeChartWidgetWV.value();
      var shapes = api.getShapes ? api.getShapes() : [];
      var details = shapes.slice(0, 3).map(function(s) {
        return { id: s.entityId || s.id, type: s.shape || s.type };
      });
      return JSON.stringify({ count: shapes.length, samples: details });
    } catch(e) { return JSON.stringify({ error: e.message }); }
  })()`);
  console.log("Verify:", JSON.stringify(verify));

  await client.close();
  console.log("\nDone — check your TradingView chart for a YELLOW horizontal line at 1.33239");
})();
