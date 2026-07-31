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

// ═══════════════════════════════════════════════════════════════════
// IPDA FALSE BREAKOUT DETECTION — 20-Day Extreme Stop Hunt
// ICT: "When price creates a new 20-day high/low, the IPDA typically
// takes liquidity there before reversing toward the 40/60-day level."
// ═══════════════════════════════════════════════════════════════════

function detectFalseBreakout(nested, reports) {
  const dailyRange = nested["1D"];
  if (!dailyRange) return null;

  const ipda20 = dailyRange.ranges["IPDA20"];
  const ipda40 = dailyRange.ranges["IPDA40"];
  const ipda60 = dailyRange.ranges["IPDA60"];
  if (!ipda20) return null;

  const currentPrice = parseFloat(ipda20.currentPrice || 0);
  const dHigh = parseFloat(ipda20.high);
  const dLow = parseFloat(ipda20.low);
  const r1h = reports["1H"];
  const r4h = reports["4H"];

  // Check if price recently broke the 20-day high or low
  const recentSweeps = (r1h?.liquidity || []).concat(r4h?.liquidity || []).filter(p => p.swept);
  const highSwept = recentSweeps.some(p => p.type === "BSL" && p.price >= dHigh * 0.998);
  const lowSwept = recentSweeps.some(p => p.type === "SSL" && p.price <= dLow * 1.002);

  // Was it a false breakout? Price breaks the extreme, then reverses back inside
  const brokeHigh = currentPrice > dHigh;
  const brokeLow = currentPrice < dLow;
  const backInsideHigh = highSwept && currentPrice < dHigh;
  const backInsideLow = lowSwept && currentPrice > dLow;

  // Target: if false breakout above → target 40/60-day LOW (bearish reversal)
  //         if false breakout below → target 40/60-day HIGH (bullish reversal)
  let falseBreakout = null;
  if (backInsideHigh) {
    const target40 = ipda40 ? parseFloat(ipda40.low) : null;
    const target60 = ipda60 ? parseFloat(ipda60.low) : null;
    falseBreakout = {
      detected: true,
      type: "BULL TRAP (20-day HIGH swept → reversal DOWN)",
      direction: "BEARISH",
      sweptLevel: dHigh,
      target40: target40, target60: target60,
      detail: `⚠️ FALSE BREAKOUT: 20-day high @ ${dHigh} swept, price reversed back inside. IPDA stop-hunt before bearish reversal. Target: 40-day low @ ${target40 || '?'} / 60-day low @ ${target60 || '?'}.`,
    };
  } else if (backInsideLow) {
    const target40 = ipda40 ? parseFloat(ipda40.high) : null;
    const target60 = ipda60 ? parseFloat(ipda60.high) : null;
    falseBreakout = {
      detected: true,
      type: "BEAR TRAP (20-day LOW swept → reversal UP)",
      direction: "BULLISH",
      sweptLevel: dLow,
      target40: target40, target60: target60,
      detail: `⚠️ FALSE BREAKOUT: 20-day low @ ${dLow} swept, price reversed back inside. IPDA stop-hunt before bullish reversal. Target: 40-day high @ ${target40 || '?'} / 60-day high @ ${target60 || '?'}.`,
    };
  } else if (brokeHigh || brokeLow) {
    falseBreakout = {
      detected: false,
      type: brokeHigh ? "Above 20-day high — monitoring for reversal" : "Below 20-day low — monitoring for reversal",
      detail: brokeHigh
        ? `Price above 20-day high @ ${dHigh}. If it reverses back below → false breakout confirmed.`
        : `Price below 20-day low @ ${dLow}. If it reverses back above → false breakout confirmed.`,
    };
  }

  return falseBreakout || { detected: false, detail: "Price within 20-day range — no false breakout." };
}

// ═══════════════════════════════════════════════════════════════════
// IPDA KILL ZONE ALIGNMENT
// ICT: IPDA reversals "typically print inside the London open, NY AM,
// or NY PM kill zones."
// ═══════════════════════════════════════════════════════════════════

