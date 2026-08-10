// ICT Liquidity Marker — 8-Step Pre-Session Workflow
// Audited against innercircletrader.net 2026-07-31
//
// Steps:
//   1. Set HTF bias (Daily & 4H)
//   2. Mark Previous Day High (PDH) & Previous Day Low (PDL)
//   3. Mark Previous Week High (PWH) & Previous Week Low (PWL)
//   4. Mark relative equal highs/lows inside the range
//   5. Identify next draw-on-liquidity (BSL or SSL, guided by bias)
//   6. Wait for sweep (wick through + close back inside range)
//   7. Confirm with MSS (lower-timeframe structure shift)
//   8. Entry on PD array retest, SL beyond swept level, TP at opposite pool
//
// Usage: node tools/liquidity_marker.cjs PAIR

const fs = require("fs");
const path = require("path");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..");
const DATE = new Date().toISOString().split("T")[0];
const PAIR = process.argv[2] || "GBPUSD";

function r5(v) { return Number(v).toFixed(5); }
function r2(v) { return Number(v).toFixed(2); }

function loadEngine(tf) {
  try {
    const dir = PAIR === "XAUUSD" ? "GOLD" : PAIR;
    return JSON.parse(fs.readFileSync(path.join(ROOT, "shared", DATE, dir, `engine_${tf}.json`), "utf8"));
  } catch { return null; }
}

function loadCandles(tf) {
  try {
    const dir = PAIR === "XAUUSD" ? "GOLD" : PAIR;
    return JSON.parse(fs.readFileSync(path.join(ROOT, "shared", DATE, dir, `candles_${tf}.json`), "utf8"));
  } catch { return null; }
}

// ═══ STEP 1: HTF Bias ═══
function getHTFBias(reports) {
  const bias1d = reports["1D"]?.structure?.bias || "neutral";
  const bias4h = reports["4H"]?.structure?.bias || "neutral";
  const aligned = bias1d === bias4h && bias1d !== "neutral";
  return {
    daily: bias1d,
    h4: bias4h,
    aligned,
    direction: aligned ? bias1d : "neutral",
    detail: aligned
      ? `✅ ALIGNED — 1D ${bias1d.toUpperCase()} + 4H ${bias4h.toUpperCase()}`
      : `⚠️ NOT ALIGNED — 1D ${bias1d.toUpperCase()}, 4H ${bias4h.toUpperCase()}`,
  };
}

// ═══ STEP 2: Previous Day High & Low ═══
// ICT: "The most recent buy-side and sell-side pools"
function markPDH_PDL(dailyCandles) {
  if (!dailyCandles || dailyCandles.length < 2) return null;

  const yesterday = dailyCandles[dailyCandles.length - 2];

  return {
    pdh: yesterday.high,
    pdl: yesterday.low,
    range: yesterday.high - yesterday.low,
    date: new Date(yesterday.time).toISOString().split("T")[0],
    detail: `PDH: ${r5(yesterday.high)} | PDL: ${r5(yesterday.low)} | Range: ${r5(yesterday.high - yesterday.low)}`,
  };
}

// ═══ STEP 3: Previous Week High & Low ═══
// ICT: "The next-tier pools above and below"
function markPWH_PWL(weeklyCandles) {
  if (!weeklyCandles || weeklyCandles.length < 2) return null;

  const lastWeek = weeklyCandles[weeklyCandles.length - 2];

  return {
    pwh: lastWeek.high,
    pwl: lastWeek.low,
    range: lastWeek.high - lastWeek.low,
    detail: `PWH: ${r5(lastWeek.high)} | PWL: ${r5(lastWeek.low)} | Range: ${r5(lastWeek.high - lastWeek.low)}`,
  };
}

