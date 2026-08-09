// tests/lib_dealing_range.test.cjs
// WP-5 sweep-defined dealing range: range anchored to external liquidity sweeps,
// not last swings and not a 20-bar average.
const test = require("node:test");
const assert = require("node:assert");
const {
  findSweeps,
  computeDealingRange,
  getPremiumDiscount,
  NO_RANGE_REASON,
} = require("../tools/lib/dealing_range.cjs");

// Helper: build ascending candles. Bars are { open, high, low, close, time }.
function candles(specs) {
  return specs.map((c, i) => ({
    time: i,
    open: c[0],
    high: c[1],
    low: c[2],
    close: c[3],
  }));
}

test("computeDealingRange: range from sweep-to-sweep extremes with equilibrium at midpoint", () => {
  // 10 flat bars, then an external sweep above, then drift, then external
  // sweep below. Both sweeps must sit at index >= lookback (10) to be seen.
  const cs = candles([
    ...Array.from({ length: 10 }, () => [1.105, 1.12, 1.10, 1.11]),
    [1.105, 1.13, 1.105, 1.11], // external sweep above → high 1.13
    ...Array.from({ length: 9 }, () => [1.10, 1.115, 1.095, 1.105]),
    [1.105, 1.11, 1.09, 1.105], // external sweep below → low 1.09
  ]);
  const range = computeDealingRange(cs);
  assert.ok(range, "range should exist when both sides swept");
  assert.strictEqual(range.high, 1.13);
  assert.strictEqual(range.low, 1.09);
  assert.ok(Math.abs(range.equilibrium - 1.11) < 1e-9, "equilibrium at midpoint");
  assert.ok(Math.abs(range.range - 0.04) < 1e-9, "range width");
});

test("computeDealingRange: missing sweep above -> null (no last-swing fallback)", () => {
  const cs = [
    ...Array.from({ length: 12 }, () => [1.10, 1.12, 1.09, 1.11]),
    [1.10, 1.11, 1.08, 1.10], // external sweep below only
  ];
  assert.strictEqual(computeDealingRange(cs), null);
});

test("computeDealingRange: missing sweep below -> null (no last-swing fallback)", () => {
  const cs = [
    ...Array.from({ length: 12 }, () => [1.10, 1.12, 1.09, 1.11]),
    [1.10, 1.13, 1.11, 1.12], // external sweep above only
  ];
  assert.strictEqual(computeDealingRange(cs), null);
});

test("computeDealingRange: too few candles -> null", () => {
  assert.strictEqual(computeDealingRange([]), null);
  assert.strictEqual(computeDealingRange(candles([[1, 1.01, 0.99, 1]])), null);
});

test("computeDealingRange: descending candles reversed to ascending", () => {
  const asc = candles([
    ...Array.from({ length: 10 }, () => [1.105, 1.12, 1.10, 1.11]),
    [1.105, 1.13, 1.105, 1.11], // external sweep above
    ...Array.from({ length: 9 }, () => [1.10, 1.115, 1.095, 1.105]),
    [1.105, 1.11, 1.09, 1.105], // external sweep below
  ]);
  const cs = asc.reverse(); // stored descending
  const range = computeDealingRange(cs);
  assert.ok(range);
  assert.strictEqual(range.high, 1.13);
  assert.strictEqual(range.low, 1.09);
});

test("computeDealingRange: zone is PREMIUM above equilibrium, DISCOUNT below", () => {
  const cs = candles([
    ...Array.from({ length: 10 }, () => [1.105, 1.12, 1.10, 1.11]),
    [1.105, 1.13, 1.105, 1.11], // external sweep above → high 1.13
    ...Array.from({ length: 9 }, () => [1.10, 1.115, 1.095, 1.105]),
    [1.105, 1.11, 1.09, 1.105], // external sweep below → low 1.09
    [1.105, 1.11, 1.09, 1.105], // current close 1.105 < eq 1.11
  ]);
  const range = computeDealingRange(cs);
  assert.ok(range);
  assert.strictEqual(range.zone, "DISCOUNT");
  assert.strictEqual(getPremiumDiscount(range, range.price), "DISCOUNT");
  assert.strictEqual(getPremiumDiscount(range, 1.12), "PREMIUM");
  assert.strictEqual(getPremiumDiscount(range, 1.11), "MID");
});

test("getPremiumDiscount: null range -> null (trade has no operative range)", () => {
  assert.strictEqual(getPremiumDiscount(null, 1.11), null);
  assert.strictEqual(getPremiumDiscount(null, null), null);
});

test("findSweeps: identifies external sweeps on both sides", () => {
  const cs = candles([
    ...Array.from({ length: 10 }, () => [1.10, 1.12, 1.09, 1.11]),
    [1.10, 1.14, 1.11, 1.12], // raided prior highs → above sweep
    ...Array.from({ length: 5 }, () => [1.11, 1.13, 1.10, 1.12]),
    [1.11, 1.12, 1.08, 1.10], // raided prior lows → below sweep
  ]);
  const { above, below } = findSweeps(cs);
  assert.strictEqual(above.length, 1);
  assert.strictEqual(above[0].price, 1.14);
  assert.strictEqual(below.length, 1);
  assert.strictEqual(below[0].price, 1.08);
});

test("NO_RANGE_REASON: explicit block message", () => {
  assert.ok(NO_RANGE_REASON.length > 10);
  assert.match(NO_RANGE_REASON, /sweep/);
});
