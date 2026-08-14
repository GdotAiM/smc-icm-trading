// tools/lib/liquidity_cascade.cjs — WP-17: Fractal Liquidity Cascade
// =============================================================================
// ICT teaches that liquidity is fractal — every timeframe has its own pools,
// and the algorithm delivers price from one pool to the next in a cascade:
//
//   SESSION POOL (trigger) → DAILY POOL (TP1) → WEEKLY POOL (TP2)
//
// The session pool IS the entry trigger: a sweep + MSS at a session range
// high/low confirms the algorithm's direction for that session. The HTF pools
// are the DESTINATIONS — the previous day's high/low, the weekly extreme,
// the equal highs/lows that institutions engineered.
//
// This module organizes all liquidity into a single fractal hierarchy so the
// draw engine knows WHICH pool to target at each level of the cascade.
// =============================================================================

const UNMITIGATED = p => !p.swept && !p.mitigated;

/**
 * Build a fractal liquidity cascade from engine reports, session ranges,
 * and daily reference levels.
 *
 * Returns a structured hierarchy:
 *   sessionPools  — today's/prev day's session ranges (TRIGGERS)
 *   dailyPools    — PDH/PDL, prev AM high/low (TP1 DESTINATIONS)
 *   weeklyPools   — weekly swing extremes, equal highs/lows (TP2 DESTINATIONS)
 *   monthlyPools  — monthly range extremes (STRETCH TARGETS)
 */
