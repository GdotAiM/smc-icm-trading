// Regression Suite — Full test suite for SMC-ICM trading system
// Usage: node evaluation/regression/suite.cjs [--ci]
// Verifies: module loading, data integrity, engine output, tool contracts

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "../..");
const PASS = "✅";
const FAIL = "❌";
const SKIP = "⏭️";

let passed = 0, failed = 0, skipped = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    results.push({ name, status: "PASS" });
    console.log(`${PASS} ${name}`);
  } catch (e) {
    failed++;
    results.push({ name, status: "FAIL", error: e.message });
    console.log(`${FAIL} ${name} — ${e.message}`);
  }
}

function skipTest(name, reason) {
  skipped++;
  results.push({ name, status: "SKIP", reason });
  console.log(`${SKIP} ${name} — ${reason}`);
}

// ═══════════════════════════════════════════════════
// 1. MODULE LOADING — all tools must require() without error
// ═══════════════════════════════════════════════════
console.log("\n═══ MODULE LOADING ═══");

const CRITICAL_TOOLS = [
  "tools/ny_time.cjs",
  "tools/coherence_audit.cjs",
  "tools/invalidation.cjs",
  "tools/ict_decision_validator.cjs",
  "tools/performance_ledger.cjs",
  "tools/ict_continuous_learn.cjs",
  "tools/pipeline/coherence_calculator.cjs",
  "tools/inducement_engine.cjs",
  "tools/weekly_profile_engine.cjs",
  "evaluation/resilience/corrupt_detector.cjs",
  "evaluation/judge/llm_judge.cjs",
  "evaluation/metrics/output_quality.cjs",
  "evaluation/benchmarks/bias_accuracy/scorer.cjs",
  "evaluation/traces/session_tracer.cjs",
];

for (const tool of CRITICAL_TOOLS) {
  const toolPath = path.join(ROOT, ...tool.split("/"));
  test(`Load: ${tool}`, () => {
    if (!fs.existsSync(toolPath)) throw new Error(`File not found: ${toolPath}`);
    // Use node --check for static validation; some tools auto-execute on require
    execSync(`node --check "${toolPath}"`, { timeout: 5000, stdio: "ignore" });
  });
}

// ═══════════════════════════════════════════════════
// 2. DATA INTEGRITY — verify engine data structure
// ═══════════════════════════════════════════════════
console.log("\n═══ DATA INTEGRITY ═══");

const DATE = require("../../tools/ny_time.cjs").getNYDate();
const PAIRS = [
  { name: "XAUUSD", dir: "GOLD" },
  { name: "EURUSD", dir: "EURUSD" },
  { name: "GBPUSD", dir: "GBPUSD" },
  { name: "NAS100", dir: "NAS100" },
];

for (const { name, dir } of PAIRS) {
  test(`Engine data: ${name} has 7 timeframe reports`, () => {
    const tfs = ["1w", "1d", "4h", "1h", "15m", "5m", "1m"];
    for (const tf of tfs) {
      const f = path.join(ROOT, "shared", DATE, dir, `engine_${tf}.json`);
      if (!fs.existsSync(f)) throw new Error(`Missing engine_${tf}.json`);
      const engine = JSON.parse(fs.readFileSync(f, "utf8"));
      if (!engine.structure) throw new Error(`No structure in engine_${tf}.json`);
      if (!engine.structure.bias) throw new Error(`No bias in engine_${tf}.json`);
    }
  });

  test(`Candle data: ${name} has 7 timeframe candle files`, () => {
    const tfs = ["1w", "1d", "4h", "1h", "15m", "5m", "1m"];
    for (const tf of tfs) {
      const f = path.join(ROOT, "shared", DATE, dir, `candles_${tf}.json`);
      if (!fs.existsSync(f)) throw new Error(`Missing candles_${tf}.json`);
      const candles = JSON.parse(fs.readFileSync(f, "utf8"));
      const keys = Object.keys(candles).filter(k => !isNaN(k));
      if (keys.length < 5) throw new Error(`Too few candles in candles_${tf}.json: ${keys.length}`);
    }
  });
}

// ═══════════════════════════════════════════════════
// 3. ENGINE OUTPUT STRUCTURE
// ═══════════════════════════════════════════════════
console.log("\n═══ ENGINE OUTPUT ═══");

