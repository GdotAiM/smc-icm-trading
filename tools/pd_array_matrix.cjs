// ICT PD Array Matrix — 20-Day Look-Back + Quadrant Grading + Nested Arrays
// Audited against ICT PD Array Matrix Revealed (Oct 2025) + Aug 2026
//
// Core: 20-day look-back range graded into quadrants (0/25/50/75/100%).
// Every PD array inside that range is ranked by quadrant location and confluence.
// Nested grading: the range itself is graded, and individual arrays within are
// also graded into their own quadrants for precision entry/target levels.
//
// Usage: node tools/pd_array_matrix.cjs PAIR

const fs = require("fs");
const path = require("path");

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

// ═══ 20-DAY LOOK-BACK RANGE ═══
function compute20DayRange(dailyCandles) {
  if (!dailyCandles || dailyCandles.length < 20) return null;
  const window = dailyCandles.slice(-20);
  const high = Math.max(...window.map(c => c.high));
  const low = Math.min(...window.map(c => c.low));
  const range = high - low;
  if (range <= 0) return null;

  const eq = (high + low) / 2;
  const q25 = low + range * 0.25;
  const q75 = low + range * 0.75;

  return {
    high, low, range, eq,
    quadrants: {
      lower:  { low, high: q25, label: "LOWER (0-25%) — Discount" },
      midLow: { low: q25, high: eq, label: "MID-LOW (25-50%)" },
      midHi:  { low: eq, high: q75, label: "MID-HIGH (50-75%)" },
      upper:  { low: q75, high, label: "UPPER (75-100%) — Premium" },
    },
    detail: `20-Day Range: ${r5(low)}–${r5(high)} (${r5(range)}) | EQ ${r5(eq)} | Q25 ${r5(q25)} | Q75 ${r5(q75)}`,
  };
}

// ═══ QUADRANT LOCATION ═══
function getQuadrant(price, range20) {
  if (!range20) return "UNKNOWN";
  if (price <= range20.quadrants.lower.high) return "LOWER (Discount)";
  if (price <= range20.eq) return "MID-LOW";
  if (price <= range20.quadrants.upper.low) return "MID-HIGH";
  return "UPPER (Premium)";
}

// ═══ CATALOGUE PD ARRAYS IN 20-DAY RANGE ═══
function catalogueArrays(range20, reports) {
  if (!range20) return [];

  const arrays = [];
  const add = (item) => { if (item.price >= range20.low && item.price <= range20.high) arrays.push(item); };

  // FVGs
  for (const tf of ["1D", "4H", "1H"]) {
    for (const fvg of (reports[tf]?.fvgs || [])) {
      if ((fvg.fillFraction || 0) >= 0.5) continue;
      const mid = (fvg.top + fvg.bottom) / 2;
      const quad = getQuadrant(mid, range20);
      add({ type: "FVG", sub: fvg.type, price: mid, tf, quadrant: quad, fill: r2((fvg.fillFraction || 0) * 100) });
    }
  }

  // Order Blocks
  for (const tf of ["1D", "4H", "1H"]) {
    for (const ob of (reports[tf]?.orderBlocks || [])) {
      const mid = (ob.proximal + ob.distal) / 2;
      add({ type: "OB", sub: ob.type, price: mid, tf, quadrant: getQuadrant(mid, range20), kind: ob.kind || "OB" });
    }
  }

  // Liquidity pools (unswept)
  for (const tf of ["1D", "4H", "1H"]) {
    for (const pool of (reports[tf]?.liquidity || [])) {
      if (pool.swept) continue;
      add({ type: "LIQUIDITY", sub: pool.type, price: pool.price, tf, quadrant: getQuadrant(pool.price, range20) });
    }
  }

  return arrays;
}

// ═══ CONFLUENCE SCORING ═══
function scoreConfluence(arrays, range20) {
  const quadrants = ["LOWER (Discount)", "MID-LOW", "MID-HIGH", "UPPER (Premium)"];
  const result = [];

  for (const quad of quadrants) {
    const inQuad = arrays.filter(a => a.quadrant === quad);
    // Count stacked arrays (same price ±0.2%)
    let stacks = 0;
    const seen = new Set();
    for (let i = 0; i < inQuad.length; i++) {
      if (seen.has(i)) continue;
      let cluster = 1;
      for (let j = i + 1; j < inQuad.length; j++) {
        if (Math.abs(inQuad[i].price - inQuad[j].price) / inQuad[i].price < 0.002) {
          cluster++;
          seen.add(j);
        }
      }
      if (cluster >= 2) stacks++;
      seen.add(i);
    }

    result.push({
      quadrant: quad,
      arrayCount: inQuad.length,
      stacks,
      confluence: inQuad.length >= 3 && stacks >= 1 ? "HIGH" : inQuad.length >= 1 ? "MODERATE" : "LOW",
      detail: `${quad}: ${inQuad.length} arrays, ${stacks} stacked clusters — ${inQuad.length >= 3 && stacks >= 1 ? 'HIGH confluence' : 'moderate'}`,
    });
  }

  return result;
}

