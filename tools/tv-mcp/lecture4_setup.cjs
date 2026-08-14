// ICT 2024 Lecture 4: 08:30 News + NDOG/NWOG Gap Model
// "Be at the screen by 08:30 AM (news) and by 09:30 AM (equity market open)."
// Official mechanics (audited against innercircletrader.net 2026-07-31):
//   1. Annotate NDOGs/NWOGs on daily — mark gap clusters above/below price
//   2. Apply Quarters Fibonacci (0, 0.25, 0.50, 0.75, 1.0) to each gap
//   3. Daily bias → bearish targets premium gaps, bullish targets discount gaps
//   4. After 08:30 news: price draws toward the bias-aligned gap cluster
//   5. 1m MSS confirms at the gap cluster
//   6. Entry on retracement to breaker block or FVG CE near the gap
//   7. SL beyond pre-MSS swing
//   8. TP at opposite gap cluster, prior session high/low, or relative equal levels
//   9. 0.25 quarter tap = gap won't fill on this leg → reduce TP expectations
// Usage: node tools/tv-mcp/lecture4_setup.cjs PAIR

const fs = require("fs");
const path = require("path");
const ny = require("../ny_time.cjs");

// ═══ Import shared helpers from Lecture 2 ═══
const L2 = require("./lecture2_setup.cjs");

const ROOT = "C:/Users/cash/smc-icm-trading";
const DATE = require("../ny_time.cjs").getNYDate();
const PAIR = process.argv[2] || "XAUUSD";

