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

(async () => {
  const r = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await r.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!chart) { console.log("No chart"); process.exit(1); }
  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();

  const sharedDir = path.join(ROOT, "shared", DATE, "GBPUSD");
  const r1m = JSON.parse(fs.readFileSync(path.join(sharedDir, "engine_1m.json"), "utf8"));
  const r5m = JSON.parse(fs.readFileSync(path.join(sharedDir, "engine_5m.json"), "utf8"));

  // Switch to GBPUSD 1m
  console.error("Loading GBPUSD 1m...");
  await run(client, `(function() {
    window.TradingViewApi._activeChartWidgetWV.value().setSymbol("GBPUSD", {});
    window.TradingViewApi._activeChartWidgetWV.value().setResolution("1");
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 4000));

  const timeRes = await client.Runtime.evaluate({
    expression: `(function() {
      var bars = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().bars();
      var end = bars.lastIndex();
      return JSON.stringify({ t: bars.valueAt(Math.max(bars.firstIndex(), end - 500))[0], tEnd: bars.valueAt(end)[0] });
    })()`,
    returnByValue: true
  });
  const { t, tEnd } = JSON.parse(timeRes.result.value);
  const tFar = tEnd + 1800;

  // Clear
  await run(client, `(function() {
    try { window.TradingViewApi._activeChartWidgetWV.value().removeAllShapes(); } catch(e) {}
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 500));

  const price = r1m.price;
  const bias1m = r1m.structure.bias;
  const event1m = r1m.structure.lastEvent || "none";
  const swept1m = (r1m.liquidity || []).filter(p => p.swept).length;
  const disp = r1m.volumeDisplacement?.label || "weak";
  const dispRatio = r1m.volumeDisplacement?.atrRatio || 0;
  const fvgs = r1m.fvgs?.length || 0;

  // ⚠️ Use 5M STRUCTURE for SL/TP — this is a 5m setup executing on 1m
  const s5Hi = r5m.structure.lastSwingHigh;
  const s5Lo = r5m.structure.lastSwingLow;
  const buffer = Math.abs(s5Hi - s5Lo) * 0.15;
  const sl = s5Hi + buffer;                    // SL at 5m swing high
  const slDist = Math.abs(price - sl);          // Risk from current 1m price to 5m SL
  const tp1 = price - slDist;                   // 1:1 from entry
  const tp2 = price - slDist * 2;               // 1:2 from entry

  console.error(`1m: ${bias1m} ${event1m} @ ${r5(price)} | 5m SL:${r5(sl)}(${Math.round(slDist*10000)}pips) | TP1:${r5(tp1)}(${Math.round(slDist*10000)}pips) | TP2:${r5(tp2)}`);

  // ═══════════════════════════════════════════
  // LEVELS — 5m structure for SL/TP, 1m for entry
  // ═══════════════════════════════════════════
  const levels = [
    { price: sl, label: "🛑 SL (5m Sw H)", color: "#FF1744", w: 3, s: 0 },
    { price: s5Hi, label: "5m Sw H", color: "#E65100", w: 2, s: 0 },
    { price: price, label: "⏳ 1m ENTRY (wait)", color: "#FFD700", w: 3, s: 0 },
    { price: r1m.structure.lastSwingHigh, label: "1m Sw H", color: "#FF9800", w: 1, s: 2 },
    { price: r1m.structure.lastSwingLow, label: "1m Sw L", color: "#FF9800", w: 1, s: 2 },
    { price: tp1, label: "✅ TP1 (1:1)", color: "#00E676", w: 3, s: 0 },
    { price: tp2, label: "✅ TP2 (1:2)", color: "#00C853", w: 2, s: 0 },
  ];
  for (const l of levels) {
    if (!l.price || l.price === 0) continue;
    await run(client, `(function() {
      window.TradingViewApi._activeChartWidgetWV.value().createShape(
        { time: ${t}, price: ${l.price} },
        { shape: "horizontal_line", text: "${l.label}", overrides: { "linecolor": "${l.color}", "linewidth": ${l.w}, "linestyle": ${l.s}, "showLabel": true } }
      );
      return "ok";
    })()`);
    console.error(`  ${l.label} @ ${l.price}`);
  }

  // Risk/Reward zones
  await run(client, `(function() {
    var api = window.TradingViewApi._activeChartWidgetWV.value();
    api.createMultipointShape([{ time: ${t - 300}, price: ${sl} }, { time: ${tFar}, price: ${price} }], { shape: "rectangle", text: "RISK", overrides: { "backgroundColor": "#FF174425", "borderColor": "#FF174466" } });
    api.createMultipointShape([{ time: ${t - 300}, price: ${price} }, { time: ${tFar}, price: ${tp1} }], { shape: "rectangle", text: "REWARD", overrides: { "backgroundColor": "#00E67618", "borderColor": "#00E67644" } });
    return "ok";
  })()`);

  // ═══════════════════════════════════════════
  // CONTEXT LABEL
  // ═══════════════════════════════════════════
  const slPips = Math.round(slDist * 10000);
  const labelText = `⏳ 1m WAITING | 5m:BEARISH CHoCH+2sweeps | 1m:${bias1m} ${event1m} | SL:${slPips}pips (5m swing) | TP1:${slPips}pips | TP2:${slPips*2}pips | When 1m flips BEARISH → ENTER SHORT`;

  await run(client, `(function() {
    try {
      window.TradingViewApi._activeChartWidgetWV.value().createShape(
        { time: ${t + 300} },
        { time: ${t + 1200}, price: ${s5Hi + (sl - s5Hi) * 0.4} },
        { shape: "text", text: "${labelText}" }
      );
    } catch(e) {}
    return "ok";
  })()`);

  await client.close();
  console.log(JSON.stringify({
    pair: "GBPUSD", tf: "1m",
    price: r5(price), sl: r5(sl), slPips: Math.round(slDist * 10000),
    tp1: r5(tp1), tp2: r5(tp2),
    _5m: `${r5m.structure.bias} ${r5m.structure.lastEvent}`,
    signal: "WAITING for 1m bearish CHoCH to confirm 5m reload",
  }));
})();
