// ICT MMXM Engine — Smart Money Reversal + Side of Curve + Symmetry
// Audited against ICT MMXM Report (Aug 2026)
//
// MMXM = Market Maker Model. The directional program from one liquidity pool
// to the opposing pool. Every model begins with a Smart Money Reversal (SMR):
// liquidity purge + displacement + market structure break.
//
// Core questions:
//   1. Has SMR occurred? (purge + displacement + break)
//   2. Which side of the curve? (buy model or sell model)
//   3. Where is the terminus? (symmetry projection)
//   4. What entry phase? (SMR retracement or continuation)
//
// Usage: node tools/mmxm_engine.cjs PAIR

const fs = require("fs");
const path = require("path");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..");
const DATE = require("./ny_time.cjs").getNYDate();
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

// ═══ SMART MONEY REVERSAL DETECTION ═══
// SMR requires all three: (1) liquidity purge, (2) displacement, (3) structure break
function detectSMR(reports) {
  const r4h = reports["4H"], r1h = reports["1H"];
  if (!r4h || !r1h) return { detected: false, detail: "Insufficient data" };

  // (1) Liquidity purge: swept pools at structural extremes
  const sweptPools = (r4h.liquidity || []).concat(r1h.liquidity || []).filter(p => p.swept);
  const bsLSwept = sweptPools.filter(p => p.type === "BSL");
  const ssLSwept = sweptPools.filter(p => p.type === "SSL");

  // (2) Displacement: strong move after the purge
  const displacement = (r4h.volumeDisplacement?.atrRatio || 0) > 0.8 ||
                       (r1h.volumeDisplacement?.atrRatio || 0) > 1.0;

  // (3) Structure break: CHoCH or BOS after the purge
  const structureBreak = r4h.structure?.lastEvent === "CHoCH" || r4h.structure?.lastEvent === "BOS" ||
                          r1h.structure?.lastEvent === "CHoCH" || r1h.structure?.lastEvent === "BOS";
  const breakDirection = r4h.structure?.bias || r1h.structure?.bias || "neutral";

  // SMR classification
  const bullSMR = ssLSwept.length > 0 && displacement && structureBreak && breakDirection === "bullish";
  const bearSMR = bsLSwept.length > 0 && displacement && structureBreak && breakDirection === "bearish";

  if (bullSMR) {
    return {
      detected: true, type: "BULLISH SMR (Sell-Side Purge → Bullish Reversal)",
      side: "BUY", direction: "BUY",
      purge: `SSL swept (${ssLSwept.length} pools)`,
      displacement: `${r2(r4h.volumeDisplacement?.atrRatio || r1h.volumeDisplacement?.atrRatio || 0)}x ATR`,
      break: `${structureBreak ? r4h.structure?.lastEvent || r1h.structure?.lastEvent : 'none'} ${breakDirection}`,
      detail: "✅ BULLISH SMR: Sell-side liquidity purged → bullish displacement → structure broken up. Buy model active.",
    };
  }
  if (bearSMR) {
    return {
      detected: true, type: "BEARISH SMR (Buy-Side Purge → Bearish Reversal)",
      side: "SELL", direction: "SELL",
      purge: `BSL swept (${bsLSwept.length} pools)`,
      displacement: `${r2(r4h.volumeDisplacement?.atrRatio || r1h.volumeDisplacement?.atrRatio || 0)}x ATR`,
      break: `${structureBreak ? r4h.structure?.lastEvent || r1h.structure?.lastEvent : 'none'} ${breakDirection}`,
      detail: "✅ BEARISH SMR: Buy-side liquidity purged → bearish displacement → structure broken down. Sell model active.",
    };
  }

  // Partial detection
  const purgeOnly = (ssLSwept.length > 0 || bsLSwept.length > 0) && !displacement;
  const dispOnly = displacement && !structureBreak;
  return {
    detected: false,
    purgePresent: ssLSwept.length > 0 || bsLSwept.length > 0,
    displacementPresent: displacement,
    breakPresent: structureBreak,
    detail: purgeOnly ? "Liquidity purged but no displacement yet — SMR forming." :
             dispOnly ? "Displacement present but no structure break — awaiting MSS." :
             sweptPools.length > 0 ? "Purge + displacement present but structure unconfirmed." :
             "No SMR signals — awaiting liquidity purge.",
  };
}

// ═══ SIDE OF THE CURVE ═══
// "If the most recent SMR was bullish, you're on the buy side. If bearish, sell side."
function getSideOfCurve(smr, reports) {
  const bias = reports["1D"]?.structure?.bias || "neutral";
  const h4Bias = reports["4H"]?.structure?.bias || "neutral";
  const currentPrice = reports["1H"]?.price || 0;

  if (smr.detected) {
    return {
      side: smr.side,
      confidence: bias === (smr.side === "BUY" ? "bullish" : "bearish") ? "HIGH (1D aligned)" : "MEDIUM",
      detail: `SMR confirmed: ${smr.side} side active. ${bias === (smr.side === 'BUY' ? 'bullish' : 'bearish') ? '1D bias confirms.' : '1D bias diverges — lower confidence.'}`,
    };
  }

  // Fallback: use bias alignment
  if (bias === "bullish" && h4Bias === "bullish") return { side: "BUY", confidence: "MEDIUM (bias, no SMR)", detail: "No SMR — using 1D+4H bullish alignment." };
  if (bias === "bearish" && h4Bias === "bearish") return { side: "SELL", confidence: "MEDIUM (bias, no SMR)", detail: "No SMR — using 1D+4H bearish alignment." };
  return { side: "NEUTRAL", confidence: "LOW", detail: "No SMR and no bias alignment — flat." };
}

