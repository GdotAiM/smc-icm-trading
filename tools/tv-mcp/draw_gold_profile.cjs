// Draw GOLD Daily Profile — London Delayed Sell Profile
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

  console.log("Switching to GOLD 15m...");
  await run(client, `(function() {
    window.TradingViewApi._activeChartWidgetWV.value().setSymbol("XAUUSD", {});
    window.TradingViewApi._activeChartWidgetWV.value().setResolution("15");
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 3000));

  const timeRes = await client.Runtime.evaluate({
    expression: `(function() {
      var bars = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().bars();
      var end = bars.lastIndex();
      var start = Math.max(bars.firstIndex(), end - 300);
      return JSON.stringify({ t: bars.valueAt(start)[0], tEnd: bars.valueAt(end)[0] });
    })()`,
    returnByValue: true
  });
  const { t, tEnd } = JSON.parse(timeRes.result.value);
  const tWide = t - 1200;
  const tFar = tEnd + 4800;
  const api = "window.TradingViewApi._activeChartWidgetWV.value()";

  await run(client, `(function() {
    try { ${api}.removeAllShapes(); } catch(e) {}
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 500));

  console.log("Drawing GOLD Daily Profile — London Delayed Sell Profile");

  // ═══════════════ ZONES ═══════════════

  // CBDR Zone (Monday 14:00-20:00 NY) — estimated ~4086-4045
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tWide}, price: 4086.00 }, { time: ${t}, price: 4045.00 }], { shape: "rectangle", text: "MON CBDR (~4086-4045)", overrides: { "backgroundColor": "#1565C010", "borderColor": "#1565C044", "borderWidth": 1 } });
    return "ok";
  })()`);

  // Asian Range (20:00-00:00 NY) — overnight ~4045-4050
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${t - 600}, price: 4050.00 }, { time: ${t}, price: 4045.00 }], { shape: "rectangle", text: "ASIAN RANGE (overnight)", overrides: { "backgroundColor": "#FF6F0010", "borderColor": "#FF6F0033", "borderWidth": 1 } });
    return "ok";
  })()`);

  // London Manipulation Zone (02:00-05:00 NY) — bounce area
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${t}, price: 4053.00 }, { time: ${tFar}, price: 4047.00 }], { shape: "rectangle", text: "LONDON MANIPULATION (bounce)", overrides: { "backgroundColor": "#E040FB12", "borderColor": "#E040FB44", "borderWidth": 1 } });
    return "ok";
  })()`);

  // Expected Distribution Zone (Pre-NY → NY AM)
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${t + 1200}, price: 4053.00 }, { time: ${tFar}, price: 4022.00 }], { shape: "rectangle", text: "EXPECTED DISTRIBUTION (NY AM)", overrides: { "backgroundColor": "#FF174415", "borderColor": "#FF174444", "borderWidth": 1, "borderStyle": 2 } });
    return "ok";
  })()`);

  // ═══════════════ LEVELS ═══════════════

  // Monday Close
  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide}, price: 4086.00 }, { shape: "horizontal_line", text: "MON CLOSE 4086", overrides: { "linecolor": "#607D8B", "linewidth": 2, "linestyle": 2, "showLabel": true, "textColor": "#90A4AE" } });
    return "ok";
  })()`);

  // London Manipulation High
  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd}, price: 4052.90 }, { shape: "horizontal_line", text: "LONDON HIGH 4053 (day high so far)", overrides: { "linecolor": "#E040FB", "linewidth": 2, "linestyle": 0, "showLabel": true, "textColor": "#E040FB" } });
    return "ok";
  })()`);

  // Current Price
  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd + 600}, price: 4050.30 }, { shape: "horizontal_line", text: "NOW 4050.30", overrides: { "linecolor": "#FFFFFF", "linewidth": 3, "linestyle": 0, "showLabel": true, "textColor": "#FFFFFF" } });
    return "ok";
  })()`);

  // 5m BSL Exhaustion
  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd}, price: 4051.93 }, { shape: "horizontal_line", text: "5m BSL (exhaustion) 4052", overrides: { "linecolor": "#FFAB00", "linewidth": 1, "linestyle": 3, "showLabel": true, "textColor": "#FFAB00" } });
    return "ok";
  })()`);

  // 15m SSL Target
  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide}, price: 4044.05 }, { shape: "horizontal_line", text: "15m SSL TARGET 4044", overrides: { "linecolor": "#00E676", "linewidth": 1, "linestyle": 3, "showLabel": true, "textColor": "#00E676" } });
    return "ok";
  })()`);

  // 5m Forecast Target
  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide}, price: 4023.92 }, { shape: "horizontal_line", text: "5m FCST TARGET 4024 (-$27)", overrides: { "linecolor": "#FF6F00", "linewidth": 1, "linestyle": 3, "showLabel": true, "textColor": "#FF6F00" } });
    return "ok";
  })()`);

  // ═══════════════ LABELS ═══════════════

  // Phase labels
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${t - 800}, price: 4088.00 }, { time: ${t - 200}, price: 4092.00 }], { shape: "text", text: "PHASE 1\\nMonday SELL DAY\\n-$38" });
    return "ok";
  })()`);

  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${t - 300}, price: 4055.00 }, { time: ${t + 100}, price: 4058.00 }], { shape: "text", text: "PHASE 2\\nLONDON\\nMANIPULATION\\n(bounce up)" });
    return "ok";
  })()`);

  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${t + 1500}, price: 4055.00 }, { time: ${t + 2100}, price: 4058.00 }], { shape: "text", text: "PHASE 3 (expected)\\nDELAYED\\nDISTRIBUTION\\nPre-NY / NY AM" });
    return "ok";
  })()`);

  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${t + 2500}, price: 4030.00 }, { time: ${t + 3100}, price: 4034.00 }], { shape: "text", text: "PHASE 4 (target)\\nSELL-OFF\\nto 4044 / 4024" });
    return "ok";
  })()`);

  // Info panel
  await run(client, `(function() {
    var api = ${api};
    api.createMultipointShape([
      { time: ${tWide}, price: 4100.00 },
      { time: ${t}, price: 4108.00 }
    ], {
      shape: "text",
      text: "GOLD (XAUUSD) DAILY PROFILE\\nSELL PROFILE — LONDON DELAYED PROTRACTION\\n\\nMonday: BEARISH TREND DAY (-$38)\\nCBDR: 4086-4045 | Asian: 4045-4050\\nLondon: MANIPULATION bounce to 4053\\nExpected: DELAYED distribution Pre-NY/NY AM\\n\\nTargets: 15m SSL 4044 | 5m Fcst 4024\\nNY AM SB (10:00-11:00) = best window"
    });
    return "ok";
  })()`);

  await client.close();
  console.log("\nDRAWING COMPLETE — GOLD 15m Daily Profile");
  console.log("============================================");
  console.log("Profile: SELL PROFILE — London Delayed Protraction");
  console.log("Phase 1: Monday Sell Day -$38 (BLUE zone)");
  console.log("Phase 2: London Manipulation bounce 4047→4053 (PURPLE zone)");
  console.log("Phase 3: DELAY — consolidation, distribution hasn't started");
  console.log("Phase 4 (expected): Distribution to 4044 → 4024 (RED zone)");
  console.log("");
  console.log("Best window: NY AM SB 10:00-11:00 NY");
})();
