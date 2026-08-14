// Master Evaluation Runner — Runs all evaluation checks for a pair
// Usage: node evaluation/run_evaluation.cjs [PAIR] [--ci]
// Called automatically by run_pair.cjs after pipeline completion

const { execSync } = require("child_process");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PAIR = process.argv[2] || "XAUUSD";
const CI = process.argv.includes("--ci");
const DATE = require("../tools/ny_time.cjs").getNYDate();

const PASS = "✅";
const FAIL = "❌";
const WARN = "⚠️";

const results = [];
let blocked = false;

function run(label, cmd, criticalFailure = false) {
  try {
    const start = Date.now();
    let parsed;
    try {
      const output = execSync(cmd, {
        cwd: ROOT,
        encoding: "utf8",
        timeout: 30000,
        stdio: ["ignore", "pipe", "pipe"],
      });
      // Try parsing: look for lines starting with {, grab the first JSON block
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: output.slice(0, 200).replace(/\n/g, " ") };
    } catch (e) {
      // Command may exit non-zero when it finds issues (which is correct behavior)
      const stdout = e.stdout || "";
      const jsonMatch = stdout.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: stdout.slice(0, 200).replace(/\n/g, " ") };
    }
    const elapsed = Date.now() - start;

    const passed = !(parsed.blocked === true || parsed.valid === false || parsed.grade === "F") &&
                   !(parsed.totalScore === 0 && parsed.autoFail);

    const shortSummary = parsed.summary || parsed.verdict || parsed.grade || "";
    const scoreVal = parsed.totalScore || parsed.score || (passed ? 100 : 0);

    results.push({
      module: label,
      passed,
      elapsedMs: elapsed,
      summary: String(shortSummary).slice(0, 100),
      score: scoreVal,
      grade: parsed.grade || (passed ? "PASS" : "FAIL"),
      details: parsed,
    });

    if (!passed && criticalFailure) blocked = true;

    console.log(`${passed ? PASS : FAIL} ${label} (${elapsed}ms) — ${String(shortSummary).slice(0, 70)}`);
    return parsed;
  } catch (e) {
    const stderr = e.stderr ? String(e.stderr).slice(0, 200) : "";
    results.push({
      module: label,
      passed: false,
      elapsedMs: 0,
      summary: `${e.message} ${stderr}`.slice(0, 150),
      score: 0,
      grade: "ERROR",
    });
    if (criticalFailure) blocked = true;
    console.log(`${FAIL} ${label} — ${e.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════
console.log(`\n═══════════════════════════════════════`);
console.log(`  EVALUATION — ${PAIR} — ${DATE}`);
console.log(`═══════════════════════════════════════\n`);

// 1. RESILIENCE — Corrupt data, inverted SL/TP, session gates
run("Resilience", `node evaluation/resilience/corrupt_detector.cjs ${PAIR} ${DATE}`, true);

// 2. OUTPUT QUALITY — Completeness, format, content checks
run("Output Quality", `node evaluation/metrics/output_quality.cjs ${PAIR} ${DATE}`, false);

// 3. LLM JUDGE — Analysis quality scoring
run("Quality Judge", `node evaluation/judge/llm_judge.cjs ${PAIR} ${DATE}`, false);

// 4. BIAS ACCURACY — Directional call vs actual
run("Bias Accuracy", `node evaluation/benchmarks/bias_accuracy/scorer.cjs ${PAIR} ${DATE}`, false);

// 5. TRACE — Record stage completion
try {
  execSync(`node evaluation/traces/session_tracer.cjs finish ${PAIR}`, {
    cwd: ROOT, timeout: 5000, stdio: "ignore",
  });
} catch {}

// ═══════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════
const passed = results.filter(r => r.passed).length;
const failed = results.filter(r => !r.passed).length;
const avgScore = results.length > 0
  ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length)
  : 0;

const summary = {
  pair: PAIR,
  date: DATE,
  timestamp: new Date().toISOString(),
  modules: results.length,
  passed,
  failed,
  blocked,
  avgScore,
  verdict: blocked ? "BLOCKED — do not trade" :
            failed > 1 ? "DEGRADED — review manually" :
            failed === 1 ? "CAUTION — one module failed" :
            "PASSED — all checks passed",
  results,
};

// Save to evaluation ledger
const fs = require("fs");
const ledgerPath = path.join(__dirname, "eval_ledger.jsonl");
fs.appendFileSync(ledgerPath, JSON.stringify(summary) + "\n");

console.log(`\n═══════════════════════════════════════`);
console.log(`  VERDICT: ${summary.verdict}`);
console.log(`  Score: ${avgScore}/100 | ${passed}/${results.length} modules passed`);
console.log(`  ${blocked ? '🛑 BLOCKED' : failed > 0 ? '⚠️ CAUTION' : '✅ CLEAR'}`);
console.log(`═══════════════════════════════════════\n`);

process.exit(blocked ? 2 : failed > 0 ? 1 : 0);
