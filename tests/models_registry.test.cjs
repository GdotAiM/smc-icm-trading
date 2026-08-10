// tests/models_registry.test.cjs
// WP-8: model registry + per-model confirmation matrices.
// DoD: 17 registry entries; every sequence has a known pass AND known fail
// case; time-exclusive models are never both eligible; no "score" word in the
// decision modules; verdict is "single complete setup or nothing."
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const {
  MODELS,
  inModelWindow,
  evaluateModel,
  runRegistry,
  ALL_STEP_NAMES,
} = require("../tools/models/registry.cjs");

// ── Shared context factory ───────────────────────────────────────────────
function makeContext(overrides = {}) {
  return {
    hour: overrides.hour ?? 10,
    bias: overrides.bias ?? "bearish",
    lastSweepType: overrides.lastSweepType ?? "BSL",
    hasSweep: overrides.hasSweep ?? true,
    hasReversal: overrides.hasReversal ?? true,
    mss: overrides.mss ?? true,
    hasOB: overrides.hasOB ?? true,
    uniqueOBs: overrides.uniqueOBs ?? [{ proximal: 1 }],
    hasFVG: overrides.hasFVG ?? true,
    fvgs: overrides.fvgs ?? [{ fillFraction: 0.2 }],
    arrayInPlay: overrides.arrayInPlay ?? true,
    oteZone: overrides.oteZone ?? true,
    cisd: overrides.cisd ?? true,
    smt: overrides.smt ?? true,
    htfRanging: overrides.htfRanging ?? true,
    displacement: overrides.displacement ?? true,
    hasDraw: overrides.hasDraw ?? true,
    // High Precision Secrets — 7-9AM tethering gate context. Default: framework
    // ACTIVE with ≥1 tethered array so the NY-AM models pass in the full-pass case.
    precision: overrides.precision ?? { active: true, tetheredCount: 1 },
    lecture2: {
      hunt: { swept: true, sweepPrice: 1.1 },
      mss: { confirmed: true, direction: "SELL" },
      setupReady: true,
      ...(overrides.lecture2 || {}),
    },
    lecture1: {
      formation: { formed: true },
      raid: { active: true },
      mss: { confirmed: true },
      setupReady: true,
      ...(overrides.lecture1 || {}),
    },
    lecture4: {
      gapClusters: { hasGaps: true },
      substituteGap: false,
      gapDraw: { drawing: true },
      mss: { confirmed: true },
      setupReady: true,
      ...(overrides.lecture4 || {}),
    },
    ...overrides,
  };
}

// Context overrides that make a given step FAIL (clear its source fact).
const STEP_FAIL = {
  sweep: { hasSweep: false },
  reversal: { hasReversal: false },
  mss: { mss: false },
  fvg: { hasFVG: false },
  ob: { hasOB: false },
  array_mitigated: { arrayInPlay: false },
  ote: { oteZone: false },
  cisd: { cisd: false },
  smt: { smt: false },
  htf_ranging: { htfRanging: false },
  displacement: { displacement: false },
  purge: { hasSweep: false },
  lecture2_hunt_swept: { lecture2: { hunt: { swept: false } } },
  lecture2_mss: { lecture2: { mss: { confirmed: false } } },
  lecture2_ready: { lecture2: { setupReady: false } },
  lecture1_formation: { lecture1: { formation: { formed: false } } },
  lecture1_raid: { lecture1: { raid: { active: false } } },
  lecture1_mss: { lecture1: { mss: { confirmed: false } } },
  lecture1_ready: { lecture1: { setupReady: false } },
  lecture4_gap_draw: { lecture4: { gapClusters: { hasGaps: false }, substituteGap: false, gapDraw: { drawing: false } } },
  lecture4_mss: { lecture4: { mss: { confirmed: false } } },
  lecture4_ready: { lecture4: { setupReady: false } },
  tethered_array: { precision: { active: true, tetheredCount: 0 } },
};

// Default in-window hour per model for the pass/fail tests.
const HOUR = {
  silver_bullet: 10,
  judas_swing: 8,
  asian_range_breakout: 22,
  london_hunt_ifvg: 7,
  ndog_nwog_news: 9,
  raid_0830: 9,
};

// Default bias per model (MMXM Buy is intrinsically BUY; everyone else accepts
// the bearish narrative context — counter-sweep fades BSL → SELL, aligned).
const BIAS = { mmxm_buy: "bullish" };

