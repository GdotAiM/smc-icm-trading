// tests/ob_grading.test.cjs
// WP-11 (audit Gap 4.3): order-block grading — mitigated vs unmitigated vs
// consumed, with displacement required and consumed blocks excluded from the
// "unmitigated" set. DoD: OB objects carry the flags (set on known series) and
// no model sequence can pass an "array" step against a consumed block.
const test = require("node:test");
const assert = require("node:assert");

const {
  gradeOrderBlock,
  gradeOrderBlocks,
  unmitigatedOf,
  mitigatedOf,
  consumedOf,
  arrayInPlayFor,
} = require("../tools/lib/ob_grading.cjs");
const { steps } = require("../tools/models/steps.cjs");
const { evaluateModel, MODELS } = require("../tools/models/registry.cjs");

function mk(rows) {
  return rows.map(([o, h, l, c], i) => ({
    time: new Date(Date.UTC(2026, 7, 9, 9, 0) + i * 60 * 60000).toISOString(),
    open: o, high: h, low: l, close: c,
  }));
}

// Bullish OB candle at index 2: top 1.1020, bottom 1.0980, then impulse up.
const T2 = new Date(Date.UTC(2026, 7, 9, 9, 0) + 2 * 60 * 60000).toISOString();
const BULL_OB = { type: "bullish", top: 1.1020, bottom: 1.0980, proximal: 1.1020, distal: 1.0980, index: 2, time: T2, impulseAtr: 1.5, hasFvg: true };

const NEVER_RETURNED = mk([
  [1.1002, 1.1008, 1.0998, 1.1004],
  [1.1004, 1.1009, 1.0999, 1.1005],
  [1.1005, 1.1020, 1.0980, 1.0990], // OB candle
  [1.0990, 1.1030, 1.0995, 1.1028], // impulse
  [1.1028, 1.1050, 1.1025, 1.1048],
  [1.1048, 1.1060, 1.1040, 1.1058], // after — stays above the block
  [1.1058, 1.1070, 1.1050, 1.1068],
  [1.1068, 1.1080, 1.1062, 1.1078],
]);

const DIPPED_IN = mk([
  [1.1002, 1.1008, 1.0998, 1.1004],
  [1.1004, 1.1009, 1.0999, 1.1005],
  [1.1005, 1.1020, 1.0980, 1.0990],
  [1.0990, 1.1030, 1.0995, 1.1028],
  [1.1028, 1.1050, 1.1025, 1.1048],
  [1.1048, 1.1060, 1.1015, 1.1040], // low 1.1015 <= 1.1020 → mitigated, close stays above 1.0980
  [1.1040, 1.1055, 1.1035, 1.1050],
]);

const BROKEN_THROUGH = mk([
  [1.1002, 1.1008, 1.0998, 1.1004],
  [1.1004, 1.1009, 1.0999, 1.1005],
  [1.1005, 1.1020, 1.0980, 1.0990],
  [1.0990, 1.1030, 1.0995, 1.1028],
  [1.1028, 1.1050, 1.1025, 1.1048],
  [1.1048, 1.1060, 1.1015, 1.1040],
  [1.1040, 1.1045, 1.0970, 1.0975], // close 1.0975 < 1.0980 → consumed
]);

const BEAR_OB = { type: "bearish", top: 1.1000, bottom: 1.0980, proximal: 1.0980, distal: 1.1000, index: 2, time: T2, impulseAtr: 1.5, hasFvg: true };
const BEAR_DIPPED = mk([
  [1.0995, 1.1002, 1.0990, 1.0998],
  [1.0998, 1.1004, 1.0993, 1.1001],
  [1.0985, 1.1000, 1.0980, 1.0995], // OB candle
  [1.0995, 1.0998, 1.0975, 1.0980], // impulse down
  [1.0980, 1.0983, 1.0960, 1.0965],
  [1.0965, 1.0982, 1.0955, 1.0958], // high 1.0982 >= 1.0980 → mitigated, close below 1.1000
]);
const BEAR_BROKEN = mk([
  [1.0995, 1.1002, 1.0990, 1.0998],
  [1.0998, 1.1004, 1.0993, 1.1001],
  [1.0985, 1.1000, 1.0980, 1.0995],
  [1.0995, 1.0998, 1.0975, 1.0980],
  [1.0980, 1.0983, 1.0960, 1.0965],
  [1.0965, 1.1010, 1.0960, 1.1005], // close 1.1005 > 1.1000 → consumed
]);

test("unmitigated: price never returns into a fresh bullish block", () => {
  const ob = gradeOrderBlock(BULL_OB, NEVER_RETURNED, { minImpulseAtr: 1.0 });
  assert.strictEqual(ob.unmitigated, true);
  assert.strictEqual(ob.mitigated, false);
  assert.strictEqual(ob.consumed, false);
  assert.strictEqual(ob.displacementOk, true);
  assert.strictEqual(ob.grade, "unmitigated");
});

test("mitigated: price dips into the block but never closes through it", () => {
  const ob = gradeOrderBlock(BULL_OB, DIPPED_IN, { minImpulseAtr: 1.0 });
  assert.strictEqual(ob.mitigated, true);
  assert.strictEqual(ob.unmitigated, false);
  assert.strictEqual(ob.consumed, false);
  assert.strictEqual(ob.grade, "mitigated");
});

