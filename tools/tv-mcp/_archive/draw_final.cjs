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
    { name: "GBPUSD", tv: "GBPUSD", label: "GBPUSD", dir: "SHORT" },
    { name: "GOLD", tv: "XAUUSD", label: "GOLD", dir: "SHORT" },
    { name: "NAS100", tv: "US100", label: "NAS100", dir: "SHORT" },
  ];

  for (const p of pairs) {
    console.error(`\n=== ${p.label} ===`);

    // Load engine + fractal data
    const r4h = loadEngine(p.name, "4h");
    const r5m = loadEngine(p.name, "5m");
    if (!r4h) { console.error(`  No 4H data`); continue; }

    const price = r4h.price;
    const swHi = r4h.structure.lastSwingHigh || price;
    const swLo = r4h.structure.lastSwingLow || price;
    const bias = r4h.structure.bias;
    const buffer = Math.abs(swHi - swLo) * 0.1;
    const isBear = bias === "bearish";
    const sl = isBear ? swHi + buffer : swLo - buffer;
    const slDist = Math.abs(price - sl);
    const tp1 = isBear ? price - slDist : price + slDist;
    const tp2 = isBear ? price - slDist * 2 : price + slDist * 2;

    // Fractal data
    let fractal = null;
    try {
      fractal = JSON.parse(execSync(`node "${ROOT}\\tools\\fractal_mmxm.cjs" ${p.name}`, { stdio: ["ignore","pipe","ignore"], encoding: "utf8", timeout: 15000 }));
    } catch(e) {}

    // Narrative snippet
    let narr = "";
    try {
      const md = fs.readFileSync(path.join(ROOT, "stages", "00b_council_vote", "output", `${p.name.toLowerCase()}_narrative.md`), "utf8");
      narr = md.split("## Putting It All Together")[1]?.split("---")[0]?.replace(/[*`\n]/g, " ").slice(0, 250) || "";
    } catch(e) {}

    // Switch
    await run(client, `(function() {
      window.TradingViewApi._activeChartWidgetWV.value().setSymbol("${p.tv}", {});
      window.TradingViewApi._activeChartWidgetWV.value().setResolution("240");
      return "ok";
    })()`);
    await new Promise(r => setTimeout(r, 3500));

    const timeRes = await client.Runtime.evaluate({
      expression: `(function() {
        var bars = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().bars();
        var end = bars.lastIndex();
        return JSON.stringify({ t: bars.valueAt(Math.max(bars.firstIndex(), end - 100))[0], tEnd: bars.valueAt(end)[0] });
      })()`,
      returnByValue: true
    });
    const { t, tEnd } = JSON.parse(timeRes.result.value);
    const tFar = tEnd + 86400 * 20;

    // Clear
    await run(client, `(function() {
      try { window.TradingViewApi._activeChartWidgetWV.value().removeAllShapes(); } catch(e) {}
      return "ok";
    })()`);
    await new Promise(r => setTimeout(r, 400));

    // ── Trade Levels ──
    const levels = [
      { price: sl, label: "🛑 SL", color: "#FF1744", w: 3, s: 0 },
      { price: swHi, label: "Swing H", color: "#FF9800", w: 1, s: 2 },
      { price: price, label: "▼ ENTRY", color: "#FFD700", w: 3, s: 0 },
      { price: swLo, label: "Swing L", color: "#FF9800", w: 1, s: 2 },
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

    // Risk + Reward zones
    await run(client, `(function() {
      var api = window.TradingViewApi._activeChartWidgetWV.value();
      api.createMultipointShape([{ time: ${t - 86400*5}, price: ${sl} }, { time: ${tFar}, price: ${price} }], { shape: "rectangle", text: "RISK", overrides: { "backgroundColor": "#FF174420", "borderColor": "#FF174455", "linewidth": 1 } });
      api.createMultipointShape([{ time: ${t - 86400*5}, price: ${price} }, { time: ${tFar}, price: ${tp1} }], { shape: "rectangle", text: "REWARD 1:1", overrides: { "backgroundColor": "#00E67618", "borderColor": "#00E67644", "linewidth": 1 } });
      return "ok";
    })()`);

    // ── Forecast ──
    try {
      const fcFile = path.join(process.env.TEMP || "/tmp", `${p.name.toLowerCase()}_fc.json`);
      const dataFile = path.join(process.env.TEMP || "/tmp", `${p.name}_4h.json`);
      if (fs.existsSync(dataFile)) {
        execSync(`python "${__dirname}\\..\\forecast.py" --input "${dataFile}" --pred-len 24 --samples 15 --output "${fcFile}"`, { stdio: "ignore", timeout: 15000 });
      }
      if (fs.existsSync(fcFile)) {
        const fc = JSON.parse(fs.readFileSync(fcFile, "utf8"));
        if (fc.median_path) {
          for (let i = 0; i < fc.median_path.length - 1; i++) {
            await run(client, `(function() {
              window.TradingViewApi._activeChartWidgetWV.value().createMultipointShape(
                [{ time: ${fc.future_times[i]}, price: ${fc.median_path[i]} }, { time: ${fc.future_times[i + 1]}, price: ${fc.median_path[i + 1]} }],
                { shape: "trend_line", overrides: { "linecolor": "#448AFF", "linewidth": 2, "linestyle": 2 } }
              );
              return "ok";
            })()`);
          }
        }
      }
    } catch(e) {}

    // ── Fractal MMXM Steps Label ──
    if (fractal) {
      const steps = Object.entries(fractal.mmxmSteps).map(([tf, step]) => `${tf}:${step}`).join(" ");
      const confStr = `${fractal.confirmationsPassed}/6 conf | CISD:${fractal.cisdDetected ? 'Y' : 'N'} SMT:${fractal.smtDetected ? 'Y' : 'N'}`;
      const invStr = `1m Inv:${fractal.inversionDetected ? 'YES' : 'NOT YET'} (${fractal.inversionScore}/8)`;
      await run(client, `(function() {
        try {
          window.TradingViewApi._activeChartWidgetWV.value().createShape(
            { time: ${t + 86400*5} },
            { time: ${t + 86400*12}, price: ${swHi + (sl - swHi) * 0.4} },
            { shape: "text", text: "${p.label} ${p.dir} | MMXM: ${steps} | Fractal: ${fractal.fractalScore}/${fractal.fractalMax} | ${invStr} | ${confStr}" }
          );
        } catch(e) {}
        return "ok";
      })()`);
    }

    console.error(`  Drawn: levels + forecast + fractal MMXM overlay`);
  }

  await client.close();
  console.log(JSON.stringify({status:"done", pairs: pairs.map(p => p.label)}));
})();
