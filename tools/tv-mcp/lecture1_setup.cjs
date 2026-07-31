// ICT 2024 Lecture 1: 08:30 AM Liquidity Raid + PD Array Model
// "Sit down before 08:00 AM. Wait for post-08:30 liquidity raid. MSS is mandatory."
// Official mechanics (audited against innercircletrader.net 2026-07-31):
//   1. Sit before 08:00 AM NY — setup builds between 08:00–08:30
//   2. 15m chart: bias + inefficiencies + draw-on-liquidity
//   3. 1m chart: relative equal highs/lows form in the 08:00–08:30 window
//   4. Post-08:30: price raids those relative equal levels
//   5. MSS mandatory: close beyond prior swing (high for bullish, low for bearish)
//   6. Mark 3 PD arrays from displacement: OB + SIBI/BISI (FVG) + Breaker
//   7. Enter on retrace to FIRST-TAGGED PD array
//   8. SL beyond the ENTIRE post-08:30 AM range (not just MSS swing)
//   9. TP at opposite relative equal levels or previous session high/low
// Usage: node tools/tv-mcp/lecture1_setup.cjs PAIR

const fs = require("fs");
const path = require("path");

// ═══ Import shared helpers from Lecture 2 ═══
const L2 = require("./lecture2_setup.cjs");

const ROOT = "C:/Users/cash/smc-icm-trading";
const DATE = new Date().toISOString().split("T")[0];
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

// ═══ 1. 15-MINUTE PARENT CONTEXT ═══
// Lecture 1: "Load 15-minute chart — mark inefficiencies (FVGs) and
// draw-on-liquidity above and below current price"
function get15mContext(engine15m, candles15m, currentPrice) {
  if (!engine15m) return { bias: "neutral", fvgs: [], drawTargets: [], detail: "No 15m engine data" };

  const bias = engine15m.structure?.bias || "neutral";
  const fvgs = engine15m.fvgs || [];
  const pools = engine15m.liquidity || [];

  // Draw-on-liquidity from 15m
  const drawTargets = [];
  const bslAbove = pools.filter(p => p.type === "BSL" && p.price > currentPrice);
  const sslBelow = pools.filter(p => p.type === "SSL" && p.price < currentPrice);

  if (bslAbove.length > 0) {
    const nearest = bslAbove.reduce((a, b) => a.price < b.price ? a : b);
    drawTargets.push({ direction: "UP", price: nearest.price, type: "BSL", label: "Buy-side liquidity (above)" });
  }
  if (sslBelow.length > 0) {
    const nearest = sslBelow.reduce((a, b) => a.price > b.price ? a : b);
    drawTargets.push({ direction: "DOWN", price: nearest.price, type: "SSL", label: "Sell-side liquidity (below)" });
  }

  // FVG inefficiencies
  const activeFvgs = fvgs.filter(f => (f.fillFraction || 0) < 0.5);
  for (const fvg of activeFvgs.slice(0, 3)) {
    drawTargets.push({
      direction: fvg.type === "bullish" ? "DOWN" : "UP",
      price: (fvg.top + fvg.bottom) / 2,
      type: "FVG",
      label: `${fvg.type} FVG (15m)`
    });
  }

  return {
    bias,
    fvgs: activeFvgs,
    drawTargets,
    detail: `15m bias: ${bias.toUpperCase()} | ${drawTargets.length} draw targets identified`
  };
}

