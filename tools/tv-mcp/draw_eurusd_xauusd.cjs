// Draw EURUSD + XAUUSD on 1m charts — ICT analysis levels
const CDP = require("chrome-remote-interface");

async function run(client, expr) {
  await client.Runtime.evaluate({ expression: expr, returnByValue: true });
}

async function getTimeBounds(client, api) {
  const r = await client.Runtime.evaluate({
    expression: `(function() {
      var bars = ${api}._chartWidget.model().mainSeries().bars();
      var end = bars.lastIndex();
      var start = Math.max(bars.firstIndex(), end - 120);
      return JSON.stringify({ t: bars.valueAt(start)[0], tEnd: bars.valueAt(end)[0] });
    })()`,
    returnByValue: true
  });
  return JSON.parse(r.result.value);
}

(async () => {
  const r = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await r.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!chart) { console.log("No chart"); process.exit(1); }
  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();
  const api = "window.TradingViewApi._activeChartWidgetWV.value()";

  // ═══════════════════════════════════════════════
  // EURUSD 1m
  // ═══════════════════════════════════════════════
  console.log("=== EURUSD 1m ===");
  await run(client, `(function() {
    ${api}.setSymbol("EURUSD", {});
    ${api}.setResolution("1");
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 3500));

  let { t, tEnd } = await getTimeBounds(client, api);
  let tWide = t - 400;
  let tFar = tEnd + 3000;

  // Clear
  await run(client, `(function() { try { ${api}.removeAllShapes(); } catch(e) {} return "ok"; })()`);
  await new Promise(r => setTimeout(r, 500));

  // ── Entry ──
  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd + 800}, price: 1.13940 }, { shape: "horizontal_line", text: "NOW 1.13940 — IN OTE ZONE", overrides: { "linecolor": "#FFFFFF", "linewidth": 3, "linestyle": 0, "showLabel": true, "textColor": "#FFFFFF" } });
    return "ok";
  })()`);
  console.log("  ✓ Current @ 1.13940");

  // ── SL ──
  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd + 800}, price: 1.14131 }, { shape: "horizontal_line", text: "SL 1.14131 (4H Swing + ATR)", overrides: { "linecolor": "#EF4444", "linewidth": 2, "linestyle": 0, "showLabel": true, "textColor": "#EF4444" } });
    return "ok";
  })()`);

  // ── 4H Swing High ──
  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd + 800}, price: 1.14053 }, { shape: "horizontal_line", text: "4H Swing High 1.14053", overrides: { "linecolor": "#EF4444", "linewidth": 1, "linestyle": 2, "showLabel": true, "textColor": "#EF4444" } });
    return "ok";
  })()`);

  // ── TP1 (SSL pool) ──
  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide}, price: 1.13610 }, { shape: "horizontal_line", text: "TP1 1.13610 (SSL pool, +33p, 1.73:1)", overrides: { "linecolor": "#22C55E", "linewidth": 2, "linestyle": 1, "showLabel": true, "textColor": "#22C55E" } });
    return "ok";
  })()`);

  // ── TP2 ──
  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide}, price: 1.13279 }, { shape: "horizontal_line", text: "TP2 1.13279 (2:1, +66p)", overrides: { "linecolor": "#22C55E", "linewidth": 1, "linestyle": 1, "showLabel": true, "textColor": "#22C55E" } });
    return "ok";
  })()`);

  // ── OTE Zone ──
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tEnd - 200}, price: 1.13944 }, { time: ${tFar}, price: 1.13855 }], { shape: "rectangle", text: "OTE ZONE 62-79%", overrides: { "backgroundColor": "#F59E0B15", "borderColor": "#F59E0B44", "borderWidth": 1 } });
    return "ok";
  })()`);
  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide}, price: 1.13899 }, { shape: "horizontal_line", text: "OTE Ideal 70.5% @ 1.13899", overrides: { "linecolor": "#F59E0B", "linewidth": 2, "linestyle": 0, "showLabel": true, "textColor": "#F59E0B" } });
    return "ok";
  })()`);
  console.log("  ✓ OTE: 1.13855-1.13944");

  // ── BSL pools (targets above) ──
  await run(client, `(function() {
    ${api}.createShape({ time: ${t + 100}, price: 1.14119 }, { shape: "horizontal_line", text: "BSL 1.14119 (3 touches)", overrides: { "linecolor": "#E2E8F0", "linewidth": 1, "linestyle": 2, "showLabel": true, "textColor": "#E2E8F0" } });
    return "ok";
  })()`);
  await run(client, `(function() {
    ${api}.createShape({ time: ${t + 200}, price: 1.14353 }, { shape: "horizontal_line", text: "BSL 1.14353 (8 touches) — DRAW TARGET", overrides: { "linecolor": "#E2E8F0", "linewidth": 2, "linestyle": 2, "showLabel": true, "textColor": "#E2E8F0" } });
    return "ok";
  })()`);
  console.log("  ✓ BSL: 1.14119, 1.14353");

  // ── CBDR ──
  await run(client, `(function() {
    ${api}.createShape({ time: ${t}, price: 1.14012 }, { shape: "horizontal_line", text: "CBDR High 1.14012", overrides: { "linecolor": "#64748B", "linewidth": 1, "linestyle": 3, "showLabel": true, "textColor": "#64748B" } });
    return "ok";
  })()`);
  await run(client, `(function() {
    ${api}.createShape({ time: ${t}, price: 1.13650 }, { shape: "horizontal_line", text: "CBDR Low / Asian Low 1.13650", overrides: { "linecolor": "#64748B", "linewidth": 1, "linestyle": 3, "showLabel": true, "textColor": "#64748B" } });
    return "ok";
  })()`);
  console.log("  ✓ CBDR: 1.13650-1.14012");

  // ── Active bullish FVG ──
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${t - 300}, price: 1.13855 }, { time: ${tFar}, price: 1.13731 }], { shape: "rectangle", text: "BULLISH FVG (26% filled)", overrides: { "backgroundColor": "#22C55E10", "borderColor": "#22C55E33", "borderWidth": 1, "borderStyle": 1 } });
    return "ok";
  })()`);
  console.log("  ✓ Bullish FVG: 1.13731-1.13855");

  // ── Info panel ──
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tWide}, price: 1.1490 }, { time: ${t + 800}, price: 1.1550 }], {
      shape: "text",
      text: "EURUSD — ICT ANALYSIS (Jul 29, London)\\n\\nPROFILE: SELL PROFILE (DELAYED)\\nPo3: Macro DIST→Meso MANIP→Micro DIST\\n4H in MANIPULATION — reversal engineering\\nAMD: PURE DISCOUNT — all EQs above\\nMMXM: 4H Step2 LAGGING 1D Step3\\n3 days of 1D↓/4H↑ compression\\n\\n⚠️ Sell profile valid but AMD says BUY\\n1D bearish | 4H bullish CHoCH active\\nEQ Draw UP 100 pips to 1.14947\\n\\nTRADE: Short intraday on sell profile\\nBUT watch for 1D CHoCH — would flip to LONG\\n👇 FOMC @ 14:00 — close all by 13:45"
    });
    return "ok";
  })()`);

  // ── Divergence note ──
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tEnd + 400}, price: 1.1350 }, { time: ${tEnd + 800}, price: 1.1365 }], {
      shape: "text",
      text: "⚠️ 1D↓ vs 4H↑\\n3-DAY COMPRESSION\\nBreakout imminent"
    });
    return "ok";
  })()`);

  // ── 4H reversal zone ──
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${t - 200}, price: 1.1420 }, { time: ${tEnd}, price: 1.1390 }], { shape: "rectangle", text: "4H MANIPULATION ZONE — CHoCH active", overrides: { "backgroundColor": "#E040FB10", "borderColor": "#E040FB33", "borderWidth": 1 } });
    return "ok";
  })()`);

  // ═══════════════════════════════════════════════
  // XAUUSD 1m
  // ═══════════════════════════════════════════════
  console.log("\n=== XAUUSD 1m ===");
  await run(client, `(function() {
    ${api}.setSymbol("XAUUSD", {});
    ${api}.setResolution("1");
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 4000));

  let bounds = await getTimeBounds(client, api);
  t = bounds.t;
  tEnd = bounds.tEnd;
  tWide = t - 500;
  tFar = tEnd + 4000;

  // Clear
  await run(client, `(function() { try { ${api}.removeAllShapes(); } catch(e) {} return "ok"; })()`);
  await new Promise(r => setTimeout(r, 500));

  // ── Current ──
  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd + 1000}, price: 4043.70 }, { shape: "horizontal_line", text: "NOW $4,043.70", overrides: { "linecolor": "#FFFFFF", "linewidth": 3, "linestyle": 0, "showLabel": true, "textColor": "#FFFFFF" } });
    return "ok";
  })()`);
  console.log("  ✓ Current @ 4043.70");

  // ── 1D BOS (old trend reference) ──
  await run(client, `(function() {
    ${api}.createShape({ time: ${t + 100}, price: 4366.23 }, { shape: "horizontal_line", text: "1D Bearish BOS $4,366 (-$323 from here)", overrides: { "linecolor": "#EF4444", "linewidth": 2, "linestyle": 0, "showLabel": true, "textColor": "#EF4444" } });
    return "ok";
  })()`);
  console.log("  ✓ 1D BOS @ 4366");

  // ── 4H CHoCH — THE FLIP ──
  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd}, price: 4040.81 }, { shape: "horizontal_line", text: "⚡ 4H CHoCH → BULLISH @ $4,040.81", overrides: { "linecolor": "#22C55E", "linewidth": 3, "linestyle": 0, "showLabel": true, "textColor": "#22C55E" } });
    return "ok";
  })()`);
  console.log("  ✓ 4H CHoCH @ 4040.81");

  // ── 1H BOS — the trap ──
  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide + 200}, price: 4034.80 }, { shape: "horizontal_line", text: "🎯 1H Bearish BOS $4,034.80 — THE TRAP", overrides: { "linecolor": "#FF1744", "linewidth": 2, "linestyle": 0, "showLabel": true, "textColor": "#FF1744" } });
    return "ok";
  })()`);
  console.log("  ✓ 1H BOS (trap) @ 4034.80");

  // ── SSL swept ──
  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide}, price: 4020.45 }, { shape: "horizontal_line", text: "SSL SWEPT $4,020.45 (3 touches)", overrides: { "linecolor": "#E040FB", "linewidth": 1, "linestyle": 2, "showLabel": true, "textColor": "#E040FB" } });
    return "ok";
  })()`);

  // ── 1D Swing Low ──
  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide}, price: 3959.80 }, { shape: "horizontal_line", text: "1D Swing Low $3,959.80 — DEEP SUPPORT", overrides: { "linecolor": "#26C6DA", "linewidth": 2, "linestyle": 1, "showLabel": true, "textColor": "#26C6DA" } });
    return "ok";
  })()`);
  console.log("  ✓ SSL: 4020, 1D Low: 3960");

  // ── BSL (reversal target) ──
  await run(client, `(function() {
    ${api}.createShape({ time: ${t + 100}, price: 4117.79 }, { shape: "horizontal_line", text: "BSL $4,117.79 (3 touches) — REVERSAL TARGET", overrides: { "linecolor": "#E2E8F0", "linewidth": 2, "linestyle": 1, "showLabel": true, "textColor": "#E2E8F0" } });
    return "ok";
  })()`);
  console.log("  ✓ BSL target @ 4117");

  // ── Bearish Breaker OB ──
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${t - 400}, price: 4061.80 }, { time: ${tFar}, price: 4044.72 }], { shape: "rectangle", text: "BEARISH BREAKER (1.00x impulse)", overrides: { "backgroundColor": "#94A3B810", "borderColor": "#94A3B844", "borderWidth": 1 } });
    return "ok";
  })()`);

  // ── Bullish Breaker OB (support zone) ──
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${t - 400}, price: 4042.43 }, { time: ${tFar}, price: 4021.38 }], { shape: "rectangle", text: "BULLISH BREAKER (3.19x impulse)", overrides: { "backgroundColor": "#22C55E10", "borderColor": "#22C55E33", "borderWidth": 1 } });
    return "ok";
  })()`);
  console.log("  ✓ OBs: Bearish 4044-4062, Bullish 4021-4042");

  // ── 1D Swing High ──
  await run(client, `(function() {
    ${api}.createShape({ time: ${t + 100}, price: 4166.13 }, { shape: "horizontal_line", text: "1D Swing High $4,166 (long target)", overrides: { "linecolor": "#64748B", "linewidth": 1, "linestyle": 3, "showLabel": true, "textColor": "#64748B" } });
    return "ok";
  })()`);

  // ── Info panel ──
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tWide}, price: 4200 }, { time: ${t + 1200}, price: 4270 }], {
      shape: "text",
      text: "XAUUSD (GOLD) — ICT REVERSAL ANALYSIS\\nJul 29, London Session | FOMC Day\\n\\nSTORY: -$323 from 1D BOS. Distribution exhausted.\\n⚡ 4H CHoCH → BULLISH — reversal signal\\n\\nPo3: 1D DIST | 4H MANIP | Micro DIST\\nMMXM: 4H STEP2 (lagging) — reversal engineering\\nFractal: 11/20 — best of all 3 pairs\\nOnly TRENDING market today (1/8 range)\\nQuarterly shift ACTIVE — institutions buying\\n\\nSETUP: Turtle Soup LONG\\nWait for sweep BELOW $4,034.80 (1H bearish BOS)\\nThen 1m MSS upside → LONG\\nSL: Below $3,960 | TP: $4,118 (BSL)\\n\\n⚠️ FOMC 14:00 — gold will move VIOLENTLY"
    });
    return "ok";
  })()`);

  // ── Entry trigger note ──
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tEnd + 800}, price: 4030 }, { time: ${tEnd + 1600}, price: 4036 }], {
      shape: "text",
      text: "⏳ WAIT FOR:\\n1. Sweep below $4,034.80\\n2. 1m MSS ↑\\n3. CISD confirmation\\n→ THEN LONG"
    });
    return "ok";
  })()`);

  // ── Reversal zone rectangle ──
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${t - 400}, price: 4045 }, { time: ${tFar}, price: 4020 }], { shape: "rectangle", text: "REVERSAL ZONE — 4H MANIPULATION", overrides: { "backgroundColor": "#E040FB10", "borderColor": "#E040FB33", "borderWidth": 1 } });
    return "ok";
  })()`);

  await client.close();
  console.log("\n✅ BOTH CHARTS DRAWN");
  console.log("====================");
  console.log("EURUSD: Sell profile — short inside OTE zone, SL 1.14131, TP1 1.13610");
  console.log("XAUUSD: Reversal setup — wait for 1H sweep + 1m MSS, then LONG to 4117");
})();
