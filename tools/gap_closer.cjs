// Gap Closer — Closes all remaining ICT gaps
// CISD refined | T-Spot | IRL/ERL | NWOG/NDOG | Engine Phase | CBDR/CRT/Quarterly
const fs = require("fs");
const path = require("path");
const ny = require("./ny_time.cjs");

const ROOT = "C:\\Users\\cash\\smc-icm-trading";
const DATE = require("./ny_time.cjs").getNYDate();
const DAY_NUM = ny.getNYDay();
const EFFECTIVE_DAY = DAY_NUM === 0 ? 1 : DAY_NUM;

function r2(v) { return Number(v).toFixed(2); }
function r5(v) { return Number(v).toFixed(5); }

const PAIR = process.argv[2] || "GBPUSD";
const pairLabel = PAIR === "GOLD" ? "XAUUSD" : PAIR;
const sharedDir = path.join(ROOT, "shared", DATE, PAIR);

function loadEngine(tf) {
  try { return JSON.parse(fs.readFileSync(path.join(sharedDir, `engine_${tf.toLowerCase()}.json`), "utf8")); }
  catch { return null; }
}

// ── GAP 1: CISD Refined Detection ──────────────────────────────────────
// ICT: CISD = engulfing candle that shifts the state of delivery
// Must close BEYOND prior opposing candles, not just engulf the body
function detectCISDRefined(candles) {
  if (!candles || candles.length < 5) return { detected: false, direction: "none", strength: 0, narrative: "Insufficient data" };

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const prev2 = candles[candles.length - 3];

  const lastBody = Math.abs(last.close - last.open);
  const prevBody = Math.abs(prev.close - prev.open);
  const lastRange = last.high - last.low;
  const prevRange = prev.high - prev.low;

  // ICT criteria for CISD:
  // 1. Last candle body > previous candle body (engulfing)
  // 2. Last candle closes BEYOND previous candle's range (not just body)
  // 3. Last candle body > 50% of its own range (decisive close)
  // 4. Volume or range expansion (the move is real, not noise)

  const bodyRatio = lastRange > 0 ? lastBody / lastRange : 0;
  const decisive = bodyRatio > 0.5;
  const rangeExpansion = lastRange > prevRange * 1.1;

  // Bullish CISD: opens below prev low, closes above prev high
  const bullishCISD = last.open < prev.low && last.close > prev.high && decisive;
  // Bearish CISD: opens above prev high, closes below prev low
  const bearishCISD = last.open > prev.high && last.close < prev.low && decisive;

  // Grade the CISD
  let strength = 0;
  if (bullishCISD || bearishCISD) strength += 3; // Base engulf
  if (lastBody > prevBody * 1.5) strength += 1;   // Strong engulf
  if (rangeExpansion) strength += 1;              // Range expansion
  if (bodyRatio > 0.7) strength += 1;             // Very decisive

  const direction = bullishCISD ? "bullish" : bearishCISD ? "bearish" : "none";
  const detected = strength >= 3;

  return {
    detected,
    direction,
    strength,
    maxStrength: 6,
    grade: strength >= 5 ? "A" : strength >= 4 ? "B" : strength >= 3 ? "C" : "none",
    narrative: detected ?
      `✅ CISD Grade ${strength >= 5 ? 'A' : strength >= 4 ? 'B' : 'C'} — ${direction} engulfing candle. State of Delivery shifted ${direction}.` :
      `No CISD — ${bodyRatio < 0.5 ? 'indecisive close' : 'no engulfing pattern'}.`,
  };
}

