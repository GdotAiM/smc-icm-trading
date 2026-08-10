// Prev-Day Lunch Inefficiency — ICT NY Lunch Reversal PDA
//
// Detects the inefficiency candle immediately BEFORE a NY lunch liquidity sweep
// (10:00–13:30 ET) and projects it forward as a key PDA level for the next day.
//
// ICT (CPI Day Video, 2026):
//   "When the buy-side is taken, you look for the inefficiency right before the
//    liquidity is taken. That's how you're picking it. You're not picking the FVG
//    right before that one — you're picking the one that's formed right before the
//    liquidity is taken, because it's part of a complex reversal, part of a macro
//    time, during a NY session lunch yesterday, and it's happening at a time when
//    reversals take place."
//
//   "If it trades up into it, it can set the tone for a shorting opportunity.
//    Reverse it for going long."

import type { Candle } from "./types";
import { atrSeries } from "./atr";
import { SMC_CONFIG, sessionForTime } from "./config";
import { findPivots } from "./pivots";

// ── Types ────────────────────────────────────────────────────────────────────

export type ImbalanceKind = "BISI" | "SIBI";
// BISI = Buy-side Imbalance Sell-side Inefficiency (bullish candle before sweep)
// SIBI = Sell-side Imbalance Buy-side Inefficiency (bearish candle before sweep)

export type LunchSweep = {
  /** Price level of the liquidity pool that got swept. */
  price: number;
  /** Direction of the sweep. */
  type: "BSL" | "SSL";
  /** Index in the candle array. */
  index: number;
  /** Timestamp of the sweep candle. */
  time: number;
};

export type LunchInefficiency = {
  /** Top (high) of the inefficiency zone. */
  top: number;
  /** Bottom (low) of the inefficiency zone. */
  bottom: number;
  /** The anchor price — the close of the inefficiency candle. */
  anchor: number;
  /** Classification: BISI or SIBI. */
  kind: ImbalanceKind;
  /** Whether a volume imbalance (VIB) exists — next open gaps past this close. */
  hasVolumeImbalance: boolean;
  /** Size of the VIB gap in price units (0 if none). */
  vibGap: number;
  /** Direction of the VIB gap: "up" = next open > close, "down" = next open < close. */
  vibDirection: "up" | "down" | null;
  /** Index of the inefficiency candle. */
  index: number;
  /** Timestamp of the inefficiency candle. */
  time: number;
  /** The ATR at the time, for size context. */
  atrAtTime: number;
};

export type PrevDayLunchResult = {
  /** Whether a qualifying lunch sweep + inefficiency pair was found. */
  found: boolean;
  /** The liquidity sweep that occurred during NY lunch. */
  sweep: LunchSweep | null;
  /** The inefficiency candle immediately before the sweep. */
  inefficiency: LunchInefficiency | null;
  /** The session date (NY) of the prior day. */
  sessionDate: string;
  /** Human-readable summary. */
  summary: string;
  /** Debug: how many lunch candles were analyzed. */
  lunchCandleCount: number;
};

// ── NY time helpers (DST-aware, same as config.ts) ─────────────────────────

function nyOffsetFor(ts: number): number {
  const d = new Date(ts);
  const year = d.getUTCFullYear();
  const mar1 = new Date(Date.UTC(year, 2, 1));
  const mar2ndSun = new Date(Date.UTC(year, 2, (14 - mar1.getUTCDay()) % 7 + 8, 7));
  const nov1 = new Date(Date.UTC(year, 10, 1));
  const nov1stSun = new Date(Date.UTC(year, 10, (7 - nov1.getUTCDay()) % 7 + 1, 6));
  return (ts >= mar2ndSun.getTime() && ts < nov1stSun.getTime()) ? -4 : -5;
}

function nyHourFor(ts: number): number {
  let h = new Date(ts).getUTCHours() + nyOffsetFor(ts);
  if (h < 0) h += 24;
  if (h >= 24) h -= 24;
  return h;
}

function nyDateFor(ts: number): string {
  const d = new Date(ts);
  if (d.getUTCHours() + nyOffsetFor(ts) < 0) {
    return new Date(ts - 86400000).toISOString().split("T")[0];
  }
  return d.toISOString().split("T")[0];
}

// ── Core Detection ──────────────────────────────────────────────────────────

/** NY lunch window start hour (inclusive). */
const LUNCH_START = 10; // 10:00 AM ET
/** NY lunch window end hour (inclusive). */
const LUNCH_END = 13;   // 1:30 PM ET — last full hour 13:00, but we include up to 13:30
/** Minimum ATR multiple for the inefficiency candle body to be meaningful. */
const MIN_INEFFICIENCY_BODY_ATR = 0.3;
/** Maximum bars before the sweep to look back for the inefficiency candle. */
const MAX_LOOKBACK_BARS = 3;

