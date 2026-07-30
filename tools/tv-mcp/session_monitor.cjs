// Dual-Layer Session Monitor — CronCreate + Background Loop
//
// Layer 1: Background bash loop (runs ALWAYS, even during active chat)
//   - Tight monitoring: alerts when price near SL/TP
//   - Writes current state to session_state.json every 60 seconds
//   - Good for: real-time awareness while user is chatting
//
// Layer 2: CronCreate (fires when REPL is idle)
//   - Broader checks: re-scan pairs, evaluate new setups, journal
//   - Fires every 10 minutes, but only when chat is quiet
//   - Good for: periodic deep work when user is away/asleep
//
// Both layers read/write shared state so neither duplicates work.
//
// Usage: node tools/tv-mcp/session_monitor.cjs [--once]

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = "C:/Users/cash/smc-icm-trading";
const DATE = new Date().toISOString().split("T")[0];
const STATE_FILE = path.join(ROOT, "shared", DATE, "session_state.json");
const LOG_FILE = path.join(ROOT, "shared", DATE, "monitor_log.jsonl");
const NODE_PATH = path.join(ROOT, "tools", "tv-mcp", "node_modules");

const ONCE = process.argv.includes("--once");
const INTERVAL_SEC = ONCE ? 0 : 60; // 60 seconds for continuous, instant for --once

function log(entry) {
  const line = { time: new Date().toISOString(), ...entry };
  try { fs.appendFileSync(LOG_FILE, JSON.stringify(line) + "\n"); } catch {}
  const emoji = entry.alert ? "🚨" : "📡";
  console.log("[" + new Date().toLocaleTimeString() + "]", emoji, entry.event || "", entry.detail || "");
}

function run(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "ignore"], env: { ...process.env, NODE_PATH } });
  } catch (e) {
    return null;
  }
}

function checkPositions() {
  const raw = run(`node "${path.join(ROOT, "tools", "tv-mcp", "check_orders.cjs")}"`);
  if (!raw) return [];

  const positions = [];
  const lines = raw.split("\n");
  for (const line of lines) {
    // Parse TV paper trading position rows
    // Format: OANDA:EURUSDShort10,000  1.14467  1.14339  1.14569  1.14377  +9.00USD  0.08%  ...
    // Fields: Broker:Pair  Side  Qty  Entry  TP  SL  Current  PnL  PnL%  TradeValue  MarketValue  Leverage  Margin
    const brokerMatch = line.match(/^(OANDA|CAPITALCOM):(\w+)/);
    if (!brokerMatch) continue;

    const side = line.includes("Short") ? "SELL" : line.includes("Long") ? "BUY" : null;
    if (!side) continue;

    // Extract all decimal numbers (prices, P&L)
    const decimals = line.match(/([\d]+[.,\d]*)/g);
    if (!decimals || decimals.length < 8) continue;

    // Clean up: remove commas from numbers like "10,000" -> "10000"
    const clean = decimals.map(d => d.replace(/,/g, ""));

    // Find the index where quantity ends and prices begin
    // Quantity is usually first number after side (e.g. "10000")
    // Then: entry, tp, sl, current, pnl
    // We look for numbers with decimal points to find prices
    const priceNumbers = [];
    for (let i = 0; i < clean.length; i++) {
      const n = parseFloat(clean[i]);
      // Prices have decimal points and are reasonable values (> 1 for forex, > 100 for indices/gold)
      if (clean[i].includes(".") && n > 1) {
        priceNumbers.push(n);
      }
    }

    if (priceNumbers.length < 4) continue;

    // The price sequence is: entry, tp, sl, current
    const entry = priceNumbers[0];
    const tp = priceNumbers[1];
    const sl = priceNumbers[2];
    const current = priceNumbers[3];

    // Find P&L: number starting with + or -
    const pnlMatch = line.match(/([+\-][\d.]+)USD/);
    const pnl = pnlMatch ? pnlMatch[1] : "?";

    // Find quantity
    const qtyMatch = line.match(/(\d{1,3}(?:,\d{3})*)\s+\d+\.\d+/);
    const qty = qtyMatch ? qtyMatch[1] : clean[0];

    positions.push({
      broker: brokerMatch[1],
      pair: brokerMatch[2],
      direction: side,
      qty: qty,
      entry: entry,
      tp: tp,
      sl: sl,
      current: current,
      pnl: pnl
    });
  }
  return positions;
}

function checkAlerts(positions) {
  const alerts = [];
  for (const p of positions) {
    const distToTp = Math.abs(p.current - p.tp);
    const distToSl = Math.abs(p.current - p.sl);
    const totalDist = Math.abs(p.tp - p.sl);
    const tpPct = (distToTp / totalDist) * 100;
    const slPct = (distToSl / totalDist) * 100;

    if (tpPct < 15) alerts.push({ type: "TP_CLOSE", pair: p.pair, detail: `${distToTp.toFixed(2)} from TP (${tpPct.toFixed(0)}%)` });
    if (slPct < 25) alerts.push({ type: "SL_WARNING", pair: p.pair, detail: `${distToSl.toFixed(2)} from SL (${slPct.toFixed(0)}%)` });
    if (tpPct < 5) alerts.push({ type: "TP_IMMINENT", pair: p.pair, detail: `ALMOST AT TARGET — ${distToTp.toFixed(2)} away!` });
  }
  return alerts;
}

function writeState(positions, alerts, lastScan) {
  const state = {
    updated: new Date().toISOString(),
    positions: positions.map(p => ({ pair: p.pair, dir: p.direction, entry: p.entry, current: p.current, sl: p.sl, tp: p.tp, pnl: p.pnl })),
    alerts: alerts,
    lastScan: lastScan,
    positionCount: positions.length,
    maxPositions: 2
  };
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); } catch {}
  return state;
}

// ═══ MAIN ═══
async function tick() {
  const now = new Date();
  const nyHour = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" })).getHours();

  // Only run during trading hours (02:00-05:00 NY)
  if (nyHour < 2 || nyHour >= 5) {
    if (!ONCE) return; // Silent skip outside hours
  }

  const positions = checkPositions();
  const alerts = checkAlerts(positions);
  const state = writeState(positions, alerts, null);

  if (alerts.length > 0) {
    for (const a of alerts) {
      log({ event: a.type, detail: a.pair + " — " + a.detail, alert: true });
    }
  } else if (positions.length > 0) {
    log({ event: "MONITOR", detail: positions.length + " position(s), no alerts. " + positions.map(p => p.pair + " P&L:" + p.pnl).join(", ") });
  } else {
    log({ event: "MONITOR", detail: "No open positions" });
  }

  return state;
}

(async () => {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });

  if (ONCE) {
    const state = await tick();
    console.log(JSON.stringify(state, null, 2));
    return;
  }

  // Continuous loop
  console.log("=== DUAL-LAYER MONITOR STARTED ===");
  console.log("Layer 1 (background): 60s tight monitoring + alerts");
  console.log("Layer 2 (cron): 10min deep scans + journaling (when idle)");
  console.log("State file: " + STATE_FILE);
  console.log("");

  while (true) {
    await tick();
    await new Promise(r => setTimeout(r, INTERVAL_SEC * 1000));
  }
})();
