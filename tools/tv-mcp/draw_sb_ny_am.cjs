// Draw NY AM Silver Bullet setup on GBPUSD 1m
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

  // Switch to GBPUSD 1m
  console.log("Switching to GBPUSD 1m...");
  await run(client, `(function() {
    window.TradingViewApi._activeChartWidgetWV.value().setSymbol("GBPUSD", {});
    window.TradingViewApi._activeChartWidgetWV.value().setResolution("1");
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 3000));

  // Get bar range for drawing
  const timeRes = await client.Runtime.evaluate({
    expression: `(function() {
      var bars = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().bars();
      var end = bars.lastIndex();
      var start = Math.max(bars.firstIndex(), end - 180);
      return JSON.stringify({ t: bars.valueAt(start)[0], tEnd: bars.valueAt(end)[0], total: end - start });
    })()`,
    returnByValue: true
  });
  const { t, tEnd } = JSON.parse(timeRes.result.value);
  const tWide = t - 600;
  const tFar = tEnd + 2400;

  // Clear all shapes
  await run(client, `(function() {
    try { window.TradingViewApi._activeChartWidgetWV.value().removeAllShapes(); } catch(e) {}
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 500));

  console.log("Drawing NY AM Silver Bullet Setup — GBPUSD 1m");

  const api = "window.TradingViewApi._activeChartWidgetWV.value()";

  // ═══════════════ STRUCTURAL LEVELS ═══════════════

  // SL — 4H Swing High + ATR
  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide}, price: 1.33677 }, { shape: "horizontal_line", text: "SL @ 1.33677 (4H Sw H + ATR)", overrides: { "linecolor": "#FF1744", "linewidth": 3, "linestyle": 0, "showLabel": true, "textColor": "#FF1744" } });
    return "ok";
  })()`);

  // 4H Bearish FVG Top
  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide}, price: 1.33307 }, { shape: "horizontal_line", text: "4H Bearish FVG Top", overrides: { "linecolor": "#FF9800", "linewidth": 1, "linestyle": 2, "showLabel": true, "textColor": "#FF9800" } });
    return "ok";
  })()`);

  // 4H Bearish FVG Bottom
  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide}, price: 1.33214 }, { shape: "horizontal_line", text: "4H FVG Bottom", overrides: { "linecolor": "#FF9800", "linewidth": 1, "linestyle": 2, "showLabel": true, "textColor": "#FF9800" } });
    return "ok";
  })()`);

  // Entry Zone Top
  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide}, price: 1.33210 }, { shape: "horizontal_line", text: "ENTRY ZONE (1.3315-1.3321)", overrides: { "linecolor": "#FFD700", "linewidth": 2, "linestyle": 0, "showLabel": true, "textColor": "#FFD700" } });
    return "ok";
  })()`);

  // Entry Zone Bottom
  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide}, price: 1.33150 }, { shape: "horizontal_line", text: "ENTRY ZONE", overrides: { "linecolor": "#FFD700", "linewidth": 2, "linestyle": 0, "showLabel": true, "textColor": "#FFD700" } });
    return "ok";
  })()`);

  // Displacement FVG Top
  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd}, price: 1.33154 }, { shape: "horizontal_line", text: "Displacement FVG Top (1.3315)", overrides: { "linecolor": "#E040FB", "linewidth": 1, "linestyle": 2, "showLabel": true, "textColor": "#E040FB" } });
    return "ok";
  })()`);

  // Displacement FVG Bottom
  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd}, price: 1.33088 }, { shape: "horizontal_line", text: "Displacement FVG Bottom (NOW)", overrides: { "linecolor": "#E040FB", "linewidth": 1, "linestyle": 2, "showLabel": true, "textColor": "#E040FB" } });
    return "ok";
  })()`);

  // TP1
  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide}, price: 1.32631 }, { shape: "horizontal_line", text: "TP1 @ 1.32631 (1:1 | +52 pips)", overrides: { "linecolor": "#00E676", "linewidth": 2, "linestyle": 0, "showLabel": true, "textColor": "#00E676" } });
    return "ok";
  })()`);

  // TP2
  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide}, price: 1.32111 }, { shape: "horizontal_line", text: "TP2 @ 1.32111 (2:1 | +104 pips)", overrides: { "linecolor": "#00C853", "linewidth": 2, "linestyle": 0, "showLabel": true, "textColor": "#00C853" } });
    return "ok";
  })()`);

  // 4H SSL Draw Target
  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide}, price: 1.33065 }, { shape: "horizontal_line", text: "4H SSL Draw Target (1.33065)", overrides: { "linecolor": "#26C6DA", "linewidth": 1, "linestyle": 3, "showLabel": true, "textColor": "#26C6DA" } });
    return "ok";
  })()`);

  // ═══════════════ ZONES (Rectangles) ═══════════════

  // Entry Zone Rectangle
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${t}, price: 1.33210 }, { time: ${tFar}, price: 1.33150 }], { shape: "rectangle", text: "ENTRY ZONE", overrides: { "backgroundColor": "#FFD70015", "borderColor": "#FFD70044", "borderWidth": 1 } });
    return "ok";
  })()`);

  // 4H Bearish FVG Rectangle
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tWide}, price: 1.33307 }, { time: ${tFar}, price: 1.33214 }], { shape: "rectangle", text: "4H BEARISH FVG", overrides: { "backgroundColor": "#FF980010", "borderColor": "#FF980030", "borderWidth": 1 } });
    return "ok";
  })()`);

  // Displacement FVG Rectangle
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tEnd - 180}, price: 1.33154 }, { time: ${tFar}, price: 1.33088 }], { shape: "rectangle", text: "DISPLACEMENT FVG", overrides: { "backgroundColor": "#E040FB12", "borderColor": "#E040FB33", "borderWidth": 1 } });
    return "ok";
  })()`);

  // Risk Zone (Entry → SL)
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tWide}, price: 1.33677 }, { time: ${tWide + 300}, price: 1.33150 }], { shape: "rectangle", text: "RISK (52 pips)", overrides: { "backgroundColor": "#FF174418", "borderColor": "#FF174444" } });
    return "ok";
  })()`);

  // Reward Zone (Entry → TP1)
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tWide + 400}, price: 1.33150 }, { time: ${tWide + 700}, price: 1.32631 }], { shape: "rectangle", text: "REWARD 1:1 (+52 pips)", overrides: { "backgroundColor": "#00E67615", "borderColor": "#00E67633" } });
    return "ok";
  })()`);

  // ═══════════════ INFO LABEL ═══════════════
  await run(client, `(function() {
    var api = ${api};
    api.createMultipointShape([
      { time: ${t - 300}, price: 1.33750 },
      { time: ${tFar}, price: 1.33850 }
    ], {
      shape: "text",
      text: "NY AM SILVER BULLET | GBPUSD SHORT\\nModel: Silver Bullet + MMXM | Score: 8.80/10\\nCouncil: 3/4 BEARISH (80%) | Coherence: 10/10\\nForecast: 5m BEARISH (-19p) + 1m BEARISH ALIGNED\\nDXY: BULLISH confirms USD strength\\n\\nENTRY: 1.3315-1.3321 on 1m bearish flip\\nSL: 1.33677 | TP1: 1.32631 | TP2: 1.32111\\nR:R 1:1 / 2:1 | Risk: $100 (0.19 std)\"
    });
    return "ok";
  })()`);

  // ═══════════════ CURRENT PRICE MARKER ═══════════════
  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd + 600}, price: 1.33088 }, { shape: "horizontal_line", text: "NOW 1.33088 (10:01 NY)", overrides: { "linecolor": "#FFFFFF", "linewidth": 3, "linestyle": 0, "showLabel": true, "textColor": "#FFFFFF" } });
    return "ok";
  })()`);

  await client.close();
  console.log("\nDRAWING COMPLETE — GBPUSD 1m NY AM Silver Bullet Setup");
  console.log("============================================");
  console.log("Entry Zone:  1.3315 - 1.3321 (GOLD)");
  console.log("SL:          1.33677 (RED)");
  console.log("TP1:         1.32631 (GREEN) +52 pips");
  console.log("TP2:         1.32111 (GREEN) +104 pips");
  console.log("Displacement FVG: 1.33088-1.33154 (PURPLE)");
  console.log("4H Bearish FVG:   1.33214-1.33307 (ORANGE)");
  console.log("Current:      1.33088 (WHITE)");
})();
