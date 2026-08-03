// Auto Scheduler — Autonomous Daily Trading Cycle
// Runs the full day without manual intervention.
// Starts itself at each session window, refreshes data, scans, reports.
// Can execute trades if --execute flag is passed.
//
// Usage: node tools/auto_scheduler.cjs           (monitor only — reports setups, no execution)
//        node tools/auto_scheduler.cjs --execute  (autonomous trading — executes best setup)
//        node tools/auto_scheduler.cjs --once     (run one cycle and exit)

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..");
const DATE = new Date().toISOString().split("T")[0];
const EXECUTE = process.argv.includes("--execute");
const ONCE = process.argv.includes("--once");
const PAIRS = ["EURUSD", "GBPUSD", "XAUUSD", "NAS100"];

// ═══ CONFIG ═══
const SCHEDULE = [
  { time: "01:55", event: "PRE-LONDON", action: "briefing", desc: "Pre-London data refresh + briefing" },
  { time: "02:00", event: "LONDON_KZ", action: "scan", desc: "London Killzone — monitor for setups" },
  { time: "03:00", event: "LONDON_SB", action: "scan", desc: "London Silver Bullet window" },
  { time: "06:55", event: "PRE_LECTURE2", action: "briefing", desc: "Pre-07:00 data refresh" },
  { time: "07:00", event: "LECTURE2", action: "scan", desc: "Lecture 2 — London Hunt + IFVG" },
  { time: "07:55", event: "PRE_LECTURE1", action: "scan", desc: "Pre-08:00 formation check" },
  { time: "08:30", event: "LECTURES_1_4", action: "scan", desc: "Lectures 1+4 — NY AM complex" },
  { time: "09:30", event: "AMOR", action: "scan", desc: "AM Session Opening Range" },
  { time: "09:45", event: "PRE_MACRO", action: "briefing", desc: "Pre-09:50 macro data refresh" },
  { time: "09:50", event: "NY_MACRO", action: "scan", desc: "⭐⭐ NY-AM Macro — highest conviction" },
  { time: "10:00", event: "SILVER_BULLET", action: "scan", desc: "Silver Bullet scalp window" },
  { time: "13:25", event: "PRE_PM", action: "briefing", desc: "Pre-PM session refresh" },
  { time: "13:30", event: "PMOR", action: "scan", desc: "PM Session Opening Range" },
  { time: "15:50", event: "PRE_CLOSE", action: "scan", desc: "Pre-close — close positions if Friday" },
];

const LOG_FILE = path.join(ROOT, "shared", DATE, "auto_scheduler_log.jsonl");

function nyTime() { return new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false }); }
function nyHour() { return parseInt(nyTime().split(":")[0]); }
function nyMin() { return parseInt(nyTime().split(":")[1]); }
function nyMins() { return nyHour() * 60 + nyMin(); }

function log(event, detail) {
  const entry = { time: new Date().toISOString(), nyTime: nyTime(), event, detail };
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n");
  const icon = event.includes("ERROR") ? "❌" : event.includes("TRADE") ? "🎯" : event.includes("SETUP") ? "✅" : "📋";
  console.log(`[${nyTime()}] ${icon} ${event}: ${detail}`);
}

function run(cmd, timeout) {
  try { return execSync(cmd, { encoding: "utf8", timeout: timeout || 120000, stdio: ["ignore","pipe","ignore"] }); }
  catch(e) { log("ERROR", `${cmd.split("/").pop().split(" ")[0]}: ${e.message.slice(0,80)}`); return null; }
}

// ═══ REFRESH DATA ═══
function refreshData() {
  log("DATA_REFRESH", "Fetching fresh candles + engines...");
  const start = Date.now();
  const result = run(`node "${path.join(ROOT, "tools", "session_start.cjs")}"`, 300000);
  const sec = ((Date.now() - start) / 1000).toFixed(0);
  log("DATA_REFRESH", `Complete in ${sec}s — ${result ? 'OK' : 'FAILED'}`);
}

// ═══ SCAN ALL PAIRS ═══
let lastScanTime = 0;
let lastScanResults = null;

// ═══ PARALLEL SCAN ═══
let scanInProgress = false;