test("consumed: price closes through the entire block", () => {
  const ob = gradeOrderBlock(BULL_OB, BROKEN_THROUGH, { minImpulseAtr: 1.0 });
  assert.strictEqual(ob.consumed, true);
  assert.strictEqual(ob.unmitigated, false);
  assert.strictEqual(ob.grade, "consumed");
});

test("bearish blocks grade symmetrically", () => {
  const dipped = gradeOrderBlock(BEAR_OB, BEAR_DIPPED, { minImpulseAtr: 1.0 });
  assert.strictEqual(dipped.mitigated, true);
  assert.strictEqual(dipped.unmitigated, false);
  const broken = gradeOrderBlock(BEAR_OB, BEAR_BROKEN, { minImpulseAtr: 1.0 });
  assert.strictEqual(broken.consumed, true);
  assert.strictEqual(broken.unmitigated, false);
});

test("engine-kind fallback when candles are unavailable", () => {
  assert.strictEqual(gradeOrderBlock({ ...BULL_OB, kind: "OB" }, null).unmitigated, true);
  assert.strictEqual(gradeOrderBlock({ ...BULL_OB, kind: "Mitigation" }, null).mitigated, true);
  assert.strictEqual(gradeOrderBlock({ ...BULL_OB, kind: "Breaker" }, null).consumed, true);
});

test("displacement is required for the unmitigated set", () => {
  const weak = gradeOrderBlock({ ...BULL_OB, impulseAtr: 0.3, hasFvg: false }, NEVER_RETURNED, { minImpulseAtr: 1.0 });
  assert.strictEqual(weak.displacementOk, false);
  assert.strictEqual(weak.unmitigated, false);
});

test("unmitigatedOf excludes mitigated and consumed blocks (DoD set)", () => {
  const freshList = gradeOrderBlocks([{ ...BULL_OB, index: 2 }], NEVER_RETURNED, { minImpulseAtr: 1.0 });
  const usedList = gradeOrderBlocks(
    [{ ...BULL_OB, kind: "Mitigation" }, { ...BULL_OB, kind: "Breaker" }],
    null, { minImpulseAtr: 1.0 },
  );
  const all = [...freshList, ...usedList];
  assert.strictEqual(unmitigatedOf(all).length, 1);
  assert.strictEqual(mitigatedOf(all).length, 1);
  assert.strictEqual(consumedOf(all).length, 1);
});

test("arrayInPlayFor: a consumed block at price never counts (WP-11 DoD)", () => {
  const consumed = gradeOrderBlock({ ...BULL_OB, kind: "Breaker" }, null);
  assert.strictEqual(arrayInPlayFor(1.099, [consumed]), false);
  const fresh = gradeOrderBlock(BULL_OB, NEVER_RETURNED, { minImpulseAtr: 1.0 });
  assert.strictEqual(arrayInPlayFor(1.099, [fresh]), true, "price inside a fresh block counts");
});

test("array_mitigated step fails against a consumed block", () => {
  assert.strictEqual(steps.array_mitigated({ consumedAtPrice: true, arrayInPlay: true }).pass, false);
  assert.strictEqual(steps.array_mitigated({ consumedAtPrice: false, arrayInPlay: true }).pass, true);
  assert.strictEqual(steps.array_mitigated({ arrayInPlay: false }).pass, false);
});

test("ob step requires unmitigated order blocks", () => {
  assert.strictEqual(steps.ob({ hasOB: true, uniqueOBs: [{ proximal: 1 }] }).pass, true);
  assert.strictEqual(steps.ob({ hasOB: false }).pass, false);
});

test("no model sequence passes an array step against a consumed block", () => {
  const m = MODELS.find(x => x.id === "ote_institutional_ob");
  assert.ok(m.sequence.includes("array_mitigated"));
  const base = {
    hour: 10, bias: "bearish", lastSweepType: "BSL",
    hasSweep: true, hasReversal: true, mss: true,
    hasOB: true, uniqueOBs: [{ proximal: 1.1 }],
    hasFVG: true, fvgs: [{ fillFraction: 0.2 }],
    arrayInPlay: true, consumedAtPrice: true, // consumed block at price
    oteZone: true, cisd: true, smt: true, htfRanging: true, displacement: true, hasDraw: true,
    lecture2: { hunt: { swept: true }, mss: { confirmed: true }, setupReady: true },
    lecture1: { formation: { formed: true }, raid: { active: true }, mss: { confirmed: true }, setupReady: true },
    lecture4: { gapClusters: { hasGaps: true }, substituteGap: false, gapDraw: { drawing: true }, mss: { confirmed: true }, setupReady: true },
  };
  const blocked = evaluateModel(m, base);
  assert.strictEqual(blocked.complete, false, "array step must fail against a consumed block");
  const arr = blocked.sequence.find(s => s.name === "array_mitigated");
  assert.strictEqual(arr.pass, false);

  const allowed = evaluateModel(m, { ...base, consumedAtPrice: false });
  assert.strictEqual(allowed.complete, true, "fresh array + no consumed block → complete");
});
