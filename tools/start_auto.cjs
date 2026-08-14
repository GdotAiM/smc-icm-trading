// start_auto.cjs — Auto-mode launcher
// Spawns the three persistent processes that make the system run unattended:
//   1. auto_scheduler.cjs  --execute   (single day-long driver, gated)
//   2. session_monitor.cjs             (60s state loop + position alerts)
//   3. discord_bot.cjs                 (Discord integration, if tokens set)
//
// Usage:
//   node tools/start_auto.cjs          → launch all three (scheduler in EXECUTE mode)
//   node tools/start_auto.cjs --monitor→ scheduler in MONITOR mode (no trade placement)
//   node tools/start_auto.cjs --refresh→ run session_start.cjs first (fresh data)
//
// Intended to be registered at logon via the Windows Startup folder
// (%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\SMC-AutoMode.cmd)
// or a Scheduled Task (requires admin to create):
//   schtasks /Create /SC ONLOGON /TN "SMC-AutoMode" /TR "node ...\start_auto.cjs" ...
//
// Before trade placement, market_order.cjs needs the intel_monitor process
// killed (it fights for chart control) — see CLAUDE.md. We check and warn.

const { spawn, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..");
const DATE = require("./ny_time.cjs").getNYDate();
const LOG_FILE = path.join(ROOT, "shared", DATE, "start_auto.log");

const REFRESH = process.argv.includes("--refresh");
const MONITOR = process.argv.includes("--monitor");
const SKIP_REFRESH = process.argv.includes("--skip-refresh");
const guard = require("./scheduler_guard.cjs");

function log(msg) {
  const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + "\n"); } catch {}
}

function isProcessRunning(scriptName) {
  try {
    const out = execSync(`wmic process where "name='node.exe'" get commandline /format:list`, { encoding: "utf8", timeout: 10000 });
    return out.includes(scriptName);
  } catch { return false; }
}

async function main() {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  log("===== AUTO MODE LAUNCHER =====");

  // ── Pre-flight: TradingView CDP reachable? ──
  try {
    const http = require("http");
    await new Promise((resolve, reject) => {
      const req = http.get("http://localhost:9222/json/version", { timeout: 4000 }, res => {
        if (res.statusCode === 200) resolve(); else reject(new Error("HTTP " + res.statusCode));
        res.resume();
      });
      req.on("error", reject);
      req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    });
    log("✅ TradingView CDP reachable on :9222");
  } catch {
    log("❌ TradingView CDP NOT reachable on :9222 — start TradingView with the debug port first.");
    log("   Skipping launch. (session_start.cjs will also fail without it.)");
    process.exit(1);
  }

  // ── Warn if intel_monitor is alive (fights for chart control during order placement) ──
  if (isProcessRunning("intel_monitor.cjs")) {
    log("⚠️ intel_monitor.cjs is RUNNING — it fights market_order for chart control.");
    log("   Kill it with:  taskkill /F /PID <pid>   (targeted, NEVER /IM node.exe)");
  }

  // ── Optional: fresh data refresh ──
  if (REFRESH && !SKIP_REFRESH) {
    log("Refreshing data via session_start.cjs (~3-4 min)...");
    try {
      const out = execSync(`node "${path.join(ROOT, "tools", "session_start.cjs")}"`, { encoding: "utf8", timeout: 420000, stdio: ["ignore", "pipe", "inherit"] });
      log("✅ Data refresh complete: " + (String(out || "").includes("FAILED") ? "with failures — check log" : "OK"));
    } catch (e) {
      log("❌ session_start failed: " + (e.message || "").slice(0, 120));
    }
  }

  // ── 1) Scheduler (single day-long driver) ──
  // Duplicate detection via the guard heartbeat (wmic title matching is fragile).
  if (guard.isActive(10)) {
    log("Scheduler already running (heartbeat fresh) — skipping duplicate.");
  } else {
    const mode = MONITOR ? "MONITOR (reports only)" : "EXECUTE (places paper trades)";
    log("Spawning auto_scheduler.cjs " + (MONITOR ? "(monitor)" : "(--execute)") + " [" + mode + "]");
    const args = [path.join(ROOT, "tools", "auto_scheduler.cjs")];
    if (!MONITOR) args.push("--execute");
    const child = spawn("node", args, { detached: true, stdio: "ignore" });
    child.unref();
  }

  // ── 2) Session monitor (60s state + alerts) ──
  if (isProcessRunning("session_monitor.cjs")) {
    log("session_monitor already running — skipping duplicate.");
  } else {
    log("Spawning session_monitor.cjs");
    const m = spawn("node", [path.join(ROOT, "tools", "tv-mcp", "session_monitor.cjs")], {
      detached: true,
      stdio: "ignore",
    });
    m.unref();
  }

  // ── 3) Discord bot (if tokens available) ──
  const hasTokens = (() => {
    try {
      const env = fs.readFileSync(path.join(ROOT, ".env"), "utf8");
      return env.includes("DISCORD_TOKEN=") && env.includes("DISCORD_CLIENT_ID=");
    } catch { return false; }
  })();
  if (hasTokens) {
    if (isProcessRunning("discord_bot.cjs")) {
      log("discord_bot already running — skipping duplicate.");
    } else {
      log("Spawning discord_bot.cjs");
      const b = spawn("node", [path.join(ROOT, "tools", "discord_bot.cjs")], {
        detached: true,
        stdio: "ignore",
      });
      b.unref();
    }
  } else {
    log("Skipping discord_bot — DISCORD_TOKEN/CLIENT_ID not found in .env.");
  }

  log("===== LAUNCH COMPLETE — log at " + LOG_FILE + " =====");
}

main().catch(e => { console.error(e); process.exit(1); });
