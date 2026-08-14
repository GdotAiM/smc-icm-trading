// Output Quality Checker — Validates completeness, format, and actionability of stage outputs
// Usage: node evaluation/metrics/output_quality.cjs [PAIR] [DATE]
// Returns: { score, checks: [...], missing: [...], empty: [...] }

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const PAIR = process.argv[2] || "XAUUSD";
const DATE = process.argv[3] || require("../../tools/ny_time.cjs").getNYDate();
const pairLabel = PAIR.toLowerCase();

// ═══ EXPECTED OUTPUTS — what every pair analysis must produce ═══
const EXPECTED = [
  // Stage 00 — Macro Context
  { stage: "00_macro_context", file: "cycle_phase.md", required: true, minBytes: 100 },
  { stage: "00_macro_context", file: "day_context.md", required: true, minBytes: 100 },
  { stage: "00_macro_context", file: `${pairLabel}_ipda.md`, required: true, minBytes: 200 },
  { stage: "00_macro_context", file: `${pairLabel}_weekly_profile.md`, required: true, minBytes: 200 },
  { stage: "00_macro_context", file: `${pairLabel}_one_trade_setup.md`, required: true, minBytes: 150 },
  { stage: "00_macro_context", file: `${pairLabel}_mmxm.md`, required: true, minBytes: 100 },
  { stage: "00_macro_context", file: `${pairLabel}_memory.md`, required: false, minBytes: 50 },
  { stage: "00_macro_context", file: `${pairLabel}_time_price_grid.md`, required: false, minBytes: 100 },
  { stage: "00_macro_context", file: `${pairLabel}_high_precision.md`, required: false, minBytes: 100 },
  { stage: "00_macro_context", file: `${pairLabel}_pda_matrix.md`, required: false, minBytes: 100 },
  { stage: "00_macro_context", file: `${pairLabel}_po3_state.md`, required: false, minBytes: 100 },

  // Stage 01 — HTF Bias
  { stage: "01_htf_bias", file: `${pairLabel}_bias.md`, required: true, minBytes: 200 },

  // Stage 02 — Key Levels
  { stage: "02_key_levels", file: `${pairLabel}_levels.md`, required: true, minBytes: 100 },
  { stage: "02_key_levels", file: `${pairLabel}_liquidity.md`, required: true, minBytes: 200 },
  { stage: "02_key_levels", file: `${pairLabel}_irl_erl.md`, required: true, minBytes: 100 },
  { stage: "02_key_levels", file: `${pairLabel}_order_flow.md`, required: false, minBytes: 100 },

  // Stage 03 — Session
  { stage: "03_session_time", file: `${pairLabel}_session.md`, required: true, minBytes: 100 },
  { stage: "03_session_time", file: `${pairLabel}_opening_range.md`, required: false, minBytes: 100 },
  { stage: "03_session_time", file: `${pairLabel}_bread_and_butter.md`, required: false, minBytes: 100 },

  // Stage 04 — Model Selection
  { stage: "04_model_selection", file: `${pairLabel}_active_models.md`, required: true, minBytes: 100 },

  // Stage 05 — Entry
  { stage: "05_entry_refinement", file: `${pairLabel}_entry_plan.md`, required: true, minBytes: 150 },

  // Stage 05b — Micro Confirmation
  { stage: "05b_micro_confirmation", file: `${pairLabel}_coherence.md`, required: true, minBytes: 100 },
  { stage: "05b_micro_confirmation", file: `${pairLabel}_inducement.md`, required: true, minBytes: 100 },
  { stage: "05b_micro_confirmation", file: `${pairLabel}_invalidation.md`, required: true, minBytes: 100 },
  { stage: "05b_micro_confirmation", file: `${pairLabel}_trigger_check.md`, required: false, minBytes: 100 },
  { stage: "05b_micro_confirmation", file: `${pairLabel}_micro_cycle.md`, required: false, minBytes: 100 },
  { stage: "05b_micro_confirmation", file: `${pairLabel}_fractal_mmxm.md`, required: false, minBytes: 100 },

  // Stage 06 — Risk
  { stage: "06_risk_management", file: `${pairLabel}_risk_plan.md`, required: true, minBytes: 100 },

  // Stage 07 — Journal
  { stage: "07_journal_review", file: `${pairLabel}_review.md`, required: true, minBytes: 100 },
];

