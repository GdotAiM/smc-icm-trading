// Draw EURUSD 1m — standalone script for separate chart tab
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

  console.log("Switching to EURUSD 1m...");
  await run(client, `(function() {
    ${api}.setSymbol("EURUSD", {});
    ${api}.setResolution("1");
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 3500));

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
  const tWide = t - 400, tFar = tEnd + 3000;

  await run(client, `(function() { try { ${api}.removeAllShapes(); } catch(e) {} return "ok"; })()`);
  await new Promise(r => setTimeout(r, 500));

  // ═══ CURRENT & STRUCTURE ═══
  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd + 800}, price: 1.13940 }, { shape: "horizontal_line", text: "NOW 1.13940 — IN OTE ZONE", overrides: { "linecolor": "#FFFFFF", "linewidth": 3, "linestyle": 0, "showLabel": true, "textColor": "#FFFFFF" } });
    return "ok";
  })()`);

  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd + 800}, price: 1.14131 }, { shape: "horizontal_line", text: "SL 1.14131 (4H Swing + ATR)", overrides: { "linecolor": "#EF4444", "linewidth": 2, "linestyle": 0, "showLabel": true, "textColor": "#EF4444" } });
    return "ok";
  })()`);

  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd + 800}, price: 1.14053 }, { shape: "horizontal_line", text: "4H Swing High 1.14053", overrides: { "linecolor": "#EF4444", "linewidth": 1, "linestyle": 2, "showLabel": true, "textColor": "#EF4444" } });
    return "ok";
  })()`);

  // ═══ TARGETS ═══
  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide}, price: 1.13610 }, { shape: "horizontal_line", text: "TP1 1.13610 (SSL pool, 1.73:1, +33p)", overrides: { "linecolor": "#22C55E", "linewidth": 2, "linestyle": 1, "showLabel": true, "textColor": "#22C55E" } });
    return "ok";
  })()`);

  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide}, price: 1.13279 }, { shape: "horizontal_line", text: "TP2 1.13279 (2:1, +66p)", overrides: { "linecolor": "#22C55E", "linewidth": 1, "linestyle": 1, "showLabel": true, "textColor": "#22C55E" } });
    return "ok";
  })()`);

  // ═══ OTE ZONE ═══
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tEnd - 200}, price: 1.13944 }, { time: ${tFar}, price: 1.13855 }], { shape: "rectangle", text: "OTE ZONE 62-79%", overrides: { "backgroundColor": "#F59E0B15", "borderColor": "#F59E0B44", "borderWidth": 1 } });
    return "ok";
  })()`);

  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide}, price: 1.13899 }, { shape: "horizontal_line", text: "OTE 70.5% Ideal @ 1.13899", overrides: { "linecolor": "#F59E0B", "linewidth": 2, "linestyle": 0, "showLabel": true, "textColor": "#F59E0B" } });
    return "ok";
  })()`);

  // ═══ LIQUIDITY POOLS ═══
  await run(client, `(function() {
    ${api}.createShape({ time: ${t + 100}, price: 1.14119 }, { shape: "horizontal_line", text: "BSL 1.14119 (3 touches)", overrides: { "linecolor": "#E2E8F0", "linewidth": 1, "linestyle": 2, "showLabel": true, "textColor": "#E2E8F0" } });
    return "ok";
  })()`);

  await run(client, `(function() {
    ${api}.createShape({ time: ${t + 200}, price: 1.14353 }, { shape: "horizontal_line", text: "BSL 1.14353 (8 touches) — DRAW TARGET", overrides: { "linecolor": "#E2E8F0", "linewidth": 2, "linestyle": 2, "showLabel": true, "textColor": "#E2E8F0" } });
    return "ok";
  })()`);

  // ═══ CBDR ═══
  await run(client, `(function() {
    ${api}.createShape({ time: ${t}, price: 1.14012 }, { shape: "horizontal_line", text: "CBDR High 1.14012", overrides: { "linecolor": "#64748B", "linewidth": 1, "linestyle": 3, "showLabel": true, "textColor": "#64748B" } });
    return "ok";
  })()`);

  await run(client, `(function() {
    ${api}.createShape({ time: ${t}, price: 1.13650 }, { shape: "horizontal_line", text: "CBDR Low / Asian Low 1.13650", overrides: { "linecolor": "#64748B", "linewidth": 1, "linestyle": 3, "showLabel": true, "textColor": "#64748B" } });
    return "ok";
  })()`);

  // ═══ FVG ═══
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${t - 300}, price: 1.13855 }, { time: ${tFar}, price: 1.13731 }], { shape: "rectangle", text: "BULL FVG (26% filled) — bounce zone", overrides: { "backgroundColor": "#22C55E10", "borderColor": "#22C55E33", "borderWidth": 1, "borderStyle": 1 } });
    return "ok";
  })()`);

  // ═══ INFO ═══
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tWide}, price: 1.1490 }, { time: ${t + 800}, price: 1.1550 }], {
      shape: "text",
      text: "EURUSD — ICT ANALYSIS | Jul 29 London\\n\\n✅ SELL PROFILE (DELAYED)\\nEntry: SHORT 1.13940 | SL: 1.14131\\nTP1: 1.13610 | TP2: 1.13279 | R:R 1.73/3.46\\n\\nPo3: 1D DIST | ⚡4H MANIP | Micro DIST\\nMMXM: 4H Step2 LAGGING 1D Step3\\nAMD: PURE DISCOUNT (100% consensus)\\n3 days 1D↓/4H↑ COMPRESSION\\n\\n⚠️ Sell profile vs AMD buy signal\\n⚠️ If 1D prints CHoCH → flip LONG 100p\\n🛑 FOMC 14:00 — close by 13:45"
    });
    return "ok";
  })()`);

  // ═══ MANIPULATION ZONE ═══
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${t - 200}, price: 1.1420 }, { time: ${tEnd}, price: 1.1390 }], { shape: "rectangle", text: "4H MANIPULATION ZONE", overrides: { "backgroundColor": "#E040FB10", "borderColor": "#E040FB33", "borderWidth": 1 } });
    return "ok";
  })()`);

  // ═══ DIVERGENCE WARNING ═══
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tEnd + 400}, price: 1.1345 }, { time: ${tEnd + 800}, price: 1.1360 }], {
      shape: "text",
      text: "⚠️ 1D↓ vs 4H↑\\n3-DAY COMPRESSION\\nBreakout imminent"
    });
    return "ok";
  })()`);

  await client.close();
  console.log("✅ EURUSD 1m drawn — 15 levels");
  console.log("ENTRY 1.13940 | SL 1.14131 | TP1 1.13610 | TP2 1.13279");
})();
