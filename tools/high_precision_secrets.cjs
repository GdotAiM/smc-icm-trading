// ICT High Precision Secrets — Parts 1 & 2
// Audited against ICT lectures Jul 31-Aug 1, 2026 + Ed_tradess Aug 2, 2026
//
// Part 1: 7:00-9:00 AM Pre-Session Time-Based Range
//   - 2-hour finite data-collection window
//   - Exact grading: CE, quadrants, 4 octants, -0.5 projection
//   - Tethering: PD arrays after 9:00 must reference graded levels (weight boost)
//   - Body vs wick: bodies confirm delivery, wicks probe (confidence adjustment)
//
// Part 2: Opening Range Gap + First-Hour Dealing Range
//   - ORG: 9:30 open vs prior RTH settlement (4:14 PM ET)
//   - First-hour range: 9:30-10:30
//   - Inversion FVG: gap revisited under opposite bias
//   - Breakaway gap: gap above CE after consolidation, not revisited
//   - Projections: -0.5 / -1 multiples of ORG when filled
//
// Usage: node tools/high_precision_secrets.cjs PAIR

const fs = require("fs");
const path = require("path");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..");
const DATE = new Date().toISOString().split("T")[0];
const PAIR = process.argv[2] || "GBPUSD";

function r5(v) { return Number(v).toFixed(5); }
function r2(v) { return Number(v).toFixed(2); }

function loadCandles(tf) {
  try {
    const dir = PAIR === "XAUUSD" ? "GOLD" : PAIR;
    return JSON.parse(fs.readFileSync(path.join(ROOT, "shared", DATE, dir, `candles_${tf}.json`), "utf8"));
  } catch { return null; }
}

function loadEngine(tf) {
  try {
    const dir = PAIR === "XAUUSD" ? "GOLD" : PAIR;
    return JSON.parse(fs.readFileSync(path.join(ROOT, "shared", DATE, dir, `engine_${tf}.json`), "utf8"));
  } catch { return null; }
}

// ═══ NY TIME ═══
function getNYHour(ts) {
  return parseInt(new Date(ts).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false, hour: "2-digit" }));
}
function getNYMin(ts) {
  return new Date(ts).getMinutes();
}

// ═══ PART 1: 7:00-9:00 AM PRE-SESSION RANGE ═══
function markPreSessionRange(candles1m) {
  if (!candles1m || candles1m.length < 60) return null;

  const rangeCandles = candles1m.filter(c => {
    const h = getNYHour(c.time), m = getNYMin(c.time);
    return (h === 7 || h === 8); // 7:00-8:59 AM
  });

  if (rangeCandles.length < 30) return null;

  const high = Math.max(...rangeCandles.map(c => c.high));
  const low = Math.min(...rangeCandles.map(c => c.low));
  const range = high - low;
  if (range <= 0) return null;

  const ce = (high + low) / 2;
  const quadrants = {
    lower: low + range * 0.25,
    mid: ce,
    upper: low + range * 0.75,
  };
  const octants = [];
  for (let i = 1; i <= 7; i++) octants.push(low + range * (i / 8));
  const projNeg05 = high + range * 0.5;  // -0.5 projection (above high for bullish objective)
  const projNeg05Low = low - range * 0.5; // -0.5 below low (bearish objective)

  return {
    high, low, range, ce, quadrants, octants,
    projNeg05, projNeg05Low,
    candleCount: rangeCandles.length,
    detail: `7-9AM Range: ${r5(low)}–${r5(high)} (${r5(range)}) | CE ${r5(ce)} | -0.5 Proj: ${r5(projNeg05)} above / ${r5(projNeg05Low)} below`,
  };
}

// ═══ TETHERING CHECK (weight boost, not gate) ═══
function checkTethering(fvgs, obs, gradedLevels) {
  if (!gradedLevels || !fvgs) return { tetheredCount: 0, boost: 1.0, detail: "No graded levels" };

  const allGraded = [
    { price: gradedLevels.ce, label: "CE (50%)" },
    { price: gradedLevels.quadrants.lower, label: "Lower Quadrant" },
    { price: gradedLevels.quadrants.upper, label: "Upper Quadrant" },
    ...gradedLevels.octants.map((p, i) => ({ price: p, label: `Octant ${i + 1}/8` })),
  ];

  let tethered = 0;
  for (const fvg of (fvgs || []).slice(0, 10)) {
    const m = (fvg.top + fvg.bottom) / 2;
    if (allGraded.some(l => Math.abs(m - l.price) / l.price < 0.002)) tethered++;
  }
  for (const ob of (obs || []).slice(0, 10)) {
    const m = (ob.proximal + ob.distal) / 2;
    if (allGraded.some(l => Math.abs(m - l.price) / l.price < 0.002)) tethered++;
  }

  // More tethered PD arrays = higher confidence (weight boost, not gate)
  const boost = tethered >= 3 ? 1.3 : tethered >= 1 ? 1.1 : 0.9; // Untethered = slight penalty

  return {
    tetheredCount: tethered,
    boost: r2(boost),
    detail: tethered >= 3 ? `✅ ${tethered} PD arrays tethered — ×${boost} confidence` :
             tethered >= 1 ? `⚠️ Only ${tethered} tethered — ×${boost}` :
             `⏳ No tethered PD arrays — ×${boost} (untethered arrays carry less weight)`,
  };
}

