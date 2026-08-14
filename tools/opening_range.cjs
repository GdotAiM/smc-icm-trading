// ICT Opening Ranges — 5-Window 30-Minute Algorithmic Framework
// Audited against innercircletrader.net + Ed_tradess Aug 2, 2026
//
// Five 30-min windows (all NY local time):
//   MOR  (Midnight):     12:00–12:30 AM  — Day's foundation
//   LOR  (London):        1:30–2:00 AM   — First major expansion
//   NYKZ (NY Kill Zone):  7:00–7:30 AM   — Institutional pre-market
//   AMOR (AM Session):    9:30–10:00 AM   — Most important (indices/stocks)
//   PMOR (PM Session):    1:30–2:00 PM    — Afternoon reset / closing
//
// For each window: Mark High, Low, Midpoint (CE), Opening Price,
// 1st PFVG (3-condition: liquidity taken + displacement/MSS + FVG forms),
// SD projections, confirmation close through CE.
//
// Usage: node tools/opening_range.cjs PAIR

const fs = require("fs");
const path = require("path");
const ny = require("./ny_time.cjs");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..");
const DATE = require("./ny_time.cjs").getNYDate();
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

// ═══ NY TIME HELPERS ═══
function getNYHour() {
  return ny.getNYHour();
}
function getNYMin() { return ny.getNYMin(); }

// ═══ 5 OPENING RANGE DEFINITIONS ═══
const OR_DEFS = [
  { id: "MOR",  name: "Midnight Opening Range",      startH: 0,  startM: 0,  endH: 0,  endM: 30, session: "Asia",      role: "Day's foundation" },
  { id: "LOR",  name: "London Opening Range",         startH: 1,  startM: 30, endH: 2,  endM: 0,  session: "London",    role: "First major expansion" },
  { id: "NYKZ", name: "NY Kill Zone Opening Range",   startH: 7,  startM: 0,  endH: 7,  endM: 30, session: "NY AM",     role: "Institutional pre-market" },
  { id: "AMOR", name: "AM Session Opening Range",     startH: 9,  startM: 30, endH: 10, endM: 0,  session: "NY AM",     role: "Most important (indices)" },
  { id: "PMOR", name: "PM Session Opening Range",     startH: 13, startM: 30, endH: 14, endM: 0,  session: "NY PM",     role: "Afternoon reset / closing" },
];

// ═══ 1. MARK OPENING RANGE LEVELS ═══
function markOR(candles1m, startH, startM, endH, endM) {
  if (!candles1m || candles1m.length < 30) return null;

  const startMin = startH * 60 + startM;
  const endMin = endH * 60 + endM;

  const orCandles = candles1m.filter(c => {
    const mins = ny.getNYHourFor(c.time) * 60 + ny.getNYMinFor(c.time);
    return mins >= startMin && mins < endMin;
  });

  if (orCandles.length < 10) return null; // Need enough candles in the window

  const high = Math.max(...orCandles.map(c => c.high));
  const low = Math.min(...orCandles.map(c => c.low));
  const open = orCandles[0].open;
  const range = high - low;
  const midpoint = (high + low) / 2;

  return {
    high, low, open, range, midpoint,
    candleCount: orCandles.length,
    detail: `H ${r5(high)} | L ${r5(low)} | Open ${r5(open)} | Range ${r5(range)} | CE ${r5(midpoint)}`,
  };
}

// ═══ 2. SD PROJECTIONS FROM OR RANGE ═══
function computeSDProjections(orRange) {
  if (!orRange || orRange.range <= 0) return null;
  const mid = orRange.midpoint;
  const sd = orRange.range * 0.25; // Approximation: range/4 as base unit

  return {
    sd05_upper: mid + sd * 0.5,  sd05_lower: mid - sd * 0.5,
    sd10_upper: mid + sd * 1.0,  sd10_lower: mid - sd * 1.0,
    sd15_upper: mid + sd * 1.5,  sd15_lower: mid - sd * 1.5,
    sd20_upper: mid + sd * 2.0,  sd20_lower: mid - sd * 2.0,
    sd25_upper: mid + sd * 2.5,  sd25_lower: mid - sd * 2.5,
    detail: `±0.5: ${r5(mid + sd * 0.5)} | ±1.0: ${r5(mid + sd)} | ±1.5: ${r5(mid + sd * 1.5)} | ±2.0: ${r5(mid + sd * 2)} | ±2.5: ${r5(mid + sd * 2.5)}`,
  };
}