// ═══ 2. PRE-08:30 RELATIVE EQUAL LEVEL FORMATION ═══
// Lecture 1: Relative equal highs/lows must FORM in the 08:00–08:30 AM window
function detectPre0830Formation(candles1m) {
  if (!candles1m || candles1m.length < 20) {
    return { formed: false, levels: [], detail: "Insufficient 1m candle data" };
  }

  // 08:00 AM NY = 12:00 UTC (EDT). Filter to 08:00–08:30 window
  const pre0830 = candles1m.filter(c => {
    const h = new Date(c.time).getUTCHours();
    const m = new Date(c.time).getUTCMinutes();
    return (h === 12 && m >= 0 && m < 30) || (h === 11 && m >= 30); // Handle EST too
  });

  if (pre0830.length < 10) {
    return { formed: false, levels: [], detail: "Not enough candles in 08:00–08:30 window yet" };
  }

  const atr = L2.calcATR(pre0830, 14) || L2.calcATR(candles1m, 14);
  const levels = L2.findRelativeEqualLevels(pre0830, atr);

  const formed = levels.highs.length > 0 || levels.lows.length > 0;
  return {
    formed,
    levels,
    highCount: levels.highs.length,
    lowCount: levels.lows.length,
    detail: formed
      ? `${levels.highs.length} relative equal highs, ${levels.lows.length} relative equal lows formed in 08:00–08:30 window`
      : "No relative equal levels formed in 08:00–08:30 window"
  };
}

// ═══ 3. POST-08:30 LIQUIDITY RAID DETECTION ═══
// Lecture 1: After 08:30, price must raid the pre-08:30 relative equal levels
function detectPost0830Raid(candles1m, pre0830Levels) {
  if (!candles1m || candles1m.length < 10) return null;
  if (!pre0830Levels || !pre0830Levels.formed) {
    return { active: false, detail: "No pre-08:30 levels to raid" };
  }

  // Post-08:30 candles (12:30+ UTC)
  const post0830 = candles1m.filter(c => {
    const h = new Date(c.time).getUTCHours();
    const m = new Date(c.time).getUTCMinutes();
    return (h === 12 && m >= 30) || h >= 13;
  });

  if (post0830.length < 3) {
    return { active: false, detail: "Not enough post-08:30 candles yet" };
  }

  const relHighs = pre0830Levels.levels.highs;
  const relLows = pre0830Levels.levels.lows;
  let bestRaid = null;

  // Check for raid of relative equal highs (bearish setup)
  for (const level of relHighs) {
    for (const c of post0830) {
      if (c.high > level.price) {
        const lastClose = post0830[post0830.length - 1].close;
        bestRaid = {
          type: "BEARISH",
          swept: "RELATIVE EQUAL HIGHS",
          sweepPrice: level.price,
          levelDetail: level.detail,
          sweepTime: c.time,
          currentPrice: lastClose,
          reversed: lastClose < level.price,
        };
        break;
      }
    }
    if (bestRaid) break;
  }

  // Check for raid of relative equal lows (bullish setup)
  if (!bestRaid) {
    for (const level of relLows) {
      for (const c of post0830) {
        if (c.low < level.price) {
          const lastClose = post0830[post0830.length - 1].close;
          bestRaid = {
            type: "BULLISH",
            swept: "RELATIVE EQUAL LOWS",
            sweepPrice: level.price,
            levelDetail: level.detail,
            sweepTime: c.time,
            currentPrice: lastClose,
            reversed: lastClose > level.price,
          };
          break;
        }
      }
      if (bestRaid) break;
    }
  }

  if (!bestRaid) {
    const highPrices = relHighs.map(l => l.price.toFixed(5)).join(", ");
    const lowPrices = relLows.map(l => l.price.toFixed(5)).join(", ");
    return {
      active: false,
      detail: `No post-08:30 raid yet. Targets: highs [${highPrices || 'none'}] | lows [${lowPrices || 'none'}]`
    };
  }

  return {
    active: true,
    direction: bestRaid.type === "BEARISH" ? "BEARISH (highs raided)" : "BULLISH (lows raided)",
    swept: bestRaid.swept,
    sweepPrice: bestRaid.sweepPrice,
    sweepTime: bestRaid.sweepTime,
    reversed: bestRaid.reversed,
    currentPrice: bestRaid.currentPrice,
    detail: bestRaid.reversed
      ? `Post-08:30 RAID: ${bestRaid.swept} swept at ${bestRaid.sweepPrice.toFixed(5)} and reversed. Awaiting MSS.`
      : `Post-08:30 RAID: ${bestRaid.swept} swept at ${bestRaid.sweepPrice.toFixed(5)}. Awaiting reversal.`
  };
}