test("Engine report has required top-level keys", () => {
  const engine = JSON.parse(fs.readFileSync(
    path.join(ROOT, "shared", DATE, "GOLD", "engine_4h.json"), "utf8"
  ));
  const required = ["price", "structure", "liquidity", "orderBlocks", "fvgs"];
  for (const key of required) {
    if (!(key in engine)) throw new Error(`Missing required key: ${key}`);
  }
});

test("Structure section has bias + lastEvent", () => {
  const engine = JSON.parse(fs.readFileSync(
    path.join(ROOT, "shared", DATE, "GOLD", "engine_4h.json"), "utf8"
  ));
  const s = engine.structure;
  if (!s.bias) throw new Error("Missing bias");
  if (!s.lastEvent) throw new Error("Missing lastEvent");
  if (!["bullish", "bearish", "neutral"].includes(s.bias)) {
    throw new Error(`Invalid bias value: ${s.bias}`);
  }
  if (!["CHoCH", "BOS", "none"].includes(s.lastEvent)) {
    throw new Error(`Invalid lastEvent value: ${s.lastEvent}`);
  }
});

// ═══════════════════════════════════════════════════
// 4. TOOL CONTRACTS
// ═══════════════════════════════════════════════════
console.log("\n═══ TOOL CONTRACTS ═══");

test("ny_time returns valid session data", () => {
  const ny = require(path.join(ROOT, "tools", "ny_time.cjs"));
  if (typeof ny.getNYHour !== "function") throw new Error("getNYHour not a function");
  if (typeof ny.getNYDay !== "function") throw new Error("getNYDay not a function");
  const hour = ny.getNYHour();
  if (hour < 0 || hour > 23) throw new Error(`Invalid NY hour: ${hour}`);
});

test("coherence_calculator exports expected functions", () => {
  const cc = require(path.join(ROOT, "tools", "pipeline", "coherence_calculator.cjs"));
  if (typeof cc.calculateWeightedBias !== "function") throw new Error("Missing calculateWeightedBias");
  if (typeof cc.calculateCoherence !== "function") throw new Error("Missing calculateCoherence");
});

test("corrupt_detector returns valid JSON for XAUUSD", () => {
  let parsed;
  try {
    const result = execSync(`node evaluation/resilience/corrupt_detector.cjs XAUUSD ${DATE}`, {
      cwd: ROOT, encoding: "utf8", timeout: 10000, stdio: ["ignore", "pipe", "pipe"],
    });
    parsed = JSON.parse(result);
  } catch (e) {
    // May exit 1 if data is stale — that's valid, parse stdout
    parsed = JSON.parse(e.stdout || "{}");
  }
  if (!("valid" in parsed)) throw new Error("Missing 'valid' field");
  if (!("checks" in parsed)) throw new Error("Missing 'checks' field");
  if (!Array.isArray(parsed.details)) throw new Error("Missing 'details' array");
});

test("output_quality returns valid JSON with score", () => {
  const result = execSync(`node evaluation/metrics/output_quality.cjs XAUUSD ${DATE}`, {
    cwd: ROOT, encoding: "utf8", timeout: 10000,
  });
  const parsed = JSON.parse(result);
  if (!("score" in parsed)) throw new Error("Missing 'score' field");
  if (!("grade" in parsed)) throw new Error("Missing 'grade' field");
  if (!Array.isArray(parsed.files)) throw new Error("Missing 'files' array");
});

test("llm_judge returns valid JSON with dimensions", () => {
  const result = execSync(`node evaluation/judge/llm_judge.cjs XAUUSD ${DATE}`, {
    cwd: ROOT, encoding: "utf8", timeout: 10000,
  });
  const parsed = JSON.parse(result);
  const dims = ["directionalCorrectness", "ictRuleAdherence", "reasoningQuality", "actionability", "completeness"];
  for (const d of dims) {
    if (!(d in parsed)) throw new Error(`Missing dimension: ${d}`);
  }
  if (!("totalScore" in parsed)) throw new Error("Missing totalScore");
  if (!("grade" in parsed)) throw new Error("Missing grade");
});

// ═══════════════════════════════════════════════════
// 5. CORRUPT DATA RESILIENCE
// ═══════════════════════════════════════════════════
console.log("\n═══ CORRUPT DATA RESILIENCE ═══");

