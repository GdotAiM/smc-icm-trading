import type { Candle } from "./types";
import { findPivots, type Pivot } from "./pivots";
import { atrSeries } from "./atr";
import { SMC_CONFIG, sessionForTime, type SessionName } from "./config";

export type LiquidityPool = {
  price: number;
  type: "BSL" | "SSL";
  /** Raw touch count (kept for backward compatibility / UI). */
  strength: number;
  /** Composite weighted score: touches Ã— recency Ã— session Ã— displacement. */
  score: number;
  distance: number;
  /** Session in which the most recent touch formed. */
  session: SessionName;
  /** Bars since most recent touch. */
  ageBars: number;
  /** Was the cluster swept (wicked through) without a close? */
  swept: boolean;
};

type Cluster = {
  price: number;
  touches: number;
  lastIndex: number;
  bestImpulseAtr: number;
  session: SessionName;
};

/** O(n log n) sort+sweep clustering. */
function clusterPivots(
  pivots: Pivot[],
  candles: Candle[],
  atr: number[],
  tolerance: number,
): Cluster[] {
  if (pivots.length === 0) return [];
  const sorted = [...pivots].sort((a, b) => a.price - b.price);
  const out: Cluster[] = [];

  let acc = { sum: sorted[0].price, touches: 1, anchor: sorted[0].price };
  let lastIndex = sorted[0].index;
  let bestImpulse = impulseAt(candles, atr, sorted[0].index);
  let session = sessionForTime(sorted[0].time);

  const flush = () => {
    out.push({
      price: acc.sum / acc.touches,
      touches: acc.touches,
      lastIndex,
      bestImpulseAtr: bestImpulse,
      session,
    });
  };

  for (let i = 1; i < sorted.length; i++) {
    const p = sorted[i];
    if (Math.abs(p.price - acc.anchor) / acc.anchor < tolerance) {
      acc.sum += p.price;
      acc.touches += 1;
      if (p.index > lastIndex) {
        lastIndex = p.index;
        session = sessionForTime(p.time);
      }
      bestImpulse = Math.max(bestImpulse, impulseAt(candles, atr, p.index));
    } else {
      flush();
      acc = { sum: p.price, touches: 1, anchor: p.price };
      lastIndex = p.index;
      bestImpulse = impulseAt(candles, atr, p.index);
      session = sessionForTime(p.time);
    }
  }
  flush();
  return out;
}

function impulseAt(candles: Candle[], atr: number[], idx: number): number {
  // Largest body in the 3 bars immediately following the pivot, ATR-scaled.
  let best = 0;
  for (let k = idx + 1; k <= Math.min(candles.length - 1, idx + 3); k++) {
    const a = atr[k] || 0;
    if (a === 0) continue;
    const body = Math.abs(candles[k].close - candles[k].open);
    best = Math.max(best, body / a);
  }
  return best;
}

function wasSwept(
  candles: Candle[],
  price: number,
  type: "BSL" | "SSL",
  fromIdx: number,
): boolean {
  for (let i = fromIdx + 1; i < candles.length; i++) {
    const k = candles[i];
    if (type === "BSL" && k.high > price && k.close <= price) return true;
    if (type === "SSL" && k.low < price && k.close >= price) return true;
  }
  return false;
}

function score(
  touches: number,
  ageBars: number,
  session: SessionName,
  impulseAtr: number,
): number {
  const recency = Math.pow(0.5, ageBars / SMC_CONFIG.liquidityHalfLifeBars);
  const sess = SMC_CONFIG.sessionWeight[session] ?? 1;
  // Prior displacement >1Ã— ATR boosts; weak pivots get penalised toward 0.7Ã—.
  const disp = 0.7 + Math.min(1, impulseAtr) * 0.6;
  return touches * recency * sess * disp;
}

export function analyzeLiquidity(candles: Candle[]): LiquidityPool[] {
  const n = candles.length;
  if (n === 0) return [];
  const pivots = findPivots(candles);
  const atr = atrSeries(candles);
  const last = candles[n - 1].close;
  const tol = SMC_CONFIG.liquidityTolerance;

  const highClusters = clusterPivots(
    pivots.filter((p) => p.type === "high"),
    candles,
    atr,
    tol,
  );
  const lowClusters = clusterPivots(
    pivots.filter((p) => p.type === "low"),
    candles,
    atr,
    tol,
  );

  const pools: LiquidityPool[] = [];

  for (const c of highClusters) {
    if (c.price <= last) continue;
    const age = n - 1 - c.lastIndex;
    pools.push({
      price: c.price,
      type: "BSL",
      strength: c.touches,
      score: score(c.touches, age, c.session, c.bestImpulseAtr),
      distance: ((c.price - last) / last) * 100,
      session: c.session,
      ageBars: age,
      swept: wasSwept(candles, c.price, "BSL", c.lastIndex),
    });
  }
  for (const c of lowClusters) {
    if (c.price >= last) continue;
    const age = n - 1 - c.lastIndex;
    pools.push({
      price: c.price,
      type: "SSL",
      strength: c.touches,
      score: score(c.touches, age, c.session, c.bestImpulseAtr),
      distance: ((last - c.price) / last) * 100,
      session: c.session,
      ageBars: age,
      swept: wasSwept(candles, c.price, "SSL", c.lastIndex),
    });
  }

  // Rank by composite score / proximity blend (higher is better).
  return pools
    .sort((a, b) => b.score / (1 + Math.abs(b.distance)) - a.score / (1 + Math.abs(a.distance)))
    .slice(0, SMC_CONFIG.maxLiquidityPools);
}

/**
 * Equal highs / equal lows â€” biggest cluster per side.
 * Returns the strongest engineered-liquidity level on each side.
 */
export function equalLevels(candles: Candle[]): {
  equalHighs: { price: number; touches: number } | null;
  equalLows: { price: number; touches: number } | null;
} {
  const pivots = findPivots(candles);
  const atr = atrSeries(candles);
  const tol = SMC_CONFIG.equalLevelTolerance;
  const pick = (type: "high" | "low") => {
    const clusters = clusterPivots(
      pivots.filter((p) => p.type === type),
      candles,
      atr,
      tol,
    );
    let best: { price: number; touches: number } | null = null;
    for (const c of clusters) {
      if (c.touches >= 2 && (!best || c.touches > best.touches))
        best = { price: c.price, touches: c.touches };
    }
    return best;
  };
  return { equalHighs: pick("high"), equalLows: pick("low") };
}
