#!/usr/bin/env node
/**
 * SMC Session Startup — One command to rule them all.
 *
 * Usage: node tools/session_start.cjs
 *
 * 1. Checks TV Desktop CDP is reachable (launches if needed)
 * 2. Fetches all candles from TradingView for all primary pairs × all TFs
 * 3. Runs SMC engine on every pair × TF (including 1m)
 * 4. Generates forecasts
 * 5. Reports ready state — then you run analysis
 *
 * Time: ~3-4 minutes for full 5-pair sweep
 */

const { execSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = "C:\\Users\\cash\\smc-icm-trading";
const DATE = new Date().toISOString().split("T")[0];
const PAIRS = ["EURUSD", "GBPUSD", "XAUUSD", "NAS100", "DXY"];
// Use full broker prefixes for reliable TV symbol resolution
const TV_SYMBOLS = {
  EURUSD: "OANDA:EURUSD",
  GBPUSD: "OANDA:GBPUSD",
  XAUUSD: "OANDA:XAUUSD",
  NAS100: "CAPITALCOM:NAS100",
  DXY: "FX:USDOLLAR"
};
const TFS = ["1w", "1d", "4h", "1h", "15m", "5m", "1m"];
const TV_TF_MAP = { "1d": "1D", "4h": "240", "1h": "60", "15m": "15", "5m": "5", "1m": "1" };
const TV_WAIT = { "1d": 3000, "4h": 2500, "1h": 2000, "15m": 2000, "5m": 2000, "1m": 1500 };

function log(msg) { console.error(`[${new Date().toLocaleTimeString()}] ${msg}`); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ═══════════════════════════════════════════════════
// STEP 0: Ensure directories
// ═══════════════════════════════════════════════════
log("═══ STEP 0: Directories ═══");
for (const pair of PAIRS) {
  fs.mkdirSync(path.join(ROOT, "shared", DATE, pair), { recursive: true });
}
log(`  Created shared/${DATE}/PAIR directories`);

// ═══════════════════════════════════════════════════
// STEP 1: Check/Launch TV Desktop CDP
// ═══════════════════════════════════════════════════
log("═══ STEP 1: TV Desktop CDP ═══");

async function checkTV() {
  try {
    const resp = await fetch("http://127.0.0.1:9222/json/version");
    const data = await resp.json();
    log(`  ✅ TV CDP running — ${data.Browser}`);
    return true;
  } catch {
    return false;
  }
}

async function launchTV() {
  log("  Launching TV Desktop with CDP...");
  try {
    execSync(
      `powershell -Command "Start-Process 'shell:AppsFolder\\TradingView.Desktop_n534cwy3pjxzj!TradingView.Desktop' -ArgumentList '--remote-debugging-port=9222'"`,
      { timeout: 10000 }
    );
  } catch {}
  // Wait for it to come up
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    if (await checkTV()) return true;
  }
  return false;
}

async function ensureTV() {
  if (await checkTV()) return true;
  log("  ❌ TV CDP not reachable — launching...");
  // Kill any existing TV instances first (they won't have debug flag)
  try { execSync("powershell -Command \"Get-Process -Name 'TradingView' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue\"", { timeout: 5000 }); } catch {}
  await sleep(2000);
  const launched = await launchTV();
  if (!launched) {
    console.error("FATAL: Could not connect to TV Desktop CDP");
    process.exit(1);
  }
  return true;
}

// ═══════════════════════════════════════════════════
// STEP 1b: Check for chart tab
// ═══════════════════════════════════════════════════
async function ensureChartTab() {
  const resp = await fetch("http://127.0.0.1:9222/json/list");
  const targets = await resp.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (chart) {
    log(`  ✅ Chart tab: ${chart.title.slice(0, 60)}`);
    return chart.id;
  }
  log("  ⚠️  No chart tab — please open a TradingView chart tab first");
  console.error("FATAL: Open a TradingView chart and re-run");
  process.exit(1);
}

// ═══════════════════════════════════════════════════
// STEP 2: Fetch all data from TV
// ═══════════════════════════════════════════════════
log("═══ STEP 2: Fetch candles from TradingView ═══");

async function fetchFromTV() {
  const CDP = require("./tv-mcp/cdp_client.cjs");
  const targetId = await ensureChartTab();
  const client = await CDP({ host: "127.0.0.1", port: 9222, target: targetId });
  await client.Runtime.enable();

  async function evalExpr(expr) {
    const r = await client.Runtime.evaluate({ expression: expr, returnByValue: true });
    try { return JSON.parse(r.result.value); } catch { return r.result.value; }
  }

  for (const pair of PAIRS) {
    const tvSymbol = TV_SYMBOLS[pair] || pair;
    log(`  ${pair} (TV: ${tvSymbol})`);

    // Switch symbol with verification
    await evalExpr(`(function() {
      window.TradingViewApi._activeChartWidgetWV.value().setSymbol("${tvSymbol}", {});
      return "ok";
    })()`);
    await sleep(5000); // Increased from 3500ms for reliability

    // Verify symbol actually switched before fetching data
    const actualSymbol = await evalExpr(`(function() {
      try {
        return window.TradingViewApi._activeChartWidgetWV.value().symbol();
      } catch(e) { return "ERROR: " + e.message; }
    })()`);
    if (actualSymbol !== tvSymbol) {
      log(`  ⚠️ Symbol mismatch: requested ${tvSymbol}, got ${actualSymbol} — retrying...`);
      await evalExpr(`(function() {
        window.TradingViewApi._activeChartWidgetWV.value().setSymbol("${tvSymbol}", {});
        return "ok";
      })()`);
      await sleep(4000);
      const retrySymbol = await evalExpr(`(function() {
        try { return window.TradingViewApi._activeChartWidgetWV.value().symbol(); }
        catch(e) { return "ERROR"; }
      })()`);
      if (retrySymbol !== tvSymbol) {
        log(`  ❌ Retry failed: still showing ${retrySymbol} instead of ${tvSymbol}`);
      } else {
        log(`  ✅ Retry OK: ${retrySymbol}`);
      }
    }

    for (const tf of TFS) {
      const resolution = TV_TF_MAP[tf];
      await evalExpr(`(function() {
        window.TradingViewApi._activeChartWidgetWV.value().setResolution("${resolution}");
        return "ok";
      })()`);
      await sleep(TV_WAIT[tf]);

      const data = await evalExpr(`(function() {
        try {
          var api = window.TradingViewApi._activeChartWidgetWV.value();
          var bars = api._chartWidget.model().mainSeries().bars();
          var end = bars.lastIndex();
          var start = Math.max(bars.firstIndex(), end - 400 + 1);
          var candles = [];
          for (var i = start; i <= end; i++) {
            var v = bars.valueAt(i);
            if (v && v.length >= 6) candles.push({
              time: v[0]*1000, open: v[1], high: v[2], low: v[3], close: v[4], volume: v[5]||0
            });
          }
          return JSON.stringify({ count: candles.length, candles: candles });
        } catch(e) { return JSON.stringify({ error: e.message }); }
      })()`);

      const outPath = path.join(ROOT, "shared", DATE, pair, `candles_${tf}.json`);
      fs.writeFileSync(outPath, JSON.stringify(data.candles || [], null, 2));
      process.stderr.write(`    ${tf}: ${data.count || 0}c `);
    }
    process.stderr.write("\n");
  }

  await client.close();
}

// ═══════════════════════════════════════════════════
// STEP 3: Run SMC engine on all pair×TF combos
// ═══════════════════════════════════════════════════
log("═══ STEP 3: Run SMC Engine ═══");

function runEngines() {
  let success = 0, failed = 0;
  const failures = [];
  for (const pair of PAIRS) {
    for (const tf of TFS) {
      const input = path.join(ROOT, "shared", DATE, pair, `candles_${tf}.json`);
      const output = path.join(ROOT, "shared", DATE, pair, `engine_${tf}.json`);
      if (!fs.existsSync(input)) {
        log(`  SKIP ${pair} ${tf} — no candles`);
        continue;
      }
      try {
        execSync(
          `npx tsx "${ROOT}/tools/smc-engine/src/cli.ts" --pair ${pair} --tf ${tf} --input "${input}" --output "${output}" --mode full`,
          { stdio: ["ignore", "pipe", "pipe"], timeout: 30000 }
        );
        process.stderr.write(`${pair}:${tf} `);
        success++;
      } catch (e) {
        process.stderr.write(`${pair}:${tf}❌ `);
        failed++;
        failures.push({ pair, tf, error: e.stderr?.toString()?.substring(0, 200) || e.message });
      }
    }
    process.stderr.write("\n");
  }
  log(`  Engine results: ${success} OK, ${failed} FAILED`);
  if (failed > 0) {
    failures.forEach(f => log(`  ❌ ${f.pair}/${f.tf}: ${f.error}`));
  }
  return { success, failed };
}

// ═══════════════════════════════════════════════════
// STEP 3b: Carry forward prior day NY lunch inefficiencies
// ═══════════════════════════════════════════════════
log("═══ STEP 3b: NY Lunch Reversal Carry-Forward ═══");

function runLunchCarry() {
  try {
    const result = execSync(
      `node "${ROOT}/tools/prev_day_lunch_carry.cjs" --all`,
      { stdio: ["ignore", "pipe", "pipe"], timeout: 30000, encoding: "utf8" }
    );
    const found = (result.match(/✅ SETUP FOUND/g) || []).length;
    const notFound = (result.match(/❌ No NY lunch/g) || []).length;
    log(`  Lunch carry: ${found} setup(s) found, ${notFound} none — saved to shared/${DATE}/PAIR/prev_lunch_inefficiency.json`);
  } catch (e) {
    log(`  ⚠️  Lunch carry failed: ${e.message?.slice(0, 120) || e}`);
  }
}

// ═══════════════════════════════════════════════════
// STEP 4: Generate forecasts
// ═══════════════════════════════════════════════════
log("═══ STEP 4: Generate Forecasts ═══");

function runForecasts() {
  let success = 0, failed = 0;
  const failures = [];
  for (const pair of PAIRS.slice(0, 4)) { // skip DXY for forecasts
    for (const tf of ["5m", "1m"]) {
      const input = path.join(ROOT, "shared", DATE, pair, `candles_${tf}.json`);
      const output = path.join(ROOT, "shared", DATE, pair, `forecast_${tf}.json`);
      if (!fs.existsSync(input)) continue;
      try {
        const predLen = tf === "5m" ? 24 : 48;
        execSync(
          `python "${ROOT}/tools/forecast.py" --input "${input}" --pred-len ${predLen} --samples 20 --output "${output}"`,
          { stdio: ["ignore", "pipe", "pipe"], timeout: 15000 }
        );
        process.stderr.write(`${pair}:${tf} `);
        success++;
      } catch (e) {
        process.stderr.write(`${pair}:${tf}❌ `);
        failed++;
        failures.push({ pair, tf, error: e.stderr?.toString()?.substring(0, 200) || e.message });
      }
    }
  }
  process.stderr.write("\n");
  log(`  Forecast results: ${success} OK, ${failed} FAILED`);
  if (failed > 0) {
    failures.forEach(f => log(`  ❌ ${f.pair}/${f.tf}: ${f.error}`));
  }
  return { success, failed };
}

// ═══════════════════════════════════════════════════
// STEP 4b: Sync XAUUSD → GOLD (pipeline reads from GOLD/)
// ═══════════════════════════════════════════════════
function syncGoldDir() {
  const xauDir = path.join(ROOT, "shared", DATE, "XAUUSD");
  const goldDir = path.join(ROOT, "shared", DATE, "GOLD");
  if (!fs.existsSync(xauDir)) return;
  fs.mkdirSync(goldDir, { recursive: true });
  let count = 0;
  const files = fs.readdirSync(xauDir).filter(f => f.startsWith("candles_") || f.startsWith("engine_") || f.startsWith("forecast_"));
  for (const f of files) {
    fs.copyFileSync(path.join(xauDir, f), path.join(goldDir, f));
    count++;
  }
  if (count > 0) log(`  🔄 Synced ${count} files from XAUUSD → GOLD`);
}

// ═══════════════════════════════════════════════════
// STEP 5: Summary
// ═══════════════════════════════════════════════════
function printSummary(engineResult, forecastResult) {
  const engOk = engineResult?.success || 0;
  const engFail = engineResult?.failed || 0;
  const fcstOk = forecastResult?.success || 0;
  const fcstFail = forecastResult?.failed || 0;

  log("═══ STEP 5: Ready State ═══");

  if (engFail === 0 && fcstFail === 0) {
    console.log(`\n✅ Session Startup Complete — ${DATE}`);
  } else if (engFail > 0 || fcstFail > 0) {
    console.log(`\n⚠️  Session Startup — ${DATE} — WITH FAILURES`);
    console.log(`   Engines: ${engOk} OK, ${engFail} FAILED`);
    console.log(`   Forecasts: ${fcstOk} OK, ${fcstFail} FAILED`);
    if (engFail + fcstFail > 5) {
      console.log(`   ⚠️  ${engFail + fcstFail} total failures — data may be incomplete`);
    }
  } else {
    console.log(`\n❌ Session Startup — ${DATE} — ALL STEPS FAILED`);
  }

  console.log(`   Pairs: ${PAIRS.join(", ")}`);
  console.log(`   Timeframes: ${TFS.join(", ")}`);
  console.log(`   Engine reports: shared/${DATE}/PAIR/engine_*.json`);
  console.log(`   Forecasts: shared/${DATE}/PAIR/forecast_*.json`);
  console.log(`\nNext: "Run full analysis on all pairs"`);
}

// ═══════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════
(async () => {
  const startTime = Date.now();

  await ensureTV();
  await fetchFromTV();
  const engineResult = runEngines();
  runLunchCarry();
  const forecastResult = runForecasts();
  syncGoldDir();
  printSummary(engineResult, forecastResult);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log(`Total startup time: ${elapsed}s`);
})();