// ═══ STEP 4: Relative Equal Highs & Lows ═══
// (Imported concept — delegated to lecture2 module for actual detection)
// Here we categorize them as internal liquidity within the daily range
function classifyRelativeEquals(relHighs, relLows, pdhPdl, currentPrice, opts = {}) {
  const { candles, atr } = opts;
  const { gradeEqualLevelSmoothness } = require("./lib/liquidity.cjs");

  const insideRangeHighs = (relHighs || []).filter(h => pdhPdl ? h.price <= pdhPdl.pdh : true);
  const insideRangeLows = (relLows || []).filter(l => pdhPdl ? l.price >= pdhPdl.pdl : true);

  // Smoothness grading: when candle + ATR context is available, each level is
  // graded for energy / bump-without-acceptance (ICT "left smooth = magnet").
  const enrich = levels => levels.map(l => {
    if (!candles || !atr) return l;
    const g = gradeEqualLevelSmoothness(l, candles, atr);
    return g ? { ...l, smoothness: g } : l;
  });
  const highs = enrich(insideRangeHighs);
  const lows = enrich(insideRangeLows);

  const magnets = highs.filter(h => h.smoothness?.magnet).concat(lows.filter(l => l.smoothness?.magnet));
  const smoothCount = highs.filter(h => h.smoothness?.magnet || h.smoothness?.smooth).length
    + lows.filter(l => l.smoothness?.magnet || l.smoothness?.smooth).length;

  return {
    highs,
    lows,
    highCount: highs.length,
    lowCount: lows.length,
    magnets,
    magnetCount: magnets.length,
    smoothCount,
    detail: `${highs.length} equal highs, ${lows.length} equal lows inside daily range${magnets.length ? ` — ${magnets.length} SMOOTH MAGNET${magnets.length > 1 ? 'S' : ''} (bumped w/o acceptance = unfinished business)` : ''}`,
  };
}

// ═══ STEP 5: Next Draw-on-Liquidity ═══
// ICT: "Identified above (BSL) or below (SSL), guided by higher-timeframe bias"
function identifyDrawTargets(htfBias, pdhPdl, pwhPwl, relEquals, currentPrice) {
  const targets = [];
  const bias = htfBias.direction;

  // Liquidity hierarchy: PDH/PDL → PWH/PWL → Relative equal levels
  // Bullish bias → draw to sell-side (below): PDL → PWL → equal lows
  // Bearish bias → draw to buy-side (above): PDH → PWH → equal highs

  if (bias === "bearish") {
    // Looking for buy-side targets ABOVE to draw price up before shorting
    if (pdhPdl?.pdh && pdhPdl.pdh > currentPrice) {
      targets.push({ level: "PDH", price: pdhPdl.pdh, type: "BSL", priority: 1, label: "Previous Day High" });
    }
    if (pwhPwl?.pwh && pwhPwl.pwh > currentPrice) {
      targets.push({ level: "PWH", price: pwhPwl.pwh, type: "BSL", priority: 2, label: "Previous Week High" });
    }
    for (const h of (relEquals?.highs || []).slice(0, 3)) {
      if (h.price > currentPrice) {
        targets.push({ level: "EQH", price: h.price, type: "BSL", priority: 3, label: "Relative Equal High" });
      }
    }
  } else if (bias === "bullish") {
    // Looking for sell-side targets BELOW to draw price down before going long
    if (pdhPdl?.pdl && pdhPdl.pdl < currentPrice) {
      targets.push({ level: "PDL", price: pdhPdl.pdl, type: "SSL", priority: 1, label: "Previous Day Low" });
    }
    if (pwhPwl?.pwl && pwhPwl.pwl < currentPrice) {
      targets.push({ level: "PWL", price: pwhPwl.pwl, type: "SSL", priority: 2, label: "Previous Week Low" });
    }
    for (const l of (relEquals?.lows || []).slice(0, 3)) {
      if (l.price < currentPrice) {
        targets.push({ level: "EQL", price: l.price, type: "SSL", priority: 3, label: "Relative Equal Low" });
      }
    }
  }

  // If neutral bias, show both sides
  if (bias === "neutral") {
    if (pdhPdl?.pdh) targets.push({ level: "PDH", price: pdhPdl.pdh, type: "BSL", priority: 1, label: "Previous Day High" });
    if (pdhPdl?.pdl) targets.push({ level: "PDL", price: pdhPdl.pdl, type: "SSL", priority: 1, label: "Previous Day Low" });
    if (pwhPwl?.pwh) targets.push({ level: "PWH", price: pwhPwl.pwh, type: "BSL", priority: 2, label: "Previous Week High" });
    if (pwhPwl?.pwl) targets.push({ level: "PWL", price: pwhPwl.pwl, type: "SSL", priority: 2, label: "Previous Week Low" });
  }

  // Find the primary draw (closest in bias direction, highest priority)
  targets.sort((a, b) => a.priority - b.priority || Math.abs(a.price - currentPrice) - Math.abs(b.price - currentPrice));
  const primary = targets[0] || null;

  // Opposite pool = take profit target
  const oppositePool = bias === "bearish"
    ? targets.find(t => t.type === "SSL") || null
    : bias === "bullish"
      ? targets.find(t => t.type === "BSL") || null
      : null;

  return {
    primary,
    oppositePool,
    allTargets: targets,
    detail: primary
      ? `Primary draw: ${primary.label} (${primary.type}) @ ${r5(primary.price)} | Opposite (TP): ${oppositePool ? oppositePool.label + ' @ ' + r5(oppositePool.price) : 'N/A'}`
      : "No clear draw target — bias neutral or no levels identified",
  };
}

