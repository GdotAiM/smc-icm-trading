const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

// WP-10 (audit Gap 3.3): memory is for LEARNING, not for VOTING. Past
// performance must never be fed back as a live weight in the decision path.
// These tests enforce the Definition of Done as a grep guard.

const DECISION_FILES = [
  "../tools/run_pair.cjs",
  "../tools/models/steps.cjs",
  "../tools/models/registry.cjs",
  "../tools/models/scoring.cjs",
  "../tools/tier1.cjs",
  "../tools/priority2.cjs",
];

const FORBIDDEN = ["perfMultiplier", "perfWeights", "perfWeight"];

test("WP-10: decision path contains zero performance-multiplier identifiers", () => {
  for (const rel of DECISION_FILES) {
    const abs = path.resolve(__dirname, rel);
    if (!fs.existsSync(abs)) continue; // scoring.cjs may not exist yet
    const src = fs.readFileSync(abs, "utf8");
    for (const token of FORBIDDEN) {
      assert.ok(
        !src.includes(token),
        `${rel} still references "${token}" — WP-10 requires audit-only memory (no live weights)`
      );
    }
  }
});

test("WP-10: performance ledger output remains available for the dashboard (audit files written)", () => {
  const outDir = path.resolve(__dirname, "../shared/performance");
  assert.ok(fs.existsSync(outDir), "shared/performance output dir must exist");
  const files = fs.readdirSync(outDir);
  for (const f of ["model_stats.md", "session_stats.md", "pair_stats.md"]) {
    assert.ok(files.includes(f), `audit report ${f} must be dashboard-visible`);
  }
});
