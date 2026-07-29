const CDP = require("chrome-remote-interface");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = "C:\\Users\\cash\\smc-icm-trading";
const DATE = new Date().toISOString().split("T")[0];

async function run(client, expr) {
  await client.Runtime.evaluate({ expression: expr, returnByValue: true });
}

function loadNarrative(pair) {
  try {
    const md = fs.readFileSync(path.join(ROOT, "stages", "00b_council_vote", "output", `${pair}_narrative.md`), "utf8");
    // Extract the "Putting It All Together" section
    const section = md.split("## Putting It All Together")[1]?.split("---")[0] || "";
    // Clean for JS string
    return section.replace(/`/g, "'").replace(/\\/g, "\\\\").replace(/\n/g, " ").replace(/\*\*/g, "").slice(0, 400);
  } catch(e) { return "Narrative unavailable"; }
}

function loadEngine(pair, tf) {
  try {
    const dir = pair === "GOLD" ? "GOLD" : pair === "NAS100" ? "NAS100" : pair === "DXY" ? "DXY" : pair;
    return JSON.parse(fs.readFileSync(path.join(ROOT, "shared", DATE, dir, `engine_${tf}.json`), "utf8"));
  } catch(e) { return null; }
}

async function drawPair(client, config) {
  const { tvSymbol, pair, label, entry, sl, tp1, tp2, swingH, swingL, councilPct, councilVerdict, narrative } = config;
  console.error(`\n=== ${label} ===`);

  // Switch
  await run(client, `(function() {
    window.TradingViewApi._activeChartWidgetWV.value().setSymbol("${tvSymbol}", {});
    window.TradingViewApi._activeChartWidgetWV.value().setResolution("240");
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 4000));

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
    { price: sl, label: "🛑 SL", color: "#FF1744", width: 3, style: 0 },
    { price: swingH, label: "Swing H", color: "#FF9800", width: 1, style: 2 },
    { price: entry, label: "▼ ENTRY", color: "#FFD700", width: 3, style: 0 },
    { price: swingL, label: "Swing L", color: "#FF9800", width: 1, style: 2 },
    { price: tp1, label: "✅ TP1 (1:1)", color: "#00E676", width: 3, style: 0 },
    { price: tp2, label: "✅ TP2 (1:2)", color: "#00C853", width: 2, style: 0 },
  ];
  for (const l of levels) {
    if (!l.price || l.price === 0) continue;
    await run(client, `(function() {
      window.TradingViewApi._activeChartWidgetWV.value().createShape(
        { time: ${t}, price: ${l.price} },
        { shape: "horizontal_line", text: "${l.label}", overrides: { "linecolor": "${l.color}", "linewidth": ${l.width}, "linestyle": ${l.style}, "showLabel": true } }
      );
      return "ok";
    })()`);
  }

  // Risk zone
  await run(client, `(function() {
    window.TradingViewApi._activeChartWidgetWV.value().createMultipointShape(
      [{ time: ${t - 86400*5}, price: ${sl} }, { time: ${tFar}, price: ${entry} }],
      { shape: "rectangle", text: "RISK", overrides: { "backgroundColor": "#FF174420", "borderColor": "#FF174455", "linewidth": 1 } }
    );
    return "ok";
  })()`);

  // Reward zone
  await run(client, `(function() {
    window.TradingViewApi._activeChartWidgetWV.value().createMultipointShape(
      [{ time: ${t - 86400*5}, price: ${entry} }, { time: ${tFar}, price: ${tp1} }],
      { shape: "rectangle", text: "REWARD 1:1", overrides: { "backgroundColor": "#00E67618", "borderColor": "#00E67644", "linewidth": 1 } }
    );
    return "ok";
  })()`);

  // ── Forecast ──
  try {
    const dataDir = pair === "NAS100" ? "NAS100" : "GBPUSD";
    const tfKey = "4h";
    const dataFile = path.join(process.env.TEMP || "/tmp", `${dataDir}_${tfKey}.json`);
    if (fs.existsSync(dataFile)) {
      execSync(`python "${__dirname}\\..\\forecast.py" --input "${dataFile}" --pred-len 24 --samples 15 --output "${process.env.TEMP}\\${pair}_fc.json"`, { stdio: "ignore", timeout: 15000 });
    }
    const fcFile = path.join(process.env.TEMP || "/tmp", `${pair}_fc.json`);
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
  } catch(e) { /* skip forecast */ }

  // ── Narrative Label ──
  const verdictShort = councilVerdict.length > 45 ? councilVerdict.slice(0, 44) + "…" : councilVerdict;
  const narrShort = narrative.slice(0, 280);
  await run(client, `(function() {
    try {
      var api = window.TradingViewApi._activeChartWidgetWV.value();
      api.createShape(
        { time: ${t + 86400*5} },
        { time: ${t + 86400*12}, price: ${swingH + (sl - swingH) * 0.5} },
        { shape: "text", text: "${label}: ${verdictShort} (${councilPct}%) | ${narrShort}" }
      );
    } catch(e) {}
    return "ok";
  })()`);

  console.error(`  Drawn: levels + forecast + narrative`);
}

(async () => {
  const r = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await r.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!chart) { console.log("No chart"); process.exit(1); }
  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();

  // ── GBPUSD ──
  const gbR4h = loadEngine("GBPUSD", "4h");
  const gbEntry = gbR4h?.price || 1.33239;
  const gbSwHi = gbR4h?.structure?.lastSwingHigh || 1.33934;
  const gbSwLo = gbR4h?.structure?.lastSwingLow || 1.33216;
  const gbBuffer = Math.abs(gbSwHi - gbSwLo) * 0.1;
  const gbSL = gbSwHi + gbBuffer;
  const gbSLDist = gbSL - gbEntry;
  const gbTP1 = gbEntry - gbSLDist;
  const gbTP2 = gbEntry - gbSLDist * 2;

  await drawPair(client, {
    tvSymbol: "GBPUSD", pair: "gbpusd", label: "GBPUSD",
    entry: gbEntry, sl: gbSL, tp1: gbTP1, tp2: gbTP2,
    swingH: gbSwHi, swingL: gbSwLo,
    councilPct: 80, councilVerdict: "BEARISH MAJORITY – 3/4 archetypes",
    narrative: loadNarrative("gbpusd"),
  });

  // ── NAS100 ──
  const nasR4h = loadEngine("NAS100", "4h");
  const nasEntry = nasR4h?.price || 28148;
  const nasSwHi = nasR4h?.structure?.lastSwingHigh || 29175;
  const nasSwLo = nasR4h?.structure?.lastSwingLow || 28273;
  const nasBuffer = Math.abs(nasSwHi - nasSwLo) * 0.1;
  const nasSL = nasSwHi + nasBuffer;
  const nasSLDist = nasSL - nasEntry;
  const nasTP1 = nasEntry - nasSLDist;
  const nasTP2 = nasEntry - nasSLDist * 2;

  await drawPair(client, {
    tvSymbol: "US100", pair: "nas100", label: "NAS100",
    entry: nasEntry, sl: nasSL, tp1: nasTP1, tp2: nasTP2,
    swingH: nasSwHi, swingL: nasSwLo,
    councilPct: 80, councilVerdict: "BEARISH MAJORITY – 3/4 archetypes",
    narrative: loadNarrative("nas100"),
  });

  // Switch back to GBPUSD
  await run(client, `(function() {
    window.TradingViewApi._activeChartWidgetWV.value().setSymbol("GBPUSD", {});
    return "ok";
  })()`);

  await client.close();
  console.log(JSON.stringify([
    { pair: "GBPUSD", entry: gbEntry, sl: gbSL, tp1: gbTP1, tp2: gbTP2, rr: "1:1/2:1", council: "80%" },
    { pair: "NAS100", entry: nasEntry, sl: nasSL, tp1: nasTP1, tp2: nasTP2, rr: "1:1/2:1", council: "80%" },
  ]));
})();