// ═══ STEP 6-7: Sweep Status & MSS ═══
// Checks whether the primary draw level has been swept and MSS confirmed
function checkSweepAndMSS(primaryDraw, reports, currentPrice) {
  if (!primaryDraw) return { swept: false, mss: false, detail: "No primary draw target" };

  const pools = (reports["1H"]?.liquidity || []).concat(reports["4H"]?.liquidity || []);

  // Check if the draw level has been swept
  const sweptPool = pools.find(p =>
    p.swept && Math.abs(p.price - primaryDraw.price) / primaryDraw.price < 0.002
  );

  // Check for recent MSS in the expected direction
  const recentStructure = reports["1H"]?.structure || reports["4H"]?.structure || {};
  const hasMSS = recentStructure.lastEvent === "CHoCH";

  return {
    swept: !!sweptPool,
    mss: hasMSS,
    sweptPool: sweptPool || null,
    structureEvent: recentStructure.lastEvent || "none",
    detail: sweptPool
      ? `✅ ${primaryDraw.label} SWEPT at ${r5(sweptPool.price)} | MSS: ${hasMSS ? '✅ Confirmed' : '⏳ Pending'}`
      : `⏳ ${primaryDraw.label} NOT swept yet | Awaiting sweep + MSS`,
  };
}

// ═══ STEP 8: Entry Guidance ═══
function getEntryGuidance(primaryDraw, oppositePool, sweepStatus, htfBias) {
  if (!primaryDraw) return { ready: false, detail: "No draw target identified" };

  const ready = sweepStatus.swept && sweepStatus.mss;

  if (ready) {
    const direction = primaryDraw.type === "BSL" ? "SELL" : "BUY";
    const slPrice = primaryDraw.type === "BSL"
      ? primaryDraw.price * 1.001  // SL just above swept BSL
      : primaryDraw.price * 0.999; // SL just below swept SSL
    const tpPrice = oppositePool?.price || null;

    return {
      ready: true,
      direction,
      entry: "On retest of PD array (FVG/OB/Breaker) after sweep + MSS",
      sl: { price: slPrice, label: `Beyond swept ${primaryDraw.label}` },
      tp: tpPrice ? { price: tpPrice, label: `Opposite pool: ${oppositePool.label}` } : null,
      detail: `🎯 SETUP READY: ${direction} on PD array retest. SL beyond ${primaryDraw.label} @ ${r5(slPrice)}. TP: ${oppositePool?.label || 'N/A'} @ ${tpPrice ? r5(tpPrice) : 'N/A'}.`,
    };
  }

  return {
    ready: false,
    detail: `⏳ NOT READY — ${sweepStatus.detail}. Wait for ${primaryDraw.label} sweep + MSS.`,
  };
}

