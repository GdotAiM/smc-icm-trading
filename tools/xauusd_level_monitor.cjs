#!/usr/bin/env node
/**
 * XAUUSD Level Monitor — direct CDP price fetch for XAUUSD
 *
 * Monitors key levels on XAUUSD:
 *   4416.44  — BSL magnet
 *   4400-4404 — Bullish Order Block zone
 *
 * Usage: node tools/xauusd_level_monitor.cjs [--quiet]
 */

const CDP = require("./tv-mcp/cdp_client.cjs");
const { fetchRetry } = require("./lib/http_retry.cjs");
const path = require("path");
const fs = require("fs");

const ROOT = "C:/Users/cash/projects/smc-icm-trading";
const DATE = require("./ny_time.cjs").getNYDate();
const LOG_FILE = path.join(ROOT, "shared", DATE, "xauusd_level_monitor.log");
const STATE_FILE = path.join(ROOT, "shared", DATE, "xauusd_level_state.json");

// ─── Key Levels ───────────────────────────────────────────────
const LEVELS = [
  { price: 4416.44, name: "BSL_1", desc: "Immediate BSL magnet (5 touches)", alertType: "approach" },
  { price: 4416.44, name: "BSL_1_HOLD_ABOVE", desc: "Sustained break above = bullish confirmation", alertType: "breakout" },
  { price: 4416.44, name: "BSL_1_REJECT", desc: "Rejection wick below = bearish signal", alertType: "rejection" },
  { price: 4422.20, name: "BSL_2", desc: "Next BSL target (if 1 swept)", alertType: "approach" },
  { price: 4435.00, name: "FVG_EDGE", desc: "Bearish FVG lower edge — weekly high target", alertType: "approach" },
  { price: 4408.42, name: "SSL_1", desc: "Strong SSL (7 touches, swept)", alertType: "approach" },
  { price: 4404.00, name: "OB_TOP", desc: "Bullish OB upper bound", alertType: "approach" },
  { price: 4400.00, name: "OB_BOTTOM", desc: "Bullish OB lower bound — KEY SUPPORT", alertType: "approach" },
  { price: 4400.00, name: "OB_HOLD", desc: "Hold above OB = bullish structure intact", alertType: "support" },
  { price: 4396.41, name: "SSL_2", desc: "Secondary SSL (6 touches, swept)", alertType: "approach" },
  { price: 4385.00, name: "BOS_1H", desc: "1H BOS — bearish structure confirmed if lost", alertType: "invalidation" },
];

let quietMode = process.argv.includes("--quiet");
let state = loadState();
let alerted = new Set(state.alerted || []);
let lastPrice = null;
let barData = { o: 0, h: -Infinity, l: Infinity, c: 0 };
let pollCount = 0;

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { alerted: [], lastCheck: null };
  }
}

function saveState() {
  fs.writeFileSync(STATE_FILE, JSON.stringify({ ...state, alerted: [...alerted] }, null, 2));
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  fs.appendFileSync(LOG_FILE, line + "\n");
  if (!quietMode) console.log(line);
}

function getDistance(price, target) {
  return ((price - target) / target * 100);
}

/**
 * Fetch XAUUSD price directly via CDP — switches chart to XAUUSD first.
 */
async function getPrice() {
  const r = await fetchRetry("http://127.0.0.1:9222/json/list");
  const targets = await r.json();
  const chart = targets.find(t => t.type === "page" && /tradingview\.com\/chart/i.test(t.url || ""));
  if (!chart) throw new Error("No TV chart tab found");

  const client = await CDP({ host: "127.0.0.1", port: 9222, target: chart.id });
  await client.Runtime.enable();

  try {
    // Switch to XAUUSD and wait for full load
    await client.Runtime.evaluate({
      expression: 'window.TradingViewApi._activeChartWidgetWV.value().setSymbol("OANDA:XAUUSD", {})',
      returnByValue: true
    });
    await new Promise(r => setTimeout(r, 3000));

    const v = await client.Runtime.evaluate({
      expression: `(function(){
        try {
          var api = window.TradingViewApi._activeChartWidgetWV.value();
          var bars = api._chartWidget.model().mainSeries().bars();
          var idx = bars.lastIndex();
          var bar = bars.valueAt(idx);
          if (!bar) throw new Error("no bar data");
          return JSON.stringify({
            symbol: api.symbol(),
            currentPrice: bar[4],
            open: bar[1],
            high: bar[2],
            low: bar[3]
          });
        } catch(e) { return JSON.stringify({error: e.message}); }
      })()`,
      returnByValue: true
    });

    return JSON.parse(v.result.value);
  } finally {
    await client.close().catch(() => {});
  }
}