/**
 * Detect the NY lunch inefficiency that should be carried forward to the
 * next trading day.
 *
 * Call this on the PRIOR day's candle data (1m or 5m timeframe).
 * The result can be projected forward as a PDA level for today's session.
 */
export function detectLunchInefficiency(candles: Candle[]): PrevDayLunchResult {
  const n = candles.length;
  if (n < 20) {
    return {
      found: false,
      sweep: null,
      inefficiency: null,
      sessionDate: candles.length > 0 ? nyDateFor(candles[0].time) : "unknown",
      summary: "Insufficient candle data (need at least 20 candles)",
      lunchCandleCount: 0,
    };
  }

  const atr = atrSeries(candles);
  const sessionDate = nyDateFor(candles[Math.floor(n / 2)]?.time ?? candles[0].time);

  // ── Step 1: Isolate NY lunch candles ──────────────────────────────────
  const lunchIndices: number[] = [];
  for (let i = 0; i < n; i++) {
    const h = nyHourFor(candles[i].time);
    const m = new Date(candles[i].time).getUTCMinutes();
    const nyMinutes = h * 60 + m;
    // Lunch window: 10:00 to 13:30 ET (600 to 810 NY minutes)
    if (nyMinutes >= 600 && nyMinutes <= 810) {
      lunchIndices.push(i);
    }
  }

  if (lunchIndices.length < 5) {
    return {
      found: false,
      sweep: null,
      inefficiency: null,
      sessionDate,
      summary: "Insufficient NY lunch candles (10:00-13:30 ET) in prior day data",
      lunchCandleCount: lunchIndices.length,
    };
  }

  // ── Step 2: Find sweeps during lunch window ───────────────────────────
  const pivots = findPivots(candles);
  const last = candles[n - 1].close;

  // Find the last BSL sweep and last SSL sweep within the lunch window
  let lastBSLSweep: LunchSweep | null = null;
  let lastSSLSweep: LunchSweep | null = null;

  for (const pivot of pivots) {
    // Only consider pivots within the lunch window
    const h = nyHourFor(pivot.time);
    const m = new Date(pivot.time).getUTCMinutes();
    const nyMinutes = h * 60 + m;
    if (nyMinutes < 600 || nyMinutes > 810) continue;

    // Check if this pivot's pool was swept after it formed
    const sweep = detectSweep(candles, pivot, atr);
    if (!sweep) continue;

    if (sweep.type === "BSL") {
      if (!lastBSLSweep || sweep.index > lastBSLSweep.index) {
        lastBSLSweep = sweep;
      }
    } else {
      if (!lastSSLSweep || sweep.index > lastSSLSweep.index) {
        lastSSLSweep = sweep;
      }
    }
  }

  // Pick the most recent sweep (by index) that happened during lunch
  const sweeps = [lastBSLSweep, lastSSLSweep].filter(Boolean) as LunchSweep[];
  sweeps.sort((a, b) => b.index - a.index);
  const chosenSweep = sweeps[0] ?? null;

  if (!chosenSweep) {
    return {
      found: false,
      sweep: null,
      inefficiency: null,
      sessionDate,
      summary: "No liquidity sweep detected during NY lunch (10:00-13:30 ET)",
      lunchCandleCount: lunchIndices.length,
    };
  }

  // Verify the sweep happened during lunch hours
  const sweepHour = nyHourFor(chosenSweep.time);
  if (sweepHour < LUNCH_START || sweepHour > LUNCH_END + 1) {
    return {
      found: false,
      sweep: chosenSweep,
      inefficiency: null,
      sessionDate,
      summary: `Sweep found but outside lunch hours (hour ${sweepHour})`,
      lunchCandleCount: lunchIndices.length,
    };
  }

  // ── Step 3: Find the inefficiency candle right before the sweep ───────
  const inefficiency = findInefficiencyBeforeSweep(candles, chosenSweep, atr);

  if (!inefficiency) {
    return {
      found: false,
      sweep: chosenSweep,
      inefficiency: null,
      sessionDate,
      summary: `Lunch sweep found (${chosenSweep.type} @ ${chosenSweep.price.toFixed(5)}) but no qualifying inefficiency candle immediately before it`,
      lunchCandleCount: lunchIndices.length,
    };
  }

  // ── Step 4: Classify as BISI or SIBI ──────────────────────────────────
  const kind = classifyImbalance(candles, inefficiency.index, chosenSweep);

  return {
    found: true,
    sweep: chosenSweep,
    inefficiency: { ...inefficiency, kind },
    sessionDate,
    summary: `${kind} detected before NY lunch ${chosenSweep.type} sweep. ` +
      `Zone: ${inefficiency.bottom.toFixed(5)} – ${inefficiency.top.toFixed(5)} ` +
      `(anchor: ${inefficiency.anchor.toFixed(5)}). ` +
      `Carry forward to next session.`,
    lunchCandleCount: lunchIndices.length,
  };
}

