const CDP = require("chrome-remote-interface");

async function run(client, expr) {
  await client.Runtime.evaluate({ expression: expr, returnByValue: true });
}

(async () => {
  const r = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await r.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!chart) { console.log("No chart"); process.exit(1); }

  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();

  // Switch to GBPUSD 5m
  console.error("Loading GBPUSD 5m...");
  await run(client, `(function() {
    window.TradingViewApi._activeChartWidgetWV.value().setSymbol("GBPUSD", {});
    window.TradingViewApi._activeChartWidgetWV.value().setResolution("5");
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 4000));

  // Get anchor time
  const timeRes = await client.Runtime.evaluate({
    expression: `(function() {
      var bars = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().bars();
      return JSON.stringify({ t: bars.valueAt(bars.lastIndex() - 60)[0], tEnd: bars.valueAt(bars.lastIndex())[0] });
    })()`,
    returnByValue: true
  });
  const { t, tEnd } = JSON.parse(timeRes.result.value);

  // Clear
  await run(client, `(function() {
    try { window.TradingViewApi._activeChartWidgetWV.value().removeAllShapes(); } catch(e) {}
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 400));

  console.error("Drawing micro structure...");

  // ═══ 15M LEVELS (dashed, wider) ═══
  const htfLevels = [
    { price: 1.33294, label: "15m Swing H", color: "#FF9800", style: 2 },
    { price: 1.33216, label: "15m Swing L", color: "#FF9800", style: 2 },
  ];
  for (const l of htfLevels) {
    await run(client, `(function() {
      try {
        window.TradingViewApi._activeChartWidgetWV.value().createShape(
          { time: ${t}, price: ${l.price} },
          { shape: "horizontal_line", text: "${l.label}", overrides: { "linecolor": "${l.color}", "linewidth": 1, "linestyle": ${l.style}, "showLabel": true } }
        );
      } catch(e) {}
      return "ok";
    })()`);
  }

  // ═══ 5M LEVELS (solid, entry TF) ═══
  const entryLevels = [
    { price: 1.33267, label: "5m Swing H", color: "#FF1744", style: 0 },
    { price: 1.33222, label: "5m Swing L", color: "#FF1744", style: 0 },
    { price: 1.33239, label: "ENTRY (now)", color: "#FFD700", style: 0 },
  ];
  for (const l of entryLevels) {
    await run(client, `(function() {
      try {
        window.TradingViewApi._activeChartWidgetWV.value().createShape(
          { time: ${t}, price: ${l.price} },
          { shape: "horizontal_line", text: "${l.label}", overrides: { "linecolor": "${l.color}", "linewidth": 2, "linestyle": ${l.style}, "showLabel": true } }
        );
      } catch(e) {}
      return "ok";
    })()`);
  }

  // ═══ 1M FVGs (micro inefficiencies) ═══
  const fvgs = [
    { top: 1.33238, bottom: 1.33234, label: "1m FVG (bullish)", color: "#4CAF50" },
    { top: 1.33182, bottom: 1.33174, label: "1m FVG (bullish)", color: "#4CAF50" },
  ];
  for (const f of fvgs) {
    // Draw FVG as small rectangles
    await run(client, `(function() {
      try {
        window.TradingViewApi._activeChartWidgetWV.value().createMultipointShape(
          [{ time: ${t - 300}, price: ${f.top} }, { time: ${t + 3600}, price: ${f.bottom} }],
          { shape: "rectangle", text: "${f.label}", overrides: { "backgroundColor": "${f.color}22", "borderColor": "${f.color}88", "linewidth": 1, "showLabel": true } }
        );
      } catch(e) {}
      return "ok";
    })()`);
  }

  // ═══ 4H MACRO LEVELS (for context) ═══
  const macroLevels = [
    { price: 1.34076, label: "4H SL", color: "#FF1744", style: 0 },
    { price: 1.33239, label: "4H ENTRY", color: "#FFD700", style: 0 },
    { price: 1.32402, label: "4H TP1", color: "#00E676", style: 0 },
  ];
  for (const l of macroLevels) {
    await run(client, `(function() {
      try {
        window.TradingViewApi._activeChartWidgetWV.value().createShape(
          { time: ${t}, price: ${l.price} },
          { shape: "horizontal_line", text: "${l.label}", overrides: { "linecolor": "${l.color}", "linewidth": 1, "linestyle": 2, "showLabel": true } }
        );
      } catch(e) {}
      return "ok";
    })()`);
  }

  // Add entry zone rectangle (5m swing range)
  await run(client, `(function() {
    try {
      window.TradingViewApi._activeChartWidgetWV.value().createMultipointShape(
        [{ time: ${t - 1800}, price: 1.33267 }, { time: ${t + 7200}, price: 1.33222 }],
        { shape: "rectangle", text: "5m RANGE", overrides: { "backgroundColor": "#FFD70011", "borderColor": "#FFD70044", "linewidth": 1 } }
      );
    } catch(e) {}
    return "ok";
  })()`);

  // Add text annotation for micro context
  await run(client, `(function() {
    try {
      var api = window.TradingViewApi._activeChartWidgetWV.value();
      api.createShape(
        { time: ${t + 3600} },
        { time: ${t + 7200}, price: 1.33310 },
        { shape: "text", text: "MICRO: 15m+5m BEARISH | 1m BULLISH (pullback) | Coherence 7/10 GO" }
      );
    } catch(e) {}
    return "ok";
  })()`);

  // Verify
  const verify = await client.Runtime.evaluate({
    expression: `(function() {
      try { return JSON.stringify({ count: window.TradingViewApi._activeChartWidgetWV.value().getAllShapes().length }); }
      catch(e) { return JSON.stringify({ error: e.message }); }
    })()`,
    returnByValue: true
  });
  console.error(`Shapes: ${JSON.parse(verify.result.value).count}`);

  await client.close();
  console.log(JSON.stringify({
    tf: "5m",
    symbol: "GBPUSD",
    coherence: "7/10",
    micro: "15m BEARISH | 5m BEARISH | 1m BULLISH (pullback)",
    levels: {
      "15m_swing_h": 1.33294, "15m_swing_l": 1.33216,
      "5m_swing_h": 1.33267, "5m_swing_l": 1.33222,
      entry: 1.33239,
      "1m_fvgs": ["1.33234-1.33238", "1.33174-1.33182"]
    }
  }));
})();