// ═══ BODY vs WICK CONFIRMATION (confidence adjustment) ═══
function bodyVsWickConfidence(candles1m, currentPrice) {
  if (!candles1m || candles1m.length < 10) return { adjustment: 0, detail: "No data" };

  const recent = candles1m.slice(-10);
  let wickProbes = 0, bodyConfirms = 0;

  for (const c of recent) {
    const body = Math.abs(c.close - c.open);
    const totalRange = c.high - c.low;
    if (totalRange === 0) continue;
    const wickRatio = 1 - (body / totalRange);

    if (wickRatio > 0.7) wickProbes++;        // Long wick = probing
    if (wickRatio < 0.4) bodyConfirms++;       // Small wick = body confirming
  }

  // Bodies confirming delivery = +confidence. Wicks probing = -confidence.
  const netSignal = bodyConfirms - wickProbes;
  const adjustment = netSignal >= 3 ? 10 : netSignal >= 1 ? 5 : netSignal >= -2 ? 0 : -5;

  return {
    bodyConfirms, wickProbes, netSignal, adjustment,
    detail: adjustment > 0 ? `✅ Bodies confirming (${bodyConfirms}B/${wickProbes}W) — +${adjustment} confidence` :
             adjustment < 0 ? `⚠️ Wicks probing (${wickProbes}W/${bodyConfirms}B) — ${adjustment} confidence` :
             `Bodies/Wicks balanced (${bodyConfirms}B/${wickProbes}W) — neutral`,
  };
}

// ═══ PART 2: OPENING RANGE GAP (9:30 open vs prior RTH settlement) ═══
function defineORG(dailyCandles, currentPrice) {
  if (!dailyCandles || dailyCandles.length < 2) return null;

  const today = dailyCandles[dailyCandles.length - 1];
  const yesterday = dailyCandles[dailyCandles.length - 2];

  // ORG: 9:30 ET open = today's open. Prior RTH settlement ≈ yesterday's close.
  const orgHigh = Math.max(today.open, yesterday.close);
  const orgLow = Math.min(today.open, yesterday.close);
  const orgRange = orgHigh - orgLow;
  if (orgRange <= 0) return null;

  const ce = (orgHigh + orgLow) / 2;
  const quadrants = {
    lower: orgLow + orgRange * 0.25,
    mid: ce,
    upper: orgLow + orgRange * 0.75,
  };
  const octants = [];
  for (let i = 1; i <= 7; i++) octants.push(orgLow + orgRange * (i / 8));

  const filled = currentPrice <= orgLow || currentPrice >= orgHigh;
  const projNeg05 = orgLow - orgRange * 0.5;   // -0.5 below gap
  const projNeg1 = orgLow - orgRange;           // -1 below gap

  return {
    high: orgHigh, low: orgLow, range: orgRange, ce, quadrants, octants,
    filled,
    projNeg05, projNeg1,
    detail: `ORG: ${r5(orgLow)}–${r5(orgHigh)} (${r5(orgRange)}) | CE ${r5(ce)} | ${filled ? 'FILLED' : 'OPEN'} | Proj: -0.5 @ ${r5(projNeg05)}`,
  };
}

// ═══ INVERSION vs BREAKAWAY GAP DETECTION ═══
function classifyGapType(fvgs, org, currentPrice, dailyBias) {
  if (!fvgs || !org) return [];

  const results = [];
  for (const fvg of fvgs.slice(0, 10)) {
    const mid = (fvg.top + fvg.bottom) / 2;
    const nearCE = Math.abs(mid - org.ce) / org.ce < 0.003;
    if (!nearCE) continue;

    // First utilisation: gap filled on first approach
    const firstFill = (fvg.fillFraction || 0) < 0.3;
    // Inversion: gap revisited under opposite bias after initial fill
    const inverted = !firstFill && ((fvg.type === "bullish" && dailyBias === "bearish") || (fvg.type === "bearish" && dailyBias === "bullish"));
    // Breakaway: gap formed above/below CE after consolidation, not revisited
    const breakaway = firstFill && Math.abs(mid - org.ce) / org.ce > 0.001;

    let gapType = "Standard FVG";
    if (inverted) gapType = "INVERSION FVG (gap revisited under opposite bias)";
    else if (breakaway) gapType = "BREAKAWAY GAP (above/below CE, not revisited)";
    else if (firstFill) gapType = "First Utilisation FVG";

    results.push({ fvg, gapType, mid, detail: `${gapType} @ ${r5(mid)}` });
  }

  return results;
}