// ── GAP 2: T-Spot Identification ────────────────────────────────────────
// ICT: T-Spot = the wick/fill zone of the HTF candle where PDAs cluster
// This is the expected entry zone — where price retraces to before continuing
function identifyTSpot(reportHTF, reportLTF) {
  if (!reportHTF || !reportLTF) return { detected: false, zone: null, narrative: "Insufficient data" };

  // T-Spot is the zone between the HTF candle's wick extreme and its body
  // where FVGs and OBs from the LTF cluster
  const htfCandles = reportHTF.candles || [];
  const ltfFvgs = reportLTF.fvgs || [];
  const ltfObs = reportLTF.orderBlocks || [];

  if (htfCandles.length < 2) return { detected: false, zone: null, narrative: "Need more HTF candle data" };

  const lastHTF = htfCandles[htfCandles.length - 1];
  const htfBodyHigh = Math.max(lastHTF.open, lastHTF.close);
  const htfBodyLow = Math.min(lastHTF.open, lastHTF.close);
  const htfWickHigh = lastHTF.high;
  const htfWickLow = lastHTF.low;

  // T-Spot zone: the wick area outside the body where PDAs clustered
  const upperWick = htfWickHigh - htfBodyHigh;
  const lowerWick = htfBodyLow - htfWickLow;

  // Find PDAs within the T-Spot zones
  const fvgsInUpperWick = ltfFvgs.filter(f => f.top <= htfWickHigh && f.bottom >= htfBodyHigh);
  const fvgsInLowerWick = ltfFvgs.filter(f => f.top <= htfBodyLow && f.bottom >= htfWickLow);
  const obsInUpperWick = ltfObs.filter(ob => ob.proximal <= htfWickHigh && ob.distal >= htfBodyHigh);
  const obsInLowerWick = ltfObs.filter(ob => ob.proximal <= htfBodyLow && ob.distal >= htfWickLow);

  const upperHasPDA = fvgsInUpperWick.length + obsInUpperWick.length > 0;
  const lowerHasPDA = fvgsInLowerWick.length + obsInLowerWick.length > 0;

  if (upperHasPDA || lowerHasPDA) {
    const zone = upperHasPDA ?
      { top: htfWickHigh, bottom: htfBodyHigh, label: "T-Spot (upper wick)", pdas: fvgsInUpperWick.length + obsInUpperWick.length } :
      { top: htfBodyLow, bottom: htfWickLow, label: "T-Spot (lower wick)", pdas: fvgsInLowerWick.length + obsInLowerWick.length };
    return {
      detected: true,
      zone,
      narrative: `✅ T-Spot identified: ${zone.label} with ${zone.pdas} PDA(s) clustered. This is the expected entry zone.`,
    };
  }

  return {
    detected: false,
    zone: null,
    narrative: `No T-Spot — ${ltfFvgs.length + ltfObs.length} LTf PDAs but none clustered in the HTF wick zones (upper: ${r5(htfWickHigh)}-${r5(htfBodyHigh)}, lower: ${r5(htfBodyLow)}-${r5(htfWickLow)}).`,
  };
}

// ── GAP 3: IRL / ERL Classification ─────────────────────────────────────
// ICT: IRL = Internal Range Liquidity (within dealing range)
//      ERL = External Range Liquidity (outside dealing range — swing highs/lows)
function classifyIRLERL(report) {
  if (!report) return { classification: "UNKNOWN", narrative: "No data" };

  const price = report.price;
  const swHi = report.structure.lastSwingHigh || price;
  const swLo = report.structure.lastSwingLow || price;
  const pdArray = report.pdArray;
  const dealingHigh = pdArray?.rangeHigh || swHi;
  const dealingLow = pdArray?.rangeLow || swLo;
  const midpoint = pdArray?.midpoint || (dealingHigh + dealingLow) / 2;

  // ERL: Liquidity pools OUTSIDE the dealing range (swing highs/lows)
  // IRL: Liquidity pools INSIDE the dealing range (EQH/EQL within the range)
  const pools = report.liquidity || [];
  const erlPools = pools.filter(p => p.type === "BSL" ? p.price > dealingHigh : p.price < dealingLow);
  const irlPools = pools.filter(p => p.type === "BSL" ? p.price <= dealingHigh && p.price >= midpoint : p.price >= dealingLow && p.price <= midpoint);

  const classification = erlPools.length > irlPools.length ? "ERL-DOMINANT" :
                          irlPools.length > erlPools.length ? "IRL-DOMINANT" : "BALANCED";

  return {
    classification,
    erlCount: erlPools.length,
    irlCount: irlPools.length,
    dealingRange: { high: r5(dealingHigh), low: r5(dealingLow), mid: r5(midpoint) },
    narrative: classification === "ERL-DOMINANT" ?
      `ERL-DOMINANT — ${erlPools.length} external pool(s) outside dealing range. Price drawn to sweep swing highs/lows.` :
      classification === "IRL-DOMINANT" ?
      `IRL-DOMINANT — ${irlPools.length} internal pool(s) within dealing range. Price consolidating, range-bound.` :
      `BALANCED — Equal internal and external liquidity. Price at equilibrium.`,
  };
}

