const CDP = require("chrome-remote-interface");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = "C:\\Users\\cash\\smc-icm-trading";
const DATE = new Date().toISOString().split("T")[0];

async function run(client, expr) {
  await client.Runtime.evaluate({ expression: expr, returnByValue: true });
}

function r5(v) { return Number(v).toFixed(5); }

// Load engine
function loadEngine(pair, tf) {
  try {
    const dir = pair === "GOLD" ? "GOLD" : pair === "NAS100" ? "NAS100" : pair === "DXY" ? "DXY" : pair;
    return JSON.parse(fs.readFileSync(path.join(ROOT, "shared", DATE, dir, `engine_${tf}.json`), "utf8"));
  } catch(e) { return null; }
}

(async () => {
  const r = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await r.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!chart) { console.log("No chart"); process.exit(1); }
  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();

  // ═══════════════════════════════════════════════════════
  // GBPUSD — Weekly + Daily (Best: Position, Swing, Day)
  // ═══════════════════════════════════════════════════════
  console.error("\n=== GBPUSD WEEKLY ===");

  const gb1w = loadEngine("GBPUSD", "1w"), gb1d = loadEngine("GBPUSD", "1d"), gb4h = loadEngine("GBPUSD", "4h");

  await run(client, `(function() {
    window.TradingViewApi._activeChartWidgetWV.value().setSymbol("GBPUSD", {});
    window.TradingViewApi._activeChartWidgetWV.value().setResolution("1W");
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 4000));

  let timeRes = await client.Runtime.evaluate({
    expression: `(function() {
      var bars = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().bars();
      var end = bars.lastIndex();
      return JSON.stringify({ t: bars.valueAt(Math.max(bars.firstIndex(), end - 100))[0], tEnd: bars.valueAt(end)[0] });
    })()`,
    returnByValue: true
  });
  let { t, tEnd } = JSON.parse(timeRes.result.value);
  let tFar = tEnd + 86400 * 60;

  await run(client, `(function() {
    try { window.TradingViewApi._activeChartWidgetWV.value().removeAllShapes(); } catch(e) {}
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 400));

  // Weekly levels
  const wSwHi = gb1w?.structure?.lastSwingHigh || 1.20831;
  const wSwLo = gb1w?.structure?.lastSwingLow || 1.13246;
  const wEQ = (wSwHi + wSwLo) / 2;

  const weeklyLevels = [
    { price: wSwHi, label: "1W Swing H", color: "#FF9800", w: 2, s: 0 },
    { price: wEQ, label: "1W EQ (fair value)", color: "#CE93D8", w: 2, s: 1 },
    { price: 1.33990, label: "IPDA Weekly EQ", color: "#AB47BC", w: 2, s: 2 },
    { price: wSwLo, label: "1W Swing L", color: "#FF9800", w: 2, s: 0 },
  ];
  for (const l of weeklyLevels) {
    await run(client, `(function() {
      window.TradingViewApi._activeChartWidgetWV.value().createShape(
        { time: ${t}, price: ${l.price} },
        { shape: "horizontal_line", text: "${l.label}", overrides: { "linecolor": "${l.color}", "linewidth": ${l.w}, "linestyle": ${l.s}, "showLabel": true } }
      );
      return "ok";
    })()`);
  }

  // Weekly zone label
  await run(client, `(function() {
    try {
      window.TradingViewApi._activeChartWidgetWV.value().createShape(
        { time: ${t + 86400*30} },
        { time: ${t + 86400*50}, price: ${wSwHi + 0.005} },
        { shape: "text", text: "GBPUSD WEEKLY | Position: BEARISH | DISCOUNT zone | Draw UP to EQ 1.3399 | IPDA: Buy zone" }
      );
    } catch(e) {}
    return "ok";
  })()`);

  // ═══════════════════════════════════════════════════════
  // GBPUSD — Daily (Swing + Day entry context)
  // ═══════════════════════════════════════════════════════
  console.error("=== GBPUSD DAILY ===");

  await run(client, `(function() {
    window.TradingViewApi._activeChartWidgetWV.value().setResolution("1D");
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 3000));

  timeRes = await client.Runtime.evaluate({
    expression: `(function() {
      var bars = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().bars();
      return JSON.stringify({ t: bars.valueAt(Math.max(bars.firstIndex(), bars.lastIndex() - 200))[0], tEnd: bars.valueAt(bars.lastIndex())[0] });
    })()`,
    returnByValue: true
  });
  let tInfo = JSON.parse(timeRes.result.value);
  t = tInfo.t; tEnd = tInfo.tEnd; tFar = tEnd + 86400 * 15;

  const dSwHi = gb1d?.structure?.lastSwingHigh || 1.16221;
  const dSwLo = gb1d?.structure?.lastSwingLow || 1.13775;

  const dailyLevels = [
    { price: 1.34076, label: "🛑 Swing SL", color: "#FF1744", w: 3, s: 0 },
    { price: dSwHi, label: "1D Swing H", color: "#FF9800", w: 1, s: 2 },
    { price: 1.33239, label: "▼ ENTRY (Swing)", color: "#FFD700", w: 3, s: 0 },
    { price: dSwLo, label: "1D Swing L", color: "#FF9800", w: 1, s: 2 },
    { price: 1.32402, label: "✅ TP1 (Swing 1:1)", color: "#00E676", w: 3, s: 0 },
    { price: 1.31566, label: "✅ TP2 (Swing 1:2)", color: "#00C853", w: 2, s: 0 },
  ];
  for (const l of dailyLevels) {
    await run(client, `(function() {
      window.TradingViewApi._activeChartWidgetWV.value().createShape(
        { time: ${t}, price: ${l.price} },
        { shape: "horizontal_line", text: "${l.label}", overrides: { "linecolor": "${l.color}", "linewidth": ${l.w}, "linestyle": ${l.s}, "showLabel": true } }
      );
      return "ok";
    })()`);
  }

  // Risk/Reward zones
  await run(client, `(function() {
    var api = window.TradingViewApi._activeChartWidgetWV.value();
    api.createMultipointShape([{ time: ${t - 86400*5}, price: 1.34076 }, { time: ${tFar}, price: 1.33239 }], { shape: "rectangle", text: "RISK", overrides: { "backgroundColor": "#FF174420", "borderColor": "#FF174455" } });
    api.createMultipointShape([{ time: ${t - 86400*5}, price: 1.33239 }, { time: ${tFar}, price: 1.32402 }], { shape: "rectangle", text: "REWARD", overrides: { "backgroundColor": "#00E67618", "borderColor": "#00E67644" } });
    return "ok";
  })()`);

  await run(client, `(function() {
    try {
      window.TradingViewApi._activeChartWidgetWV.value().createShape(
        { time: ${t + 86400*5} },
        { time: ${t + 86400*10}, price: 1.34400 },
        { shape: "text", text: "GBPUSD DAILY | Swing+Day: SHORT | SD 3/3 | Coherence 10/10 | Council 80% BEARISH | SL:79pips TP:79/158pips" }
      );
    } catch(e) {}
    return "ok";
  })()`);

  // ═══════════════════════════════════════════════════════
  // DXY — 1m (Scalper's best)
  // ═══════════════════════════════════════════════════════
  console.error("=== DXY 1M ===");

  await run(client, `(function() {
    window.TradingViewApi._activeChartWidgetWV.value().setSymbol("USDOLLAR", {});
    window.TradingViewApi._activeChartWidgetWV.value().setResolution("1");
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 3500));

  timeRes = await client.Runtime.evaluate({
    expression: `(function() {
      var bars = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().bars();
      return JSON.stringify({ t: bars.valueAt(Math.max(bars.firstIndex(), bars.lastIndex() - 400))[0], tEnd: bars.valueAt(bars.lastIndex())[0] });
    })()`,
    returnByValue: true
  });
  tInfo = JSON.parse(timeRes.result.value);
  t = tInfo.t; tEnd = tInfo.tEnd; tFar = tEnd + 1800;

  // Clear
  await run(client, `(function() {
    try { window.TradingViewApi._activeChartWidgetWV.value().removeAllShapes(); } catch(e) {}
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 400));

  const dxyR1m = loadEngine("DXY", "1m");
  const dxySwHi = dxyR1m?.structure?.lastSwingHigh || 12791;
  const dxySwLo = dxyR1m?.structure?.lastSwingLow || 12790;
  const dxyEntry = dxyR1m?.price || 12792;
  const dxySL = dxySwLo - 1;
  const dxySLDist = dxyEntry - dxySL;
  const dxyTP1 = dxyEntry + dxySLDist;
  const dxyTP2 = dxyEntry + dxySLDist * 2;

  const dxyLevels = [
    { price: dxyEntry, label: "▼ ENTRY (Scalp)", color: "#FFD700", w: 3, s: 0 },
    { price: dxySwHi, label: "1m Sw H", color: "#FF9800", w: 1, s: 2 },
    { price: dxySwLo, label: "1m Sw L", color: "#FF9800", w: 1, s: 2 },
    { price: dxySL, label: "🛑 SL", color: "#FF1744", w: 3, s: 0 },
    { price: dxyTP1, label: "✅ TP1", color: "#00E676", w: 2, s: 0 },
    { price: dxyTP2, label: "✅ TP2", color: "#00C853", w: 2, s: 0 },
  ];
  for (const l of dxyLevels) {
    await run(client, `(function() {
      window.TradingViewApi._activeChartWidgetWV.value().createShape(
        { time: ${t}, price: ${l.price} },
        { shape: "horizontal_line", text: "${l.label}", overrides: { "linecolor": "${l.color}", "linewidth": ${l.w}, "linestyle": ${l.s}, "showLabel": true } }
      );
      return "ok";
    })()`);
  }

  await run(client, `(function() {
    try {
      window.TradingViewApi._activeChartWidgetWV.value().createShape(
        { time: ${t + 300} },
        { time: ${t + 1200}, price: ${dxySwHi + 2} },
        { shape: "text", text: "DXY 1m LONG (Scalp) | 1mInv:YES 6/8 | Fractal:13/20 | STRONG 1.75x | Scalp only - don't hold" }
      );
    } catch(e) {}
    return "ok";
  })()`);

  await client.close();
  console.log(JSON.stringify({status:"done", pairs:["GBPUSD 1W+1D","DXY 1m"]}));
})();
