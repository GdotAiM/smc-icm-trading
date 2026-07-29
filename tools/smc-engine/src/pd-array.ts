import type { Candle } from "./types";
import { atrSeries } from "./atr";
import { SMC_CONFIG } from "./config";

export type PDZone = "premium" | "discount";

export type PDArrayResult = {
  /** The most recent significant dealing range (high â†’ low). */
  rangeHigh: number;
  rangeLow: number;
  /** 50 % midpoint â€” the "fair value" reference. */
  midpoint: number;
  /** Zone the current close sits in. */
  currentZone: PDZone;
  /** Distance of current price from midpoint (% of range). */
  zoneDistance: number;
  /** Description for UI / LLM. */
  description: string;
};

/**
 * Premium / Discount Array â€” identifies the most recent significant dealing
 * range on the chart and maps current price to premium (upper half) or
 * discount (lower half) relative to the midpoint.
 *
 * The dealing range is defined by the most recent significant swing high and
 * swing low that have at least `pdArrayBodyRatio` body/range ratio and ATR
 * prominence. This is a simplified PD Array â€” full ICT PD Arrays track
 * multiple nested ranges; we surface the dominant one.
 */
export function analyzePDArray(candles: Candle[]): PDArrayResult {
  const n = candles.length;
  const last = candles[n - 1].close;
  const atr = atrSeries(candles);

  // Find the most recent significant swing high and low.
  const ranges = findDealingRanges(candles, atr);
  if (!ranges) {
    return {
      rangeHigh: 0, rangeLow: 0, midpoint: 0,
      currentZone: "discount", zoneDistance: 0,
      description: "No clear dealing range identified",
    };
  }

  const { high: rangeHigh, low: rangeLow } = ranges;
  const midpoint = (rangeHigh + rangeLow) / 2;
  const range = rangeHigh - rangeLow;
  const zoneDistance = range > 0 ? (last - midpoint) / (range / 2) : 0; // -1..+1
  const currentZone: PDZone = last >= midpoint ? "premium" : "discount";
  const zonePct = ((last - rangeLow) / range) * 100;

  const desc = currentZone === "premium"
    ? `Price in premium (${zonePct.toFixed(0)}% of range). ${(zoneDistance * 50).toFixed(1)}% above midpoint`
    : `Price in discount (${zonePct.toFixed(0)}% of range). ${(Math.abs(zoneDistance) * 50).toFixed(1)}% below midpoint`;

  return { rangeHigh, rangeLow, midpoint, currentZone, zoneDistance, description: desc };
}

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function findDealingRanges(
  candles: Candle[],
  atr: number[],
): { high: number; low: number } | null {
  const n = candles.length;
  if (n < 10) return null;

  const ratio = SMC_CONFIG.pdArrayBodyRatio;
  const lookback = Math.min(n, SMC_CONFIG.dailyBiasLookback);

  let sigHigh = -Infinity;
  let sigLow = Infinity;
  let highIdx = -1;
  let lowIdx = -1;

  for (let i = 2; i < lookback - 2; i++) {
    const c = candles[i];
    const a = atr[i] || 0;
    if (a === 0) continue;

    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low;
    if (range === 0) continue;

    // Fractal swing high with body prominence
    if (
      c.high > candles[i - 1].high &&
      c.high > candles[i - 2].high &&
      c.high > candles[i + 1].high &&
      c.high > candles[i + 2].high &&
      body / range >= ratio &&
      body / a >= SMC_CONFIG.pdArrayBodyRatio
    ) {
      if (i > highIdx && c.high > sigHigh) {
        sigHigh = c.high;
        highIdx = i;
      }
    }

    // Fractal swing low with body prominence
    if (
      c.low < candles[i - 1].low &&
      c.low < candles[i - 2].low &&
      c.low < candles[i + 1].low &&
      c.low < candles[i + 2].low &&
      body / range >= ratio &&
      body / a >= SMC_CONFIG.pdArrayBodyRatio
    ) {
      if (i > lowIdx && c.low < sigLow) {
        sigLow = c.low;
        lowIdx = i;
      }
    }
  }

  if (sigHigh === -Infinity || sigLow === Infinity) return null;

  // Ensure we return the most recent complete dealing range:
  // if the most recent swing was a high, pair it with the preceding significant low
  if (highIdx > lowIdx) {
    // find the previous significant low before highIdx
    let prevLow = Infinity;
    for (let i = highIdx - 1; i >= 2; i--) {
      const c = candles[i];
      const a = atr[i] || 0;
      if (a === 0) continue;
      if (c.low < candles[i - 1].low && c.low < candles[i - 2].low && c.low < candles[i + 1].low) {
        prevLow = c.low;
        break;
      }
    }
    if (prevLow < Infinity) sigLow = prevLow;
  } else {
    // find the previous significant high before lowIdx
    let prevHigh = -Infinity;
    for (let i = lowIdx - 1; i >= 2; i--) {
      const c = candles[i];
      const a = atr[i] || 0;
      if (a === 0) continue;
      if (c.high > candles[i - 1].high && c.high > candles[i - 2].high && c.high > candles[i + 1].high) {
        prevHigh = c.high;
        break;
      }
    }
    if (prevHigh > -Infinity) sigHigh = prevHigh;
  }

  return sigHigh > sigLow ? { high: sigHigh, low: sigLow } : null;
}
