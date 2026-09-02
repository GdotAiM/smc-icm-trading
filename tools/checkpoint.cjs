#!/usr/bin/env node
// ICT Checkpoint — full cycle: predict → observe → learn → log
// Run at each milestone during live trading sessions
//
// Usage:
//   node tools/checkpoint.cjs                # all pairs, auto time detection
//   node tools/checkpoint.cjs EURUSD         # single pair
//   node tools/checkpoint.cjs --manual       # don't auto-observe (log prediction only)
//
// What it does in order:
//   1. Load engine_1m + liquidity_marker for each pair
//   2. Log prediction if none recent or --manual flag not set
//   3. Observe ALL pending predictions (predict → observe loop)
//   4. Run tape_learn to extract lessons from observations
//   5. Append summary to decision journal

const fs = require("fs");
const path = require("path");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..");
const DATE = require("./ny_time.cjs").getNYDate();
const d = require("./ny_time.cjs");
const nyH = () => d.getNYHour();
const nyM = () => d.getNYMin();
const nyTS = () => `${String(nyH()).padStart(2,"0")}:${String(nyM()).padStart(2,"0")}`;
const DIR_MAP = { XAUUSD: "GOLD" };
const PAIRS = ["EURUSD", "GBPUSD", "XAUUSD", "NAS100"];
const TARGET = process.argv.slice(2).filter(a => !a.startsWith("--"));
const MANUAL = process.argv.includes("--manual");

function dirFor(pair) { return pair === "XAUUSD" ? "GOLD" : pair; }
function readJSON(file) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; } }

function log(msg) { console.log(`[${nyTS()}] ${msg}`); }
function appendJournal(line) {
  const jf = path.join(ROOT, "shared", DATE, "decision_journal.md");
  const header = "| " + nyTS() + " NY | CHECKPOINT | ";
  const timestamped = line.replace(/\| \d+:\d+ NY \|/, header);
  fs.mkdirSync(path.dirname(jf), { recursive: true });
  if (!fs.existsSync(jf)) fs.writeFileSync(jf, "# Decision Journal\n\n", "utf8");
  fs.appendFileSync(jf, timestamped + "\n", "utf8");
}

