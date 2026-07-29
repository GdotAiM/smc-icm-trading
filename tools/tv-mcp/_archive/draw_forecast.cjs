const CDP = require("chrome-remote-interface");
const fs = require("fs");
const path = require("path");

async function evalExpr(client, expr) {
  const r = await client.Runtime.evaluate({ expression: expr, returnByValue: true });
  try { return JSON.parse(r.result.value); } catch { return r.result.value; }
}

(async () => {
  const resp = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await resp.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!chart) { console.log("No chart"); process.exit(1); }

  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();

  // Load forecast
  const forecast = JSON.parse(fs.readFileSync(path.join(process.env.TEMP || "/tmp", "gbpusd_fc.json"), "utf8"));
  console.error(`Forecast: ${forecast.direction} | ${forecast.pred_len} bars | Current: ${forecast.current_price}`);

  // Get visible time range
  const range = await evalExpr(client, `(function() {
    var bars = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().bars();
    var end = bars.lastIndex();
    return JSON.stringify({ t1: bars.valueAt(Math.max(bars.firstIndex(), end - 100))[0], lastBarTime: bars.valueAt(end)[0] });
  })()`);
  const { t1, lastBarTime } = range;
  const extendDays = forecast.pred_len * 4 / 24; // rough days based on 4H bars

  // Clear old shapes
  await evalExpr(client, `(function() {
    try { window.TradingViewApi._activeChartWidgetWV.value().removeAllShapes(); return "cleared"; } catch(e) { return e.message; }
  })()`);
  await new Promise(r => setTimeout(r, 300));

  console.error("Drawing forecast paths...");

  // ── Draw forecast median path ──
  for (let i = 0; i < forecast.median_path.length; i++) {
    const time = forecast.future_times[i];
    const price = forecast.median_path[i];
    if (i < forecast.median_path.length - 1) {
      const nt = forecast.future_times[i + 1];
      const np = forecast.median_path[i + 1];
      await evalExpr(client, `(function() {
        try {
          var api = window.TradingViewApi._activeChartWidgetWV.value();
          api.createMultipointShape(
            [{ time: ${time}, price: ${price} }, { time: ${nt}, price: ${np} }],
            { shape: "trend_line", overrides: {
              "linecolor": "#448AFFFF",
              "linestyle": 2,
              "linewidth": 2,
              "showLabel": false
            }}
          );
          return "ok";
        } catch(e) { return e.message; }
      })()`);
    }
  }

  // ── Draw upper/lower bands as dotted lines ──
  for (let band of [{ data: forecast.upper_90, color: "#FF5252", label: "90%" }, { data: forecast.lower_10, color: "#69F0AE", label: "10%" }]) {
    for (let i = 0; i < band.data.length - 1; i++) {
      await evalExpr(client, `(function() {
        try {
          var api = window.TradingViewApi._activeChartWidgetWV.value();
          api.createMultipointShape(
            [{ time: ${forecast.future_times[i]}, price: ${band.data[i]} }, { time: ${forecast.future_times[i + 1]}, price: ${band.data[i + 1]} }],
            { shape: "trend_line", overrides: {
              "linecolor": "${band.color}44",
              "linestyle": 2,
              "linewidth": 1,
              "showLabel": false
            }}
          );
          return "ok";
        } catch(e) { return e.message; }
      })()`);
    }
  }

  // ── Redraw SMC levels on top ──
  const levels = [
    { price: 1.31566, label: "TP2 (1:2)", color: "#00C853" },
    { price: 1.32402, label: "TP1 (1:1)", color: "#00E676" },
    { price: 1.33239, label: "▼ ENTRY", color: "#FFD700" },
    { price: 1.33934, label: "Swing High", color: "#FF9800" },
    { price: 1.34076, label: "▲ SL", color: "#FF1744" },
  ];
  for (const l of levels) {
    await evalExpr(client, `(function() {
      try {
        var api = window.TradingViewApi._activeChartWidgetWV.value();
        api.createShape(
          { time: ${t1} },
          { time: ${lastBarTime + 86400 * 10}, price: ${l.price} },
          { shape: "horizontal_line", overrides: {
            "linecolor": "${l.color}", "linestyle": 0, "linewidth": 2,
            "showLabel": true, "text": "${l.label}"
          }}
        );
        return "ok";
      } catch(e) { return e.message; }
    })()`);
  }

  // Add forecast label
  await evalExpr(client, `(function() {
    try {
      var api = window.TradingViewApi._activeChartWidgetWV.value();
      var midIdx = Math.floor(${forecast.pred_len} / 2);
      api.createShape(
        { time: ${forecast.future_times[Math.floor(forecast.pred_len / 3)]} },
        { time: ${forecast.future_times[forecast.pred_len - 1]}, price: ${forecast.median_path[forecast.pred_len - 1]} },
        { shape: "text", text: "FORECAST (${forecast.direction.toUpperCase()})" }
      );
      return "ok";
    } catch(e) { return e.message; }
  })()`);

  await client.close();
  console.log(JSON.stringify({
    setup: "GBPUSD SHORT",
    entry: 1.33239, sl: 1.34076, tp1: 1.32402, tp2: 1.31566,
    forecast: `${forecast.direction} → ${forecast.median_path[forecast.median_path.length-1]}`,
    divergence: forecast.direction === "bearish" ? "Forecast AGREES with SMC bias" : "⚠️ Forecast DIVERGES — bullish statistical path vs bearish SMC structure"
  }));
})();