// ── Internal helpers ────────────────────────────────────────────────────────

/**
 * Check whether a pivot's price level was swept (wicked through then closed
 * back on the correct side) after the pivot formed.
 */
function detectSweep(
  candles: Candle[],
  pivot: { price: number; type: "high" | "low"; index: number; time: number },
  _atr: number[],
): LunchSweep | null {
  const n = candles.length;

  for (let i = pivot.index + 1; i < n; i++) {
    const k = candles[i];
    if (pivot.type === "high") {
      // BSL sweep: wick through the high, closes back at or below
      if (k.high > pivot.price && k.close <= pivot.price) {
        return { price: pivot.price, type: "BSL", index: i, time: k.time };
      }
    } else {
      // SSL sweep: wick through the low, closes back at or above
      if (k.low < pivot.price && k.close >= pivot.price) {
        return { price: pivot.price, type: "SSL", index: i, time: k.time };
      }
    }
  }
  return null;
}

/**
 * Find the inefficiency candle immediately BEFORE the sweep candle.
 * ICT: "Go right into this candlestick right there. That is a buy-side to
 * balance sell-side inefficiency right before the liquidity was taken."
 *
 * Looks back up to MAX_LOOKBACK_BARS from the sweep to find the last opposite-
 * color candle with meaningful body size.
 */
function findInefficiencyBeforeSweep(
  candles: Candle[],
  sweep: LunchSweep,
  atr: number[],
): Omit<LunchInefficiency, "kind"> | null {
  const sweepIdx = sweep.index;

  // Look back from the candle just before the sweep
  for (let offset = 1; offset <= MAX_LOOKBACK_BARS; offset++) {
    const idx = sweepIdx - offset;
    if (idx < 1) break; // need at least one candle before for VIB check

    const c = candles[idx];
    const a = atr[idx] || 0;
    if (a === 0) continue;

    const body = Math.abs(c.close - c.open);

    // Must have meaningful body
    if (body / a < MIN_INEFFICIENCY_BODY_ATR) continue;

    // Check for volume imbalance: next candle open gaps past this close
    const nextCandle = candles[idx + 1];
    const vibResult = checkVIB(c, nextCandle);

    // The inefficiency candle must be in the direction OPPOSITE to the sweep
    // For BSL sweep → look for bullish candle (close > open)
    // For SSL sweep → look for bearish candle (close < open)
    const isBullish = c.close > c.open;
    const isBearish = c.close < c.open;

    if (sweep.type === "BSL" && isBullish) {
      return {
        top: c.high,
        bottom: c.low,
        anchor: c.close,
        hasVolumeImbalance: vibResult.has,
        vibGap: vibResult.gap,
        vibDirection: vibResult.direction,
        index: idx,
        time: c.time,
        atrAtTime: a,
      };
    }

    if (sweep.type === "SSL" && isBearish) {
      return {
        top: c.high,
        bottom: c.low,
        anchor: c.close,
        hasVolumeImbalance: vibResult.has,
        vibGap: vibResult.gap,
        vibDirection: vibResult.direction,
        index: idx,
        time: c.time,
        atrAtTime: a,
      };
    }
  }

  return null;
}

/**
 * Check for Volume Imbalance (VIB) between two consecutive candles.
 * ICT: "The next candlestick's open needs to be higher than this candlestick's
 * close. So anything like 25,166 even or higher would warrant annotating this
 * with a volume imbalance."
 */
function checkVIB(
  current: Candle,
  next: Candle,
): { has: boolean; gap: number; direction: "up" | "down" | null } {
  if (next.open > current.close) {
    return {
      has: true,
      gap: next.open - current.close,
      direction: "up",
    };
  }
  if (next.open < current.close) {
    return {
      has: true,
      gap: current.close - next.open,
      direction: "down",
    };
  }
  return { has: false, gap: 0, direction: null };
}

/**
 * Classify the imbalance kind based on the candle direction and sweep type.
 *
 * BISI: Buy-side Imbalance, Sell-side Inefficiency
 *   — Bullish candle (close > open) before a BSL sweep
 *   — The buy-side pushed price up, creating an inefficiency on the sell-side
 *   — When price returns to this zone, it acts as support-turned-resistance
 *
 * SIBI: Sell-side Imbalance, Buy-side Inefficiency
 *   — Bearish candle (close < open) before an SSL sweep
 *   — The sell-side pushed price down, creating an inefficiency on the buy-side
 *   — When price returns to this zone, it acts as resistance-turned-support
 */
