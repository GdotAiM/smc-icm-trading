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

  // Get fractal + engine data
  let fractal = null, r1m = null, r5m = null;
  try {
    fractal = JSON.parse(execSync(`node "${ROOT}\\tools\\fractal_mmxm.cjs" GBPUSD`, { stdio: ["ignore","pipe","ignore"], encoding: "utf8", timeout: 10000 }));
  } catch(e) {}
  try {
    const dir = path.join(ROOT, "shared", DATE, "GBPUSD");
    r1m = JSON.parse(fs.readFileSync(path.join(dir, "engine_1m.json"), "utf8"));
    r5m = JSON.parse(fs.readFileSync(path.join(dir, "engine_5m.json"), "utf8"));
  } catch(e) { console.error("No engine data"); process.exit(1); }

  const price = r1m.price;
  const swHi = r1m.structure.lastSwingHigh || price;
  const swLo = r1m.structure.lastSwingLow || price;
  const bias = r1m.structure.bias;
  const event = r1m.structure.lastEvent || "none";
  const fvgs = r1m.fvgs?.length || 0;
  const disp = r1m.volumeDisplacement?.label || "weak";
  const dispRatio = r1m.volumeDisplacement?.atrRatio || 0;

  const buffer = Math.abs(swHi - swLo) * 0.15;
  const isBear = bias === "bearish";
  const sl = isBear ? swHi + buffer : swLo - buffer;
  const slDist = Math.abs(price - sl);
  const tp1 = isBear ? price - slDist : price + slDist;
  const tp2 = isBear ? price - slDist * 2 : price + slDist * 2;
  const dir = isBear ? "SHORT" : "LONG";

  // Switch to 1m
  console.error("Loading GBPUSD 1m...");
  await run(client, `(function() {
    window.TradingViewApi._activeChartWidgetWV.value().setSymbol("GBPUSD", {});
    window.TradingViewApi._activeChartWidgetWV.value().setResolution("1");
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 3500));

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
  await new Promise(r => setTimeout(r, 400));

  console.error(`Drawing GBPUSD 1m — ${dir} | 1m Inv: ${fractal?.inversionDetected ? 'YES' : 'NOT YET'} (${fractal?.inversionScore}/8) | Fractal: ${fractal?.fractalScore}/20`);

  // ── 1m Trade Levels ──
  const levels = [
    { price: sl, label: "🛑 SL (1m)", color: "#FF1744", w: 3, s: 0 },
    { price: swHi, label: "1m Sw H", color: "#FF9800", w: 1, s: 2 },
    { price: price, label: "▼ ENTRY (1m)", color: "#FFD700", w: 3, s: 0 },
    { price: swLo, label: "1m Sw L", color: "#FF9800", w: 1, s: 2 },
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
  }

  // Risk/Reward zones
  await run(client, `(function() {
    var api = window.TradingViewApi._activeChartWidgetWV.value();
    api.createMultipointShape([{ time: ${t - 300}, price: ${sl} }, { time: ${tFar}, price: ${price} }], { shape: "rectangle", text: "RISK", overrides: { "backgroundColor": "#FF174420", "borderColor": "#FF174455" } });
    api.createMultipointShape([{ time: ${t - 300}, price: ${price} }, { time: ${tFar}, price: ${tp1} }], { shape: "rectangle", text: "REWARD 1:1", overrides: { "backgroundColor": "#00E67618", "borderColor": "#00E67644" } });
    return "ok";
  })()`);

  // ── Fractal MMXM Step Labels ──
  if (fractal) {
    const steps = Object.entries(fractal.mmxmSteps).map(([tf, step]) => `${tf}:S${step}`).join(" ");
    await run(client, `(function() {
      try {
        window.TradingViewApi._activeChartWidgetWV.value().createShape(
          { time: ${t + 300} },
          { time: ${t + 1200}, price: ${swHi + (sl - swHi) * 0.3} },
          { shape: "text", text: "GBPUSD 1m ${dir} | MMXM: ${steps} | 1mInv: ${fractal.inversionDetected ? 'YES' : 'NOT'}(${fractal.inversionScore}/8) | Fractal: ${fractal.fractalScore}/20 | ISD:3/3 | Nest:${fractal.nestingScore}/6 | ${bias} ${event} | ${fvgs}FVG | ${disp} ${dispRatio.toFixed(1)}x" }
        );
      } catch(e) {}
      return "ok";
    })()`);
  }

  // ── 5m context levels (dashed) ──
  if (r5m) {
    const s5Hi = r5m.structure.lastSwingHigh;
    const s5Lo = r5m.structure.lastSwingLow;
    if (s5Hi) {
      await run(client, `(function() {
        window.TradingViewApi._activeChartWidgetWV.value().createShape(
          { time: ${t}, price: ${s5Hi} },
          { shape: "horizontal_line", text: "5m Sw H", overrides: { "linecolor": "#E65100", "linewidth": 1, "linestyle": 2, "showLabel": true } }
        );
        return "ok";
      })()`);
    }
    if (s5Lo) {
      await run(client, `(function() {
        window.TradingViewApi._activeChartWidgetWV.value().createShape(
          { time: ${t}, price: ${s5Lo} },
          { shape: "horizontal_line", text: "5m Sw L", overrides: { "linecolor": "#E65100", "linewidth": 1, "linestyle": 2, "showLabel": true } }
        );
        return "ok";
      })()`);
    }
  }

  await client.close();
  console.log(JSON.stringify({
    pair: "GBPUSD", tf: "1m", dir,
    entry: r5(price), sl: r5(sl), tp1: r5(tp1), tp2: r5(tp2),
    inversion: fractal?.inversionDetected ? `DETECTED (${fractal.inversionScore}/8)` : "NOT YET",
    fractal: `${fractal?.fractalScore}/20`,
    mmxmSteps: fractal?.mmxmSteps,
  }));
})();
