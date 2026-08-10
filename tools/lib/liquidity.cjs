// tools/lib/liquidity.cjs
// ATR-relative equal highs/lows — THE liquidity-marking primitive (Remediation
// WP-6 / audit Gap 2.4, Gap 2.1).
//
// Two highs look "equal" to a human because the market trades in ATR-sized
// chunks: a 3-pip gap between highs means nothing on EURUSD, but the same
// 3 pips on a quiet morning is huge. Tolerance MUST be relative to the noise
// (ATR), not a fixed price fraction, or your "equal" levels are arbitrary.
//
//   - findRelativeEqualLevels(candles, atr) — clusters of swing highs/lows
//     within |p1 - p2| / ATR < 0.15. Detection is SYMMETRIC (both directions):
//     a stop cluster is a stop cluster whether the right shoulder is higher,
//     lower, or level — the old "right-shoulder" constraint dropped real
//     clusters and is gone.
//   - Each cluster is a LIQUIDITY OBJECT with a swept/unswept state (fuel
//     consumed or not) — the same fuel as an FVG, so the system never runs
//     dry on one brand of pump.
//
// This module is the ONLY producer of equal-high/low liquidity objects;
// liquidity_marker.cjs and lecture2_setup.cjs import from here.

const { calcATR } = require("./metrics.cjs");

const RELATIVE_EQ_TOLERANCE = 0.15; // |p1 - p2| / ATR < 0.15

function findSwings(candles, lookback = 2) {
  const lb = lookback || 2;
  const swings = [];
  if (!Array.isArray(candles) || candles.length < lb * 2 + 1) return swings;
  for (let i = lb; i < candles.length - lb; i++) {
    const c = candles[i];
    let isSwingHigh = true;
    let isSwingLow = true;
    for (let j = i - lb; j <= i + lb; j++) {
      if (j === i) continue;
      if (candles[j].high >= c.high) isSwingHigh = false;
      if (candles[j].low <= c.low) isSwingLow = false;
    }
    if (isSwingHigh) swings.push({ index: i, price: c.high, type: "high", time: c.time });
    if (isSwingLow) swings.push({ index: i, price: c.low, type: "low", time: c.time });
  }
  return swings;
}

// ATR-relative equal highs/lows, symmetric in both directions. Each match is a
// cluster (the zone between the two levels) carrying its swept/unswept state.
// `swept` is computed over the FULL candles array: an equal-high cluster is
// swept once price has traded STRICTLY ABOVE its top (a tag at the level is
// not a raid); an equal-low cluster once price traded strictly below its
// bottom.
function findRelativeEqualLevels(candles, atr, { lookback = 2 } = {}) {
  const bars = Array.isArray(candles) ? candles : [];
  if (bars.length < lookback * 2 + 3) return { highs: [], lows: [] };
  const tolerance = (atr || 1) * RELATIVE_EQ_TOLERANCE;
  const swings = findSwings(bars, lookback);
  const highs = swings.filter(s => s.type === "high");
  const lows = swings.filter(s => s.type === "low");
  const eqHighs = [];
  const eqLows = [];

  for (let i = 0; i < highs.length - 1; i++) {
    for (let j = i + 1; j < highs.length; j++) {
      if (Math.abs(highs[i].price - highs[j].price) < tolerance) {
        const top = Math.max(highs[i].price, highs[j].price);
        const bottom = Math.min(highs[i].price, highs[j].price);
        eqHighs.push({
          type: "equalHighs",
          price: top, // the level stops rest above
          top,
          bottom,
          firstIndex: highs[i].index,
          secondIndex: highs[j].index,
          firstTime: highs[i].time,
          secondTime: highs[j].time,
          swept: bars.some(c => c.high > top),
          detail: `Relative equal highs ${bottom.toFixed(5)} — ${top.toFixed(5)} (${((Math.abs(highs[i].price - highs[j].price) / (atr || 1)) * 100).toFixed(1)}% ATR apart)`,
        });
        break; // one cluster per level
      }
    }
  }

  for (let i = 0; i < lows.length - 1; i++) {
    for (let j = i + 1; j < lows.length; j++) {
      if (Math.abs(lows[i].price - lows[j].price) < tolerance) {
        const top = Math.max(lows[i].price, lows[j].price);
        const bottom = Math.min(lows[i].price, lows[j].price);
        eqLows.push({
          type: "equalLows",
          price: bottom, // the level stops rest below
          top,
          bottom,
          firstIndex: lows[i].index,
          secondIndex: lows[j].index,
          firstTime: lows[i].time,
          secondTime: lows[j].time,
          swept: bars.some(c => c.low < bottom),
          detail: `Relative equal lows ${bottom.toFixed(5)} — ${top.toFixed(5)} (${((Math.abs(lows[i].price - lows[j].price) / (atr || 1)) * 100).toFixed(1)}% ATR apart)`,
        });
        break; // one cluster per level
      }
    }
  }

  return { highs: eqHighs, lows: eqLows };
}