function scanAll() {
  // Don't start a new scan if one is already running
  if (scanInProgress) return lastScanResults;

  // Skip re-scan if data is fresh (< 5 min)
  const now = Date.now();
  if (now - lastScanTime < 300000 && lastScanResults !== undefined) {
    return lastScanResults;
  }

  scanInProgress = true;
  lastScanTime = now;
  const scanStart = Date.now();
  log("SCAN", `Scanning ${PAIRS.length} pairs...`);

  const setups = [];
  for (const p of PAIRS) {
    const output = run(`node "${path.join(ROOT, "tools", "run_pair.cjs")}" ${p}`, 90000);
    if (!output) continue;

    const tradeable = !output.includes("Entry: NO TRADE") && output.includes("INDUCEMENT GATE: ✅");
    const entry = (output.match(/Entry: (\w+) @ ([\d.]+)/) || [])[0] || "NO TRADE";
    const model = (output.match(/Model: (.+?) \(([\d.]+)\//) || [])[1] || "?";
    const rr = parseFloat((output.match(/R:R: ([\d.]+):1/) || [])[1] || "0");
    const coh = parseInt((output.match(/Unified Coherence: (\d+)/) || [])[1] || "0");
    const sl = (output.match(/\| SL \| ([\d.]+)/) || [])[1];
    const tp = (output.match(/\| TP1 \| ([\d.]+)/) || [])[1];
    const lectures = [];
    if (output.includes("LECTURE 2 SETUP READY")) lectures.push("L2");
    if (output.includes("LECTURE 1 SETUP READY")) lectures.push("L1");
    if (output.includes("LECTURE 4 SETUP READY")) lectures.push("L4");

    if (tradeable) {
      setups.push({ pair, entry, model, rr, coh, sl, tp, lectures, output });
      log("SETUP", `${pair}: ${entry} | ${model}${lectures.length ? ' ['+lectures.join(',')+']' : ''} | R:R ${rr}:1`);
    }
  }

  // ═══ WATCHDOG: If scan took > 10 min, log warning ═══
  const scanElapsed = (Date.now() - scanStart) / 1000;
  if (scanElapsed > 600) log("WATCHDOG", `Scan took ${scanElapsed.toFixed(0)}s — possible timeout or slow pair`);

  // Rank and report best
  setups.sort((a, b) => (b.coh + b.rr * 10) - (a.coh + a.rr * 10));

  scanInProgress = false;

  if (setups.length === 0) {
    lastScanResults = null;
    return null;
  }

  const best = setups[0];
  log("BEST", `${best.pair}: ${best.entry} | ${best.model} | R:R ${best.rr}:1 | Coh: ${best.coh}`);
  lastScanResults = best;
  return best;
}

// ═══ EXECUTE TRADE ═══
function executeTrade(setup) {
  if (!EXECUTE) {
    log("EXEC_SKIP", `${setup.pair} ${setup.entry} — --execute not set (monitor mode)`);
    return;
  }

  const direction = setup.entry.split(" @ ")[0];
  const qty = setup.pair === "NAS100" || setup.pair === "XAUUSD" ? 1 : 5000; // Indices: 1 contract, Forex: 5000 units
  const cmd = `node "${path.join(ROOT, "tools", "tv-mcp", "market_order.cjs")}" ${setup.pair} ${direction} ${setup.sl} ${setup.tp} ${qty}`;
  log("EXECUTING", `${setup.pair} ${direction} Qty:${qty} SL:${setup.sl} TP:${setup.tp}`);

  const result = run(cmd, 30000);
  if (result && (result.includes("Verified") || result.includes("filled"))) {
    log("TRADE_EXECUTED", `${setup.pair} ${direction} ${qty} — VERIFIED ✅`);

    // ═══ AUTO-JOURNAL: Write decision entry on trade execution ═══
    const journalFile = path.join(ROOT, "shared", DATE, "decision_journal.md");
    const ts = nyTime();
    const reason = `${setup.model} | R:R ${setup.rr}:1 | Coh: ${setup.coh}/100 | Lectures: ${setup.lectures?.join(',') || 'none'}`;
    const entry = `| ${ts} NY | TRADE_EXECUTED | ${setup.pair} ${direction} ${qty} @ ${setup.entry} | ${reason} |`;
    try {
      if (!fs.existsSync(journalFile)) {
        fs.writeFileSync(journalFile, `# Decision Journal — ${DATE}\n\n| Time (NY) | Event | Detail | Reasoning |\n|-----------|-------|--------|----------|\n`);
      }
      fs.appendFileSync(journalFile, entry + "\n");
    } catch {}
  } else {
    log("TRADE_FAILED", `${setup.pair} ${direction} — order might not have filled`);
  }
}

// ═══ MAIN CYCLE ═══
async function runCycle() {
  const now = nyMins();
  const nyH = nyHour();
  const dayOfWeek = new Date().getDay();

  if (dayOfWeek === 0 || dayOfWeek === 6) {
    if (!ONCE) setTimeout(runCycle, 1800000); // Weekend: check every 30 min
    return;
  }

  // ═══ CONTINUOUS SCAN — Never miss a setup ═══
  // Active killzones: scan every 5 minutes
  // Between sessions: scan every 15 minutes
  // Off-hours: every 30 minutes

  const inLondonKZ = nyH >= 2 && nyH < 5;
  const inNYKZ = nyH >= 8 && nyH < 11;
  const inNYPM = nyH >= 13 && nyH < 16;
  const inActiveSession = inLondonKZ || inNYKZ || inNYPM;
  const inPreMarket = (nyH >= 5 && nyH < 8) || (nyH >= 11 && nyH < 13);

  // Determine scan interval
  let scanInterval = 1800000; // 30 min default
  // Log active session + time remaining
  const sessionLabel = inLondonKZ ? `London KZ (ends 05:00, ${60 - nyMin()}m left)` :
                       inNYKZ ? `NY AM KZ (ends 11:00, ${(11*60 - now)}m left)` :
                       inNYPM ? `NY PM (ends 16:00, ${(16*60 - now)}m left)` :
                       inPreMarket ? `Pre-market` : `Off-hours`;
  if (inActiveSession || inPreMarket) {
    // Only log on session transitions or every 30 min
    const lastSessionLog = parseInt(process.env.LAST_SESSION_LOG || "0");
    if (now - lastSessionLog > 1800) {
      log("SESSION", `${sessionLabel} | Scanning every ${scanInterval/60000}min`);
      process.env.LAST_SESSION_LOG = String(now);
    }
  }

  if (inActiveSession) scanInterval = 600000;  // 10 min during killzones (scan takes ~8 min)
  else if (inPreMarket) scanInterval = 900000; // 15 min pre-market

  // Check for scheduled event (briefing windows still do full data refresh)
  let currentEvent = null;
  for (const s of SCHEDULE) {
    const [h, m] = s.time.split(":").map(Number);
    const sMins = h * 60 + m;
    if (Math.abs(now - sMins) <= 3) { currentEvent = s; break; }
  }

  if (currentEvent) {
    log("EVENT", `${currentEvent.time} — ${currentEvent.event}: ${currentEvent.desc}`);
    if (currentEvent.action === "briefing") {
      refreshData();
      scanAll();
    }
  }

  // ═══ EVERY CYCLE: Scan for setups ═══
  // During active sessions, scan on every cycle (not just at event times)
  if (inActiveSession || inPreMarket) {
    const best = scanAll();
    if (best) executeTrade(best);
  }

  // Friday close
  if (dayOfWeek === 5 && now >= 15 * 60 + 50) {
    log("FRIDAY_CLOSE", "Closing all positions — Friday 4:00 PM rule");
    run(`node "${path.join(ROOT, "tools", "tv-mcp", "check_orders.cjs")}"`, 15000);
  }

  // Heartbeat every 30 min — proves the scheduler is alive
  if (now % 1800 < 5) log("HEARTBEAT", `Scheduler alive | ${sessionLabel} | ${setups?.length || 0} tradeable`);

  if (ONCE) {
    log("CYCLE_COMPLETE", "Single cycle done");
    return;
  }

  setTimeout(runCycle, scanInterval);
}

// ═══ CODE VERSION CHECK ═══
function checkVersion() {
  try {
    const rev = execSync("git rev-parse --short HEAD", { encoding: "utf8", timeout: 5000, stdio: ["ignore","pipe","ignore"] }).trim();
    return rev || "unknown";
  } catch { return "unknown"; }
}

// ═══ START ═══
console.log("═══════════════════════════════════════════════════════════");
console.log(`  AUTO SCHEDULER — ${DATE} — ${nyTime()} NY`);
console.log(`  Mode: ${EXECUTE ? '🤖 AUTONOMOUS (will execute trades)' : '👁️ MONITOR (reports only)'}`);
console.log(`  Pairs: ${PAIRS.join(', ')} | Schedule: ${SCHEDULE.length} events`);
console.log(`  Version: ${checkVersion()} | Log: ${LOG_FILE}`);
console.log("═══════════════════════════════════════════════════════════\n");

fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
log("SCHEDULER_START", `Mode: ${EXECUTE ? 'AUTONOMOUS' : 'MONITOR'} | Day: ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date().getDay()]} | Version: ${checkVersion()}`);

runCycle();
