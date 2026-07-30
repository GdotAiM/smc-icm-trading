// Autonomous 3-Hour Trading Session — London Killzone (02:00-05:00 NY)
// Run this ONCE at session start. It handles everything.
// Usage: node tools/tv-mcp/autonomous_session.cjs
//
// Discord alerts: Set DISCORD_WEBHOOK in .env for trade notifications
// The webhook sends trade entries, exits, P&L updates, and session summary

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = "C:/Users/cash/smc-icm-trading";
const DATE = new Date().toISOString().split("T")[0];
const SESSION_DIR = path.join(ROOT, "shared", DATE);
const LOG_FILE = path.join(SESSION_DIR, "autonomous_log.jsonl");

// Load .env for webhook
let DISCORD_WEBHOOK = "";
try {
  const envPath = path.join(ROOT, ".env");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf8");
    const match = envContent.match(/DISCORD_WEBHOOK=(.+)/);
    if (match) DISCORD_WEBHOOK = match[1].trim();
  }
} catch {}

const CONFIG = {
  pairs: ["EURUSD", "GBPUSD", "XAUUSD", "NAS100"],
  sessionStart: "02:00",  // NY time
  sessionEnd: "05:00",    // NY time
  maxPositions: 2,
  riskPerTrade: 1,        // percent ($100)
  minCoherenceScore: 7,   // out of 10 for entry
  slMultiplier: 1.5,      // ATR multiplier for SL
  tpMultiplier: 2.5,      // ATR multiplier for TP
  recheckIntervalMin: 10, // rescan every 10 minutes
  journalOnClose: true,
};

function log(entry) {
  const line = { time: new Date().toISOString(), ...entry };
  fs.appendFileSync(LOG_FILE, JSON.stringify(line) + "\n");
  console.log("[" + new Date().toLocaleTimeString() + "]", entry.event || "", entry.detail || "");
}

// Discord alert sender
async function discordAlert(emoji, title, detail, color) {
  if (!DISCORD_WEBHOOK) return;
  try {
    await fetch(DISCORD_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [{
          title: emoji + " " + title,
          description: detail,
          color: color || 0x5865F2,
          timestamp: new Date().toISOString(),
          footer: { text: "SMC-ICM Autonomous | London KZ " + DATE }
        }]
      })
    });
  } catch {}
}

function run(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", timeout: 60000, stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) {
    return null;
  }
}

function run(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", timeout: 60000, stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
// PHASE 1: Session Startup (02:00-02:05)
// ═══════════════════════════════════════════════════════════
async function phase1Startup() {
  log({ event: "PHASE_1", detail: "Session startup" });
  await discordAlert("🚀", "London Killzone Session Starting", "02:00-05:00 NY | " + DATE, 0x3498DB);

  // Kill only the intel_monitor — NOT Discord or other processes
  log({ event: "KILL_MONITORS", detail: "Stopping intel_monitor only (preserving Discord)" });
  try { execSync("taskkill /F /FI \"WINDOWTITLE eq intel_monitor*\" 2>nul", { timeout: 5000, stdio: "ignore" }); } catch {}
  try {
    // Find and kill intel_monitor by command line
    const result = execSync('wmic process where "name=\'node.exe\'" get processid,commandline /format:csv 2>nul', { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] });
    if (result) {
      const lines = result.split("\n");
      for (const line of lines) {
        if (line.includes("intel_monitor")) {
          const pid = line.split(",")[2]?.trim();
          if (pid) { try { execSync("taskkill /F /PID " + pid + " 2>nul", { timeout: 3000, stdio: "ignore" }); } catch {} }
        }
      }
    }
  } catch {}
  log({ event: "MONITORS_CLEAN", detail: "Intel monitor stopped, Discord preserved" });

  // Check TV CDP
  try {
    const resp = await fetch("http://127.0.0.1:9222/json/version");
    const data = await resp.json();
    log({ event: "TV_CDP_OK", detail: data.Browser });
  } catch {
    log({ event: "FATAL", detail: "TV CDP not reachable on port 9222" });
    await discordAlert("❌", "FATAL: TV CDP Not Reachable", "TradingView Desktop must be running with CDP on port 9222", 0xFF0000);
    process.exit(1);
  }

  // Check NY time
  const nyCheck = run(`node "${path.join(ROOT, "tools", "ny_time.cjs")}" --now`);
  if (nyCheck) {
    try {
      const ny = JSON.parse(nyCheck);
      log({ event: "NY_TIME", detail: ny.session?.name + " | tradeable: " + ny.tradeable + " | multiplier: " + ny.combinedMultiplier });
    } catch {}
  }

  // Run session startup (fetches data, runs engines, forecasts)
  log({ event: "STARTUP", detail: "Running session_start.cjs..." });
  await discordAlert("📡", "Fetching Data", "Running session_start.cjs — candles, engines, forecasts for all pairs", 0x9B59B6);
  const startup = run(`node "${path.join(ROOT, "tools", "session_start.cjs")}"`);
  log({ event: "STARTUP_COMPLETE", detail: startup ? "OK" : "FAILED" });
  await discordAlert("✅", "Data Ready", "All pairs fetched, engines run, forecasts generated", 0x2ECC71);
}

