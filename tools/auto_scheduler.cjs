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
const autoDecision = require("./auto_decision.cjs");
const guard = require("./scheduler_guard.cjs");
const PAIRS = ["EURUSD", "GBPUSD", "XAUUSD", "NAS100"];
// Broker-prefixed TV symbols — plain names resolve to wrong instruments on TradingView
const TV_SYMBOLS = {
  EURUSD: "OANDA:EURUSD",
  GBPUSD: "OANDA:GBPUSD",
  XAUUSD: "OANDA:XAUUSD",
  NAS100: "CAPITALCOM:NAS100",
  DXY: "FX:USDOLLAR"
};
// Price range guards — reject trades with SL/TP outside these bounds
// Prevents cross-pair contamination (e.g., EURUSD getting NAS100 prices)
const PRICE_GUARDS = {
  EURUSD: { min: 1.05, max: 1.25, label: "forex" },
  GBPUSD: { min: 1.20, max: 1.45, label: "forex" },
  XAUUSD: { min: 3500, max: 5000, label: "gold" },
  NAS100: { min: 20000, max: 35000, label: "index" },
  DXY: { min: 12000, max: 13500, label: "dxy" },
};

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
  const success = result && !result.includes("FAILED");
  log("DATA_REFRESH", `Complete in ${sec}s — ${success ? 'OK' : 'FAILED'}`);
  return success;
}

// ═══ SCAN ALL PAIRS ═══
let lastScanTime = 0;
let lastScanResults = null;

// ═══ PARALLEL SCAN ═══
let scanInProgress = false;

function scanAll() {
  // Don't start a new scan if one is already running (but force-reset if stuck > 15 min)
  if (scanInProgress) {
    if (Date.now() - lastScanTime < 900000) return lastScanResults;
    log("WATCHDOG", "Scan stuck for >15min — force-resetting");
    scanInProgress = false;
  }

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

    // ═══ GATED DECISION — single choke point (same as the auto-traders) ═══
    // The gate reads decision.json, enforces freshness/registry/entry/R:R/
    // coherence/invalidation/guard/risk, and returns the OPERATIVE plan
    // (primary or second-chance tightened levels). No regex parsing.
    const gate = autoDecision.gate(p);
    if (!gate.allowed) {
      log("GATED_OUT", `${p}: ${gate.reasons.join("; ") || "gate rejected"}`);
      continue;
    }

    const op = gate.operative || {};
    const d = gate.decision;
    const side = op.side; // LONG / SHORT
    const sl = op.sl;
    const tp = op.tp1;
    const entry = op.entry;
    if (side !== "LONG" && side !== "SHORT") {
      log("GATED_OUT", `${p}: no trade direction in operative plan`);
      continue;
    }

    const qty = Math.round((d?.sizing?.qty || 0) * (op.sizeMultiplier || 1));
    setups.push({
      pair: p, side, entry, sl, tp, qty,
      model: d?.registry?.primary || "?",
      rr: gate.operativeRR || d?.rr?.rr1 || 0,
      coh: d?.coherence?.unified || 0,
      secondChance: !!gate.secondChance,
      output,
    });
    log("SETUP", `${p}: ${side} @ ${entry} | ${setups[setups.length - 1].model}${setups[setups.length - 1].secondChance ? ' [SECOND CHANCE]' : ''} | R:R ${setups[setups.length - 1].rr.toFixed(1)}:1 | Qty:${qty}`);
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
  log("BEST", `${best.pair}: ${best.side} @ ${best.entry} | ${best.model} | R:R ${best.rr}:1 | Coh: ${best.coh}`);
  lastScanResults = best;
  return best;
}

