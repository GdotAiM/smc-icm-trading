const CDP = require("chrome-remote-interface");
const fs = require("fs");
const path = require("path");

async function run(client, expr) {
  const r = await client.Runtime.evaluate({ expression: expr, returnByValue: true });
}

(async () => {
  const r = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await r.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!chart) { console.log("No chart"); process.exit(1); }

  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();

  // Switch to GBPUSD 4H
  console.error("Loading GBPUSD 4H...");
  await run(client, `(function() {
    var c = window.TradingViewApi._activeChartWidgetWV.value();
    c.setSymbol("GBPUSD", {}); return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 4000));
  await run(client, `(function() {
    window.TradingViewApi._activeChartWidgetWV.value().setResolution("240");
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 3000));

  // Get a time within visible range
  const timeRes = await client.Runtime.evaluate({
    expression: `(function() {
      var bars = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().bars();
      var mid = bars.valueAt(bars.lastIndex() - 30);
      return JSON.stringify({ t: mid[0] });
    })()`,
    returnByValue: true
  });
  const { t } = JSON.parse(timeRes.result.value);
  console.error(`Anchor time: ${new Date(t*1000).toISOString()}`);

  // Clear first
  await run(client, `(function() {
    try { window.TradingViewApi._activeChartWidgetWV.value().removeAllShapes(); } catch(e) {}
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 500));

  // Draw each level using CORRECT API: createShape({time, price}, {shape, overrides, text})
  const levels = [
    { price: 1.31566, label: "TP2 1:2", color: "#00C853" },
    { price: 1.32402, label: "TP1 1:1", color: "#00E676" },
    { price: 1.33239, label: "ENTRY", color: "#FFD700" },
    { price: 1.33934, label: "Swing High", color: "#FF9800" },
    { price: 1.34076, label: "SL", color: "#FF1744" },
  ];

  console.error("Drawing levels...");
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

  // Draw risk zone rectangle (two-point shape)
  await run(client, `(function() {
    try {
      var api = window.TradingViewApi._activeChartWidgetWV.value();
      api.createMultipointShape(
        [{ time: ${t - 86400*5}, price: 1.34076 }, { time: ${t + 86400*15}, price: 1.33239 }],
        { shape: "rectangle", text: "RISK", overrides: { "backgroundColor": "#FF174422", "borderColor": "#FF174466", "linewidth": 1 } }
      );
    } catch(e) {}
    return "ok";
  })()`);
  console.error("  RISK ZONE rectangle");

  // Draw forecast median path (trend_line pieces)
  try {
    const fc = JSON.parse(fs.readFileSync(path.join(process.env.TEMP || "/tmp", "gbpusd_fc.json"), "utf8"));
    console.error(`Forecast: ${fc.direction} (${fc.pred_len} bars)`);

    for (let i = 0; i < fc.median_path.length - 1; i++) {
      const t1 = fc.future_times[i];
      const t2 = fc.future_times[i + 1];
      const p1 = fc.median_path[i];
      const p2 = fc.median_path[i + 1];
      await run(client, `(function() {
        try {
          var api = window.TradingViewApi._activeChartWidgetWV.value();
          api.createMultipointShape(
            [{ time: ${t1}, price: ${p1} }, { time: ${t2}, price: ${p2} }],
            { shape: "trend_line", overrides: { "linecolor": "#448AFF", "linewidth": 2, "linestyle": 2 } }
          );
        } catch(e) {}
        return "ok";
      })()`);
    }

    // Upper/lower bands
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
  } catch(e) { console.error("  No forecast file, skipping"); }

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
  console.error(`Shapes on chart: ${JSON.parse(verify.result.value).count}`);

  await client.close();
  console.error("✅ DONE — check your TradingView chart now");
})();