// ═══ HRLR / LRLR CLASSIFICATION ═══
// ICT: HRLR = High-Resistance Liquidity Run (long-term extreme, many defenders, counter-trend)
//      LRLR = Low-Resistance Liquidity Run (short-term swing, few defenders, with-trend)
// "LRLR is the ideal, easiest condition to trade. HRLR needs a catalyst (NFP, FOMC, CPI)."
function classifyHRLR_LRLR(drawTargets, htfBias, currentPrice, reports) {
  const iofDirection = htfBias.direction; // "bullish", "bearish", or "neutral"
  const classified = [];

  // Get swing points from 15m/5m to count "defenders"
  const swings15m = [];
  const r15m = reports["15m"];
  if (r15m?.structure) {
    if (r15m.structure.lastSwingHigh) swings15m.push({ price: r15m.structure.lastSwingHigh, type: "high" });
    if (r15m.structure.lastSwingLow) swings15m.push({ price: r15m.structure.lastSwingLow, type: "low" });
  }

  // Get FVGs to check for LRLR signature (displacement leaving FVGs)
  const recentFvgs = (reports["15m"]?.fvgs || []).concat(reports["5m"]?.fvgs || []);

  for (const target of drawTargets.allTargets) {
    const dist = Math.abs(target.price - currentPrice);
    const distPct = currentPrice > 0 ? dist / currentPrice * 100 : 0;

    // Count defending swing points between price and target
    let defenders = 0;
    for (const sw of swings15m) {
      if (target.type === "BSL") {
        // For buy-side targets above: count swing highs between price and target
        if (sw.type === "high" && sw.price > currentPrice && sw.price < target.price) defenders++;
      } else {
        // For sell-side targets below: count swing lows between price and target
        if (sw.type === "low" && sw.price < currentPrice && sw.price > target.price) defenders++;
      }
    }

    // Check for FVG signature near the target (marks LRLR)
    const hasNearbyFVG = recentFvgs.some(f =>
      Math.abs(((f.top + f.bottom) / 2) - target.price) / target.price < 0.005 &&
      (f.fillFraction || 0) < 0.3
    );

    // Classification logic:
    // LRLR = short-term, with-trend, few defenders, has FVG signature
    // HRLR = long-term (PDH/PDL/PWH/PWL), counter-trend or neutral, many defenders

    const isLongTerm = ["PDH", "PDL", "PWH", "PWL"].includes(target.level);
    const isWithTrend = (iofDirection === "bullish" && target.type === "SSL") ||
                        (iofDirection === "bearish" && target.type === "BSL");
    const isCounterTrend = (iofDirection === "bullish" && target.type === "BSL") ||
                           (iofDirection === "bearish" && target.type === "SSL");

    let classification;
    if (isLongTerm || isCounterTrend || defenders >= 2) {
      classification = "HRLR";
    } else if (isWithTrend && defenders <= 1) {
      classification = "LRLR";
    } else if (hasNearbyFVG && defenders <= 1) {
      classification = "LRLR";
    } else {
      classification = defenders > 1 ? "HRLR" : "LRLR";
    }

    classified.push({
      ...target,
      classification,
      defenders,
      hasNearbyFVG,
      isLongTerm,
      isWithTrend,
      isCounterTrend,
      distPct: r2(distPct),
    });
  }

  const lrlrTargets = classified.filter(t => t.classification === "LRLR");
  const hrlrTargets = classified.filter(t => t.classification === "HRLR");

  // Primary TP = nearest LRLR; stretch TP = nearest HRLR
  const primaryLRLR = lrlrTargets[0] || null;
  const stretchHRLR = hrlrTargets[0] || null;

  return {
    targets: classified,
    lrlrCount: lrlrTargets.length,
    hrlrCount: hrlrTargets.length,
    primaryLRLR,
    stretchHRLR,
    detail: `${lrlrTargets.length} LRLR (easy, with-trend) | ${hrlrTargets.length} HRLR (hard, needs catalyst) | Primary TP: ${primaryLRLR ? primaryLRLR.label + ' @ ' + r5(primaryLRLR.price) : 'N/A'} | Stretch: ${stretchHRLR ? stretchHRLR.label + ' @ ' + r5(stretchHRLR.price) : 'N/A'}`,
  };
}

