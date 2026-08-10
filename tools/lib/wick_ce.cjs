// Wick CE & Body Defense Utility
// ─────────────────────────────────────────────────────────────────────────────
// Shared utility for wick Consequent Encroachment (CE) computation and body
// defense checking. Eliminates duplicated CE logic across the codebase.
//
// ICT: "Mark the 50% midpoint (CE) of prominent wicks. Wicks can pierce CE,
// but candle bodies must NOT close past the CE level. If a candle closes below
// CE of a key defensive wick, expect deeper retracements."
//
// Usage:
//   const { computeWickCE, findDefensiveWicks, checkBodyDefense } = require("./lib/wick_ce.cjs");
// ─────────────────────────────────────────────────────────────────────────────

// ── Core computation ────────────────────────────────────────────────────────

/**
 * Compute wick CE (Consequent Encroachment) for a single candle.
 *
 * Wick CE = midpoint between the wick extreme and body close.
 * This is the level that must hold for the reversal to stay valid.
 *
 * @param {Object} c - Candle with {open, high, low, close}
 * @returns {{ upperCE: number, lowerCE: number, upperWick: number, lowerWick: number, wickRatio: number, dominantWick: 'upper'|'lower'|null, bodyClose: number }}
 */
function computeWickCE(c) {
  const body = Math.abs(c.close - c.open);
  const totalRange = c.high - c.low;
  if (totalRange === 0) {
    return { upperCE: null, lowerCE: null, upperWick: 0, lowerWick: 0, wickRatio: 0, dominantWick: null, bodyClose: c.close };
  }

  const upperWick = c.high - Math.max(c.open, c.close);
  const lowerWick = Math.min(c.open, c.close) - c.low;
  const maxWick = Math.max(upperWick, lowerWick);
  const wickRatio = maxWick / totalRange;

  const isUpperDominant = upperWick > lowerWick;
  const dominantWick = upperWick === lowerWick ? null : (isUpperDominant ? "upper" : "lower");

  // CE = midpoint between wick extreme and body close
  // Upper wick: extreme = high, CE = (high + bodyClose) / 2 = high - wickRange/2
  // Lower wick: extreme = low,  CE = (low + bodyClose) / 2  = low + wickRange/2
  const upperWickRange = c.high - c.close;
  const lowerWickRange = c.close - c.low;
  const upperCE = upperWick > 0 ? c.high - upperWickRange / 2 : null;
  const lowerCE = lowerWick > 0 ? c.low + lowerWickRange / 2 : null;

  return {
    upperCE: upperCE !== null ? Number(upperCE.toFixed(5)) : null,
    lowerCE: lowerCE !== null ? Number(lowerCE.toFixed(5)) : null,
    upperWick: Number(upperWick.toFixed(5)),
    lowerWick: Number(lowerWick.toFixed(5)),
    wickRatio: Number(wickRatio.toFixed(4)),
    dominantWick,
    bodyClose: c.close,
  };
}

// ── Defensive wick detection ────────────────────────────────────────────────

/**
 * Find defensive wicks in recent candles that align with a given direction.
 *
 * A "defensive wick" is a rejection wick where:
 *  - Wick is > 50% of total candle range
 *  - Body closes opposite the wick direction (rejection)
 *  - Wick range is at least 1.5x the average candle range (prominence filter)
 *
 * For a bullish bias, we look for LOWER wicks (support wicks).
 * For a bearish bias, we look for UPPER wicks (resistance wicks).
 *
 * @param {Array} candles - Array of candle objects
 * @param {string} bias - "bullish" or "bearish"
 * @param {number} lookback - Number of recent candles to scan (default 20)
 * @returns {Array} Sorted by wick prominence (largest first), most recent first on ties
 */
