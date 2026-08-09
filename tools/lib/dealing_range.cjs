// tools/lib/dealing_range.cjs
// Sweep-defined dealing range (Remediation WP-5 / audit Gap 2.2, Gap 2.3).
//
// A dealing range is defined by the two points where the algorithm swept
// EXTERNAL liquidity — a high that raided prior highs and a low that raided
// prior lows. It is NOT the last internal swing, and NOT a rolling 20-bar
// average. The range is the ring defined by the ropes that were actually
// struck: draw it from where the fighter last happened to stand and it moves
// every step.
//
//   - Scan back for the last external liquidity sweep ABOVE (a bar whose high
//     raided the highs of the prior `lookback` bars) and the last external
//     sweep BELOW (a bar whose low raided prior lows).
//   - Range = those two extremes. Equilibrium = midpoint. Premium = upper
//     half, Discount = lower half.
//   - If either side has no external sweep -> NO RANGE (null). Never fall
//     back to last swings. A trade without an operative dealing range is
//     blocked.
//
// This module is the SINGLE answer to "are we premium or discount?" —
// `getPremiumDiscount` replaces every 20-day-mean / midpoint variant.

const NO_RANGE_REASON = "No operative dealing range — missing external liquidity sweep on one/both sides.";

// Candle arrays are stored oldest -> newest (last element = current). If a
// `time` field is present and descending, reverse to ascending.
function candlesAscending(candles) {
  if (!Array.isArray(candles) || candles.length < 2) return true;
  const a = candles[0];
  const b = candles[candles.length - 1];
  if (a && b && a.time != null && b.time != null) return a.time <= b.time;
  return true;
}

// External liquidity sweeps: bar.high raiding the highs of the prior
// `lookback` bars (buy-side / BSL sweep above), bar.low raiding prior lows
// (sell-side / SSL sweep below). Returns both lists in bar order.
function findSweeps(candles, lookback = 10) {
  if (!Array.isArray(candles) || candles.length === 0) return { above: [], below: [] };
  const bars = candlesAscending(candles) ? candles : [...candles].reverse();
  const above = [];
  const below = [];
  for (let i = lookback; i < bars.length; i++) {
    const bar = bars[i];
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - lookback; j < i; j++) {
      if (bars[j].high > hi) hi = bars[j].high;
      if (bars[j].low < lo) lo = bars[j].low;
    }
    if (bar.high > hi) above.push({ index: i, price: bar.high });
    if (bar.low < lo) below.push({ index: i, price: bar.low });
  }
  return { above, below };
}

// Sweep-to-sweep dealing range. Returns null (NO RANGE) if either side has no
// external liquidity sweep — never falls back to last swings.
function computeDealingRange(candles, { lookback = 10 } = {}) {
  if (!Array.isArray(candles) || candles.length < lookback + 2) return null;
  const bars = candlesAscending(candles) ? candles : [...candles].reverse();
  const price = bars[bars.length - 1].close;
  const { above, below } = findSweeps(bars, lookback);
  const lastAbove = above[above.length - 1];
  const lastBelow = below[below.length - 1];
  if (!lastAbove || !lastBelow) return null;
  const high = lastAbove.price;
  const low = lastBelow.price;
  if (high <= low) return null;
  const range = high - low;
  const equilibrium = (high + low) / 2;
  const positionPct = ((price - low) / range) * 100;
  const zone = price >= equilibrium ? "PREMIUM" : "DISCOUNT";
  return {
    high,
    low,
    range,
    equilibrium,
    price,
    zone,
    positionPct: Number(positionPct.toFixed(2)),
    sweepAbove: { price: high, index: lastAbove.index },
    sweepBelow: { price: low, index: lastBelow.index },
    source: "sweep-to-sweep",
    detail: `Sweep-to-sweep dealing range: ${low} — ${high} (equilibrium ${equilibrium}, ${zone})`,
  };
}

// The single premium/discount answer: PREMIUM | DISCOUNT | MID, or null when
// no operative range exists.
function getPremiumDiscount(range, price) {
  if (!range || price == null) return null;
  const epsilon = Math.abs(range.range) * 1e-6; // FP-safe "at equilibrium"
  if (Math.abs(price - range.equilibrium) <= epsilon) return "MID";
  return price > range.equilibrium ? "PREMIUM" : "DISCOUNT";
}

module.exports = {
  findSweeps,
  computeDealingRange,
  getPremiumDiscount,
  candlesAscending,
  NO_RANGE_REASON,
};