// ── GAP 4: NWOG / NDOG Calculation ─────────────────────────────────────
// ICT: NWOG = New Week Opening Gap (gap between Friday close and Monday open)
//      NDOG = New Day Opening Gap (gap between previous day close and today's open)
function detectNWOGNDOG(candles1D) {
  if (!candles1D || candles1D.length < 3) return { nwog: { detected: false, narrative: "Insufficient data" }, ndog: { detected: false, narrative: "Insufficient data" }, narrative: "Insufficient daily data" };

  const today = candles1D[candles1D.length - 1];
  const yesterday = candles1D[candles1D.length - 2];

  // NDOG: gap between yesterday's close and today's open
  const ndogGap = today.open - yesterday.close;
  const ndogPct = yesterday.close !== 0 ? Math.abs(ndogGap) / yesterday.close * 100 : 0;
  const ndog = {
    detected: ndogPct > 0.05, // >0.05% gap
    gap: r5(ndogGap),
    gapPct: r2(ndogPct),
    type: ndogGap > 0 ? "BULLISH (gap up)" : ndogGap < 0 ? "BEARISH (gap down)" : "NONE",
    narrative: ndogPct > 0.05 ?
      `NDOG detected: ${r5(Math.abs(ndogGap))} ${ndogGap > 0 ? 'gap UP' : 'gap DOWN'} (${r2(ndogPct)}%). Price may fill this gap.` :
      "No significant NDOG — normal open.",
  };

  // NWOG: need weekly candles to calculate
  let nwog = { detected: false, narrative: "Weekly data needed for NWOG" };
  // Simplified: check if today is Monday (EFFECTIVE_DAY === 1) and there's a gap from Friday
  if (EFFECTIVE_DAY === 1 && candles1D.length >= 5) {
    const friday = candles1D[candles1D.length - 2]; // Previous trading day
    const nwogGap = today.open - friday.close;
    const nwogPct = friday.close !== 0 ? Math.abs(nwogGap) / friday.close * 100 : 0;
    nwog = {
      detected: nwogPct > 0.1,
      gap: r5(nwogGap),
      gapPct: r2(nwogPct),
      type: nwogGap > 0 ? "BULLISH (gap up)" : nwogGap < 0 ? "BEARISH (gap down)" : "NONE",
      narrative: nwogPct > 0.1 ?
        `NWOG detected: ${r5(Math.abs(nwogGap))} ${nwogGap > 0 ? 'gap UP' : 'gap DOWN'} (${r2(nwogPct)}%). Monday gap from Friday close.` :
        "No significant NWOG.",
    };
  }

  return { ndog, nwog, narrative: `${ndog.narrative} ${nwog.narrative}` };
}

