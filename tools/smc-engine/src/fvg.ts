import type { Candle } from "./types";
import { atrSeries } from "./atr";
import { volumeSma, isVolumeSpike } from "./volume";
import { SMC_CONFIG } from "./config";

export type FVG = {
  top: number;
  bottom: number;
  type: "bullish" | "bearish";
  index: number;
  time: number;
  /** Gap size as a multiple of ATR at the displacement candle. */
  gapAtr: number;
  /** Middle-candle body as a multiple of ATR (displacement strength). */
  displacementAtr: number;
  /** 0 = untouched, 1 = fully filled. */
  fillFraction: number;
  distance: number;
};

/**
 * Significant Fair Value Gaps only.
 *
 *  - Standard 3-candle imbalance.
 *  - Gap size must be â‰¥ fvgMinGapAtr Ã— ATR (filters micro-gaps).
 *  - Middle (displacement) candle body must be â‰¥ fvgMinDisplacementAtr Ã— ATR
 *    â€” without displacement, the "FVG" is just a thin-volume bar pair.
 *  - Returns only FVGs still unmitigated below the configured fill fraction.
 */
export function analyzeFVG(candles: Candle[]): FVG[] {
  const n = candles.length;
  if (n < 4) return [];
  const last = candles[n - 1].close;
  const atr = atrSeries(candles);
  const volSma = volumeSma(candles);
  const fvgs: FVG[] = [];

  for (let i = 1; i < n - 1; i++) {
    const prev = candles[i - 1];
    const mid = candles[i];
    const next = candles[i + 1];
    const a = atr[i] || 0;
    if (a === 0) continue;

    const midBody = Math.abs(mid.close - mid.open);
    if (midBody / a < SMC_CONFIG.fvgMinDisplacementAtr) continue;
    if (!isVolumeSpike(candles, i, volSma)) continue;

    if (next.low > prev.high) {
      const gap = next.low - prev.high;
      if (gap / a < SMC_CONFIG.fvgMinGapAtr) continue;
      fvgs.push(makeFvg("bullish", prev.high, next.low, i, mid.time, candles, last, gap / a, midBody / a));
    } else if (next.high < prev.low) {
      const gap = prev.low - next.high;
      if (gap / a < SMC_CONFIG.fvgMinGapAtr) continue;
      fvgs.push(makeFvg("bearish", next.high, prev.low, i, mid.time, candles, last, gap / a, midBody / a));
    }
  }

  return fvgs
    .filter((f) => f.fillFraction < SMC_CONFIG.fvgMitigationFraction)
    .sort((a, b) => Math.abs(a.distance) - Math.abs(b.distance))
    .slice(0, SMC_CONFIG.maxFvgs);
}

function makeFvg(
  type: "bullish" | "bearish",
  bottom: number,
  top: number,
  index: number,
  time: number,
  candles: Candle[],
  last: number,
  gapAtr: number,
  displacementAtr: number,
): FVG {
  const range = top - bottom;
  let maxFill = 0;
  for (let j = index + 2; j < candles.length; j++) {
    const k = candles[j];
    if (type === "bullish") {
      if (k.low < top) {
        const filled = Math.min(top - k.low, range);
        maxFill = Math.max(maxFill, filled / range);
      }
    } else {
      if (k.high > bottom) {
        const filled = Math.min(k.high - bottom, range);
        maxFill = Math.max(maxFill, filled / range);
      }
    }
  }
  const mid = (top + bottom) / 2;
  const distance = type === "bullish"
    ? ((last - mid) / last) * 100
    : ((mid - last) / last) * 100;
  return { top, bottom, type, index, time, gapAtr, displacementAtr, fillFraction: maxFill, distance };
}

// â”€â”€ Inversion FVGs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type InversionFVG = {
  /** Original gap bounds. */
  top: number;
  bottom: number;
  type: "bullish" | "bearish" | "inversion";
  index: number;
  time: number;
  /** Gap size in ATR. */
  gapAtr: number;
  /** ATR at the reversal confirmation bar. */
  reversalAtr: number;
  /** How many bars after fill the bounce occurred. */
  confirmationLag: number;
  /** Distance from current price. */
  distance: number;
};

/**
 * Detect inversion FVGs â€” filled gaps that later produced a strong rejection
 * bounce, flipping the zone to support/resistance.
 *
 * Pass the same candles used by analyzeFVG. Returns IFVGs sorted by proximity.
 */
export function analyzeIFVG(candles: Candle[]): InversionFVG[] {
  const n = candles.length;
  if (n < 6) return [];
  const last = candles[n - 1].close;
  const atr = atrSeries(candles);
  const confBars = SMC_CONFIG.ifvgConfirmationBars;
  const minRev = SMC_CONFIG.ifvgMinReversalAtr;
  const fvgs: InversionFVG[] = [];

  for (let i = 1; i < n - 1; i++) {
    const prev = candles[i - 1];
    const midC = candles[i];
    const next = candles[i + 1];
    const a = atr[i] || 0;
    if (a === 0) continue;

    const gapBull = next.low > prev.high;
    const gapBear = next.high < prev.low;
    if (!gapBull && !gapBear) continue;

    const top = gapBull ? next.low : prev.low;
    const bottom = gapBull ? prev.high : next.high;
    const gapAtr = gapBull
      ? (next.low - prev.high) / a
      : (prev.low - next.high) / a;
    if (gapAtr < SMC_CONFIG.fvgMinGapAtr) continue;

    const origType: "bullish" | "bearish" = gapBull ? "bullish" : "bearish";

    // Find the first bar that fills the gap.
    let fillIdx = -1;
    for (let j = i + 2; j < n; j++) {
      const k = candles[j];
      if (origType === "bullish" && k.high >= top) { fillIdx = j; break; }
      if (origType === "bearish" && k.low <= bottom) { fillIdx = j; break; }
    }
    if (fillIdx < 0) continue;

    // After fill, look for a reversal candle with body in opposite direction,
    // closing back inside the original gap zone.
    for (let j = fillIdx + 1; j <= Math.min(n - 1, fillIdx + confBars); j++) {
      const k = candles[j];
      const revA = atr[j] || a;
      const body = Math.abs(k.close - k.open);
      if (body / revA < minRev) continue;

      const bounced = origType === "bullish"
        ? k.close < bottom && k.close < k.open  // bearish rejection inside gap
        : k.close > top && k.close > k.open;      // bullish rejection inside gap
      if (!bounced) continue;

      const mid = (top + bottom) / 2;
      const distance = origType === "bullish"
        ? ((last - mid) / last) * 100
        : ((mid - last) / last) * 100;
      fvgs.push({
        top, bottom, type: "inversion", index: i, time: midC.time,
        gapAtr, reversalAtr: body / revA, confirmationLag: j - fillIdx, distance,
      });
      break; // one IFVG per gap
    }
  }

  return fvgs
    .sort((a, b) => Math.abs(a.distance) - Math.abs(b.distance))
    .slice(0, SMC_CONFIG.maxFvgs);
}
