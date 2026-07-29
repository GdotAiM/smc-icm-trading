// Draw NY PM Silver Bullet Setup — GBPUSD 1m
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

  console.log("Switching to GBPUSD 1m...");
  await run(client, `(function() {
    window.TradingViewApi._activeChartWidgetWV.value().setSymbol("GBPUSD", {});
    window.TradingViewApi._activeChartWidgetWV.value().setResolution("1");
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 3000));

  const timeRes = await client.Runtime.evaluate({
    expression: `(function() {
      var bars = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().bars();
      var end = bars.lastIndex();
      var start = Math.max(bars.firstIndex(), end - 200);
      return JSON.stringify({ t: bars.valueAt(start)[0], tEnd: bars.valueAt(end)[0], total: end - start });
    })()`,
    returnByValue: true
  });
  const { t, tEnd } = JSON.parse(timeRes.result.value);
  const tWide = t - 600;
  const tFar = tEnd + 3000;
  const api = "window.TradingViewApi._activeChartWidgetWV.value()";

  // Clear
  await run(client, `(function() {
    try { ${api}.removeAllShapes(); } catch(e) {}
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 500));

  console.log("Drawing NY PM Silver Bullet Setup — GBPUSD 1m");

  // ═══════════════ STRUCTURAL LEVELS ═══════════════

  // SL — 4H Swing High
  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide}, price: 1.33677 }, { shape: "horizontal_line", text: "SL @ 1.33677 (4H Sw H + ATR)", overrides: { "linecolor": "#FF1744", "linewidth": 3, "linestyle": 0, "showLabel": true, "textColor": "#FF1744" } });
    return "ok";
  })()`);

  // Entry Zone Top
  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide}, price: 1.33200 }, { shape: "horizontal_line", text: "ENTRY ZONE TOP (1.3320)", overrides: { "linecolor": "#FFD700", "linewidth": 2, "linestyle": 0, "showLabel": true, "textColor": "#FFD700" } });
    return "ok";
  })()`);

  // Entry Zone Bottom
  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide}, price: 1.33130 }, { shape: "horizontal_line", text: "ENTRY ZONE BOT (1.3313)", overrides: { "linecolor": "#FFD700", "linewidth": 2, "linestyle": 0, "showLabel": true, "textColor": "#FFD700" } });
    return "ok";
  })()`);

  // 1m BSL (draw target)
  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd}, price: 1.33133 }, { shape: "horizontal_line", text: "1m BSL (1.33133) — price drawing up", overrides: { "linecolor": "#E040FB", "linewidth": 1, "linestyle": 2, "showLabel": true, "textColor": "#E040FB" } });
    return "ok";
  })()`);

  // Session Low
  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd - 300}, price: 1.33012 }, { shape: "horizontal_line", text: "Session Low (1.33012)", overrides: { "linecolor": "#26C6DA", "linewidth": 1, "linestyle": 3, "showLabel": true, "textColor": "#26C6DA" } });
    return "ok";
  })()`);

  // TP1
  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide}, price: 1.32553 }, { shape: "horizontal_line", text: "TP1 @ 1.32553 (1:1 | +56 pips)", overrides: { "linecolor": "#00E676", "linewidth": 2, "linestyle": 0, "showLabel": true, "textColor": "#00E676" } });
    return "ok";
  })()`);

  // TP2
  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide}, price: 1.31991 }, { shape: "horizontal_line", text: "TP2 @ 1.31991 (2:1 | +112 pips)", overrides: { "linecolor": "#00C853", "linewidth": 2, "linestyle": 0, "showLabel": true, "textColor": "#00C853" } });
    return "ok";
  })()`);

  // 5m Forecast Target
  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide}, price: 1.32910 }, { shape: "horizontal_line", text: "5m Fcst Target (1.32910)", overrides: { "linecolor": "#FFAB00", "linewidth": 1, "linestyle": 3, "showLabel": true, "textColor": "#FFAB00" } });
    return "ok";
  })()`);

  // ═══════════════ ZONES ═══════════════

  // Entry Zone Rectangle
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${t}, price: 1.33200 }, { time: ${tFar}, price: 1.33130 }], { shape: "rectangle", text: "PM SB ENTRY ZONE", overrides: { "backgroundColor": "#FFD70015", "borderColor": "#FFD70044", "borderWidth": 1 } });
    return "ok";
  })()`);

  // Risk Zone
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tWide}, price: 1.33677 }, { time: ${tWide + 300}, price: 1.33130 }], { shape: "rectangle", text: "RISK (54 pips)", overrides: { "backgroundColor": "#FF174418", "borderColor": "#FF174444" } });
    return "ok";
  })()`);

  // Reward Zone
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tWide + 400}, price: 1.33130 }, { time: ${tWide + 700}, price: 1.32553 }], { shape: "rectangle", text: "REWARD 1:1 (+56 pips)", overrides: { "backgroundColor": "#00E67615", "borderColor": "#00E67633" } });
    return "ok";
  })()`);

  // Lunch Consolidation Zone
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tEnd - 1200}, price: 1.33136 }, { time: ${tEnd + 600}, price: 1.33012 }], { shape: "rectangle", text: "LUNCH CONSOLIDATION", overrides: { "backgroundColor": "#607D8B10", "borderColor": "#607D8B33", "borderWidth": 1 } });
    return "ok";
  })()`);

  // ═══════════════ INFO PANEL ═══════════════
  await run(client, `(function() {
    var api = ${api};
    api.createMultipointShape([
      { time: ${t - 300}, price: 1.33800 },
      { time: ${tFar}, price: 1.33920 }
    ], {
      shape: "text",
      text: "NY PM SILVER BULLET | GBPUSD SHORT\\nModel: Breaker Block + PM SB | Score: 10.00/7\\nCouncil: 3/4 BEARISH (80%) | ICT: ALL CLEAR\\nForecast: 5m BEARISH (-20p) + 1m BEARISH ALIGNED\\nDXY: BULLISH confirms USD strength\\n\\nENTRY: 1.3313-1.3320 on 1m bearish flip after BSL sweep\\nSL: 1.33677 | TP1: 1.32553 | TP2: 1.31991\\nR:R 1:1 / 2:1 | Risk: $100 (0.18 std)\\n\\nNEXT: PM open 13:00 | PM SB 14:00-15:00 NY\"\n    });
    return "ok";
  })()`);

  // Current Price Marker
  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd + 600}, price: 1.33115 }, { shape: "horizontal_line", text: "NOW 1.33115 (12:30 NY)", overrides: { "linecolor": "#FFFFFF", "linewidth": 3, "linestyle": 0, "showLabel": true, "textColor": "#FFFFFF" } });
    return "ok";
  })()`);

  // PM SB Window marker
  await run(client, `(function() {
    ${api}.createMultipointShape([
      { time: ${tEnd + 900}, price: 1.32200 },
      { time: ${tFar}, price: 1.32300 }
    ], {
      shape: "text",
      text: "PM SB\\n14:00-15:00 NY\\n(90 min)"
    });
    return "ok";
  })()`);

  await client.close();
  console.log("\nDRAWING COMPLETE — GBPUSD 1m PM Silver Bullet Setup");
  console.log("============================================");
  console.log("Entry Zone:  1.3313 - 1.3320 (GOLD)");
  console.log("SL:          1.33677 (RED)");
  console.log("TP1:         1.32553 (GREEN) +56 pips");
  console.log("TP2:         1.31991 (GREEN) +112 pips");
  console.log("1m BSL:      1.33133 (PURPLE dashed)");
  console.log("Session Low: 1.33012 (CYAN dotted)");
  console.log("5m Fcst:     1.32910 (AMBER dotted)");
  console.log("Current:     1.33115 (WHITE)");
})();
