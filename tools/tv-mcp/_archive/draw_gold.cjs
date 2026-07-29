const CDP = require("chrome-remote-interface");
const fs = require("fs");
const path = require("path");

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

  // Switch to XAUUSD 4H
  console.error("Loading XAUUSD (GOLD) 4H...");
  await run(client, `(function() {
    var c = window.TradingViewApi._activeChartWidgetWV.value();
    c.setSymbol("XAUUSD", {}); return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 4000));
  await run(client, `(function() {
    window.TradingViewApi._activeChartWidgetWV.value().setResolution("240");
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 3000));

  // Get anchor time
  const timeRes = await client.Runtime.evaluate({
    expression: `(function() {
      var bars = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().bars();
      return JSON.stringify({ t: bars.valueAt(bars.lastIndex() - 40)[0] });
    })()`,
    returnByValue: true
  });
  const { t } = JSON.parse(timeRes.result.value);

  // Clear
  await run(client, `(function() {
    try { window.TradingViewApi._activeChartWidgetWV.value().removeAllShapes(); } catch(e) {}
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 500));

  // Gold setup levels
  const levels = [
    { price: 3783.05, label: "TP2 1:2", color: "#00C853" },
    { price: 3917.95, label: "TP1 1:1", color: "#00E676" },
    { price: 4052.845, label: "ENTRY", color: "#FFD700" },
    { price: 4166.13, label: "Swing High", color: "#FF9800" },
    { price: 4187.74, label: "SL", color: "#FF1744" },
  ];

  console.error("Drawing Gold levels...");
  for (const l of levels) {
    await run(client, `(function() {
      try {
        var api = window.TradingViewApi._activeChartWidgetWV.value();
        api.createShape(
          { time: ${t}, price: ${l.price} },
          { shape: "horizontal_line", text: "${l.label}", overrides: { "linecolor": "${l.color}", "linewidth": 2, "linestyle": 0, "showLabel": true } }
        );
      } catch(e) {}
      return "ok";
    })()`);
    console.error(`  ${l.label} @ ${l.price}`);
  }

  // Risk zone
  await run(client, `(function() {
    try {
      var api = window.TradingViewApi._activeChartWidgetWV.value();
      api.createMultipointShape(
        [{ time: ${t - 86400*5}, price: 4187.74 }, { time: ${t + 86400*15}, price: 4052.845 }],
        { shape: "rectangle", text: "RISK", overrides: { "backgroundColor": "#FF174422", "borderColor": "#FF174466", "linewidth": 1 } }
      );
    } catch(e) {}
    return "ok";
  })()`);

  // Forecast
  try {
    const fc = JSON.parse(fs.readFileSync(path.join(process.env.TEMP || "/tmp", "gold_fc.json"), "utf8"));
    console.error(`Forecast: ${fc.direction} → ${fc.median_path[fc.median_path.length-1]}`);

    for (let i = 0; i < fc.median_path.length - 1; i++) {
      await run(client, `(function() {
        try {
          var api = window.TradingViewApi._activeChartWidgetWV.value();
          api.createMultipointShape(
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
            var api = window.TradingViewApi._activeChartWidgetWV.value();
            api.createMultipointShape(
              [{ time: ${fc.future_times[i]}, price: ${band.data[i]} }, { time: ${fc.future_times[i + 1]}, price: ${band.data[i + 1]} }],
              { shape: "trend_line", overrides: { "linecolor": "${band.color}", "linewidth": 1, "linestyle": 2 } }
            );
          } catch(e) {}
          return "ok";
        })()`);
      }
    }
    console.error(`  Forecast path + bands drawn`);
  } catch(e) { console.error("  No forecast file"); }

  // Verify
  const verify = await client.Runtime.evaluate({
    expression: `(function() {
      try {
        var api = window.TradingViewApi._activeChartWidgetWV.value();
        var shapes = api.getAllShapes ? api.getAllShapes() : [];
        return JSON.stringify({ count: shapes.length });
      } catch(e) { return JSON.stringify({ error: e.message }); }
    })()`,
    returnByValue: true
  });
  console.error(`Shapes: ${JSON.parse(verify.result.value).count}`);
  await client.close();
  console.error("✅ DONE — XAUUSD on your TradingView");
})();
