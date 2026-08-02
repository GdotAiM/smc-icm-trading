// NY AM Autonomous Session — 09:50 NY-AM Macro → Silver Bullet (10:00-11:00)
// Fires at the 09:50 ⭐⭐ macro, runs through the Silver Bullet window
// Usage: node tools/tv-mcp/ny_am_autonomous.cjs

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "../..");
const DATE = new Date().toISOString().split("T")[0];
const SESSION_DIR = path.join(ROOT, "shared", DATE);
const LOG_FILE = path.join(SESSION_DIR, "ny_am_autonomous_log.jsonl");
const DECISION_FILE = path.join(SESSION_DIR, "ny_am_decision_journal.md");

const PAIRS = ["EURUSD", "GBPUSD", "XAUUSD", "NAS100"];
const MAX_POSITIONS = 1;     // Friday — single position only
const RISK_PER_TRADE = 0.5;   // Friday — half risk
const MIN_COHERENCE = 7;
const MIN_RR = 1.0;

function log(entry) {
  const line = { time: new Date().toISOString(), nyTime: getNYTime(), ...entry };
  fs.appendFileSync(LOG_FILE, JSON.stringify(line) + "\n");
  console.log(`[${line.nyTime}] ${entry.event}: ${entry.detail || ""}`);
}

function getNYTime() {
  return new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false });
}

function decisionLog(entry) {
  const ts = getNYTime();
  const line = `| ${ts} NY | ${entry.event} | ${entry.detail} | ${entry.reasoning || ""} |`;
  fs.appendFileSync(DECISION_FILE, line + "\n");
  console.log(`  📋 ${line}`);
}

