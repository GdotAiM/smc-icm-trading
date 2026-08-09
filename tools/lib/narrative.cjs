// tools/lib/narrative.cjs
// Dominance-chain bias (Remediation WP-4 / audit Gap 3.1).
//
// Bias is a HIERARCHY OF DOMINANCE, not a democracy. A weighted vote across
// timeframes averages different questions: the weekly says "the month is
// bullish," the 1H says "there was a pullback this hour." Averaging those gives
// a meaningless number. Dominance says: the big context wins, and the small
// context tells you when to enter WITHIN it.
//
//   - Resolve in order: 1W governs -> if neutral, 1D governs -> if neutral, 4H
//     governs. 1H is the ENTRY timeframe only.
//   - A lower timeframe opposing the governing higher timeframe is labeled
//     PULLBACK, never a vote. A pullback never swings confidence.
//   - Confidence is recomputed from CONFLUENCE QUALITY (killzone window, PD
//     array proximity, liquidity draw) — what you can SEE — never from vote
//     margin.

function normalize(bias) {
  const b = String(bias == null ? "" : bias).toLowerCase().trim();
  if (b === "bullish" || b === "bull") return "bullish";
  if (b === "bearish" || b === "bear") return "bearish";
  return "neutral";
}

// Resolve 1W -> 1D -> 4H in order. 1H opposing the governing direction is a
// pullback label — never a swing in confidence.
function resolveBias({ bias1W, bias1D, bias4H, bias1H } = {}) {
  const w = normalize(bias1W);
  const d = normalize(bias1D);
  const h = normalize(bias4H);
  const entry = normalize(bias1H);

  let direction = "neutral";
  let governingTF = null;
  if (w !== "neutral") { direction = w; governingTF = "1W"; }
  else if (d !== "neutral") { direction = d; governingTF = "1D"; }
  else if (h !== "neutral") { direction = h; governingTF = "4H"; }

  const pullback = direction !== "neutral" && entry !== "neutral" && entry !== direction;
  return { direction, governingTF, pullback };
}

// Confidence from confluence quality, never vote margin.
//   inKillzone (WP-2 window)  +40
//   nearPdArray (unmitigated) +30
//   hasDraw (WP-7 liquidity draw engine — slot reserved) +30
// Capped at 95 — no fabricated "94%" from vote coincidence.
function confidenceFromConfluence({ inKillzone = false, nearPdArray = false, hasDraw = false } = {}) {
  let score = 0;
  if (inKillzone) score += 40;
  if (nearPdArray) score += 30;
  if (hasDraw) score += 30;
  const confidence = Math.min(score, 95);
  const agreement = confidence >= 80 ? "STRONG" : confidence >= 60 ? "MODERATE" : confidence >= 40 ? "WEAK" : "NONE";
  return { confidence, agreement, factors: { inKillzone, nearPdArray, hasDraw } };
}

// Price is "near" an unmitigated PD array if it is inside the zone or within
// one zone-height of its edges. OB unmitigated = no `mitigated` flag. FVG
// unmitigated = fillFraction < 0.5.
function nearUnmitigatedPdArray(price, { orderBlocks = [], fvgs = [] } = {}) {
  if (price == null) return false;
  const zones = [];
  for (const o of orderBlocks || []) {
    if (!o || o.mitigated) continue;
    if (typeof o.top === "number" && typeof o.bottom === "number") zones.push([o.bottom, o.top]);
  }
  for (const f of fvgs || []) {
    if (!f || (f.fillFraction || 0) >= 0.5) continue;
    if (typeof f.top === "number" && typeof f.bottom === "number") zones.push([f.bottom, f.top]);
  }
  for (const [lo, hi] of zones) {
    if (price >= lo && price <= hi) return true;
    const zoneHeight = Math.abs(hi - lo);
    const dist = price < lo ? lo - price : price - hi;
    if (dist <= zoneHeight) return true;
  }
  return false;
}

function describeBias({ direction, governingTF, pullback }) {
  if (direction === "neutral") return "No governing bias — 1W/1D/4H all neutral";
  const label = `GOVERNING ${direction.toUpperCase()} (${governingTF})`;
  return pullback
    ? `${label} — 1H pullback (enter within the trend, do not fight it)`
    : label;
}

module.exports = {
  resolveBias,
  confidenceFromConfluence,
  nearUnmitigatedPdArray,
  describeBias,
  normalize,
};