// ═══ 4. THREE PD ARRAY DISCOVERY ═══
// Lecture 1: After MSS, mark 3 PD arrays from displacement:
//   1. Order Block (OB)
//   2. SIBI/BISI (FVG)
//   3. Breaker Block
// "The first PD array tagged after the MSS is the cleanest entry"
function discoverPDArrays(engine5m, engine1m, raid, mss, candles1m) {
  if (!mss || !mss.confirmed || !raid || !raid.active) {
    return { arrays: [], firstTagged: null, detail: "MSS not confirmed — no PD arrays to discover" };
  }

  const isBearish = mss.direction === "BEARISH";
  const pdArrays = [];

  // 1. Order Blocks from engine reports (nearest to current price)
  const obs = [...(engine5m?.orderBlocks || []), ...(engine1m?.orderBlocks || [])];
  for (const ob of obs) {
    const obPrice = (ob.proximal + ob.distal) / 2;
    const isCorrectType = isBearish ? ob.type === "bearish" : ob.type === "bullish";
    if (isCorrectType) {
      pdArrays.push({
        type: "ORDER BLOCK",
        price: obPrice,
        zone: { high: Math.max(ob.proximal, ob.distal), low: Math.min(ob.proximal, ob.distal) },
        source: `${ob.type} OB (${ob.kind || 'OB'})`,
        detail: `${ob.type} OB @ ${obPrice.toFixed(5)}`
      });
    }
  }

  // 2. FVGs (SIBI = bearish / BISI = bullish)
  const fvgs = [...(engine5m?.fvgs || []), ...(engine1m?.fvgs || [])];
  for (const fvg of fvgs) {
    const fvgMid = (fvg.top + fvg.bottom) / 2;
    const isCorrectType = isBearish
      ? (fvg.type === "bearish")  // SIBI for shorts
      : (fvg.type === "bullish"); // BISI for longs
    if (isCorrectType && (fvg.fillFraction || 0) < 0.5) {
      pdArrays.push({
        type: isBearish ? "SIBI (Bearish FVG)" : "BISI (Bullish FVG)",
        price: fvgMid,
        zone: { high: fvg.top, low: fvg.bottom },
        source: "FVG",
        detail: `${isBearish ? 'SIBI' : 'BISI'} @ ${fvgMid.toFixed(5)} (CE of FVG)`
      });
    }
  }

  // 3. Breaker Block (reuse Lecture 2 detector)
  const fakeHunt = {
    active: true, reversed: true,
    direction: isBearish ? "BEARISH" : "BULLISH",
    swept: raid.swept, sweepPrice: raid.sweepPrice, sweepTime: raid.sweepTime
  };
  const breaker = L2.detectBreakerBlock(candles1m, fakeHunt, mss);
  if (breaker && breaker.found) {
    pdArrays.push({
      type: "BREAKER BLOCK",
      price: breaker.entry,
      zone: { high: breaker.high, low: breaker.low },
      source: "Breaker",
      detail: `${breaker.type} @ ${breaker.entry.toFixed(5)}`
    });
  }

  // Sort by distance from current price — "first tagged = cleanest entry"
  const currentPrice = raid.currentPrice || candles1m[candles1m.length-1]?.close || 0;
  pdArrays.sort((a, b) => Math.abs(a.price - currentPrice) - Math.abs(b.price - currentPrice));

  return {
    arrays: pdArrays,
    firstTagged: pdArrays[0] || null,
    totalCount: pdArrays.length,
    detail: pdArrays.length > 0
      ? `${pdArrays.length} PD arrays found. First-tagged: ${pdArrays[0].type} @ ${pdArrays[0].price.toFixed(5)}`
      : "No PD arrays found for entry"
  };
}