// ═══ CONTENT QUALITY CHECKS ═══
function checkContent(filePath, minBytes) {
  const checks = [];

  try {
    const stat = fs.statSync(filePath);
    const content = fs.readFileSync(filePath, "utf8");

    // Size check
    if (stat.size < minBytes) {
      checks.push({ check: "SIZE", passed: false, detail: `File is ${stat.size}B, minimum ${minBytes}B — likely empty or placeholder` });
    } else {
      checks.push({ check: "SIZE", passed: true, detail: `${stat.size}B (≥${minBytes}B required)` });
    }

    // Placeholder check — files that contain only template text
    const placeholderPatterns = [
      /\[TODO\]/i,
      /\[PLACEHOLDER\]/i,
      /Not yet generated/i,
      /Run.*to generate/i,
      /Coming soon/i,
      /^\s*$/m, // completely empty
    ];
    for (const pat of placeholderPatterns) {
      if (pat.test(content)) {
        checks.push({ check: "PLACEHOLDER", passed: false, detail: `File contains placeholder text matching: ${pat}` });
        break;
      }
    }

    // Key content checks per file type
    const fileName = path.basename(filePath);

    if (fileName.includes("_bias")) {
      if (!content.match(/BULLISH|BEARISH|NEUTRAL/i)) {
        checks.push({ check: "BIAS_STATED", passed: false, detail: "No bias direction found" });
      } else {
        checks.push({ check: "BIAS_STATED", passed: true, detail: "Directional bias present" });
      }
    }

    if (fileName.includes("_entry_plan")) {
      if (!content.match(/Entry/i)) {
        checks.push({ check: "ENTRY_PRESENT", passed: false, detail: "No entry section" });
      }
      if (!content.match(/SL|Stop Loss/i)) {
        checks.push({ check: "SL_PRESENT", passed: false, detail: "No stop loss defined" });
      }
      if (!content.match(/TP|Take Profit|Target/i)) {
        checks.push({ check: "TP_PRESENT", passed: false, detail: "No take profit defined" });
      }
    }

    if (fileName.includes("_risk_plan")) {
      if (!content.match(/R:R|Risk.?Reward|risk.?reward/i)) {
        checks.push({ check: "RR_STATED", passed: false, detail: "No R:R ratio" });
      }
      if (!content.match(/\d+%/)) {
        checks.push({ check: "RISK_PCT", passed: false, detail: "No risk percentage" });
      }
    }

    return checks;
  } catch (e) {
    return [{ check: "READ_ERROR", passed: false, detail: e.message }];
  }
}

// ═══ MAIN ═══
const results = { pair: PAIR, date: DATE, files: [], score: 0, missing: [], empty: [], degraded: [] };

let totalPoints = 0;
let earnedPoints = 0;

for (const expected of EXPECTED) {
  const filePath = path.join(ROOT, "stages", expected.stage, "output", expected.file);
  const exists = fs.existsSync(filePath);

  if (!exists && expected.required) {
    results.missing.push({ stage: expected.stage, file: expected.file });
    totalPoints += 3;
    continue;
  }
  if (!exists && !expected.required) {
    continue; // Optional files can be absent
  }

  const contentChecks = checkContent(filePath, expected.minBytes);
  const failed = contentChecks.filter(c => !c.passed);
  const points = expected.required ? 3 : 1;
  totalPoints += points;
  earnedPoints += failed.length === 0 ? points : Math.max(0, points - failed.length);

  const status = failed.length === 0 ? "ok" : failed.length <= 1 ? "degraded" : "failing";
  if (status === "degraded") results.degraded.push({ stage: expected.stage, file: expected.file, issues: failed });
  if (status === "failing") results.empty.push({ stage: expected.stage, file: expected.file, issues: failed });

  results.files.push({
    stage: expected.stage,
    file: expected.file,
    required: expected.required,
    exists,
    status,
    checks: contentChecks,
  });
}

results.score = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
results.grade = results.score >= 90 ? "A" : results.score >= 75 ? "B" : results.score >= 60 ? "C" : results.score >= 40 ? "D" : "F";
results.summary = `${results.score}/100 (${results.grade}) — ${results.missing.length} missing required, ${results.empty.length} failing, ${results.degraded.length} degraded`;

console.log(JSON.stringify(results, null, 2));
process.exit(results.score < 40 ? 1 : 0);