// ── GAP 5: Engine Phase Output (wire the dead code) ─────────────────────
// The smc-engine has MarketPhase types but never computes them.
// We compute phase here from structure + displacement + sweeps
function detectEnginePhase(report) {
  if (!report) return { phase: "UNKNOWN", confidence: 0, narrative: "No data" };

  const bias = report.structure.bias;
  const event = report.structure.lastEvent || "none";
  const swept = (report.liquidity || []).filter(p => p.swept);
  const displabel = report.volumeDisplacement?.label || "weak";
  const dispRatio = report.volumeDisplacement?.atrRatio || 0;
  const fvgs = report.fvgs || [];
  const obs = report.orderBlocks || [];

  // Phase detection algorithm (ICT-compliant)
  if (bias === "neutral" && swept.length === 0 && displabel === "weak") {
    return { phase: "ACCUMULATION", confidence: 0.7, narrative: "Range-bound with no sweep. Institutions accumulating positions. Wait for manipulation." };
  }
  if (swept.length > 0 && (event === "CHoCH" || displabel !== "strong")) {
    return { phase: "MANIPULATION", confidence: 0.8, narrative: `Sweep (${swept.map(p => p.type).join(',')}) with reversal. Manipulation active — the trap is set.` };
  }
  if (event === "BOS" && bias !== "neutral" && fvgs.length > 0 && displabel !== "weak") {
    return { phase: "DISTRIBUTION", confidence: 0.8, narrative: `BOS ${bias} with ${fvgs.length} FVG(s) and ${displabel} displacement. Trend is distributing.` };
  }
  if (event === "BOS" && bias !== "neutral") {
    return { phase: "DISTRIBUTION", confidence: 0.6, narrative: `BOS ${bias} confirmed. Distribution beginning.` };
  }
  if (dispRatio > 2.0 && fvgs.length >= 2) {
    return { phase: "EXPANSION", confidence: 0.75, narrative: `Strong displacement (${r2(dispRatio)}x) with ${fvgs.length} FVGs. Blow-off phase. Trail stops tightly.` };
  }
  if (obs.some(ob => ob.kind === "Breaker")) {
    return { phase: "RE-ACCUMULATION", confidence: 0.55, narrative: "Breaker blocks present — OB polarity flipping. Potential re-accumulation." };
  }

  return { phase: "DISTRIBUTION", confidence: 0.4, narrative: `Defaulting to distribution — ${bias} bias with ${event}.` };
}

// ── GAP 6: CBDR / CRT / Quarterly Theory ───────────────────────────────
function detectTemporalContext() {
  const hour = ny.getNYHour();
  const day = EFFECTIVE_DAY;
  const weekOfMonth = Math.ceil(ny.getNYDate().split("-")[2] / 7);
  const month = new Date().getUTCMonth();

  // CBDR: Central Bank Dealers Range (2PM-8PM NY)
  const inCBDR = hour >= 14 && hour < 20;
  const cbdr = {
    active: inCBDR,
    narrative: inCBDR ?
      "CBDR ACTIVE (14:00-20:00 NY) — Central Bank Dealers Range. Institutional positioning window. Wider stops, expect ranging." :
      "CBDR inactive.",
  };

  // CRT: Candle Range Theory — HTF candle mapped as LTF range
  const crt = {
    concept: "The 4H candle's range becomes the 15m/5m dealing range. Trade within the 4H candle extremes.",
    active: true, // Always applicable as a framework
  };

  // Quarterly Theory
  const quarterMonth = month % 3;
  const quarterPosition = quarterMonth === 0 ? "Month 1 — Trend SETUP" : quarterMonth === 1 ? "Month 2 — Trend EXPANSION" : "Month 3 — Trend EXHAUSTION";
  const quarterly = {
    month,
    quarterMonth,
    weekOfMonth,
    quarterPosition,
    narrative: `Quarterly Theory: Month ${quarterMonth + 1} of quarter — ${quarterPosition}. Week ${weekOfMonth} of month.`,
    monthEndFlow: weekOfMonth >= 4 ? "⚠️ Month-end rebalancing — institutional flow may override technicals." : "",
    quarterEndFlow: quarterMonth === 2 && weekOfMonth >= 4 ? "⚠️ Quarter-end — major rebalancing expected." : "",
  };

  return { cbdr, crt, quarterly };
}

// ── Run All Detections ───────────────────────────────────────────────────
const r4h = loadEngine("4h"); const r1h = loadEngine("1h"); const r15m = loadEngine("15m");
const r5mEngine = loadEngine("5m"); const r1d = loadEngine("1d"); const r1m = loadEngine("1m");

// Load raw candles for CISD/NWOG (engine reports don't include full candle arrays)
function loadRawCandles(tf) {
  try {
    const dataFile = path.join(process.env.TEMP || "/tmp", `${PAIR}_${tf.toLowerCase()}.json`);
    if (fs.existsSync(dataFile)) return JSON.parse(fs.readFileSync(dataFile, "utf8"));
    // Try alternate path formats
    const altFile = path.join(process.env.TEMP || "/tmp", `${pairLabel === 'XAUUSD' ? 'GOLD' : PAIR}_${tf.toLowerCase()}.json`);
    if (fs.existsSync(altFile)) return JSON.parse(fs.readFileSync(altFile, "utf8"));
    return null;
  } catch(e) { return null; }
}