function getCandles(tf, dateOverride, rootOverride, pairOverride) {
  try {
    const d = dateOverride || DATE;
    const r = rootOverride || ROOT;
    const p = pairOverride || PAIR;
    let file = path.join(r, "shared", d, p, `candles_${tf}.json`);
    if (!fs.existsSync(file) && p === "XAUUSD") file = path.join(r, "shared", d, "GOLD", `candles_${tf}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch(e) { return null; }
}

function getEngineReport(tf, dateOverride, rootOverride, pairOverride) {
  try {
    const d = dateOverride || DATE;
    const r = rootOverride || ROOT;
    const p = pairOverride || PAIR;
    const file = path.join(r, "shared", d, p, `engine_${tf.toLowerCase()}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch(e) { return null; }
}

// ═══ 1. NDOG / NWOG DETECTION ═══
// Replicates gap_closer.cjs logic to avoid cross-module dependency
function detectGaps(dailyCandles) {
  if (!dailyCandles || dailyCandles.length < 3) {
    return { ndog: null, nwog: null, allGaps: [] };
  }

  const today = dailyCandles[dailyCandles.length - 1];
  const yesterday = dailyCandles[dailyCandles.length - 2];
  const gaps = [];

  // NDOG: gap between yesterday's close and today's open
  const ndogGap = today.open - yesterday.close;
  const ndogPct = yesterday.close !== 0 ? Math.abs(ndogGap) / yesterday.close * 100 : 0;
  let ndog = null;
  if (ndogPct > 0.05) {
    ndog = {
      type: "NDOG",
      top: Math.max(today.open, yesterday.close),
      bottom: Math.min(today.open, yesterday.close),
      gap: ndogGap,
      gapPct: ndogPct,
      direction: ndogGap > 0 ? "UP" : "DOWN",
      detail: `NDOG: ${Math.abs(ndogGap).toFixed(5)} ${ndogGap > 0 ? 'gap UP' : 'gap DOWN'} (${ndogPct.toFixed(2)}%)`
    };
    gaps.push(ndog);
  }

  // NWOG: gap between Friday close and Monday open (simplified)
  const dayNum = new Date().getDay();
  let nwog = null;
  if (dayNum === 1 && dailyCandles.length >= 5) {
    // Monday — check gap from Friday
    const friday = dailyCandles[dailyCandles.length - 2]; // previous trading day (Fri)
    const nwogGap = today.open - friday.close;
    const nwogPct = friday.close !== 0 ? Math.abs(nwogGap) / friday.close * 100 : 0;
    if (nwogPct > 0.1) {
      nwog = {
        type: "NWOG",
        top: Math.max(today.open, friday.close),
        bottom: Math.min(today.open, friday.close),
        gap: nwogGap,
        gapPct: nwogPct,
        direction: nwogGap > 0 ? "UP" : "DOWN",
        detail: `NWOG: ${Math.abs(nwogGap).toFixed(5)} ${nwogGap > 0 ? 'gap UP' : 'gap DOWN'} (${nwogPct.toFixed(2)}%)`
      };
      gaps.push(nwog);
    }
  }

  return { ndog, nwog, allGaps: gaps };
}

// ═══ 2. QUARTERS OF A GAP ═══
// ICT: Fibonacci subdivisions of NDOG/NWOG: 0, 0.25, 0.50, 0.75, 1.0
// 0.25 and 0.50 are the "most reactive references"
function applyQuarters(gap) {
  const range = gap.top - gap.bottom;
  return {
    q0: gap.top,                                          // 0.00 — gap top
    q025: gap.top - range * 0.25,                         // 0.25 — first reactive level
    q50: gap.bottom + range * 0.50,                       // 0.50 — CE of the gap (most reactive)
    q075: gap.top - range * 0.75,                         // 0.75
    q1: gap.bottom,                                       // 1.00 — gap bottom
    range: range,
  };
}

// ═══ 3. GAP CLUSTERS ═══
// Groups gaps into premium (above price) and discount (below price) clusters
function getGapClusters(gaps, currentPrice) {
  if (!gaps || gaps.allGaps.length === 0) {
    return { premium: [], discount: [], allGaps: [], hasGaps: false };
  }

  const premium = [];  // Gaps above current price
  const discount = []; // Gaps below current price

  for (const gap of gaps.allGaps) {
    const quarters = applyQuarters(gap);
    const enriched = { ...gap, quarters };

    if (gap.bottom > currentPrice) {
      premium.push(enriched);
    } else if (gap.top < currentPrice) {
      discount.push(enriched);
    } else {
      // Price is inside the gap — gap is being filled
      enriched.inside = true;
      if (gap.direction === "UP") {
        discount.push(enriched); // Gap below current (price above gap bottom)
      } else {
        premium.push(enriched);  // Gap above current (price below gap top)
      }
    }
  }

  return {
    premium,
    discount,
    allGaps: gaps.allGaps.map(g => ({ ...g, quarters: applyQuarters(g) })),
    hasGaps: true,
    detail: `${premium.length} premium gaps above, ${discount.length} discount gaps below`
  };
}

// ═══ 4. GAP DRAW DETECTION ═══
// After 08:30 AM, check if price is drawing toward the bias-aligned gap cluster
// Bearish bias → price should draw UP toward premium gaps (buy-side liquidity sweep)
// Bullish bias → price should draw DOWN toward discount gaps (sell-side liquidity sweep)
function detectGapDraw(gapClusters, candles5m, bias, atr5m) {
  if (!gapClusters || !gapClusters.hasGaps || !candles5m || candles5m.length < 5) {
    return { drawing: false, detail: "No gaps or insufficient candle data" };
  }

  const recent5m = candles5m.slice(-5);
  const currentPrice = recent5m[recent5m.length - 1].close;
  const prevPrice = recent5m[0].close;
  const priceDirection = currentPrice > prevPrice ? "UP" : currentPrice < prevPrice ? "DOWN" : "FLAT";

  if (bias === "bearish") {
    // Bearish: looking for price to draw UP into premium gaps (liquidity sweep)
    const premiumGaps = gapClusters.premium;
    if (premiumGaps.length === 0) {
      return { drawing: false, detail: "No premium gaps above price for bearish draw" };
    }
    // Find nearest premium gap
    const nearest = premiumGaps.reduce((a, b) => (a.bottom - currentPrice) < (b.bottom - currentPrice) ? a : b);
    const distanceToGap = nearest.bottom - currentPrice;
    const drawingUp = priceDirection === "UP" || (currentPrice >= prevPrice);

    return {
      drawing: drawingUp,
      direction: "UP (toward premium gaps)",
      targetCluster: "premium",
      nearestGap: nearest,
      distanceToGap,
      distanceAtr: atr5m > 0 ? distanceToGap / atr5m : 0,
      currentPrice,
      detail: drawingUp
        ? `Price drawing UP toward ${nearest.type} @ ${nearest.bottom.toFixed(5)} (${(distanceToGap / atr5m).toFixed(1)} ATR away)`
        : `Awaiting draw UP toward premium ${nearest.type} @ ${nearest.bottom.toFixed(5)}`
    };
  } else if (bias === "bullish") {
    // Bullish: looking for price to draw DOWN into discount gaps (liquidity sweep)
    const discountGaps = gapClusters.discount;
    if (discountGaps.length === 0) {
      return { drawing: false, detail: "No discount gaps below price for bullish draw" };
    }
    const nearest = discountGaps.reduce((a, b) => (currentPrice - a.top) < (currentPrice - b.top) ? a : b);
    const distanceToGap = currentPrice - nearest.top;
    const drawingDown = priceDirection === "DOWN" || (currentPrice <= prevPrice);

    return {
      drawing: drawingDown,
      direction: "DOWN (toward discount gaps)",
      targetCluster: "discount",
      nearestGap: nearest,
      distanceToGap,
      distanceAtr: atr5m > 0 ? distanceToGap / atr5m : 0,
      currentPrice,
      detail: drawingDown
        ? `Price drawing DOWN toward ${nearest.type} @ ${nearest.top.toFixed(5)} (${(distanceToGap / atr5m).toFixed(1)} ATR away)`
        : `Awaiting draw DOWN toward discount ${nearest.type} @ ${nearest.top.toFixed(5)}`
    };
  }

  return { drawing: false, detail: "Neutral bias — no directional gap draw expected" };
}

// ═══ 5. QUARTER TAP DETECTION ═══
// ICT: If price touches only the 0.25 quarter and reverses sharply,
// the gap will NOT fill on this leg → reduce TP expectations
function detectQuarterTap(gap, candles1m) {
  if (!gap || !gap.quarters || !candles1m || candles1m.length < 5) return null;

  const q = gap.quarters;
  const recent1m = candles1m.slice(-20);
  let touched025 = false, touched050 = false, touched075 = false;

  for (const c of recent1m) {
    // Check if price wicked into the gap quarters
    if (c.high >= q.q025 && c.high < q.q050) touched025 = true;
    if (c.high >= q.q050) touched050 = true;
    if (c.low <= q.q075 && c.low > q.q1) touched075 = true;
    if (c.low <= q.q1) touched075 = true; // Full fill
  }

  // Quarter tap signal: touched 0.25 but DID NOT reach 0.50
  if (touched025 && !touched050 && !touched075) {
    const lastClose = recent1m[recent1m.length - 1].close;
    const reversed = gap.direction === "UP"
      ? lastClose < q.q025  // Price rejected back below 0.25
      : lastClose > q.q025; // Price rejected back above 0.25

    return {
      detected: true,
      level: "0.25",
      reversed,
      detail: reversed
        ? `⚠️ 0.25 QUARTER TAP: Price only touched the 0.25 level of ${gap.type} and reversed. Gap will NOT fill on this leg — reduce TP expectations.`
        : `0.25 quarter touched but no clear reversal yet. Monitor.`
    };
  }

  if (touched050) {
    return { detected: false, detail: `Price reached 0.50+ quarter — gap fill is in progress (normal)` };
  }

  return null; // No quarter interaction yet
}

// ═══ 6. GAP-BASED ENTRY DETECTION ═══
// After MSS at the gap cluster, find breaker block or FVG near the gap for entry at CE
function getGapBasedEntry(gap, mss, candles1m, candles5m) {
  if (!gap || !mss || !mss.confirmed || !candles1m || candles1m.length < 5) {
    return { found: false, detail: "MSS not confirmed — no entry" };
  }

  // Try breaker block first (primary for Lecture 4)
  const breaker = L2.detectBreakerBlock(candles5m, { active: true, direction: mss.direction === "BEARISH" ? "BEARISH" : "BULLISH" }, mss);
  if (breaker && breaker.found) {
    return {
      found: true,
      source: "BREAKER",
      type: breaker.type,
      entry: breaker.entry, // CE of breaker block
      zone: { high: breaker.high, low: breaker.low },
      detail: `${breaker.type} @ ${breaker.entry.toFixed(5)} near ${gap.type}`
    };
  }

  // Fallback: find FVG near the gap zone
  const post7am1m = L2.filterAfterUTCHour(candles1m, 7);
  if (post7am1m.length < 4) return { found: false, detail: "No entry — insufficient 1m data" };

  // Look for FVGs near the gap
  const gapMid = (gap.top + gap.bottom) / 2;
  for (let i = 1; i < post7am1m.length - 1; i++) {
    const prev = post7am1m[i - 1];
    const next = post7am1m[i + 1];

    if (mss.direction === "BEARISH") {
      // Bearish entry: look for bearish FVG near premium gap
      if (next.high < prev.low && Math.abs(next.high - gapMid) < (gap.top - gap.bottom) * 2) {
        const fvgRange = prev.low - next.high;
        const ce = next.high + fvgRange * 0.50;
        return {
          found: true,
          source: "FVG",
          type: "BEARISH FVG",
          entry: ce,
          zone: { high: prev.low, low: next.high },
          detail: `Bearish FVG CE @ ${ce.toFixed(5)} near ${gap.type}`
        };
      }
    } else {
      // Bullish entry: look for bullish FVG near discount gap
      if (next.low > prev.high && Math.abs(next.low - gapMid) < (gap.top - gap.bottom) * 2) {
        const fvgRange = next.low - prev.high;
        const ce = prev.high + fvgRange * 0.50;
        return {
          found: true,
          source: "FVG",
          type: "BULLISH FVG",
          entry: ce,
          zone: { high: next.low, low: prev.high },
          detail: `Bullish FVG CE @ ${ce.toFixed(5)} near ${gap.type}`
        };
      }
    }
  }

  return { found: false, detail: `No breaker or FVG found near ${gap.type}` };
}

// ═══ 7. GAP-BASED TAKE PROFIT ═══
// Primary targets: opposite gap cluster, prior session high/low, relative equal levels
function getGapBasedTP(gapClusters, entryBias, candles5m) {
  if (!gapClusters || !gapClusters.hasGaps) return null;

  const targets = [];

  if (entryBias === "SELL") {
    // Selling from premium → target discount gaps below
    if (gapClusters.discount.length > 0) {
      const nearestDiscount = gapClusters.discount.reduce((a, b) => a.top > b.top ? a : b);
      targets.push({
        price: nearestDiscount.quarters.q50,
        label: `Discount ${nearestDiscount.type} CE`,
        priority: 1,
        detail: `TP1: Discount ${nearestDiscount.type} CE @ ${nearestDiscount.quarters.q50.toFixed(5)}`
      });
    }
  } else if (entryBias === "BUY") {
    // Buying from discount → target premium gaps above
    if (gapClusters.premium.length > 0) {
      const nearestPremium = gapClusters.premium.reduce((a, b) => a.bottom < b.bottom ? a : b);
      targets.push({
        price: nearestPremium.quarters.q50,
        label: `Premium ${nearestPremium.type} CE`,
        priority: 1,
        detail: `TP1: Premium ${nearestPremium.type} CE @ ${nearestPremium.quarters.q50.toFixed(5)}`
      });
    }
  }

  // Secondary: prior session high/low from 5m candles
  if (candles5m && candles5m.length > 20) {
    const prevSessionHigh = Math.max(...candles5m.slice(-20, -5).map(c => c.high));
    const prevSessionLow = Math.min(...candles5m.slice(-20, -5).map(c => c.low));
    if (entryBias === "SELL" && prevSessionLow < candles5m[candles5m.length-1].close) {
      targets.push({
        price: prevSessionLow,
        label: "Prior session low",
        priority: 2,
        detail: `TP2: Prior session low @ ${prevSessionLow.toFixed(5)}`
      });
    } else if (entryBias === "BUY" && prevSessionHigh > candles5m[candles5m.length-1].close) {
      targets.push({
        price: prevSessionHigh,
        label: "Prior session high",
        priority: 2,
        detail: `TP2: Prior session high @ ${prevSessionHigh.toFixed(5)}`
      });
    }
  }

  return targets.length > 0 ? {
    targets,
    tp1: targets[0] || null,
    tp2: targets[1] || null,
    detail: targets.map(t => t.detail).join(" | ")
  } : null;
}

// ═══ 8. GAP SUBSTITUTION ═══
// ICT: When no NDOG/NWOG exists, substitute with nearest FVG/IFVG
function findGapSubstitute(candles1m, currentPrice, bias) {
  if (!candles1m || candles1m.length < 5) return null;

  const fvgs = [];
  for (let i = 1; i < candles1m.length - 1; i++) {
    const prev = candles1m[i - 1];
    const next = candles1m[i + 1];
    if (next.low > prev.high) {
      fvgs.push({ type: "Bullish FVG", top: next.low, bottom: prev.high, direction: "UP" });
    }
    if (next.high < prev.low) {
      fvgs.push({ type: "Bearish FVG", top: prev.low, bottom: next.high, direction: "DOWN" });
    }
  }

  if (fvgs.length === 0) return null;

  // Find nearest FVG in the bias direction
  let bestFVG = null;
  let bestDist = Infinity;

  for (const fvg of fvgs) {
    const fvgMid = (fvg.top + fvg.bottom) / 2;
    if (bias === "bearish" && fvgMid > currentPrice) {
      const dist = fvgMid - currentPrice;
      if (dist < bestDist) { bestDist = dist; bestFVG = fvg; }
    } else if (bias === "bullish" && fvgMid < currentPrice) {
      const dist = currentPrice - fvgMid;
      if (dist < bestDist) { bestDist = dist; bestFVG = fvg; }
    }
  }

  if (bestFVG) {
    const quarters = applyQuarters(bestFVG);
    return {
      type: "FVG SUBSTITUTE",
      ...bestFVG,
      quarters,
      detail: `No NDOG/NWOG — using nearest ${bestFVG.type} as gap substitute @ ${((bestFVG.top + bestFVG.bottom)/2).toFixed(5)}`
    };
  }

  return null;
}

// ═══ EXPORTED ORCHESTRATOR ═══
function runLecture4Setup(pair, date, root) {
  const r = root || ROOT;
  const d = date || DATE;
  const p = pair || PAIR;

  // ═══ TIME GATE: 08:30-10:00 NY only ═══
  const nyHour = ny.getNYHour();
  const nyMin = new Date().getUTCMinutes();
  if (nyHour < 8 || (nyHour === 8 && nyMin < 30) || nyHour >= 10) {
    return { pair: p, time: new Date().toLocaleTimeString("en-US", {timeZone:"America/New_York", hour12:false}) + " NY",
      gapClusters: { hasGaps: false }, gapDraw: null, mss: { confirmed: false }, setupReady: false,
      detail: `Outside Lecture 4 window (08:30-10:00 NY). Current: ${nyHour}:${String(nyMin).padStart(2,'0')} NY.` };
  }

  // Step 1: Get daily bias from engine report
  const engine1D = getEngineReport("1d", d, r, p);
  const bias = engine1D?.structure?.bias || "neutral";
  const currentPrice = engine1D?.price || 0;

  // Step 2: Get NDOG/NWOG gaps from daily candles
  const dailyCandles = getCandles("1d", d, r, p);
  const gaps = detectGaps(dailyCandles);

  // Step 3: Build gap clusters (premium / discount)
  const gapClusters = getGapClusters(gaps, currentPrice);

  // Step 4: Check for gap substitute if no NDOG/NWOG
  let substituteGap = null;
  if (!gapClusters.hasGaps) {
    const candles1mForSub = getCandles("1m", d, r, p);
    substituteGap = findGapSubstitute(candles1mForSub, currentPrice, bias);
    // Merge substitute into gap clusters so draw/entry detection works
    if (substituteGap) {
      const enriched = { ...substituteGap, isSubstitute: true };
      if (bias === "bearish" && substituteGap.top > currentPrice) {
        gapClusters.premium.push(enriched);
      } else if (bias === "bullish" && substituteGap.bottom < currentPrice) {
        gapClusters.discount.push(enriched);
      } else if (bias === "bearish") {
        gapClusters.premium.push(enriched);
      } else if (bias === "bullish") {
        gapClusters.discount.push(enriched);
      }
      gapClusters.allGaps.push(enriched);
      gapClusters.hasGaps = true;
      gapClusters.detail = `Using ${substituteGap.type} as gap substitute`;
    }
  }

  // Step 5: Get candle data
  const candles5m = getCandles("5m", d, r, p);
  const candles1m = getCandles("1m", d, r, p);
  const atr5m = candles5m ? L2.calcATR(candles5m, 14) : 0;

  // Step 6: Time window check (08:30–10:00 AM NY)
  const utcHour = ny.getNYHour();
  const utcMin = new Date().getUTCMinutes();
  const inNewsWindow = (utcHour === 8 && utcMin >= 30) || (utcHour >= 9 && utcHour < 10) || (utcHour === 10 && utcMin === 0);
  const inAPlusWindow = utcHour >= 9 && utcHour < 10; // 09:30-10:00 NY (equity open)

  // Step 7: Detect gap draw (after 08:30)
  const gapDraw = detectGapDraw(gapClusters, candles5m, bias, atr5m);

  // Step 8: If drawing toward a gap, check for MSS
  let mss = { confirmed: false, detail: "Awaiting MSS at gap cluster" };
  let entry = { found: false, detail: "No entry yet" };
  let quarterTap = null;

  if (gapDraw.drawing && gapDraw.nearestGap) {
    // Hunt simulation for MSS check (gap draw is the "hunt" toward the gap)
    const simulatedHunt = {
      active: true,
      reversed: true,
      direction: bias === "bearish" ? "BEARISH" : "BULLISH",
      swept: gapDraw.nearestGap.type,
      sweepPrice: bias === "bearish" ? gapDraw.nearestGap.bottom : gapDraw.nearestGap.top,
      sweepTime: new Date().toISOString(),
    };
    mss = L2.confirmMSS(candles5m, simulatedHunt);

    // Step 9: Get entry (breaker or FVG)
    if (mss.confirmed) {
      entry = getGapBasedEntry(gapDraw.nearestGap, mss, candles1m, candles5m);

      // Step 10: Check quarter tap signal
      quarterTap = detectQuarterTap(gapDraw.nearestGap, candles1m);
    }
  }

  // Step 11: Post-MSS SL reference (reuse L2's post-hunt SL logic)
  const simulatedHuntForSL = {
    active: true,
    reversed: mss.confirmed,
    direction: bias === "bearish" ? "BEARISH" : "BULLISH",
    swept: gapDraw?.nearestGap?.type || "GAP",
    sweepPrice: gapDraw?.nearestGap
      ? (bias === "bearish" ? gapDraw.nearestGap.bottom : gapDraw.nearestGap.top)
      : currentPrice,
    sweepTime: new Date().toISOString(),
  };
  const postMSS_SL = L2.getPostHuntSL(candles5m, simulatedHuntForSL, mss);

  // Step 12: TP targets
  const direction = bias === "bearish" ? "SELL" : bias === "bullish" ? "BUY" : null;
  const tpTargets = getGapBasedTP(gapClusters, direction, candles5m);

  // Step 13: 30-minute reversal check (reuse L2)
  const reversalCheck = L2.check30MinReversal();

  // Determine setup readiness
  const hasGapsOrSub = gapClusters.hasGaps || substituteGap !== null;
  const biasAligned = (bias === "bearish" && gapClusters.premium.length > 0) ||
                      (bias === "bullish" && gapClusters.discount.length > 0) ||
                      substituteGap !== null;
  const setupReady = inNewsWindow && hasGapsOrSub && biasAligned && gapDraw.drawing && mss.confirmed && entry.found;

  // Build detail string
  let detailStr = "";
  if (setupReady) {
    detailStr = `LECTURE 4 SETUP READY (${direction}): ${gapDraw.nearestGap?.type || 'GAP'} draw. MSS confirmed. Entry: ${entry.detail}. SL: ${postMSS_SL?.detail || 'N/A'}. ${tpTargets?.detail || ''}${quarterTap?.detected ? ' | ' + quarterTap.detail : ''}`;
  } else if (inNewsWindow && gapDraw.drawing && !mss.confirmed) {
    detailStr = `Gap draw active — AWAITING MSS: ${mss.detail}`;
  } else if (inNewsWindow && !gapDraw.drawing) {
    detailStr = gapDraw.detail || "Awaiting gap draw";
  } else if (!inNewsWindow) {
    detailStr = `Outside 08:30-10:00 NY window. ${gapClusters.hasGaps ? gapClusters.detail : 'No NDOG/NWOG detected.'}`;
  } else {
    detailStr = "Monitoring for gap draw setup.";
  }

  return {
    pair: p,
    time: new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false }) + " NY",
    // Gaps
    gaps: gaps,
    gapClusters: gapClusters,
    substituteGap: substituteGap,
    // Quarters (on nearest gap)
    quarters: gapDraw?.nearestGap?.quarters || null,
    // Time window
    inNewsWindow,
    inAPlusWindow,
    // Draw
    gapDraw: gapDraw,
    // MSS
    mss: mss,
    // Entry
    entry: entry,
    // Quarter tap
    quarterTap: quarterTap,
    // SL
    postMSS_SL: postMSS_SL,
    slReference: postMSS_SL?.price || null,
    slSource: postMSS_SL?.source || null,
    // TP
    tpTargets: tpTargets,
    // Filters
    reversalCheck: reversalCheck,
    // Summary
    setupReady,
    direction,
    bias,
    currentPrice,
    entryPrice: entry?.found ? entry.entry : null,
    detail: detailStr,
  };
}

module.exports = {
  detectGaps, applyQuarters, getGapClusters, detectGapDraw,
  detectQuarterTap, getGapBasedEntry, getGapBasedTP,
  findGapSubstitute, runLecture4Setup
};

// ═══ CLI MODE ═══
if (require.main === module) {
  const result = runLecture4Setup(PAIR, DATE, ROOT);
  console.log(JSON.stringify(result, null, 2));
}
