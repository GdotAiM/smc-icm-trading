import type { Candle } from "./types";
import { findPivots, type Pivot } from "./pivots";
import { atrSeries } from "./atr";
import { SMC_CONFIG } from "./config";

export type StructureBias = "bullish" | "bearish" | "neutral";

export type StructureResult = {
  bias: StructureBias;
  lastEvent: "BOS" | "CHoCH" | "none";
  lastEventPrice?: number;
  lastEventTime?: number;
  confidence: number;
  /** Most recent confirmed swing high / low (used by downstream agents). */
  lastSwingHigh?: number;
  lastSwingLow?: number;
};

/**
 * Close-confirmed BOS / CHoCH state machine.
 *
 *  - Walks pivots chronologically.
 *  - A pivot is "valid" only if its prominence vs. ATR at that bar exceeds
 *    SMC_CONFIG.structureMinSwingAtr. This filters chop / wick noise.
 *  - A break event fires only when a *candle close* (not a wick) crosses
 *    the relevant swing â€” wick-only sweeps are intentionally ignored
 *    and reported by the liquidity agent instead.
 *  - BOS = continuation break in the prevailing trend.
 *  - CHoCH = first close beyond a counter-trend swing â€” flips bias.
 */
export function analyzeStructure(candles: Candle[]): StructureResult {
  const n = candles.length;
  if (n < 10) return { bias: "neutral", lastEvent: "none", confidence: 0 };

  const atr = atrSeries(candles);
  const pivots = findPivots(candles);

  // Filter pivots by ATR-relative prominence (drops micro chop).
  const minSwing = SMC_CONFIG.structureMinSwingAtr;
  const sig: Pivot[] = pivots.filter((p) => {
    const a = atr[p.index] || 0;
    if (a === 0) return true;
    // Compare to the nearest opposite-type pivot's price; if missing use
    // the 5-bar prior close as a proxy.
    const ref = pivots.find((q) => q.type !== p.type && q.index < p.index);
    const dist = ref
      ? Math.abs(p.price - ref.price)
      : Math.abs(p.price - candles[Math.max(0, p.index - 5)].close);
    return dist / a >= minSwing;
  });

  if (sig.length < 2) return { bias: "neutral", lastEvent: "none", confidence: 0 };

  let bias: StructureBias = "neutral";
  let lastEvent: "BOS" | "CHoCH" | "none" = "none";
  let lastEventPrice: number | undefined;
  let lastEventTime: number | undefined;

  // Track the most recent un-broken swing high / low.
  let activeHigh: Pivot | undefined;
  let activeLow: Pivot | undefined;

  // Iterate every candle; whenever a confirmed close breaks the active
  // swing, fire BOS or CHoCH.
  let pivotCursor = 0;
  for (let i = 0; i < n; i++) {
    // Promote any pivots whose index <= i into active slots.
    while (pivotCursor < sig.length && sig[pivotCursor].index <= i) {
      const p = sig[pivotCursor++];
      if (p.type === "high") activeHigh = p;
      else activeLow = p;
    }
    const close = candles[i].close;

    if (
      activeHigh &&
      activeHigh.index < i &&
      (SMC_CONFIG.structureRequireClose
        ? close > activeHigh.price
        : candles[i].high > activeHigh.price)
    ) {
      lastEventPrice = activeHigh.price;
      lastEventTime = candles[i].time;
      lastEvent = bias === "bullish" ? "BOS" : "CHoCH";
      bias = "bullish";
      activeHigh = undefined; // consumed
    }

    if (
      activeLow &&
      activeLow.index < i &&
      (SMC_CONFIG.structureRequireClose
        ? close < activeLow.price
        : candles[i].low < activeLow.price)
    ) {
      lastEventPrice = activeLow.price;
      lastEventTime = candles[i].time;
      lastEvent = bias === "bearish" ? "BOS" : "CHoCH";
      bias = "bearish";
      activeLow = undefined;
    }
  }

  const highs = sig.filter((p) => p.type === "high");
  const lows = sig.filter((p) => p.type === "low");
  const confidence = Math.min(1, (highs.length + lows.length) / 12);

  return {
    bias,
    lastEvent,
    lastEventPrice,
    lastEventTime,
    confidence,
    lastSwingHigh: highs[highs.length - 1]?.price,
    lastSwingLow: lows[lows.length - 1]?.price,
  };
}