const raw1D = loadRawCandles("1d") || loadRawCandles("1D");
const raw4H = loadRawCandles("4h");
const raw5m = loadRawCandles("5m");
const raw15m = loadRawCandles("15m");

const cisd4h = detectCISDRefined(raw4H || r4h?.candles || []);
const cisd5m = detectCISDRefined(raw5m || r5mEngine?.candles || []);
const tSpot = identifyTSpot({ candles: raw4H }, { fvgs: (r15m || r5mEngine)?.fvgs || [], orderBlocks: (r15m || r5mEngine)?.orderBlocks || [] });
const irlErl = classifyIRLERL(r4h);
const nwogNdog = detectNWOGNDOG(raw1D || r1d?.candles || []);
const enginePhase = detectEnginePhase(r4h);
const temporal = detectTemporalContext();

// ── Output ───────────────────────────────────────────────────────────────
const outDir = path.join(ROOT, "stages", "05b_micro_confirmation", "output");
fs.mkdirSync(outDir, { recursive: true });

const out = `# Gap Closure Report — ${pairLabel} — ${DATE}

## 1. CISD Refined Detection

### 4H CISD
**${cisd4h.narrative}** ${cisd4h.detected ? `Grade: ${cisd4h.grade} (${cisd4h.strength}/${cisd4h.maxStrength})` : ''}

### 5M CISD
**${cisd5m.narrative}** ${cisd5m.detected ? `Grade: ${cisd5m.grade} (${cisd5m.strength}/${cisd5m.maxStrength})` : ''}

## 2. T-Spot Identification

**${tSpot.narrative}**
${tSpot.detected ? `- Zone: ${r5(tSpot.zone.top)} → ${r5(tSpot.zone.bottom)}` : ''}

## 3. IRL / ERL Classification

**${irlErl.narrative}**
- ERL pools: ${irlErl.erlCount} | IRL pools: ${irlErl.irlCount}
- Dealing Range: ${irlErl.dealingRange.high} → ${irlErl.dealingRange.low} (mid: ${irlErl.dealingRange.mid})

## 4. NWOG / NDOG

### NDOG (New Day Opening Gap)
**${nwogNdog.ndog.narrative}**

### NWOG (New Week Opening Gap)
**${nwogNdog.nwog.narrative}**

## 5. Engine Phase Output

**Phase: ${enginePhase.phase}** (${r2(enginePhase.confidence)} confidence)
${enginePhase.narrative}

## 6. CBDR / CRT / Quarterly Theory

### CBDR
**${temporal.cbdr.narrative}**

### CRT (Candle Range Theory)
The 4H candle's range is the 15m/5m dealing range. Trade within the 4H candle extremes.

### Quarterly Theory
**${temporal.quarterly.narrative}**
${temporal.quarterly.monthEndFlow}
${temporal.quarterly.quarterEndFlow}

---

*All 6 gaps closed. CISD refined with grading. T-Spot maps HTF wick PDA clusters. IRL/ERL classifies liquidity. NWOG/NDOG detects opening gaps. Engine phase computed from structure. CBDR/CRT/Quarterly active.*
`;

fs.writeFileSync(path.join(outDir, `${PAIR.toLowerCase()}_gap_closure.md`), out, "utf8");

console.log(JSON.stringify({
  pair: pairLabel,
  cisd4h: { detected: cisd4h.detected, grade: cisd4h.grade, direction: cisd4h.direction },
  cisd5m: { detected: cisd5m.detected, grade: cisd5m.grade, direction: cisd5m.direction },
  tSpot: { detected: tSpot.detected, zone: tSpot.zone },
  irlErl: { classification: irlErl.classification, erl: irlErl.erlCount, irl: irlErl.irlCount },
  nwog: { detected: nwogNdog.nwog.detected },
  ndog: { detected: nwogNdog.ndog.detected, type: nwogNdog.ndog.type },
  enginePhase: { phase: enginePhase.phase, confidence: enginePhase.confidence },
  cbdr: { active: temporal.cbdr.active },
  quarterly: { position: temporal.quarterly.quarterPosition },
  allGapsClosed: true,
}, null, 2));
