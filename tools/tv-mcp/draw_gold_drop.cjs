// Draw GOLD Full Drop + Entry Setup
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

  console.log("Switching to GOLD 1m...");
  await run(client, `(function() {
    window.TradingViewApi._activeChartWidgetWV.value().setSymbol("XAUUSD", {});
    window.TradingViewApi._activeChartWidgetWV.value().setResolution("1");
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 3000));

  const timeRes = await client.Runtime.evaluate({
    expression: `(function() {
      var bars = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().bars();
      var end = bars.lastIndex();
      var start = Math.max(bars.firstIndex(), end - 150);
      return JSON.stringify({ t: bars.valueAt(start)[0], tEnd: bars.valueAt(end)[0] });
    })()`,
    returnByValue: true
  });
  const { t, tEnd } = JSON.parse(timeRes.result.value);
  const tWide = t - 400;
  const tFar = tEnd + 2400;
  const api = "window.TradingViewApi._activeChartWidgetWV.value()";

  await run(client, `(function() { try { ${api}.removeAllShapes(); } catch(e) {} return "ok"; })()`);
  await new Promise(r => setTimeout(r, 500));

  console.log("Drawing GOLD Full Drop + Entry Setup");

  // ═══════════ KEY LEVELS ═══════════

  // HOD
  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd - 800}, price: 4055.60 }, { shape: "horizontal_line", text: "HOD 4055.6 (04:06 NY)", overrides: { "linecolor": "#E040FB", "linewidth": 3, "linestyle": 0, "showLabel": true, "textColor": "#E040FB" } });
    return "ok";
  })()`);

  // 15m SSL — BREACHED
  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd - 400}, price: 4044.05 }, { shape: "horizontal_line", text: "15m SSL 4044 — BREACHED", overrides: { "linecolor": "#FF1744", "linewidth": 2, "linestyle": 2, "showLabel": true, "textColor": "#FF1744" } });
    return "ok";
  })()`);

  // Current price
  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd + 600}, price: 4043.90 }, { shape: "horizontal_line", text: "NOW 4043.90 — through 15m SSL", overrides: { "linecolor": "#FFFFFF", "linewidth": 3, "linestyle": 0, "showLabel": true, "textColor": "#FFFFFF" } });
    return "ok";
  })()`);

  // TP1 — 5m forecast
  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide}, price: 4023.92 }, { shape: "horizontal_line", text: "TP1: 5m Fcst 4024 (-$20)", overrides: { "linecolor": "#00E676", "linewidth": 2, "linestyle": 0, "showLabel": true, "textColor": "#00E676" } });
    return "ok";
  })()`);

  // TP2 — extended
  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide}, price: 4000.00 }, { shape: "horizontal_line", text: "TP2: 4000 (-$44)", overrides: { "linecolor": "#00C853", "linewidth": 1, "linestyle": 3, "showLabel": true, "textColor": "#00C853" } });
    return "ok";
  })()`);

  // ═══════════ ZONES ═══════════

  // Manipulation zone
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${t - 300}, price: 4055.60 }, { time: ${tEnd - 200}, price: 4047.00 }], { shape: "rectangle", text: "LONDON MANIPULATION", overrides: { "backgroundColor": "#E040FB10", "borderColor": "#E040FB33", "borderWidth": 1 } });
    return "ok";
  })()`);

  // THE DROP
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tEnd - 400}, price: 4055.60 }, { time: ${tEnd + 100}, price: 4043.90 }], { shape: "rectangle", text: "THE DROP -$11.70", overrides: { "backgroundColor": "#FF174425", "borderColor": "#FF174455", "borderWidth": 2 } });
    return "ok";
  })()`);

  // Displacement FVG (for entry on fill)
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tEnd - 200}, price: 4051.00 }, { time: ${tEnd + 300}, price: 4046.00 }], { shape: "rectangle", text: "FVG — pullback entry zone", overrides: { "backgroundColor": "#FFD70015", "borderColor": "#FFD70044", "borderWidth": 1 } });
    return "ok";
  })()`);

  // Continuation target zone
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tEnd + 200}, price: 4044.00 }, { time: ${tFar}, price: 4023.92 }], { shape: "rectangle", text: "EXPECTED CONTINUATION", overrides: { "backgroundColor": "#00E67610", "borderColor": "#00E67633", "borderWidth": 1, "borderStyle": 2 } });
    return "ok";
  })()`);

  // ═══════════ INFO ═══════════
  await run(client, `(function() {
    var api = ${api};
    api.createMultipointShape([
      { time: ${tWide}, price: 4065.00 },
      { time: ${t + 200}, price: 4074.00 }
    ], {
      shape: "text",
      text: "GOLD — DISTRIBUTION ACTIVE | COUNCIL 4/4\\n\\nHOD: 4055.6 (04:06) -> DROP -$11.70 -> 4043.9\\n15m SSL 4044 BREACHED\\n1m BEARISH BOS — trigger fired\\n\\nENTRY: SHORT on FVG pullback (~4046-4048)\\n  or MARKET at 4044 with wider SL\\nSL: Above HOD 4055.6 (structural)\\nTP1: 4024 (5m forecast) | TP2: 4000\\n\\nCouncil: 4/4 BEARISH (100%)\\nForecast: 5m BEARISH -$27 | 1m +$5 bounce"
    });
    return "ok";
  })()`);

  // Session labels
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tEnd + 800}, price: 4058.00 }, { time: ${tEnd + 1200}, price: 4061.00 }], { shape: "text", text: "LONDON SB\\n(consolidation)" });
    return "ok";
  })()`);
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tEnd + 1400}, price: 4035.00 }, { time: ${tEnd + 1800}, price: 4038.00 }], { shape: "text", text: "PRE-NY\\nDISTRIBUTION\\nACTIVE" });
    return "ok";
  })()`);

  await client.close();
  console.log("\nDONE — GOLD 1m: Full drop + entry drawn");
})();
