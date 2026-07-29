// Draw XAUUSD signals — standalone
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
    const r = await client.Runtime.evaluate({ expression: expr, returnByValue: true });
    return r.result.value;
  }

  // Clear
  await ev(`(function() { try { ${api}.removeAllShapes(); } catch(e) {} return "ok"; })()`);

  // Switch and wait
  console.log("Setting XAUUSD 15m...");
  await ev(`(function() { ${api}.setSymbol("OANDA:XAUUSD", {}); ${api}.setResolution("15"); return "ok"; })()`);
  await new Promise(r => setTimeout(r, 4000));

  // Verify
  const sym = await ev(`(function() { return ${api}.symbol(); })()`);
  console.log("Symbol:", sym);

  // Get data
  const t = JSON.parse(await ev(`(function(){
    var bars = ${api}._chartWidget.model().mainSeries().bars();
    var e = bars.lastIndex(), s = Math.max(bars.firstIndex(), e - 80);
    return JSON.stringify({s: bars.valueAt(s)[0], e: bars.valueAt(e)[0]});
  })()`));
  const px = JSON.parse(await ev(`(function(){
    var b = ${api}._chartWidget.model().mainSeries().bars();
    var v = b.valueAt(b.lastIndex());
    return JSON.stringify({c: v[4], h: v[2], l: v[3]});
  })()`));
  console.log("Price:", px.c, "High:", px.h, "Low:", px.l);

  // Draw
  console.log("Drawing levels...");
  await ev(`(function() {
    var a = ${api};
    var ts = ${t.s}, te = ${t.e};
    a.createShape({ time: ts+100, price: 4036 }, { shape: "horizontal_line", text: "1D BOS BEARISH 4036", overrides: { linecolor: "#FF1744", linewidth: 2, linestyle: 2, showLabel: true, textColor: "#FF1744" } });
    a.createShape({ time: ts+250, price: 4022 }, { shape: "horizontal_line", text: "4H BOS BEARISH 4022", overrides: { linecolor: "#FF5252", linewidth: 2, linestyle: 2, showLabel: true, textColor: "#FF5252" } });
    a.createShape({ time: ts+400, price: 4015 }, { shape: "horizontal_line", text: "ENTRY ZONE 4015-4008", overrides: { linecolor: "#FFD740", linewidth: 3, linestyle: 0, showLabel: true, textColor: "#FFD740" } });
    a.createShape({ time: te+500, price: ${px.c} }, { shape: "horizontal_line", text: "LIVE " + ${px.c}.toFixed(1) + " (7/10)", overrides: { linecolor: "#FFD740", linewidth: 4, linestyle: 0, showLabel: true, textColor: "#FFD740" } });
    a.createShape({ time: te+500, price: 4130 }, { shape: "horizontal_line", text: "SL 4130", overrides: { linecolor: "#FF1744", linewidth: 2, linestyle: 1, showLabel: true, textColor: "#FF1744" } });
    a.createShape({ time: te+500, price: 3959 }, { shape: "horizontal_line", text: "TP1 3959 SSL", overrides: { linecolor: "#00E676", linewidth: 2, linestyle: 0, showLabel: true, textColor: "#00E676" } });
    a.createShape({ time: te+500, price: 3890 }, { shape: "horizontal_line", text: "TP2 3890 (2:1)", overrides: { linecolor: "#00C853", linewidth: 2, linestyle: 3, showLabel: true, textColor: "#00C853" } });
    return "ok";
  })()`);
  console.log("7 levels drawn");

  // Screenshot
  const ss = await client.Page.captureScreenshot({ format: "png" });
  fs.writeFileSync("C:/Users/cash/smc-icm-trading/shared/screenshots/xauusd_signals_2026-07-29.png", ss.data, "base64");
  console.log("Screenshot saved");

  await client.close();
  console.log("Done — XAUUSD");
})();
