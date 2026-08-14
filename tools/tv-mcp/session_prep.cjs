// Session Prep — Run full 7-stage pipeline before any trades
// Bridges the gap between deep analysis and fast execution
// Usage: node tools/tv-mcp/session_prep.cjs [pairs]
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = "C:/Users/cash/smc-icm-trading";
const DATE = require("../ny_time.cjs").getNYDate();
const PAIRS = process.argv[2] ? process.argv[2].split(",") : ["XAUUSD", "NAS100"];

console.log("=== SESSION PREP — " + DATE + " ===\n");
console.log("Pairs: " + PAIRS.join(", "));
console.log("");

const results = {};

for (const pair of PAIRS) {
  console.log("--- " + pair + " ---");

  // Stage 00: Macro Context
  process.stdout.write("  Stage 00: Macro... ");
  try {
    execSync(`node "${path.join(ROOT, "tools", "macro_context.cjs")}" ${pair}`, {
      timeout: 30000, stdio: ["ignore", "pipe", "ignore"]
    });
    console.log("✅");
  } catch(e) { console.log("⚠️ " + e.message?.substring(0, 50)); }

  // Stage 00b: Council Vote
  process.stdout.write("  Stage 00b: Council... ");
  try {
    execSync(`node "${path.join(ROOT, "tools", "council.cjs")}" ${pair}`, {
      timeout: 30000, stdio: ["ignore", "pipe", "ignore"]
    });
    console.log("✅");
  } catch(e) { console.log("⚠️ " + e.message?.substring(0, 50)); }

  // Stage 01: HTF Bias
  process.stdout.write("  Stage 01: HTF Bias... ");
  try {
    execSync(`node "${path.join(ROOT, "tools", "run_topdown.cjs")}" ${pair}`, {
      timeout: 30000, stdio: ["ignore", "pipe", "ignore"]
    });
    console.log("✅");
  } catch(e) { console.log("⚠️ " + e.message?.substring(0, 50)); }

  // Read key outputs
  const biasFile = path.join(ROOT, "stages", "01_htf_bias", "output", pair.toLowerCase() + "_bias.md");
  const levelsFile = path.join(ROOT, "stages", "02_key_levels", "output", pair.toLowerCase() + "_levels.md");
  const modelsFile = path.join(ROOT, "stages", "04_model_selection", "output", pair.toLowerCase() + "_active_models.md");

  results[pair] = {
    htfBias: fs.existsSync(biasFile) ? "available" : "missing",
    keyLevels: fs.existsSync(levelsFile) ? "available" : "missing",
    modelSelection: fs.existsSync(modelsFile) ? "available" : "missing",
  };

  console.log("  Bias: " + results[pair].htfBias + " | Levels: " + results[pair].keyLevels + " | Models: " + results[pair].modelSelection);
  console.log("");
}

// Summary
const available = Object.entries(results).filter(([,r]) => r.htfBias === "available");
console.log("=== PREP COMPLETE ===");
console.log("Pairs analyzed: " + available.length + "/" + PAIRS.length);
console.log("Files: stages/0X_*/output/" + PAIRS.map(p => p.toLowerCase()).join(", ") + "_*.md");

// Write prep state
fs.writeFileSync(
  path.join(ROOT, "shared", DATE, "prep_state.json"),
  JSON.stringify({ date: DATE, time: new Date().toISOString(), pairs: results }, null, 2)
);