function getKillZoneAlignment() {
  const utcHour = new Date().getUTCHours();
  const utcMin = new Date().getUTCMinutes();

  // Kill zone windows in UTC (EDT = UTC-4)
  const zones = {
    asia:       { start: 0, end: 2, label: "Asia", weight: 0.5 },
    londonKZ:   { start: 6, end: 10, label: "London KZ", weight: 1.2 },
    londonSB:   { start: 7, end: 8, label: "London SB", weight: 1.5 },
    nyAMKZ:     { start: 12, end: 15, label: "NY AM KZ", weight: 1.3 },
    nyAMSB:     { start: 14, end: 15, label: "NY AM SB", weight: 1.5 },
    nyLunch:    { start: 15, end: 17, label: "NY Lunch", weight: 0.4 },
    nyPM:       { start: 17, end: 20, label: "NY PM", weight: 1.0 },
    nyPMSB:     { start: 18, end: 19, label: "NY PM SB", weight: 1.2 },
  };

  let activeZone = null;
  for (const [key, z] of Object.entries(zones)) {
    const startMins = z.start * 60;
    const endMins = z.end * 60;
    const currentMins = utcHour * 60 + utcMin;
    if (currentMins >= startMins && currentMins < endMins) {
      activeZone = { id: key, ...z };
      break;
    }
  }

  if (!activeZone) return { inKillZone: false, detail: "Outside kill zone windows — IPDA reversal probability lower." };

  const isHighConviction = activeZone.weight >= 1.2;
  return {
    inKillZone: true,
    activeZone,
    isHighConviction,
    detail: isHighConviction
      ? `✅ ${activeZone.label} active (weight: ${activeZone.weight}) — HIGH conviction for IPDA reversals.`
      : `⏳ ${activeZone.label} active (weight: ${activeZone.weight}) — lower conviction. Prefer London KZ, NY AM KZ, or NY PM KZ.`,
  };
}

// ═══════════════════════════════════════════════════════════════════
// IPDA OBJECTIVE DETECTION — Rebalance vs Hunt
// ICT: The IPDA has exactly two objectives:
//   1. Balance an imbalance (fill FVGs)
//   2. Hunt liquidity (sweep BSL/SSL at extremes)
// ═══════════════════════════════════════════════════════════════════

function detectIPDAObjective(reports, nested) {
  const r4h = reports["4H"];
  const r1h = reports["1H"];
  if (!r4h) return { objective: "UNKNOWN", detail: "Insufficient data" };

  // Check for unfilled FVGs (imbalance to rebalance)
  const unfilledFvgs = (r4h.fvgs || []).concat(r1h?.fvgs || []).filter(f => (f.fillFraction || 0) < 0.3);
  const partiallyFilled = (r4h.fvgs || []).concat(r1h?.fvgs || []).filter(f => (f.fillFraction || 0) >= 0.3 && (f.fillFraction || 0) < 0.7);

  // Check for swept liquidity pools (hunt completed or in progress)
  const sweptPools = (r4h.liquidity || []).concat(r1h?.liquidity || []).filter(p => p.swept);
  const unsweptPools = (r4h.liquidity || []).concat(r1h?.liquidity || []).filter(p => !p.swept);

  // Determine primary objective
  let objective, detail;
  if (sweptPools.length > unsweptPools.length && unfilledFvgs.length > 0) {
    objective = "REBALANCE (post-hunt)";
    detail = `Liquidity swept (${sweptPools.length} pools). ${unfilledFvgs.length} unfilled FVGs remain — IPDA now rebalancing imbalances. Price drawing toward unfilled FVGs.`;
  } else if (unsweptPools.length > sweptPools.length && unsweptPools.length > 3) {
    objective = "HUNT LIQUIDITY";
    detail = `${unsweptPools.length} unswept pools vs ${sweptPools.length} swept. IPDA hunting liquidity — expect sweep of nearest BSL/SSL before rebalancing.`;
  } else if (unfilledFvgs.length > partiallyFilled.length) {
    objective = "REBALANCE";
    detail = `${unfilledFvgs.length} unfilled FVGs — IPDA rebalancing imbalances. Price will seek to fill these gaps.`;
  } else if (sweptPools.length > 0 && unfilledFvgs.length === 0) {
    objective = "POST-HUNT TRANSITION";
    detail = `All FVGs filled, ${sweptPools.length} pools swept. IPDA in transition — awaiting next objective.`;
  } else {
    objective = "EQUILIBRIUM";
    detail = "No clear dominant objective. IPDA balanced — wait for displacement to reveal next move.";
  }

  return { objective, unfilledFvgs: unfilledFvgs.length, sweptPools: sweptPools.length, unsweptPools: unsweptPools.length, detail };
}

// ═══════════════════════════════════════════════════════════════════
// WEEKLY IPDA REFERENCE LEVELS
// ICT: "Mark the three levels at the start of every week."
// ═══════════════════════════════════════════════════════════════════

