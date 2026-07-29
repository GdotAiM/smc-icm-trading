const CDP = require("chrome-remote-interface");
const fs = require("fs");
const path = require("path");

async function run(client, expr) {
  await client.Runtime.evaluate({ expression: expr, returnByValue: true });
}

async function drawSetup(client, pair, tvSymbol, entry, sl, tp1, tp2, swingHi, swingLo, fcFile, t) {
  // Switch
  console.error(`\n=== ${pair} 15m ===`);
  await run(client, `(function() {
    window.TradingViewApi._activeChartWidgetWV.value().setSymbol("${tvSymbol}", {});
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 3500));
  await run(client, `(function() {
    window.TradingViewApi._activeChartWidgetWV.value().setResolution("15");
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 2500));

  // Get anchor time
  const timeRes = await client.Runtime.evaluate({
    expression: `(function() {
      var bars = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().bars();
      return JSON.stringify({ t: bars.valueAt(bars.lastIndex() - 80)[0] });
    })()`,
    returnByValue: true
  });
  const { t: anchorT } = JSON.parse(timeRes.result.value);

  // Clear
  await run(client, `(function() {
    try { window.TradingViewApi._activeChartWidgetWV.value().removeAllShapes(); } catch(e) {}
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 400));

  // Draw levels
  const levels = [
    { price: tp2, label: "TP2", color: "#00C853" },
    { price: tp1, label: "TP1 1:1", color: "#00E676" },
    { price: entry, label: "ENTRY", color: "#FFD700" },
    { price: swingHi, label: "Swing High", color: "#FF9800" },
    { price: sl, label: "SL", color: "#FF1744" },
  ];
  for (const l of levels) {
    await run(client, `(function() {
      try {
        var api = window.TradingViewApi._activeChartWidgetWV.value();
        api.createShape({ time: ${anchorT}, price: ${l.price} }, { shape: "horizontal_line", text: "${l.label}", overrides: { "linecolor": "${l.color}", "linewidth": 2, "linestyle": 0, "showLabel": true } });
      } catch(e) {}
      return "ok";
    })()`);
  }

  // Risk zone
  await run(client, `(function() {
    try {
      var api = window.TradingViewApi._activeChartWidgetWV.value();
      api.createMultipointShape(
        [{ time: ${anchorT - 86400*2}, price: ${sl} }, { time: ${anchorT + 86400*5}, price: ${entry} }],
        { shape: "rectangle", text: "RISK", overrides: { "backgroundColor": "#FF174422", "borderColor": "#FF174466", "linewidth": 1 } }
      );
    } catch(e) {}
    return "ok";
  })()`);

  // Forecast
  try {
    const fc = JSON.parse(fs.readFileSync(fcFile, "utf8"));
    const fcDir = fc.median_path[fc.median_path.length-1] > fc.current_price ? "BULLISH" : "BEARISH";
    const agree = (fcDir === "BEARISH" && entry > tp1) || (fcDir === "BULLISH" && entry < tp1);
    console.error(`  Forecast: ${fcDir} → ${fc.median_path[fc.median_path.length-1]} | SMC agrees: ${agree ? 'YES' : 'NO'}`);

    for (let i = 0; i < fc.median_path.length - 1; i++) {
      await run(client, `(function() {
        try {
          window.TradingViewApi._activeChartWidgetWV.value().createMultipointShape(
            [{ time: ${fc.future_times[i]}, price: ${fc.median_path[i]} }, { time: ${fc.future_times[i + 1]}, price: ${fc.median_path[i + 1]} }],
            { shape: "trend_line", overrides: { "linecolor": "#448AFF", "linewidth": 2, "linestyle": 2 } }
          );
        } catch(e) {}
        return "ok";
      })()`);
    }
    for (const band of [{ data: fc.upper_90, color: "#FF525244" }, { data: fc.lower_10, color: "#69F0AE44" }]) {
      for (let i = 0; i < band.data.length - 1; i++) {
        await run(client, `(function() {
          try {
            window.TradingViewApi._activeChartWidgetWV.value().createMultipointShape(
              [{ time: ${fc.future_times[i]}, price: ${band.data[i]} }, { time: ${fc.future_times[i + 1]}, price: ${band.data[i + 1]} }],
              { shape: "trend_line", overrides: { "linecolor": "${band.color}", "linewidth": 1, "linestyle": 2 } }
            );
          } catch(e) {}
          return "ok";
        })()`);
      }
    }
    console.error(`  Forecast path + bands drawn`);
  } catch(e) { console.error(`  No forecast: ${e.message}`); }

  return { pair, entry, sl, tp1, tp2, forecastDir: "bearish" };
}

(async () => {
  const r = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await r.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!chart) { console.log("No chart"); process.exit(1); }

  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();

  const TMP = process.env.TEMP || "/tmp";

  // ── GOLD 15m ──
  // 15m Swing H: 4058.01, Swing L: 4049.38
  const gold15Entry = 4052.845;
  const gold15SL = 4058.01 + 1.5; // swing high + buffer
  const goldSLDist = gold15SL - gold15Entry;
  const gold15TP1 = gold15Entry - goldSLDist;
  const gold15TP2 = gold15Entry - goldSLDist * 2;

  await drawSetup(client, "GOLD 15m", "XAUUSD",
    gold15Entry, gold15SL, gold15TP1, gold15TP2,
    4058.01, 4049.38,
    path.join(TMP, "gold_15m_fc.json"));

  console.log(`  Entry: ${gold15Entry} | SL: ${gold15SL} | TP1: ${gold15TP1} | TP2: ${gold15TP2}`);

  // ── GBPUSD 15m ──
  // 15m Swing H: 1.33294, Swing L: 1.33216, strong displacement (1.56x ATR)
  const gb15Entry = 1.33239;
  const gb15SL = 1.33294 + 0.00015;
  const gbSLDist = gb15SL - gb15Entry;
  const gb15TP1 = gb15Entry - gbSLDist;
  const gb15TP2 = gb15Entry - gbSLDist * 2;

  await drawSetup(client, "GBPUSD 15m", "GBPUSD",
    gb15Entry, gb15SL, gb15TP1, gb15TP2,
    1.33294, 1.33216,
    path.join(TMP, "gbpusd_15m_fc.json"));

  console.log(`  Entry: ${gb15Entry} | SL: ${gb15SL} | TP1: ${gb15TP1} | TP2: ${gb15TP2}`);

  await client.close();
  console.error("\n✅ Both 15m setups on TradingView — currently showing GBPUSD");
})();