// ═══ DXY RISK CONTEXT ═══
function getDXYContext() {
  try {
    const dxyEngine = JSON.parse(fs.readFileSync(path.join(ROOT, "shared", DATE, "DXY", "engine_1d.json"), "utf8"));
    const bias = dxyEngine?.structure?.bias || "neutral";
    const riskState = bias === "bullish" ? "RISK-OFF (DXY rallying → favor shorts in indices)" :
                       bias === "bearish" ? "RISK-ON (DXY declining → favor longs in indices)" : "NEUTRAL";
    return { bias, riskState, detail: `DXY: ${bias.toUpperCase()} → ${riskState}` };
  } catch { return { bias: "unknown", riskState: "UNKNOWN", detail: "DXY data unavailable" }; }
}

// ═══ MAIN ═══
function analyzePDAMatrix(pair) {
  const p = pair || PAIR;
  const dailyCandles = loadCandles("1d");
  const reports = {};
  for (const tf of ["1D", "4H", "1H"]) reports[tf] = loadEngine(tf);

  const currentPrice = reports["1H"]?.price || reports["1D"]?.price || 0;

  const range20 = compute20DayRange(dailyCandles);
  const arrays = catalogueArrays(range20, reports);
  const confluence = scoreConfluence(arrays, range20);
  const dxy = getDXYContext();
  const currentQuad = getQuadrant(currentPrice, range20);

  // Find highest-confluence quadrant for bias direction
  const bias = reports["1D"]?.structure?.bias || "neutral";
  const targetQuad = bias === "bullish" ? "LOWER (Discount)" : bias === "bearish" ? "UPPER (Premium)" : null;
  const targetConfluence = confluence.find(c => c.quadrant === targetQuad);

  return {
    pair: p, currentPrice, currentQuadrant: currentQuad, bias,
    range20, arrayCount: arrays.length, confluence, dxy,
    targetQuadrant: targetQuad,
    targetConfluence: targetConfluence?.confluence || "NONE",
    detail: [
      range20?.detail || "No 20-day data",
      `${arrays.length} PD arrays catalogued in 20-day range`,
      `Current: ${currentQuad} | Bias: ${bias.toUpperCase()} → target ${targetQuad || 'N/A'} (${targetConfluence?.confluence || 'N/A'} confluence)`,
      dxy.detail,
    ].join("\n"),
  };
}

// ═══ OUTPUT ═══
const result = analyzePDAMatrix(PAIR);
const outDir = path.join(ROOT, "stages", "00_macro_context", "output");
fs.mkdirSync(outDir, { recursive: true });

let md = `# PD Array Matrix — ${result.pair} — ${DATE}\n\n`;
md += `## 20-Day Look-Back Range\n${result.range20?.detail || 'N/A'}\n`;
md += `## Current: ${result.currentQuadrant} | Bias: ${result.bias.toUpperCase()}\n`;
md += `## DXY: ${result.dxy.detail}\n\n`;

md += `## Quadrant Confluence\n`;
md += `| Quadrant | Arrays | Stacks | Confluence |\n`;
md += `|----------|--------|--------|------------|\n`;
for (const c of result.confluence) {
  md += `| ${c.quadrant} | ${c.arrayCount} | ${c.stacks} | **${c.confluence}** |\n`;
}
md += `\n**Target**: ${result.targetQuadrant || 'N/A'} — ${result.targetConfluence} confluence\n`;

const outFile = path.join(outDir, `${PAIR.toLowerCase()}_pda_matrix.md`);
fs.writeFileSync(outFile, md, "utf8");

console.log(`\n═══ PD ARRAY MATRIX — ${PAIR} ═══`);
console.log(`  ${result.range20?.detail || 'N/A'}`);
console.log(`  Current: ${result.currentQuadrant} | ${result.arrayCount} arrays | ${result.dxy.detail}`);
for (const c of result.confluence) console.log(`  ${c.detail}`);
console.log(`  Target: ${result.targetQuadrant} — ${result.targetConfluence} confluence`);
console.log(`  ✓ ${outFile}`);

module.exports = { analyzePDAMatrix, compute20DayRange, catalogueArrays, scoreConfluence, getQuadrant, getDXYContext };