// ═══ 3. DETECT 3-CONDITION PFVG ═══
// ICT: (1) Liquidity taken first — BSL or SSL raid
//      (2) Clear displacement / MSS
//      (3) FVG forms from that displacing move
function detectPFVG(orRange, candles1m, reports) {
  if (!orRange || !candles1m || candles1m.length < 10) return null;

  const r1h = reports["1H"];
  const currentPrice = r1h?.price || candles1m[candles1m.length - 1].close;

  // Condition 1: Liquidity taken — swept above OR high or below OR low
  const sweptAbove = (r1h?.liquidity || []).filter(p => p.type === "BSL" && p.swept && p.price >= orRange.high * 0.998).length;
  const sweptBelow = (r1h?.liquidity || []).filter(p => p.type === "SSL" && p.swept && p.price <= orRange.low * 1.002).length;
  const liquidityTaken = sweptAbove > 0 || sweptBelow > 0;

  // Condition 2: Displacement / MSS
  const mssEvent = r1h?.structure?.lastEvent === "CHoCH" || r1h?.structure?.lastEvent === "BOS";
  const displacementStrong = (r1h?.volumeDisplacement?.atrRatio || 0) > 0.8;

  // Condition 3: FVG formed from displacement (unfilled, near the OR)
  const nearbyFVG = (r1h?.fvgs || []).find(f =>
    (f.fillFraction || 0) < 0.3 &&
    Math.abs(((f.top + f.bottom) / 2) - orRange.midpoint) / orRange.midpoint < 0.01
  );

  const valid = liquidityTaken && mssEvent && displacementStrong && !!nearbyFVG;

  return {
    valid,
    conditions: {
      liquidityTaken: { met: liquidityTaken, detail: sweptAbove > 0 ? `${sweptAbove} BSL swept above` : sweptBelow > 0 ? `${sweptBelow} SSL swept below` : "None" },
      displacement: { met: mssEvent && displacementStrong, detail: mssEvent ? `MSS: ${r1h.structure.lastEvent}, Disp: ${r2(r1h.volumeDisplacement?.atrRatio || 0)}x` : "No displacement" },
      fvgFormed: { met: !!nearbyFVG, detail: nearbyFVG ? `${nearbyFVG.type} FVG @ ${r5((nearbyFVG.top + nearbyFVG.bottom) / 2)}` : "No FVG" },
    },
    fvg: nearbyFVG || null,
    direction: sweptAbove > 0 ? "BEARISH (high swept → sell)" : sweptBelow > 0 ? "BULLISH (low swept → buy)" : null,
    detail: valid
      ? `✅ PFVG VALID: Liquidity ${liquidityTaken ? 'taken' : '?'} + MSS + FVG formed`
      : `⏳ PFVG incomplete: Liq:${liquidityTaken ? '✅' : '✗'} Disp:${(mssEvent && displacementStrong) ? '✅' : '✗'} FVG:${!!nearbyFVG ? '✅' : '✗'}`,
  };
}

// ═══ 4. CONFIRMATION CHECK ═══
// ICT: "Do not enter immediately on expansion. Wait for a decisive close
// through the OR Midpoint (CE) or a valid inversion of the 1st PFVG."
function checkConfirmation(orRange, pfvg, currentPrice, candles1m) {
  if (!orRange) return { confirmed: false, detail: "No OR data" };

  // Check close through CE
  const recentCloses = (candles1m || []).slice(-5).map(c => c.close);
  const aboveCE = recentCloses.filter(c => c > orRange.midpoint).length;
  const belowCE = recentCloses.filter(c => c < orRange.midpoint).length;
  const closedThroughCE = aboveCE >= 3 || belowCE >= 3; // 3 of last 5 closes on one side

  // Check PFVG inversion
  const pfvgInverted = pfvg?.valid && pfvg.fvg &&
    ((pfvg.fvg.type === "bullish" && currentPrice < pfvg.fvg.bottom) ||  // Bullish FVG flipped bearish
     (pfvg.fvg.type === "bearish" && currentPrice > pfvg.fvg.top));      // Bearish FVG flipped bullish

  const confirmed = closedThroughCE || pfvgInverted;
  const method = pfvgInverted ? "PFVG inversion" : closedThroughCE ? "Close through CE" : null;

  return {
    confirmed,
    closedThroughCE,
    pfvgInverted,
    method,
    detail: confirmed
      ? `✅ CONFIRMED: ${method} — entry allowed on retrace into inefficiency`
      : `⏳ AWAITING: ${closedThroughCE ? '' : 'close through CE, '}${pfvgInverted ? '' : 'PFVG inversion'}`,
  };
}

