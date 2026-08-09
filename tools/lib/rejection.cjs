// tools/lib/rejection.cjs
// WP-12 / audit 5.8 + Gap 4.2: rejection as a LEADING signal.
//
// A rejection wick is the market saying "no" — a long wick against the move at
// an extreme (demand below = bullish rejection; supply above = bearish
// rejection). It leads the entry: you act when the rejection candle CLOSES, not
// after a full reversal structure forms.
//
// Gap 4.2: the rejection BLOCK is an opposite-color candle at the extreme of a
// counter-trend move — NOT a mirror of the previous candle (that auto-generated
// version was wrong). This detector looks for the opposite-color candle whose
// wick rejected the extreme.
//
// detectRejection(candles, opts):
//   opts.direction = "bullish" (demand / rejection of the lows) | "bearish"
//   opts.lookback  = how many candles back to scan the most recent extreme (3)
//   Returns { detected, candle, wickRatio, extreme, detail }.

function detectRejection(candles, opts = {}) {
  if (!candles || candles.length < 3) return { detected: false, detail: "No candle data" };
  const direction = opts.direction === "bearish" ? "bearish" : "bullish";
  const lookback = Math.max(1, Math.min(opts.lookback ?? 3, candles.length - 1));
  const recent = candles.slice(-lookback - 1, -1); // exclude the forming candle

  for (let i = recent.length - 1; i >= 0; i--) {
    const c = recent[i];
    const range = Math.max(c.high - c.low, 1e-9);
    const wickBelow = (Math.min(c.open, c.close) - c.low) / range;
    const wickAbove = (c.high - Math.max(c.open, c.close)) / range;
    const bodyColor = c.close >= c.open ? "bullish" : "bearish";

    if (direction === "bullish") {
      // Demand: an opposite-color (bearish body) candle that REJECTED the lows
      // — price wick-dipped below the body then closed back above it.
      if (bodyColor !== "bearish") continue;
      const wickToLows = wickBelow;
      const minLow = Math.min(...recent.slice(0, i + 1).map(x => x.low));
      if (wickToLows >= 0.4 && c.low <= minLow + 1e-9) {
        return {
          detected: true,
          candle: c,
          wickRatio: wickToLows,
          extreme: c.low,
          direction,
          detail: `Bullish rejection at demand — bearish candle dipped to ${c.low} then rejected (lower wick ${(wickToLows * 100).toFixed(0)}% of range)`,
        };
      }
    } else {
      // Supply: an opposite-color (bullish body) candle that REJECTED the highs.
      if (bodyColor !== "bullish") continue;
      const wickToHighs = wickAbove;
      const maxHigh = Math.max(...recent.slice(0, i + 1).map(x => x.high));
      if (wickToHighs >= 0.4 && c.high >= maxHigh - 1e-9) {
        return {
          detected: true,
          candle: c,
          wickRatio: wickToHighs,
          extreme: c.high,
          direction,
          detail: `Bearish rejection at supply — bullish candle spiked to ${c.high} then rejected (upper wick ${(wickToHighs * 100).toFixed(0)}% of range)`,
        };
      }
    }
  }

  return { detected: false, detail: `no rejection wick for ${direction} in the last ${lookback} candles` };
}

module.exports = { detectRejection };
