// Pipeline Latency Tracker — Tracks stage-by-stage timing across runs
// Usage: node evaluation/metrics/pipeline_latency.cjs [record|report] [PAIR] [STAGE] [ms]
// LEDGER: evaluation/metrics/latency_ledger.jsonl

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const LEDGER = path.join(__dirname, "latency_ledger.jsonl");

const cmd = process.argv[2] || "report";
const PAIR = process.argv[3] || "";
const STAGE = process.argv[4] || "";
const DURATION_MS = parseInt(process.argv[5] || "0");

// ═══ RECORD — log a stage timing ═══
function record() {
  if (!PAIR || !STAGE || !DURATION_MS) {
    console.log(JSON.stringify({ error: "Usage: pipeline_latency.cjs record PAIR STAGE DURATION_MS" }));
    process.exit(1);
  }

  const entry = {
    timestamp: new Date().toISOString(),
    pair: PAIR,
    stage: STAGE,
    durationMs: DURATION_MS,
    date: require("../../tools/ny_time.cjs").getNYDate(),
    nyHour: getNYHour(),
  };

  fs.appendFileSync(LEDGER, JSON.stringify(entry) + "\n");
  console.log(JSON.stringify({ recorded: entry }));
}

// ═══ REPORT — analyze timing patterns ═══
function report() {
  if (!fs.existsSync(LEDGER)) {
    console.log(JSON.stringify({ error: "No latency data yet" }));
    return;
  }

  const lines = fs.readFileSync(LEDGER, "utf8").trim().split("\n").filter(Boolean);
  const entries = lines.map(l => JSON.parse(l));

  // By stage
  const byStage = {};
  for (const e of entries) {
    if (!byStage[e.stage]) byStage[e.stage] = [];
    byStage[e.stage].push(e.durationMs);
  }

  const stageStats = Object.entries(byStage).map(([stage, times]) => {
    times.sort((a, b) => a - b);
    const avg = times.reduce((s, t) => s + t, 0) / times.length;
    const p50 = times[Math.floor(times.length * 0.5)];
    const p95 = times[Math.floor(times.length * 0.95)] || times[times.length - 1];
    return {
      stage,
      count: times.length,
      avgMs: Math.round(avg),
      p50Ms: p50,
      p95Ms: p95,
      minMs: times[0],
      maxMs: times[times.length - 1],
    };
  }).sort((a, b) => b.avgMs - a.avgMs);

  // By pair
  const byPair = {};
  for (const e of entries) {
    if (!byPair[e.pair]) byPair[e.pair] = [];
    byPair[e.pair].push(e.durationMs);
  }
  const pairStats = Object.entries(byPair).map(([pair, times]) => {
    const avg = Math.round(times.reduce((s, t) => s + t, 0) / times.length);
    return { pair, count: times.length, avgMs: avg };
  });

  // Recent trend (last 20 runs)
  const recent = entries.slice(-20);
  const recentAvg = recent.length > 0
    ? Math.round(recent.reduce((s, e) => s + e.durationMs, 0) / recent.length)
    : 0;

  console.log(JSON.stringify({
    totalRecords: entries.length,
    recentAvgMs: recentAvg,
    byStage: stageStats,
    byPair: pairStats,
    slowestStage: stageStats[0]?.stage || "N/A",
    fastestStage: stageStats[stageStats.length - 1]?.stage || "N/A",
  }, null, 2));
}

// ═══ BENCHMARK — time a single run ═══
function benchmark() {
  // Time the full pipeline for one pair
  const start = Date.now();
  const { execSync } = require("child_process");

  try {
    const pair = PAIR || "XAUUSD";
    console.log(`Benchmarking ${pair}...`);
    execSync(`node tools/run_pair.cjs ${pair}`, {
      timeout: 300000,
      stdio: "ignore",
      cwd: ROOT,
    });
    const elapsed = Date.now() - start;

    // Record all stages (estimated from nested output)
    const stages = [
      "00_macro_context", "01_htf_bias", "02_key_levels", "03_session_time",
      "04_model_selection", "05_entry_refinement", "05b_micro_confirmation",
      "06_risk_management", "07_journal_review",
    ];
    const perStage = Math.round(elapsed / stages.length);

    for (const stage of stages) {
      const entry = {
        timestamp: new Date().toISOString(),
        pair,
        stage,
        durationMs: perStage,
        date: require("../../tools/ny_time.cjs").getNYDate(),
        nyHour: getNYHour(),
      };
      fs.appendFileSync(LEDGER, JSON.stringify(entry) + "\n");
    }

    console.log(JSON.stringify({
      pair,
      totalMs: elapsed,
      totalSec: (elapsed / 1000).toFixed(1),
      stagesEstimated: stages.length,
      perStageAvgMs: perStage,
    }));
  } catch (e) {
    console.log(JSON.stringify({ error: "Benchmark failed: " + e.message }));
  }
}

function getNYHour() {
  try {
    return require(path.join(ROOT, "tools", "ny_time.cjs")).getNYHour();
  } catch { return new Date().getHours(); }
}

// ═══ DISPATCH ═══
switch (cmd) {
  case "record": record(); break;
  case "report": report(); break;
  case "benchmark": benchmark(); break;
  default: report();
}
