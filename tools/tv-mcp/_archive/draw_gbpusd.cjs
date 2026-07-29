const CDP = require("chrome-remote-interface");

async function evalExpr(client, expr) {
  const r = await client.Runtime.evaluate({ expression: expr, returnByValue: true });
  try { return JSON.parse(r.result.value); } catch { return r.result.value; }
}

async function drawLine(client, price, label, color, t1, t2) {
  return evalExpr(client, `(function() {
    try {
      var api = window.TradingViewApi._activeChartWidgetWV.value();
      api.createShape(
        { time: ${t1} },
        { time: ${t2}, price: ${price} },
        { shape: "horizontal_line", overrides: {
          "linecolor": "${color}",
          "linestyle": 0,
          "linewidth": 2,
          "showLabel": true,
          "text": "${label}"
        }}
      );
      return "ok";
    } catch(e) { return e.message; }
  })()`);
}

(async () => {
  const resp = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await resp.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!chart) { console.log("No chart"); process.exit(1); }

  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();

  // Switch to GBPUSD 4H
  console.error("Loading GBPUSD 4H...");
  await evalExpr(client, `(function() {
    var c = window.TradingViewApi._activeChartWidgetWV.value();
    c.setSymbol("GBPUSD", {}); return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 3500));
  await evalExpr(client, `(function() {
    window.TradingViewApi._activeChartWidgetWV.value().setResolution("240");
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 2500));

  // Get time range
  const range = await evalExpr(client, `(function() {
    var bars = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().bars();
    var end = bars.lastIndex();
    var start = Math.max(bars.firstIndex(), end - 100);
    return JSON.stringify({ t1: bars.valueAt(start)[0], t2: bars.valueAt(end)[0] + 86400 * 20 });
  })()`);
  const { t1, t2 } = range;
  console.error(`Time range set`);

  // Clear first
  await evalExpr(client, `(function() {
    try { window.TradingViewApi._activeChartWidgetWV.value().removeAllShapes(); return "cleared"; } catch(e) { return e.message; }
  })()`);
  await new Promise(r => setTimeout(r, 300));

  // Draw levels — bottom to top so labels don't overlap
  console.error("Drawing levels...");
  const levels = [
    { price: 1.31566, label: "TP2 (1:2)", color: "#00C853" },
    { price: 1.32402, label: "TP1 (1:1)", color: "#00E676" },
    { price: 1.33239, label: "▼ ENTRY", color: "#FFD700" },
    { price: 1.33934, label: "Swing High", color: "#FF9800" },
    { price: 1.34076, label: "▲ SL", color: "#FF1744" },
  ];

  for (const l of levels) {
    const r = await drawLine(client, l.price, l.label, l.color, t1, t2);
    console.error(`  ${l.label} @ ${l.price}: ${r}`);
  }

  // Draw risk zone rectangle
  await evalExpr(client, `(function() {
    try {
      var api = window.TradingViewApi._activeChartWidgetWV.value();
      api.createShape(
        { time: ${t1}, price: 1.34076 },
        { time: ${t2}, price: 1.33239 },
        { shape: "rectangle", overrides: {
          "backgroundColor": "#FF174422",
          "borderColor": "#FF174466",
          "borderWidth": 1,
          "showLabel": true,
          "text": "RISK"
        }}
      );
      return "ok";
    } catch(e) { return e.message; }
  })()`);

  await client.close();
  console.error("✅ GBPUSD setup drawn — check TradingView");
  console.log(JSON.stringify({symbol:"GBPUSD",tf:"4H",entry:1.33239,sl:1.34076,tp1:1.32402,tp2:1.31566,swingHigh:1.33934,rr:"1:1 / 2:1"}));
})();
