// Draw XAUUSD 1m — standalone reversal setup
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

  console.log("Switching to XAUUSD 1m...");
  await run(client, `(function() {
    ${api}.setSymbol("XAUUSD", {});
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

  // ═══ CURRENT ═══
  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd + 1000}, price: 4043.70 }, { shape: "horizontal_line", text: "NOW $4,043", overrides: { "linecolor": "#FFFFFF", "linewidth": 3, "linestyle": 0, "showLabel": true, "textColor": "#FFFFFF" } });
    return "ok";
  })()`);

  // ═══ 4H CHoCH — THE FLIP ═══
  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd}, price: 4040.81 }, { shape: "horizontal_line", text: "⚡ 4H CHoCH → BULLISH", overrides: { "linecolor": "#22C55E", "linewidth": 3, "linestyle": 0, "showLabel": true, "textColor": "#22C55E" } });
    return "ok";
  })()`);

  // ═══ 1H BOS — THE TRAP ═══
  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide + 200}, price: 4034.80 }, { shape: "horizontal_line", text: "🎯 1H Bearish BOS — SWEEP BELOW = TRIGGER", overrides: { "linecolor": "#FF1744", "linewidth": 2, "linestyle": 0, "showLabel": true, "textColor": "#FF1744" } });
    return "ok";
  })()`);

  // ═══ 1D BOS ═══
  await run(client, `(function() {
    ${api}.createShape({ time: ${t + 100}, price: 4366 }, { shape: "horizontal_line", text: "1D BOS $4,366 (-$323 — distribution exhausted)", overrides: { "linecolor": "#EF4444", "linewidth": 2, "linestyle": 0, "showLabel": true, "textColor": "#EF4444" } });
    return "ok";
  })()`);

  // ═══ SSL / SUPPORT ═══
  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide}, price: 4020.45 }, { shape: "horizontal_line", text: "SSL SWEPT $4,020 (3 touches)", overrides: { "linecolor": "#E040FB", "linewidth": 1, "linestyle": 2, "showLabel": true, "textColor": "#E040FB" } });
    return "ok";
  })()`);

  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide}, price: 3959.80 }, { shape: "horizontal_line", text: "1D Swing Low $3,960 — SL BELOW THIS", overrides: { "linecolor": "#26C6DA", "linewidth": 2, "linestyle": 1, "showLabel": true, "textColor": "#26C6DA" } });
    return "ok";
  })()`);

  // ═══ BSL TARGET ═══
  await run(client, `(function() {
    ${api}.createShape({ time: ${t + 100}, price: 4117.79 }, { shape: "horizontal_line", text: "BSL $4,118 — TP1 IF REVERSAL", overrides: { "linecolor": "#22C55E", "linewidth": 2, "linestyle": 1, "showLabel": true, "textColor": "#22C55E" } });
    return "ok";
  })()`);

  await run(client, `(function() {
    ${api}.createShape({ time: ${t + 100}, price: 4166 }, { shape: "horizontal_line", text: "1D Swing High $4,166 — TP2", overrides: { "linecolor": "#22C55E", "linewidth": 1, "linestyle": 3, "showLabel": true, "textColor": "#22C55E" } });
    return "ok";
  })()`);

  // ═══ ORDER BLOCKS ═══
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${t - 400}, price: 4061.80 }, { time: ${tFar}, price: 4044.72 }], { shape: "rectangle", text: "BEARISH BREAKER (1.0x)", overrides: { "backgroundColor": "#94A3B810", "borderColor": "#94A3B844", "borderWidth": 1 } });
    return "ok";
  })()`);

  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${t - 400}, price: 4042.43 }, { time: ${tFar}, price: 4021.38 }], { shape: "rectangle", text: "BULLISH BREAKER (3.2x) — SUPPORT", overrides: { "backgroundColor": "#22C55E10", "borderColor": "#22C55E33", "borderWidth": 1 } });
    return "ok";
  })()`);

  // ═══ REVERSAL ZONE ═══
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${t - 400}, price: 4045 }, { time: ${tFar}, price: 4020 }], { shape: "rectangle", text: "REVERSAL ZONE — 4H MANIPULATION", overrides: { "backgroundColor": "#E040FB10", "borderColor": "#E040FB33", "borderWidth": 1 } });
    return "ok";
  })()`);

  // ═══ INFO ═══
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tWide}, price: 4200 }, { time: ${t + 1200}, price: 4270 }], {
      shape: "text",
      text: "XAUUSD (GOLD) — ICT REVERSAL SETUP\\nJul 29 London | FOMC Day\\n\\n-$323 from 1D BOS — DISTRIBUTION EXHAUSTED\\n⚡ 4H CHoCH → BULLISH (first HTF reversal)\\nMicro cascade: 15m↑ 5m↑ 1m↑ (all bullish)\\nOnly TRENDING market today (1/8 range)\\nQuarterly shift ACTIVE\\n\\nPo3: DIST→MANIP→DIST | Fractal 11/20\\nMMXM: 4H Step2 lagging 1D Step3\\n\\nSETUP: Turtle Soup LONG\\nTRIGGER: Sweep below $4,034.80 + 1m MSS↑\\nSL: Below $3,960 | TP1: $4,118 | TP2: $4,166\\n\\n⚠️ FOMC 14:00 ET — gold moves VIOLENTLY\\n⏳ Do NOT enter before the sweep"
    });
    return "ok";
  })()`);

  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tEnd + 800}, price: 4028 }, { time: ${tEnd + 1600}, price: 4034 }], {
      shape: "text",
      text: "⏳ WAIT FOR:\\n1. Sweep < $4,034.80\\n2. 1m MSS ↑\\n3. CISD confirm\\n→ THEN LONG"
    });
    return "ok";
  })()`);

  // ═══ FOMC COUNTDOWN ═══
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tEnd + 2000}, price: 4010 }, { time: ${tEnd + 2600}, price: 4016 }], {
      shape: "text",
      text: "🛑 FOMC 14:00 ET\\nCLOSE ALL BY 13:45"
    });
    return "ok";
  })()`);

  await client.close();
  console.log("✅ XAUUSD 1m drawn — 15 levels");
  console.log("Reversal setup: wait for sweep < $4,034.80, then LONG");
})();
