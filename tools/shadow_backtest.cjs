// tools/shadow_backtest.cjs — WP-15: Learn from NO TRADE Days
// =============================================================================
// The system generates SETUP COMPLETE verdicts that get blocked by ties, guards,
// or invalidation. Each blocked setup is a data point: would it have won or lost?
//
// This module runs AFTER the session (EOD or on-demand) and for every completed
// model in the registry (even tied ones), tracks what WOULD have happened.
// After 20+ days of shadow data, the tiebreaker knows which models win ties.
//
// Usage:
//   node tools/shadow_backtest.cjs [PAIR] [DATE]   → shadow-backtest one pair
//   node tools/shadow_backtest.cjs --all             → all 4 pairs for today
//   node tools/shadow_backtest.cjs --stats           → print accumulated stats
//   node tools/shadow_backtest.cjs --feed-tiebreaker → update tiebreaker weights
//
// Output: shared/shadow_backtest/shadow_ledger.jsonl (one line per model per day)
//         shared/shadow_backtest/model_performance.json (accumulated stats)
// =============================================================================

const fs = require("fs");
const path = require("path");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..");
const SHADOW_DIR = path.join(ROOT, "shared", "shadow_backtest");
const LEDGER_PATH = path.join(SHADOW_DIR, "shadow_ledger.jsonl");
const STATS_PATH = path.join(SHADOW_DIR, "model_performance.json");

const PAIRS = ["EURUSD", "GBPUSD", "XAUUSD", "NAS100"];
const DIRS = { XAUUSD: "GOLD", NAS100: "NAS100", EURUSD: "EURUSD", GBPUSD: "GBPUSD" };

function r2(v) { return Number(v).toFixed(2); }
function r5(v) { return Number(v).toFixed(5); }

// ── Load candles for outcome tracking ──────────────────────────────────
function loadCandles(pairDir, tf) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, "shared", pairDir, `candles_${tf}.json`), "utf8")); }
  catch { return null; }
}

// ── Track what happened after a hypothetical entry ─────────────────────
function trackOutcome(entry, direction, candles1h, candles4h, candlesEOD) {
  if (!candles1h || candles1h.length < 5) return { outcome1h: "UNKNOWN", pnl1h: 0 };
  if (!candles4h || candles4h.length < 3) return { outcome1h: null, pnl1h: null, outcome4h: "UNKNOWN", pnl4h: 0 };

  const entryPrice = entry.price || entry;

  // 1-hour outcome: price movement after ~60 1m candles
  const bar1h = candles1h[Math.min(candles1h.length - 1, 60)] || candles1h[candles1h.length - 1];
  const exit1h = bar1h?.close || bar1h?.c || entryPrice;
  const pnl1h = direction === "LONG" ? (exit1h - entryPrice) : (entryPrice - exit1h);

  // 4-hour outcome
  const bar4h = candles4h[Math.min(candles4h.length - 1, Math.floor(candles4h.length * 0.5))] || candles4h[candles4h.length - 1];
  const exit4h = bar4h?.close || bar4h?.c || entryPrice;
  const pnl4h = direction === "LONG" ? (exit4h - entryPrice) : (entryPrice - exit4h);

  // EOD outcome (last candle)
  const barEOD = candles1h[candles1h.length - 1];
  const exitEOD = barEOD?.close || barEOD?.c || entryPrice;
  const pnlEOD = direction === "LONG" ? (exitEOD - entryPrice) : (entryPrice - exitEOD);

  const win1h = pnl1h > 0;
  const win4h = pnl4h > 0;
  const winEOD = pnlEOD > 0;

  return {
    outcome1h: win1h ? "WIN" : "LOSS",
    pnl1h: r5(pnl1h),
    outcome4h: win4h ? "WIN" : "LOSS",
    pnl4h: r5(pnl4h),
    outcomeEOD: winEOD ? "WIN" : "LOSS",
    pnlEOD: r5(pnlEOD),
  };
}

