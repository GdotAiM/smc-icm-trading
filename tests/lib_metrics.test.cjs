const test = require("node:test");
const assert = require("node:assert");
const { calcATR, structuralSL } = require("../tools/lib/metrics.cjs");

// Constant-range candles: TR = 6 every bar → Wilder ATR-14 = 6.000
function constRangeCandles(n) {
  return Array.from({ length: n }, () => ({ open: 100, high: 105, low: 99, close: 101 }));
}

test("calcATR: constant-range series returns that range (6.0)", () => {
  assert.strictEqual(calcATR(constRangeCandles(30), 14), 6);
});

test("calcATR: insufficient data returns null, never NaN", () => {
  assert.strictEqual(calcATR([], 14), null);
  assert.strictEqual(calcATR([{ high: 1, low: 0.5, close: 0.8 }], 14), null);
  assert.ok(Number.isNaN(calcATR(constRangeCandles(3), 14)) === false);
});

test("calcATR: non-array input returns null", () => {
  assert.strictEqual(calcATR(null, 14), null);
  assert.strictEqual(calcATR(undefined, 14), null);
});

test("structuralSL: bearish places SL above swing + buffer", () => {
  assert.strictEqual(structuralSL({ direction: "bearish", swingLevel: 100, atr: 6, bufferMultiple: 0.5 }), 103);
});

test("structuralSL: bullish places SL below swing - buffer", () => {
  assert.strictEqual(structuralSL({ direction: "bullish", swingLevel: 100, atr: 6, bufferMultiple: 0.5 }), 97);
});

test("structuralSL: null/negative ATR returns null (never fabricates a level)", () => {
  assert.strictEqual(structuralSL({ direction: "bearish", swingLevel: 100, atr: null }), null);
  assert.strictEqual(structuralSL({ direction: "bearish", swingLevel: 100, atr: -1 }), null);
});
