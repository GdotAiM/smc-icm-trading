// IPDA Engine — Interbank Price Delivery Algorithm
// Dealing Ranges, Nested Equilibrium, Premium/Discount, Cascading Draw
// "Price delivers from one equilibrium to another, hunting liquidity along the way."

const fs = require("fs");
const path = require("path");

const ROOT = "C:\\Users\\cash\\smc-icm-trading";
const DATE = new Date().toISOString().split("T")[0];

function r2(v) { return Number(v).toFixed(2); }
function r5(v) { return Number(v).toFixed(5); }

const PAIR = process.argv[2] || "GBPUSD";
const pairLabel = PAIR === "GOLD" ? "XAUUSD" : PAIR;
const sharedDir = path.join(ROOT, "shared", DATE, PAIR);

function loadRaw(tf) {
  try {
    const f = path.join(process.env.TEMP || "/tmp", `${PAIR}_${tf.toLowerCase()}.json`);
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8"));
    return null;
  } catch(e) { return null; }
}

function loadEngine(tf) {
  try { return JSON.parse(fs.readFileSync(path.join(sharedDir, `engine_${tf.toLowerCase()}.json`), "utf8")); }
  catch { return null; }
}

// ═══════════════════════════════════════════════════════════════════
// IPDA Dealing Range Calculator
// ICT: 20/40/60 period lookbacks, fractal across all timeframes.
// Each dealing range has: High, Low, Equilibrium (50%), Premium/Discount zones.
// ═══════════════════════════════════════════════════════════════════

function computeIPDARange(candles, label, lookbacks = [20, 40, 60]) {
  if (!candles || candles.length < 20) return null;

  const ranges = {};
  for (const lb of lookbacks) {
    if (candles.length < lb) continue;
    const window = candles.slice(-lb);
    const high = Math.max(...window.map(c => c.high));
    const low = Math.min(...window.map(c => c.low));
    const eq = (high + low) / 2;
    const currentPrice = candles[candles.length - 1].close;
    const zone = currentPrice >= eq ? "PREMIUM (sell)" : "DISCOUNT (buy)";
    const positionInRange = ((currentPrice - low) / (high - low)) * 100; // 0% = low, 100% = high
    const distanceToEQ = ((currentPrice - eq) / eq) * 100;

    ranges[`IPDA${lb}`] = {
      high: r5(high), low: r5(low), equilibrium: r5(eq),
      zone, positionPct: r2(positionInRange), distanceToEQ: r2(distanceToEQ),
      rangeSize: r5(high - low),
      narrative: `Price at ${r2(positionInRange)}% of ${label} ${lb}-period range. ${zone}. ${r2(Math.abs(distanceToEQ))}% from equilibrium.`,
    };
  }

  return { label, ranges };
}

// ═══════════════════════════════════════════════════════════════════
// Nested Dealing Range — All Timeframes
// ═══════════════════════════════════════════════════════════════════

function computeNestedRanges() {
  const tfs = [
    { tf: "1w", label: "1W", lookbacks: [20] },   // 20 weeks
    { tf: "1d", label: "1D", lookbacks: [20, 40, 60] },
    { tf: "4h", label: "4H", lookbacks: [20, 40] },
    { tf: "1h", label: "1H", lookbacks: [20, 40] },
    { tf: "15m", label: "15m", lookbacks: [20] },
  ];

  const nested = {};
  for (const { tf, label, lookbacks } of tfs) {
    const candles = loadRaw(tf) || loadRaw(tf.toUpperCase());
    if (candles) {
      const range = computeIPDARange(candles, label, lookbacks);
      if (range) nested[label] = range;
    }
  }
  return nested;
}

// ═══════════════════════════════════════════════════════════════════
// Equilibrium Cascade — All TFs' equilibrium levels as stepping stones
// ═══════════════════════════════════════════════════════════════════

function computeEquilibriumCascade(nested) {
  const cascade = [];
  const tfOrder = ["1W", "1D", "4H", "1H", "15m"];

  for (const tf of tfOrder) {
    const range = nested[tf];
    if (!range) continue;
    const ipda20 = range.ranges["IPDA20"] || range.ranges["IPDA40"] || range.ranges["IPDA60"];
    if (!ipda20) continue;
    cascade.push({
      tf,
      equilibrium: ipda20.equilibrium,
      zone: ipda20.zone,
      positionPct: ipda20.positionPct,
      distanceToEQ: ipda20.distanceToEQ,
    });
  }

  return cascade;
}

// ═══════════════════════════════════════════════════════════════════
// IPDA Draw Direction — Which way is price being delivered?
// ═══════════════════════════════════════════════════════════════════