function classifyImbalance(
  candles: Candle[],
  inefficiencyIdx: number,
  sweep: LunchSweep,
): ImbalanceKind {
  const c = candles[inefficiencyIdx];
  const isBullish = c.close > c.open;

  if (sweep.type === "BSL" && isBullish) return "BISI";
  if (sweep.type === "SSL" && !isBullish) return "SIBI";

  // Fallback: infer from candle direction
  return isBullish ? "BISI" : "SIBI";
}

// ── Event Horizon ───────────────────────────────────────────────────────────

/**
 * Event Horizon: The 50% midpoint between two liquidity pools.
 *
 * ICT: "Event horizon is the middle point between two pools of liquidity.
 * So when I was trading here, I could have very easily closed the trade
 * and been 'yay, look how smart I am.' But I wanted to stay with it...
 * try to get an attempt to get down to Event Horizon, then roll to stop
 * just above this pool of liquidity."
 *
 * This is used as a draw/target level — the magnetic midpoint between
 * competing liquidity that price is drawn toward.
 */
export function eventHorizon(upperPool: number, lowerPool: number): number {
  return (upperPool + lowerPool) / 2;
}

export type EventHorizonResult = {
  horizon: number;
  upperPool: number;
  lowerPool: number;
  distanceFromPrice: number;
  label: string;
};

/**
 * Find the nearest Event Horizon between two liquidity pools that bracket
 * the current price.
 */
export function nearestEventHorizon(
  bslPools: { price: number }[],
  sslPools: { price: number }[],
  currentPrice: number,
): EventHorizonResult | null {
  // Sort pools
  const bsl = [...bslPools].sort((a, b) => a.price - b.price);
  const ssl = [...sslPools].sort((a, b) => a.price - b.price);

  let best: EventHorizonResult | null = null;
  let bestDist = Infinity;

  // Check each BSL-SSL pair where BSL > SSL (meaningful bracket)
  for (const b of bsl) {
    for (const s of ssl) {
      if (b.price <= s.price) continue; // invalid bracket

      const horizon = eventHorizon(b.price, s.price);
      const dist = Math.abs(currentPrice - horizon);

      if (dist < bestDist) {
        bestDist = dist;
        best = {
          horizon,
          upperPool: b.price,
          lowerPool: s.price,
          distanceFromPrice: ((horizon - currentPrice) / currentPrice) * 100,
          label: `Event Horizon between BSL ${b.price.toFixed(5)} and SSL ${s.price.toFixed(5)}`,
        };
      }
    }
  }

  return best;
}

// ── Carry-forward projection ────────────────────────────────────────────────

export type CarryForwardLevel = {
  /** Top of the zone to project forward. */
  top: number;
  /** Bottom of the zone to project forward. */
  bottom: number;
  /** Midpoint (CE — consequent encroachment) of the zone. */
  midpoint: number;
  /** Original inefficiency kind (BISI → resistance, SIBI → support). */
  kind: ImbalanceKind;
  /** Expected behavior when price enters this zone. */
  expectedReaction: "bearish_reversal" | "bullish_reversal";
  /** The anchor close price. */
  anchor: number;
  /** Whether this zone has a volume imbalance component. */
  hasVIB: boolean;
  /** Source date of this level. */
  sourceDate: string;
  /** Source lunch sweep that created this level. */
  sourceSweepType: "BSL" | "SSL";
};

/**
 * Convert a detected lunch inefficiency into a level that can be carried
 * forward to the next trading day.
 */
export function toCarryForwardLevel(result: PrevDayLunchResult): CarryForwardLevel | null {
  if (!result.found || !result.inefficiency || !result.sweep) return null;

  const { inefficiency, sweep } = result;
  const midpoint = (inefficiency.top + inefficiency.bottom) / 2;

  // BISI before BSL sweep → when price returns to this zone, expect bearish reversal
  // SIBI before SSL sweep → when price returns to this zone, expect bullish reversal
  const expectedReaction: "bearish_reversal" | "bullish_reversal" =
    inefficiency.kind === "BISI" ? "bearish_reversal" : "bullish_reversal";

  return {
    top: inefficiency.top,
    bottom: inefficiency.bottom,
    midpoint,
    kind: inefficiency.kind,
    expectedReaction,
    anchor: inefficiency.anchor,
    hasVIB: inefficiency.hasVolumeImbalance,
    sourceDate: result.sessionDate,
    sourceSweepType: sweep.type,
  };
}