// ── Step 1: Log predictions ──────────────────────────────────────────────────
function stepPredictions(pair) {
  const dir = dirFor(pair);
  const f = path.join(ROOT, "shared", DATE, dir, "tape_journal.jsonl");
  if (!fs.existsSync(f)) return;
  const lines = fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean);
  const preds = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(e => e && e.kind === "prediction");
  const unobs = preds.filter(p => !p.observed);
  if (unobs.length > 0) return; // already has pending prediction

  // Only auto-predict every 30min (check age of last prediction)
  if (!MANUAL) {
    const lastPred = preds.sort((a, b) => b.ts - a.ts)[0];
    if (lastPred && Date.now() - lastPred.ts < 30 * 60 * 1000) {
      log(`  ${pair}: prediction skipped (last one ${Math.round((Date.now()-lastPred.ts)/60000)}min ago)`);
      return;
    }
  }

  // Run tape_practice start
  const { execSync } = require("child_process");
  try {
    execSync(`node "${path.join(ROOT, "tools", "tape_practice.cjs")}" start ${pair}`, {
      encoding: "utf8", timeout: 15000, stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {}
}

// ── Step 2: Observe all pending predictions ──────────────────────────────────
function stepObserve(pair) {
  if (MANUAL) return;
  const { execSync } = require("child_process");
  try {
    execSync(`node "${path.join(ROOT, "tools", "tape_practice.cjs")}" observe ${pair}`, {
      encoding: "utf8", timeout: 15000, stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {}
}

// ── Step 3: Anticipate time+price ───────────────────────────────────────────
function stepAnticipate(pair) {
  if (MANUAL) return;
  const { execSync } = require("child_process");
  try {
    execSync(`node "${path.join(ROOT, "tools", "tape_anticipate.cjs")}" ${pair}`, {
      encoding: "utf8", timeout: 15000, stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {}
}

// ── Step 4: Narrate the WHY ─────────────────────────────────────────────────
function stepNarrate(pair) {
  if (MANUAL) return;
  const { execSync } = require("child_process");
  try {
    execSync(`node "${path.join(ROOT, "tools", "tape_narrate.cjs")}" ${pair}`, {
      encoding: "utf8", timeout: 15000, stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {}
}

// ── Step 5: Extract lessons ──────────────────────────────────────────────────
function stepLearn(pair) {
  if (MANUAL) return;
  const { execSync } = require("child_process");
  try {
    execSync(`node "${path.join(ROOT, "tools", "tape_learn.cjs")}" ${pair} --force`, {
      encoding: "utf8", timeout: 15000, stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {}
}

// ── Step 4: Compile stats ────────────────────────────────────────────────────
function compileStats(pairs) {
  let summary = [];
  let totalObs = 0, totalC = 0, totalP = 0, totalN = 0;
  let totalLessons = 0;

  for (const pair of pairs) {
    const dir = dirFor(pair);
    const f = path.join(ROOT, "shared", DATE, dir, "tape_journal.jsonl");
    if (!fs.existsSync(f)) continue;
    const lines = fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean);
    let obs = 0, c = 0, p = 0, n = 0;
    for (const l of lines) {
      try {
        const e = JSON.parse(l);
        if (e.kind === "observation") {
          obs++;
          const v = e.verdict || "";
          if (v.includes("CONFIRMED")) c++;
          else if (v.includes("PARTIAL")) p++;
          else if (v.includes("NO CONFIRMATION")) n++;
        }
      } catch {}
    }
    totalObs += obs; totalC += c; totalP += p; totalN += n;
    // Lessons
    const lf = path.join(ROOT, "shared", "performance", `lessons_${pair.toLowerCase()}_${DATE}.json`);
    const les = fs.existsSync(lf) ? JSON.parse(fs.readFileSync(lf, "utf8")) : null;
    const lessonCount = les ? les.lessons.length : 0;
    totalLessons += lessonCount;
    summary.push(`${pair}: ${obs}obs C=${c}(${Math.round(c/obs*100)}%) Ptl=${p}(${Math.round(p/obs*100)}%) N=${n}(${Math.round(n/obs*100)}%) L=${lessonCount}`);
  }

  return { summary, totalObs, totalC, totalP, totalN, totalLessons };
}

// ═══ EXPORTS ══════════════════════════════════════════════════════════════════
module.exports = {
  /** Run one checkpoint cycle for given pairs (or all if none specified) */
  run: (pairsOverride, manualOnly = false) => {
    // Suppress console output when called from auto_scheduler
    const silent = true;
    const _origLog = console.log;
    if (silent) console.log = () => {};

    // Re-derive TARGET manually since require doesn't pass process.argv
    const _targetPairs = pairsOverride || PAIRS;
    const _manual = manualOnly;

    // Run the cycle directly (duplicated logic to avoid circular require issues)
    const d2 = require("./ny_time.cjs");
    const nyts2 = () => `${String(d2.getNYHour()).padStart(2,"0")}:${String(d2.getNYMin()).padStart(2,"0")}`;

    for (const pair of _targetPairs) stepPredictions(pair);
    for (const pair of _targetPairs) stepObserve(pair);
    for (const pair of _targetPairs) stepAnticipate(pair);
    for (const pair of _targetPairs) stepNarrate(pair);   // WHY layer
    for (const pair of _targetPairs) stepLearn(pair);
    const stats = compileStats(_targetPairs);
    appendJournal(`CKPT_${nyts2().replace(":","")}| ${stats.summary.join(" | ")} | C=${stats.totalC}/${stats.totalObs} L=${stats.totalLessons}`);

    console.log = _origLog;
    return stats;
  },
};

// ═══ CLI ENTRY POINT ═════════════════════════════════════════════════════════
if (require.main === module) {
  const session = d.getNYSession();
  const isKillzone = session?.killzone;

  log(`═══════════════════════════════════════════════`);
  log(`  ICT CHECKPOINT — ${DATE} ${nyTS()} NY`);
  log(`  Session: ${session?.name || "?"} | Killzone: ${isKillzone ? "YES" : "no"}`);
  log(`  Mode: ${MANUAL ? "PREDICTION ONLY" : "FULL CYCLE (predict→observe→learn)"}`);
  log(`═══════════════════════════════════════════════\n`);

  const pairs = TARGET.length > 0 && TARGET[0] !== "--manual" ? TARGET : PAIRS;

  for (const pair of pairs) {
    log(`── ${pair} ──`);
    stepPredictions(pair);
    stepObserve(pair);
    stepAnticipate(pair);  // forecast + time window alignment
    stepNarrate(pair);     // WHY layer — Q1-Q5 narrative
    stepLearn(pair);
  }

  const stats = compileStats(pairs);
  log("");
  log(`── SUMMARY ──`);
  for (const s of stats.summary) log(`  ${s}`);
  log(`  TOTAL: ${stats.totalObs} obs | C=${stats.totalC}(${Math.round(stats.totalC/stats.totalObs*100)}%) Ptl=${stats.totalP}(${Math.round(stats.totalP/stats.totalObs*100)}%) N=${stats.totalN}(${Math.round(stats.totalN/stats.totalObs*100)}%) | ${stats.totalLessons} lessons`);
  log("");
  log(`Logged to decision_journal.md`);
}
