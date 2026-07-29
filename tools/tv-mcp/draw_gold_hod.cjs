// Draw GOLD Drop — HOD confirmed, distribution starting
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
      var start = Math.max(bars.firstIndex(), end - 120);
      return JSON.stringify({ t: bars.valueAt(start)[0], tEnd: bars.valueAt(end)[0] });
    })()`,
    returnByValue: true
  });
  const { t, tEnd } = JSON.parse(timeRes.result.value);
  const tWide = t - 300;
  const tFar = tEnd + 1800;
  const api = "window.TradingViewApi._activeChartWidgetWV.value()";

  await run(client, `(function() { try { ${api}.removeAllShapes(); } catch(e) {} return "ok"; })()`);
  await new Promise(r => setTimeout(r, 500));

  console.log("Drawing GOLD HOD + Drop + Entry Setup");

  // HOD line
  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd - 600}, price: 4055.60 }, { shape: "horizontal_line", text: "HOD 4055.6 (04:06 NY) — MANIPULATION PEAK", overrides: { "linecolor": "#E040FB", "linewidth": 3, "linestyle": 0, "showLabel": true, "textColor": "#E040FB" } });
    return "ok";
  })()`);

  // Current price
  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd + 400}, price: 4052.90 }, { shape: "horizontal_line", text: "NOW 4052.90 — dropping from HOD", overrides: { "linecolor": "#FFFFFF", "linewidth": 3, "linestyle": 0, "showLabel": true, "textColor": "#FFFFFF" } });
    return "ok";
  })()`);

  // 5m BSL exhaustion
  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd}, price: 4051.93 }, { shape: "horizontal_line", text: "5m BSL 4052 (exhaustion — 15 touches)", overrides: { "linecolor": "#FFAB00", "linewidth": 1, "linestyle": 3, "showLabel": true, "textColor": "#FFAB00" } });
    return "ok";
  })()`);

  // 15m SSL target
  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide}, price: 4044.05 }, { shape: "horizontal_line", text: "TP1: 15m SSL 4044", overrides: { "linecolor": "#00E676", "linewidth": 2, "linestyle": 0, "showLabel": true, "textColor": "#00E676" } });
    return "ok";
  })()`);

  // 5m forecast target
  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide}, price: 4023.92 }, { shape: "horizontal_line", text: "TP2: 5m Fcst 4024", overrides: { "linecolor": "#00C853", "linewidth": 1, "linestyle": 3, "showLabel": true, "textColor": "#00C853" } });
    return "ok";
  })()`);

  // Manipulation zone (London bounce)
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${t - 200}, price: 4055.60 }, { time: ${tEnd + 200}, price: 4047.00 }], { shape: "rectangle", text: "LONDON MANIPULATION", overrides: { "backgroundColor": "#E040FB12", "borderColor": "#E040FB33", "borderWidth": 1 } });
    return "ok";
  })()`);

  // Distribution zone
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tEnd + 200}, price: 4055.60 }, { time: ${tFar}, price: 4044.05 }], { shape: "rectangle", text: "DISTRIBUTION", overrides: { "backgroundColor": "#FF174418", "borderColor": "#FF174444", "borderWidth": 1, "borderStyle": 2 } });
    return "ok";
  })()`);

  // Displacement arrow zone
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tEnd - 200}, price: 4055.60 }, { time: ${tEnd + 100}, price: 4051.30 }], { shape: "rectangle", text: "DROP -$4.3", overrides: { "backgroundColor": "#FF174430", "borderColor": "#FF174466", "borderWidth": 1 } });
    return "ok";
  })()`);

  // Info panel
  await run(client, `(function() {
    var api = ${api};
    api.createMultipointShape([
      { time: ${tWide}, price: 4062.00 },
      { time: ${t + 200}, price: 4070.00 }
    ], {
      shape: "text",
      text: "GOLD — HOD CONFIRMED, DISTRIBUTION STARTING\\n\\nHOD: 4055.6 at 04:06 NY — manipulation peak\\nDROP: 4055.6 -> 4051.3 (-$4.30) in minutes\\n5m BSL 4052 swept — exhaustion confirmed\\n\\nENTRY: SHORT on displacement FVG fill (~4053-4054)\\nSL: Above 4055.6 (HOD / structural invalidation)\\nTP1: 4044 (15m SSL) | TP2: 4024 (5m forecast)\\n\\nProfile: SELL — London Delayed Protraction\\nPHASE 4 DISTRIBUTION IS STARTING"
    });
    return "ok";
  })()`);

  // Phase label
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tEnd + 600}, price: 4058.00 }, { time: ${tEnd + 1000}, price: 4061.00 }], { shape: "text", text: "PHASE 4\\nDISTRIBUTION\\nSTARTING" });
    return "ok";
  })()`);

  await client.close();
  console.log("\nDONE — GOLD 1m: HOD 4055.6, Drop to 4052.9, Entry zone ~4053-4054");
})();