test("registry contains exactly 17 models with all required fields", () => {
  assert.strictEqual(MODELS.length, 17);
  const ids = new Set();
  for (const m of MODELS) {
    assert.ok(m.id && m.name, `${m.name} missing id/name`);
    assert.ok(!ids.has(m.id), `duplicate id ${m.id}`);
    ids.add(m.id);
    assert.ok(Number.isInteger(m.tier) && m.tier >= 1, `${m.name} missing tier`);
    assert.ok(typeof m.intrinsicDirection === "string", `${m.name} missing intrinsicDirection`);
    assert.ok(Array.isArray(m.sequence) && m.sequence.length > 0, `${m.name} missing sequence`);
    assert.strictEqual(typeof m.purgeRequired, "boolean", `${m.name} missing purgeRequired`);
  }
});

test("every sequence step is in the step vocabulary", () => {
  for (const m of MODELS) {
    for (const step of m.sequence) {
      assert.ok(ALL_STEP_NAMES.has(step), `${m.name} uses unknown step "${step}"`);
    }
  }
});

test("DoD: every model has a known PASS case", () => {
  for (const m of MODELS) {
    const ctx = makeContext({ hour: HOUR[m.id] ?? 10, bias: BIAS[m.id] ?? "bearish" });
    const res = evaluateModel(m, ctx);
    assert.ok(res.complete, `${m.name} should be COMPLETE in the full-pass context: ${JSON.stringify(res.gateTrace)}`);
  }
});

test("DoD: every model has a known FAIL case for EACH sequence step", () => {
  for (const m of MODELS) {
    for (const step of m.sequence) {
      const failOverrides = STEP_FAIL[step];
      assert.ok(failOverrides, `${m.name} step "${step}" has no fail-case override defined`);
      const ctx = makeContext({ hour: HOUR[m.id] ?? 10, bias: BIAS[m.id] ?? "bearish", ...failOverrides });
      const res = evaluateModel(m, ctx);
      assert.ok(!res.complete, `${m.name} should FAIL when step "${step}" fails`);
    }
  }
});

test("DoD: time-exclusive models are never both eligible (Silver Bullet vs Asian Range Breakout)", () => {
  const sb = MODELS.find(m => m.id === "silver_bullet");
  const arb = MODELS.find(m => m.id === "asian_range_breakout");
  for (let h = 0; h < 24; h++) {
    const sbWin = inModelWindow(sb, h).pass;
    const arbWin = inModelWindow(arb, h).pass;
    assert.ok(!(sbWin && arbWin), `hour ${h}: Silver Bullet and Asian Range both in window`);
  }
});

test("runRegistry: exactly one complete model → SETUP COMPLETE (London Hunt at 07:00)", () => {
  const ctx = makeContext({
    hour: 7,
    hasOB: false, hasFVG: false, mss: false, arrayInPlay: false, oteZone: false,
    cisd: false, smt: false, htfRanging: false, displacement: false,
  });
  const out = runRegistry(ctx);
  assert.strictEqual(out.verdict, "SETUP COMPLETE");
  assert.strictEqual(out.count, 1);
  assert.strictEqual(out.primary.id, "london_hunt_ifvg");
});

test("runRegistry: zero complete models → NO TRADE", () => {
  const ctx = makeContext({
    hour: 7,
    hasOB: false, hasFVG: false, mss: false, arrayInPlay: false, oteZone: false,
    cisd: false, smt: false, htfRanging: false, displacement: false,
    lecture2: { setupReady: false, hunt: { swept: false }, mss: { confirmed: false } },
  });
  const out = runRegistry(ctx);
  assert.strictEqual(out.verdict, "NO TRADE");
  assert.strictEqual(out.count, 0);
});

test("runRegistry: ties resolve by tier, never by multiplication", () => {
  // At 10:00, make Silver Bullet (tier 1) and 2FVG (tier 2) complete; everything
  // else blocked on OB/OTE/HTF. Tier must pick Silver Bullet.
  const ctx = makeContext({
    hour: 10,
    hasOB: false, arrayInPlay: false, oteZone: false, cisd: false, smt: false,
    htfRanging: false, displacement: false,
  });
  const out = runRegistry(ctx);
  assert.ok(out.resolved.tie, "expected a tie between complete models");
  assert.strictEqual(out.primary.id, "silver_bullet");
});

test("no 'score' word exists in the decision modules", () => {
  const files = [
    path.join(__dirname, "..", "tools", "models", "registry.cjs"),
    path.join(__dirname, "..", "tools", "models", "steps.cjs"),
  ];
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    assert.ok(!/\bscore\b/.test(src), `${f} contains the word "score"`);
  }
});