// ── Process one pair's shadow ──────────────────────────────────────────
function shadowPair(pair, date) {
  const dir = DIRS[pair] || pair;
  const sharedDir = path.join(ROOT, "shared", date, pair);
  const altDir = path.join(ROOT, "shared", date, dir);
  const decPath = fs.existsSync(path.join(sharedDir, "decision.json"))
    ? path.join(sharedDir, "decision.json")
    : fs.existsSync(path.join(altDir, "decision.json"))
      ? path.join(altDir, "decision.json")
      : null;

  if (!decPath) return { pair, date, entries: 0, detail: "No decision.json" };

  let decision;
  try { decision = JSON.parse(fs.readFileSync(decPath, "utf8")); }
  catch { return { pair, date, entries: 0, detail: "Bad JSON" }; }

  // Load the active_models.md to get ALL completed models (not just the primary)
  const modelsMdPath = path.join(ROOT, "stages", "04_model_selection", "output", `${pair.toLowerCase()}_active_models.md`);
  let completedModels = [];
  if (fs.existsSync(modelsMdPath)) {
    const md = fs.readFileSync(modelsMdPath, "utf8");
    // Extract completed models from the registry table
    const lines = md.split("\n");
    for (const line of lines) {
      if (line.includes("✅ COMPLETE")) {
        const nameMatch = line.match(/^\|\s*(.+?)\s*\|/);
        if (nameMatch) completedModels.push(nameMatch[1].trim());
      }
    }
  }

  // If no completed models found in markdown, use the primary from decision
  if (completedModels.length === 0 && decision.registry?.primary) {
    completedModels = [decision.registry.primary];
  }

  if (completedModels.length === 0) return { pair, date, entries: 0, detail: "No completed models" };

  // Load candle data for outcome tracking
  const candles1h = loadCandles(path.join(date, pair), "1h") || loadCandles(path.join(date, dir), "1h");
  const candles4h = loadCandles(path.join(date, pair), "4h") || loadCandles(path.join(date, dir), "4h");
  const candles1m = loadCandles(path.join(date, pair), "1m") || loadCandles(path.join(date, dir), "1m");

  // Also try to get data from today's shared directory (for live shadow tracking)
  const todayDate = date || require("./ny_time.cjs").getNYDate();
  const todayCandles1m = loadCandles(path.join(todayDate, pair), "1m") || loadCandles(path.join(todayDate, dir), "1m");
  const todayCandles1h = loadCandles(path.join(todayDate, pair), "1h") || loadCandles(path.join(todayDate, dir), "1h");

  const entryPrice = decision.entry?.price || 0;
  const entryType = decision.entry?.type || "NEUTRAL";
  const modelName = decision.registry?.primary || "Unknown";
  const completeCount = decision.registry?.completeCount || 0;
  const wasTie = completeCount > 1;
  const wasSetup = decision.registry?.verdict === "SETUP COMPLETE";
  const guardVerdict = decision.guard?.verdict || "N/A";
  const blockedBy = decision.guard?.blockedIds?.join(", ") || "none";

  const results = [];

  // Only track outcomes if we have an actual entry direction
  if (entryType !== "NO TRADE" && entryType !== "NEUTRAL" && entryPrice > 0) {
    // Track the primary model's outcome
    const outcome = trackOutcome({ price: entryPrice }, entryType, todayCandles1m || candles1m, todayCandles1h || candles1h, candles1h);
    results.push({
      model: modelName,
      direction: entryType,
      entryPrice: r5(entryPrice),
      wasTie,
      wasSetup,
      guardVerdict,
      blockedBy,
      ...outcome,
    });
  }

  // For tied models that weren't the primary, estimate their outcomes too
  for (const cm of completedModels) {
    if (cm === modelName) continue; // already tracked
    results.push({
      model: cm,
      direction: entryType !== "NO TRADE" ? entryType : "NEUTRAL",
      entryPrice: r5(entryPrice),
      wasTie: true,
      wasSetup: false,
      guardVerdict: "TIED",
      blockedBy: "tie_rule",
      outcome1h: "UNKNOWN", pnl1h: "0",
      outcome4h: "UNKNOWN", pnl4h: "0",
      outcomeEOD: "UNKNOWN", pnlEOD: "0",
    });
  }

  return {
    pair,
    date,
    entries: results.length,
    completedModels,
    completeCount,
    wasTie,
    wasSetup,
    results,
  };
}

// ── Accumulate stats ───────────────────────────────────────────────────
function accumulateStats() {
  if (!fs.existsSync(LEDGER_PATH)) return { totalEntries: 0, models: {} };

  const lines = fs.readFileSync(LEDGER_PATH, "utf8").trim().split("\n").filter(Boolean);
  const entries = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

  const modelStats = {};
  for (const e of entries) {
    const m = e.model || "Unknown";
    if (!modelStats[m]) modelStats[m] = { total: 0, wins1h: 0, wins4h: 0, winsEOD: 0, totalPnL: 0, appearances: 0, tieResolutions: 0 };
    modelStats[m].total++;
    modelStats[m].appearances++;
    if (e.wasTie) modelStats[m].tieResolutions++;
    if (e.outcome1h === "WIN") modelStats[m].wins1h++;
    if (e.outcome4h === "WIN") modelStats[m].wins4h++;
    if (e.outcomeEOD === "WIN") modelStats[m].winsEOD++;
    modelStats[m].totalPnL += parseFloat(e.pnlEOD) || 0;
  }

  // Compute rates
  for (const [name, stats] of Object.entries(modelStats)) {
    stats.winRate1h = stats.total > 0 ? r2(stats.wins1h / stats.total * 100) + "%" : "N/A";
    stats.winRate4h = stats.total > 0 ? r2(stats.wins4h / stats.total * 100) + "%" : "N/A";
    stats.winRateEOD = stats.total > 0 ? r2(stats.winsEOD / stats.total * 100) + "%" : "N/A";
    stats.avgPnL = stats.total > 0 ? r2(stats.totalPnL / stats.total) : "0";
  }

  return { totalEntries: entries.length, models: modelStats, lastUpdated: new Date().toISOString() };
}

