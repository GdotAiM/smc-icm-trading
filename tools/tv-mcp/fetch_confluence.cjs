const CDP = require("chrome-remote-interface");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const TMP = process.env.TEMP || "/tmp";
const ENGINE = "C:\\Users\\cash\\smc-icm-trading\\tools\\smc-engine";
const DATE = require("../ny_time.cjs").getNYDate();
const ROOT = "C:\\Users\\cash\\smc-icm-trading";
const SHARED = path.join(ROOT, "shared", DATE);

const PAIRS = [
  { symbol: "NAS100", tvSymbol: "US100", label: "NAS100" },
  { symbol: "XAUUSD", tvSymbol: "XAUUSD", label: "GOLD" },
  { symbol: "GBPUSD", tvSymbol: "GBPUSD", label: "GBPUSD" },
  { symbol: "DXY", tvSymbol: "USDOLLAR", label: "DXY" },
];

const TFS = [
  { label: "1W", resolution: "1W", wait: 3000 },
  { label: "1D", resolution: "1D", wait: 2500 },
  { label: "4H", resolution: "240", wait: 2500 },
  { label: "1H", resolution: "60", wait: 2000 },
  { label: "15m", resolution: "15", wait: 2000 },
  { label: "5m", resolution: "5", wait: 2000 },
  { label: "1m", resolution: "1", wait: 1500 },
];

async function evalExpr(client, expr) {
  const r = await client.Runtime.evaluate({ expression: expr, returnByValue: true });
  try { return JSON.parse(r.result.value); } catch { return r.result.value; }
}

(async () => {
  const resp = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await resp.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!chart) { console.log(JSON.stringify({error:"No chart"})); process.exit(1); }

  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();

  const allResults = {};

  for (const pair of PAIRS) {
    console.error(`\n=== ${pair.label} (${pair.tvSymbol}) ===`);
    allResults[pair.label] = {};

    // Set symbol
    await evalExpr(client, `(function() {
      window.TradingViewApi._activeChartWidgetWV.value().setSymbol("${pair.tvSymbol}", {});
      return "ok";
    })()`);
    await new Promise(r => setTimeout(r, 3000));

    for (const tf of TFS) {
      console.error(`  ${tf.label}...`);
      await evalExpr(client, `(function() {
        window.TradingViewApi._activeChartWidgetWV.value().setResolution("${tf.resolution}");
        return "ok";
      })()`);
      await new Promise(r => setTimeout(r, tf.wait));

      const data = await evalExpr(client, `(function() {
        try {
          var api = window.TradingViewApi._activeChartWidgetWV.value();
          var bars = api._chartWidget.model().mainSeries().bars();
          if (!bars || typeof bars.lastIndex !== 'function') return JSON.stringify({ error: "no bars" });
          var end = bars.lastIndex();
          var start = Math.max(bars.firstIndex(), end - 400 + 1);
          var candles = [];
          for (var i = start; i <= end; i++) {
            var v = bars.valueAt(i);
            if (v && v.length >= 6) candles.push({ time: v[0]*1000, open: v[1], high: v[2], low: v[3], close: v[4], volume: v[5]||0 });
          }
          return JSON.stringify({ tf: "${tf.label}", count: candles.length, candles: candles });
        } catch(e) { return JSON.stringify({ error: e.message }); }
      })()`);

      // Save data file (strip BOM)
      const dataFile = path.join(TMP, `${pair.label}_${tf.label.toLowerCase()}.json`);
      fs.writeFileSync(dataFile, JSON.stringify(data.candles), "utf8");

      // Run engine
      const engineOut = path.join(SHARED, pair.label, `engine_${tf.label.toLowerCase()}.json`);
      fs.mkdirSync(path.dirname(engineOut), { recursive: true });
      try {
        const cmd = `npx tsx "${ENGINE}\\src\\cli.ts" --pair ${pair.symbol} --tf ${tf.label.toLowerCase()} --input "${dataFile}" --output "${engineOut}"`;
        execSync(cmd, { stdio: ["ignore", "pipe", "ignore"], encoding: "utf8", timeout: 15000 });
        const report = JSON.parse(fs.readFileSync(engineOut, "utf8"));
        allResults[pair.label][tf.label] = {
          bias: report.structure.bias,
          confidence: report.structure.confidence,
          event: report.structure.lastEvent,
          eventPrice: report.structure.lastEventPrice,
          pools: report.liquidity.length,
          obs: report.orderBlocks.length,
          fvgs: report.fvgs.length,
          displacement: report.volumeDisplacement.label,
          dispRatio: report.volumeDisplacement.atrRatio,
        };
        console.error(`    ${tf.label}: ${report.structure.bias} (${report.structure.lastEvent}) | ${report.liquidity.length}p ${report.orderBlocks.length}ob ${report.fvgs.length}fvg`);
      } catch (e) {
        console.error(`    ${tf.label}: ENGINE ERROR — ${e.message.slice(0, 60)}`);
        allResults[pair.label][tf.label] = { bias: "ERROR", confidence: 0 };
      }
    }
  }

  console.log(JSON.stringify(allResults));
  await client.close();
})();
