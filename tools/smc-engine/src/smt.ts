import type { Candle } from "./types";
import { atrSeries } from "./atr";
import { SMC_CONFIG } from "./config";

export type SMTDivergenceType = "bullish" | "bearish";

export type SMTDivergence = {
  type: SMTDivergenceType;
  /** 0.1 (weak) â€” 1.0 (clear). */
  severity: number;
  /** Index in the primary candles where divergence formed. */
  index: number;
  /** Timestamp of the divergence point. */
  time: number;
  /** Price at the divergence point (primary). */
  primaryPrice: number;
  /** Price at the divergence point (pair). */
  pairPrice: number;
  /** Description of the divergence signal. */
  description: string;
};

export type SMTResult = {
  divergences: SMTDivergence[];
  pairSymbol: string;
};

/**
 * SMT (Smart Money Technique) divergence detection.
 *
 * Compares the swing structure of the primary symbol against a correlated pair.
 * When the primary makes a higher high while the pair makes a lower high at an
 * aligned swing point, that's **bearish divergence** (the primary is likely to
 * reverse down). When the primary makes a lower low while the pair makes a
 * higher low, that's **bullish divergence**.
 *
 * Both candle arrays must use the same timeframe.
 */
export function analyzeSMT(
  primary: Candle[],
  pair: Candle[],
  pairSymbol: string,
): SMTResult {
  const lookback = SMC_CONFIG.smtLookbackBars;
  const minAtr = SMC_CONFIG.smtDivergenceAtr;

  // Chop to lookback windows for speed.
  const pCandles = primary.length <= lookback ? primary : primary.slice(-lookback);
  const qCandles = pair.length <= lookback ? pair : pair.slice(-lookback);

  const pAtr = atrSeries(pCandles);
  const qAtr = atrSeries(qCandles);

  // Find swing points (fractal highs/lows) in both arrays.
  const pSwings = alignedSwings(pCandles, pAtr, minAtr);
  const qSwings = alignedSwings(qCandles, qAtr, minAtr);

  // Merge-join by time: find swing points that occur near the same bar.
  const matched = matchSwings(pSwings, qSwings);

  const divergences: SMTDivergence[] = [];

  for (const m of matched) {
    // Bearish divergence: primary higher high, pair lower high.
    if (
      m.type === "high" &&
      m.primaryPrice > m.prevPrimary &&
      m.pairPrice < m.prevPair
    ) {
      const severity = Math.min(
        1,
        (m.primaryPrice / m.prevPrimary - m.pairPrice / m.prevPair) * 5,
      );
      divergences.push({
        type: "bearish",
        severity: Math.max(0.1, severity),
        index: m.index,
        time: m.time,
        primaryPrice: m.primaryPrice,
        pairPrice: m.pairPrice,
        description: `Bearish SMT: ${pairSymbol} failed to confirm the high â€” primary @ ${fmtPrice(m.primaryPrice)} vs pair @ ${fmtPrice(m.pairPrice)}`,
      });
    }

    // Bullish divergence: primary lower low, pair higher low.
    if (
      m.type === "low" &&
      m.primaryPrice < m.prevPrimary &&
      m.pairPrice > m.prevPair
    ) {
      const severity = Math.min(
        1,
        (m.pairPrice / m.prevPair - m.primaryPrice / m.prevPrimary) * 5,
      );
      divergences.push({
        type: "bullish",
        severity: Math.max(0.1, severity),
        index: m.index,
        time: m.time,
        primaryPrice: m.primaryPrice,
        pairPrice: m.pairPrice,
        description: `Bullish SMT: ${pairSymbol} failed to confirm the low â€” primary @ ${fmtPrice(m.primaryPrice)} vs pair @ ${fmtPrice(m.pairPrice)}`,
      });
    }
  }

  return {
    divergences: divergences.sort((a, b) => b.severity - a.severity),
    pairSymbol,
  };
}

// â”€â”€ Internal types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type SwingPoint = {
  index: number;
  time: number;
  type: "high" | "low";
  price: number;
};

type MatchedSwing = {
  index: number;
  time: number;
  type: "high" | "low";
  primaryPrice: number;
  pairPrice: number;
  prevPrimary: number;
  prevPair: number;
};

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Find fractal swing highs/lows and return them indexed for matching. */
function alignedSwings(
  candles: Candle[],
  atr: number[],
  minAtr: number,
): SwingPoint[] {
  const n = candles.length;
  const out: SwingPoint[] = [];
  for (let i = 1; i < n - 1; i++) {
    const c = candles[i];
    const a = atr[i] || 0;
    if (a === 0) continue;

    const prev = candles[i - 1];
    const next = candles[i + 1];

    if (c.high > prev.high && c.high > next.high) {
      const ref = prev.low;
      if (Math.abs(c.high - ref) / a >= minAtr) {
        out.push({ index: i, time: c.time, type: "high", price: c.high });
      }
    }
    if (c.low < prev.low && c.low < next.low) {
      const ref = prev.high;
      if (Math.abs(c.low - ref) / a >= minAtr) {
        out.push({ index: i, time: c.time, type: "low", price: c.low });
      }
    }
  }
  return out;
}

/**
 * Match swing points between primary and pair by finding swing pairs of the
 * same type whose timestamps are within 1.5Ã— the median bar interval of each
 * other, then pair them into consecutive matched pairs so we can compare
 * direction.
 */
function matchSwings(
  primary: SwingPoint[],
  pair: SwingPoint[],
): MatchedSwing[] {
  if (primary.length < 2 || pair.length < 2) return [];

  // Estimate bar interval from the first two primary swings.
  const barInterval = primary.length > 1
    ? (primary[primary.length - 1].time - primary[0].time) / primary.length
    : 60000;
  const tolerance = barInterval * 1.5;

  const matched: MatchedSwing[] = [];

  // For each primary swing, find the nearest pair swing of same type within tolerance.
  for (const ps of primary) {
    const best = pair
      .filter((qs) => qs.type === ps.type && Math.abs(qs.time - ps.time) <= tolerance)
      .reduce<(SwingPoint | null)>(
        (best, qs) =>
          !best || Math.abs(qs.time - ps.time) < Math.abs(best.time - ps.time)
            ? qs
            : best,
        null,
      );
    if (best) {
      matched.push({
        index: ps.index,
        time: ps.time,
        type: ps.type,
        primaryPrice: ps.price,
        pairPrice: best.price,
        prevPrimary: 0,
        prevPair: 0,
      });
    }
  }

  if (matched.length < 2) return [];

  // Fill in prevPrimary / prevPair from the previous matched swing of same type.
  for (let i = 1; i < matched.length; i++) {
    const prevSameType = matched
      .slice(0, i)
      .reverse()
      .find((m) => m.type === matched[i].type);
    if (prevSameType) {
      matched[i].prevPrimary = prevSameType.primaryPrice;
      matched[i].prevPair = prevSameType.pairPrice;
    }
  }

  return matched.filter((m) => m.prevPrimary > 0 && m.prevPair > 0);
}

function fmtPrice(p: number): string {
  return p < 1 ? p.toFixed(5) : p < 100 ? p.toFixed(3) : p.toFixed(2);
}