function getWeeklyReferenceLevels(nested) {
  const dailyRange = nested["1D"];
  if (!dailyRange) return null;

  const ipda20 = dailyRange.ranges["IPDA20"];
  const ipda40 = dailyRange.ranges["IPDA40"];
  const ipda60 = dailyRange.ranges["IPDA60"];
  if (!ipda20) return null;

  return {
    twentyDay: { high: parseFloat(ipda20.high), low: parseFloat(ipda20.low), eq: parseFloat(ipda20.equilibrium) },
    fortyDay: ipda40 ? { high: parseFloat(ipda40.high), low: parseFloat(ipda40.low), eq: parseFloat(ipda40.equilibrium) } : null,
    sixtyDay: ipda60 ? { high: parseFloat(ipda60.high), low: parseFloat(ipda60.low), eq: parseFloat(ipda60.equilibrium) } : null,
    marked: new Date().toISOString().split("T")[0],
    detail: [
      `20-Day: H ${ipda20.high} L ${ipda20.low} EQ ${ipda20.equilibrium}`,
      ipda40 ? `40-Day: H ${ipda40.high} L ${ipda40.low} EQ ${ipda40.equilibrium}` : '',
      ipda60 ? `60-Day: H ${ipda60.high} L ${ipda60.low} EQ ${ipda60.equilibrium}` : '',
    ].filter(Boolean).join(" | "),
  };
}

// ═══ Compute new sections ═══
const falseBreakout = detectFalseBreakout(nested, { "1H": loadEngine("1h"), "4H": loadEngine("4h") });
const killZone = getKillZoneAlignment();
const ipdaObjective = detectIPDAObjective(
  { "4H": loadEngine("4h"), "1H": loadEngine("1h") },
  nested
);
const weeklyRefs = getWeeklyReferenceLevels(nested);

// Append to markdown
md += `\n## False Breakout Detection\n`;
md += `**${falseBreakout?.type || 'None'}**\n`;
md += `${falseBreakout?.detail || 'No false breakout detected.'}\n`;
if (falseBreakout?.detected) {
  md += `- Direction: ${falseBreakout.direction}\n`;
  md += `- Target: 40-day @ ${r5(falseBreakout.target40 || 0)} / 60-day @ ${r5(falseBreakout.target60 || 0)}\n`;
}

md += `\n## Kill Zone Alignment\n`;
md += `${killZone.detail}\n`;
if (killZone.inKillZone) {
  md += `- Active Zone: ${killZone.activeZone?.label} (weight: ${killZone.activeZone?.weight})\n`;
}

md += `\n## IPDA Objective: ${ipdaObjective.objective}\n`;
md += `${ipdaObjective.detail}\n`;
md += `- Unfilled FVGs: ${ipdaObjective.unfilledFvgs} | Swept Pools: ${ipdaObjective.sweptPools} | Unswept: ${ipdaObjective.unsweptPools}\n`;

md += `\n## Weekly Reference Levels (Marked ${weeklyRefs?.marked || 'today'})\n`;
md += `${weeklyRefs?.detail || 'N/A'}\n`;

fs.writeFileSync(path.join(outDir, `${PAIR.toLowerCase()}_ipda.md`), md, "utf8");

console.log(JSON.stringify({
  pair: pairLabel,
  nestedRanges: Object.keys(nested).length,
  equilibriumCascade: cascade.map(c => ({ tf: c.tf, eq: c.equilibrium, zone: c.zone })),
  draw: { direction: draw.drawDirection, consensus: draw.zoneConsensus, strength: draw.consensusStrength },
  amd: { position: amd.amdPosition, eq: amd.equilibrium },
  quarterly: { shift: quarterly.inShiftWindow },
  falseBreakout: falseBreakout?.detected ? { type: falseBreakout.type, direction: falseBreakout.direction, target40: falseBreakout.target40, target60: falseBreakout.target60 } : null,
  killZone: { inKillZone: killZone.inKillZone, active: killZone.activeZone?.label || null, highConviction: killZone.isHighConviction },
  objective: { primary: ipdaObjective.objective, unfilledFvgs: ipdaObjective.unfilledFvgs, sweptPools: ipdaObjective.sweptPools },
  weeklyRefs: weeklyRefs ? { twentyDay: weeklyRefs.twentyDay, fortyDay: weeklyRefs.fortyDay, sixtyDay: weeklyRefs.sixtyDay } : null,
}, null, 2));
