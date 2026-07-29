import type { Candle } from "./types";
import { SMC_CONFIG } from "./config";

/** Simple moving average of volume over `period` bars. */
export function volumeSma(
  candles: Candle[],
  period = SMC_CONFIG.volumeSmaPeriod,
): number[] {
  const n = candles.length;
  const out: number[] = new Array(n).fill(0);
  if (n === 0) return out;

  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += candles[i].volume;
    if (i >= period) sum -= candles[i - period].volume;
    out[i] = i >= period - 1 ? sum / period : sum / (i + 1);
  }
  return out;
}

/** True when candle volume >= minMultiplier × SMA volume. */
export function isVolumeSpike(
  candles: Candle[],
  idx: number,
  sma: number[],
  minMultiplier = SMC_CONFIG.volumeSpikeMin,
): boolean {
  if (minMultiplier <= 0) return true;
  if (idx < 0 || idx >= candles.length) return false;
  const avg = sma[idx];
  if (avg === 0) return true;
  return candles[idx].volume / avg >= minMultiplier;
}
