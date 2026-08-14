// P4 Startup — Launch full MT5 LIVE demo trading week stack
//
// Single command to start all P4 services:
//   1. run_bridge.cjs (MT5 supervisor + HTTP proxy)
//   2. mt5_entry_loop.cjs (entry driver — opens orders when gate allows; LIVE only)
//   3. mt5_monitor.cjs (position management: BE/partial/close-by-time/daily-cap)
//
// Run this at the start of each trading session. Starts services
// as child processes so they run independently.
//
// Usage:
//   node tools/mt5/p4_startup.cjs               # REVIEW mode
//   node tools/mt5/p4_startup.cjs --live         # LIVE mode (real management + entries)
//   node tools/mt5/p4_startup.cjs --status       # Quick status check

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "../..");
const BRIDGE_URL = process.env.MT5_BRIDGE_URL || "http://127.0.0.1:5111";
const LIVE = process.argv.includes("--live");
const STATUS_ONLY = process.argv.includes("--status");
const MODE = LIVE ? "LIVE" : (process.env.MT5_MODE || "REVIEW");

const DATE = require("../ny_time.cjs").getNYDate();

// ═══ Quick bridge HTTP call ═══

function bridgeHealth() {
  return new Promise((resolve) => {
    const req = http.get(BRIDGE_URL + "/health", (res) => {
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ status: "error", detail: "parse failed" }); }
      });
    });
    req.on("error", () => resolve({ status: "dead", detail: "bridge not running" }));
    req.setTimeout(3000, () => { req.destroy(); resolve({ status: "dead", detail: "timeout" }); });
  });
}

// ═══ Status check ═══

async function checkStatus() {
  console.log("=== P4 MT5 Trading Stack Status ===\n");

  // Bridge health
  const health = await bridgeHealth();
  const ok = health.status === "ok";
  console.log("Bridge Supervisor:", ok ? "✅ RUNNING" : "❌ " + health.status);
  if (ok) {
    console.log("  Terminal:", health.terminal || "?");
    console.log("  Connected:", health.connected);
    console.log("  Trade allowed:", health.tradeAllowed);
    console.log("  Uptime:", (health.uptime || 0) + "s");
    console.log("  PID:", health.bridgePid);
  }
  console.log("");

  // MT5 terminal
  try {
    const { execSync } = require("child_process");
    const tasklist = execSync('tasklist /FI "IMAGENAME eq terminal64.exe" 2>nul', { encoding: "utf8" });
    const running = tasklist.includes("terminal64.exe");
    console.log("MT5 Terminal:", running ? "✅ RUNNING" : "❌ NOT RUNNING");
  } catch {
    console.log("MT5 Terminal: ⚠️  Unable to check");
  }
  console.log("");

  // Mode
  console.log("Mode: " + MODE);
  console.log("Kill switch:", fs.existsSync(path.join(ROOT, "_config", "mt5.kill")) ? "🔴 ACTIVE" : "🟢 Inactive");
  console.log("");

  // Recent monitor log
  const logFile = path.join(ROOT, "shared", DATE, "mt5_monitor_log.jsonl");
  if (fs.existsSync(logFile)) {
    const lines = fs.readFileSync(logFile, "utf8").trim().split("\n");
    const recent = lines.slice(-5);
    console.log("Recent monitor activity:");
    for (const line of recent) {
      try {
        const entry = JSON.parse(line);
        console.log("  " + entry.time + " [" + (entry.action || "?") + "] " + (entry.event || entry.detail || ""));
      } catch {}
    }
  }
  console.log("");
}

// ═══ Startup ═══

function startService(name, script, args = []) {
  const scriptPath = path.join(__dirname, script);
  console.log(`  Starting ${name}: node ${scriptPath} ${args.join(" ")}`);

  const child = spawn("node", [scriptPath, ...args], {
    cwd: ROOT,
    env: { ...process.env, MT5_MODE: MODE, WORKSPACE_ROOT: ROOT },
    stdio: "inherit",
  });

  child.on("error", (err) => {
    console.error(`  [${name}] spawn error:`, err.message);
  });

  child.on("close", (code) => {
    console.log(`  [${name}] exited with code ${code}`);
  });

  return child;
}