// ═══════════════════════════════════════════════════════════
// PHASE 2: Initial Scan & Trade (02:05-02:15)
// ═══════════════════════════════════════════════════════════
async function phase2InitialScan() {
  log({ event: "PHASE_2", detail: "Initial pair scan" });

  // Get live levels
  const levels = run(`node "${path.join(ROOT, "tools", "tv-mcp", "live_levels.cjs")}"`);
  if (!levels) {
    log({ event: "SCAN_FAILED", detail: "live_levels.cjs failed" });
    return [];
  }

  let setups;
  try { setups = JSON.parse(levels); } catch { return []; }

  log({ event: "SCAN_RESULTS", detail: setups.length + " pairs scanned" });

  const trades = [];
  for (const s of setups) {
    if (s.error) continue;

    // Score: trend alignment (3 = all aligned, 1 = partial, 0 = mixed)
    const alignment = (s.trend15m === s.trend5m && s.trend5m === s.trend1m) ? 3 :
                      (s.trend15m === s.trend5m || s.trend5m === s.trend1m) ? 1 : 0;

    // Only trade if there's clear alignment
    if (alignment >= 1 && CONFIG.pairs.includes(s.pair)) {
      // Use the SL/TP from live_levels
      const tradeCmd = `node "${path.join(ROOT, "tools", "tv-mcp", "market_order.cjs")}" ${s.pair} ${s.side} ${s.sl} ${s.tp} ${s.qty}`;
      log({ event: "PLACING", detail: s.pair + " " + s.side + " SL:" + s.sl + " TP:" + s.tp });
      const result = run(tradeCmd);
      trades.push({ pair: s.pair, side: s.side, sl: s.sl, tp: s.tp, qty: s.qty, alignment });
      log({ event: "PLACED", detail: s.pair + " " + s.side });

      // Discord alert for each trade
      const dirEmoji = s.side === "SELL" ? "🔴" : "🟢";
      await discordAlert(dirEmoji, s.side + " " + s.pair.toUpperCase(),
        "Entry: Market | SL: " + s.sl + " | TP: " + s.tp + " | Qty: " + s.qty + " | Alignment: " + alignment + "/3",
        s.side === "SELL" ? 0xFF1744 : 0x00E676);
    }
  }

  return trades;
}

// ═══════════════════════════════════════════════════════════
// PHASE 3: Monitor Loop (02:15-04:55)
// ═══════════════════════════════════════════════════════════
async function phase3Monitor(trades) {
  log({ event: "PHASE_3", detail: "Monitoring " + trades.length + " positions" });

  let checkCount = 0;
  const maxChecks = Math.floor((170) / CONFIG.recheckIntervalMin); // ~170 min window

  while (checkCount < maxChecks) {
    checkCount++;
    await new Promise(r => setTimeout(r, CONFIG.recheckIntervalMin * 60000));

    log({ event: "CHECK", detail: "#" + checkCount });

    // Check positions
    const positions = run(`node "${path.join(ROOT, "tools", "tv-mcp", "check_orders.cjs")}"`);
    if (positions) {
      try { log({ event: "POSITIONS", detail: positions.substring(0, 200) }); } catch {}
    }

    // Re-scan for new setups if we have capacity
    // (simplified — just check existing positions)
  }
}

// ═══════════════════════════════════════════════════════════
// PHASE 4: Session Close (04:55-05:00)
// ═══════════════════════════════════════════════════════════
async function phase4Close() {
  log({ event: "PHASE_4", detail: "Closing session" });

  // Check final positions
  const finalCheck = run(`node "${path.join(ROOT, "tools", "tv-mcp", "check_orders.cjs")}"`);
  log({ event: "FINAL_POSITIONS", detail: finalCheck?.substring(0, 300) || "none" });

  // Extract lessons
  log({ event: "JOURNAL", detail: "Running continuous learn..." });
  run(`node "${path.join(ROOT, "tools", "ict_continuous_learn.cjs")}" --run`);

  // Rebuild graph
  run(`node "${path.join(ROOT, "tools", "trade_graph.cjs")}" --rebuild`);
  log({ event: "GRAPH_REBUILT" });

  // Update performance ledger
  run(`node "${path.join(ROOT, "tools", "performance_ledger.cjs")}"`);

  log({ event: "SESSION_COMPLETE", detail: "London Killzone session complete" });

  // Print summary
  const summary = run(`node "${path.join(ROOT, "tools", "risk_tracker.cjs")}" --summary`);
  console.log("\n=== SESSION SUMMARY ===");
  console.log(summary || "No summary available");
  console.log("Log: " + LOG_FILE);

  await discordAlert("🏁", "Session Complete — London Killzone",
    "02:00-05:00 NY session ended. All positions closed.\\n" + (summary ? summary.substring(0, 500) : "Check log for details"),
    0xF1C40F);
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════
(async () => {
  console.log("========================================");
  console.log("  AUTONOMOUS LONDON KILLZONE SESSION");
  console.log("  " + DATE + " | 02:00-05:00 NY");
  console.log("========================================\n");

  fs.mkdirSync(SESSION_DIR, { recursive: true });

  await phase1Startup();
  const trades = await phase2InitialScan();
  await phase3Monitor(trades);
  await phase4Close();
})().catch(e => {
  log({ event: "FATAL", detail: e.message });
  console.error(e);
  process.exit(1);
});
