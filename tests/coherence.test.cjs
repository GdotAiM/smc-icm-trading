const test = require("node:test");
const assert = require("node:assert");
const { calculateWeightedBias, calculateCoherence } = require("../tools/pipeline/coherence_calculator.cjs");

test("calculateWeightedBias should correctly sum weights and determine direction", () => {
  const readings = {
    "1W": "bullish",
    "1D": "bullish",
    "4H": "bearish",
    "WeeklyProfile": "bullish",
    "OneTradeSetup": "bullish",
    "1H": "bearish"
  };
  const res = calculateWeightedBias(readings);
  assert.strictEqual(res.direction, "BULLISH");
  assert.strictEqual(res.bullishWeight, 8.0); // 3.0 + 2.5 + 1.5 + 1.0
  assert.strictEqual(res.bearishWeight, 2.5); // 2.0 + 0.5
  assert.strictEqual(res.confidence, 0.76); // 8.0 / 10.5 = 0.7619 -> 0.76
});

test("calculateCoherence should follow worst-dimension-wins rule", () => {
  const dims = [
    { name: "Structure", score: 0.9 },
    { name: "IPDA", score: 0.8 },
    { name: "Inducement", score: 0.0 }, // Hard gate zero
    { name: "Time", score: 1.0 }
  ];
  const res = calculateCoherence(dims);
  assert.strictEqual(res.score, 0);
  assert.strictEqual(res.status, "INVALIDATED");
  assert.strictEqual(res.minDimension, "Inducement");
});
