// tests/lib_narrative.test.cjs
// WP-4 dominance-chain bias: hierarchy of dominance, not a vote.
const test = require("node:test");
const assert = require("node:assert");
const { resolveBias, confidenceFromConfluence, nearUnmitigatedPdArray, describeBias } = require("../tools/lib/narrative.cjs");

test("resolveBias: 1W governs over everything", () => {
  const res = resolveBias({ bias1W: "bullish", bias1D: "bearish", bias4H: "bearish" });
  assert.strictEqual(res.direction, "bullish");
  assert.strictEqual(res.governingTF, "1W");
  assert.strictEqual(res.pullback, false);
});

test("resolveBias: 1D governs when 1W neutral", () => {
  const res = resolveBias({ bias1W: "neutral", bias1D: "bearish", bias4H: "bullish" });
  assert.strictEqual(res.direction, "bearish");
  assert.strictEqual(res.governingTF, "1D");
});

test("resolveBias: 4H governs when 1W/1D neutral", () => {
  const res = resolveBias({ bias1W: null, bias1D: "neutral", bias4H: "bullish" });
  assert.strictEqual(res.direction, "bullish");
  assert.strictEqual(res.governingTF, "4H");
});

test("resolveBias: all neutral -> neutral, no governing TF", () => {
  const res = resolveBias({ bias1W: "neutral", bias1D: "neutral", bias4H: "neutral", bias1H: "neutral" });
  assert.strictEqual(res.direction, "neutral");
  assert.strictEqual(res.governingTF, null);
});

test("resolveBias: opposing 1H yields pullback label, never a vote", () => {
  const res = resolveBias({ bias1W: "bullish", bias1D: "bullish", bias4H: "bullish", bias1H: "bearish" });
  assert.strictEqual(res.direction, "bullish");
  assert.strictEqual(res.pullback, true);
});

test("resolveBias: aligned 1H is not a pullback", () => {
  const res = resolveBias({ bias1W: "bearish", bias1D: "bearish", bias4H: "bearish", bias1H: "bearish" });
  assert.strictEqual(res.direction, "bearish");
  assert.strictEqual(res.pullback, false);
});

test("DoD table: {1W,1D,4H} combos -> governing bias", () => {
  const cases = [
    [{ bias1W: "bullish", bias1D: "bearish", bias4H: "bullish" }, "bullish"],
    [{ bias1W: "bearish", bias1D: "bullish", bias4H: "bearish" }, "bearish"],
    [{ bias1W: "neutral", bias1D: "bullish", bias4H: "bearish" }, "bullish"],
    [{ bias1W: "neutral", bias1D: "bearish", bias4H: "bullish" }, "bearish"],
    [{ bias1W: "neutral", bias1D: "neutral", bias4H: "bearish" }, "bearish"],
    [{ bias1W: "neutral", bias1D: "neutral", bias4H: "bullish" }, "bullish"],
    [{ bias1W: "neutral", bias1D: "neutral", bias4H: "neutral" }, "neutral"],
    [{ bias1W: undefined, bias1D: "bullish", bias4H: "bearish" }, "bullish"],
    [{ bias1W: null, bias1D: null, bias4H: null }, "neutral"],
  ];
  for (const [input, expected] of cases) {
    assert.strictEqual(resolveBias(input).direction, expected, JSON.stringify(input));
  }
});

test("confidenceFromConfluence: nothing visible -> 0 / NONE", () => {
  const res = confidenceFromConfluence();
  assert.strictEqual(res.confidence, 0);
  assert.strictEqual(res.agreement, "NONE");
});

test("confidenceFromConfluence: killzone only -> 40 / WEAK", () => {
  const res = confidenceFromConfluence({ inKillzone: true });
  assert.strictEqual(res.confidence, 40);
  assert.strictEqual(res.agreement, "WEAK");
});

test("confidenceFromConfluence: killzone + PD array -> 70 / MODERATE", () => {
  const res = confidenceFromConfluence({ inKillzone: true, nearPdArray: true });
  assert.strictEqual(res.confidence, 70);
  assert.strictEqual(res.agreement, "MODERATE");
});

test("confidenceFromConfluence: all three capped at 95 / STRONG (never 100)", () => {
  const res = confidenceFromConfluence({ inKillzone: true, nearPdArray: true, hasDraw: true });
  assert.strictEqual(res.confidence, 95);
  assert.strictEqual(res.agreement, "STRONG");
});

test("confidenceFromConfluence: pullback never swings confidence", () => {
  const base = confidenceFromConfluence({ inKillzone: true, nearPdArray: true });
  const withPullback = confidenceFromConfluence({ inKillzone: true, nearPdArray: true, hasDraw: false });
  assert.strictEqual(base.confidence, withPullback.confidence);
  assert.strictEqual(base.agreement, withPullback.agreement);
});

test("nearUnmitigatedPdArray: price inside zone -> true", () => {
  const res = nearUnmitigatedPdArray(1.15, { orderBlocks: [{ top: 1.16, bottom: 1.14 }], fvgs: [] });
  assert.strictEqual(res, true);
});

test("nearUnmitigatedPdArray: within one zone-height -> true", () => {
  const res = nearUnmitigatedPdArray(1.12, { orderBlocks: [{ top: 1.16, bottom: 1.14 }], fvgs: [] });
  assert.strictEqual(res, true); // dist 0.02 = zone height 0.02
});

test("nearUnmitigatedPdArray: beyond one zone-height -> false", () => {
  const res = nearUnmitigatedPdArray(1.10, { orderBlocks: [{ top: 1.16, bottom: 1.14 }], fvgs: [] });
  assert.strictEqual(res, false); // dist 0.04 > 0.02
});

test("nearUnmitigatedPdArray: mitigated OB ignored", () => {
  const res = nearUnmitigatedPdArray(1.15, { orderBlocks: [{ top: 1.16, bottom: 1.14, mitigated: true }], fvgs: [] });
  assert.strictEqual(res, false);
});

test("nearUnmitigatedPdArray: filled FVG ignored, partial counts", () => {
  const filled = nearUnmitigatedPdArray(1.15, { orderBlocks: [], fvgs: [{ top: 1.16, bottom: 1.14, fillFraction: 0.9 }] });
  assert.strictEqual(filled, false);
  const partial = nearUnmitigatedPdArray(1.15, { orderBlocks: [], fvgs: [{ top: 1.16, bottom: 1.14, fillFraction: 0.2 }] });
  assert.strictEqual(partial, true);
});

test("describeBias: neutral and pullback text", () => {
  assert.match(describeBias({ direction: "neutral", governingTF: null, pullback: false }), /neutral/);
  assert.match(describeBias({ direction: "bullish", governingTF: "1W", pullback: true }), /pullback/);
});
