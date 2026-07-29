import type { Candle } from "./types";
import { SMC_CONFIG } from "./config";

export type Pivot = {
  index: number;
  price: number;
  time: number;
  type: "high" | "low";
};

/** Detect swing pivots in O(n · lookback). */
export function findPivots(
  candles: Candle[],
  lookback = SMC_CONFIG.pivotLookback,
): Pivot[] {
  const pivots: Pivot[] = [];
  const n = candles.length;
  for (let i = lookback; i < n - lookback; i++) {
    const c = candles[i];
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= lookback; j++) {
      if (candles[i - j].high >= c.high || candles[i + j].high >= c.high)
        isHigh = false;
      if (candles[i - j].low <= c.low || candles[i + j].low <= c.low)
        isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) pivots.push({ index: i, price: c.high, time: c.time, type: "high" });
    if (isLow) pivots.push({ index: i, price: c.low, time: c.time, type: "low" });
  }
  return pivots;
}
