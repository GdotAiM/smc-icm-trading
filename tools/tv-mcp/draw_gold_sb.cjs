// Draw Gold London Silver Bullet Setup
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

  console.log("Switching to GOLD 1m...");
  await run(client, `(function() {
    window.TradingViewApi._activeChartWidgetWV.value().setSymbol("XAUUSD", {});
    window.TradingViewApi._activeChartWidgetWV.value().setResolution("1");
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 3000));

  const timeRes = await client.Runtime.evaluate({
    expression: `(function() {
      var bars = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().bars();
      var end = bars.lastIndex();
      var start = Math.max(bars.firstIndex(), end - 200);
      return JSON.stringify({ t: bars.valueAt(start)[0], tEnd: bars.valueAt(end)[0] });
    })()`,
    returnByValue: true
  });
  const { t, tEnd } = JSON.parse(timeRes.result.value);
  const tWide = t - 600;
  const tFar = tEnd + 3000;
  const api = "window.TradingViewApi._activeChartWidgetWV.value()";

  // Clear
  await run(client, `(function() {
    try { ${api}.removeAllShapes(); } catch(e) {}
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 500));

  console.log("Drawing GOLD London SB Setup");

  // Current price
  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd + 600}, price: 4047.60 }, { shape: "horizontal_line", text: "NOW 4047.60 (02:25 NY)", overrides: { "linecolor": "#FFFFFF", "linewidth": 3, "linestyle": 0, "showLabel": true, "textColor": "#FFFFFF" } });
    return "ok";
  })()`);

  // Yesterday close
  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd}, price: 4086.00 }, { shape: "horizontal_line", text: "Mon Close 4086 (-$38 overnight)", overrides: { "linecolor": "#607D8B", "linewidth": 1, "linestyle": 2, "showLabel": true, "textColor": "#90A4AE" } });
    return "ok";
  })()`);

  // 1m BSL
  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd}, price: 4048.50 }, { shape: "horizontal_line", text: "1m BSL — micro bounce target", overrides: { "linecolor": "#E040FB", "linewidth": 1, "linestyle": 2, "showLabel": true, "textColor": "#E040FB" } });
    return "ok";
  })()`);

  // Overnight low
  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd - 200}, price: 4045.00 }, { shape: "horizontal_line", text: "Overnight Low ~4045", overrides: { "linecolor": "#26C6DA", "linewidth": 1, "linestyle": 3, "showLabel": true, "textColor": "#26C6DA" } });
    return "ok";
  })()`);

  // Entry zone rectangle
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${t}, price: 4050.00 }, { time: ${tFar}, price: 4046.00 }], { shape: "rectangle", text: "LONDON SB ENTRY ZONE", overrides: { "backgroundColor": "#FFD70015", "borderColor": "#FFD70044", "borderWidth": 1 } });
    return "ok";
  })()`);

  // Info panel
  await run(client, `(function() {
    var api = ${api};
    api.createMultipointShape([
      { time: ${t - 300}, price: 4060.00 },
      { time: ${tFar}, price: 4068.00 }
    ], {
      shape: "text",
      text: "GOLD (XAUUSD) LONDON SB SETUP\\nModel: Silver Bullet (London SB) + MMXM\\nCouncil: 3/4 BEARISH (75%) — Position/Swing/Day aligned\\nStructure: 5/6 TFs BEARISH — 1D-4H-1H BOS cascade\\nSweeps: 5 pools swept on 4H AND 1H — MASSIVE manipulation\\nOvernight: -$38 from Monday close — momentum confirmed\\nDXY: 101.52 BULLISH — USD strength = Gold weakness\\n\\nENTRY: SHORT on 1m bearish flip during London SB (03:00-04:00 NY)\\nSL: 4H swing high + ATR | TP1: Nearest SSL (1:1+)\\n\\nWHY GOLD > GBPUSD TODAY: 3/4 council vs 2/4 split\\n5 swept pools signal extreme institutional manipulation"
    });
    return "ok";
  })()`);

  // DXY correlation note
  await run(client, `(function() {
    ${api}.createMultipointShape([
      { time: ${tEnd + 200}, price: 4035.00 },
      { time: ${tFar}, price: 4040.00 }
    ], {
      shape: "text",
      text: "DXY 101.52 \\u2191\\nUSD STRONG\\nGold WEAK \\u2193"
    });
    return "ok";
  })()`);

  // London SB countdown
  await run(client, `(function() {
    ${api}.createMultipointShape([
      { time: ${tEnd + 900}, price: 4030.00 },
      { time: ${tFar}, price: 4035.00 }
    ], {
      shape: "text",
      text: "LONDON SB\\n03:00-04:00 NY\\n(~30 min)"
    });
    return "ok";
  })()`);

  await client.close();
  console.log("\nDRAWING COMPLETE — GOLD 1m London SB Setup");
  console.log("============================================");
  console.log("Current:    4047.60 (WHITE)");
  console.log("Mon Close:  4086.00 (-$38 overnight)");
  console.log("Entry Zone: 4046-4050 (GOLD rectangle)");
  console.log("1m BSL:     ~4048.50 (PURPLE — micro bounce target)");
  console.log("Overnight:  ~4045 (CYAN dotted)");
  console.log("");
  console.log("Council: 3/4 BEARISH (75%)");
  console.log("Structure: 5/6 TFs BEARISH (BOS cascade)");
  console.log("Sweeps: 5 on 4H + 5 on 1H — MASSIVE manipulation");
  console.log("DXY: 101.52 BULLISH — confirms Gold weakness");
  console.log("SB: London SB 03:00-04:00 NY (~30 min)");
})();
