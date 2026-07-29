// Draw NAS100 1m — sell the bounce setup
const CDP = require("chrome-remote-interface");

async function run(client, expr) {
  await client.Runtime.evaluate({ expression: expr, returnByValue: true });
}

(async () => {
  const r = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await r.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!chart) { console.log("No chart"); process.exit(1); }
  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();
  const api = "window.TradingViewApi._activeChartWidgetWV.value()";

  console.log("Switching to NAS100 1m...");
  await run(client, `(function() {
    ${api}.setSymbol("NAS100", {});
    ${api}.setResolution("1");
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 4000));

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
  const tWide = t - 500, tFar = tEnd + 4000;

  await run(client, `(function() { try { ${api}.removeAllShapes(); } catch(e) {} return "ok"; })()`);
  await new Promise(r => setTimeout(r, 500));

  // ═══ CURRENT PRICE ═══
  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd + 1000}, price: 27747 }, { shape: "horizontal_line", text: "NOW 27,747 — BELOW entry zone", overrides: { "linecolor": "#FFFFFF", "linewidth": 3, "linestyle": 0, "showLabel": true, "textColor": "#FFFFFF" } });
    return "ok";
  })()`);
  console.log("  ✓ Current @ 27,747");

  // ═══ STRUCTURAL LEVELS (bearish fortress) ═══
  // 1D CHoCH — THE line
  await run(client, `(function() {
    ${api}.createShape({ time: ${t + 100}, price: 28217 }, { shape: "horizontal_line", text: "🔑 1D CHoCH 28,217 — ABOVE THIS = BEARISH DEAD", overrides: { "linecolor": "#EF4444", "linewidth": 3, "linestyle": 0, "showLabel": true, "textColor": "#EF4444" } });
    return "ok";
  })()`);

  // 4H BOS
  await run(client, `(function() {
    ${api}.createShape({ time: ${t + 100}, price: 27781 }, { shape: "horizontal_line", text: "4H BOS 27,781", overrides: { "linecolor": "#EF4444", "linewidth": 2, "linestyle": 2, "showLabel": true, "textColor": "#EF4444" } });
    return "ok";
  })()`);

  // 1H CHoCH
  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide}, price: 27589 }, { shape: "horizontal_line", text: "1H CHoCH 27,589 — recent low", overrides: { "linecolor": "#EF4444", "linewidth": 1, "linestyle": 2, "showLabel": true, "textColor": "#EF4444" } });
    return "ok";
  })()`);
  console.log("  ✓ Bearish cascade: 1D↓ 4H↓ 1H↓");

  // ═══ THE BOUNCE (micro bullish) ═══
  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd}, price: 27706 }, { shape: "horizontal_line", text: "15m CHoCH ↑ 27,706 — BOUNCE ORIGIN", overrides: { "linecolor": "#22C55E", "linewidth": 1, "linestyle": 1, "showLabel": true, "textColor": "#22C55E" } });
    return "ok";
  })()`);

  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${t - 300}, price: 27800 }, { time: ${tEnd}, price: 27600 }], { shape: "rectangle", text: "MICRO BOUNCE (15m/5m/1m bullish)", overrides: { "backgroundColor": "#22C55E10", "borderColor": "#22C55E33", "borderWidth": 1 } });
    return "ok";
  })()`);
  console.log("  ✓ Micro bounce: 15m↑ 5m↑ 1m↑");

  // ═══ ENTRY ZONE (sell the bounce) ═══
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tEnd - 100}, price: 28184 }, { time: ${tFar}, price: 28042 }], { shape: "rectangle", text: "ENTRY ZONE — Bearish FVG + OTE (sell pullback)", overrides: { "backgroundColor": "#FF6B3515", "borderColor": "#FF6B3544", "borderWidth": 1, "borderStyle": 1 } });
    return "ok";
  })()`);
  console.log("  ✓ Entry zone: 28,042-28,184");

  // ═══ OTE IDEAL ═══
  await run(client, `(function() {
    ${api}.createShape({ time: ${t + 200}, price: 28024 }, { shape: "horizontal_line", text: "OTE 70.5% Ideal @ 28,024", overrides: { "linecolor": "#F59E0B", "linewidth": 2, "linestyle": 0, "showLabel": true, "textColor": "#F59E0B" } });
    return "ok";
  })()`);

  // ═══ TARGETS ═══
  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide}, price: 27455 }, { shape: "horizontal_line", text: "TP1: SSL 27,455 (+292 pts)", overrides: { "linecolor": "#22C55E", "linewidth": 2, "linestyle": 1, "showLabel": true, "textColor": "#22C55E" } });
    return "ok";
  })()`);

  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide}, price: 26771 }, { shape: "horizontal_line", text: "TP2: 1W EQ 26,771 (+976 pts)", overrides: { "linecolor": "#22C55E", "linewidth": 1, "linestyle": 3, "showLabel": true, "textColor": "#22C55E" } });
    return "ok";
  })()`);
  console.log("  ✓ TP1: 27,455 | TP2: 26,771");

  // ═══ SL ═══
  await run(client, `(function() {
    ${api}.createShape({ time: ${t + 300}, price: 28217 }, { shape: "horizontal_line", text: "SL: Above 28,217 (1D CHoCH)", overrides: { "linecolor": "#EF4444", "linewidth": 2, "linestyle": 0, "showLabel": true, "textColor": "#EF4444" } });
    return "ok";
  })()`);

  // ═══ BSL POOLS ═══
  await run(client, `(function() {
    ${api}.createShape({ time: ${t + 200}, price: 28604 }, { shape: "horizontal_line", text: "BSL 28,604 (swept)", overrides: { "linecolor": "#E040FB", "linewidth": 1, "linestyle": 2, "showLabel": true, "textColor": "#E040FB" } });
    return "ok";
  })()`);

  await run(client, `(function() {
    ${api}.createShape({ time: ${t + 300}, price: 28844 }, { shape: "horizontal_line", text: "BSL 28,844 (2 touches, swept)", overrides: { "linecolor": "#E040FB", "linewidth": 1, "linestyle": 2, "showLabel": true, "textColor": "#E040FB" } });
    return "ok";
  })()`);

  await run(client, `(function() {
    ${api}.createShape({ time: ${t + 300}, price: 29193 }, { shape: "horizontal_line", text: "BSL 29,193 (3 touches)", overrides: { "linecolor": "#E2E8F0", "linewidth": 1, "linestyle": 2, "showLabel": true, "textColor": "#E2E8F0" } });
    return "ok";
  })()`);

  // ═══ BULLISH BREAKER OB ═══
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${t - 500}, price: 29478 }, { time: ${tFar}, price: 29385 }], { shape: "rectangle", text: "BULLISH BREAKER (1.68x) — far above", overrides: { "backgroundColor": "#94A3B810", "borderColor": "#94A3B844", "borderWidth": 1 } });
    return "ok";
  })()`);

  // ═══ BEARISH FVG (active) ═══
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${t - 400}, price: 29657 }, { time: ${tFar}, price: 29540 }], { shape: "rectangle", text: "BEARISH FVG (48% filled)", overrides: { "backgroundColor": "#CBD5E110", "borderColor": "#CBD5E144", "borderWidth": 1, "borderStyle": 2 } });
    return "ok";
  })()`);

  // ═══ INFO PANEL ═══
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tWide}, price: 30200 }, { time: ${t + 1500}, price: 31000 }], {
      shape: "text",
      text: "NAS100 — ICT ANALYSIS | Jul 29 London\\n\\n🥇 TRADE OF THE DAY\\n\\nHTF: 1D↓ 4H↓ 1H↓ (ALL BEARISH)\\nPo3: 9/10 EXCELLENT — best nesting\\n1D MANIP (Step2) → 4H leads into DIST\\nAMD: PREMIUM consensus → draw DOWN\\nTRENDING (1/8) | FULL SIZE (1.0x)\\n\\nMicro: 15m↑ 5m↑ 1m↑ (bounce)\\nSETUP: SELL THE BOUNCE\\nEntry: 28,042-28,184 (FVG+OTE pullback)\\nSL: Above 28,217 (1D CHoCH)\\nTP1: 27,455 (SSL) | TP2: 26,771 (1W EQ)\\n\\n⚠️ FOMC 14:00 — close by 13:45"
    });
    return "ok";
  })()`);

  // ═══ TRIGGER NOTE ═══
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tEnd + 800}, price: 27400 }, { time: ${tEnd + 1800}, price: 27550 }], {
      shape: "text",
      text: "⏳ TRIGGER:\\n1. Bounce to 28,042-28,184\\n2. 1m MSS ↓ at FVG\\n3. CISD on 5m\\n→ THEN SHORT"
    });
    return "ok";
  })()`);

  // ═══ BOUNCE EXHAUSTION ═══
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tEnd + 400}, price: 28000 }, { time: ${tEnd + 800}, price: 28100 }], {
      shape: "text",
      text: "5m @ Step 4 (EXPANSION)\\nBounce NEARLY exhausted\\nWait for rollover"
    });
    return "ok";
  })()`);

  await client.close();
  console.log("\n✅ NAS100 1m drawn — 17 levels");
  console.log("========================================");
  console.log("Current:     27,747  (WHITE)");
  console.log("1D CHoCH:    28,217  (RED — structural invalidation)");
  console.log("4H BOS:      27,781  (RED dashed)");
  console.log("1H CHoCH:    27,589  (RED dashed)");
  console.log("15m CHoCH↑:  27,706  (GREEN — bounce origin)");
  console.log("Entry Zone:  28,042-28,184  (ORANGE rect — FVG+OTE)");
  console.log("OTE Ideal:   28,024  (AMBER)");
  console.log("TP1:         27,455  (GREEN — SSL pool)");
  console.log("TP2:         26,771  (GREEN dotted — 1W EQ)");
  console.log("========================================");
  console.log("Setup: Wait for bounce to 28,050 area, then 1m MSS ↓ → SHORT");
})();