// Smoothness / energy grading — ICT "left smooth = unfinished business".
// A relative-equal level is only a high-probability magnet when it was created
// WITH ENERGY (displacing bodies into it), is still UNSWEPT, and price has
// bumped it without acceptance (probed the cluster zone but closed back outside
// the extreme). "Smooth" = the level was left clean; a bump w/o acceptance is
// the tell that the algorithmic delivery is unfinished.
function gradeEqualLevelSmoothness(level, candles, atr, opts = {}) {
  const bars = Array.isArray(candles) ? candles : [];
  if (!level || !atr || atr <= 0 || bars.length < 5) return null;

  const spreadAtr = (level.top - level.bottom) / atr;
  const isHigh = level.type === "equalHighs";

  // Energy = average body (in ATR units) of candles leading INTO the second touch.
  const second = Number.isInteger(level.secondIndex) ? level.secondIndex : bars.length - 1;
  const from = Math.max(0, second - 10);
  let bodySum = 0, count = 0;
  for (let i = from; i < second; i++) {
    const c = bars[i];
    if (!c || !Number.isFinite(c.open) || !Number.isFinite(c.close)) continue;
    bodySum += Math.abs(c.close - c.open);
    count++;
  }
  const energy = count > 0 ? bodySum / count / atr : 0;
  const energyOk = energy >= 0.4;

  // Bump without acceptance: price poked INTO the cluster zone but closed back
  // outside the level's extreme. Because an unswept cluster has never exceeded
  // its extreme, any such probe is "bumped, not accepted" = unfinished business.
  let bump = false, bumpTime = null;
  for (let i = Math.max(0, second); i < bars.length; i++) {
    const c = bars[i];
    if (!c) continue;
    const probed = isHigh
      ? (c.high > level.bottom && c.close < level.top)
      : (c.low < level.top && c.close > level.bottom);
    if (probed) { bump = true; bumpTime = c.time; break; }
  }

  const tight = spreadAtr <= RELATIVE_EQ_TOLERANCE * 0.8; // 0.12 ATR or tighter
  const resting = !level.swept;
  const magnet = resting && energyOk && bump;
  const smooth = resting && energyOk && tight && !bump;
  const grade = magnet ? "MAGNET" : smooth ? "SMOOTH" : resting && energyOk ? "NEUTRAL" : "CHOPPY";

  return {
    smooth,
    energy: Number(energy.toFixed(2)),
    energyOk,
    bump,
    bumpTime,
    magnet,
    resting,
    tight,
    spreadAtr: Number(spreadAtr.toFixed(2)),
    grade,
    detail: `[${grade}] equal ${isHigh ? "highs" : "lows"} ${Number(level.bottom).toFixed(5)}–${Number(level.top).toFixed(5)} | energy ${energy.toFixed(1)}×ATR | spread ${spreadAtr.toFixed(2)} ATR${bump ? " | bumped w/o acceptance = unfinished business" : resting ? " | resting clean" : " | swept"}`,
  };
}

module.exports = {
  findSwings,
  findRelativeEqualLevels,
  gradeEqualLevelSmoothness,
  calcATR,
  RELATIVE_EQ_TOLERANCE,
};