async function startup() {
  if (STATUS_ONLY) {
    return checkStatus();
  }

  console.log("=== P4 MT5 Trading Stack — " + MODE + " MODE ===");
  console.log("Date: " + DATE);
  console.log("");

  // Check if bridge is already running
  const health = await bridgeHealth();
  let bridgeChild = null;
  let monitorChild = null;

  if (health.status === "ok") {
    console.log("Bridge already running (PID " + health.bridgePid + ") — skip spawn");
    console.log("");
  } else {
    console.log("Starting bridge supervisor...");
    bridgeChild = startService("bridge", "run_bridge.cjs");
    // Wait for bridge to be ready
    console.log("  Waiting for bridge...");
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const h = await bridgeHealth();
      if (h.status === "ok") {
        console.log("  Bridge ready!");
        break;
      }
      process.stdout.write(".");
    }
    console.log("");
  }

  // Verify MT5 terminal is connected
  const h = await bridgeHealth();
  if (h.status === "ok" && !h.connected) {
    console.log("⚠️  WARNING: MT5 terminal not connected — check terminal is logged in");
    console.log("");
  }
  if (h.status === "ok" && !h.tradeAllowed) {
    console.log("⚠️  WARNING: AutoTrading not enabled — enable in MT5 terminal (AutoTrading button)");
    console.log("");
  }

  // Start monitor
  console.log("Starting position management monitor...");
  monitorChild = startService("monitor", "mt5_monitor.cjs", LIVE ? ["--live"] : []);

  // Start entry loop in LIVE mode (opens orders when the gate allows).
  // REVIEW mode leaves entries manual (log-only auto_trade sweeps).
  let entryLoopChild = null;
  if (LIVE) {
    console.log("Starting entry loop (gate-driven entries)...");
    entryLoopChild = startService("entry-loop", "mt5_entry_loop.cjs", ["--live", "--interval", process.env.MT5_ENTRY_INTERVAL || "300"]);
  }

  console.log("");
  console.log("=== P4 Stack Running ===");
  console.log("Bridge:  http://127.0.0.1:5111");
  console.log("Monitor: " + MODE + " mode, checking every 60s");
  if (LIVE) console.log("Entry:   LIVE mode, gate-driven, every " + (process.env.MT5_ENTRY_INTERVAL || "300") + "s");
  else console.log("Entry:   manual (REVIEW mode) — run mt5_auto_trade.cjs <PAIR> --live to open");
  console.log("Logs:    shared/" + DATE + "/mt5_monitor_log.jsonl");
  console.log("State:   shared/" + DATE + "/mt5_monitor_state.json");
  console.log("");
  console.log("Management rules active:");
  console.log("  ✅ SL → BE after TP1 midpoint breached");
  console.log("  ✅ Partial close 50% at TP1");
  console.log("  ✅ Close by NY close (17:00 NY)");
  console.log("  ✅ Friday close (16:00 NY)");
  console.log("  ✅ Daily loss cap (3%)");
  console.log("  ✅ Lunch multiplier (×0.4)");
  console.log("");
  console.log("Press Ctrl+C to stop all services");

  // Keep running and manage children
  const cleanup = () => {
    console.log("\nShutting down P4 stack...");
    if (monitorChild) monitorChild.kill("SIGTERM");
    if (entryLoopChild) entryLoopChild.kill("SIGTERM");
    // Send graceful shutdown to bridge via HTTP
    const req = http.request({ hostname: "127.0.0.1", port: 5111, path: "/shutdown", method: "POST" }, () => {});
    req.on("error", () => {});
    req.end();
    if (bridgeChild) setTimeout(() => bridgeChild.kill("SIGTERM"), 3000);
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  // Heartbeat — print status every 5 minutes
  setInterval(async () => {
    const h = await bridgeHealth();
    const emoji = h.status === "ok" ? "✅" : "⚠️";
    console.log(`[${new Date().toLocaleTimeString()}] ${emoji} Heartbeat — bridge: ${h.status}, trade: ${h.tradeAllowed} | Mode: ${MODE}`);
  }, 300_000);
}

startup().catch((e) => {
  console.error("[P4_STARTUP] fatal:", e.message);
  process.exit(1);
});
