const CDP = require("chrome-remote-interface");
const fs = require("fs");
const path = require("path");

const ROOT = "C:\\Users\\cash\\smc-icm-trading";
const DATE = new Date().toISOString().split("T")[0];

async function run(client, expr) {
  await client.Runtime.evaluate({ expression: expr, returnByValue: true });
}

function r5(v) { return Number(v).toFixed(5); }

(async () => {
  const r = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await r.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!chart) { console.log("No chart"); process.exit(1); }
  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();

  const sharedDir = path.join(ROOT, "shared", DATE, "GBPUSD");
  const r5m = JSON.parse(fs.readFileSync(path.join(sharedDir, "engine_5m.json"), "utf8"));

  // Load forecast
  const fcFile5m = path.join(process.env.TEMP || "/tmp", "gbpusd_5m_fc.json");
  let fc5m = null;
  if (fs.existsSync(fcFile5m)) fc5m = JSON.parse(fs.readFileSync(fcFile5m, "utf8"));

  // Switch to GBPUSD 5m
  console.error("Loading GBPUSD 5m + Forecast...");
  await run(client, `(function() {
    window.TradingViewApi._activeChartWidgetWV.value().setSymbol("GBPUSD", {});
    window.TradingViewApi._activeChartWidgetWV.value().setResolution("5");
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 4000));

  const timeRes = await client.Runtime.evaluate({
    expression: `(function() {
      var bars = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().bars();
      var end = bars.lastIndex();
      return JSON.stringify({ t: bars.valueAt(Math.max(bars.firstIndex(), end - 150))[0], tEnd: bars.valueAt(end)[0] });
    })()`,
    returnByValue: true
  });
  const { t, tEnd } = JSON.parse(timeRes.result.value);
  const tFar = tEnd + 3600 * 8;

  // Clear
  await run(client, `(function() {
    try { window.TradingViewApi._activeChartWidgetWV.value().removeAllShapes(); } catch(e) {}
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 500));

  // ═══════════════════════════════════════════
  // TRADE LEVELS (5m reload setup)
  // ═══════════════════════════════════════════
  const price = r5m.price;
  const s5Hi = r5m.structure.lastSwingHigh;
  const s5Lo = r5m.structure.lastSwingLow;
  const buffer = Math.abs(s5Hi - s5Lo) * 0.15;
  const sl = s5Hi + buffer;
  const slDist = Math.abs(price - sl);
  const tp1 = price - slDist;
  const tp2 = price - slDist * 2;

  const levels = [
    { price: sl, label: "🛑 SL (5m Sw H)", color: "#FF1744", w: 3, s: 0 },
    { price: s5Hi, label: "5m Sw H", color: "#E65100", w: 2, s: 0 },
    { price: price, label: "▼ ENTRY (reload)", color: "#FFD700", w: 3, s: 0 },
    { price: s5Lo, label: "5m Sw L", color: "#E65100", w: 2, s: 0 },
    { price: tp1, label: "✅ TP1 (1:1)", color: "#00E676", w: 3, s: 0 },
    { price: tp2, label: "✅ TP2 (1:2)", color: "#00C853", w: 2, s: 0 },
  ];
  for (const l of levels) {
    await run(client, `(function() {
      window.TradingViewApi._activeChartWidgetWV.value().createShape(
        { time: ${t}, price: ${l.price} },
        { shape: "horizontal_line", text: "${l.label}", overrides: { "linecolor": "${l.color}", "linewidth": ${l.w}, "linestyle": ${l.s}, "showLabel": true } }
      );
      return "ok";
    })()`);
  }

  // Risk/Reward zones
  await run(client, `(function() {
    var api = window.TradingViewApi._activeChartWidgetWV.value();
    api.createMultipointShape([{ time: ${t - 1800}, price: ${sl} }, { time: ${tFar}, price: ${price} }], { shape: "rectangle", text: "RISK", overrides: { "backgroundColor": "#FF174425", "borderColor": "#FF174466" } });
    api.createMultipointShape([{ time: ${t - 1800}, price: ${price} }, { time: ${tFar}, price: ${tp1} }], { shape: "rectangle", text: "REWARD", overrides: { "backgroundColor": "#00E67618", "borderColor": "#00E67644" } });
    return "ok";
  })()`);

  // ═══════════════════════════════════════════
  // FORECAST PATH (blue dotted)
  // ═══════════════════════════════════════════
  if (fc5m && fc5m.median_path) {
    console.error(`Forecast: ${fc5m.direction} → ${r5(fc5m.median_path[fc5m.median_path.length-1])} (${fc5m.pred_len} bars)`);

    // Median path
    for (let i = 0; i < fc5m.median_path.length - 1; i++) {
      await run(client, `(function() {
        window.TradingViewApi._activeChartWidgetWV.value().createMultipointShape(
          [{ time: ${fc5m.future_times[i]}, price: ${fc5m.median_path[i]} }, { time: ${fc5m.future_times[i + 1]}, price: ${fc5m.median_path[i + 1]} }],
          { shape: "trend_line", overrides: { "linecolor": "#448AFF", "linewidth": 2, "linestyle": 2 } }
        );
        return "ok";
      })()`);
    }

    // Confidence bands
    for (const band of [{ data: fc5m.upper_90, color: "#FF525233" }, { data: fc5m.lower_10, color: "#69F0AE33" }]) {
      for (let i = 0; i < band.data.length - 1; i++) {
        await run(client, `(function() {
          window.TradingViewApi._activeChartWidgetWV.value().createMultipointShape(
            [{ time: ${fc5m.future_times[i]}, price: ${band.data[i]} }, { time: ${fc5m.future_times[i + 1]}, price: ${band.data[i + 1]} }],
            { shape: "trend_line", overrides: { "linecolor": "${band.color}", "linewidth": 1, "linestyle": 2 } }
          );
          return "ok";
        })()`);
      }
    }

    // Forecast label
    await run(client, `(function() {
      try {
        window.TradingViewApi._activeChartWidgetWV.value().createShape(
          { time: ${fc5m.future_times[Math.floor(fc5m.pred_len/3)]} },
          { time: ${fc5m.future_times[fc5m.pred_len-1]}, price: ${fc5m.median_path[fc5m.pred_len-1] - (sl - price) * 0.3} },
          { shape: "text", text: "FORECAST: ${fc5m.direction} → ${r5(fc5m.median_path[fc5m.pred_len-1])}" }
        );
      } catch(e) {}
      return "ok";
    })()`);
  }

  // Context label
  const slPips = Math.round(slDist * 10000);
  const fcDir = fc5m?.direction || "N/A";
  const fcEnd = fc5m ? r5(fc5m.median_path[fc5m.median_path.length - 1]) : "N/A";
  const labelText = `📊 5M RELOAD + FORECAST | 5m:BEARISH CHoCH+2swp | Fc:${fcDir}→${fcEnd} | SL:${slPips}pip | TP1:${slPips}pip | Fc says bounce 1st → then reversal`;

  await run(client, `(function() {
    try {
      window.TradingViewApi._activeChartWidgetWV.value().createShape(
        { time: ${t + 900} },
        { time: ${t + 5400}, price: ${s5Hi + (sl - s5Hi) * 0.3} },
        { shape: "text", text: "${labelText}" }
      );
    } catch(e) {}
    return "ok";
  })()`);

  // Save forecast tracking file for later comparison
  const trackFile = path.join(ROOT, "shared", DATE, "GBPUSD", "forecast_track.json");
  fs.writeFileSync(trackFile, JSON.stringify({
    generated: new Date().toISOString(),
    pair: "GBPUSD", tf: "5m",
    currentPrice: fc5m?.current_price,
    direction: fc5m?.direction,
    medianEnd: fc5m?.median_path?.[fc5m.median_path.length - 1],
    upperEnd: fc5m?.upper_90?.[fc5m.upper_90.length - 1],
    lowerEnd: fc5m?.lower_10?.[fc5m.lower_10.length - 1],
    pred_len: fc5m?.pred_len,
    track: "Compare actual price at end of forecast period to evaluate performance",
  }, null, 2), "utf8");

  await client.close();
  console.log(JSON.stringify({
    pair: "GBPUSD", tf: "5m",
    setup: "SHORT reload",
    forecast: `${fcDir} → ${fcEnd}`,
    levels: { entry: r5(price), sl: r5(sl), tp1: r5(tp1), tp2: r5(tp2) },
    track: `shared/${DATE}/GBPUSD/forecast_track.json`,
  }));
})();