// ═══ MAIN ═══
function analyzeLiquidity(pair) {
  const p = pair || PAIR;
  const reports = {};
  for (const tf of ["1D", "4H", "1H", "15m", "5m"]) {
    reports[tf] = loadEngine(tf);
  }

  const dailyCandles = loadCandles("1d");
  const weeklyCandles = loadCandles("1w");
  const currentPrice = reports["1H"]?.price || reports["4H"]?.price || 0;

  // Step 1: HTF Bias
  const htfBias = getHTFBias(reports);

  // Step 2: PDH/PDL
  const pdhPdl = markPDH_PDL(dailyCandles);

  // Step 3: PWH/PWL
  const pwhPwl = markPWH_PWL(weeklyCandles);

  // Step 4: Relative equal levels — ATR-relative equal highs/lows from
  // structure (WP-6 / Gap 2.4). The lib is the ONLY producer of equal-high/low
  // liquidity objects; this is no longer a filter over engine BSL/SSL pools.
  const { findRelativeEqualLevels } = require("./lib/liquidity.cjs");
  const { calcATR } = require("./lib/metrics.cjs");
  const candles5m = loadCandles("5m");
  const candles15m = loadCandles("15m");
  const relSource = candles5m || candles15m;
  let relHighs = [], relLows = [];
  if (relSource) {
    const atr = calcATR(relSource, 14) || 1;
    const rel = findRelativeEqualLevels(relSource, atr);
    relHighs = (rel.highs || []).filter(h => !h.swept);
    relLows = (rel.lows || []).filter(l => !l.swept);
  }
  const relEquals = classifyRelativeEquals(relHighs, relLows, pdhPdl, currentPrice, { candles: relSource, atr: calcATR(relSource, 14) || 1 });

  // Step 5: Next draw-on-liquidity
  const drawTargets = identifyDrawTargets(htfBias, pdhPdl, pwhPwl, relEquals, currentPrice);

  // Step 6-7: Sweep + MSS status
  const sweepStatus = checkSweepAndMSS(drawTargets.primary, reports, currentPrice);

  // Step 8: Entry guidance
  const entryGuidance = getEntryGuidance(drawTargets.primary, drawTargets.oppositePool, sweepStatus, htfBias);

  // HRLR/LRLR Classification
  const hrlrLrlr = classifyHRLR_LRLR(drawTargets, htfBias, currentPrice, reports);

  // Sweep vs Run Classification (on primary draw target if swept)
  const candles1m = loadCandles("1m");
  let sweepVsRun = null;
  if (drawTargets.primary && sweepStatus.swept) {
    sweepVsRun = classifySweepVsRun(
      drawTargets.primary.price,
      drawTargets.primary.type,
      htfBias,
      reports,
      candles1m
    );
  }

  return {
    pair: p,
    time: new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false }) + " NY",
    currentPrice,
    htfBias,
    pdhPdl,
    pwhPwl,
    relEquals,
    drawTargets,
    sweepStatus,
    entryGuidance,
    hrlrLrlr,
    sweepVsRun,
  };
}

// ═══ OUTPUT ═══
const result = analyzeLiquidity(PAIR);

const outDir = path.join(ROOT, "stages", "02_key_levels", "output");
fs.mkdirSync(outDir, { recursive: true });

let md = `# Liquidity Analysis — ${result.pair} — ${DATE}\n\n`;
md += `## Current Price: ${r5(result.currentPrice)}\n\n`;