// ═══ 5. POST-08:30 AM RANGE SL ═══
// Lecture 1: SL above the HIGH formed post-08:30 (shorts) / below the LOW (longs)
// "Above/below the ENTIRE range formed post-08:30 AM, not just at the MSS swing"
function getPost0830RangeSL(candles1m, mss) {
  if (!candles1m || candles1m.length < 5) return null;

  // Post-08:30 candles
  const post0830 = candles1m.filter(c => {
    const h = new Date(c.time).getUTCHours();
    const m = new Date(c.time).getUTCMinutes();
    return (h === 12 && m >= 30) || h >= 13;
  });

  if (post0830.length < 3) return null;

  const rangeHigh = Math.max(...post0830.map(c => c.high));
  const rangeLow = Math.min(...post0830.map(c => c.low));
  const atr = L2.calcATR(post0830, 14) || L2.calcATR(candles1m, 14);
  const buffer = atr * 0.2;

  if (mss?.direction === "BEARISH") {
    return {
      price: rangeHigh + buffer,
      rangeHigh, rangeLow,
      buffer,
      source: "Post-08:30 AM range HIGH",
      detail: `SL above post-08:30 AM high @ ${rangeHigh.toFixed(5)} + ${buffer.toFixed(5)} buffer`
    };
  } else if (mss?.direction === "BULLISH") {
    return {
      price: rangeLow - buffer,
      rangeHigh, rangeLow,
      buffer,
      source: "Post-08:30 AM range LOW",
      detail: `SL below post-08:30 AM low @ ${rangeLow.toFixed(5)} - ${buffer.toFixed(5)} buffer`
    };
  }

  return null;
}