// ═══ MAIN ═══
function analyzeHighPrecision(pair) {
  const p = pair || PAIR;
  const candles1m = loadCandles("1m");
  const dailyCandles = loadCandles("1d");
  const reports = { "1H": loadEngine("1h"), "5m": loadEngine("5m") };
  const currentPrice = reports["1H"]?.price || 0;
  const dailyBias = loadEngine("1d")?.structure?.bias || "neutral";

  // Part 1: Pre-session range
  const preSession = markPreSessionRange(candles1m);

  // Part 1: Tethering
  const fvgs = (reports["5m"]?.fvgs || []).concat(reports["1H"]?.fvgs || []);
  const obs = (reports["5m"]?.orderBlocks || []).concat(reports["1H"]?.orderBlocks || []);
  const tethering = checkTethering(fvgs, obs, preSession);

  // Part 1: Body vs wick
  const bodyWick = bodyVsWickConfidence(candles1m, currentPrice);

  // Part 2: ORG
  const org = defineORG(dailyCandles, currentPrice);

  // Part 2: Gap classification
  const gapTypes = classifyGapType(fvgs, org, currentPrice, dailyBias);

  // Composite confidence adjustment
  const tetherAdj = (parseFloat(tethering.boost) - 1) * 100; // Convert to percentage points
  const totalAdj = Math.round(tetherAdj + bodyWick.adjustment);

  return {
    pair: p,
    time: new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false }) + " NY",
    currentPrice, dailyBias,
    preSession,
    tethering,
    bodyWick,
    org,
    gapTypes,
    confidenceAdjustment: totalAdj,
    detail: [
      preSession?.detail || "7-9AM range not yet formed",
      `Tethering: ${tethering.detail}`,
      `Body/Wick: ${bodyWick.detail}`,
      org?.detail || "ORG not yet defined",
      gapTypes.length > 0 ? `${gapTypes.length} gap(s) classified: ${gapTypes.map(g => g.gapType).join(', ')}` : "No classified gaps",
      `Composite Confidence: ${totalAdj >= 0 ? '+' : ''}${totalAdj} pts`,
    ].join("\n"),
  };
}

// ═══ OUTPUT ═══
const result = analyzeHighPrecision(PAIR);

const outDir = path.join(ROOT, "stages", "00_macro_context", "output");
fs.mkdirSync(outDir, { recursive: true });

let md = `# High Precision Secrets — ${result.pair} — ${DATE}\n\n`;
md += `## Current: ${result.time} | Price: ${r5(result.currentPrice)} | Bias: ${result.dailyBias.toUpperCase()}\n\n`;

if (result.preSession) {
  md += `## Part 1: 7:00-9:00 AM Pre-Session Range\n${result.preSession.detail}\n`;
  md += `- -0.5 Projection (daily high obj): ${r5(result.preSession.projNeg05)}\n`;
  md += `- -0.5 Projection (daily low obj): ${r5(result.preSession.projNeg05Low)}\n\n`;
} else {
  md += `## Part 1: 7:00-9:00 AM Range — not yet formed (before 9:00 AM?)\n\n`;
}

md += `## Tethering\n${result.tethering.detail}\n\n`;
md += `## Body vs Wick\n${result.bodyWick.detail}\n\n`;

if (result.org) {
  md += `## Part 2: Opening Range Gap\n${result.org.detail}\n`;
  md += `- Filled: ${result.org.filled ? 'Yes' : 'No'}\n`;
  md += `- -0.5 Projection: ${r5(result.org.projNeg05)} | -1.0: ${r5(result.org.projNeg1)}\n\n`;
}

if (result.gapTypes.length > 0) {
  md += `## Gap Classification\n`;
  for (const g of result.gapTypes) md += `- ${g.detail}\n`;
}

md += `\n## Composite Confidence: ${result.confidenceAdjustment >= 0 ? '+' : ''}${result.confidenceAdjustment} pts\n`;

const outFile = path.join(outDir, `${PAIR.toLowerCase()}_high_precision.md`);
fs.writeFileSync(outFile, md, "utf8");

console.log(`\n═══ HIGH PRECISION — ${PAIR} ═══`);
console.log(`  Pre-Session: ${result.preSession?.detail || 'Not yet formed'}`);
console.log(`  Tethering: ${result.tethering.detail}`);
console.log(`  Body/Wick: ${result.bodyWick.detail}`);
console.log(`  ORG: ${result.org?.detail || 'Not defined'}`);
if (result.gapTypes.length > 0) result.gapTypes.forEach(g => console.log(`  Gap: ${g.detail}`));
console.log(`  Confidence: ${result.confidenceAdjustment >= 0 ? '+' : ''}${result.confidenceAdjustment} pts`);
console.log(`  ✓ Output → ${outFile}`);

module.exports = { analyzeHighPrecision, markPreSessionRange, checkTethering, bodyVsWickConfidence, defineORG, classifyGapType };
