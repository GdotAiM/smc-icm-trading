// tools/lib/draw.cjs
// Draw-on-liquidity target engine (Remediation WP-7 / audit Gap 2.5, Missing 5.5).
//
// A target is not "twice my risk." A target is the next pile of resting stops —
// the draw on liquidity. TP1 = the nearest unmitigated external pool in trade
// direction (BSL above for longs, SSL below for shorts). TP2 = the next pool,
// or the daily/weekly extreme. If no definable external draw exists, there is
// no trade — the absence of a draw is a filter, never a 1:1 measured-move
// fallback.
//
// Session extremes (previous London / NY-AM high-low) are passed in as draw
// references alongside the engine pools, so the operative window's own
// liquidity is on the map (Missing 5.5).

const UNMITIGATED = p => !p.swept && !p.mitigated;

function normalizeDirection(direction) {
  const d = String(direction || "").toLowerCase();
  if (d === "bullish" || d === "buy" || d === "long") return "long";
  if (d === "bearish" || d === "sell" || d === "short") return "short";
  return null;
}

function drawSide(dir) {
  return dir === "long" ? "BSL" : "SSL";
}

// Nearest unmitigated external liquidity pool in trade direction.
// For a long: the nearest BSL above price. For a short: the nearest SSL below.
// Returns { pool, type, price, distance } or null when no pool exists.
function nextDraw({ direction, liquidityMap, price, minDistance = 0 } = {}) {
  const dir = normalizeDirection(direction);
  if (!dir || !Array.isArray(liquidityMap) || liquidityMap.length === 0 || !Number.isFinite(price)) return null;
  const type = drawSide(dir);
  const eligible = liquidityMap
    .filter(p => p && p.type === type && UNMITIGATED(p) && Number.isFinite(p.price))
    .filter(p => (dir === "long" ? p.price > price : p.price < price))
    .filter(p => Math.abs(p.price - price) >= minDistance);
  if (eligible.length === 0) return null;
  eligible.sort((a, b) => Math.abs(a.price - price) - Math.abs(b.price - price));
  const pool = eligible[0];
  return { pool, type, price: pool.price, distance: Math.abs(pool.price - price) };
}

function extremeFallback(dir, extremes, anchor) {
  const list = (Array.isArray(extremes) ? extremes : []).filter(Number.isFinite);
  const beyond = list.filter(x => (dir === "long" ? x > anchor : x < anchor));
  if (beyond.length === 0) return null;
  beyond.sort((a, b) => (dir === "long" ? a - b : b - a));
  return beyond[0];
}

// TP1 = the nearest external pool; TP2 = the next pool or the daily/weekly
// extreme. Returns null (no trade) when no external draw exists in range.
function drawTargets({ direction, price, liquidityMap, extremes = [], minDistance = 0 } = {}) {
  const dir = normalizeDirection(direction);
  const t1 = nextDraw({ direction, liquidityMap, price, minDistance });
  if (!t1) return null;
  const type = drawSide(dir);
  const t2Pool = nextDraw({
    direction,
    liquidityMap: liquidityMap.filter(p => p !== t1.pool),
    price: t1.price,
  });
  let tp2 = null;
  if (t2Pool) {
    tp2 = { type: t2Pool.type, price: t2Pool.price, distance: Math.abs(t2Pool.price - t1.price), source: "pool", pool: t2Pool.pool };
  } else {
    const ext = extremeFallback(dir, extremes, t1.price);
    if (ext != null) tp2 = { type, price: ext, distance: Math.abs(ext - t1.price), source: "extreme", pool: null };
  }
  return {
    direction: dir,
    tp1: { type: t1.type, price: t1.price, distance: t1.distance, source: "pool", pool: t1.pool },
    tp2,
  };
}

// Human-readable reason for a draw target: names the pool / session level.
function drawReason(tp, label) {
  if (!tp) return "";
  const name = tp.pool?.label || tp.pool?.detail
    || (tp.source === "extreme" ? `${tp.type} (daily/weekly extreme)` : `${tp.type} pool`);
  return `${label} ${name} @ ${Number(tp.price).toFixed(5)}`;
}

module.exports = {
  nextDraw,
  drawTargets,
  drawReason,
  normalizeDirection,
  UNMITIGATED,
};