// ═══ EXECUTE TRADE ═══
function executeTrade(setup) {
  if (!EXECUTE) {
    log("EXEC_SKIP", `${setup.pair} ${setup.side} @ ${setup.entry} — --execute not set (monitor mode)`);
    return;
  }

  const slNum = parseFloat(setup.sl);
  const tpNum = parseFloat(setup.tp);
  const entryNum = parseFloat(setup.entry);

  // ═══ SAFETY: Validate SL/TP are in reasonable range for this pair ═══
  const guardRange = PRICE_GUARDS[setup.pair];
  if (guardRange) {
    if (slNum < guardRange.min || slNum > guardRange.max) {
      log("SAFETY_BLOCK", `${setup.pair} SL=${slNum} outside ${guardRange.label} range [${guardRange.min}-${guardRange.max}] — REJECTED (probable data contamination)`);
      return;
    }
    if (tpNum < guardRange.min || tpNum > guardRange.max) {
      log("SAFETY_BLOCK", `${setup.pair} TP=${tpNum} outside ${guardRange.label} range [${guardRange.min}-${guardRange.max}] — REJECTED (probable data contamination)`);
      return;
    }
    // SL and TP must be on opposite sides of entry
    if (setup.side === "LONG") {
      if (slNum >= entryNum) { log("SAFETY_BLOCK", `${setup.pair} LONG but SL ${slNum} >= entry ${entryNum} — REJECTED`); return; }
      if (tpNum <= entryNum) { log("SAFETY_BLOCK", `${setup.pair} LONG but TP ${tpNum} <= entry ${entryNum} — REJECTED`); return; }
    } else if (setup.side === "SHORT") {
      if (slNum <= entryNum) { log("SAFETY_BLOCK", `${setup.pair} SHORT but SL ${slNum} <= entry ${entryNum} — REJECTED`); return; }
      if (tpNum >= entryNum) { log("SAFETY_BLOCK", `${setup.pair} SHORT but TP ${tpNum} >= entry ${entryNum} — REJECTED`); return; }
    }
  }

  // ═══ SAFETY: Don't execute if SL or TP is zero ═══
  if (slNum === 0 || tpNum === 0 || isNaN(slNum) || isNaN(tpNum) || entryNum === 0 || isNaN(entryNum)) {
    log("SAFETY_BLOCK", `${setup.pair} Invalid levels — entry:${setup.entry} SL:${setup.sl} TP:${setup.tp} — REJECTED`);
    return;
  }

  // Use broker-prefixed symbol for TV
  const tvSymbol = TV_SYMBOLS[setup.pair] || setup.pair;
  const direction = setup.side === "LONG" ? "BUY" : "SELL";
  const qty = setup.qty || (setup.pair === "NAS100" || setup.pair === "XAUUSD" ? 1 : 5000);
  const cmd = `node "${path.join(ROOT, "tools", "tv-mcp", "market_order.cjs")}" ${tvSymbol} ${direction} ${setup.sl} ${setup.tp} ${qty}`;
  log("EXECUTING", `${setup.pair} (TV:${tvSymbol}) ${direction} Qty:${qty} SL:${setup.sl} TP:${setup.tp}${setup.secondChance ? ' [SECOND CHANCE 0.5x]' : ''}`);

  const result = run(cmd, 30000);
  if (result && (result.includes("Verified") || result.includes("filled"))) {
    log("TRADE_EXECUTED", `${setup.pair} ${direction} ${qty} — VERIFIED ✅`);
    // Track this position for pyramid monitoring
    activePositions.push({ pair: setup.pair, direction, entry: entryNum, sl: slNum, tp: tpNum, qty, pyramidAdded: [] });
    saveState();

    // ═══ AUTO-JOURNAL ═══
    const journalFile = path.join(ROOT, "shared", DATE, "decision_journal.md");
    const ts = nyTime();
    const reason = `${setup.model} | R:R ${setup.rr}:1 | Coh: ${setup.coh}/100`;
    const entry = `| ${ts} NY | TRADE_EXECUTED | ${setup.pair} ${direction} ${qty} @ ${entryNum} | ${reason} |`;
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

// ═══ PYRAMID MONITOR — Auto-add at IOFED levels ═══
const STATE_FILE = path.join(ROOT, "shared", DATE, "pyramid_state.json");
let activePositions = [];
let pyramidFilled = {}; // Track which levels were already added

// Load previous state (survives scheduler restarts)
try {
  if (fs.existsSync(STATE_FILE)) {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    activePositions = state.positions || [];
    pyramidFilled = state.filled || {};
    if (activePositions.length > 0) log("STATE_LOADED", `${activePositions.length} positions restored, ${Object.keys(pyramidFilled).length} pyramid levels filled`);
  }
} catch {}
function saveState() {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify({ positions: activePositions, filled: pyramidFilled })); } catch {}
}

