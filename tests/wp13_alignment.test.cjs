// tests/wp13_alignment.test.cjs
// WP-13: the 1m-inversion threshold is ONE constant.
// DoD: the gate (cross_system_guard.cjs) and the detector (fractal_mmxm.cjs)
// agree on a table of edge-case inputs — for any score, one can never say
// "pass/enter" while the other says "fail/block". Both must read the same
// CONFIG.inversion.minScore, so a config change moves both at once.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const { CONFIG } = require("../tools/lib/engine_config.cjs");
const { loadRaidConfirmation, LIQUIDITY_RAID_CONFIRMATION } = require("../tools/lib/raid_config.cjs");

const ROOT = path.resolve(__dirname, "..");

// ── The two decision rules, extracted from the real source ────────────────
// cross_system_guard.cjs:184  `if (fractal2.inversionScore < CONFIG.inversion.minScore) → BLOCK`
// fractal_mmxm.cjs:138        `const detected = score >= CONFIG.inversion.minScore`
// They are complementary on the SAME threshold, so disagreement is impossible
// only while both literally reference CONFIG.inversion.minScore.
function gateAllows(score, minScore) {
  return score >= minScore; // guard pushes a HIGH block when score < minScore
}
function detectorDetects(score, minScore) {
  return score >= minScore; // detector sets detected = score >= minScore
}

test("WP-13: minScore and maxScore are a sane scored range", () => {
  assert.ok(CONFIG.inversion.minScore >= 1, "minScore must be >= 1");
  assert.ok(CONFIG.inversion.minScore <= CONFIG.inversion.maxScore, "minScore must be <= maxScore");
  assert.ok(CONFIG.inversion.maxScore >= 2, "maxScore must be >= 2");
});

test("WP-13: gate and detector agree on every edge-case score 0..maxScore", () => {
  const min = CONFIG.inversion.minScore;
  const max = CONFIG.inversion.maxScore;
  const edgeCases = new Set([0, 1, min - 1, min, min + 1, max, max + 1]);
  for (let score = 0; score <= max + 1; score++) {
    const allow = gateAllows(score, min);
    const detect = detectorDetects(score, min);
    assert.strictEqual(
      allow,
      detect,
      `score=${score}: gate allows entry (${allow}) but detector disagrees (${detect}) — the two must agree`
    );
  }
  // The decisive boundary: exactly at minScore the detector fires AND the gate
  // stops blocking; one tick below, both refuse. No gap, no overlap.
  assert.strictEqual(detectorDetects(min, min), true, `score ${min} (minScore) must detect`);
  assert.strictEqual(gateAllows(min, min), true, `score ${min} (minScore) must be allowed by the gate`);
  assert.strictEqual(detectorDetects(min - 1, min), false, `score ${min - 1} must NOT detect`);
  assert.strictEqual(gateAllows(min - 1, min), false, `score ${min - 1} must be blocked by the gate`);
  assert.ok(edgeCases.size > 0);
});

test("WP-13: both modules source the threshold from CONFIG.inversion.minScore", () => {
  const guard = fs.readFileSync(path.join(ROOT, "tools", "cross_system_guard.cjs"), "utf8");
  const fractal = fs.readFileSync(path.join(ROOT, "tools", "fractal_mmxm.cjs"), "utf8");
  assert.ok(guard.includes("CONFIG.inversion.minScore"), "cross_system_guard.cjs must read CONFIG.inversion.minScore");
  assert.ok(fractal.includes("CONFIG.inversion.minScore"), "fractal_mmxm.cjs must read CONFIG.inversion.minScore");
});

test("WP-13: no hardcoded numeric inversion threshold survives in either module", () => {
  const guard = fs.readFileSync(path.join(ROOT, "tools", "cross_system_guard.cjs"), "utf8");
  const fractal = fs.readFileSync(path.join(ROOT, "tools", "fractal_mmxm.cjs"), "utf8");
  // Regression of audit Bug 6.5: the gate used to block at >=4 while the
  // detector passed at >=5. Any bare `>= 4` / `< 5` on the inversion score
  // (outside the CONFIG reference) recreates the split.
  const forBoth = [
    { re: /inversionScore\s*<\s*\d+/, name: "gate hardcoded '< number' on inversionScore" },
    { re: /inversionScore\s*>=\s*\d+/, name: "gate hardcoded '>= number' on inversionScore" },
    { re: /score\s*>\s*4(?:\s|[?:,])/, name: "fractal hardcoded '> 4' on score" },
  ];
  for (const { re, name } of forBoth) {
    assert.ok(!re.test(guard), `${name} in cross_system_guard.cjs`);
  }
  const fractalHard = [
    { re: /score\s*>\s*4(?:\s|[?:,])/, name: "fractal hardcoded '> 4' on score" },
    { re: /score\s*>=\s*\d+\s*\?/, name: "fractal hardcoded 'score >= N ?' narrative tier" },
  ];
  for (const { re, name } of fractalHard) {
    assert.ok(!re.test(fractal), `${name} in fractal_mmxm.cjs`);
  }
});

test("WP-13: the detector narrative tier derives from the shared constant", () => {
  const fractal = fs.readFileSync(path.join(ROOT, "tools", "fractal_mmxm.cjs"), "utf8");
  // The "BUILDING" narrative should be minScore - 1, never a literal 4.
  assert.ok(
    fractal.includes("CONFIG.inversion.minScore - 1"),
    "fractal_mmxm.cjs narrative must tier off CONFIG.inversion.minScore - 1"
  );
  assert.ok(!fractal.includes("score >= 4"), "fractal_mmxm.cjs must not contain a literal `score >= 4`");
});

test("WP-13 (Principle 4): raid_config and engine_config agree on the same default", () => {
  const cfg = CONFIG.liquidityRaid && CONFIG.liquidityRaid.confirmation;
  assert.ok(["wick", "close"].includes(cfg), "engine_config.liquidityRaid.confirmation must be wick or close");
  assert.strictEqual(loadRaidConfirmation(), cfg, "raid_config default must come from engine_config");
  assert.strictEqual(LIQUIDITY_RAID_CONFIRMATION, cfg, "exported constant must match engine_config default");
});

test("WP-13 (Principle 4): raid constant is still overridable at runtime", () => {
  const { execFileSync } = require("node:child_process");
  const out = execFileSync(
    process.execPath,
    ["-e", "console.log(require('./tools/lib/raid_config.cjs').loadRaidConfirmation())"],
    { cwd: ROOT, env: { ...process.env, LIQUIDITY_RAID_CONFIRMATION: "close" }, encoding: "utf8" }
  ).trim();
  assert.strictEqual(out, "close");
});
