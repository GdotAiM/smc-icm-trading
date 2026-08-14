// Draw entry/SL/TP from current decision.json on the 1m chart
const CDP = require("chrome-remote-interface");
const fs = require("fs");
const path = require("path");

const ROOT = "C:\\Users\\cash\\smc-icm-trading";
const DATE = require("../ny_time.cjs").getNYDate();
const PAIR = process.argv[2] || "EURUSD";
const pairDir = PAIR === "XAUUSD" ? "GOLD" : PAIR;

async function run(client, expr) {
  await client.Runtime.evaluate({ expression: expr, returnByValue: true });
}

function r5(v) { return Number(v).toFixed(5); }
function r1(v) { return Number(v).toFixed(1); }

(async () => {
  // Load decision
  const decPath = path.join(ROOT, "shared", DATE, PAIR, "decision.json");
  const altPath = path.join(ROOT, "shared", DATE, pairDir, "decision.json");
  let dec = null;
  for (const p of [decPath, altPath]) {
    if (fs.existsSync(p)) { dec = JSON.parse(fs.readFileSync(p, "utf8")); break; }
  }
  if (!dec || dec.entry.type === "NO TRADE") {
    console.log(`${PAIR}: No active setup — verdict is ${dec?.registry?.verdict || 'N/A'}`);
    process.exit(1);
  }

  const e = dec.entry;
  const sl = e.sl;
  const tp1 = e.tp1;
  const tp2 = e.tp2;
  const entry = e.price;
  const dir = e.type;
  const model = dec.registry.primary;
  const guard = dec.guard.verdict;

  // Load 1m engine for current price + structure
  const engPath = path.join(ROOT, "shared", DATE, PAIR, "engine_1m.json");
  const altEngPath = path.join(ROOT, "shared", DATE, pairDir, "engine_1m.json");
  let r1m = null;
  for (const p of [engPath, altEngPath]) {
    if (fs.existsSync(p)) { r1m = JSON.parse(fs.readFileSync(p, "utf8")); break; }
  }
  const currentPrice = r1m?.price || entry;
  const swHi = r1m?.structure?.lastSwingHigh || sl;
  const swLo = r1m?.structure?.lastSwingLow || entry;
  const bias1m = r1m?.structure?.bias || "neutral";
  const event1m = r1m?.structure?.lastEvent || "none";
  const swept1m = (r1m?.liquidity || []).filter(p => p.swept);
  const tvSymbol = PAIR === "NAS100" ? "CAPITALCOM:NAS100" : PAIR === "EURUSD" ? "OANDA:EURUSD" : PAIR === "GBPUSD" ? "OANDA:GBPUSD" : PAIR;

  // Connect
  const r = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await r.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!chart) { console.log("No chart"); process.exit(1); }
  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();
  const api = "window.TradingViewApi._activeChartWidgetWV.value()";

  console.log(`Drawing ${PAIR} ${dir} setup — ${model} | Guard: ${guard}`);

  // Switch symbol + 1m
  await run(client, `(function() {
    ${api}.setSymbol("${tvSymbol}", {});
    ${api}.setResolution("1");
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 4000));

  // Get time range
  const timeRes = await client.Runtime.evaluate({
    expression: `(function() {
      var bars = ${api}._chartWidget.model().mainSeries().bars();
      var end = bars.lastIndex();
      var start = Math.max(bars.firstIndex(), end - 120);
      return JSON.stringify({ t: bars.valueAt(start)[0], tEnd: bars.valueAt(end)[0] });
    })()`,
    returnByValue: true
  });
  const { t, tEnd } = JSON.parse(timeRes.result.value);
  const tWide = t - 600, tFar = tEnd + 4000;

  // Clear old shapes
  await run(client, `(function() { try { ${api}.removeAllShapes(); } catch(e) {} return "ok"; })()`);
  await new Promise(r => setTimeout(r, 600));

  const entryColor = dir === "SHORT" ? "#EF4444" : "#22C55E";
  const tpColor = "#22C55E";
  const slColor = "#EF4444";
  const labelColor = "#FFFFFF";

  // ═══ CURRENT PRICE ═══
  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd + 600}, price: ${currentPrice} }, { shape: "horizontal_line", text: "NOW ${r5(currentPrice)}", overrides: { "linecolor": "#FFFFFF", "linewidth": 3, "linestyle": 0, "showLabel": true, "textColor": "#FFFFFF" } });
    return "ok";
  })()`);

  // ═══ ENTRY ═══
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tWide}, price: ${r5(entry)} }, { time: ${tFar}, price: ${r5(entry)} }], { shape: "extended", text: "${dir} ENTRY ${r5(entry)}", overrides: { "linecolor": "${entryColor}", "linewidth": 3, "linestyle": 0, "showLabel": true, "textColor": "${entryColor}" } });
    return "ok";
  })()`);

  // ═══ STOP LOSS ═══
  const slLabel = dir === "SHORT" ? `SL ${r5(sl)} (above)` : `SL ${r5(sl)} (below)`;
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tWide + 100}, price: ${r5(sl)} }, { time: ${tFar}, price: ${r5(sl)} }], { shape: "extended", text: "${slLabel} — ${e.slReason || 'Structural invalidation'}", overrides: { "linecolor": "${slColor}", "linewidth": 2, "linestyle": 2, "showLabel": true, "textColor": "${slColor}" } });
    return "ok";
  })()`);

  // ═══ TP1 ═══
  const tp1Dist = Math.abs(entry - tp1);
  const tp1R = (tp1Dist / Math.abs(entry - sl)).toFixed(1);
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tWide + 200}, price: ${r5(tp1)} }, { time: ${tFar}, price: ${r5(tp1)} }], { shape: "extended", text: "TP1 ${r5(tp1)} (${tp1R}:1)", overrides: { "linecolor": "${tpColor}", "linewidth": 2, "linestyle": 1, "showLabel": true, "textColor": "${tpColor}" } });
    return "ok";
  })()`);

  // ═══ TP2 ═══
  const tp2Dist = Math.abs(entry - tp2);
  const tp2R = (tp2Dist / Math.abs(entry - sl)).toFixed(1);
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tWide + 300}, price: ${r5(tp2)} }, { time: ${tFar}, price: ${r5(tp2)} }], { shape: "extended", text: "TP2 ${r5(tp2)} (${tp2R}:1)", overrides: { "linecolor": "${tpColor}", "linewidth": 1, "linestyle": 1, "showLabel": true, "textColor": "${tpColor}" } });
    return "ok";
  })()`);

  // ═══ ENTRY ZONE BOX ═══
  const zoneTop = dir === "SHORT" ? entry + (sl - entry) * 0.2 : entry - (entry - sl) * 0.2;
  const zoneBot = dir === "SHORT" ? entry - (sl - entry) * 0.1 : entry + (entry - sl) * 0.1;
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${t}, price: ${r5(zoneTop)} }, { time: ${tFar}, price: ${r5(zoneBot)} }], { shape: "rectangle", text: "ENTRY ZONE — ${model}", overrides: { "backgroundColor": "${entryColor}15", "borderColor": "${entryColor}55", "borderWidth": 1 } });
    return "ok";
  })()`);

  // ═══ 1M STRUCTURE LABELS ═══
  const sweptInfo = swept1m.length > 0 ? `${swept1m.length} swept (${swept1m.map(p => p.type).join(',')})` : "NONE swept";
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tWide + 500}, price: ${dir === "SHORT" ? r5(zoneTop + (sl - entry) * 0.08) : r5(zoneBot - (entry - sl) * 0.08)} }, { time: ${t + 800}, price: ${dir === "SHORT" ? r5(zoneTop + (sl - entry) * 0.12) : r5(zoneBot - (entry - sl) * 0.12)} }], {
      shape: "text",
      text: "1m: bias=${bias1m} event=${event1m} swept=${sweptInfo}",
      overrides: { "textColor": "#94A3B8", "fontsize": 11 }
    });
    return "ok";
  })()`);

  // ═══ INVERSION STATUS ═══
  const fractal = (() => {
    try {
      const { execSync } = require("child_process");
      return JSON.parse(execSync(`node "${ROOT}\\tools\\fractal_mmxm.cjs" ${PAIR}`, { stdio: ["ignore","pipe","ignore"], encoding: "utf8", timeout: 12000 }));
    } catch(e) { return null; }
  })();
  const invStatus = fractal?.inversionDetected ? `✅ DETECTED` : `❌ BLOCKED (${fractal?.inversionScore || '?'}/8)`;
  const invColor = fractal?.inversionDetected ? "#22C55E" : "#EF4444";

  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tWide + 500}, price: ${dir === "SHORT" ? r5(zoneTop + (sl - entry) * 0.01) : r5(zoneBot - (entry - sl) * 0.01)} }, { time: ${t + 800}, price: ${dir === "SHORT" ? r5(zoneTop + (sl - entry) * 0.05) : r5(zoneBot - (entry - sl) * 0.05)} }], {
      shape: "text",
      text: "1m INVERSION: ${invStatus}",
      overrides: { "textColor": "${invColor}", "fontsize": 14, "bold": true }
    });
    return "ok";
  })()`);

  // ═══ GUARD STATUS ═══
  const guardColor = guard.includes("DO NOT") ? "#EF4444" : guard.includes("CAUTION") ? "#F59E0B" : "#22C55E";
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tWide + 500}, price: ${dir === "SHORT" ? r5(zoneTop + (sl - entry) * 0.15) : r5(zoneBot - (entry - sl) * 0.15)} }, { time: ${t + 800}, price: ${dir === "SHORT" ? r5(zoneTop + (sl - entry) * 0.18) : r5(zoneBot - (entry - sl) * 0.18)} }], {
      shape: "text",
      text: "GUARD: ${guard}",
      overrides: { "textColor": "${guardColor}", "fontsize": 12, "bold": true }
    });
    return "ok";
  })()`);

  // Summary
  const rr1 = dec.rr?.rr1?.toFixed(1) || "?";
  const rr2 = dec.rr?.rr2?.toFixed(1) || "?";
  const guardReasons = dec.guard?.blockedIds?.join(', ') || 'none';
  console.log(`\n✅ ${PAIR} forecast drawn — ${dir} @ ${r5(entry)}`);
  console.log(`   SL: ${r5(sl)} | TP1: ${r5(tp1)} (${rr1}:1) | TP2: ${r5(tp2)} (${rr2}:1)`);
  console.log(`   Inversion: ${invStatus} | Guard: ${guard} (${guardReasons})`);
  console.log(`   Model: ${model} | Now @ ${r5(currentPrice)}`);

  await client.close();
})();