function findDefensiveWicks(candles, bias, lookback = 20) {
  if (!candles || candles.length < 5) return [];

  const recent = candles.slice(-lookback);
  const n = recent.length;

  // Compute average range for prominence filter
  const avgRange = recent.reduce((sum, c) => sum + (c.high - c.low), 0) / n;
  if (avgRange === 0) return [];

  const results = [];

  for (let i = 0; i < n; i++) {
    const c = recent[i];
    const wick = computeWickCE(c);

    // Must have a meaningful wick (>50% of range)
    if (wick.wickRatio < 0.5) continue;

    const totalRange = c.high - c.low;

    // Prominence filter: wick range must be >= 1.5x average range
    const wickRange = wick.dominantWick === "upper" ? wick.upperWick : wick.lowerWick;
    if (wickRange < avgRange * 1.5) continue;

    // Must be a rejection candle (body closes OPPOSITE wick direction)
    const isBullishCandle = c.close > c.open;
    const isBearishCandle = c.close < c.open;

    let direction = null;
    let wickCE = null;
    let wickExtreme = null;

    // For bullish context: look for lower wicks with bullish close (rejection of lower prices)
    if (bias === "bullish" && wick.dominantWick === "lower" && isBullishCandle) {
      direction = "bullish";
      wickCE = wick.lowerCE;
      wickExtreme = c.low;
    }
    // Also accept lower wicks on bearish candles that reversed (close > open) — stronger signal
    else if (bias === "bullish" && wick.dominantWick === "lower" && isBearishCandle) {
      direction = "bullish";
      wickCE = wick.lowerCE;
      wickExtreme = c.low;
    }
    // For bearish context: look for upper wicks with bearish close (rejection of higher prices)
    else if (bias === "bearish" && wick.dominantWick === "upper" && isBearishCandle) {
      direction = "bearish";
      wickCE = wick.upperCE;
      wickExtreme = c.high;
    }
    else if (bias === "bearish" && wick.dominantWick === "upper" && isBullishCandle) {
      direction = "bearish";
      wickCE = wick.upperCE;
      wickExtreme = c.high;
    }

    if (!direction) continue;

    results.push({
      candle: c,
      originalIndex: candles.length - lookback + i,
      wickCE,
      wickExtreme,
      direction,
      wickRatio: wick.wickRatio,
      bodyClose: c.close,
      bodyOpen: c.open,
      isBullishClose: c.close > c.open,
      detail: `${direction === "bullish" ? "Bullish-defensive" : "Bearish-defensive"} ${wick.dominantWick} wick | CE: ${wickCE?.toFixed(5)} | extreme: ${wickExtreme?.toFixed(5)} | wick ratio: ${wick.wickRatio.toFixed(2)}`,
    });
  }

  // Sort: largest wick ratio first, most recent on tie
  results.sort((a, b) => b.wickRatio - a.wickRatio || b.originalIndex - a.originalIndex);
  return results;
}

// ── Body defense check ──────────────────────────────────────────────────────

/**
 * Check whether candle bodies have defended (stayed on the correct side of)
 * a wick CE level.
 *
 * ICT: "I don't want to see any bodies buried south of its consequent
 * encroachment level." — Body CLOSE (not wick) must not cross CE.
 *
 * @param {Array} candles - Full candle array (1m preferred) to check against
 * @param {number} wickCE - The CE level to defend
 * @param {string} direction - "bullish" (bodies must stay ABOVE CE) or "bearish" (bodies must stay BELOW CE)
 * @param {number} fromIndex - Only check candles after this index (default: from where the wick was found)
 * @returns {{ defended: boolean, violationCandle: object|null, violationCount: number, detail: string }}
 */
function checkBodyDefense(candles, wickCE, direction, fromIndex = 0) {
  if (!candles || candles.length === 0) {
    return { defended: true, violationCandle: null, violationCount: 0, detail: "no candles to check" };
  }

  const startIdx = Math.max(0, fromIndex);
  let violationCandle = null;
  let violationCount = 0;

  for (let i = startIdx; i < candles.length; i++) {
    const c = candles[i];
    const bodyLow = Math.min(c.open, c.close);
    const bodyHigh = Math.max(c.open, c.close);

    if (direction === "bullish") {
      // For bullish defense: body must stay ABOVE CE
      // Violation: the ENTIRE body (both open and close) closes below CE
      if (bodyHigh < wickCE) {
        violationCount++;
        if (!violationCandle) {
          violationCandle = {
            index: i,
            time: c.time,
            bodyHigh,
            bodyLow,
            close: c.close,
            distanceBelow: Number((wickCE - bodyHigh).toFixed(5)),
            detail: `Body (${bodyLow.toFixed(5)}–${bodyHigh.toFixed(5)}) entirely below CE ${wickCE.toFixed(5)} — defense VIOLATED`,
          };
        }
      }
    } else if (direction === "bearish") {
      // For bearish defense: body must stay BELOW CE
      // Violation: the ENTIRE body closes above CE
      if (bodyLow > wickCE) {
        violationCount++;
        if (!violationCandle) {
          violationCandle = {
            index: i,
            time: c.time,
            bodyHigh,
            bodyLow,
            close: c.close,
            distanceAbove: Number((bodyLow - wickCE).toFixed(5)),
            detail: `Body (${bodyLow.toFixed(5)}–${bodyHigh.toFixed(5)}) entirely above CE ${wickCE.toFixed(5)} — defense VIOLATED`,
          };
        }
      }
    }
  }

  const defended = violationCount === 0;
  return {
    defended,
    violationCandle,
    violationCount,
    detail: defended
      ? `Body defense holding: all bodies on correct side of CE ${wickCE.toFixed(5)}`
      : `${violationCount} violation(s). First: ${violationCandle.detail}`,
  };
}

module.exports = { computeWickCE, findDefensiveWicks, checkBodyDefense };
