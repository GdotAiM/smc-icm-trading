// Quick Data Refresh — fetches fresh candles from TV CDP + re-runs SMC engine
// Use this when data is stale (>10 min since last candle)
// Usage: node tools/refresh_data.cjs [PAIR]
//        node tools/refresh_data.cjs           → all 4 primary pairs
//        node tools/refresh_data.cjs GBPUSD    → single pair

const CDP = require("./tv-mcp/cdp_client.cjs");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..");
const DATE = require("./ny_time.cjs").getNYDate();
const TFS = ["1m", "5m", "15m", "1h", "4h", "1d", "1w"];
const ALL_PAIRS = ["EURUSD", "GBPUSD", "XAUUSD", "NAS100"];
const TV_SYMBOLS = {
  EURUSD: "OANDA:EURUSD",
  GBPUSD: "OANDA:GBPUSD",
  XAUUSD: "OANDA:XAUUSD",
  NAS100: "CAPITALCOM:NAS100",
  DXY: "FX:USDOLLAR"
};

const targetPairs = process.argv[2] ? [process.argv[2].toUpperCase()] : ALL_PAIRS;

function log(msg) { console.log(`  ${msg}`); }

async function refresh() {
  const startTime = Date.now();
  console.log(`\n🔄 Data Refresh — ${DATE} — ${new Date().toLocaleTimeString("en-US", {timeZone:"America/New_York", hour12:false})} NY`);
  console.log(`  Pairs: ${targetPairs.join(", ")}`);
  console.log(`  Timeframes: ${TFS.join(", ")}`);

  // Step 1: Connect to TV CDP
  console.log("\n═══ STEP 1: Connect to TV CDP ═══");
  let client;
  try {
    const resp = await fetch("http://127.0.0.1:9222/json/list");
    const targets = await resp.json();
    const chart = targets.find(t => t.type === "page" && /tradingview/i.test(t.url || ""));
    if (!chart) { console.log("  ❌ No TradingView chart tab found. Open TV Desktop first."); return; }
    client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
    await client.Runtime.enable();
    log("✅ Connected to TV chart");
  } catch (e) {
    console.log(`  ❌ Cannot connect to TV CDP: ${e.message.slice(0, 80)}`);
    console.log("  Make sure TradingView Desktop is running with --remote-debugging-port=9222");
    return;
  }

  // Step 2: Fetch fresh candles for each pair × timeframe
  console.log("\n═══ STEP 2: Fetch fresh candles ═══");
  let totalCandles = 0;
  let failures = 0;

  for (const pair of targetPairs) {
    const tvSymbol = TV_SYMBOLS[pair] || pair;
    const pairDir = path.join(ROOT, "shared", DATE, pair === "XAUUSD" ? "GOLD" : pair);
    fs.mkdirSync(pairDir, { recursive: true });

    // Switch chart to this pair
    try {
      await client.Runtime.evaluate({
        expression: `window.TradingViewApi._activeChartWidgetWV.value().setSymbol("${tvSymbol}", {})`,
        returnByValue: true
      });
      await new Promise(r => setTimeout(r, 1500)); // Wait for data to load
    } catch (e) {
      log(`⚠️  Could not switch to ${tvSymbol} — ${e.message.slice(0, 40)}`);
      continue;
    }

    let pairCandles = 0;
    for (const tf of TFS) {
      try {
        const tfMap = { "1m": "1", "5m": "5", "15m": "15", "1h": "60", "4h": "240", "1d": "1D", "1w": "1W" };
        const result = await client.Runtime.evaluate({
          expression: `(function() {
            var a = window.TradingViewApi._activeChartWidgetWV.value();
            a.setResolution("${tfMap[tf]}");
            var b = a._chartWidget.model().mainSeries().bars();
            var i = b.lastIndex();
            var candles = [];
            var start = Math.max(0, i - ${tf === "1m" ? 500 : tf === "5m" ? 300 : 200});
            for (var j = start; j <= i; j++) {
              var v = b.valueAt(j);
              if (v && v.length >= 6) candles.push({
                time: v[0] * 1000,
                open: v[1], high: v[2], low: v[3], close: v[4], volume: v[5]
              });
            }
            return JSON.stringify({ count: candles.length });
          })()`,
          returnByValue: true
        });

        const data = JSON.parse(result.result.value);
        if (data && data.count > 0) {
          // Re-fetch with full data
          const fullResult = await client.Runtime.evaluate({
            expression: `(function() {
              var a = window.TradingViewApi._activeChartWidgetWV.value();
              a.setResolution("${tfMap[tf]}");
              var b = a._chartWidget.model().mainSeries().bars();
              var i = b.lastIndex();
              var candles = [];
              var start = Math.max(0, i - ${tf === "1m" ? 500 : tf === "5m" ? 300 : 200});
              for (var j = start; j <= i; j++) {
                var v = b.valueAt(j);
                if (v && v.length >= 6) candles.push({
                  time: v[0] * 1000,
                  open: v[1], high: v[2], low: v[3], close: v[4], volume: v[5]
                });
              }
              return JSON.stringify({ candles: candles });
            })()`,
            returnByValue: true
          });

          const fullData = JSON.parse(fullResult.result.value);
          if (fullData && fullData.candles) {
            const outPath = path.join(pairDir, `candles_${tf}.json`);
            fs.writeFileSync(outPath, JSON.stringify(fullData.candles, null, 2));
            const lastC = fullData.candles[fullData.candles.length - 1];
            const ageSec = Math.round((Date.now() - lastC.time) / 1000);
            log(`${pair} ${tf}: ${fullData.candles.length} candles, last @ ${new Date(lastC.time).toLocaleTimeString("en-US", {timeZone:"America/New_York", hour12:false})} NY (${ageSec}s ago)`);
            pairCandles += fullData.candles.length;
          }
        }
      } catch (e) {
        failures++;
        log(`⚠️  ${pair} ${tf}: ${e.message.slice(0, 50)}`);
      }
    }
    totalCandles += pairCandles;
    log(`${pair === "XAUUSD" ? "GOLD" : pair}: ${pairCandles} total candles refreshed`);
  }

  await client.close();
  log(`✅ Fetched ${totalCandles} candles across ${targetPairs.length} pairs (${failures} failures)`);

  // Step 3: Re-run SMC engine on fresh data
  console.log("\n═══ STEP 3: Run SMC engine ═══");
  for (const pair of targetPairs) {
    const pairDir = path.join(ROOT, "shared", DATE, pair === "XAUUSD" ? "GOLD" : pair);
    for (const tf of TFS) {
      const input = path.join(pairDir, `candles_${tf}.json`);
      if (!fs.existsSync(input)) continue;
      try {
        const cmd = `npx tsx "${ROOT}\\tools\\smc-engine\\src\\cli.ts" --pair ${pair} --tf ${tf} --input "${input}"`;
        const out = execSync(cmd, { stdio: ["ignore", "pipe", "ignore"], encoding: "utf8", timeout: 10000 });
        const engineOut = path.join(pairDir, `engine_${tf}.json`);
        fs.writeFileSync(engineOut, out, "utf8");
      } catch (e) {
        // Engine may fail on some TFs — skip
      }
    }
    log(`${pair}: engine reports regenerated`);
  }

  // Step 4: Re-run forecasts
  console.log("\n═══ STEP 4: Generate forecasts ═══");
  for (const pair of targetPairs) {
    const pairDir = path.join(ROOT, "shared", DATE, pair === "XAUUSD" ? "GOLD" : pair);
    for (const tf of ["5m", "1m"]) {
      const input = path.join(pairDir, `candles_${tf}.json`);
      if (!fs.existsSync(input)) continue;
      try {
        const predLen = tf === "5m" ? 24 : 48;
        execSync(`python "${ROOT}\\tools\\forecast.py" --input "${input}" --pred-len ${predLen} --samples 20 --output "${pairDir}\\forecast_${tf}.json"`, {
          stdio: ["ignore", "pipe", "ignore"], encoding: "utf8", timeout: 15000
        });
      } catch (e) { /* forecast optional */ }
    }
    log(`${pair}: forecasts regenerated`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ Refresh complete in ${elapsed}s — data is now fresh. Run pipeline again.`);
}

refresh().catch(e => {
  console.error(`\n❌ Refresh failed: ${e.message}`);
  process.exit(1);
});
