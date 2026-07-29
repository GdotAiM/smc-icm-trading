const CDP = require("chrome-remote-interface");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

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

  // Generate forecast first
  console.error("Generating GBPUSD forecast...");
  try {
    execSync(`python "${path.join(__dirname, "..", "forecast.py")}" --input "${process.env.TEMP}\\GBPUSD_4h.json" --pred-len 24 --samples 15 --output "${process.env.TEMP}\\gbpusd_full_fc.json"`, { stdio: "ignore", timeout: 15000 });
  } catch(e) { console.error("  Forecast skipped"); }

  const fc = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(process.env.TEMP || "/tmp", "gbpusd_full_fc.json"), "utf8")); }
    catch { return null; }
  })();

  // Switch to GBPUSD 15m (best micro view)
  console.error("Loading GBPUSD 15m...");
  await run(client, `(function() {
    window.TradingViewApi._activeChartWidgetWV.value().setSymbol("GBPUSD", {});
    window.TradingViewApi._activeChartWidgetWV.value().setResolution("15");
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 4000));

  // Get time range
  const timeRes = await client.Runtime.evaluate({
    expression: `(function() {
      var bars = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().bars();
      var end = bars.lastIndex();
      return JSON.stringify({ t: bars.valueAt(Math.max(bars.firstIndex(), end - 120))[0], tEnd: bars.valueAt(end)[0] });
    })()`,
    returnByValue: true
  });
  const { t, tEnd } = JSON.parse(timeRes.result.value);
  const tFar = tEnd + 86400 * 15;

  // ── Clear ──
  await run(client, `(function() {
    try { window.TradingViewApi._activeChartWidgetWV.value().removeAllShapes(); } catch(e) {}
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 400));

  console.error("Drawing full setup...");

  // ═══════════════════════════════════════════════
  // MACRO LAYER (4H levels — dashed, wider context)
  // ═══════════════════════════════════════════════
  const macroLevels = [
    { price: 1.34076, label: "4H SL", color: "#FF1744", width: 2, style: 2 },
    { price: 1.33934, label: "4H Swing H", color: "#FF9800", width: 1, style: 2 },
    { price: 1.33239, label: "4H ENTRY", color: "#FFD700", width: 2, style: 2 },
    { price: 1.32402, label: "4H TP1 (1:1)", color: "#00E676", width: 2, style: 2 },
    { price: 1.31566, label: "4H TP2 (1:2)", color: "#00C853", width: 2, style: 2 },
  ];
  for (const l of macroLevels) {
    await run(client, `(function() {
      window.TradingViewApi._activeChartWidgetWV.value().createShape(
        { time: ${t}, price: ${l.price} },
        { shape: "horizontal_line", text: "${l.label}", overrides: { "linecolor": "${l.color}", "linewidth": ${l.width}, "linestyle": ${l.style}, "showLabel": true } }
      );
      return "ok";
    })()`);
  }

  // Risk zone rectangle
  await run(client, `(function() {
    window.TradingViewApi._activeChartWidgetWV.value().createMultipointShape(
      [{ time: ${t - 86400*3}, price: 1.34076 }, { time: ${tFar}, price: 1.33239 }],
      { shape: "rectangle", text: "RISK", overrides: { "backgroundColor": "#FF174415", "borderColor": "#FF174433", "linewidth": 1 } }
    );
    return "ok";
  })()`);

  // ═══════════════════════════════════════════════
  // MICRO LAYER (15m/5m/1m — solid, entry precision)
  // ═══════════════════════════════════════════════
  const microLevels = [
    { price: 1.33294, label: "15m Swing H", color: "#FFB74D", width: 1, style: 0 },
    { price: 1.33267, label: "5m Swing H", color: "#EF5350", width: 2, style: 0 },
    { price: 1.33222, label: "5m Swing L", color: "#EF5350", width: 2, style: 0 },
    { price: 1.33216, label: "15m Swing L", color: "#FFB74D", width: 1, style: 0 },
  ];
  for (const l of microLevels) {
    await run(client, `(function() {
      window.TradingViewApi._activeChartWidgetWV.value().createShape(
        { time: ${t + 3600}, price: ${l.price} },
        { shape: "horizontal_line", text: "${l.label}", overrides: { "linecolor": "${l.color}", "linewidth": ${l.width}, "linestyle": ${l.style}, "showLabel": true } }
      );
      return "ok";
    })()`);
  }

  // 5m range zone
  await run(client, `(function() {
    window.TradingViewApi._activeChartWidgetWV.value().createMultipointShape(
      [{ time: ${t - 3600}, price: 1.33267 }, { time: ${t + 7200}, price: 1.33222 }],
      { shape: "rectangle", text: "5m RANGE", overrides: { "backgroundColor": "#FFD70008", "borderColor": "#FFD70033", "linewidth": 1 } }
    );
    return "ok";
  })()`);

  // 1m FVGs (micro inefficiencies)
  await run(client, `(function() {
    var api = window.TradingViewApi._activeChartWidgetWV.value();
    // Upper 1m FVG
    api.createMultipointShape(
      [{ time: ${t - 600}, price: 1.33238 }, { time: ${t + 3600}, price: 1.33234 }],
      { shape: "rectangle", text: "1m FVG", overrides: { "backgroundColor": "#4CAF5015", "borderColor": "#4CAF5055", "linewidth": 1 } }
    );
    // Lower 1m FVG
    api.createMultipointShape(
      [{ time: ${t - 600}, price: 1.33182 }, { time: ${t + 3600}, price: 1.33174 }],
      { shape: "rectangle", text: "1m FVG", overrides: { "backgroundColor": "#4CAF5015", "borderColor": "#4CAF5055", "linewidth": 1 } }
    );
    return "ok";
  })()`);

  // ═══════════════════════════════════════════════
  // FORECAST PATH
  // ═══════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════
  // SESSION + CONTEXT LABEL
  // ═══════════════════════════════════════════════
  await run(client, `(function() {
    try {
      var api = window.TradingViewApi._activeChartWidgetWV.value();
      api.createShape(
        { time: ${t + 7200} },
        { time: ${t + 14400}, price: 1.34320 },
        { shape: "text", text: "GBPUSD SHORT | MMXM 8/8 | Coherence 10/10 | NY AM SB | Liq: DOWN draw" }
      );
    } catch(e) {}
    return "ok";
  })()`);

  // Verify
  const verify = await client.Runtime.evaluate({
    expression: `(function() {
      try { return JSON.stringify({ count: window.TradingViewApi._activeChartWidgetWV.value().getAllShapes().length }); }
      catch(e) { return JSON.stringify({ error: e.message }); }
    })()`,
    returnByValue: true
  });
  console.error(`Shapes: ${JSON.parse(verify.result.value).count}`);

  await client.close();
  console.log(JSON.stringify({
    symbol: "GBPUSD",
    tf: "15m",
    setup: "SHORT",
    macro: { entry: 1.33239, sl: 1.34076, tp1: 1.32402, tp2: 1.31566 },
    micro: { "15m_H": 1.33294, "5m_H": 1.33267, "5m_L": 1.33222, "15m_L": 1.33216 },
    forecast: fc ? fc.direction : "none",
    coherence: "10/10",
    session: "NY AM + Silver Bullet"
  }));
})();
