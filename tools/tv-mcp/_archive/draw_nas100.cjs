const CDP = require("chrome-remote-interface");
const { execSync } = require("child_process");
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

  // NAS100 data from engine:
  // Price: 28148.3 | Bias: bearish | 4H Swing H: 29175.1 | 4H Swing L: 28273.1
  // Council: BEARISH 80%

  const entry = 28148.3;
  const swingH = 29175.1;
  const swingL = 28273.1;
  const buffer = 30;
  const sl = swingH + buffer;           // 29205.1
  const slDist = sl - entry;            // ~1057 pts
  const tp1 = entry - slDist;           // 1:1 = ~27091
  const tp2 = entry - slDist * 2;       // 1:2 = ~26034

  // Forecast
  console.error("Generating forecast...");
  try {
    execSync(`python "${__dirname}\\..\\forecast.py" --input "${process.env.TEMP}\\NAS100_4h.json" --pred-len 24 --samples 15 --output "${process.env.TEMP}\\nas100_fc.json"`, { stdio: "ignore", timeout: 15000 });
  } catch(e) {}

  const fc = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(process.env.TEMP || "/tmp", "nas100_fc.json"), "utf8")); }
    catch { return null; }
  })();

  // Switch to NAS100 4H
  console.error("Loading NAS100 4H...");
  await run(client, `(function() {
    window.TradingViewApi._activeChartWidgetWV.value().setSymbol("US100", {});
    window.TradingViewApi._activeChartWidgetWV.value().setResolution("240");
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 4000));

  const timeRes = await client.Runtime.evaluate({
    expression: `(function() {
      var bars = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().bars();
      var end = bars.lastIndex();
      return JSON.stringify({ t: bars.valueAt(Math.max(bars.firstIndex(), end - 100))[0], tEnd: bars.valueAt(end)[0] });
    })()`,
    returnByValue: true
  });
  const { t, tEnd } = JSON.parse(timeRes.result.value);
  const tFar = tEnd + 86400 * 20;

  // Clear
  await run(client, `(function() {
    try { window.TradingViewApi._activeChartWidgetWV.value().removeAllShapes(); } catch(e) {}
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 400));

  console.error("Drawing NAS100 full setup...");

  // ═════════════════════════════════
  // TRADE LEVELS
  // ═════════════════════════════════
  const tradeLevels = [
    { price: sl, label: "🛑 SL", color: "#FF1744", width: 3, style: 0 },
    { price: swingH, label: "4H Swing H", color: "#FF9800", width: 1, style: 2 },
    { price: entry, label: "▼ ENTRY", color: "#FFD700", width: 3, style: 0 },
    { price: swingL, label: "4H Swing L", color: "#FF9800", width: 1, style: 2 },
    { price: tp1, label: "✅ TP1 (1:1)", color: "#00E676", width: 3, style: 0 },
    { price: tp2, label: "✅ TP2 (1:2)", color: "#00C853", width: 2, style: 0 },
  ];

  for (const l of tradeLevels) {
    await run(client, `(function() {
      window.TradingViewApi._activeChartWidgetWV.value().createShape(
        { time: ${t}, price: ${l.price} },
        { shape: "horizontal_line", text: "${l.label}", overrides: { "linecolor": "${l.color}", "linewidth": ${l.width}, "linestyle": ${l.style}, "showLabel": true } }
      );
      return "ok";
    })()`);
    console.error(`  ${l.label} @ ${l.price}`);
  }

  // Risk zone
  await run(client, `(function() {
    window.TradingViewApi._activeChartWidgetWV.value().createMultipointShape(
      [{ time: ${t - 86400*5}, price: ${sl} }, { time: ${tFar}, price: ${entry} }],
      { shape: "rectangle", text: "RISK ZONE", overrides: { "backgroundColor": "#FF174420", "borderColor": "#FF174455", "linewidth": 1 } }
    );
    return "ok";
  })()`);

  // Reward zone
  await run(client, `(function() {
    window.TradingViewApi._activeChartWidgetWV.value().createMultipointShape(
      [{ time: ${t - 86400*5}, price: ${entry} }, { time: ${tFar}, price: ${tp1} }],
      { shape: "rectangle", text: "REWARD (1:1)", overrides: { "backgroundColor": "#00E67618", "borderColor": "#00E67644", "linewidth": 1 } }
    );
    return "ok";
  })()`);

  // Forecast
  if (fc && fc.median_path) {
    console.error(`  Forecast: ${fc.direction} (${fc.pred_len} bars)`);
    for (let i = 0; i < fc.median_path.length - 1; i++) {
      await run(client, `(function() {
        window.TradingViewApi._activeChartWidgetWV.value().createMultipointShape(
          [{ time: ${fc.future_times[i]}, price: ${fc.median_path[i]} }, { time: ${fc.future_times[i + 1]}, price: ${fc.median_path[i + 1]} }],
          { shape: "trend_line", overrides: { "linecolor": "#448AFF", "linewidth": 2, "linestyle": 2 } }
        );
        return "ok";
      })()`);
    }
    for (const band of [{ data: fc.upper_90, color: "#FF525233" }, { data: fc.lower_10, color: "#69F0AE33" }]) {
      for (let i = 0; i < band.data.length - 1; i++) {
        await run(client, `(function() {
          window.TradingViewApi._activeChartWidgetWV.value().createMultipointShape(
            [{ time: ${fc.future_times[i]}, price: ${band.data[i]} }, { time: ${fc.future_times[i + 1]}, price: ${band.data[i + 1]} }],
            { shape: "trend_line", overrides: { "linecolor": "${band.color}", "linewidth": 1, "linestyle": 2 } }
          );
          return "ok";
        })()`);
      }
    }
  }

  // Council label
  await run(client, `(function() {
    try {
      var api = window.TradingViewApi._activeChartWidgetWV.value();
      api.createShape(
        { time: ${t + 86400*5} },
        { time: ${t + 86400*12}, price: ${swingH + 200} },
        { shape: "text", text: "NAS100 SHORT | Council 80% BEARISH | R:R 1:1/2:1 | SL ${Math.round(slDist)}pts | TP1 ${Math.round(slDist)}pts" }
      );
    } catch(e) {}
    return "ok";
  })()`);

  const verify = await client.Runtime.evaluate({
    expression: `(function() {
      try { return JSON.stringify({ count: window.TradingViewApi._activeChartWidgetWV.value().getAllShapes().length }); }
      catch(e) { return JSON.stringify({ error: e.message }); }
    })()`,
    returnByValue: true
  });
  console.error(`\nShapes: ${JSON.parse(verify.result.value).count}`);
  await client.close();
  console.log(JSON.stringify({
    symbol: "NAS100", tf: "4H",
    entry, sl, tp1, tp2,
    slPips: Math.round(slDist), tp1Pips: Math.round(slDist),
    rr: "1:1 / 2:1", council: "80% BEARISH"
  }));
})();