md += `## Step 1: HTF Bias\n`;
md += `- **${result.htfBias.detail}**\n\n`;

md += `## Step 2: Previous Day Levels (PDH/PDL)\n`;
if (result.pdhPdl) {
  md += `| Level | Price |\n|-------|-------|\n`;
  md += `| PDH | ${r5(result.pdhPdl.pdh)} |\n`;
  md += `| PDL | ${r5(result.pdhPdl.pdl)} |\n`;
  md += `| Range | ${r5(result.pdhPdl.range)} |\n\n`;
} else {
  md += `No daily data available.\n\n`;
}

md += `## Step 3: Previous Week Levels (PWH/PWL)\n`;
if (result.pwhPwl) {
  md += `| Level | Price |\n|-------|-------|\n`;
  md += `| PWH | ${r5(result.pwhPwl.pwh)} |\n`;
  md += `| PWL | ${r5(result.pwhPwl.pwl)} |\n`;
  md += `| Range | ${r5(result.pwhPwl.range)} |\n\n`;
} else {
  md += `No weekly data available.\n\n`;
}

md += `## Step 4: Relative Equal Levels\n`;
md += `- ${result.relEquals.detail}\n\n`;

if (result.relEquals.magnetCount > 0) {
  md += `### Smooth Magnets (left smooth = unfinished business)\n`;
  for (const m of result.relEquals.magnets) {
    md += `- ${m.smoothness.detail}\n`;
  }
  md += `\n`;
}

md += `## Step 5: Next Draw-on-Liquidity\n`;
md += `| Priority | Level | Price | Type | Label |\n`;
md += `|----------|-------|-------|------|-------|\n`;
for (const t of result.drawTargets.allTargets.slice(0, 6)) {
  md += `| ${t.priority} | ${t.level} | ${r5(t.price)} | ${t.type} | ${t.label} |\n`;
}
md += `\n**Primary Draw**: ${result.drawTargets.detail}\n\n`;

md += `## Step 6-7: Sweep & MSS Status\n`;
md += `- ${result.sweepStatus.detail}\n\n`;

md += `## Step 8: Entry Guidance\n`;
md += `- ${result.entryGuidance.detail}\n\n`;

md += `## HRLR / LRLR Classification\n`;
md += `- ${result.hrlrLrlr.detail}\n`;
md += `| Level | Price | Type | Class | Defenders | FVG Sig | Role |\n`;
md += `|-------|-------|------|-------|-----------|---------|------|\n`;
for (const t of result.hrlrLrlr.targets.slice(0, 8)) {
  const role = t === result.hrlrLrlr.primaryLRLR ? '🎯 TP1' : t === result.hrlrLrlr.stretchHRLR ? '📐 TP2' : '';
  md += `| ${t.label} | ${r5(t.price)} | ${t.type} | **${t.classification}** | ${t.defenders} | ${t.hasNearbyFVG ? '✅' : '✗'} | ${role} |\n`;
}
md += `\n`;

if (result.sweepVsRun) {
  md += `## Sweep vs Run Classification\n`;
  md += `- **${result.sweepVsRun.classification}**: ${result.sweepVsRun.detail}\n`;
  md += `- HTF Agrees: ${result.sweepVsRun.htfAgreesWithSwept ? 'Yes → run expected' : 'No → sweep expected'}\n`;
  md += `- Price Back Inside: ${result.sweepVsRun.priceClosedBackInside ? 'Yes' : 'No'}\n`;
  md += `- MSS Found: ${result.sweepVsRun.mssFound ? '✅ ' + result.sweepVsRun.mssDirection : '⏳ No'}\n`;
  md += `- Action: **${result.sweepVsRun.action}**\n\n`;
}