function run(cmd, timeoutMs) {
  try {
    const t = timeoutMs || 60000;
    return execSync(cmd, { encoding: "utf8", timeout: t, stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) {
    return null;
  }
}

// ═══════════════ MAIN ═══════════════
console.log("══════════════════════════════════════════════");
console.log("  NY AM AUTONOMOUS — 09:50 Macro → SB Window");
console.log("  " + DATE + " | " + getNYTime() + " NY");
console.log("══════════════════════════════════════════════\n");

fs.mkdirSync(SESSION_DIR, { recursive: true });

// Initialize decision journal
if (!fs.existsSync(DECISION_FILE)) {
  fs.writeFileSync(DECISION_FILE, `# NY AM Autonomous Decision Journal — ${DATE}\n\n09:50 NY-AM Macro → Silver Bullet (10:00-11:00)\n\n| Time (NY) | Event | Detail | Reasoning |\n|-----------|-------|--------|----------|\n`);
}

// ═══ PHASE 1: Fresh Data ═══
log({ event: "PHASE_1", detail: "Refreshing data for 09:50 macro" });
decisionLog({ event: "SESSION_START", detail: "NY AM Autonomous session starting. Friday ×0.5 risk, max 1 position.", reasoning: "09:50 NY-AM Macro ⭐⭐ (reliability 1.0). Silver Bullet window 10:00-11:00." });

const refreshStart = Date.now();
run(`node "${path.join(ROOT, "tools", "session_start.cjs")}"`, 300000);
const refreshSec = ((Date.now() - refreshStart) / 1000).toFixed(0);
log({ event: "DATA_REFRESHED", detail: `${refreshSec}s` });
decisionLog({ event: "DATA_REFRESH", detail: `Fresh candles + engines + forecasts for all pairs (${refreshSec}s)`, reasoning: "Data must be <5min old for valid decisions." });

// ═══ PHASE 2: Run Pipeline — All Pairs ═══
log({ event: "PHASE_2", detail: "Running pipeline on all pairs" });

const results = {};
for (const pair of PAIRS) {
  log({ event: "PIPELINE", detail: pair });
  const output = run(`node "${path.join(ROOT, "tools", "run_pair.cjs")}" ${pair}`, 120000);
  if (output) console.log(output.split("\n").filter(l => l.includes("Model:") || l.includes("Entry:") || l.includes("R:R") || l.includes("Coherence") || l.includes("READY") || l.includes("BLOCKED")).join("\n"));
  results[pair] = output;
}

// ═══ PHASE 3: Evaluate Setups ═══
log({ event: "PHASE_3", detail: "Evaluating setups" });

const setups = [];
for (const pair of PAIRS) {
  try {
    // Read the model selection output
    const modelsFile = path.join(ROOT, "stages", "04_model_selection", "output", `${pair.toLowerCase()}_active_models.md`);
    const entryFile = path.join(ROOT, "stages", "05_entry_refinement", "output", `${pair.toLowerCase()}_entry_plan.md`);
    const coherenceFile = path.join(ROOT, "stages", "05b_micro_confirmation", "output", `${pair.toLowerCase()}_coherence.md`);

    if (!fs.existsSync(modelsFile)) continue;

    const modelsMd = fs.readFileSync(modelsFile, "utf8");
    const entryMd = fs.existsSync(entryFile) ? fs.readFileSync(entryFile, "utf8") : "";
    const cohMd = fs.existsSync(coherenceFile) ? fs.readFileSync(coherenceFile, "utf8") : "";

    // Extract primary model
    const primaryMatch = modelsMd.match(/\| \*\*(.+?)\*\* \| (.+?) \| ★ PRIMARY/);
    const primaryModel = primaryMatch ? primaryMatch[1].trim() : "Unknown";
    const primaryScore = primaryMatch ? primaryMatch[2].trim() : "?";

    // Extract direction
    const dirMatch = entryMd.match(/\*\*Direction\*\*: \*\*(.+?)\*\*/);
    const direction = dirMatch ? dirMatch[1] : "NEUTRAL";

    // Extract entry/SL/TP
    const entryMatch = entryMd.match(/\| Entry \| (.+?) \|/);
    const slMatch = entryMd.match(/\| SL \| (.+?) \|/);
    const tp1Match = entryMd.match(/\| TP1 \| (.+?) \|/);
    const rrMatch = entryMd.match(/R:R TP1\*\*: (.+?):1/);

    // Extract coherence
    const cohMatch = cohMd.match(/\*\*(\d+)\/10\*\*/);
    const coherence = cohMatch ? parseInt(cohMatch[1]) : 0;

    // Check for guard blocks
    const blocked = (results[pair] || "").includes("BLOCKED by");
    const blockedBy = blocked ? ((results[pair] || "").match(/BLOCKED by: (.+)/) || [])[1] : "";

    // Check for lecture overrides
    const l2Override = entryMd.includes("Lecture 2 Override ACTIVE");
    const l1Override = entryMd.includes("Lecture 1 Override ACTIVE");
    const l4Override = entryMd.includes("Lecture 4 Override ACTIVE");

    const setup = {
      pair, primaryModel, primaryScore, direction, coherence, blocked, blockedBy,
      l2Override, l1Override, l4Override,
      entry: entryMatch ? parseFloat(entryMatch[1]) : null,
      sl: slMatch ? parseFloat(slMatch[1]) : null,
      tp1: tp1Match ? parseFloat(tp1Match[1]) : null,
      rr: rrMatch ? parseFloat(rrMatch[1]) : 0,
    };

    setups.push(setup);
    log({
      event: "SETUP",
      detail: `${pair}: ${direction} | ${primaryModel} (${primaryScore}) | R:R ${setup.rr.toFixed(1)}:1 | Coh: ${coherence}/10 | ${blocked ? '🛑 ' + blockedBy : '✅'} | ${l2Override ? 'L2 ' : ''}${l1Override ? 'L1 ' : ''}${l4Override ? 'L4 ' : ''}`
    });
  } catch (e) {
    log({ event: "SETUP_ERROR", detail: pair + ": " + e.message.slice(0, 80) });
  }
}

// ═══ PHASE 4: Select & Execute ═══
log({ event: "PHASE_4", detail: "Trade selection" });

// Filter tradeable setups
const tradeable = setups.filter(s =>
  !s.blocked &&
  s.direction !== "NEUTRAL" &&
  s.coherence >= MIN_COHERENCE &&
  s.rr >= MIN_RR &&
  s.entry && s.sl && s.tp1
);

// Prefer lecture-ready setups
const lectureReady = tradeable.filter(s => s.l2Override || s.l1Override || s.l4Override);
const candidates = lectureReady.length > 0 ? lectureReady : tradeable;

// Sort by coherence then R:R
candidates.sort((a, b) => (b.coherence * b.rr) - (a.coherence * a.rr));

decisionLog({ event: "SETUP_SCAN", detail: `${setups.length} pairs scanned | ${tradeable.length} tradeable | ${lectureReady.length} lecture-ready`, reasoning: `Candidates: ${candidates.map(c => c.pair + ' ' + c.direction + '(' + c.primaryModel + ')').join(', ') || 'none'}` });

if (candidates.length === 0) {
  decisionLog({ event: "NO_TRADE", detail: "No setups meet criteria", reasoning: `Filter: coherence≥${MIN_COHERENCE}, R:R≥${MIN_RR}, direction≠NEUTRAL, not blocked` });
} else {
  const pick = candidates[0];
  decisionLog({ event: "TRADE_SELECTED", detail: `${pick.pair} ${pick.direction} | Model: ${pick.primaryModel} (${pick.primaryScore}) | Entry: ${pick.entry} SL: ${pick.sl} TP1: ${pick.tp1} | R:R ${pick.rr.toFixed(1)}:1 | Coh: ${pick.coherence}/10`, reasoning: `Highest coherence×RR score. ${pick.l2Override ? 'Lecture 2 override active. ' : ''}${pick.l1Override ? 'Lecture 1 override active. ' : ''}${pick.l4Override ? 'Lecture 4 override active. ' : ''}Friday ×${RISK_PER_TRADE} risk.` });

  // Calculate position size based on risk
  const riskPips = Math.abs(pick.entry - pick.sl);
  const accountBalance = 10000;
  const riskAmount = accountBalance * (RISK_PER_TRADE / 100);
  const riskPerPip = 10; // $10/pip for standard lot on GBPUSD
  const posSizeLots = riskPips > 0 ? riskAmount / (riskPips * riskPerPip) : 0;

  // Scale to appropriate lot type
  let qty;
  if (posSizeLots >= 0.1) {
    qty = Math.round(posSizeLots * 100); // Convert to units (100 = 0.1 std lot)
  } else {
    qty = Math.round(posSizeLots * 1000); // Micro lots
  }
  if (qty < 100) qty = 100; // Minimum

  log({ event: "EXECUTING", detail: `${pick.pair} ${pick.direction} Qty: ${qty} Entry: ${pick.entry} SL: ${pick.sl} TP: ${pick.tp1}` });

  // Execute via CDP
  const tradeCmd = `node "${path.join(ROOT, "tools", "tv-mcp", "market_order.cjs")}" ${pick.pair} ${pick.direction} ${pick.sl.toFixed(5)} ${pick.tp1.toFixed(5)} ${qty}`;
  decisionLog({ event: "EXECUTE_CMD", detail: tradeCmd, reasoning: "Placing market order via TV CDP" });

  const tradeResult = run(tradeCmd, 30000);
  if (tradeResult) {
    decisionLog({ event: "TRADE_EXECUTED", detail: `${pick.pair} ${pick.direction} ${qty} units @ ~${pick.entry}`, reasoning: tradeResult.substring(0, 100) });
    log({ event: "TRADE_PLACED", detail: tradeResult.substring(0, 200) });
  } else {
    decisionLog({ event: "TRADE_FAILED", detail: "Order placement returned null", reasoning: "TV CDP may be busy or order form not responding" });
  }

  // Verify position
  setTimeout(() => {
    const verify = run(`node "${path.join(ROOT, "tools", "tv-mcp", "check_orders.cjs")}"`, 15000);
    if (verify) {
      decisionLog({ event: "VERIFY", detail: verify.substring(0, 200), reasoning: "Post-execution position check" });
    }
  }, 5000);
}

// ═══ PHASE 5: Document ═══
log({ event: "PHASE_5", detail: "Documenting session" });

// Rebuild graph
run(`node "${path.join(ROOT, "tools", "trade_graph.cjs")}" --rebuild`, 15000);
log({ event: "GRAPH_REBUILT" });

// Extract lessons
run(`node "${path.join(ROOT, "tools", "ict_continuous_learn.cjs")}" --run`, 15000);
log({ event: "LEARN_EXTRACTED" });

console.log("\n══════════════════════════════════════════════");
console.log("  SESSION COMPLETE");
console.log("  Log: " + LOG_FILE);
console.log("  Decisions: " + DECISION_FILE);
console.log("══════════════════════════════════════════════");
