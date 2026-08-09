const test = require("node:test");
const assert = require("node:assert");
const { determineState, resolveCyclePhase, TRANSITIONS, detectNextTransition } = require("../tools/lib/cycle_phase.cjs");

function report(over = {}) {
  return {
    structure: { bias: "bearish", lastEvent: "none" },
    liquidity: [],
    volumeDisplacement: { label: "weak", atrRatio: 0.4 },
    fvgs: [],
    ...over,
  };
}

test("determineState: null / no structure → UNKNOWN, never fabricated", () => {
  assert.strictEqual(determineState(null).state, "UNKNOWN");
  assert.strictEqual(determineState({}).state, "UNKNOWN");
  assert.strictEqual(determineState({ structure: null }).state, "UNKNOWN");
});

test("determineState: sweep + CHoCH + non-neutral bias → MANIPULATION", () => {
  const st = determineState(report({
    structure: { bias: "bullish", lastEvent: "CHoCH" },
    liquidity: [{ swept: true }],
    volumeDisplacement: { label: "strong", atrRatio: 1.4 },
  }));
  assert.strictEqual(st.state, "MANIPULATION");
});

test("determineState: BOS + displacement → DISTRIBUTION", () => {
  const st = determineState(report({
    structure: { bias: "bearish", lastEvent: "BOS" },
    volumeDisplacement: { label: "strong", atrRatio: 1.2 },
  }));
  assert.strictEqual(st.state, "DISTRIBUTION");
});

test("determineState: high displacement + FVGs → EXPANSION", () => {
  const st = determineState(report({
    structure: { bias: "bullish", lastEvent: "BOS" },
    volumeDisplacement: { label: "strong", atrRatio: 2.6 },
    fvgs: [{}, {}, {}],
  }));
  assert.strictEqual(st.state, "EXPANSION");
});

test("determineState: neutral bias, no events → ACCUMULATION", () => {
  const st = determineState(report({ structure: { bias: "neutral", lastEvent: "none" } }));
  assert.strictEqual(st.state, "ACCUMULATION");
});

test("determineState: ambiguous non-neutral, no sweep/BOS → UNKNOWN (WP-3 no default)", () => {
  // bias non-neutral, displacement moderate, no sweep, no BOS/CHoCH
  const st = determineState(report({
    structure: { bias: "bearish", lastEvent: "none" },
    volumeDisplacement: { label: "moderate", atrRatio: 0.9 },
  }));
  assert.strictEqual(st.state, "UNKNOWN");
});

test("resolveCyclePhase: empty/missing reports → UNKNOWN", () => {
  assert.strictEqual(resolveCyclePhase(null).phase, "UNKNOWN");
  assert.strictEqual(resolveCyclePhase({}).phase, "UNKNOWN");
  assert.strictEqual(resolveCyclePhase({ "4H": null, "1H": null, "1D": null }).phase, "UNKNOWN");
});

test("resolveCyclePhase: prefers 4H when decisive, reports source", () => {
  const res = resolveCyclePhase({
    "4H": report({ structure: { bias: "bullish", lastEvent: "CHoCH" }, liquidity: [{ swept: true }] }),
    "1D": report({ structure: { bias: "neutral" } }),
  });
  assert.strictEqual(res.phase, "MANIPULATION");
  assert.strictEqual(res.source, "4H");
});

test("resolveCyclePhase: falls back to 1D when 4H/1H ambiguous", () => {
  const res = resolveCyclePhase({
    "4H": report({ structure: { bias: "bearish", lastEvent: "none" }, volumeDisplacement: { label: "moderate", atrRatio: 0.9 } }), // ambiguous
    "1H": null,
    "1D": report({ structure: { bias: "bullish", lastEvent: "BOS" }, volumeDisplacement: { label: "strong", atrRatio: 1.3 } }),
  });
  assert.strictEqual(res.phase, "DISTRIBUTION");
  assert.strictEqual(res.source, "1D");
});

test("TRANSITIONS: four canonical transitions exist with working checks", () => {
  assert.deepStrictEqual(Object.keys(TRANSITIONS).sort(), [
    "ACCUMULATION→MANIPULATION",
    "DISTRIBUTION→EXPANSION",
    "EXPANSION→ACCUMULATION",
    "MANIPULATION→DISTRIBUTION",
  ]);
  // A swept pool + non-neutral bias satisfies the first transition.
  const ready = TRANSITIONS["ACCUMULATION→MANIPULATION"].check(
    report({ structure: { bias: "bearish" }, liquidity: [{ swept: true }] })
  );
  assert.strictEqual(ready, true);
});

test("detectNextTransition: reports the outgoing transition for current state", () => {
  const t = detectNextTransition("ACCUMULATION", report({ structure: { bias: "bearish" }, liquidity: [{ swept: true }] }));
  assert.ok(t);
  assert.strictEqual(t.from, "ACCUMULATION");
  assert.strictEqual(t.to, "MANIPULATION");
  assert.strictEqual(t.ready, true);
});

test("detectNextTransition: null report returns null, never throws", () => {
  assert.strictEqual(detectNextTransition("MANIPULATION", null), null);
});
