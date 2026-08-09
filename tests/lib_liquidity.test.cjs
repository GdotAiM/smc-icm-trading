// tests/lib_liquidity.test.cjs
// WP-6 ATR-relative equal highs/lows — the liquidity-marking primitive.
const test = require("node:test");
const assert = require("node:assert");
const {
  findSwings,
  findRelativeEqualLevels,
  RELATIVE_EQ_TOLERANCE,
} = require("../tools/lib/liquidity.cjs");

function C(high, low, close) { return { open: close, high, low, close }; }

test("findSwings: identifies swing highs and lows", () => {
  const bars = [
    C(99.5, 99, 99.2), C(100, 99.4, 99.8), C(100.8, 99.6, 100.2), C(101.4, 99.8, 101),
    C(102, 100, 101.5), C(101.2, 100.2, 100.6), C(100.6, 99.8, 100.2), C(100, 99.4, 99.8),
    C(99.8, 99.2, 99.5), C(99.6, 99, 99.3), C(100.2, 99.4, 99.8),
  ];
  const swings = findSwings(bars, 2);
  assert.ok(swings.some(s => s.type === "high" && s.price === 102));
});

test("findRelativeEqualLevels: detects equal highs with ATR-relative tolerance", () => {
  const bars = [
    C(99.5, 99, 99.2), C(100, 99.4, 99.8), C(100.8, 99.6, 100.2), C(101.4, 99.8, 101),
    C(102, 100, 101.5), // swing high 1 = 102
    C(101.2, 100.2, 100.6), C(100.6, 99.8, 100.2), C(100, 99.4, 99.8),
    C(99.8, 99.2, 99.5), C(99.6, 99, 99.3),
    C(102.1, 99.4, 100.5), // swing high 2 = 102.1 (0.1 / ATR 1 = 10% < 15%)
    C(101.2, 99.8, 100.2), C(100.8, 99.6, 100),
  ];
  const { highs } = findRelativeEqualLevels(bars, 1);
  assert.strictEqual(highs.length, 1);
  assert.strictEqual(highs[0].type, "equalHighs");
  assert.strictEqual(highs[0].top, 102.1);
  assert.strictEqual(highs[0].price, 102.1);
  assert.strictEqual(highs[0].bottom, 102);
  assert.strictEqual(highs[0].swept, false);
});

test("findRelativeEqualLevels: detects equal lows", () => {
  const bars = [
    C(99.5, 99, 99.2), C(99.8, 98.9, 99.4), C(100.2, 98.6, 99.9), C(100, 98.3, 99.5),
    C(99.8, 98, 99.4), // swing low 1 = 98
    C(100.2, 98.4, 99.8), C(100.5, 98.7, 100), C(100.8, 99, 100.3),
    C(101, 99.3, 100.6), C(100.6, 99, 100.2),
    C(100.2, 98.05, 99.5), // swing low 2 = 98.05
    C(100.6, 98.4, 100), C(101, 98.8, 100.4),
  ];
  const { lows } = findRelativeEqualLevels(bars, 1);
  assert.strictEqual(lows.length, 1);
  assert.strictEqual(lows[0].type, "equalLows");
  assert.strictEqual(lows[0].bottom, 98);
  assert.strictEqual(lows[0].price, 98);
  assert.strictEqual(lows[0].swept, false);
});

test("ATR-relative tolerance: same gap is unequal at small ATR, equal at large ATR", () => {
  // Two swing highs 0.2 apart.
  const bars = [
    C(99.5, 99, 99.2), C(100, 99.4, 99.8), C(100.8, 99.6, 100.2), C(101.4, 99.8, 101),
    C(102, 100, 101.5),
    C(101.2, 100.2, 100.6), C(100.6, 99.8, 100.2), C(100, 99.4, 99.8),
    C(99.8, 99.2, 99.5), C(99.6, 99, 99.3),
    C(102.2, 99.4, 100.5), // 0.2 from 102
    C(101.2, 99.8, 100.2), C(100.8, 99.6, 100),
  ];
  assert.strictEqual(findRelativeEqualLevels(bars, 1).highs.length, 0);  // 0.2/1 = 20% >= 15%
  assert.strictEqual(findRelativeEqualLevels(bars, 2).highs.length, 1);  // 0.2/2 = 10% < 15%
});

test("symmetric detection: higher right shoulder is NOT dropped", () => {
  // Old one-sided constraint (right <= left * 1.001) would drop 102.2 > 102.102.
  const bars = [
    C(99.5, 99, 99.2), C(100, 99.4, 99.8), C(100.8, 99.6, 100.2), C(101.4, 99.8, 101),
    C(102, 100, 101.5),
    C(101.2, 100.2, 100.6), C(100.6, 99.8, 100.2), C(100, 99.4, 99.8),
    C(99.8, 99.2, 99.5), C(99.6, 99, 99.3),
    C(102.2, 99.4, 100.5), // right shoulder HIGHER than left
    C(101.2, 99.8, 100.2), C(100.8, 99.6, 100),
  ];
  assert.strictEqual(findRelativeEqualLevels(bars, 2).highs.length, 1);
});

test("swept state: cluster swept once price trades strictly above the top", () => {
  const unswept = [
    C(99.5, 99, 99.2), C(100, 99.4, 99.8), C(100.8, 99.6, 100.2), C(101.4, 99.8, 101),
    C(102, 100, 101.5), C(101.2, 100.2, 100.6), C(100.6, 99.8, 100.2), C(100, 99.4, 99.8),
    C(99.8, 99.2, 99.5), C(99.6, 99, 99.3), C(102.1, 99.4, 100.5), C(101.2, 99.8, 100.2), C(100.8, 99.6, 100),
  ];
  assert.strictEqual(findRelativeEqualLevels(unswept, 1).highs[0].swept, false);

  const swept = unswept.concat([C(103, 100.5, 101.5)]); // raid above top 102.1
  assert.strictEqual(findRelativeEqualLevels(swept, 1).highs[0].swept, true);
});

test("non-equal highs (beyond ATR tolerance) are not clustered", () => {
  const bars = [
    C(99.5, 99, 99.2), C(100, 99.4, 99.8), C(100.8, 99.6, 100.2), C(101.4, 99.8, 101),
    C(102, 100, 101.5), C(101.2, 100.2, 100.6), C(100.6, 99.8, 100.2), C(100, 99.4, 99.8),
    C(99.8, 99.2, 99.5), C(99.6, 99, 99.3), C(102.5, 99.4, 100.5), C(101.2, 99.8, 100.2), C(100.8, 99.6, 100),
  ];
  assert.strictEqual(findRelativeEqualLevels(bars, 1).highs.length, 0); // 0.5/1 = 50%
});

test("tolerance constant is the documented 0.15 ATR", () => {
  assert.strictEqual(RELATIVE_EQ_TOLERANCE, 0.15);
});

test("empty/insufficient candles return no levels", () => {
  assert.deepStrictEqual(findRelativeEqualLevels([], 1), { highs: [], lows: [] });
  assert.deepStrictEqual(findRelativeEqualLevels([C(1, 0.5, 0.8), C(1, 0.5, 0.8)], 1), { highs: [], lows: [] });
});