test("Corrupt detector blocks EURUSD at impossible price", () => {
  // Create temp engine + candle files with corrupt price
  const tmpDir = path.join(ROOT, "shared", "2026-99-99", "EURUSD");
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const corruptEngine = { price: 29446.59920, structure: { bias: "bullish", lastEvent: "BOS" } };
  fs.writeFileSync(path.join(tmpDir, "engine_1m.json"), JSON.stringify(corruptEngine));
  const candleStub = { "0": { time: Date.now() - 60000, open: 1.15, high: 1.16, low: 1.14, close: 1.15, volume: 100 } };
  fs.writeFileSync(path.join(tmpDir, "candles_1m.json"), JSON.stringify(candleStub));

  let parsed;
  try {
    const result = execSync("node evaluation/resilience/corrupt_detector.cjs EURUSD 2026-99-99", {
      cwd: ROOT, encoding: "utf8", timeout: 10000, stdio: ["ignore", "pipe", "pipe"],
    });
    parsed = JSON.parse(result);
  } catch (e) {
    // Corrupt detector exits 1 when blocked — parse its stdout
    parsed = JSON.parse(e.stdout || "{}");
  }

  // Clean up
  fs.rmSync(path.join(ROOT, "shared", "2026-99-99"), { recursive: true, force: true });

  if (parsed.valid !== false) throw new Error(`Should have blocked corrupt EURUSD price. Got valid=${parsed.valid}`);
  const priceCheck = parsed.details.find(c => c.id === "PRICE_TOO_HIGH");
  if (!priceCheck || priceCheck.passed !== false) {
    throw new Error(`Price range check should have failed. Details: ${JSON.stringify(parsed.details.map(c => `${c.id}:${c.passed}`))}`);
  }
});

test("Corrupt detector catches inverted SL for long", () => {
  // Create entry plan with inverted SL
  const planDir = path.join(ROOT, "stages", "05_entry_refinement", "output");
  const planFile = path.join(planDir, "eurusd_entry_plan.md");
  const corruptPlan = "Direction: BUY\nEntry: 1.15000\nSL: 1.15200\nTP: 1.15500\n";
  let backup = null;
  if (fs.existsSync(planFile)) backup = fs.readFileSync(planFile, "utf8");
  fs.writeFileSync(planFile, corruptPlan);

  // Need valid engine + candle files
  const tmpDir = path.join(ROOT, "shared", "2026-99-99", "EURUSD");
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const validEngine = { price: 1.15286, structure: { bias: "bullish", lastEvent: "BOS" } };
  fs.writeFileSync(path.join(tmpDir, "engine_1m.json"), JSON.stringify(validEngine));
  const candleStub = { "0": { time: Date.now() - 60000, open: 1.15, high: 1.16, low: 1.14, close: 1.15, volume: 100 } };
  fs.writeFileSync(path.join(tmpDir, "candles_1m.json"), JSON.stringify(candleStub));

  let parsed;
  try {
    const result = execSync("node evaluation/resilience/corrupt_detector.cjs EURUSD 2026-99-99", {
      cwd: ROOT, encoding: "utf8", timeout: 10000, stdio: ["ignore", "pipe", "pipe"],
    });
    parsed = JSON.parse(result);
  } catch (e) {
    parsed = JSON.parse(e.stdout || "{}");
  }

  // Clean up
  if (backup !== null) fs.writeFileSync(planFile, backup); else try { fs.unlinkSync(planFile); } catch {}
  try { fs.rmSync(path.join(ROOT, "shared", "2026-99-99"), { recursive: true, force: true }); } catch {}

  const slCheck = parsed.details.find(c => c.id === "SL_INVERTED_LONG");
  if (!slCheck || slCheck.passed !== false) {
    throw new Error(`Should have caught inverted SL for LONG. Details: ${JSON.stringify(parsed.details.map(c => `${c.id}:${c.passed}`))}`);
  }
});

// ═══════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════
console.log(`\n═══ RESULTS ═══`);
console.log(`${PASS} ${passed} passed  ${FAIL} ${failed} failed  ${SKIP} ${skipped} skipped`);
console.log(`Score: ${passed}/${passed + failed} (${Math.round(passed / (passed + failed) * 100)}%)`);

// Write JUnit-style report
const report = {
  timestamp: new Date().toISOString(),
  passed,
  failed,
  skipped,
  total: passed + failed + skipped,
  results,
};
fs.writeFileSync(
  path.join(ROOT, "evaluation", "regression", "last_run.json"),
  JSON.stringify(report, null, 2)
);

process.exit(failed > 0 ? 1 : 0);
