const CDP = require("chrome-remote-interface");
const { execSync } = require("child_process");
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

  let profile = null;
  try {
    const out = execSync(`node "${ROOT}\\tools\\intraday_profile.cjs" GBPUSD`, { stdio: ["ignore","pipe","ignore"], encoding: "utf8", timeout: 10000 });
    profile = JSON.parse(out);
  } catch(e) {}

  // Load forecasts for overlay
  const fc5mFile = path.join(process.env.TEMP || "/tmp", "gbpusd_5m_fc.json");
  let fc5m = null;
  if (fs.existsSync(fc5mFile)) fc5m = JSON.parse(fs.readFileSync(fc5mFile, "utf8"));

  const ny = require(path.join(ROOT, "tools", "ny_time.cjs"));
  const nyHour = ny.getNYHour();
  const sbActive = ny.isInSilverBulletNY().active;

  // ═══════════════════════════════════════════
  // 5M CHART
  // ═══════════════════════════════════════════
  console.error("\n=== GBPUSD 5m ===");

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

  const p5 = r5m.price, s5Hi = r5m.structure.lastSwingHigh, s5Lo = r5m.structure.lastSwingLow;

  // 5m Trade Levels
  const buf5 = Math.abs(s5Hi - s5Lo) * 0.15;
  const sl5 = s5Hi + buf5, slDist5 = sl5 - p5, tp1_5 = p5 - slDist5, tp2_5 = p5 - slDist5 * 2;

  const levels5 = [
    { price: sl5, label: "🛑 SL", color: "#FF1744", w: 3, s: 0 },
    { price: s5Hi, label: "5m Sw H", color: "#E65100", w: 2, s: 0 },
    { price: p5, label: "▼ ENTRY (5m BOS)", color: "#FFD700", w: 3, s: 0 },
    { price: s5Lo, label: "5m Sw L", color: "#E65100", w: 2, s: 0 },
    { price: tp1_5, label: "✅ TP1 (1:1)", color: "#00E676", w: 3, s: 0 },
    { price: tp2_5, label: "✅ TP2 (1:2)", color: "#00C853", w: 2, s: 0 },
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

  // CBDR + Asian profile levels
  if (profile?.cbdr) {
    await run(client, `(function() {
      var api = window.TradingViewApi._activeChartWidgetWV.value();
      api.createShape({ time: ${t}, price: ${profile.cbdr.high} }, { shape: "horizontal_line", text: "CBDR H", overrides: { "linecolor": "#FF9800", "linewidth": 1, "linestyle": 2, "showLabel": true } });
      api.createShape({ time: ${t}, price: ${profile.cbdr.low} }, { shape: "horizontal_line", text: "CBDR L", overrides: { "linecolor": "#FF9800", "linewidth": 1, "linestyle": 2, "showLabel": true } });
      return "ok";
    })()`);
    if (profile.asianRange) {
      await run(client, `(function() {
        window.TradingViewApi._activeChartWidgetWV.value().createShape({ time: ${t}, price: ${profile.asianRange.high} }, { shape: "horizontal_line", text: "Asian H", overrides: { "linecolor": "#448AFF", "linewidth": 1, "linestyle": 2, "showLabel": true } });
        window.TradingViewApi._activeChartWidgetWV.value().createShape({ time: ${t}, price: ${profile.asianRange.low} }, { shape: "horizontal_line", text: "Asian L", overrides: { "linecolor": "#448AFF", "linewidth": 1, "linestyle": 2, "showLabel": true } });
        return "ok";
      })()`);
    }
  }

  // Risk/Reward
  await run(client, `(function() {
    var api = window.TradingViewApi._activeChartWidgetWV.value();
    api.createMultipointShape([{ time: ${t - 1800}, price: ${sl5} }, { time: ${tFar}, price: ${p5} }], { shape: "rectangle", text: "RISK", overrides: { "backgroundColor": "#FF174425", "borderColor": "#FF174466" } });
    api.createMultipointShape([{ time: ${t - 1800}, price: ${p5} }, { time: ${tFar}, price: ${tp1_5} }], { shape: "rectangle", text: "REWARD", overrides: { "backgroundColor": "#00E67618", "borderColor": "#00E67644" } });
    return "ok";
  })()`);

  // Forecast overlay
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
  }

  const slPips = Math.round(slDist5 * 10000);
  const label5 = `📊 5M | 5m:BEARISH BOS ✅ | 1m:BEARISH BOS ✅ | TFs ALIGNED | Profile:${profile?.profile} (CBDR:${profile?.cbdr?.rangePips}pips) | ${sbActive ? 'SB ACTIVE' : 'SB CLOSED'} | SL:${slPips}pip | Entry window passed`;
  await run(client, `(function() {
    try {
      window.TradingViewApi._activeChartWidgetWV.value().createShape(
        { time: ${t + 900} }, { time: ${t + 5400}, price: ${s5Hi + (sl5 - s5Hi) * 0.3} },
        { shape: "text", text: "${label5}" }
      );
    } catch(e) {}
    return "ok";
  })()`);

  // ═══════════════════════════════════════════
  // 1M CHART
  // ═══════════════════════════════════════════
  console.error("\n=== GBPUSD 1m ===");

  await run(client, `(function() {
    window.TradingViewApi._activeChartWidgetWV.value().setResolution("1");
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 3000));

  timeRes = await client.Runtime.evaluate({
    expression: `(function() {
      var bars = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().bars();
      return JSON.stringify({ t: bars.valueAt(Math.max(bars.firstIndex(), bars.lastIndex() - 400))[0], tEnd: bars.valueAt(bars.lastIndex())[0] });
    })()`,
    returnByValue: true
  });
  let tInfo = JSON.parse(timeRes.result.value);
  t = tInfo.t; tEnd = tInfo.tEnd; tFar = tEnd + 1800;

  await run(client, `(function() {
    try { window.TradingViewApi._activeChartWidgetWV.value().removeAllShapes(); } catch(e) {}
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 500));

  const p1 = r1m.price, s1Hi = r1m.structure.lastSwingHigh, s1Lo = r1m.structure.lastSwingLow;
  const buf1 = Math.abs(s5Hi - s5Lo) * 0.15;
  const sl1 = s5Hi + buf1, slDist1 = sl1 - p1, tp1_1 = p1 - slDist1;

  const levels1 = [
    { price: sl1, label: "🛑 SL (5m Sw H)", color: "#FF1744", w: 3, s: 0 },
    { price: p1, label: "▼ ENTRY (1m BOS ✅)", color: "#FFD700", w: 3, s: 0 },
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

  // Profile levels on 1m
  if (profile?.cbdr) {
    await run(client, `(function() {
      var api = window.TradingViewApi._activeChartWidgetWV.value();
      api.createShape({ time: ${t}, price: ${profile.cbdr.high} }, { shape: "horizontal_line", text: "CBDR H", overrides: { "linecolor": "#FF9800", "linewidth": 1, "linestyle": 2, "showLabel": true } });
      api.createShape({ time: ${t}, price: ${profile.cbdr.low} }, { shape: "horizontal_line", text: "CBDR L", overrides: { "linecolor": "#FF9800", "linewidth": 1, "linestyle": 2, "showLabel": true } });
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

  const label1 = `📊 1M CONFIRMED ✅ | 1m flipped BEARISH BOS | 5m already BEARISH BOS | TFs ALIGNED | BUT: ${sbActive ? 'SB window closing' : 'SB CLOSED'} | Profile DEGRADED (CBDR 58pips) | Entry window passed`;
  await run(client, `(function() {
    try {
      window.TradingViewApi._activeChartWidgetWV.value().createShape(
        { time: ${t + 300} }, { time: ${t + 1200}, price: ${s5Hi + (sl1 - s5Hi) * 0.3} },
        { shape: "text", text: "${label1}" }
      );
    } catch(e) {}
    return "ok";
  })()`);

  await client.close();
  console.log(JSON.stringify({
    status: "done",
    profile: profile?.profile,
    _5m: `${r5m.structure.bias} ${r5m.structure.lastEvent} @ ${r5(p5)}`,
    _1m: `${r1m.structure.bias} ${r1m.structure.lastEvent} @ ${r5(p1)}`,
    aligned: r5m.structure.bias === r1m.structure.bias,
    sbActive,
  }));
})();
