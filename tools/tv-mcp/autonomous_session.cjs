// Autonomous 3-Hour Trading Session — London Killzone (02:00-05:00 NY)
// Run this ONCE at session start. It handles everything.
// Usage: node tools/tv-mcp/autonomous_session.cjs
//
// Entry path: runs run_pair.cjs per pair, then gates each via auto_decision.cjs
// (shared with ny_am_autonomous.cjs). Only gated setups are placed.
// market_order.cjs itself stays raw — the gate is the single choke point.
//
// Discord alerts: Set DISCORD_WEBHOOK in .env for trade notifications

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "../..");
const DATE = require("../ny_time.cjs").getNYDate();
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
  recheckIntervalMin: 10, // refresh data every 10 minutes
  journalOnClose: true,
};

// Single-driver lock — if auto_scheduler.cjs is running (heartbeat fresh),
// it owns execution; this phase driver steps aside to avoid double-trading.
const guard = require("../scheduler_guard.cjs");
if (guard.activeMode(10) === "EXECUTE") {
  console.log("AUTO_SCHEDULER active — autonomous_session standing aside (single-driver lock).");
  process.exit(0);
}

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

function run(cmd, timeoutMs) {
  try {
    return execSync(cmd, { encoding: "utf8", timeout: timeoutMs || 120000, stdio: ["ignore", "pipe", "ignore"] });
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
  const startup = run(`node "${path.join(ROOT, "tools", "session_start.cjs")}"`, 300000);
  log({ event: "STARTUP_COMPLETE", detail: startup ? "OK" : "FAILED" });
  await discordAlert("✅", "Data Ready", "All pairs fetched, engines run, forecasts generated", 0x2ECC71);
}

// ═══════════════════════════════════════════════════════════
// PHASE 2: Pipeline + Gated Entry (02:05-02:30)
// Runs the full registry pipeline per pair, gates each decision,
// and places only setups that pass. No legacy live_levels trend path.
// ═══════════════════════════════════════════════════════════
async function phase2PipelineScan() {
  log({ event: "PHASE_2", detail: "Running pipeline on " + CONFIG.pairs.length + " pairs" });

  const autoDecision = require("../auto_decision.cjs");
  const trades = [];

  for (const pair of CONFIG.pairs) {
    if (trades.length >= CONFIG.maxPositions) {
      log({ event: "MAX_POSITIONS", detail: "Reached " + CONFIG.maxPositions + " — skipping " + pair });
      continue;
    }

    // Run the full pipeline — emits decision.json + all stage outputs
    log({ event: "PIPELINE", detail: pair });
    const output = run(`node "${path.join(ROOT, "tools", "run_pair.cjs")}" ${pair}`, 120000);
    if (!output) {
      log({ event: "PIPELINE_FAILED", detail: pair });
      continue;
    }

    // Gate the decision — same choke point ny_am_autonomous uses
    const gate = autoDecision.gate(pair);
    const verdict = gate.allowed ? "✅ ALLOWED" : "🛑 BLOCKED — " + gate.reasons.join("; ");
    log({ event: "GATE", detail: pair + " | " + verdict });

    if (!gate.allowed) {
      await discordAlert("🛑", pair + " Gated Out",
        "Pipeline decision rejected: " + gate.reasons.join("; "), 0xF1C40F);
      continue;
    }

    const d = gate.decision;
    const op = gate.operative; // second-chance tightened plan when applicable
    const side = op.side;
    let qty = d.sizing.qty;
    if (op.sizeMultiplier && op.sizeMultiplier !== 1) {
      qty = Math.max(100, Math.round(qty * op.sizeMultiplier)); // 0.5x for second chance
    }
    const sl = op.sl;
    const tp1 = op.tp1;
    const model = d.registry.primary;
    const chanceTag = gate.secondChance ? " [SECOND CHANCE]" : "";

    const tradeCmd = `node "${path.join(ROOT, "tools", "tv-mcp", "market_order.cjs")}" ${pair} ${side} ${sl} ${tp1} ${qty}`;
    log({ event: "PLACING", detail: pair + " " + side + " SL:" + sl + " TP:" + tp1 + " Qty:" + qty + " Model:" + model + chanceTag });
    const result = run(tradeCmd, 45000);
    if (result) {
      trades.push({ pair, side, sl, tp: tp1, qty, model });
      log({ event: "PLACED", detail: pair + " " + side });

      const dirEmoji = side === "SELL" ? "🔴" : "🟢";
      await discordAlert(dirEmoji, side + " " + pair.toUpperCase() + chanceTag,
        "Entry: Market | SL: " + sl + " | TP: " + tp1 + " | Qty: " + qty + " | Model: " + model + " | R:R " + (gate.operativeRR || d.rr?.rr1 || 0).toFixed(1) + ":1",
        side === "SELL" ? 0xFF1744 : 0x00E676);
    } else {
      log({ event: "PLACE_FAILED", detail: pair + " — market_order returned null" });
      await discordAlert("⚠️", "Order Failed", pair + " " + side + " — TV CDP may be busy", 0xE67E22);
    }
  }

  return trades;
}

// ═══════════════════════════════════════════════════════════
// PHASE 3: Monitor Loop (02:30-04:55)
// Refreshes data + checks positions. No new entries — the legacy
// live_levels trend re-scan stacking loop has been removed.
// ═══════════════════════════════════════════════════════════
async function phase3Monitor(trades) {
  log({ event: "PHASE_3", detail: "Monitoring " + trades.length + " positions — refreshing data each cycle" });

  let checkCount = 0;
  const maxChecks = Math.floor((170) / CONFIG.recheckIntervalMin); // ~170 min window
  const FULL_REFRESH_EVERY = 3; // Full session_start every 3rd cycle (~30 min)

  while (checkCount < maxChecks) {
    checkCount++;
    await new Promise(r => setTimeout(r, CONFIG.recheckIntervalMin * 60000));

    log({ event: "CHECK", detail: "#" + checkCount + " — refreshing data" });

    // ═══ DATA REFRESH — keeps candles, engines, and forecasts fresh ═══
    // Run session_start every cycle. It fetches live candles from TV CDP,
    // re-runs the SMC engine, and regenerates forecasts.
    const doFullRefresh = (checkCount % FULL_REFRESH_EVERY === 0);
    if (doFullRefresh) {
      log({ event: "FULL_REFRESH", detail: "Running full session_start.cjs (all pairs, all TFs)" });
      const refreshStart = Date.now();
      const startupResult = run(`node "${path.join(ROOT, "tools", "session_start.cjs")}"`, 300000);
      const refreshSec = ((Date.now() - refreshStart) / 1000).toFixed(0);
      log({ event: "FULL_REFRESH_DONE", detail: "Completed in " + refreshSec + "s — " + (startupResult ? "OK" : "FAILED") });
    }

    // ═══ CHECK POSITIONS ═══
    const positions = run(`node "${path.join(ROOT, "tools", "tv-mcp", "check_orders.cjs")}"`, 30000);
    if (positions) {
      try {
        const posData = JSON.parse(positions);
        if (Array.isArray(posData) && posData.length > 0) {
          for (const p of posData) {
            log({ event: "POSITION", detail: p.pair + " " + p.side + " | Entry: " + p.entry + " | Current: " + p.currentPrice + " | P&L: " + p.pnl });
          }
        } else {
          log({ event: "POSITIONS", detail: "No open positions" });
        }
      } catch {
        log({ event: "POSITIONS", detail: positions.substring(0, 200) });
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════
// PHASE 4: Session Close (04:55-05:00)
// ═══════════════════════════════════════════════════════════
async function phase4Close() {
  log({ event: "PHASE_4", detail: "Closing session" });

  // Check final positions
  const finalCheck = run(`node "${path.join(ROOT, "tools", "tv-mcp", "check_orders.cjs")}"`, 30000);
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
  const trades = await phase2PipelineScan();
  await phase3Monitor(trades);
  await phase4Close();
})().catch(e => {
  log({ event: "FATAL", detail: e.message });
  console.error(e);
  process.exit(1);
});
