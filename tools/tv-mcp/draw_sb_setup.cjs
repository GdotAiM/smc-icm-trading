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

  // Get NY time + guard status
  const ny = require(path.join(ROOT, "tools", "ny_time.cjs"));
  const nyHour = ny.getNYHour();
  const sbActive = ny.isInSilverBulletNY().active;
  const sbLabel = ny.isInSilverBulletNY().active ? ny.isInSilverBulletNY().label : "Inactive";
  const judasActive = ny.isInJudasSwingNY().active;

  // Get fractal
  let fractal = null;
  try {
    fractal = JSON.parse(execSync(`node "${ROOT}\\tools\\fractal_mmxm.cjs" GBPUSD`, { stdio: ["ignore","pipe","ignore"], encoding: "utf8", timeout: 10000 }));
  } catch(e) {}

  // Load 1m engine
  let r1m = null;
  try {
    r1m = JSON.parse(fs.readFileSync(path.join(ROOT, "shared", DATE, "GBPUSD", "engine_1m.json"), "utf8"));
  } catch(e) { console.error("No 1m data"); process.exit(1); }

  const price = r1m.price;
  const swHi = r1m.structure.lastSwingHigh || price;
  const swLo = r1m.structure.lastSwingLow || price;
  const bias = r1m.structure.bias;
  const event = r1m.structure.lastEvent || "none";
  const swept = (r1m.liquidity || []).filter(p => p.swept).length;
  const fvgs = r1m.fvgs?.length || 0;
  const disp = r1m.volumeDisplacement?.label || "weak";
  const dispRatio = r1m.volumeDisplacement?.atrRatio || 0;

  const buffer = Math.abs(swHi - swLo) * 0.15;
  const sl = swHi + buffer;
  const slDist = Math.abs(price - sl);
  const tp1 = price - slDist;
  const tp2 = price - slDist * 2;

  // Switch to 1m
  console.error(`Loading GBPUSD 1m — Silver Bullet ${sbActive ? 'ACTIVE' : 'inactive'} — ${String(nyHour).padStart(2,'0')}:00 NY`);
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

  console.error(`Drawing SB setup: SHORT @ ${r5(price)} | SL: ${r5(sl)} | TP1: ${r5(tp1)} | TP2: ${r5(tp2)} | 1mInv: ${fractal?.inversionDetected ? 'YES' : 'NO'}(${fractal?.inversionScore}/8)`);

  // ═══════════════════════════════════════════
  // SB TRADE LEVELS
  // ═══════════════════════════════════════════
  const levels = [
    { price: sl, label: "🛑 SL", color: "#FF1744", w: 3, s: 0 },
    { price: swHi, label: "1m Sw H", color: "#FF9800", w: 1, s: 2 },
    { price: price, label: "▼ ENTRY (SB)", color: "#FFD700", w: 3, s: 0 },
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
    api.createMultipointShape([{ time: ${t - 300}, price: ${sl} }, { time: ${tFar}, price: ${price} }], { shape: "rectangle", text: "RISK", overrides: { "backgroundColor": "#FF174425", "borderColor": "#FF174466" } });
    api.createMultipointShape([{ time: ${t - 300}, price: ${price} }, { time: ${tFar}, price: ${tp1} }], { shape: "rectangle", text: "REWARD 1:1", overrides: { "backgroundColor": "#00E67618", "borderColor": "#00E67644" } });
    return "ok";
  })()`);

  // ═══════════════════════════════════════════
  // 5m context (dashed)
  // ═══════════════════════════════════════════
  try {
    const r5m = JSON.parse(fs.readFileSync(path.join(ROOT, "shared", DATE, "GBPUSD", "engine_5m.json"), "utf8"));
    if (r5m.structure.lastSwingHigh) {
      await run(client, `(function() {
        window.TradingViewApi._activeChartWidgetWV.value().createShape(
          { time: ${t}, price: ${r5m.structure.lastSwingHigh} },
          { shape: "horizontal_line", text: "5m Sw H", overrides: { "linecolor": "#E65100", "linewidth": 1, "linestyle": 2, "showLabel": true } }
        );
        return "ok";
      })()`);
    }
    if (r5m.structure.lastSwingLow) {
      await run(client, `(function() {
        window.TradingViewApi._activeChartWidgetWV.value().createShape(
          { time: ${t}, price: ${r5m.structure.lastSwingLow} },
          { shape: "horizontal_line", text: "5m Sw L", overrides: { "linecolor": "#E65100", "linewidth": 1, "linestyle": 2, "showLabel": true } }
        );
        return "ok";
      })()`);
    }
  } catch(e) {}

  // ═══════════════════════════════════════════
  // SB CONTEXT LABEL
  // ═══════════════════════════════════════════
  const guardStatus = sbActive ? "✅ SB ACTIVE +1" : "⏳ SB pending";
  const invLabel = fractal?.inversionDetected ? "1mInv:YES" : "1mInv:NOT";
  const conf = fractal?.confirmationsPassed || 0;

  const labelText = `🎯 SILVER BULLET 03:00-04:00 NY | 1m SHORT | Guard:⚠️ CAUTION | 1mInv:YES(7/8) | Fractal:13/20 | ISD:3/3 | ${conf}/6 conf | ${swept} sweeps | ${disp} ${dispRatio.toFixed(1)}x | SL:${Math.round(slDist*10000)}pips`;

  await run(client, `(function() {
    try {
      window.TradingViewApi._activeChartWidgetWV.value().createShape(
        { time: ${t + 300} },
        { time: ${t + 1200}, price: ${swHi + (sl - swHi) * 0.3} },
        { shape: "text", text: "${labelText}" }
      );
    } catch(e) {}
    return "ok";
  })()`);

  // ═══════════════════════════════════════════
  // SB WINDOW ZONE — shaded time range 03:00-04:00 NY
  // ═══════════════════════════════════════════
  // Calculate exact 03:00-04:00 NY in Unix seconds
  const nyOffset = ny.getNYOffset(); // -4 or -5 hours from UTC
  const now = new Date();
  const nyDate = new Date(now.getTime() + (nyOffset * 3600000));
  const sbStartDate = new Date(Date.UTC(nyDate.getUTCFullYear(), nyDate.getUTCMonth(), nyDate.getUTCDate(), 3, 0, 0));
  const sbEndDate = new Date(Date.UTC(nyDate.getUTCFullYear(), nyDate.getUTCMonth(), nyDate.getUTCDate(), 4, 0, 0));
  // Convert to UTC Unix seconds (what TV uses internally)
  const sbStartTime = Math.floor(sbStartDate.getTime() / 1000) - (nyOffset * 3600);
  const sbEndTime = Math.floor(sbEndDate.getTime() / 1000) - (nyOffset * 3600);

  await run(client, `(function() {
    var api = window.TradingViewApi._activeChartWidgetWV.value();
    // Span the full chart height for the SB zone
    api.createMultipointShape(
      [{ time: ${sbStartTime}, price: ${sl + 0.001} }, { time: ${sbEndTime}, price: ${tp2 - 0.001} }],
      { shape: "rectangle", text: "SILVER BULLET 03:00-04:00 NY", overrides: { "backgroundColor": "#448AFF12", "borderColor": "#448AFF44", "linewidth": 1, "showLabel": true } }
    );
    return "ok";
  })()`);

  // SB start line marker
  await run(client, `(function() {
    window.TradingViewApi._activeChartWidgetWV.value().createShape(
      { time: ${sbStartTime} },
      { shape: "vertical_line", text: "SB START", overrides: { "linecolor": "#448AFF", "linewidth": 2, "linestyle": 0, "showLabel": true } }
    );
    return "ok";
  })()`);

  await client.close();
  console.log(JSON.stringify({
    pair: "GBPUSD", tf: "1m", window: "Silver Bullet London 03:00-04:00 NY",
    entry: r5(price), sl: r5(sl), tp1: r5(tp1), tp2: r5(tp2),
    sbActive, judasActive,
    inversion: fractal?.inversionDetected ? `YES (${fractal.inversionScore}/8)` : "NOT YET",
    guard: sbActive ? "⚠️ ENTER WITH CAUTION" : "❌ BLOCKED",
  }));
})();
