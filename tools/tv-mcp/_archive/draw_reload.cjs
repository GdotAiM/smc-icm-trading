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
  const r5m = JSON.parse(fs.readFileSync(path.join(sharedDir, "engine_5m.json"), "utf8"));
  const r1m = JSON.parse(fs.readFileSync(path.join(sharedDir, "engine_1m.json"), "utf8"));

  let fractal = null;
  try { fractal = JSON.parse(execSync(`node "${ROOT}\\tools\\fractal_mmxm.cjs" GBPUSD`, { stdio: ["ignore","pipe","ignore"], encoding: "utf8", timeout: 10000 })); } catch(e) {}

  // ═══════════════════════════════════════════
  // 5M CHART — THE RELOAD SIGNAL
  // ═══════════════════════════════════════════
  console.error("\n=== GBPUSD 5m — RELOAD SIGNAL ===");

  await run(client, `(function() {
    window.TradingViewApi._activeChartWidgetWV.value().setSymbol("GBPUSD", {});
    window.TradingViewApi._activeChartWidgetWV.value().setResolution("5");
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 3500));

  let timeRes = await client.Runtime.evaluate({
    expression: `(function() {
      var bars = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().bars();
      var end = bars.lastIndex();
      return JSON.stringify({ t: bars.valueAt(Math.max(bars.firstIndex(), end - 200))[0], tEnd: bars.valueAt(end)[0] });
    })()`,
    returnByValue: true
  });
  let { t, tEnd } = JSON.parse(timeRes.result.value);
  let tFar = tEnd + 3600 * 6;

  await run(client, `(function() {
    try { window.TradingViewApi._activeChartWidgetWV.value().removeAllShapes(); } catch(e) {}
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 400));

  const p5 = r5m.price, s5Hi = r5m.structure.lastSwingHigh, s5Lo = r5m.structure.lastSwingLow;
  const buf5 = Math.abs(s5Hi - s5Lo) * 0.15;
  const sl5 = s5Hi + buf5, slDist5 = sl5 - p5, tp1_5 = p5 - slDist5, tp2_5 = p5 - slDist5 * 2;

  const levels5 = [
    { price: sl5, label: "🛑 SL (5m Sw H)", color: "#FF1744", w: 3, s: 0 },
    { price: s5Hi, label: "5m Sw H", color: "#FF9800", w: 2, s: 0 },
    { price: p5, label: "▼ ENTRY (5m reload)", color: "#FFD700", w: 3, s: 0 },
    { price: s5Lo, label: "5m Sw L", color: "#FF9800", w: 2, s: 0 },
    { price: tp1_5, label: "✅ TP1 (1:1)", color: "#00E676", w: 3, s: 0 },
    { price: tp2_5, label: "✅ TP2 (1:2)", color: "#00C853", w: 2, s: 0 },
  ];
  for (const l of levels5) {
    await run(client, `(function() {
      window.TradingViewApi._activeChartWidgetWV.value().createShape(
        { time: ${t}, price: ${l.price} },
        { shape: "horizontal_line", text: "${l.label}", overrides: { "linecolor": "${l.color}", "linewidth": ${l.w}, "linestyle": ${l.s}, "showLabel": true } }
      );
      return "ok";
    })()`);
  }

  // Risk/Reward
  await run(client, `(function() {
    var api = window.TradingViewApi._activeChartWidgetWV.value();
    api.createMultipointShape([{ time: ${t - 1800}, price: ${sl5} }, { time: ${tFar}, price: ${p5} }], { shape: "rectangle", text: "RISK", overrides: { "backgroundColor": "#FF174420", "borderColor": "#FF174455" } });
    api.createMultipointShape([{ time: ${t - 1800}, price: ${p5} }, { time: ${tFar}, price: ${tp1_5} }], { shape: "rectangle", text: "REWARD", overrides: { "backgroundColor": "#00E67618", "borderColor": "#00E67644" } });
    return "ok";
  })()`);

  // 15m context
  const r15m = JSON.parse(fs.readFileSync(path.join(sharedDir, "engine_15m.json"), "utf8"));
  if (r15m.structure.lastSwingHigh) {
    await run(client, `(function() {
      window.TradingViewApi._activeChartWidgetWV.value().createShape(
        { time: ${t}, price: ${r15m.structure.lastSwingHigh} },
        { shape: "horizontal_line", text: "15m Sw H", overrides: { "linecolor": "#E65100", "linewidth": 1, "linestyle": 2, "showLabel": true } }
      );
      return "ok";
    })()`);
  }

  const label5 = `🔄 5M RELOAD | BEARISH CHoCH + 2 SWEEPS | MMXM:5m=S2(Manip) | 1m waiting to confirm | Entry on 1m bearish CHoCH`;
  await run(client, `(function() {
    try {
      window.TradingViewApi._activeChartWidgetWV.value().createShape(
        { time: ${t + 900} },
        { time: ${t + 3600}, price: ${s5Hi + (sl5 - s5Hi) * 0.3} },
        { shape: "text", text: "${label5}" }
      );
    } catch(e) {}
    return "ok";
  })()`);

  console.error(`  5m SHORT @ ${r5(p5)} | SL: ${r5(sl5)} | CHoCH + 2 sweeps`);

  // ═══════════════════════════════════════════
  // 1M CHART — WAITING FOR CONFIRMATION
  // ═══════════════════════════════════════════
  console.error("\n=== GBPUSD 1m — WAITING ===");

  await run(client, `(function() {
    window.TradingViewApi._activeChartWidgetWV.value().setResolution("1");
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 3000));

  timeRes = await client.Runtime.evaluate({
    expression: `(function() {
      var bars = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().bars();
      var end = bars.lastIndex();
      return JSON.stringify({ t: bars.valueAt(Math.max(bars.firstIndex(), end - 400))[0], tEnd: bars.valueAt(end)[0] });
    })()`,
    returnByValue: true
  });
  let tInfo = JSON.parse(timeRes.result.value);
  t = tInfo.t; tEnd = tInfo.tEnd; tFar = tEnd + 1800;

  await run(client, `(function() {
    try { window.TradingViewApi._activeChartWidgetWV.value().removeAllShapes(); } catch(e) {}
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 400));

  const p1 = r1m.price, s1Hi = r1m.structure.lastSwingHigh, s1Lo = r1m.structure.lastSwingLow;
  const buf1 = Math.abs(s1Hi - s1Lo) * 0.15;
  const sl1 = s1Hi + buf1, slDist1 = sl1 - p1, tp1_1 = p1 - slDist1, tp2_1 = p1 - slDist1 * 2;

  const levels1 = [
    { price: sl1, label: "🛑 SL (1m)", color: "#FF1744", w: 3, s: 0 },
    { price: s1Hi, label: "1m Sw H", color: "#FF9800", w: 1, s: 2 },
    { price: p1, label: "⏳ WAIT (1m)", color: "#FFD700", w: 3, s: 0 },
    { price: s1Lo, label: "1m Sw L", color: "#FF9800", w: 1, s: 2 },
    { price: tp1_1, label: "✅ TP1", color: "#00E676", w: 2, s: 0 },
    { price: tp2_1, label: "✅ TP2", color: "#00C853", w: 2, s: 0 },
  ];
  for (const l of levels1) {
    await run(client, `(function() {
      window.TradingViewApi._activeChartWidgetWV.value().createShape(
        { time: ${t}, price: ${l.price} },
        { shape: "horizontal_line", text: "${l.label}", overrides: { "linecolor": "${l.color}", "linewidth": ${l.w}, "linestyle": ${l.s}, "showLabel": true } }
      );
      return "ok";
    })()`);
  }

  // 5m context lines
  await run(client, `(function() {
    var api = window.TradingViewApi._activeChartWidgetWV.value();
    api.createShape({ time: ${t}, price: ${s5Hi} }, { shape: "horizontal_line", text: "5m Sw H", overrides: { "linecolor": "#E65100", "linewidth": 1, "linestyle": 2, "showLabel": true } });
    api.createShape({ time: ${t}, price: ${s5Lo} }, { shape: "horizontal_line", text: "5m Sw L", overrides: { "linecolor": "#E65100", "linewidth": 1, "linestyle": 2, "showLabel": true } });
    return "ok";
  })()`);

  const label1 = `⏳ 1M WAITING | 5m says SHORT (CHoCH+2sweeps) | 1m still BULLISH | Wait for 1m bearish CHoCH + FVG | Then ENTER`;
  await run(client, `(function() {
    try {
      window.TradingViewApi._activeChartWidgetWV.value().createShape(
        { time: ${t + 300} },
        { time: ${t + 1200}, price: ${s1Hi + (sl1 - s1Hi) * 0.3} },
        { shape: "text", text: "${label1}" }
      );
    } catch(e) {}
    return "ok";
  })()`);

  console.error(`  1m WAITING @ ${r5(p1)} | Current: BULLISH | 5m says SHORT`);

  await client.close();
  console.log(JSON.stringify({
    status: "done",
    _5m: { entry: r5(p5), sl: r5(sl5), tp1: r5(tp1_5), signal: "CHoCH bearish + 2 sweeps" },
    _1m: { entry: r5(p1), sl: r5(sl1), tp1: r5(tp1_1), signal: "WAITING for bearish CHoCH" },
    fractal: fractal ? `${fractal.fractalScore}/20 ${fractal.fractalLabel}` : "N/A",
  }));
})();
