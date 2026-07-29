const CDP = require("chrome-remote-interface");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = "C:\\Users\\cash\\smc-icm-trading";

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

  // Get intraday profile data
  let profile = null;
  try {
    const output = execSync(`node "${ROOT}\\tools\\intraday_profile.cjs" GBPUSD`, { stdio: ["ignore","pipe","ignore"], encoding: "utf8", timeout: 10000 });
    profile = JSON.parse(output);
  } catch(e) { console.error("Profile unavailable"); process.exit(1); }

  console.error(`Profile: ${profile.profile} | CBDR: ${profile.cbdr?.range} | Asian: ${profile.asianRange?.range}`);

  // Switch to GBPUSD 4H (shows the daily structure)
  await run(client, `(function() {
    window.TradingViewApi._activeChartWidgetWV.value().setSymbol("GBPUSD", {});
    window.TradingViewApi._activeChartWidgetWV.value().setResolution("60");
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 4000));

  const timeRes = await client.Runtime.evaluate({
    expression: `(function() {
      var bars = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().bars();
      var end = bars.lastIndex();
      return JSON.stringify({ t: bars.valueAt(Math.max(bars.firstIndex(), end - 200))[0], tEnd: bars.valueAt(end)[0] });
    })()`,
    returnByValue: true
  });
  const { t, tEnd } = JSON.parse(timeRes.result.value);
  const tFar = tEnd + 3600 * 12;

  // Clear
  await run(client, `(function() {
    try { window.TradingViewApi._activeChartWidgetWV.value().removeAllShapes(); } catch(e) {}
    return "ok";
  })()`);
  await new Promise(r => setTimeout(r, 500));

  // ═══════════════════════════════════════════
  // CBDR ZONE (14:00-20:00 NY yesterday)
  // ═══════════════════════════════════════════
  if (profile.cbdr) {
    await run(client, `(function() {
      var api = window.TradingViewApi._activeChartWidgetWV.value();
      api.createMultipointShape(
        [{ time: ${t - 3600*8}, price: ${profile.cbdr.high} }, { time: ${tEnd}, price: ${profile.cbdr.low} }],
        { shape: "rectangle", text: "CBDR (${profile.cbdr.rangePips}pips ${profile.cbdr.valid ? '✅' : '❌'})", overrides: { "backgroundColor": "#FF980015", "borderColor": "#FF980055", "linewidth": 1, "showLabel": true } }
      );
      return "ok";
    })()`);
    await run(client, `(function() {
      window.TradingViewApi._activeChartWidgetWV.value().createShape({ time: ${t}, price: ${profile.cbdr.high} }, { shape: "horizontal_line", text: "CBDR High", overrides: { "linecolor": "#FF9800", "linewidth": 2, "linestyle": 0, "showLabel": true } });
      window.TradingViewApi._activeChartWidgetWV.value().createShape({ time: ${t}, price: ${profile.cbdr.low} }, { shape: "horizontal_line", text: "CBDR Low", overrides: { "linecolor": "#FF9800", "linewidth": 2, "linestyle": 0, "showLabel": true } });
      return "ok";
    })()`);
    console.error(`  CBDR: ${profile.cbdr.high} → ${profile.cbdr.low} (${profile.cbdr.rangePips} pips)`);
  }

  // ═══════════════════════════════════════════
  // ASIAN RANGE (20:00-00:00 NY)
  // ═══════════════════════════════════════════
  if (profile.asianRange) {
    await run(client, `(function() {
      var api = window.TradingViewApi._activeChartWidgetWV.value();
      api.createMultipointShape(
        [{ time: ${t - 3600*4}, price: ${profile.asianRange.high} }, { time: ${tEnd}, price: ${profile.asianRange.low} }],
        { shape: "rectangle", text: "ASIAN (${profile.asianRange.rangePips}pips ${profile.asianRange.valid ? '✅' : '⚠️'})", overrides: { "backgroundColor": "#448AFF12", "borderColor": "#448AFF44", "linewidth": 1, "showLabel": true } }
      );
      return "ok";
    })()`);
    await run(client, `(function() {
      window.TradingViewApi._activeChartWidgetWV.value().createShape({ time: ${t}, price: ${profile.asianRange.high} }, { shape: "horizontal_line", text: "Asian H", overrides: { "linecolor": "#448AFF", "linewidth": 1, "linestyle": 2, "showLabel": true } });
      window.TradingViewApi._activeChartWidgetWV.value().createShape({ time: ${t}, price: ${profile.asianRange.low} }, { shape: "horizontal_line", text: "Asian L", overrides: { "linecolor": "#448AFF", "linewidth": 1, "linestyle": 2, "showLabel": true } });
      return "ok";
    })()`);
    console.error(`  Asian: ${profile.asianRange.high} → ${profile.asianRange.low} (${profile.asianRange.rangePips} pips)`);
  }

  // ═══════════════════════════════════════════
  // CONTEXT LABEL
  // ═══════════════════════════════════════════
  const label = `📊 INTRADAY PROFILE: ${profile.profile} | Bias: ${profile.dailyBias.toUpperCase()} | CBDR: ${profile.cbdr?.rangePips || '?'}pips ${profile.cbdr?.valid ? '✅' : '❌'} | Asian: ${profile.asianRange?.rangePips || '?'}pips | Checklist: ${profile.checklist}`;
  await run(client, `(function() {
    try {
      window.TradingViewApi._activeChartWidgetWV.value().createShape(
        { time: ${t + 1800} },
        { time: ${t + 5400}, price: ${profile.cbdr ? parseFloat(profile.cbdr.high) + 0.001 : 1.345} },
        { shape: "text", text: "${label}" }
      );
    } catch(e) {}
    return "ok";
  })()`);

  await client.close();
  console.log(JSON.stringify({ status: "done", profile: profile.profile }));
})();