if (result.entryGuidance.ready) {
  md += `### Trade Parameters\n`;
  md += `| Param | Value |\n|-------|-------|\n`;
  md += `| Direction | ${result.entryGuidance.direction} |\n`;
  md += `| Entry | ${result.entryGuidance.entry} |\n`;
  md += `| SL | ${r5(result.entryGuidance.sl?.price || 0)} — ${result.entryGuidance.sl?.label || ''} |\n`;
  if (result.entryGuidance.tp) {
    md += `| TP | ${r5(result.entryGuidance.tp.price)} — ${result.entryGuidance.tp.label} |\n`;
  }
}

const outFile = path.join(outDir, `${PAIR.toLowerCase()}_liquidity.md`);
fs.writeFileSync(outFile, md, "utf8");

// JSON for pipeline
const jsonOut = path.join(ROOT, "shared", DATE, (PAIR === "XAUUSD" ? "GOLD" : PAIR), "liquidity_marker.json");
const jsonDir = path.dirname(jsonOut);
fs.mkdirSync(jsonDir, { recursive: true });
fs.writeFileSync(jsonOut, JSON.stringify(result, null, 2));

// Console summary
console.log(`\n═══ LIQUIDITY MARKER — ${PAIR} ═══`);
console.log(`  HTF Bias: ${result.htfBias.detail}`);
console.log(`  PDH/PDL: ${result.pdhPdl?.detail || 'N/A'}`);
console.log(`  PWH/PWL: ${result.pwhPwl?.detail || 'N/A'}`);
console.log(`  Draw: ${result.drawTargets.detail}`);
console.log(`  Sweep: ${result.sweepStatus.detail}`);
console.log(`  Entry: ${result.entryGuidance.detail}`);
console.log(`  HRLR/LRLR: ${result.hrlrLrlr.detail}`);
if (result.sweepVsRun) {
  console.log(`  Sweep/Run: ${result.sweepVsRun.classification} — ${result.sweepVsRun.action}`);
}
console.log(`  ✓ Output → ${outFile}`);
console.log(`  ✓ JSON → ${jsonOut}`);