// ═══ 6. TAKE PROFIT TARGETS ═══
// Lecture 1: Opposite relative equal levels or previous session high/low
function getLecture1TP(raid, mss, pre0830Levels, candles1m) {
  if (!mss?.confirmed) return null;

  const isBearish = mss.direction === "BEARISH";
  const targets = [];

  // Primary: opposite relative equal levels (from pre-08:30 formation)
  // Bearish (highs swept → SELL) → target relative equal LOWS (below)
  // Bullish (lows swept → BUY) → target relative equal HIGHS (above)
  if (isBearish && pre0830Levels?.levels?.lows?.length > 0) {
    const currentPrice = raid?.currentPrice || candles1m?.[candles1m.length-1]?.close || 0;
    // Filter to lows that are BELOW current price (valid sell targets)
    const validLows = pre0830Levels.levels.lows.filter(l => l.price < currentPrice);
    if (validLows.length > 0) {
      const best = validLows.reduce((a, b) => a.price > b.price ? a : b); // Highest low = nearest below
      targets.push({
        price: best.price,
        label: "Rel Equal Low",
        priority: 1,
        detail: `TP1: Relative equal low @ ${best.price.toFixed(5)}`
      });
    }
  } else if (!isBearish && pre0830Levels?.levels?.highs?.length > 0) {
    const currentPrice = raid?.currentPrice || candles1m?.[candles1m.length-1]?.close || 0;
    // Filter to highs that are ABOVE current price (valid buy targets)
    const validHighs = pre0830Levels.levels.highs.filter(l => l.price > currentPrice);
    if (validHighs.length > 0) {
      const best = validHighs.reduce((a, b) => a.price < b.price ? a : b); // Lowest high = nearest above
      targets.push({
        price: best.price,
        label: "Rel Equal High",
        priority: 1,
        detail: `TP1: Relative equal high @ ${best.price.toFixed(5)}`
      });
    }
  }

  // Secondary: previous session high/low from 1m candles
  if (candles1m && candles1m.length > 30) {
    const pre0830 = candles1m.filter(c => {
      const h = new Date(c.time).getUTCHours();
      const m = new Date(c.time).getUTCMinutes();
      return (h === 12 && m < 30) || h < 12;
    });
    if (pre0830.length > 10) {
      if (isBearish) {
        const prevLow = Math.min(...pre0830.map(c => c.low));
        if (prevLow < (raid?.currentPrice || 0)) {
          targets.push({
            price: prevLow,
            label: "Pre-08:30 Session Low",
            priority: 2,
            detail: `TP2: Pre-08:30 session low @ ${prevLow.toFixed(5)}`
          });
        }
      } else {
        const prevHigh = Math.max(...pre0830.map(c => c.high));
        if (prevHigh > (raid?.currentPrice || 0)) {
          targets.push({
            price: prevHigh,
            label: "Pre-08:30 Session High",
            priority: 2,
            detail: `TP2: Pre-08:30 session high @ ${prevHigh.toFixed(5)}`
          });
        }
      }
    }
  }

  // Fallback: if no valid targets or target too close, use ATR-based measured move
  const currentPrice = raid?.currentPrice || candles1m?.[candles1m.length-1]?.close || 0;
  const atr = candles1m ? L2.calcATR(candles1m, 14) : 0;
  const minTPDistance = atr * 0.5; // Minimum TP must be at least 0.5 ATR away

  if (targets.length === 0 || (targets[0] && Math.abs(targets[0].price - currentPrice) < minTPDistance)) {
    // Use 1:1 measured move as fallback TP
    const slDist = Math.abs(currentPrice - (raid?.sweepPrice || currentPrice));
    if (isBearish) {
      targets.unshift({
        price: currentPrice - slDist,
        label: "1:1 Measured Move",
        priority: 0,
        detail: `TP1: 1:1 measured move @ ${(currentPrice - slDist).toFixed(5)} (fallback — no valid opposing level)`
      });
    } else {
      targets.unshift({
        price: currentPrice + slDist,
        label: "1:1 Measured Move",
        priority: 0,
        detail: `TP1: 1:1 measured move @ ${(currentPrice + slDist).toFixed(5)} (fallback — no valid opposing level)`
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

// ═══ EXPORTED ORCHESTRATOR ═══
function runLecture1Setup(pair, date, root) {
  const r = root || ROOT;
  const d = date || DATE;
  const p = pair || PAIR;

  // ═══ TIME GATE: 08:00-10:00 NY only ═══
  const nyHour = parseInt(new Date().toLocaleTimeString("en-US", {timeZone:"America/New_York", hour12:false, hour:"2-digit"}));
  if (nyHour < 8 || nyHour >= 10) {
    return { pair: p, time: new Date().toLocaleTimeString("en-US", {timeZone:"America/New_York", hour12:false}) + " NY",
      formation: { formed: false }, raid: null, mss: { confirmed: false }, setupReady: false,
      detail: `Outside Lecture 1 window (08:00-10:00 NY). Current: ${nyHour}:00 NY.` };
  }

  // Step 1: 15-minute parent context
  const engine15m = getEngineReport("15m", d, r, p);
  const candles15m = getCandles("15m", d, r, p);
  const engine5m = getEngineReport("5m", d, r, p);
  const engine1m = getEngineReport("1m", d, r, p);
  const currentPrice = engine1m?.price || engine5m?.price || 0;
  const ctx15m = get15mContext(engine15m, candles15m, currentPrice);

  // Step 2: Get 1m candles
  const candles1m = getCandles("1m", d, r, p);

  // Step 3: Time window check
  const nyHour = new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false, hour: "2-digit" });
  const nyMinute = new Date().getMinutes();
  const inFormationWindow = parseInt(nyHour) === 8 && nyMinute < 30;
  const inTriggerWindow = (parseInt(nyHour) === 8 && nyMinute >= 30) || (parseInt(nyHour) >= 9 && parseInt(nyHour) < 10);
  const inWindow = inFormationWindow || inTriggerWindow;

  // Step 4: Pre-08:30 formation
  const formation = detectPre0830Formation(candles1m);

  // Step 5: Post-08:30 raid
  const raid = detectPost0830Raid(candles1m, formation);

  // Step 6: MSS confirmation (using 1m candles and raid info)
  let mss = { confirmed: false, detail: "Awaiting post-08:30 raid and MSS" };
  if (raid?.active && raid?.reversed) {
    // Simulate hunt for MSS check
    const fakeHunt = {
      active: true, reversed: true,
      direction: raid.type === "BEARISH" ? "BEARISH (highs raided)" : "BULLISH (lows raided)",
      swept: raid.swept, sweepPrice: raid.sweepPrice, sweepTime: raid.sweepTime
    };
    mss = L2.confirmMSS(candles1m, fakeHunt);
  }

  // Step 7: Discover 3 PD arrays
  const pdArrays = discoverPDArrays(engine5m, engine1m, raid, mss, candles1m);

  // Step 8: Post-08:30 range SL
  const post0830SL = getPost0830RangeSL(candles1m, mss);

  // Step 9: TP targets
  const tpTargets = getLecture1TP(raid, mss, formation, candles1m);

  // Step 10: 30-minute reversal check
  const reversalCheck = L2.check30MinReversal();

  // Setup readiness
  const setupReady = inTriggerWindow && formation.formed && raid?.active && raid?.reversed &&
                     mss.confirmed && pdArrays.firstTagged !== null;
  const direction = raid?.type === "BEARISH" ? "SELL" : raid?.type === "BULLISH" ? "BUY" : null;

  // Build detail string
  let detailStr = "";
  if (setupReady) {
    detailStr = `LECTURE 1 SETUP READY (${direction}): ${raid.swept} raided post-08:30. MSS confirmed. Entry: ${pdArrays.firstTagged.type} @ ${pdArrays.firstTagged.price.toFixed(5)}. SL: ${post0830SL?.detail || 'N/A'}. ${tpTargets?.detail || ''}`;
  } else if (inTriggerWindow && raid?.active && !mss.confirmed) {
    detailStr = `Raid active — AWAITING MSS: ${mss.detail}`;
  } else if (inTriggerWindow && !raid?.active) {
    detailStr = raid?.detail || "Awaiting post-08:30 raid";
  } else if (inFormationWindow) {
    detailStr = `Formation window (08:00–08:30): ${formation.detail}`;
  } else if (!inWindow) {
    detailStr = `Outside Lecture 1 window (08:00–10:00 NY). ${formation.formed ? 'Levels formed — waiting for trigger window.' : ''}`;
  } else {
    detailStr = "Monitoring for Lecture 1 setup.";
  }

  return {
    pair: p,
    time: new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false }) + " NY",
    // Context
    ctx15m,
    bias: ctx15m.bias,
    currentPrice,
    // Windows
    inFormationWindow,
    inTriggerWindow,
    inWindow,
    // Formation
    formation,
    // Raid
    raid,
    // MSS
    mss,
    // PD Arrays
    pdArrays: pdArrays.arrays || [],
    firstTagged: pdArrays.firstTagged,
    // SL
    post0830SL,
    slReference: post0830SL?.price || null,
    slSource: post0830SL?.source || null,
    // TP
    tpTargets,
    // Filters
    reversalCheck,
    // Summary
    setupReady,
    direction,
    entryPrice: pdArrays.firstTagged?.price || null,
    entrySource: pdArrays.firstTagged?.type || null,
    detail: detailStr,
  };
}

module.exports = {
  get15mContext, detectPre0830Formation, detectPost0830Raid,
  discoverPDArrays, getPost0830RangeSL, getLecture1TP,
  runLecture1Setup
};

// ═══ CLI MODE ═══
if (require.main === module) {
  const result = runLecture1Setup(PAIR, DATE, ROOT);
  console.log(JSON.stringify(result, null, 2));
}
