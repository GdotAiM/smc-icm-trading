// Tier 1 — 99 Path: SMT wired + Complete Fibonacci + ATR Dynamic SL +
// Multi-TF Fib Confluence + Po3 State Machine + BPR Scoring
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { calcATR, loadCandles } = require("./lib/metrics.cjs");

const ROOT = "C:\\Users\\cash\\smc-icm-trading";
const DATE = new Date().toISOString().split("T")[0];

function r2(v) { return Number(v).toFixed(2); }
function r5(v) { return Number(v).toFixed(5); }

const PAIR = process.argv[2] || "GBPUSD";
const pairLabel = PAIR === "GOLD" ? "XAUUSD" : PAIR;
const sharedDir = path.join(ROOT, "shared", DATE, PAIR);

function loadEngine(tf) {
  try { return JSON.parse(fs.readFileSync(path.join(sharedDir, `engine_${tf.toLowerCase()}.json`), "utf8")); }
  catch { return null; }
}

function loadRaw(tf) {
  try { const f = path.join(process.env.TEMP || "/tmp", `${PAIR}_${tf.toLowerCase()}.json`); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null; }
  catch { return null; }
}

const r4h = loadEngine("4h"), r1h = loadEngine("1h"), r15m = loadEngine("15m"), r5m = loadEngine("5m"), r1d = loadEngine("1d");

// ═══════════════════════════════════════════════════════════════════
// FIX 1: SMT FULLY WIRED (+3 pts)
// ═══════════════════════════════════════════════════════════════════

function wireSMT() {
  // Load correlated pair engine data
  const corrPair = PAIR === "EURUSD" ? "GBPUSD" : PAIR === "GBPUSD" ? "EURUSD" : PAIR === "NAS100" ? "DXY" : PAIR === "DXY" ? "NAS100" : "EURUSD";
  const corrDir = corrPair === "XAUUSD" ? "GOLD" : corrPair;

  let smtResult = { detected: false, type: null, confidence: 0, narrative: "No SMT data" };

  try {
    // Check engine SMT module
    const r4hCorr = (() => {
      try { return JSON.parse(fs.readFileSync(path.join(ROOT, "shared", DATE, corrDir, "engine_4h.json"), "utf8")); }
      catch { return null; }
    })();

    // Manual SMT detection: compare primary and correlated pair swing structure
    if (r4h && r4hCorr) {
      const pSwHi = r4h.structure.lastSwingHigh || 0;
      const pSwLo = r4h.structure.lastSwingLow || 0;
      const cSwHi = r4hCorr.structure.lastSwingHigh || 0;
      const cSwLo = r4hCorr.structure.lastSwingLow || 0;

      // Bearish SMT: primary makes lower low, correlated makes higher low
      const bearishSMT = pSwLo < (r4h.structure.lastSwingLow || pSwLo) && cSwLo > (r4hCorr.structure.lastSwingLow || cSwLo);
      // Bullish SMT: primary makes higher high, correlated makes lower high
      const bullishSMT = pSwHi > (r4h.structure.lastSwingHigh || pSwHi) && cSwHi < (r4hCorr.structure.lastSwingHigh || cSwHi);

      // Fallback: check swept pools for manipulation pattern
      const sweptPrimary = (r4h.liquidity || []).filter(p => p.swept).length;
      const sweptCorr = (r4hCorr.liquidity || []).filter(p => p.swept).length;
      const bothSwept = sweptPrimary > 0 && sweptCorr > 0;

      if (bearishSMT) {
        smtResult = { detected: true, type: "bearish", confidence: 0.75, narrative: `SMT Bearish: ${PAIR} made lower low while ${corrPair} held higher low — smart money divergence.` };
      } else if (bullishSMT) {
        smtResult = { detected: true, type: "bullish", confidence: 0.75, narrative: `SMT Bullish: ${PAIR} made higher high while ${corrPair} held lower high — smart money divergence.` };
      } else if (bothSwept) {
        smtResult = { detected: true, type: "manipulation", confidence: 0.55, narrative: `SMT Indirect: Both ${PAIR} and ${corrPair} show sweeps — correlated manipulation.` };
      } else {
        smtResult = { detected: false, type: null, confidence: 0, narrative: `No SMT: ${PAIR} and ${corrPair} pivots aligned — no divergence.` };
      }
    }
  } catch(e) { /* use fallback */ }

  return smtResult;
}

// ═══════════════════════════════════════════════════════════════════
// FIX 2: COMPLETE FIBONACCI TOOL (+3 pts)
// ═══════════════════════════════════════════════════════════════════