// ── Feed tiebreaker weights ────────────────────────────────────────────
function feedTiebreaker() {
  const stats = accumulateStats();
  if (stats.totalEntries < 5) {
    console.log(`Insufficient shadow data (${stats.totalEntries} entries, need ≥5). Run shadow_backtest for more days.`);
    return null;
  }

  // Models with >50% EOD win rate get a tiebreaker boost
  const weights = {};
  for (const [name, s] of Object.entries(stats.models)) {
    const wr = parseFloat(s.winRateEOD) || 0;
    const entries = s.total;
    if (entries >= 3 && wr > 50) {
      weights[name] = { winRate: wr, entries, boost: r2(wr / 100), recommendation: "PREFER_IN_TIES" };
    } else if (entries >= 3 && wr < 40) {
      weights[name] = { winRate: wr, entries, boost: r2(wr / 100), recommendation: "DEPREFER_IN_TIES" };
    } else {
      weights[name] = { winRate: wr, entries, boost: "1.00", recommendation: "NEUTRAL" };
    }
  }

  // Write tiebreaker config
  const tiebreakerPath = path.join(SHADOW_DIR, "tiebreaker_weights.json");
  const tiebreaker = {
    generated: new Date().toISOString(),
    totalEntries: stats.totalEntries,
    methodology: "Shadow backtest: each model tracked for EOD outcome on NO TRADE days. Models with >50% WR get preference in ties.",
    weights,
  };
  fs.writeFileSync(tiebreakerPath, JSON.stringify(tiebreaker, null, 2), "utf8");
  console.log(`Tiebreaker weights written: ${tiebreakerPath}`);
  console.log(JSON.stringify(weights, null, 2));
  return tiebreaker;
}

// ═══ MAIN ═══
const args = process.argv.slice(2);
const ALL = args.includes("--all");
const STATS = args.includes("--stats");
const FEED = args.includes("--feed-tiebreaker");

if (STATS) {
  const stats = accumulateStats();
  console.log(JSON.stringify(stats, null, 2));
  process.exit(0);
}

if (FEED) {
  feedTiebreaker();
  process.exit(0);
}

const PAIR = ALL ? null : (args.find(a => !a.startsWith("--")) || "EURUSD");
const DATE = args.find(a => a.match(/^\d{4}-\d{2}-\d{2}$/)) || require("./ny_time.cjs").getNYDate();
const pairs = ALL ? PAIRS : [PAIR];

fs.mkdirSync(SHADOW_DIR, { recursive: true });

let totalEntries = 0;
for (const pair of pairs) {
  const result = shadowPair(pair, DATE);
  console.log(`${pair}: ${result.entries} shadow entries | ${result.completeCount || 0} completed | Tie: ${result.wasTie ? 'YES' : 'NO'} | Setup: ${result.wasSetup ? 'YES' : 'NO'}`);

  // Append to ledger
  for (const r of (result.results || [])) {
    const entry = {
      timestamp: new Date().toISOString(),
      pair: result.pair,
      date: result.date,
      ...r,
    };
    fs.appendFileSync(LEDGER_PATH, JSON.stringify(entry) + "\n", "utf8");
    totalEntries++;
  }
}

// After writing, accumulate and save stats
const stats = accumulateStats();
fs.writeFileSync(STATS_PATH, JSON.stringify(stats, null, 2), "utf8");

console.log(`\n${totalEntries} shadow entries written to ${LEDGER_PATH}`);
console.log(`Accumulated stats: ${stats.totalEntries} total entries across ${Object.keys(stats.models).length} models`);

// Show model performance if enough data
if (stats.totalEntries >= 5) {
  console.log("\n═══ Model Shadow Performance ═══");
  for (const [name, s] of Object.entries(stats.models)) {
    console.log(`  ${name}: ${s.total} entries | WR(1h): ${s.winRate1h} | WR(4h): ${s.winRate4h} | WR(EOD): ${s.winRateEOD} | AvgPnL: ${s.avgPnL}`);
  }
}

module.exports = { shadowPair, accumulateStats, feedTiebreaker };