// ═══ SWEEP vs RUN CLASSIFICATION ═══
// ICT: "If HTF direction agrees with the swept side, expect a RUN. If it disagrees, expect a SWEEP."
// A sweep reverses after taking liquidity. A run continues through.
// Classification can only happen AFTER the post-sweep candle close — not at the moment of sweep.
function classifySweepVsRun(sweptLevel, sweptType, htfBias, reports, candles1m) {
  if (!sweptLevel || !candles1m || candles1m.length < 5) {
    return { classification: "UNKNOWN", detail: "Insufficient data for sweep vs run classification" };
  }

  const currentPrice = candles1m[candles1m.length - 1].close;
  const recentCloses = candles1m.slice(-5).map(c => c.close);

  // Determine the swept side and HTF agreement
  const sweptSide = sweptType === "BSL" ? "BUY-SIDE (above)" : "SELL-SIDE (below)";
  const htfSide = htfBias.direction === "bullish" ? "SELL-SIDE (SSL target)" :
                   htfBias.direction === "bearish" ? "BUY-SIDE (BSL target)" : "NEUTRAL";

  // Key rule: HTF agrees = RUN, HTF disagrees = SWEEP
  const htfAgreesWithSwept =
    (htfBias.direction === "bearish" && sweptType === "BSL") ||   // Bearish HTF → sweeps BSL = with trend = RUN
    (htfBias.direction === "bullish" && sweptType === "SSL");     // Bullish HTF → sweeps SSL = with trend = RUN

  // Post-sweep structure check
  const priceClosedBackInside = sweptType === "BSL"
    ? currentPrice < sweptLevel  // After BSL sweep, price back below = reversal
    : currentPrice > sweptLevel; // After SSL sweep, price back above = reversal

  const priceContinuingAway = sweptType === "BSL"
    ? currentPrice > sweptLevel * 1.001  // Price still above swept BSL = continuing
    : currentPrice < sweptLevel * 0.999; // Price still below swept SSL = continuing

  // Check for displacement away from swept level
  const displacedAway = sweptType === "BSL"
    ? recentCloses.every(c => c > sweptLevel)            // All recent closes above swept BSL
    : recentCloses.every(c => c < sweptLevel);           // All recent closes below swept SSL

  // Check for MSS on 1m (reversal signal)
  const mssCheck = (() => {
    const swings = [];
    for (let i = 2; i < candles1m.length - 2; i++) {
      const c = candles1m[i];
      let isSwingHigh = true, isSwingLow = true;
      for (let j = i - 2; j <= i + 2; j++) {
        if (j === i) continue;
        if (candles1m[j].high >= c.high) isSwingHigh = false;
        if (candles1m[j].low <= c.low) isSwingLow = false;
      }
      if (isSwingHigh) swings.push({ idx: i, type: "high", price: c.high });
      if (isSwingLow) swings.push({ idx: i, type: "low", price: c.low });
    }
    // Check for MSS: after BSL sweep, close below prior swing low = bearish MSS
    if (sweptType === "BSL") {
      const priorSwingLow = [...swings].reverse().find(s => s.type === "low");
      if (priorSwingLow && currentPrice < priorSwingLow.price) return { found: true, direction: "BEARISH" };
    }
    // After SSL sweep, close above prior swing high = bullish MSS
    if (sweptType === "SSL") {
      const priorSwingHigh = [...swings].reverse().find(s => s.type === "high");
      if (priorSwingHigh && currentPrice > priorSwingHigh.price) return { found: true, direction: "BULLISH" };
    }
    return { found: false };
  })();

  // Classification
  let classification, action, detail;
  if (htfAgreesWithSwept && displacedAway && !priceClosedBackInside) {
    classification = "RUN";
    action = htfBias.direction === "bearish" ? "LOOK FOR SHORT CONTINUATION" : "LOOK FOR LONG CONTINUATION";
    detail = `🏃 LIQUIDITY RUN: ${sweptSide} swept and price CONTINUING. HTF ${htfBias.direction} agrees with swept side — this is a run, not a reversal. Do NOT wait for MSS. Trade with the trend.`;
  } else if (!htfAgreesWithSwept && priceClosedBackInside && mssCheck.found) {
    classification = "SWEEP";
    action = mssCheck.direction === "BEARISH" ? "LOOK FOR SHORT ENTRY" : "LOOK FOR LONG ENTRY";
    detail = `🔄 LIQUIDITY SWEEP: ${sweptSide} swept and REVERSED. HTF ${htfBias.direction} disagrees with swept side. MSS ${mssCheck.direction} confirmed. Look for PD array retest entry.`;
  } else if (!htfAgreesWithSwept && priceClosedBackInside && !mssCheck.found) {
    classification = "POTENTIAL_SWEEP";
    action = "WAIT FOR MSS";
    detail = `⏳ POTENTIAL SWEEP: ${sweptSide} swept and price back inside range. HTF disagrees — likely reversal. Awaiting MSS confirmation on 1m.`;
  } else if (htfAgreesWithSwept && priceClosedBackInside) {
    classification = "INDUCEMENT";
    action = "WAIT — possible trap";
    detail = `⚠️ INDUCEMENT: ${sweptSide} swept, price reversed back… but HTF agrees with swept side. First sweep of session may be a trap. Wait for second move to confirm real direction.`;
  } else {
    classification = "UNCLEAR";
    action = "WAIT";
    detail = `❓ UNCLEAR: ${sweptSide} swept. Mixed signals — HTF ${htfBias.direction}, no clear post-sweep structure. Wait for next candle.`;
  }

  return {
    classification,
    action,
    sweptSide,
    htfAgreesWithSwept,
    priceClosedBackInside,
    displacedAway,
    mssFound: mssCheck.found,
    mssDirection: mssCheck.direction || null,
    currentPrice,
    sweptLevel,
    detail,
  };
}

module.exports = { analyzeLiquidity, markPDH_PDL, markPWH_PWL, identifyDrawTargets, checkSweepAndMSS, getEntryGuidance, classifyHRLR_LRLR, classifySweepVsRun };