// ═══ 5. ANALYZE ALL 5 OPENING RANGES ═══
function analyzeOpeningRanges(pair) {
  const p = pair || PAIR;
  const candles1m = loadCandles("1m");
  const reports = { "1H": loadEngine("1h"), "4H": loadEngine("4h") };
  const currentPrice = reports["1H"]?.price || 0;

  if (!candles1m) return { ranges: [], detail: "No 1m candle data" };

  const results = [];
  const nyH = getNYHour(), nyM = getNYMin();
  const nyMins = nyH * 60 + nyM;

  for (const def of OR_DEFS) {
    const range = markOR(candles1m, def.startH, def.startM, def.endH, def.endM);
    const sd = computeSDProjections(range);
    const pfvg = detectPFVG(range, candles1m, reports);
    const confirmation = checkConfirmation(range, pfvg, currentPrice, candles1m);

    // Is this window active right now?
    const windowStart = def.startH * 60 + def.startM;
    const windowEnd = def.endH * 60 + def.endM;
    const isActive = nyMins >= windowStart && nyMins < windowEnd;
    const hasPassed = nyMins >= windowEnd;

    results.push({
      id: def.id,
      name: def.name,
      time: `${String(def.startH).padStart(2, '0')}:${String(def.startM).padStart(2, '0')}–${String(def.endH).padStart(2, '0')}:${String(def.endM).padStart(2, '0')} NY`,
      session: def.session,
      role: def.role,
      isActive,
      hasPassed,
      range,
      sd,
      pfvg,
      confirmation,
      tradeable: pfvg?.valid && confirmation.confirmed,
      detail: range
        ? `${range.detail} | PFVG: ${pfvg?.detail || 'N/A'} | Confirm: ${confirmation.detail}`
        : "No candle data for this window",
    });
  }

  // Find the most relevant OR for right now
  const activeOR = results.find(r => r.isActive);
  const lastPassed = [...results].reverse().find(r => r.hasPassed && r.range);

  return {
    pair: p,
    time: new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false }) + " NY",
    currentPrice,
    ranges: results,
    activeOR: activeOR || null,
    lastPassed: lastPassed || null,
    tradeableCount: results.filter(r => r.tradeable).length,
    detail: activeOR
      ? `Active: ${activeOR.name} (${activeOR.time}) — ${activeOR.tradeable ? '✅ TRADEABLE' : '⏳ awaiting confirmation'}`
      : lastPassed
        ? `Between windows. Last: ${lastPassed.name} — ${lastPassed.tradeable ? '✅ Setup valid' : '⏳ No valid setup'}. Next: ${results.find(r => !r.hasPassed)?.name || 'PMOR'}`
        : "No recent OR data",
  };
}

// ═══ OUTPUT ═══
const result = analyzeOpeningRanges(PAIR);

const outDir = path.join(ROOT, "stages", "03_session_time", "output");
fs.mkdirSync(outDir, { recursive: true });

let md = `# Opening Range Analysis — ${result.pair} — ${DATE}\n\n`;
md += `## Current: ${result.time} | Price: ${r5(result.currentPrice)}\n\n`;
md += `## ${result.detail}\n\n`;

md += `## All 5 Opening Ranges\n`;
md += `| Window | Time (NY) | Range | PFVG | Confirmation | Status |\n`;
md += `|--------|-----------|-------|------|-------------|--------|\n`;
for (const r of result.ranges) {
  const status = r.isActive ? '⚡ ACTIVE' : r.hasPassed ? '✓ Passed' : '⏳ Ahead';
  const rangeStr = r.range ? `${r5(r.range.low)}–${r5(r.range.high)}` : '—';
  const pfvgStr = r.pfvg?.valid ? '✅' : r.pfvg ? '⏳' : '—';
  const confStr = r.confirmation?.confirmed ? '✅' : '⏳';
  md += `| ${r.name} | ${r.time} | ${rangeStr} | ${pfvgStr} | ${confStr} | ${status} |\n`;
}

// Detail for each valid OR
for (const r of result.ranges) {
  if (!r.range) continue;
  md += `\n### ${r.name} (${r.time})\n`;
  md += `- Range: ${r.range.detail}\n`;
  if (r.sd) md += `- SD Projections: ${r.sd.detail}\n`;
  if (r.pfvg) {
    md += `- PFVG: ${r.pfvg.detail}\n`;
    if (r.pfvg.valid) {
      md += `  - Liquidity: ${r.pfvg.conditions.liquidityTaken.detail}\n`;
      md += `  - Displacement: ${r.pfvg.conditions.displacement.detail}\n`;
      md += `  - FVG: ${r.pfvg.conditions.fvgFormed.detail}\n`;
    }
  }
  md += `- Confirmation: ${r.confirmation.detail}\n`;
  md += `- Tradeable: ${r.tradeable ? '✅ YES' : '⏳ No'}\n`;
}

const outFile = path.join(outDir, `${PAIR.toLowerCase()}_opening_range.md`);
fs.writeFileSync(outFile, md, "utf8");

// Console
console.log(`\n═══ OPENING RANGES — ${PAIR} — ${result.time} ═══`);
console.log(`  ${result.detail}`);
for (const r of result.ranges) {
  if (!r.range) continue;
  const icon = r.isActive ? '⚡' : r.tradeable ? '✅' : r.hasPassed ? '  ' : '⏳';
  console.log(`  ${icon} ${r.name.padEnd(30)} ${r.time} | ${r.tradeable ? 'TRADEABLE' : r.pfvg?.valid ? 'PFVG valid, awaiting confirm' : r.range ? 'Range marked' : 'No data'}`);
}
console.log(`  ✓ Output → ${outFile}`);

module.exports = { analyzeOpeningRanges, markOR, detectPFVG, checkConfirmation, computeSDProjections };
