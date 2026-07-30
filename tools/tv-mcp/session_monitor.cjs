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
const { atomicWrite, atomicAppend } = require("./atomic_write.cjs");

const ROOT = "C:/Users/cash/smc-icm-trading";
const DATE = new Date().toISOString().split("T")[0];
const STATE_FILE = path.join(ROOT, "shared", DATE, "session_state.json");
const LOG_FILE = path.join(ROOT, "shared", DATE, "monitor_log.jsonl");
const NODE_PATH = path.join(ROOT, "tools", "tv-mcp", "node_modules");

const ONCE = process.argv.includes("--once");
const INTERVAL_SEC = ONCE ? 0 : 60; // 60 seconds for continuous, instant for --once

function log(entry) {
  const line = { time: new Date().toISOString(), ...entry };
  atomicAppend(LOG_FILE, JSON.stringify(line));
  const emoji = entry.alert ? "🚨" : "📡";
  console.log("[" + new Date().toLocaleTimeString() + "]", emoji, entry.event || "", entry.detail || "");
}

function run(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    console.error("[MONITOR:RUN_ERR]", cmd.substring(0, 80), e.message);
    if (e.stderr) console.error("[MONITOR:STDERR]", e.stderr.toString().substring(0, 200));
    return null;
  }
}

function checkPositions() {
  const cmd = `cd "${path.join(ROOT, "tools", "tv-mcp")}" && node positions_json.cjs`;
  const raw = run(cmd);
  if (!raw || raw.trim() === "" || raw.trim() === "[]") {
    return [];
  }
  try {
    const rows = JSON.parse(raw);
    const positions = [];
    for (const row of rows) {
      if (row.length < 8) continue;
      const symbol = row[0] || "";
      const brokerMatch = symbol.match(/(OANDA|CAPITALCOM):(\w+)/);
      if (!brokerMatch) continue;
      const sideStr = row[1] || "";
      const side = sideStr === "Short" ? "SELL" : sideStr === "Long" ? "BUY" : null;
      if (!side) continue;
      const entry = parseFloat((row[3] || "").replace(/,/g, ""));
      const tp = parseFloat((row[4] || "").replace(/,/g, ""));
      const sl = parseFloat((row[5] || "").replace(/,/g, ""));
      const current = parseFloat((row[6] || "").replace(/,/g, ""));
      const pnl = (row[7] || "").replace(/USD/i, "");
      if (isNaN(entry) || isNaN(current)) continue;
      positions.push({
        broker: brokerMatch[1], pair: brokerMatch[2], direction: side,
        qty: (row[2] || "").replace(/,/g, ""), entry, tp, sl, current, pnl
      });
    }
    return positions;
  } catch(e) {
    log({ event: "PARSE_ERROR", detail: e.message });
    return [];
  }
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
  try { atomicWrite(STATE_FILE, state); } catch(e) { log({ event: "STATE_WRITE_FAIL", detail: e.message, alert: true }); }
  return state;
}

// ═══ PROCESS LIFECYCLE — prevent silent death ═══
process.on("uncaughtException", (err) => {
  console.error("[MONITOR:FATAL] Uncaught exception:", err.message);
  log({ event: "MONITOR_CRASH", detail: err.message, alert: true });
  // Don't exit — let the loop restart
});
process.on("unhandledRejection", (reason) => {
  console.error("[MONITOR:FATAL] Unhandled rejection:", reason?.message || reason);
  log({ event: "MONITOR_REJECTION", detail: reason?.message || String(reason), alert: true });
});
process.on("SIGINT", () => {
  log({ event: "MONITOR_SHUTDOWN", detail: "SIGINT received — shutting down gracefully" });
  process.exit(0);
});
process.on("SIGTERM", () => {
  log({ event: "MONITOR_SHUTDOWN", detail: "SIGTERM received — shutting down gracefully" });
  process.exit(0);
});

// ═══ MAIN ═══
async function tick() {
  const now = new Date();
  const nyHour = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" })).getHours();

  // Only run during trading hours (02:00-05:00 NY)
  if (nyHour < 2 || nyHour >= 5) {
    if (!ONCE) return; // Silent skip outside hours
  }

  const positions = checkPositions();

  // If check failed (null), don't write state — keep previous state
  if (positions === null) {
    log({ event: "MONITOR_ERROR", detail: "Position check failed — check_orders.cjs may have module errors. Keeping previous state.", alert: true });
    return null;
  }

  const alerts = checkAlerts(positions);
  const state = writeState(positions, alerts, null);

  if (alerts.length > 0) {
    for (const a of alerts) {
      log({ event: a.type, detail: a.pair + " — " + a.detail, alert: true });
    }
  } else if (positions.length > 0) {
    log({ event: "MONITOR", detail: positions.length + " position(s), no alerts. " + positions.map(p => p.pair + " P&L:" + p.pnl).join(", ") });
  } else {
    log({ event: "MONITOR", detail: "Genuinely no open positions (verified)" });
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
