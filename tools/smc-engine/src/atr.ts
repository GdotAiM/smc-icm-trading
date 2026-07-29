import type { Candle } from "./types";

/** Average True Range series using Wilder-style rolling mean. */
export function atrSeries(candles: Candle[], period = 14): number[] {
  const n = candles.length;
  const out: number[] = new Array(n).fill(0);
  if (n === 0) return out;

  const tr: number[] = new Array(n);
  tr[0] = candles[0].high - candles[0].low;
  for (let i = 1; i < n; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    tr[i] = Math.max(
      c.high - c.low,
      Math.abs(c.high - p.close),
      Math.abs(c.low - p.close),
    );
  }

  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += tr[i];
    if (i >= period) sum -= tr[i - period];
    out[i] = i >= period - 1 ? sum / period : sum / (i + 1);
  }
  return out;
}

export function lastAtr(candles: Candle[], period = 14): number {
  const s = atrSeries(candles, period);
  return s[s.length - 1] ?? 0;
}