function computeIPDADraw(nested, cascade) {
  if (cascade.length < 2) return { direction: "UNKNOWN", narrative: "Insufficient data" };

  const macro = cascade[0]; // 1W
  const meso = cascade[1] || cascade[0]; // 1D
  const micro = cascade[cascade.length - 1]; // 15m

  // Draw direction: is price being pulled toward the macro equilibrium or away from it?
  const macroZone = macro.zone;
  const microZone = micro.zone;

  // If macro is in premium and micro is in premium → drawing DOWN toward equilibrium
  // If macro is in discount and micro is in discount → drawing UP toward equilibrium
  // If macro and micro disagree → transition/conflict

  let drawDirection, drawNarrative;
  if (macroZone.includes("PREMIUM") && microZone.includes("PREMIUM")) {
    drawDirection = "DOWN (toward equilibrium)";
    drawNarrative = `Price is in PREMIUM across macro (${macro.tf}) and micro (${micro.tf}). IPDA is drawing price DOWN toward equilibrium. Sell-side delivery domain.`;
  } else if (macroZone.includes("DISCOUNT") && microZone.includes("DISCOUNT")) {
    drawDirection = "UP (toward equilibrium)";
    drawNarrative = `Price is in DISCOUNT across macro (${macro.tf}) and micro (${micro.tf}). IPDA is drawing price UP toward equilibrium. Buy-side delivery domain.`;
  } else if (macroZone.includes("PREMIUM") && microZone.includes("DISCOUNT")) {
    drawDirection = "TRANSITION (micro oversold within macro premium)";
    drawNarrative = `Macro (${macro.tf}) is in PREMIUM but micro (${micro.tf}) is in DISCOUNT. Micro may be oversold within the larger premium context. Watch for micro to revert to macro direction.`;
  } else if (macroZone.includes("DISCOUNT") && microZone.includes("PREMIUM")) {
    drawDirection = "TRANSITION (micro overbought within macro discount)";
    drawNarrative = `Macro (${macro.tf}) is in DISCOUNT but micro (${micro.tf}) is in PREMIUM. Micro may be overbought within the larger discount context.`;
  } else {
    drawDirection = "EQUILIBRIUM";
    drawNarrative = "Price near equilibrium — the algorithm is balanced. Wait for displacement.";
  }

  // Count how many TFs agree on zone
  const premiumTFs = cascade.filter(c => c.zone.includes("PREMIUM")).length;
  const discountTFs = cascade.filter(c => c.zone.includes("DISCOUNT")).length;
  const zoneConsensus = premiumTFs > discountTFs ? "PREMIUM" : discountTFs > premiumTFs ? "DISCOUNT" : "MIXED";
  const consensusStrength = Math.max(premiumTFs, discountTFs) / cascade.length;

  return {
    drawDirection,
    drawNarrative,
    zoneConsensus,
    consensusStrength: r2(consensusStrength),
    premiumTFs,
    discountTFs,
    totalTFs: cascade.length,
  };
}

// ═══════════════════════════════════════════════════════════════════
// AMD Cycle on the Dealing Range
// ═══════════════════════════════════════════════════════════════════

function mapAMDToRange(nested, macroPhase) {
  const d1Range = nested["1D"]?.ranges["IPDA40"] || nested["1D"]?.ranges["IPDA20"];
  if (!d1Range) return { narrative: "No daily range data" };

  const posPct = parseFloat(d1Range.positionPct);
  const eq = parseFloat(d1Range.equilibrium);

  // AMD mapping on the dealing range:
  // Accumulation: 0-40% of range (discount) or 60-100% (premium) — price consolidating near extremes
  // Manipulation: price crossing equilibrium — sweeping stops on the other side
  // Distribution: price expanding from equilibrium toward the opposite extreme

  let amdPosition;
  if (posPct <= 25 || posPct >= 75) {
    amdPosition = "ACCUMULATION ZONE — Price at range extreme. Institutions building positions.";
  } else if (posPct >= 40 && posPct <= 60) {
    amdPosition = "MANIPULATION ZONE — Price near equilibrium. Sweeps likely. The trap zone.";
  } else if ((posPct > 25 && posPct < 40) || (posPct > 60 && posPct < 75)) {
    amdPosition = "DISTRIBUTION ZONE — Price expanding from equilibrium toward extreme.";
  } else {
    amdPosition = "TRANSITION — between zones.";
  }

  return {
    amdPosition,
    equilibrium: d1Range.equilibrium,
    positionPct: d1Range.positionPct,
    zone: d1Range.zone,
    narrative: `Daily range: ${d1Range.zone} at ${d1Range.positionPct}% of range. ${amdPosition} EQ @ ${d1Range.equilibrium}.`,
  };
}

// ═══════════════════════════════════════════════════════════════════
// IPDA Quarterly Shift Detection
// ═══════════════════════════════════════════════════════════════════

function detectQuarterlyShift() {
  const month = new Date().getUTCMonth();
  const quarterMonth = month % 3;
  // ICT: Every 3-4 months, the market shifts from hunting external to internal liquidity
  const inShiftWindow = quarterMonth === 0; // First month of quarter = potential shift
  return {
    inShiftWindow,
    quarterMonth,
    narrative: inShiftWindow ?
      "⚠️ QUARTERLY SHIFT WINDOW — Month 1 of quarter. Market may transition from external→internal liquidity hunting." :
      `Quarter month ${quarterMonth + 1}. Standard IPDA behavior expected.`,
  };
}

