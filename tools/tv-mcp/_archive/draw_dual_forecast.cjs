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
  const r1m = JSON.parse(fs.readFileSync(path.join(sharedDir, "engine_1m.json"), "utf8"));

  // Load forecasts
  const fc5mFile = path.join(process.env.TEMP || "/tmp", "gbpusd_5m_fc.json");
  const fc1mFile = path.join(process.env.TEMP || "/tmp", "gbpusd_1m_fc.json");
  let fc5m = null, fc1m = null;
  if (fs.existsSync(fc5mFile)) fc5m = JSON.parse(fs.readFileSync(fc5mFile, "utf8"));
  if (fs.existsSync(fc1mFile)) fc1m = JSON.parse(fs.readFileSync(fc1mFile, "utf8"));

  const fc5Dir = fc5m?.direction || "N/A";
  const fc1Dir = fc1m?.direction || "N/A";
  const fc5End = fc5m ? r5(fc5m.median_path[fc5m.median_path.length - 1]) : "N/A";
  const fc1End = fc1m ? r5(fc1m.median_path[fc1m.median_path.length - 1]) : "N/A";

  // ═══════════════════════════════════════════
  // 5M CHART — BULLISH FORECAST
  // ═══════════════════════════════════════════
  console.error(`\n=== 5M — Fc: ${fc5Dir} → ${fc5End} ===`);

  await run(client, `(function() {
    window.TradingViewApi._activeChartWidgetWV.value().setSymbol("GBPUSD", {});
    window.TradingViewApi._activeChartWidgetWV.value().setResolution("5");
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 4000));

  let timeRes = await client.Runtime.evaluate({
    expression: `(function() {
      var bars = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().bars();
      var end = bars.lastIndex();
      return JSON.stringify({ t: bars.valueAt(Math.max(bars.firstIndex(), end - 150))[0], tEnd: bars.valueAt(end)[0] });
    })()`,
    returnByValue: true
  });
  let { t, tEnd } = JSON.parse(timeRes.result.value);
  let tFar = tEnd + 3600 * 8;

  await run(client, `(function() {
    try { window.TradingViewApi._activeChartWidgetWV.value().removeAllShapes(); } catch(e) {}
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 500));

  // Trade levels
  const p5 = r5m.price, s5Hi = r5m.structure.lastSwingHigh, s5Lo = r5m.structure.lastSwingLow;
  const buf5 = Math.abs(s5Hi - s5Lo) * 0.15;
  const sl5 = s5Hi + buf5, slDist5 = sl5 - p5, tp1_5 = p5 - slDist5;
  const slPips = Math.round(slDist5 * 10000);

  const levels5 = [
    { price: sl5, label: "🛑 SL", color: "#FF1744", w: 3, s: 0 },
    { price: s5Hi, label: "5m Sw H", color: "#E65100", w: 2, s: 0 },
    { price: p5, label: "▼ ENTRY (reload)", color: "#FFD700", w: 3, s: 0 },
    { price: tp1_5, label: "✅ TP1 (1:1)", color: "#00E676", w: 3, s: 0 },
  ];
  for (const l of levels5) {
    await run(client, `(function() {
      window.TradingViewApi._activeChartWidgetWV.value().createShape(
        { time: ${t}, price: ${l.price} },
        { shape: "horizontal_line", text: "${l.label}", overrides: { "linecolor": "${l.color}", "linewidth": ${l.w}, "linestyle": ${l.s}, "showLabel": true } }
      );
      return "ok";
    })()`);
  }

  // Risk/Reward
  await run(client, `(function() {
    var api = window.TradingViewApi._activeChartWidgetWV.value();
    api.createMultipointShape([{ time: ${t - 1800}, price: ${sl5} }, { time: ${tFar}, price: ${p5} }], { shape: "rectangle", text: "RISK", overrides: { "backgroundColor": "#FF174425", "borderColor": "#FF174466" } });
    api.createMultipointShape([{ time: ${t - 1800}, price: ${p5} }, { time: ${tFar}, price: ${tp1_5} }], { shape: "rectangle", text: "REWARD", overrides: { "backgroundColor": "#00E67618", "borderColor": "#00E67644" } });
    return "ok";
  })()`);

  // 5M Forecast (bullish — green/blue)
  if (fc5m?.median_path) {
    for (let i = 0; i < fc5m.median_path.length - 1; i++) {
      await run(client, `(function() {
        window.TradingViewApi._activeChartWidgetWV.value().createMultipointShape(
          [{ time: ${fc5m.future_times[i]}, price: ${fc5m.median_path[i]} }, { time: ${fc5m.future_times[i + 1]}, price: ${fc5m.median_path[i + 1]} }],
          { shape: "trend_line", overrides: { "linecolor": "#4CAF50", "linewidth": 2, "linestyle": 2 } }
        );
        return "ok";
      })()`);
    }
    await run(client, `(function() {
      try {
        window.TradingViewApi._activeChartWidgetWV.value().createShape(
          { time: ${fc5m.future_times[Math.floor(fc5m.pred_len/3)]} },
          { time: ${fc5m.future_times[fc5m.pred_len-1]}, price: ${fc5m.median_path[fc5m.pred_len-1] - slDist5 * 0.3} },
          { shape: "text", text: "🟢 5M Fc → ${fc5End}" }
        );
      } catch(e) {}
      return "ok";
    })()`);
  }

  const label5 = `📊 5M RELOAD | 🟢 5mFc→${fc5End} | 🔴 1mFc→${fc1End} | DIVERGENCE:5m bounce 1st, 1m reversal after | SL:${slPips}pip | Wait for 1m bearish CHoCH`;
  await run(client, `(function() {
    try {
      window.TradingViewApi._activeChartWidgetWV.value().createShape(
        { time: ${t + 900} },
        { time: ${t + 5400}, price: ${s5Hi + (sl5 - s5Hi) * 0.3} },
        { shape: "text", text: "${label5}" }
      );
    } catch(e) {}
    return "ok";
  })()`);

  // ═══════════════════════════════════════════
  // 1M CHART — BEARISH FORECAST
  // ═══════════════════════════════════════════
  console.error(`\n=== 1M — Fc: ${fc1Dir} → ${fc1End} ===`);

  await run(client, `(function() {
    window.TradingViewApi._activeChartWidgetWV.value().setResolution("1");
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 3000));

  timeRes = await client.Runtime.evaluate({
    expression: `(function() {
      var bars = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().bars();
      var end = bars.lastIndex();
      return JSON.stringify({ t: bars.valueAt(Math.max(bars.firstIndex(), end - 400))[0], tEnd: bars.valueAt(end)[0] });
    })()`,
    returnByValue: true
  });
  let tInfo = JSON.parse(timeRes.result.value);
  t = tInfo.t; tEnd = tInfo.tEnd; tFar = tEnd + 3600;

  await run(client, `(function() {
    try { window.TradingViewApi._activeChartWidgetWV.value().removeAllShapes(); } catch(e) {}
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 500));

  // 1m levels
  const p1 = r1m.price, s1Hi = r1m.structure.lastSwingHigh, s1Lo = r1m.structure.lastSwingLow;
  const buf1 = Math.abs(s1Hi - s1Lo) * 0.15;
  const sl1 = s5Hi + Math.abs(s5Hi - s5Lo) * 0.15;
  const slDist1 = sl1 - p1, tp1_1 = p1 - slDist1;

  const levels1 = [
    { price: sl1, label: "🛑 SL (5m Sw H)", color: "#FF1744", w: 3, s: 0 },
    { price: p1, label: "⏳ 1m WAIT", color: "#FFD700", w: 3, s: 0 },
    { price: tp1_1, label: "✅ TP1 (1:1)", color: "#00E676", w: 2, s: 0 },
  ];
  for (const l of levels1) {
    await run(client, `(function() {
      window.TradingViewApi._activeChartWidgetWV.value().createShape(
        { time: ${t}, price: ${l.price} },
        { shape: "horizontal_line", text: "${l.label}", overrides: { "linecolor": "${l.color}", "linewidth": ${l.w}, "linestyle": ${l.s}, "showLabel": true } }
      );
      return "ok";
    })()`);
  }

  // 5m context
  await run(client, `(function() {
    var api = window.TradingViewApi._activeChartWidgetWV.value();
    api.createShape({ time: ${t}, price: ${s5Hi} }, { shape: "horizontal_line", text: "5m Sw H", overrides: { "linecolor": "#E65100", "linewidth": 1, "linestyle": 2, "showLabel": true } });
    api.createShape({ time: ${t}, price: ${s5Lo} }, { shape: "horizontal_line", text: "5m Sw L", overrides: { "linecolor": "#E65100", "linewidth": 1, "linestyle": 2, "showLabel": true } });
    return "ok";
  })()`);

  // 1M Forecast (bearish — red)
  if (fc1m?.median_path) {
    for (let i = 0; i < fc1m.median_path.length - 1; i++) {
      await run(client, `(function() {
        window.TradingViewApi._activeChartWidgetWV.value().createMultipointShape(
          [{ time: ${fc1m.future_times[i]}, price: ${fc1m.median_path[i]} }, { time: ${fc1m.future_times[i + 1]}, price: ${fc1m.median_path[i + 1]} }],
          { shape: "trend_line", overrides: { "linecolor": "#FF5252", "linewidth": 2, "linestyle": 2 } }
        );
        return "ok";
      })()`);
    }
    await run(client, `(function() {
      try {
        window.TradingViewApi._activeChartWidgetWV.value().createShape(
          { time: ${fc1m.future_times[Math.floor(fc1m.pred_len/3)]} },
          { time: ${fc1m.future_times[fc1m.pred_len-1]}, price: ${fc1m.median_path[fc1m.pred_len-1] - slDist1 * 0.3} },
          { shape: "text", text: "🔴 1M Fc → ${fc1End}" }
        );
      } catch(e) {}
      return "ok";
    })()`);
  }

  const label1 = `📊 1M DUAL Fc | 🟢 5mFc→${fc5End} (bounce) | 🔴 1mFc→${fc1End} (reversal) | DIVERGENCE tracking | Wait for bearish CHoCH`;
  await run(client, `(function() {
    try {
      window.TradingViewApi._activeChartWidgetWV.value().createShape(
        { time: ${t + 300} },
        { time: ${t + 1200}, price: ${s5Hi + (sl1 - s5Hi) * 0.3} },
        { shape: "text", text: "${label1}" }
      );
    } catch(e) {}
    return "ok";
  })()`);

  // Save tracking file
  const trackFile = path.join(ROOT, "shared", DATE, "GBPUSD", "forecast_track.json");
  fs.writeFileSync(trackFile, JSON.stringify({
    generated: new Date().toISOString(),
    pair: "GBPUSD",
    forecasts: {
      "5m": {
        direction: fc5Dir,
        current: fc5m?.current_price,
        medianEnd: fc5End,
        upperEnd: fc5m?.upper_90 ? r5(fc5m.upper_90[fc5m.upper_90.length - 1]) : "N/A",
        lowerEnd: fc5m?.lower_10 ? r5(fc5m.lower_10[fc5m.lower_10.length - 1]) : "N/A",
        predBars: fc5m?.pred_len,
        predEndApprox: "~05:45 NY",
      },
      "1m": {
        direction: fc1Dir,
        current: fc1m?.current_price,
        medianEnd: fc1End,
        upperEnd: fc1m?.upper_90 ? r5(fc1m.upper_90[fc1m.upper_90.length - 1]) : "N/A",
        lowerEnd: fc1m?.lower_10 ? r5(fc1m.lower_10[fc1m.lower_10.length - 1]) : "N/A",
        predBars: fc1m?.pred_len,
        predEndApprox: "~04:33 NY",
      },
    },
    divergence: `${fc5Dir.toUpperCase()} vs ${fc1Dir.toUpperCase()} — 5m says bounce, 1m says reversal`,
    thesis: "Forecast divergence supports the reload thesis: bounce on 5m first, then reversal on 1m. Patient entry.",
    evaluation: {
      "5m": "PENDING — check at ~05:45 NY",
      "1m": "PENDING — check at ~04:33 NY",
    },
  }, null, 2), "utf8");

  await client.close();
  console.log(JSON.stringify({
    status: "done",
    forecasts: { "5m": `${fc5Dir}→${fc5End}`, "1m": `${fc1Dir}→${fc1End}` },
    divergence: `${fc5Dir} vs ${fc1Dir}`,
    track: trackFile,
  }));
})();
