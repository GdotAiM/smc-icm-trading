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

  const pairs = [
    { name: "EURUSD", tv: "EURUSD", label: "EURUSD" },
    { name: "GBPUSD", tv: "GBPUSD", label: "GBPUSD" },
    { name: "GOLD", tv: "XAUUSD", label: "GOLD" },
    { name: "NAS100", tv: "US100", label: "NAS100" },
    { name: "DXY", tv: "USDOLLAR", label: "DXY" },
  ];

  for (const p of pairs) {
    console.error(`\n=== ${p.label} 5m ===`);

    const r5m = loadEngine(p.name, "5m");
    if (!r5m) { console.error(`  No 5m data`); continue; }

    const price = r5m.price;
    const swHi = r5m.structure.lastSwingHigh || price;
    const swLo = r5m.structure.lastSwingLow || price;
    const bias = r5m.structure.bias;
    const disp = r5m.volumeDisplacement?.label || "weak";
    const dispRatio = r5m.volumeDisplacement?.atrRatio || 0;
    const event = r5m.structure.lastEvent || "none";

    const buffer = Math.abs(swHi - swLo) * 0.15;
    const isBear = bias === "bearish";
    const sl = isBear ? swHi + buffer : swLo - buffer;
    const slDist = Math.abs(price - sl);
    const tp1 = isBear ? price - slDist : price + slDist;
    const tp2 = isBear ? price - slDist * 2 : price + slDist * 2;
    const dir = isBear ? "SHORT" : "LONG";

    // Get fractal data for this pair
    let fractal = null, ipda = null;
    try {
      fractal = JSON.parse(execSync(`node "${ROOT}\\tools\\fractal_mmxm.cjs" ${p.name}`, { stdio: ["ignore","pipe","ignore"], encoding: "utf8", timeout: 10000 }));
    } catch(e) {}
    try {
      ipda = JSON.parse(execSync(`node "${ROOT}\\tools\\ipda.cjs" ${p.name}`, { stdio: ["ignore","pipe","ignore"], encoding: "utf8", timeout: 10000 }));
    } catch(e) {}

    // Switch to 5m
    await run(client, `(function() {
      window.TradingViewApi._activeChartWidgetWV.value().setSymbol("${p.tv}", {});
      window.TradingViewApi._activeChartWidgetWV.value().setResolution("5");
      return "ok";
    })()`);
    await new Promise(r => setTimeout(r, 3500));

    const timeRes = await client.Runtime.evaluate({
      expression: `(function() {
        var bars = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().bars();
        var end = bars.lastIndex();
        return JSON.stringify({ t: bars.valueAt(Math.max(bars.firstIndex(), end - 300))[0], tEnd: bars.valueAt(end)[0] });
      })()`,
      returnByValue: true
    });
    const { t, tEnd } = JSON.parse(timeRes.result.value);
    const tFar = tEnd + 3600 * 4;

    // Clear
    await run(client, `(function() {
      try { window.TradingViewApi._activeChartWidgetWV.value().removeAllShapes(); } catch(e) {}
      return "ok";
    })()`);
    await new Promise(r => setTimeout(r, 400));

    // ── 5m Trade Levels ──
    const levels = [
      { price: sl, label: "🛑 SL", color: "#FF1744", w: 3, s: 0 },
      { price: swHi, label: "5m Sw H", color: "#FF9800", w: 1, s: 2 },
      { price: price, label: "▼ ENTRY", color: "#FFD700", w: 3, s: 0 },
      { price: swLo, label: "5m Sw L", color: "#FF9800", w: 1, s: 2 },
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

    // Risk/Reward
    await run(client, `(function() {
      var api = window.TradingViewApi._activeChartWidgetWV.value();
      api.createMultipointShape([{ time: ${t - 900}, price: ${sl} }, { time: ${tFar}, price: ${price} }], { shape: "rectangle", text: "RISK", overrides: { "backgroundColor": "#FF174420", "borderColor": "#FF174455", "linewidth": 1 } });
      api.createMultipointShape([{ time: ${t - 900}, price: ${price} }, { time: ${tFar}, price: ${tp1} }], { shape: "rectangle", text: "REWARD", overrides: { "backgroundColor": "#00E67618", "borderColor": "#00E67644", "linewidth": 1 } });
      return "ok";
    })()`);

    // IPDA EQ line
    if (ipda) {
      const eq5m = ipda.equilibriumCascade?.find(c => c.tf === "15m")?.eq;
      if (eq5m) {
        await run(client, `(function() {
          window.TradingViewApi._activeChartWidgetWV.value().createShape(
            { time: ${t}, price: ${eq5m} },
            { shape: "horizontal_line", text: "IPDA EQ", overrides: { "linecolor": "#CE93D8", "linewidth": 2, "linestyle": 1, "showLabel": true } }
          );
          return "ok";
        })()`);
      }
    }

    // Label
    const pipMult = p.label === "NAS100" ? 1 : p.label === "GOLD" ? 10 : 10000;
    const slPips = Math.round(slDist * pipMult);
    const invLabel = fractal?.inversionDetected ? "1mInv:YES" : "1mInv:NOT";
    const fracLabel = fractal ? `Frac:${fractal.fractalScore}/20` : "";
    const ipdaLabel = ipda ? `IPDA:${ipda.draw.consensus}` : "";
    const labelText = `${p.label} 5m ${dir} | ${bias} ${event} | ${disp} ${dispRatio.toFixed(1)}x | SL:${slPips} | R:R 1:1/2:1 | ${invLabel} | ${fracLabel} | ${ipdaLabel}`;

    await run(client, `(function() {
      try {
        window.TradingViewApi._activeChartWidgetWV.value().createShape(
          { time: ${t + 900} },
          { time: ${t + 3600}, price: ${swHi + (sl - swHi) * 0.3} },
          { shape: "text", text: "${labelText}" }
        );
      } catch(e) {}
      return "ok";
    })()`);

    console.error(`  ${dir} @ ${r5(price)} | SL: ${slPips} | ${disp} ${dispRatio.toFixed(1)}x | ${invLabel} | ${fracLabel}`);
  }

  await client.close();
  console.log(JSON.stringify({status:"done", tf:"5m", pairs: pairs.map(p => p.label)}));
})();