// ── Run All ──────────────────────────────────────────────────────────────
const nested = computeNestedRanges();
const cascade = computeEquilibriumCascade(nested);
const draw = computeIPDADraw(nested, cascade);
const macroPhase = (loadEngine("4h")?.structure?.bias || "neutral").toUpperCase();
const amd = mapAMDToRange(nested, macroPhase);
const quarterly = detectQuarterlyShift();

// ── Output ────────────────────────────────────────────────────────────────
const outDir = path.join(ROOT, "stages", "00_macro_context", "output");
fs.mkdirSync(outDir, { recursive: true });

let md = `# IPDA Dealing Range Analysis — ${pairLabel} — ${DATE}

## Nested Dealing Ranges (Macro → Micro)

| Timeframe | IPDA20 EQ | IPDA40 EQ | IPDA60 EQ | Zone | Position |
|-----------|-----------|-----------|-----------|------|----------|
`;
for (const [tf, range] of Object.entries(nested)) {
  const r20 = range.ranges["IPDA20"];
  const r40 = range.ranges["IPDA40"];
  const r60 = range.ranges["IPDA60"];
  md += `| ${tf} | ${r20 ? r20.equilibrium : '—'} | ${r40 ? r40.equilibrium : '—'} | ${r60 ? r60.equilibrium : '—'} | ${r20 ? r20.zone : '—'} | ${r20 ? r20.positionPct + '%' : '—'} |\n`;
}

md += `
## Equilibrium Cascade (Stepping Stones)

Price delivers from one equilibrium to another. Each level acts as a checkpoint.

\`\`\`
${cascade.map(c => {
  const bar = "█".repeat(Math.min(10, Math.round(Math.abs(parseFloat(c.distanceToEQ)) * 5)));
  return `${c.tf.padEnd(4)} EQ ${c.equilibrium.padEnd(12)} ${c.zone.padEnd(18)} ${bar} ${c.positionPct}%`;
}).join("\n")}
\`\`\`

## IPDA Draw Direction

**${draw.drawDirection}**
${draw.drawNarrative}

**Zone Consensus**: ${draw.zoneConsensus} (${draw.premiumTFs}/${draw.totalTFs} premium, ${draw.discountTFs}/${draw.totalTFs} discount) — ${parseFloat(draw.consensusStrength) > 0.7 ? 'STRONG consensus' : parseFloat(draw.consensusStrength) > 0.5 ? 'MODERATE consensus' : 'WEAK consensus'}

## AMD on the Dealing Range

**${amd.amdPosition}**
${amd.narrative}

## Quarterly Shift

**${quarterly.narrative}**

## How the IPDA Lens Changes Your Trade

`;

// Generate the IPDA-specific trade insight
const cascade1W = cascade.find(c => c.tf === "1W");
const cascade1D = cascade.find(c => c.tf === "1D");
const cascade4H = cascade.find(c => c.tf === "4H");

if (cascade1W && cascade1D) {
  md += `- **Macro (1W)**: Price is ${cascade1W.zone} — ${cascade1W.zone.includes("PREMIUM") ? "institutional sell zone. Look for SHORTS only when LTF confirms." : "institutional buy zone. Look for LONGS only when LTF confirms."}\n`;
  md += `- **Meso (1D)**: Price is ${cascade1D.zone} at ${cascade1D.positionPct}% of range.\n`;
  if (cascade4H) {
    md += `- **Micro (4H)**: Price is ${cascade4H.zone}. ${cascade4H.zone === cascade1W.zone ? '✅ ALIGNED with macro — trade with confidence.' : '⚠️ DIVERGENT from macro — this is a counter-trend move within the larger range.'}\n`;
  }
}

md += `
- **Equilibrium Gravity**: The ${cascade[0]?.tf || '1W'} equilibrium at ${cascade[0]?.equilibrium || '?'} is the macro fair value. Price is ${cascade[0]?.distanceToEQ || '?'}% ${parseFloat(cascade[0]?.distanceToEQ || '0') > 0 ? 'above' : 'below'} it. The algorithm will seek to return to this level.

- **Cascading Delivery**: Price must pass through each equilibrium checkpoint: ${cascade.map(c => c.tf + ' @ ' + c.equilibrium).join(' → ')}. Each is a potential reaction zone.

---

*"The IPDA doesn't move randomly. It delivers price from one dealing range extreme to the other, hunting liquidity at every equilibrium checkpoint along the way."*
`;

fs.writeFileSync(path.join(outDir, `${PAIR.toLowerCase()}_ipda.md`), md, "utf8");

console.log(JSON.stringify({
  pair: pairLabel,
  nestedRanges: Object.keys(nested).length,
  equilibriumCascade: cascade.map(c => ({ tf: c.tf, eq: c.equilibrium, zone: c.zone })),
  draw: { direction: draw.drawDirection, consensus: draw.zoneConsensus, strength: draw.consensusStrength },
  amd: { position: amd.amdPosition, eq: amd.equilibrium },
  quarterly: { shift: quarterly.inShiftWindow },
}, null, 2));