function checkLevels(price) {
  for (const lvl of LEVELS) {
    const distPts = price - lvl.price;
    const distPct = getDistance(price, lvl.price);
    const absDistPts = Math.abs(distPts);

    if (absDistPts < 13 && !alerted.has(`${lvl.name}_approach`)) {
      alerted.add(`${lvl.name}_approach`);
      const dir = distPts > 0 ? "above" : "below";
      log(`⚡ APPROACH: ${lvl.name} @ ${lvl.price} (${distPct >= 0 ? "+" : ""}${distPct.toFixed(2)}%) — price ${dir} by $${absDistPts.toFixed(2)}. ${lvl.desc}`);
    }

    if (lvl.alertType === "breakout" && price > lvl.price && distPts > 2) {
      if (!alerted.has(`${lvl.name}_confirmed`)) {
        alerted.add(`${lvl.name}_confirmed`);
        log(`🚀 BREAKOUT CONFIRMED: Price Sustained ABOVE ${lvl.name} @ ${lvl.price} (+${distPts.toFixed(2)} pts). ${lvl.desc}`);
      }
    }

    if (lvl.alertType === "rejection" && lastPrice !== null && lastPrice > lvl.price && price < lvl.price) {
      if (!alerted.has(`${lvl.name}_reject`)) {
        alerted.add(`${lvl.name}_reject`);
        log(`🔴 REJECTION at ${lvl.name} @ ${lvl.price}: price dropped from ${lastPrice.toFixed(2)} to ${price.toFixed(2)}. ${lvl.desc}`);
      }
    }

    if (lvl.alertType === "support" && price > lvl.price && distPts > 1) {
      if (!alerted.has(`${lvl.name}_hold`)) {
        alerted.add(`${lvl.name}_hold`);
        log(`✅ SUPPORT HOLD: Price holding ABOVE ${lvl.name} @ ${lvl.price} (+${distPts.toFixed(2)} pts). ${lvl.desc}`);
      }
    }

    if (lvl.alertType === "invalidation" && lastPrice !== null && lastPrice > lvl.price && price < lvl.price) {
      if (!alerted.has(`${lvl.name}_broken`)) {
        alerted.add(`${lvl.name}_broken`);
        log(`🚨 INVALIDATION: Price BROKE BELOW ${lvl.name} @ ${lvl.price}. Structure compromised. ${lvl.desc}`);
      }
    }
  }
}

function printStatus(price, levels) {
  if (quietMode) return;
  const now = new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false });
  console.log(`\n${"═".repeat(70)}`);
  console.log(`  XAUUSD LEVEL MONITOR  —  ${now} NY  |  Price: $${price.toFixed(2)}`);
  console.log(`${"─".repeat(70)}`);
  const hdr = "  LEVEL".padEnd(22) + " PRICE".padEnd(9) + " DIST".padEnd(9) + " PCNT".padEnd(8) + " STATUS".padStart(15) + " NOTE";
  console.log(hdr);
  console.log(`${"─".repeat(70)}`);
  for (const l of levels.sort((a, b) => a.absDistPts - b.absDistPts)) {
    const icon = l.absDistPts < 3 ? "🔥CLOSE" : l.absDistPts < 13 ? "⚡NEAR" : "  ○ ";
    const dir = l.distPts >= 0 ? "+" : "";
    console.log(`  ${l.name.padEnd(20)} ${l.price.toFixed(2)} ${dir}${l.distPts.toFixed(2)} ${dir}${l.distPct.toFixed(2)}%  ${icon}  ${l.desc}`);
  }
  console.log(`${"─".repeat(70)}`);
  const rangeHigh = 4435, rangeLow = 4355;
  console.log(`  Range: $${rangeLow} – $${rangeHigh}  |  Current: ${((price - rangeLow) / (rangeHigh - rangeLow) * 100).toFixed(0)}% from low`);
  console.log(`${"═".repeat(70)}\n`);
}

async function run() {
  fs.mkdirSync(path.join(ROOT, "shared", DATE), { recursive: true });
  log("═══════════════════════════════════════════════════════════════");
  log("XAUUSD Level Monitor Started");
  log(`Target: BSL@4416.44 | OB Zone: 4400-4404`);
  log(`Alert thresholds: ±$13 (approach), ±$3 (critical)`);
  log("═══════════════════════════════════════════════════════════════");

  let consecutiveErrors = 0;

  while (true) {
    try {
      const data = await getPrice();
      consecutiveErrors = 0;

      if (data.error) {
        consecutiveErrors++;
        const waitMs = Math.min(5000 * consecutiveErrors, 30000);
        log(`⚠️  Price fetch error ${consecutiveErrors}: ${data.error}`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      if (!data.currentPrice || typeof data.currentPrice !== "number") {
        log(`⚠️  Invalid price data: ${JSON.stringify(data).slice(0, 100)}`);
        await new Promise((r) => setTimeout(r, 15000));
        continue;
      }

      const price = data.currentPrice;
      pollCount++;

      if (lastPrice === null || Math.abs(price - barData.o) > 5) {
        barData = { o: price, h: price, l: price, c: price };
      }
      barData.h = Math.max(barData.h, price);
      barData.l = Math.min(barData.l, price);
      barData.c = price;

      const levels = LEVELS.map((l) => ({
        ...l,
        distPts: price - l.price,
        distPct: getDistance(price, l.price),
        absDistPts: Math.abs(price - l.price),
      }));

      checkLevels(price);
      printStatus(price, levels);
      lastPrice = price;
      state.lastCheck = new Date().toISOString();
      state.lastPrice = price;
      saveState();

      await new Promise((r) => setTimeout(r, 15000));

    } catch (e) {
      log(`⚠️  ${e.message}`);
      await new Promise((r) => setTimeout(r, 10000));
    }
  }
}

run().catch((e) => {
  log(`FATAL: ${e.message}`);
  process.exit(1);
});