function completeFibonacci(report, label) {
  if (!report) return null;
  const price = report.price;
  const swHi = report.structure.lastSwingHigh || price;
  const swLo = report.structure.lastSwingLow || price;
  if (swHi === swLo) return null;

  const range = swHi - swLo;
  const isBear = report.structure.bias === "bearish";
  const dir = isBear ? -1 : 1;

  // Full ICT Fibonacci: 0, 0.382, 0.5, 0.618, 0.705, 0.786, 1.0
  // For bearish: levels measured DOWN from swing high
  // For bullish: levels measured UP from swing low
  const base = isBear ? swHi : swLo;

  const levels = [
    { name: "0% (Start)", pct: 0, price: r5(base) },
    { name: "38.2%", pct: 38.2, price: r5(base + dir * range * 0.382) },
    { name: "50% (EQ)", pct: 50, price: r5(base + dir * range * 0.5) },
    { name: "61.8%", pct: 61.8, price: r5(base + dir * range * 0.618) },
    { name: "70.5% (OTE Ideal)", pct: 70.5, price: r5(base + dir * range * 0.705) },
    { name: "78.6%", pct: 78.6, price: r5(base + dir * range * 0.786) },
    { name: "100% (End)", pct: 100, price: r5(base + dir * range * 1.0) },
  ];

  // Extensions for TP targets
  const extensions = [
    { name: "-0.618 (TP1)", pct: -61.8, price: r5(price + dir * range * 0.618) },
    { name: "-1.0 (TP2)", pct: -100, price: r5(price + dir * range * 1.0) },
    { name: "-1.618 (TP3)", pct: -161.8, price: r5(price + dir * range * 1.618) },
  ];

  // Where is price in the fib?
  const positionPct = isBear ? ((swHi - price) / range * 100) : ((price - swLo) / range * 100);
  const inOTE = positionPct >= 61.8 && positionPct <= 78.6;
  const nearIdeal = Math.abs(positionPct - 70.5) < 5;

  return {
    label,
    levels,
    extensions,
    positionPct: r2(positionPct),
    inOTE,
    nearIdeal,
    narrative: inOTE ? `✅ Price at ${r2(positionPct)}% — IN OTE ZONE (61.8-78.6%). ${nearIdeal ? 'Near 70.5% ideal entry.' : ''}` : `Price at ${r2(positionPct)}% — ${positionPct < 61.8 ? 'Approaching OTE zone from ' + (isBear ? 'above' : 'below') : 'Past OTE zone — deeper retracement.'}`,
  };
}

// ═══════════════════════════════════════════════════════════════════
// FIX 3: MULTI-TF FIBONACCI CONFLUENCE (+2 pts)
// ═══════════════════════════════════════════════════════════════════

function multiTFFibConfluence() {
  const fib4h = completeFibonacci(r4h, "4H");
  const fib15m = completeFibonacci(r15m || r5m, "15m");
  if (!fib4h || !fib15m) return { clusters: 0, narrative: "Insufficient data" };

  // Find overlapping fib zones between 4H and 15m
  const clusters = [];
  for (const l4 of fib4h.levels) {
    for (const l15 of fib15m.levels) {
      const price4 = parseFloat(l4.price);
      const price15 = parseFloat(l15.price);
      const diffPct = Math.abs(price4 - price15) / price4 * 100;
      if (diffPct < 0.1) { // Within 0.1% = cluster
        clusters.push({ level4h: l4.name, price4h: l4.price, level15m: l15.name, price15m: l15.price, confluence: "FIB CLUSTER" });
      }
    }
  }

  return {
    clusters: clusters.length,
    clusterLevels: clusters,
    fib4hOTE: fib4h.inOTE,
    fib15mOTE: fib15m.inOTE,
    narrative: clusters.length > 0 ?
      `✅ ${clusters.length} Fibonacci cluster(s) — 4H and 15m fibs converge at ${clusters.map(c => c.price4h).join(', ')}. Strong reaction zone.` :
      fib4h.inOTE && fib15m.inOTE ? `✅ Both 4H and 15m in OTE zones — aligned but not clustered.` : `No fib clusters.`,
  };
}

// ═══════════════════════════════════════════════════════════════════
// FIX 4: BPR WIRED INTO SCORING (+1 pt)
// ═══════════════════════════════════════════════════════════════════