// ═══ SYMMETRY PROJECTION ═══
// "The expansion often mirrors the preceding move in magnitude."
function projectSymmetry(reports, side) {
  const r4h = reports["4H"];
  if (!r4h?.structure) return null;

  const swHi = r4h.structure.lastSwingHigh;
  const swLo = r4h.structure.lastSwingLow;
  if (!swHi || !swLo) return null;

  const range = swHi - swLo;
  const currentPrice = r4h.price || reports["1H"]?.price || 0;

  const bullTarget = currentPrice + range;  // Mirror the preceding range upward
  const bearTarget = currentPrice - range;   // Mirror downward

  return {
    precedingRange: range,
    bullProjection: bullTarget,
    bearProjection: bearTarget,
    detail: side === "BUY"
      ? `Symmetry target: ${r5(currentPrice)} + ${r5(range)} = ${r5(bullTarget)} (mirror of preceding ${r5(range)} range)`
      : `Symmetry target: ${r5(currentPrice)} - ${r5(range)} = ${r5(bearTarget)}`,
    target: side === "BUY" ? bullTarget : side === "SELL" ? bearTarget : null,
  };
}

// ═══ ENTRY PHASE DETECTION ═══
function getEntryPhase(smr, side, reports) {
  if (!smr.detected) return { phase: "PRE-SMR", action: "WAIT", detail: "No SMR yet — wait for liquidity purge + displacement + break." };

  const r1h = reports["1H"];
  const currentPrice = r1h?.price || 0;

  // After SMR: is price retracing into a discount (buy) or premium (sell) array?
  const fvgs = r1h?.fvgs || [];
  const obs = r1h?.orderBlocks || [];
  const nearRetrace = side === "BUY"
    ? fvgs.filter(f => f.type === "bullish" && (f.fillFraction || 0) < 0.3 && f.top > currentPrice * 0.998)
    : fvgs.filter(f => f.type === "bearish" && (f.fillFraction || 0) < 0.3 && f.bottom < currentPrice * 1.002);

  const inRetrace = nearRetrace.length > 0;

  if (inRetrace) {
    return { phase: "RETRACEMENT", action: side, detail: `SMR confirmed. Price retracing into ${side === 'BUY' ? 'discount' : 'premium'} array — low-risk entry window.` };
  }

  return { phase: "EXPANSION", action: side, detail: `SMR confirmed. Price expanding toward ${side === 'BUY' ? 'buy-side' : 'sell-side'} liquidity — trail or wait for next retracement.` };
}

// ═══ MAIN ═══
function analyzeMMXM(pair) {
  const p = pair || PAIR;
  const reports = {};
  for (const tf of ["1D", "4H", "1H"]) reports[tf] = loadEngine(tf);

  const smr = detectSMR(reports);
  const side = getSideOfCurve(smr, reports);
  const symmetry = projectSymmetry(reports, side.side);
  const entry = getEntryPhase(smr, side.side, reports);

  return {
    pair: p,
    time: new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false }) + " NY",
    smr, side, symmetry, entry,
    detail: [smr.detail, side.detail, symmetry?.detail || "No symmetry projection", entry.detail].join("\n"),
  };
}

// ═══ OUTPUT ═══
const result = analyzeMMXM(PAIR);
const outDir = path.join(ROOT, "stages", "00_macro_context", "output");
fs.mkdirSync(outDir, { recursive: true });

let md = `# MMXM Analysis — ${result.pair} — ${DATE}\n\n`;
md += `## Smart Money Reversal\n**${result.smr.detected ? '✅ DETECTED' : '⏳ Not detected'}**\n${result.smr.detail}\n`;
if (result.smr.detected) {
  md += `- Purge: ${result.smr.purge}\n- Displacement: ${result.smr.displacement}\n- Break: ${result.smr.break}\n`;
}
md += `\n## Side of Curve: **${result.side.side}** (${result.side.confidence})\n${result.side.detail}\n`;
if (result.symmetry) md += `\n## Symmetry\n${result.symmetry.detail}\nTarget: ${result.symmetry.target ? r5(result.symmetry.target) : 'N/A'}\n`;
md += `\n## Entry Phase: **${result.entry.phase}**\n${result.entry.detail}\n`;

const outFile = path.join(outDir, `${PAIR.toLowerCase()}_mmxm.md`);
fs.writeFileSync(outFile, md, "utf8");

console.log(`\n═══ MMXM — ${PAIR} ═══`);
console.log(`  SMR: ${result.smr.detected ? '✅ ' + result.smr.type : '⏳ ' + result.smr.detail}`);
console.log(`  Side: ${result.side.side} (${result.side.confidence})`);
if (result.symmetry) console.log(`  Symmetry: ${result.symmetry.detail}`);
console.log(`  Entry: ${result.entry.phase} — ${result.entry.action}`);
console.log(`  ✓ ${outFile}`);

module.exports = { analyzeMMXM, detectSMR, getSideOfCurve, projectSymmetry, getEntryPhase };