function buildCascade({
  engineReports = {},      // { "1D": engineReport, "4H": engineReport, ... }
  oneTradeSetup = null,    // from one_trade_setup.cjs
  liquidityMarker = null,  // from liquidity_marker.cjs
  currentPrice = 0,
  dailyBias = "neutral",
}) {
  const cascade = {
    session: { triggers: [], swept: [], direction: null, detail: "" },
    daily:   { targets: [], primary: null, secondary: null, detail: "" },
    weekly:  { targets: [], primary: null, detail: "" },
    monthly: { targets: [], detail: "" },
  };

  // ═══ SESSION LEVEL — Entry Triggers ═══
  // These are the pools the algorithm raids to confirm direction.
  // Priority: P1 (prev day PM) → P2 (today London) → P3 (opening gap) → P4 (lunch)
  if (oneTradeSetup) {
    const sessionKeys = ["pm", "london", "openingGap", "lunch"];
    for (const key of sessionKeys) {
      const s = oneTradeSetup.sessions?.[key];
      if (!s?.range) continue;
      const raid = s.raidStatus || {};
      const pool = {
        source: key,
        label: s.label || key,
        priority: s.priority || 99,
        high: s.range.high,
        low: s.range.low,
        raided: raid.raided || false,
        mssConfirmed: raid.mssConfirmed || false,
        validRaid: raid.validRaid || false,
        sweepPrice: raid.sweepPrice || null,
        mssDirection: raid.mssDirection || null,
        // Determine if swept low (SSL → bullish) or swept high (BSL → bearish)
        sweptSide: raid.sweepPrice != null
          ? (raid.sweepPrice <= (s.range.low || Infinity) ? "SSL" :
             raid.sweepPrice >= (s.range.high || -Infinity) ? "BSL" : null)
          : null,
        expectedDirection: raid.sweepPrice != null
          ? (raid.sweepPrice <= (s.range.low || Infinity) ? "BUY" :
             raid.sweepPrice >= (s.range.high || -Infinity) ? "SELL" : null)
          : null,
      };
      cascade.session.triggers.push(pool);
      if (pool.raided) cascade.session.swept.push(pool);
    }

    // Sort by priority
    cascade.session.triggers.sort((a, b) => a.priority - b.priority);

    // The first swept pool with valid MSS locks the direction
    const locked = cascade.session.triggers.find(t => t.validRaid);
    if (locked) {
      cascade.session.direction = locked.expectedDirection;
      cascade.session.detail = `LOCKED: ${locked.label} ${locked.sweptSide} swept + MSS ${locked.mssDirection} → ${locked.expectedDirection} direction`;
    } else if (cascade.session.swept.length > 0) {
      const nextToLock = cascade.session.swept[0];
      cascade.session.detail = `AWAITING MSS: ${cascade.session.swept.length} pool(s) raided, none confirmed. Next to lock: ${nextToLock.label}`;
    } else {
      cascade.session.detail = "No session pools raided yet — waiting for first sweep";
    }
  }

  // ═══ DAILY LEVEL — TP1 Destinations ═══
  // Previous day's AM high/low, PDH/PDL. These are the algorithm's
  // first delivery target after the session confirms direction.
  const dailyTargets = [];

  // Previous day AM session (from One Trade Setup)
  if (oneTradeSetup?.prevAM) {
    const pa = oneTradeSetup.prevAM;
    if (pa.high != null) dailyTargets.push({
      type: "BSL", price: pa.high, source: "prev_am_high",
      label: `Prev AM High (${pa.date || 'yesterday'})`, tier: "daily",
    });
    if (pa.low != null) dailyTargets.push({
      type: "SSL", price: pa.low, source: "prev_am_low",
      label: `Prev AM Low (${pa.date || 'yesterday'})`, tier: "daily",
    });
  }

  // PDH/PDL from liquidity marker
  if (liquidityMarker?.pdhPdl) {
    const p = liquidityMarker.pdhPdl;
    if (p.pdh != null) dailyTargets.push({
      type: "BSL", price: p.pdh, source: "pdh",
      label: `Previous Day High`, tier: "daily",
    });
    if (p.pdl != null) dailyTargets.push({
      type: "SSL", price: p.pdl, source: "pdl",
      label: `Previous Day Low`, tier: "daily",
    });
  }

  // PWH/PWL (previous week high/low)
  if (liquidityMarker?.pwhPwl) {
    const p = liquidityMarker.pwhPwl;
    if (p.pwh != null) dailyTargets.push({
      type: "BSL", price: p.pwh, source: "pwh",
      label: `Previous Week High`, tier: "weekly",
    });
    if (p.pwl != null) dailyTargets.push({
      type: "SSL", price: p.pwl, source: "pwl",
      label: `Previous Week Low`, tier: "weekly",
    });
  }

  cascade.daily.targets = dailyTargets;

  // Nearest daily target in the trade direction
  if (dailyBias === "bullish") {
    const above = dailyTargets.filter(t => t.type === "BSL" && t.price > currentPrice);
    above.sort((a, b) => a.price - b.price);
    cascade.daily.primary = above[0] || null;
    cascade.daily.secondary = above[1] || null;
    cascade.daily.detail = cascade.daily.primary
      ? `BUY: nearest BSL above = ${cascade.daily.primary.label} @ ${cascade.daily.primary.price}`
      : "No BSL draw above — no daily target for longs";
  } else if (dailyBias === "bearish") {
    const below = dailyTargets.filter(t => t.type === "SSL" && t.price < currentPrice);
    below.sort((a, b) => b.price - a.price);
    cascade.daily.primary = below[0] || null;
    cascade.daily.secondary = below[1] || null;
    cascade.daily.detail = cascade.daily.primary
      ? `SELL: nearest SSL below = ${cascade.daily.primary.label} @ ${cascade.daily.primary.price}`
      : "No SSL draw below — no daily target for shorts";
  }

  // ═══ WEEKLY LEVEL — TP2 Destinations ═══
  // Unmitigated pools from 1D and 4H engine reports that are
  // beyond the daily targets — these are the algorithm's stretch goals.
  const weeklyTargets = [];
  for (const tf of ["1D", "4H"]) {
    const eng = engineReports[tf];
    if (!eng?.liquidity) continue;
    const unmitigated = eng.liquidity.filter(UNMITIGATED);
    for (const pool of unmitigated) {
      // Only include pools beyond the daily primary
      const isBeyond = dailyBias === "bullish"
        ? pool.price > (cascade.daily.primary?.price || currentPrice)
        : pool.price < (cascade.daily.primary?.price || currentPrice);
      if (isBeyond) {
        weeklyTargets.push({
          type: pool.type,
          price: pool.price,
          source: `engine_${tf.toLowerCase()}`,
          label: `${tf} ${pool.type} pool`,
          tier: "weekly",
          strength: pool.strength || 0,
        });
      }
    }
  }
  cascade.weekly.targets = weeklyTargets;
  if (dailyBias === "bullish") {
    const above = weeklyTargets.filter(t => t.type === "BSL" && t.price > (cascade.daily.primary?.price || currentPrice));
    above.sort((a, b) => a.price - b.price);
    cascade.weekly.primary = above[0] || null;
  } else if (dailyBias === "bearish") {
    const below = weeklyTargets.filter(t => t.type === "SSL" && t.price < (cascade.daily.primary?.price || currentPrice));
    below.sort((a, b) => b.price - a.price);
    cascade.weekly.primary = below[0] || null;
  }
  cascade.weekly.detail = cascade.weekly.primary
    ? `Next HTF draw: ${cascade.weekly.primary.label} @ ${cascade.weekly.primary.price}`
    : "No HTF draw beyond daily target";

  return cascade;
}

/**
 * Given a cascade and a direction, produce the ICT-correct draw targets:
 *   TP1 = nearest daily pool
 *   TP2 = nearest weekly pool (or next daily pool)
 */
function cascadeDrawTargets(cascade, direction) {
  if (!cascade) return null;
  const dir = direction === "LONG" || direction === "BUY" ? "bullish" : "bearish";

  const tp1 = cascade.daily?.primary;
  const tp2 = cascade.weekly?.primary || cascade.daily?.secondary;

  if (!tp1) return null; // no draw = no trade

  return {
    tp1: { price: tp1.price, type: tp1.type, label: tp1.label, source: tp1.source },
    tp2: tp2 ? { price: tp2.price, type: tp2.type, label: tp2.label, source: tp2.source } : null,
    cascade: {
      session: cascade.session?.detail || "No session context",
      daily: cascade.daily?.detail || "No daily target",
      weekly: cascade.weekly?.detail || "No weekly target",
    },
  };
}

module.exports = { buildCascade, cascadeDrawTargets };
