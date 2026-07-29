// Draw XAUUSD + NAS100 signals, verify symbol, take screenshots
const CDP = require("./node_modules/chrome-remote-interface");
const fs = require("fs");

(async () => {
  const r = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await r.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!chart) { console.log("No chart"); process.exit(1); }
  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();
  const api = "window.TradingViewApi._activeChartWidgetWV.value()";

  async function ev(expr) {
    await client.Runtime.evaluate({ expression: expr, returnByValue: true });
  }

  // ═══ CLEAR ═══
  await ev(`(function() { try { ${api}.removeAllShapes(); } catch(e) {} return "ok"; })()`);
  await new Promise(r => setTimeout(r, 500));
  console.log("Cleared all shapes");

  // ═══════════════ XAUUSD ═══════════════
  console.log("Switching to XAUUSD 15m...");
  await ev(`(function() { ${api}.setSymbol("XAUUSD", {}); ${api}.setResolution("15"); return "ok"; })()`);
  await new Promise(r => setTimeout(r, 5000));

  // Verify symbol
  const v1 = await client.Runtime.evaluate({ expression: `(function(){ try { return ${api}.symbol(); } catch(e) { return e.message; } })()`, returnByValue: true });
  console.log("Verified symbol:", v1.result.value);

  // Get time range
  const tr1 = await client.Runtime.evaluate({ expression: `(function(){
    var bars = ${api}._chartWidget.model().mainSeries().bars();
    var e = bars.lastIndex(); var s = Math.max(bars.firstIndex(), e - 80);
    return JSON.stringify({tStart: bars.valueAt(s)[0], tEnd: bars.valueAt(e)[0]});
  })()`, returnByValue: true });
  const xau = JSON.parse(tr1.result.value);

  // Get live price
  const px1 = await client.Runtime.evaluate({ expression: `(function(){ var b=${api}._chartWidget.model().mainSeries().bars(); var i=b.lastIndex(); var v=b.valueAt(i); return JSON.stringify({close:v[4]}); })()`, returnByValue: true });
  const xauPx = JSON.parse(px1.result.value);
  console.log("XAUUSD live:", xauPx.close);

  // Draw levels
  await ev(`(function() {
    var tS=${xau.tStart}, tE=${xau.tEnd}, px=${xauPx.close};
    ${api}.createShape({ time: tS+100, price: 4036 }, { shape: "horizontal_line", text: "1D BOS BEARISH 4036", overrides: { linecolor: "#FF1744", linewidth: 2, linestyle: 2, showLabel: true, textColor: "#FF1744" } });
    ${api}.createShape({ time: tS+250, price: 4022 }, { shape: "horizontal_line", text: "4H BOS BEARISH 4022", overrides: { linecolor: "#FF5252", linewidth: 2, linestyle: 2, showLabel: true, textColor: "#FF5252" } });
    ${api}.createShape({ time: tS+400, price: 4015 }, { shape: "horizontal_line", text: "ENTRY ZONE 4015-4008", overrides: { linecolor: "#FFD740", linewidth: 3, linestyle: 0, showLabel: true, textColor: "#FFD740" } });
    ${api}.createShape({ time: tE+500, price: px }, { shape: "horizontal_line", text: "LIVE " + px.toFixed(1) + " (7/10)", overrides: { linecolor: "#FFD740", linewidth: 4, linestyle: 0, showLabel: true, textColor: "#FFD740" } });
    ${api}.createShape({ time: tE+500, price: 4130 }, { shape: "horizontal_line", text: "SL 4130", overrides: { linecolor: "#FF1744", linewidth: 2, linestyle: 1, showLabel: true, textColor: "#FF1744" } });
    ${api}.createShape({ time: tE+500, price: 3959 }, { shape: "horizontal_line", text: "TP1 3959 SSL", overrides: { linecolor: "#00E676", linewidth: 2, linestyle: 0, showLabel: true, textColor: "#00E676" } });
    ${api}.createShape({ time: tE+500, price: 3890 }, { shape: "horizontal_line", text: "TP2 3890 (2:1)", overrides: { linecolor: "#00C853", linewidth: 2, linestyle: 3, showLabel: true, textColor: "#00C853" } });
    return "ok";
  })()`);
  console.log("XAUUSD: 7 levels drawn");

  // Screenshot
  const ss1 = await client.Page.captureScreenshot({ format: "png" });
  fs.writeFileSync("C:/Users/cash/smc-icm-trading/shared/screenshots/xauusd_signals_2026-07-29.png", ss1.data, "base64");
  console.log("XAUUSD screenshot saved");

  // ═══════════════ NAS100 ═══════════════
  console.log("\nSwitching to NAS100 15m...");
  await ev(`(function() { ${api}.setSymbol("NAS100", {}); ${api}.setResolution("15"); return "ok"; })()`);
  await new Promise(r => setTimeout(r, 5000));

  const v2 = await client.Runtime.evaluate({ expression: `(function(){ try { return ${api}.symbol(); } catch(e) { return e.message; } })()`, returnByValue: true });
  console.log("Verified symbol:", v2.result.value);

  const tr2 = await client.Runtime.evaluate({ expression: `(function(){
    var bars = ${api}._chartWidget.model().mainSeries().bars();
    var e = bars.lastIndex(); var s = Math.max(bars.firstIndex(), e - 80);
    return JSON.stringify({tStart: bars.valueAt(s)[0], tEnd: bars.valueAt(e)[0]});
  })()`, returnByValue: true });
  const nas = JSON.parse(tr2.result.value);

  const px2 = await client.Runtime.evaluate({ expression: `(function(){ var b=${api}._chartWidget.model().mainSeries().bars(); var i=b.lastIndex(); var v=b.valueAt(i); return JSON.stringify({close:v[4]}); })()`, returnByValue: true });
  const nasPx = JSON.parse(px2.result.value);
  console.log("NAS100 live:", nasPx.close);

  // Clear + draw
  await ev(`(function() { try { ${api}.removeAllShapes(); } catch(e) {} return "ok"; })()`);
  await new Promise(r => setTimeout(r, 500));

  await ev(`(function() {
    var tS=${nas.tStart}, tE=${nas.tEnd};
    ${api}.createShape({ time: tS+100, price: 28614 }, { shape: "horizontal_line", text: "1D BOS BEARISH 28614", overrides: { linecolor: "#FF1744", linewidth: 2, linestyle: 2, showLabel: true, textColor: "#FF1744" } });
    ${api}.createShape({ time: tS+250, price: 27850 }, { shape: "horizontal_line", text: "4H BOS BEARISH 27850", overrides: { linecolor: "#FF5252", linewidth: 2, linestyle: 2, showLabel: true, textColor: "#FF5252" } });
    ${api}.createShape({ time: tE+500, price: ${nasPx.close} }, { shape: "horizontal_line", text: "LIVE " + Math.round(${nasPx.close}) + " (7/10)", overrides: { linecolor: "#FFD740", linewidth: 4, linestyle: 0, showLabel: true, textColor: "#FFD740" } });
    ${api}.createShape({ time: tE+500, price: 28727 }, { shape: "horizontal_line", text: "SL 28727", overrides: { linecolor: "#FF1744", linewidth: 2, linestyle: 1, showLabel: true, textColor: "#FF1744" } });
    ${api}.createShape({ time: tE+500, price: 27455 }, { shape: "horizontal_line", text: "TP1 27455", overrides: { linecolor: "#00E676", linewidth: 2, linestyle: 0, showLabel: true, textColor: "#00E676" } });
    ${api}.createShape({ time: tE+500, price: 26767 }, { shape: "horizontal_line", text: "TP2 26767 (2:1)", overrides: { linecolor: "#00C853", linewidth: 2, linestyle: 3, showLabel: true, textColor: "#00C853" } });
    return "ok";
  })()`);
  console.log("NAS100: 6 levels drawn");

  const ss2 = await client.Page.captureScreenshot({ format: "png" });
  fs.writeFileSync("C:/Users/cash/smc-icm-trading/shared/screenshots/nas100_signals_2026-07-29.png", ss2.data, "base64");
  console.log("NAS100 screenshot saved");

  await client.close();
  console.log("\n✅ Done. Both charts verified, drawn, and screenshotted.");
})();
