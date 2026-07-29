import type { Candle } from "./types";
import { atrSeries } from "./atr";
import { SMC_CONFIG } from "./config";

export type DailyBias = "bullish" | "bearish" | "neutral";

export type DailyBiasResult = {
  bias: DailyBias;
  /** 0 (weak / mixed) â†’ 1 (strongly trending). */
  strength: number;
  /** How many consecutive aligned swings. */
  consecutiveSwings: number;
  /** Short description. */
  description: string;
};

/**
 * Daily-bias overlay.
 *
 * Analyzes a sequence of daily candles to determine the macro trend direction
 * independent of the intraday structure agent. Uses two complementary signals:
 *
 * 1. **Swing structure** â€” higher highs + higher lows (bullish) or
 *    lower highs + lower lows (bearish) among ATR-filtered pivots.
 * 2. **Short MA crossover** â€” price vs SMA(period/2) as a fast check.
 *
 * The two signals are combined: 2/2 agreement â†’ strong, 1/2 â†’ weak,
 * 0/2 â†’ neutral / ranging.
 */
export function analyzeDailyBias(candles: Candle[]): DailyBiasResult {
  const n = candles.length;
  if (n < 10) return { bias: "neutral", strength: 0, consecutiveSwings: 0, description: "Insufficient data" };

  const atr = atrSeries(candles);

  // â”€â”€ Signal 1: ATR-filtered swing progression â”€â”€
  // Compare the most recent significant swing high / low to the prior ones.
  const recent = candles.slice(-SMC_CONFIG.dailyBiasLookback);
  const minSwing = SMC_CONFIG.dailyBiasSwingAtr;

  // Find three most recent swing highs with ATR prominence.
  const swings = findDailySwings(recent, atr, minSwing);
  let swingSignal: "bullish" | "bearish" | "neutral" = "neutral";
  let consecutiveSwings = 0;

  if (swings.highs.length >= 2 && swings.lows.length >= 2) {
    const hUp = swings.highs[0] > swings.highs[1];   // most recent higher high
    const lUp = swings.lows[0] > swings.lows[1];      // most recent higher low
    const hDn = swings.highs[0] < swings.highs[1];
    const lDn = swings.lows[0] < swings.lows[1];

    if (hUp && lUp) {
      swingSignal = "bullish";
      consecutiveSwings = countConsecutiveDirection(swings, "bullish");
    } else if (hDn && lDn) {
      swingSignal = "bearish";
      consecutiveSwings = countConsecutiveDirection(swings, "bearish");
    } else if (hUp && !lDn) {
      swingSignal = "bullish";
      consecutiveSwings = 1;
    } else if (lDn && !hUp) {
      swingSignal = "bearish";
      consecutiveSwings = 1;
    }
  }

  // â”€â”€ Signal 2: Price vs fast SMA â”€â”€
  const fastPeriod = Math.max(3, Math.floor(SMC_CONFIG.dailyBiasLookback / 2));
  const smaFast = simpleMovingAverage(
    recent.map((c) => c.close),
    fastPeriod,
  );
  const lastPrice = recent[recent.length - 1].close;
  const smaVal = smaFast[smaFast.length - 1];
  let maSignal: "bullish" | "bearish" | "neutral" = "neutral";
  if (smaVal > 0) {
    maSignal = lastPrice > smaVal ? "bullish" : lastPrice < smaVal ? "bearish" : "neutral";
  }

  // â”€â”€ Combine â”€â”€
  const votes: ("bullish" | "bearish")[] = [];
  if (swingSignal !== "neutral") votes.push(swingSignal);
  if (maSignal !== "neutral") votes.push(maSignal);

  if (votes.length === 0) {
    return { bias: "neutral", strength: 0, consecutiveSwings: 0, description: "Ranging â€” no clear daily direction" };
  }

  const same = votes[0] === votes[votes.length - 1];
  const bias = votes[0] as DailyBias;
  const strength = same ? 1 : 0.5;

  const desc = bias === "bullish"
    ? `Daily uptrend (${consecutiveSwings} HH/HL, price ${lastPrice > smaVal ? "above" : "near"} SMA${fastPeriod})`
    : `Daily downtrend (${consecutiveSwings} LH/LL, price ${lastPrice < smaVal ? "below" : "near"} SMA${fastPeriod})`;

  return { bias, strength, consecutiveSwings, description: desc };
}

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type DailySwings = { highs: number[]; lows: number[] };

function findDailySwings(
  candles: Candle[],
  atr: number[],
  minAtr: number,
): DailySwings {
  const highs: number[] = [];
  const lows: number[] = [];
  const n = candles.length;
  // Use a simple 3-bar fractal on daily data
  for (let i = 1; i < n - 1; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const next = candles[i + 1];
    const a = atr[i] || 0;
    if (a === 0) continue;

    if (c.high > prev.high && c.high > next.high && c.close >= prev.close) {
      const ref = prev.low;
      const dist = Math.abs(c.high - ref) / a;
      if (dist >= minAtr) highs.push(c.high);
    }
    if (c.low < prev.low && c.low < next.low && c.close <= prev.close) {
      const ref = prev.high;
      const dist = Math.abs(c.low - ref) / a;
      if (dist >= minAtr) lows.push(c.low);
    }
  }
  return { highs: highs.reverse(), lows: lows.reverse() }; // most recent first
}

function countConsecutiveDirection(
  swings: DailySwings,
  dir: "bullish" | "bearish",
): number {
  const h = swings.highs;
  const l = swings.lows;
  const len = Math.min(h.length, l.length);
  let count = 1;
  for (let i = 1; i < len; i++) {
    if (dir === "bullish" && h[i] > h[i - 1] && l[i] > l[i - 1]) count++;
    else if (dir === "bearish" && h[i] < h[i - 1] && l[i] < l[i - 1]) count++;
    else break;
  }
  return count;
}

function simpleMovingAverage(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(0);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out[i] = i >= period - 1 ? sum / period : sum / (i + 1);
  }
  return out;
}
