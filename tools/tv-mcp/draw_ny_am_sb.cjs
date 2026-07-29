// Draw NY AM SB Setup — GOLD + GBPUSD 1m — Day Trader / Scalper View
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

  // ═══════════════════════════════════════════════
  // GOLD 1m
  // ═══════════════════════════════════════════════
  console.log("Drawing GOLD 1m...");
  await run(client, `(function() {
    ${api}.setSymbol("XAUUSD", {});
    ${api}.setResolution("1");
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 3500));

  let timeRes = await client.Runtime.evaluate({
    expression: `(function() {
      var bars = ${api}._chartWidget.model().mainSeries().bars();
      var end = bars.lastIndex();
      var start = Math.max(bars.firstIndex(), end - 120);
      return JSON.stringify({ t: bars.valueAt(start)[0], tEnd: bars.valueAt(end)[0] });
    })()`, returnByValue: true
  });
  let t = JSON.parse(timeRes.result.value).t;
  let tEnd = JSON.parse(timeRes.result.value).tEnd;
  let tWide = t - 400;
  let tFar = tEnd + 2400;

  await run(client, `(function() { try { ${api}.removeAllShapes(); } catch(e) {} return "ok"; })()`);
  await new Promise(r => setTimeout(r, 500));

  // ── GOLD Levels ──
  // Judas Swing High (HOD of the bounce)
  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd - 600}, price: 4036.0 }, { shape: "horizontal_line", text: "Judas Swing High 4036 — SL", overrides: { "linecolor": "#FF1744", "linewidth": 3, "linestyle": 0, "showLabel": true, "textColor": "#FF1744" } });
    return "ok";
  })()`);

  // Entry zone (iFVG pullback)
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tEnd - 200}, price: 4031.0 }, { time: ${tFar}, price: 4028.5 }], { shape: "rectangle", text: "ENTRY ZONE (iFVG 4029-4030)", overrides: { "backgroundColor": "#FFD70015", "borderColor": "#FFD70044", "borderWidth": 1 } });
    return "ok";
  })()`);

  // Current price
  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd + 600}, price: 4028.48 }, { shape: "horizontal_line", text: "NOW 4028.48", overrides: { "linecolor": "#FFFFFF", "linewidth": 3, "linestyle": 0, "showLabel": true, "textColor": "#FFFFFF" } });
    return "ok";
  })()`);

  // BSL swept
  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd}, price: 4029.17 }, { shape: "horizontal_line", text: "BSL 4029 — SWEPT", overrides: { "linecolor": "#E040FB", "linewidth": 1, "linestyle": 2, "showLabel": true, "textColor": "#E040FB" } });
    return "ok";
  })()`);

  // SSL target
  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide}, price: 4025.66 }, { shape: "horizontal_line", text: "TP1: 1m SSL 4025.66", overrides: { "linecolor": "#00E676", "linewidth": 2, "linestyle": 0, "showLabel": true, "textColor": "#00E676" } });
    return "ok";
  })()`);

  // Forecast target
  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide}, price: 4018.0 }, { shape: "horizontal_line", text: "TP2: 5m Fcst 4018", overrides: { "linecolor": "#00C853", "linewidth": 1, "linestyle": 3, "showLabel": true, "textColor": "#00C853" } });
    return "ok";
  })()`);

  // Judas Swing zone
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${t - 200}, price: 4036.0 }, { time: ${tEnd}, price: 4023.0 }], { shape: "rectangle", text: "JUDAS SWING BOUNCE", overrides: { "backgroundColor": "#E040FB10", "borderColor": "#E040FB33", "borderWidth": 1 } });
    return "ok";
  })()`);

  // Info
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tWide}, price: 4045.0 }, { time: ${t + 300}, price: 4055.0 }], {
      shape: "text",
      text: "GOLD — NY AM SB SETUP (09:31 NY)\\n\\n1m: BEARISH BOS — reversal active\\nBSL 4029 SWEPT — trap sprung\\nEntry: 4028-4030 (iFVG pullback)\\nSL: 4036 (Judas Swing high)\\nTP1: 4025.66 (1m SSL) | TP2: 4018 (5m fcst)\\n\\nSB in 29 min | Macro in 19 min\\nGOLD ahead of GBPUSD — reversal confirmed"
    });
    return "ok";
  })()`);

  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tEnd + 1000}, price: 4040.0 }, { time: ${tEnd + 1400}, price: 4043.0 }], { shape: "text", text: "NY AM SB\\n10:00 NY\\n(29 min)" });
    return "ok";
  })()`);

  // ═══════════════════════════════════════════════
  // GBPUSD 1m
  // ═══════════════════════════════════════════════
  console.log("Switching to GBPUSD 1m...");
  await run(client, `(function() {
    ${api}.setSymbol("GBPUSD", {});
    ${api}.setResolution("1");
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 3500));

  timeRes = await client.Runtime.evaluate({
    expression: `(function() {
      var bars = ${api}._chartWidget.model().mainSeries().bars();
      var end = bars.lastIndex();
      var start = Math.max(bars.firstIndex(), end - 120);
      return JSON.stringify({ t: bars.valueAt(start)[0], tEnd: bars.valueAt(end)[0] });
    })()`, returnByValue: true
  });
  t = JSON.parse(timeRes.result.value).t;
  tEnd = JSON.parse(timeRes.result.value).tEnd;
  tWide = t - 400;
  tFar = tEnd + 2400;

  await run(client, `(function() { try { ${api}.removeAllShapes(); } catch(e) {} return "ok"; })()`);
  await new Promise(r => setTimeout(r, 500));

  // ── GBPUSD Levels ──
  // BSL (not yet swept)
  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd}, price: 1.3300 }, { shape: "horizontal_line", text: "BSL 1.3300 — NOT SWEPT — target UP", overrides: { "linecolor": "#E040FB", "linewidth": 2, "linestyle": 2, "showLabel": true, "textColor": "#E040FB" } });
    return "ok";
  })()`);

  // Current
  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd + 600}, price: 1.32986 }, { shape: "horizontal_line", text: "NOW 1.32986 (1m BULLISH — bounce active)", overrides: { "linecolor": "#FFFFFF", "linewidth": 3, "linestyle": 0, "showLabel": true, "textColor": "#FFFFFF" } });
    return "ok";
  })()`);

  // SSL
  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide}, price: 1.32960 }, { shape: "horizontal_line", text: "SSL 1.32960", overrides: { "linecolor": "#26C6DA", "linewidth": 1, "linestyle": 3, "showLabel": true, "textColor": "#26C6DA" } });
    return "ok";
  })()`);

  // 5m Forecast
  await run(client, `(function() {
    ${api}.createShape({ time: ${tWide}, price: 1.32842 }, { shape: "horizontal_line", text: "TP: 5m Fcst 1.32842 (-14p)", overrides: { "linecolor": "#00E676", "linewidth": 2, "linestyle": 0, "showLabel": true, "textColor": "#00E676" } });
    return "ok";
  })()`);

  // Expected entry zone
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tEnd + 200}, price: 1.3300 }, { time: ${tFar}, price: 1.3296 }], { shape: "rectangle", text: "ENTRY ZONE (after BSL sweep + flip)", overrides: { "backgroundColor": "#FFD70015", "borderColor": "#FFD70044", "borderWidth": 1, "borderStyle": 2 } });
    return "ok";
  })()`);

  // Bounce zone
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${t - 200}, price: 1.3305 }, { time: ${tEnd}, price: 1.3280 }], { shape: "rectangle", text: "BOUNCE ACTIVE (1m BULLISH)", overrides: { "backgroundColor": "#E040FB10", "borderColor": "#E040FB33", "borderWidth": 1 } });
    return "ok";
  })()`);

  // Info
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tWide}, price: 1.3320 }, { time: ${t + 300}, price: 1.3330 }], {
      shape: "text",
      text: "GBPUSD — NY AM SB SETUP (09:31 NY)\\n\\n1m: BULLISH BOS — bounce still active\\nBSL 1.3300 NOT SWEPT — drawing UP\\nEntry: AFTER BSL sweep + 1m bearish flip\\nSL: Above 1.3305 | TP: 1.32842 (5m fcst)\\n\\nSTATUS: WAIT — GOLD is ahead\\nGBPUSD needs BSL sweep + 1m flip first"
    });
    return "ok";
  })()`);

  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${tEnd + 1000}, price: 1.3315 }, { time: ${tEnd + 1400}, price: 1.3320 }], { shape: "text", text: "WAIT\\nfor 1m flip" });
    return "ok";
  })()`);

  await client.close();
  console.log("\nDONE — Both charts drawn");
  console.log("GOLD: BSL swept, bearish, entry zone 4028-4030, SL 4036, TP 4025/4018");
  console.log("GBPUSD: BSL not swept, bullish, waiting for flip, entry ~1.3298-1.3300");
})();
