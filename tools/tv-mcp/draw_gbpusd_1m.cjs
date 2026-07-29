// Draw GBPUSD key levels on 1m chart — using correct TV Desktop API
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
  const api = "window.TradingViewApi._activeChartWidgetWV.value()";

  console.log("Switching to GBPUSD 1m...");
  await run(client, `(function() {
    ${api}.setSymbol("GBPUSD", {});
    ${api}.setResolution("1");
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 3500));

  // Get time bounds
  const timeRes = await client.Runtime.evaluate({
    expression: `(function() {
      var bars = ${api}._chartWidget.model().mainSeries().bars();
      var end = bars.lastIndex();
      var start = Math.max(bars.firstIndex(), end - 120);
      return JSON.stringify({ t: bars.valueAt(start)[0], tEnd: bars.valueAt(end)[0] });
    })()`,
    returnByValue: true
  });
  const { t, tEnd } = JSON.parse(timeRes.result.value);
  const tWide = t - 400;
  const tFar = tEnd + 3000;

  // Clear existing drawings
  await run(client, `(function() {
    try { ${api}.removeAllShapes(); } catch(e) {}
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 500));

  console.log("Drawing GBPUSD Premium Analysis Levels...");

  // ── ENTRY ──
  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd + 800}, price: 1.32987 }, { shape: "horizontal_line", text: "ENTRY 1.32987", overrides: { "linecolor": "#FF6B35", "linewidth": 3, "linestyle": 0, "showLabel": true, "textColor": "#FF6B35" } });
    return "ok";
  })()`);
  console.log("  ✓ ENTRY @ 1.32987");

  // ── SL ──
  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd + 800}, price: 1.33169 }, { shape: "horizontal_line", text: "SL 1.33169 (4H Swing + ATR)", overrides: { "linecolor": "#EF4444", "linewidth": 2, "linestyle": 0, "showLabel": true, "textColor": "#EF4444" } });
    return "ok";
  })()`);
  console.log("  ✓ SL @ 1.33169");

  // ── 4H Swing High ──
  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd + 800}, price: 1.33112 }, { shape: "horizontal_line", text: "4H Swing High 1.33112", overrides: { "linecolor": "#EF4444", "linewidth": 1, "linestyle": 2, "showLabel": true, "textColor": "#EF4444" } });
    return "ok";
  })()`);
  console.log("  ✓ 4H Swing High @ 1.33112");

  // ── TP1 ──
  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide}, price: 1.32805 }, { shape: "horizontal_line", text: "TP1 1.32805 (1:1, +18p)", overrides: { "linecolor": "#22C55E", "linewidth": 2, "linestyle": 1, "showLabel": true, "textColor": "#22C55E" } });
    return "ok";
  })()`);
  console.log("  ✓ TP1 @ 1.32805");

  // ── TP2 ──
  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide}, price: 1.32624 }, { shape: "horizontal_line", text: "TP2 1.32624 (2:1, +36p)", overrides: { "linecolor": "#22C55E", "linewidth": 1, "linestyle": 1, "showLabel": true, "textColor": "#22C55E" } });
    return "ok";
  })()`);
  console.log("  ✓ TP2 @ 1.32624");

  // ── OTE Zone (rectangle) ──
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tEnd - 200}, price: 1.32878 }, { time: ${tFar}, price: 1.32814 }], { shape: "rectangle", text: "OTE ZONE 62-79%", overrides: { "backgroundColor": "#F59E0B15", "borderColor": "#F59E0B44", "borderWidth": 1, "borderStyle": 1 } });
    return "ok";
  })()`);
  console.log("  ✓ OTE Zone: 1.32814 - 1.32878");

  // ── OTE Ideal (70.5%) ──
  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide}, price: 1.32846 }, { shape: "horizontal_line", text: "OTE Ideal 70.5% @ 1.32846", overrides: { "linecolor": "#F59E0B", "linewidth": 2, "linestyle": 0, "showLabel": true, "textColor": "#F59E0B" } });
    return "ok";
  })()`);
  console.log("  ✓ OTE Ideal @ 1.32846");

  // ── Bearish FVG ──
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${t - 300}, price: 1.33480 }, { time: ${tFar}, price: 1.33402 }], { shape: "rectangle", text: "BEARISH FVG (unmitigated)", overrides: { "backgroundColor": "#CBD5E115", "borderColor": "#CBD5E144", "borderWidth": 1, "borderStyle": 2 } });
    return "ok";
  })()`);
  console.log("  ✓ Bearish FVG: 1.33402-1.33480");

  // ── BSL pools (targets above) ──
  await run(client, `(function() {
    ${api}.createShape({ time: ${t + 100}, price: 1.33716 }, { shape: "horizontal_line", text: "BSL 1.33716 (3 touches)", overrides: { "linecolor": "#E2E8F0", "linewidth": 1, "linestyle": 2, "showLabel": true, "textColor": "#E2E8F0" } });
    return "ok";
  })()`);
  await run(client, `(function() {
    ${api}.createShape({ time: ${t + 100}, price: 1.33939 }, { shape: "horizontal_line", text: "BSL 1.33939 (4 touches)", overrides: { "linecolor": "#E2E8F0", "linewidth": 1, "linestyle": 2, "showLabel": true, "textColor": "#E2E8F0" } });
    return "ok";
  })()`);
  console.log("  ✓ BSL pools: 1.33716, 1.33939");

  // ── Bearish OB ──
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${t - 300}, price: 1.35174 }, { time: ${tFar}, price: 1.34964 }], { shape: "rectangle", text: "BEARISH OB", overrides: { "backgroundColor": "#94A3B815", "borderColor": "#94A3B844", "borderWidth": 1, "borderStyle": 0 } });
    return "ok";
  })()`);
  console.log("  ✓ Bearish OB: 1.34964-1.35174");

  // ── CBDR: Prev Day High + Asian High ──
  await run(client, `(function() {
    ${api}.createShape({ time: ${t}, price: 1.33637 }, { shape: "horizontal_line", text: "Prev Day High 1.33637", overrides: { "linecolor": "#64748B", "linewidth": 1, "linestyle": 3, "showLabel": true, "textColor": "#64748B" } });
    return "ok";
  })()`);
  await run(client, `(function() {
    ${api}.createShape({ time: ${t}, price: 1.33168 }, { shape: "horizontal_line", text: "Asian High 1.33168", overrides: { "linecolor": "#64748B", "linewidth": 1, "linestyle": 3, "showLabel": true, "textColor": "#64748B" } });
    return "ok";
  })()`);
  console.log("  ✓ CBDR: Prev Day High 1.33637, Asian High 1.33168");

  // ── Info panel ──
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tWide}, price: 1.3420 }, { time: ${t + 800}, price: 1.3470 }], {
      shape: "text",
      text: "GBPUSD — PREMIUM ANALYSIS (Jul 29)\\nLondon Session | SB 03:00-04:00 NY\\n\\nBIAS: BEARISH (1D+4H ALIGNED)\\nModel: OTE + Institutional OB (8.40/11)\\nCoherence: 10/10 PERFECT\\nCycle: DISTRIBUTION\\n\\nENTRY: SHORT @ 1.32987\\nSL: 1.33169 | TP1: 1.32805 | TP2: 1.32624\\nR:R: 1:1 / 2:1\\n\\n⚠️ FOMC @ 14:00 ET — close by 13:45\\n⚠️ Fractal MMXM not aligned — reduce size\\n⚠️ Wait for 1m MSS downside before entry"
    });
    return "ok";
  })()`);
  console.log("  ✓ Info panel");

  // ── FOMC warning ──
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tEnd + 400}, price: 1.3240 }, { time: ${tEnd + 800}, price: 1.3250 }], {
      shape: "text",
      text: "⚠️ FOMC 14:00 ET\\nCLOSE ALL BY 13:45"
    });
    return "ok";
  })()`);
  console.log("  ✓ FOMC warning");

  await client.close();
  console.log("\n✅ ALL GBPUSD LEVELS DRAWN ON 1m CHART");
  console.log("========================================");
  console.log("ENTRY:     1.32987 (ORANGE solid)");
  console.log("SL:        1.33169 (RED solid)");
  console.log("4H Swing:  1.33112 (RED dashed)");
  console.log("TP1:       1.32805 (GREEN dotted)");
  console.log("TP2:       1.32624 (GREEN dotted)");
  console.log("OTE Zone:  1.32814-1.32878 (AMBER rect)");
  console.log("OTE Ideal: 1.32846 (AMBER solid)");
  console.log("Bear FVG:  1.33402-1.33480 (GRAY rect)");
  console.log("Bear OB:   1.34964-1.35174 (STONE rect)");
  console.log("BSL:       1.33716, 1.33939 (WHITE dashed)");
  console.log("Prev Day:  1.33637, Asian: 1.33168 (SLATE dotted)");
})();
