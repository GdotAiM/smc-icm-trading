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

  const setups = [
    {
      pair: "GBPUSD", tv: "GBPUSD", label: "GBPUSD",
      data: { bias: "bearish", price: 1.33239, swH: 1.33267, swL: 1.33222, disp: "STRONG 2.17x", fvg: 0, pools: 2 },
    },
    {
      pair: "NAS100", tv: "US100", label: "NAS100",
      data: { bias: "bullish", price: 28148.3, swH: 28140.9, swL: 28064.3, disp: "weak 0.41x", fvg: 0, pools: 6 },
    },
  ];

  for (const setup of setups) {
    const { pair, tv, label, data } = setup;
    const { bias, price, swH, swL, disp } = data;

    console.error(`\n=== ${label} 5m ===`);

    // Switch
    await run(client, `(function() {
      window.TradingViewApi._activeChartWidgetWV.value().setSymbol("${tv}", {});
      window.TradingViewApi._activeChartWidgetWV.value().setResolution("5");
      return "ok";
    })()`);
    await new Promise(r => setTimeout(r, 3500));

    const timeRes = await client.Runtime.evaluate({
      expression: `(function() {
        var bars = window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().bars();
        var end = bars.lastIndex();
        return JSON.stringify({ t: bars.valueAt(Math.max(bars.firstIndex(), end - 120))[0], tEnd: bars.valueAt(end)[0] });
      })()`,
      returnByValue: true
    });
    const { t, tEnd } = JSON.parse(timeRes.result.value);
    const tFar = tEnd + 3600 * 6;

    // Clear
    await run(client, `(function() {
      try { window.TradingViewApi._activeChartWidgetWV.value().removeAllShapes(); } catch(e) {}
      return "ok";
    })()`);
    await new Promise(r => setTimeout(r, 400));

    // 5m-specific SL/TP
    const buffer = Math.abs(swH - swL) * 0.15;
    let sl, tp1, tp2, entryType;
    if (bias === "bearish") {
      entryType = "SHORT";
      sl = swH + buffer;
      const slDist = sl - price;
      tp1 = price - slDist;
      tp2 = price - slDist * 2;
    } else {
      entryType = "LONG";
      sl = swL - buffer;
      const slDist = price - sl;
      tp1 = price + slDist;
      tp2 = price + slDist * 2;
    }

    const slDist = Math.abs(price - sl);
    const tp1Dist = Math.abs(tp1 - price);
    const pipMult = label === "NAS100" ? 1 : 10000;

    console.error(`  ${entryType} | Entry: ${r5(price)} | SL: ${r5(sl)} | TP1: ${r5(tp1)} | TP2: ${r5(tp2)}`);
    console.error(`  Bias: ${bias} | Disp: ${disp} | SL dist: ${Math.round(slDist * pipMult)} ${label === 'NAS100' ? 'pts' : 'pips'}`);

    // Draw levels
    const levels = [
      { price: sl, label: "🛑 SL", color: "#FF1744", width: 3, style: 0 },
      { price: swH, label: "5m Swing H", color: "#FF9800", width: 1, style: 2 },
      { price: price, label: "▼ ENTRY", color: "#FFD700", width: 3, style: 0 },
      { price: swL, label: "5m Swing L", color: "#FF9800", width: 1, style: 2 },
      { price: tp1, label: "✅ TP1 (1:1)", color: "#00E676", width: 3, style: 0 },
      { price: tp2, label: "✅ TP2 (1:2)", color: "#00C853", width: 2, style: 0 },
    ];
    for (const l of levels) {
      if (!l.price || l.price === 0) continue;
      await run(client, `(function() {
        window.TradingViewApi._activeChartWidgetWV.value().createShape(
          { time: ${t}, price: ${l.price} },
          { shape: "horizontal_line", text: "${l.label}", overrides: { "linecolor": "${l.color}", "linewidth": ${l.width}, "linestyle": ${l.style}, "showLabel": true } }
        );
        return "ok";
      })()`);
    }

    // Risk zone
    await run(client, `(function() {
      window.TradingViewApi._activeChartWidgetWV.value().createMultipointShape(
        [{ time: ${t - 1800}, price: ${sl} }, { time: ${tFar}, price: ${price} }],
        { shape: "rectangle", text: "RISK", overrides: { "backgroundColor": "#FF174420", "borderColor": "#FF174455", "linewidth": 1 } }
      );
      return "ok";
    })()`);

    // Reward zone
    await run(client, `(function() {
      window.TradingViewApi._activeChartWidgetWV.value().createMultipointShape(
        [{ time: ${t - 1800}, price: ${price} }, { time: ${tFar}, price: ${tp1} }],
        { shape: "rectangle", text: "REWARD 1:1", overrides: { "backgroundColor": "#00E67618", "borderColor": "#00E67644", "linewidth": 1 } }
      );
      return "ok";
    })()`);

    // Narrative label at top
    const narrFile = path.join(ROOT, "stages", "00b_council_vote", "output", `${pair.toLowerCase()}_narrative.md`);
    let narr = "";
    try {
      const md = fs.readFileSync(narrFile, "utf8");
      const section = md.split("## Putting It All Together")[1]?.split("---")[0] || "";
      narr = section.replace(/`/g, "'").replace(/\*\*/g, "").replace(/\n/g, " ").slice(0, 350);
    } catch(e) {}

    await run(client, `(function() {
      try {
        window.TradingViewApi._activeChartWidgetWV.value().createShape(
          { time: ${t + 1800} },
          { time: ${t + 5400}, price: ${sl + (swH - sl) * 0.3} },
          { shape: "text", text: "${label} 5m ${entryType} | Bias: ${bias} | Disp: ${disp} | SL: ${Math.round(slDist * pipMult)} ${label === 'NAS100' ? 'pts' : 'pips'} | R:R 1:1/2:1 | ${narr.slice(0, 200)}" }
        );
      } catch(e) {}
      return "ok";
    })()`);
  }

  await client.close();
  console.log(JSON.stringify({status:"done", pairs: setups.map(s => s.label), tf: "5m"}));
})();