function checkPyramidLevels() {
  if (activePositions.length === 0) return;

  for (const pos of activePositions) {
    // Get current price from the latest engine data
    let currentPrice = 0;
    try {
      const dir = pos.pair === "XAUUSD" ? "GOLD" : pos.pair;
      const e = JSON.parse(fs.readFileSync(path.join(ROOT, "shared", DATE, dir, "engine_5m.json"), "utf8"));
      currentPrice = e.price;
    } catch { continue; }

    const range = pos.tp - pos.sl;
    if (range <= 0) continue;

    const pyramidLevels = [
      { label: "Far Edge", price: pos.sl + range * 0.25, pct: 0.25 },
      { label: "CE 50%", price: pos.sl + range * 0.50, pct: 0.35 },
      { label: "IOFED Edge", price: pos.sl + range * 0.75, pct: 0.40 },
    ];

    for (const level of pyramidLevels) {
      const key = `${pos.pair}_${level.label}`;
      if (pyramidFilled[key]) continue; // Already added at this level

      if (currentPrice > level.price && pos.direction === "BUY") {
        // Price crossed above pyramid level — ADD
        const addQty = pos.pair === "NAS100" || pos.pair === "XAUUSD" ? 1 : Math.round(pos.qty * level.pct);
        const cmd = `node "${path.join(ROOT, "tools", "tv-mcp", "market_order.cjs")}" ${pos.pair} ${pos.direction} ${pos.sl} ${pos.tp} ${addQty}`;
        log("PYRAMID", `${pos.pair}: ${level.label} @ ${level.price.toFixed(1)} crossed (now ${currentPrice.toFixed(1)}) — adding ${addQty}`);
        const result = run(cmd, 30000);
        if (result && (result.includes("Verified") || result.includes("filled"))) {
          pyramidFilled[key] = true;
          pos.pyramidAdded.push(level.label);
          saveState();
          log("PYRAMID_EXECUTED", `${pos.pair}: +${addQty} at ${level.label} — TOTAL: ${pos.qty + pos.pyramidAdded.length} contracts`);

          // Auto-journal pyramid add
          const jf = path.join(ROOT, "shared", DATE, "decision_journal.md");
          try { fs.appendFileSync(jf, `| ${nyTime()} NY | PYRAMID_ADD | ${pos.pair} ${pos.direction} +${addQty} @ ${level.label} (${level.price.toFixed(1)}) | Price: ${currentPrice.toFixed(1)} |\n`); } catch {}
        }
      }
    }
  }
}

// ═══ MAIN CYCLE ═══
async function runCycle() {
  const now = nyMins();
  const nyH = nyHour();
  const dayOfWeek = new Date().getDay();

  // Heartbeat — tells phase-based drivers (and humans) the scheduler owns execution.
  guard.markActive(EXECUTE ? "EXECUTE" : "MONITOR", { pairs: PAIRS.length });

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
      const refreshOk = refreshData();
      if (!refreshOk) {
        log("SAFETY", "Session startup FAILED — skipping scan to avoid contaminated data");
        if (ONCE) return;
        setTimeout(runCycle, 300000); // Retry in 5 min
        return;
      }
      scanAll();
    }
  }

  // ═══ EVERY CYCLE: Scan for setups + check pyramid levels ═══
  if (inActiveSession || inPreMarket) {
    const best = scanAll();
    if (best) executeTrade(best);
    checkPyramidLevels(); // Auto-add at crossed IOFED levels
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