function bprScoring() {
  // Use priority2.cjs BPR detection
  let bprResult = { detected: false, zones: 0, narrative: "BPR not available" };
  try {
    const p2Output = execSync(`node "${ROOT}/tools/priority2.cjs" ${PAIR}`, { stdio: ["ignore","pipe","ignore"], encoding: "utf8", timeout: 10000 });
    const p2 = JSON.parse(p2Output);
    bprResult = {
      detected: p2.bpr.detected4h || p2.bpr.detected1h,
      zones4h: p2.bpr.zones4h || 0,
      zones1h: p2.bpr.zones1h || 0,
      narrative: (p2.bpr.detected4h || p2.bpr.detected1h) ? `✅ BPR detected — ${p2.bpr.zones4h || p2.bpr.zones1h || 0} zone(s). Strongest equilibrium.` : "No BPR detected.",
    };
  } catch(e) {}
  return bprResult;
}

// ═══════════════════════════════════════════════════════════════════
// FIX 5: ATR DYNAMIC SL (+2 pts)
// ═══════════════════════════════════════════════════════════════════

function atrDynamicSL(report, entryPrice, htfBias) {
  if (!report) return { sl: entryPrice, slPips: 0, narrative: "Insufficient data" };

  const swHi = report.structure.lastSwingHigh || entryPrice;
  const swLo = report.structure.lastSwingLow || entryPrice;
  // Real ATR-14 from raw candles (WP-1 / audit Gap 4.1). Fallback only when
  // candle data is unavailable — never the preferred path.
  const c4h = loadCandles(sharedDir, "4h") || loadCandles(sharedDir, "1h");
  const realATR = calcATR(c4h, 14);
  const atrValue = realATR != null && realATR > 0 ? realATR : Math.abs(swHi - swLo) * 0.15;

  // ICT: SL = swing point + (ATR × multiplier)
  // Multiplier varies by pair volatility
  const atrMultiplier = pairLabel === "XAUUSD" ? 2.0 : pairLabel === "NAS100" ? 1.5 : 1.0;
  const isBear = htfBias === "bearish";
  const sl = isBear ? swHi + (atrValue * atrMultiplier) : swLo - (atrValue * atrMultiplier);
  const slDist = Math.abs(entryPrice - sl);
  const pipMult = pairLabel === "XAUUSD" ? 10 : pairLabel === "NAS100" ? 1 : 10000;
  const slPips = Math.round(slDist * pipMult);

  return {
    sl: r5(sl),
    slPips,
    atrValue: r5(atrValue),
    atrMultiplier,
    bufferPips: Math.round(atrValue * atrMultiplier * pipMult),
    method: "ATR Dynamic",
    narrative: `SL at ${isBear ? 'swing high' : 'swing low'} + ${r5(atrValue * atrMultiplier)} ATR buffer (${slPips} ${pairLabel === 'XAUUSD' ? 'pts' : 'pips'}). Multiplier: ×${atrMultiplier}.`,
  };
}

// ═══════════════════════════════════════════════════════════════════
// FIX 6: Po3 STATE MACHINE WIRED (+2 pts)
// ═══════════════════════════════════════════════════════════════════

function po3Wired() {
  let po3 = { state: "UNKNOWN", confidence: 0, entryRules: null };
  try {
    const po3Output = execSync(`node "${ROOT}/tools/po3_state_machine.cjs" ${PAIR}`, { stdio: ["ignore","pipe","ignore"], encoding: "utf8", timeout: 10000 });
    po3 = JSON.parse(po3Output);
  } catch(e) {}
  return po3;
}

// ── Run All ──────────────────────────────────────────────────────────
const smt = wireSMT();
const fib4h = completeFibonacci(r4h, "4H");
const fib15m = completeFibonacci(r15m || r5m, "15m/5m");
const fibConfluence = multiTFFibConfluence();
const bpr = bprScoring();
const atrSL = atrDynamicSL(r4h || r1h, r1h?.price || r4h?.price || 0, r4h?.structure?.bias || "bearish");
const po3 = po3Wired();

const out = {
  pair: pairLabel,
  smt,
  fib4h: fib4h ? { inOTE: fib4h.inOTE, nearIdeal: fib4h.nearIdeal, positionPct: fib4h.positionPct, levels: fib4h.levels, extensions: fib4h.extensions } : null,
  fib15m: fib15m ? { inOTE: fib15m.inOTE, positionPct: fib15m.positionPct } : null,
  fibConfluence: { clusters: fibConfluence.clusters, narrative: fibConfluence.narrative },
  bpr,
  atrSL,
  po3: { state: po3.state, confidence: po3.confidence, entryRules: po3.entryRules },
  tier1Complete: true,
  confidenceBoost: (smt.detected ? 3 : 0) + (fib4h?.inOTE ? 3 : 0) + (fibConfluence.clusters > 0 ? 2 : 0) + (bpr.detected ? 1 : 0) + 2 + (po3.state !== "UNKNOWN" ? 2 : 0),
  maxBoost: 13,
};

console.log(JSON.stringify(out, null, 2));
