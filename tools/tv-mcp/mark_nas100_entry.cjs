// Mark NAS100 trade entry + SL on 1m chart
const CDP = require("chrome-remote-interface");

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
  const api = "window.TradingViewApi._activeChartWidgetWV.value()";

  // Get fresh time bounds
  const timeRes = await client.Runtime.evaluate({
    expression: `(function() {
      var bars = ${api}._chartWidget.model().mainSeries().bars();
      var end = bars.lastIndex();
      var start = Math.max(bars.firstIndex(), end - 120);
      return JSON.stringify({ t: bars.valueAt(start)[0], tEnd: bars.valueAt(end)[0] });
    })()`,
    returnByValue: true
  });
  const { t, tEnd } = JSON.parse(timeRes.result.value);

  // Don't clear — add entry markers on top of existing analysis

  // ═══ ENTRY LINE ═══
  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd + 1200}, price: 27756 }, { shape: "horizontal_line", text: "🔻 SHORT 27,756 — LIVE", overrides: { "linecolor": "#FF6B35", "linewidth": 4, "linestyle": 0, "showLabel": true, "textColor": "#FF6B35" } });
    return "ok";
  })()`);
  console.log("  ✓ Entry: 27,756");

  // ═══ SL LINE ═══
  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd + 1200}, price: 27820 }, { shape: "horizontal_line", text: "🛑 SL 27,820 (1m Swing High + buffer)", overrides: { "linecolor": "#EF4444", "linewidth": 3, "linestyle": 0, "showLabel": true, "textColor": "#EF4444" } });
    return "ok";
  })()`);
  console.log("  ✓ SL: 27,820");

  // ═══ 1m SWING HIGH ═══
  await run(client, `(function() {
    ${api}.createShape({ time: ${tEnd + 1200}, price: 27814 }, { shape: "horizontal_line", text: "1m Swing High 27,814", overrides: { "linecolor": "#EF4444", "linewidth": 1, "linestyle": 2, "showLabel": true, "textColor": "#EF4444" } });
    return "ok";
  })()`);
  console.log("  ✓ 1m Swing High: 27,814");

  // ═══ TRADE TICKET ═══
  await run(client, `(function() {
    ${api}.createMultipointShape([{ time: ${t + 200}, price: 28050 }, { time: ${t + 1200}, price: 28250 }], {
      shape: "text",
      text: "🔻 LIVE TRADE\\n\\nENTRY: SHORT @ 27,756\\nSL: 27,820 (64 pts)\\nTP1: 27,455 (+301 pts, 4.7:1)\\nTP2: 26,771 (+985 pts, 15.4:1)\\n\\n1D↓ 4H↓ 1H↓ | Forecast ✅ ALIGNED\\nPo3 9/10 | TRENDING\\n\\n⚠️ FOMC 14:00 — tighten SL before"
    });
    return "ok";
  })()`);
  console.log("  ✓ Trade ticket");

  await client.close();
  console.log("\n✅ Entry marked on NAS100 1m");
})();
