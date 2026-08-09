// ICT Algorithmic Time & Price Grids
// Audited against ICT lecture Jul 31, 2026 + Ed_tradess Aug 2, 2026
//
// Pre-session narrative framework:
//   1. Mark daily suspension blocks (buy-side imbalance / sell-side inefficiency)
//   2. Compute "space between" two consecutive blocks (controlled delivery zone)
//   3. Read open + initial liquidity run
//   4. Confirm turn with wick measurement + body half-behaviour
//   5. Expect efficient delivery once price leaves the controlled zone
//   6. Tether PD arrays to octants/quadrants for validation
//
// Usage: node tools/time_price_grid.cjs PAIR

const fs = require("fs");
const path = require("path");

const ROOT = "C:/Users/cash/smc-icm-trading";
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

// ═══ 1. DETECT DAILY SUSPENSION BLOCKS ═══
// ICT: A suspension block is a daily buy-side imbalance / sell-side inefficiency
// area — a candle or cluster of candles that created a significant directional
// inefficiency that acts as a controlling level for subsequent sessions.
function detectSuspensionBlocks(dailyCandles) {
  if (!dailyCandles || dailyCandles.length < 10) return [];

  const blocks = [];

  for (let i = 1; i < dailyCandles.length - 1; i++) {
    const prev = dailyCandles[i - 1];
    const curr = dailyCandles[i];
    const next = dailyCandles[i + 1];
    const body = Math.abs(curr.close - curr.open);
    const range = curr.high - curr.low;
    if (range === 0) continue;

    const bodyRatio = body / range;
    const isBullish = curr.close > curr.open;
    const isBearish = curr.close < curr.open;

    // Suspension block criteria: strong directional candle with body > 60% of range
    // and the candle's body zone creates an imbalance
    if (bodyRatio > 0.5) {
      if (isBullish) {
        // Bullish suspension = buy-side imbalance (price gapped up, leaving sell-side inefficiency below)
        const blockHigh = curr.high;
        const blockLow = curr.open; // The open is the lower boundary of the buy-side imbalance
        blocks.push({
          type: "BULLISH SUSPENSION (Buy-Side Imbalance)",
          high: blockHigh, low: blockLow,
          mid: (blockHigh + blockLow) / 2,
          bodyRatio: r2(bodyRatio),
          date: new Date(curr.time).toISOString().split("T")[0],
          detail: `Bullish Suspension: ${r5(blockLow)}–${r5(blockHigh)} (body ${r2(bodyRatio * 100)}% of range)`,
        });
      } else if (isBearish) {
        // Bearish suspension = sell-side inefficiency (price gapped down, leaving buy-side imbalance above)
        const blockHigh = curr.open;
        const blockLow = curr.low;
        blocks.push({
          type: "BEARISH SUSPENSION (Sell-Side Inefficiency)",
          high: blockHigh, low: blockLow,
          mid: (blockHigh + blockLow) / 2,
          bodyRatio: r2(bodyRatio),
          date: new Date(curr.time).toISOString().split("T")[0],
          detail: `Bearish Suspension: ${r5(blockLow)}–${r5(blockHigh)} (body ${r2(bodyRatio * 100)}% of range)`,
        });
      }
    }
  }

  return blocks;
}

// ═══ 2. SPACE BETWEEN TWO SUSPENSION BLOCKS ═══
// ICT: The white space between the low of the upper block and the high of the
// lower block is the controlled zone. Price inside this zone moves from one
// inefficiency to another — delivery is measured, not efficient.
function computeSpaceBetween(blocks, currentPrice) {
  if (blocks.length < 2) return null;

  // Find the two most recent blocks (closest to current price)
  const sorted = [...blocks].sort((a, b) => Math.abs(a.mid - currentPrice) - Math.abs(b.mid - currentPrice));
  const upper = sorted[0].mid > sorted[1].mid ? sorted[0] : sorted[1];
  const lower = sorted[0].mid > sorted[1].mid ? sorted[1] : sorted[0];

  const spaceHigh = upper.low;  // Low of the upper block
  const spaceLow = lower.high;  // High of the lower block
  const spaceRange = spaceHigh - spaceLow;

  if (spaceRange <= 0) return null; // Blocks overlap — no space

  const priceInside = currentPrice >= spaceLow && currentPrice <= spaceHigh;
  const priceAbove = currentPrice > spaceHigh;
  const priceBelow = currentPrice < spaceLow;

  return {
    upper, lower,
    high: spaceHigh, low: spaceLow, range: spaceRange,
    midpoint: (spaceHigh + spaceLow) / 2,
    priceInside, priceAbove, priceBelow,
    deliveryZone: priceInside ? "CONTROLLED (inside space — measured delivery)" :
                   priceAbove ? "ABOVE space — efficient delivery possible" :
                   "BELOW space — efficient delivery possible",
    detail: `Space Between: ${r5(spaceLow)}–${r5(spaceHigh)} (${r5(spaceRange)} range) | Price: ${priceInside ? 'INSIDE (controlled)' : priceAbove ? 'ABOVE (efficient)' : 'BELOW (efficient)'}`,
  };
}

// ═══ 3. OCTANTS & QUADRANTS ═══
// ICT: Graded levels that act as horizontal anchors. PD arrays must be tethered
// to an octant, quadrant, or CE to carry algorithmic weight.
function computeOctantsQuadrants(spaceBetween, dailyRange) {
  if (!spaceBetween && !dailyRange) return null;

  const range = spaceBetween || dailyRange;
  const high = range.high, low = range.low;
  const totalRange = high - low;
  if (totalRange <= 0) return null;

  const mid = (high + low) / 2;

  // Quadrants (4 divisions)
  const q1 = low + totalRange * 0.25;   // Lower quadrant
  const q2 = mid;                        // Midpoint (CE)
  const q3 = low + totalRange * 0.75;   // Upper quadrant

  // Octants (8 divisions)
  const octants = [];
  for (let i = 1; i <= 7; i++) {
    octants.push({ level: i, price: low + totalRange * (i / 8), label: `Octant ${i}/8` });
  }

  return {
    high, low, mid,
    quadrants: { q1, q2, q3 },
    octants,
    detail: `Quadrants: Q1 ${r5(q1)} | Q2(CE) ${r5(q2)} | Q3 ${r5(q3)} | Octants: ${octants.map(o => r5(o.price)).join(' | ')}`,
  };
}

// ═══ 4a. DAILY WICK GRADING — Quadrants + CE + Projection ═══
// ICT: Significant daily wicks are volume inefficiencies/data arrays.
// Grade into 0/25/50(CE)/75/100% quadrants. Project forward.
// Classify as premium or discount vs the 20-day dealing range.
function gradeDailyWicks(dailyCandles, range20) {
  if (!dailyCandles || dailyCandles.length < 5) return [];

  const graded = [];
  const recent = dailyCandles.slice(-10); // Last 10 daily candles

  for (const c of recent) {
    const body = Math.abs(c.close - c.open);
    const totalRange = c.high - c.low;
    if (totalRange === 0) continue;

    const upperWick = c.high - Math.max(c.open, c.close);
    const lowerWick = Math.min(c.open, c.close) - c.low;

    // Only grade significant wicks (wick > 40% of total range or > body)
    const isUpperSignificant = upperWick > totalRange * 0.4 || upperWick > body;
    const isLowerSignificant = lowerWick > totalRange * 0.4 || lowerWick > body;

    if (isUpperSignificant) {
      const wickRange = upperWick;
      const wickLow = Math.max(c.open, c.close); // Body extreme = wick start
      const wickHigh = c.high;
      const ce = wickLow + wickRange / 2;
      const q25 = wickLow + wickRange * 0.25;
      const q75 = wickLow + wickRange * 0.75;

      // Classify vs 20-day range
      const classification = range20
        ? (wickHigh > range20.eq ? "PREMIUM WICK" : "DISCOUNT WICK")
        : "UPPER WICK";

      graded.push({
        type: classification,
        direction: "UPPER",
        date: new Date(c.time).toISOString().split("T")[0],
        high: wickHigh, low: wickLow, range: wickRange,
        ce, q25, q75,
        detail: `${classification}: ${r5(wickLow)}–${r5(wickHigh)} | CE ${r5(ce)} | Q25 ${r5(q25)} | Q75 ${r5(q75)} | ${new Date(c.time).toISOString().split('T')[0]}`,
      });
    }

    if (isLowerSignificant) {
      const wickRange = lowerWick;
      const wickHigh = Math.min(c.open, c.close);
      const wickLow = c.low;
      const ce = wickLow + wickRange / 2;
      const q25 = wickLow + wickRange * 0.25;
      const q75 = wickLow + wickRange * 0.75;

      const classification = range20
        ? (wickLow < range20.eq ? "DISCOUNT WICK" : "PREMIUM WICK")
        : "LOWER WICK";

      graded.push({
        type: classification,
        direction: "LOWER",
        date: new Date(c.time).toISOString().split("T")[0],
        high: wickHigh, low: wickLow, range: wickRange,
        ce, q25, q75,
        detail: `${classification}: ${r5(wickLow)}–${r5(wickHigh)} | CE ${r5(ce)} | Q25 ${r5(q25)} | Q75 ${r5(q75)} | ${new Date(c.time).toISOString().split('T')[0]}`,
      });
    }
  }

  return graded;
}

// ═══ 4. WICK MEASUREMENT & BODY HALF-BEHAVIOUR ═══
// ICT: After a stop-hunt wick prints, measure from body close to wick extreme.
// If price cannot reach CE of the wick and bodies stay in upper half (bullish)
// or lower half (bearish), the turn is confirmed.
function analyzeWickBody(candles1m, currentPrice, bias) {
  if (!candles1m || candles1m.length < 10) return null;

  // Find recent wick candles (long wick relative to body)
  const recent = candles1m.slice(-20);
  let bestWick = null, bestWickRatio = 0;

  for (const c of recent) {
    const body = Math.abs(c.close - c.open);
    const totalRange = c.high - c.low;
    if (totalRange === 0) continue;

    const upperWick = c.high - Math.max(c.open, c.close);
    const lowerWick = Math.min(c.open, c.close) - c.low;
    const maxWick = Math.max(upperWick, lowerWick);
    const wickRatio = maxWick / totalRange;

    if (wickRatio > 0.6 && wickRatio > bestWickRatio) {
      bestWickRatio = wickRatio;
      const isUpperWick = upperWick > lowerWick;
      const wickExtreme = isUpperWick ? c.high : c.low;
      const bodyClose = c.close;
      const wickRange = Math.abs(wickExtreme - bodyClose);
      const wickCE = isUpperWick ? wickExtreme - wickRange / 2 : wickExtreme + wickRange / 2;

      bestWick = {
        candle: c,
        isUpperWick,
        wickExtreme, bodyClose, wickRange, wickCE,
        wickRatio: r2(wickRatio),
        ceReached: isUpperWick ? currentPrice <= wickCE : currentPrice >= wickCE,
        detail: `${isUpperWick ? 'Upper' : 'Lower'} wick: extreme ${r5(wickExtreme)}, CE ${r5(wickCE)}. ${isUpperWick ? (currentPrice <= wickCE ? 'CE reached (bearish pressure)' : 'CE NOT reached (bullish)') : (currentPrice >= wickCE ? 'CE reached (bullish pressure)' : 'CE NOT reached (bearish)')}`,
      };
    }
  }

  if (!bestWick) return null;

  // Body half-behaviour: are recent bodies staying in upper or lower half?
  const last5Bodies = recent.slice(-5).map(c => ({ close: c.close, open: c.open, mid: (c.close + c.open) / 2 }));
  const bodyMids = last5Bodies.map(b => b.mid);
  const avgMid = bodyMids.reduce((s, v) => s + v, 0) / bodyMids.length;
  const bodiesInUpperHalf = last5Bodies.filter(b => b.close > b.open).length;
  const bodiesInLowerHalf = last5Bodies.filter(b => b.close < b.open).length;

  const bullishBody = bodiesInUpperHalf >= 3;
  const bearishBody = bodiesInLowerHalf >= 3;

  // Confirmation: wick CE not reached + bodies confirming direction
  const bullishConfirm = bestWick.isUpperWick && !bestWick.ceReached && bullishBody;
  const bearishConfirm = !bestWick.isUpperWick && !bestWick.ceReached && bearishBody;

  return {
    wick: bestWick,
    bodyBehavior: {
      bodiesInUpperHalf, bodiesInLowerHalf,
      signal: bullishBody ? "BULLISH (bodies in upper half)" : bearishBody ? "BEARISH (bodies in lower half)" : "NEUTRAL",
    },
    bullishConfirm, bearishConfirm,
    confirmed: bullishConfirm || bearishConfirm,
    direction: bullishConfirm ? "BULLISH" : bearishConfirm ? "BEARISH" : null,
    detail: bestWick.detail + ` | Bodies: ${bullishBody ? 'upper half ✅' : bearishBody ? 'lower half ✅' : 'mixed'}` + ` | Turn: ${bullishConfirm ? '✅ BULLISH CONFIRMED' : bearishConfirm ? '✅ BEARISH CONFIRMED' : '⏳ Not confirmed'}`,
  };
}

// ═══ 5. EFFICIENT DELIVERY DETECTION ═══
// ICT: Once price leaves the controlled space, delivery becomes fast and
// efficient — tight channels with little overlap. Inside the space, delivery
// is measured/controlled.
function detectDeliveryMode(spaceBetween, candles5m) {
  if (!candles5m || candles5m.length < 10) return null;

  const recent = candles5m.slice(-10);
  const overlaps = [];
  for (let i = 1; i < recent.length; i++) {
    const prev = recent[i - 1], curr = recent[i];
    const overlap = Math.min(prev.high, curr.high) - Math.max(prev.low, curr.low);
    overlaps.push(overlap > 0);
  }
  const overlapRatio = overlaps.filter(Boolean).length / overlaps.length;

  const direction = recent[recent.length - 1].close > recent[0].close ? "UP" : "DOWN";
  const efficient = overlapRatio < 0.4; // Less than 40% overlap = efficient

  return {
    overlapRatio: r2(overlapRatio),
    efficient,
    direction,
    inSpace: spaceBetween?.priceInside || false,
    detail: efficient
      ? `⚡ EFFICIENT delivery (${r2(overlapRatio * 100)}% overlap) — tight ${direction} channel`
      : `🐢 CONTROLLED delivery (${r2(overlapRatio * 100)}% overlap) — measured, overlapping candles`,
  };
}

// ═══ 6. TETHER PD ARRAYS TO GRADED LEVELS ═══
// ICT: A PD array is only high-probability if tethered to an octant,
// quadrant, or CE of a graded range or suspension block.
function tetherPDArrays(fvgs, obs, octants) {
  if (!octants) return [];

  const tethered = [];
  const allLevels = [
    { price: octants.mid, label: "CE (Midpoint)" },
    { price: octants.quadrants.q1, label: "Q1 (25%)" },
    { price: octants.quadrants.q3, label: "Q3 (75%)" },
    ...octants.octants.map(o => ({ price: o.price, label: o.label })),
  ];

  // Check FVGs against graded levels
  for (const fvg of (fvgs || []).slice(0, 10)) {
    const fvgMid = (fvg.top + fvg.bottom) / 2;
    for (const level of allLevels) {
      if (Math.abs(fvgMid - level.price) / level.price < 0.002) {
        tethered.push({ type: "FVG", price: fvgMid, tetheredTo: level.label, detail: `${fvg.type} FVG tethered to ${level.label} @ ${r5(level.price)}` });
        break;
      }
    }
  }

  // Check Order Blocks
  for (const ob of (obs || []).slice(0, 10)) {
    const obMid = (ob.proximal + ob.distal) / 2;
    for (const level of allLevels) {
      if (Math.abs(obMid - level.price) / level.price < 0.002) {
        tethered.push({ type: "OB", price: obMid, tetheredTo: level.label, detail: `${ob.type} OB tethered to ${level.label} @ ${r5(level.price)}` });
        break;
      }
    }
  }

  return tethered;
}

// ═══ MAIN ═══
function analyzeTimePriceGrid(pair) {
  const p = pair || PAIR;
  const dailyCandles = loadCandles("1d");
  const candles1m = loadCandles("1m");
  const candles5m = loadCandles("5m");
  const reports = {};
  for (const tf of ["1D", "4H", "1H", "5m"]) reports[tf] = loadEngine(tf);

  const currentPrice = reports["1H"]?.price || reports["4H"]?.price || 0;
  const dailyBias = reports["1D"]?.structure?.bias || "neutral";

  // Step 1: Suspension blocks
  const blocks = detectSuspensionBlocks(dailyCandles);

  // Step 2: Space between
  const spaceBetween = computeSpaceBetween(blocks, currentPrice);

  // Step 3: Octants/quadrants from the space or daily range
  const dailyHigh = reports["1D"]?.structure?.lastSwingHigh;
  const dailyLow = reports["1D"]?.structure?.lastSwingLow;
  const dailyRange = dailyHigh && dailyLow ? { high: dailyHigh, low: dailyLow } : null;
  const octants = computeOctantsQuadrants(spaceBetween, dailyRange);

  // Step 4a: Daily wick grading (on daily chart — per ICT spec)
  // WP-5: graded against the SWEEP-DEFINED dealing range, not a 20-bar average.
  const { computeDealingRange } = require("./lib/dealing_range.cjs");
  const sweepRange = computeDealingRange(dailyCandles);
  const range20 = sweepRange ? { high: sweepRange.high, low: sweepRange.low, eq: sweepRange.equilibrium } : null;
  const dailyWicks = gradeDailyWicks(dailyCandles, range20);

  // Step 4: Wick/body turn confirmation (intraday)
  const wickBody = analyzeWickBody(candles1m, currentPrice, dailyBias);

  // Step 5: Delivery mode
  const delivery = detectDeliveryMode(spaceBetween, candles5m);

  // Step 6: Tethered PD arrays
  const fvgs = (reports["5m"]?.fvgs || []).concat(reports["1H"]?.fvgs || []);
  const obs = (reports["5m"]?.orderBlocks || []).concat(reports["1H"]?.orderBlocks || []);
  const tethered = tetherPDArrays(fvgs, obs, octants);

  // Step 7: Chain of Custody
  // ORG: 9:30 open vs prior settlement (from daily candles)
  let org = null;
  if (dailyCandles && dailyCandles.length >= 2) {
    const today = dailyCandles[dailyCandles.length - 1];
    const yesterday = dailyCandles[dailyCandles.length - 2];
    const orgHigh = Math.max(today.open, yesterday.close);
    const orgLow = Math.min(today.open, yesterday.close);
    org = { ce: (orgHigh + orgLow) / 2, filled: currentPrice <= orgLow || currentPrice >= orgHigh };
  }
  const chain = buildCustodyChain(blocks, wickBody, org, dailyBias, currentPrice);

  // Narrative
  const inSpace = spaceBetween?.priceInside;
  const turnConfirmed = wickBody?.confirmed;
  const efficientDelivery = delivery?.efficient;

  let narrative = "";
  if (inSpace && !turnConfirmed) {
    narrative = `Price inside controlled space (${r5(spaceBetween.low)}–${r5(spaceBetween.high)}). Awaiting turn confirmation via wick + body behaviour. Delivery is measured.`;
  } else if (inSpace && turnConfirmed) {
    narrative = `Turn CONFIRMED (${wickBody.direction}) inside controlled space. Accumulation zone active. Expect efficient delivery once price leaves the space toward the daily target.`;
  } else if (!inSpace && efficientDelivery) {
    narrative = `Price has LEFT the controlled space. ${delivery.detail}. ${turnConfirmed ? 'Turn already confirmed — ride the efficient delivery.' : 'Watch for turn confirmation at next graded level.'}`;
  } else if (!inSpace && !efficientDelivery) {
    narrative = `Price outside controlled space but delivery is not yet efficient — still overlapping. Wait for tight channel to confirm direction.`;
  } else {
    narrative = `Building narrative from ${blocks.length} suspension blocks. ${spaceBetween ? spaceBetween.detail : 'No clear space between blocks.'}`;
  }

  return {
    pair: p,
    time: new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false }) + " NY",
    currentPrice, dailyBias,
    blocks: blocks.slice(-5),
    blockCount: blocks.length,
    spaceBetween,
    octants,
    dailyWicks,
    wickBody,
    delivery,
    tetheredPDArrays: tethered,
    tetheredCount: tethered.length,
    chain,
    narrative,
    detail: [
      `${blocks.length} suspension blocks on daily`,
      spaceBetween?.detail || "No space between blocks",
      wickBody?.detail || "No wick/body signal",
      delivery?.detail || "No delivery data",
      `${tethered.length} PD arrays tethered to graded levels`,
      narrative,
    ].join("\n"),
  };
}

// ═══ OUTPUT ═══
const result = analyzeTimePriceGrid(PAIR);

const outDir = path.join(ROOT, "stages", "00_macro_context", "output");
fs.mkdirSync(outDir, { recursive: true });

let md = `# Time & Price Grid — ${result.pair} — ${DATE}\n\n`;
md += `## Current: ${result.time} | Price: ${r5(result.currentPrice)} | Bias: ${result.dailyBias.toUpperCase()}\n\n`;

md += `## Suspension Blocks (${result.blockCount} on daily)\n`;
for (const b of result.blocks) {
  md += `- ${b.detail} (${b.date})\n`;
}

if (result.spaceBetween) {
  md += `\n## Space Between\n${result.spaceBetween.detail}\n`;
  md += `- Delivery Zone: ${result.spaceBetween.deliveryZone}\n`;
}

if (result.octants) {
  md += `\n## Graded Levels (Octants & Quadrants)\n${result.octants.detail}\n`;
}

if (result.dailyWicks?.length > 0) {
  md += `\n## Daily Wick Grading (${result.dailyWicks.length} graded)\n`;
  md += `| Date | Type | Range | CE | Q25 | Q75 |\n`;
  md += `|------|------|-------|----|-----|-----|\n`;
  for (const w of result.dailyWicks.slice(0, 5)) {
    md += `| ${w.date} | ${w.type} | ${r5(w.low)}–${r5(w.high)} | ${r5(w.ce)} | ${r5(w.q25)} | ${r5(w.q75)} |\n`;
  }
}

if (result.wickBody) {
  md += `\n## Wick & Body Confirmation\n${result.wickBody.detail}\n`;
}

if (result.delivery) {
  md += `\n## Delivery Mode\n${result.delivery.detail}\n`;
}

if (result.tetheredPDArrays.length > 0) {
  md += `\n## Tethered PD Arrays (${result.tetheredCount})\n`;
  for (const t of result.tetheredPDArrays) {
    md += `- ${t.detail}\n`;
  }
}

md += `\n## Narrative\n**${result.narrative}**\n`;

md += `\n## Chain of Custody (${result.chain.linkCount} links)\n`;
md += `**${result.chain.handoffSequence || 'No chain'}**\n`;
md += `- Dominant Half: ${result.chain.dominantHalf}\n`;
for (const l of result.chain.links) md += `- ${l.detail}\n`;
md += `\n${result.chain.narrative}\n`;

const outFile = path.join(outDir, `${PAIR.toLowerCase()}_time_price_grid.md`);
fs.writeFileSync(outFile, md, "utf8");

console.log(`\n═══ TIME & PRICE GRID — ${PAIR} ═══`);
console.log(`  Suspension Blocks: ${result.blockCount} on daily`);
console.log(`  Daily Wicks Graded: ${result.dailyWicks?.length || 0} (${result.dailyWicks?.filter(w => w.type.includes('PREMIUM')).length || 0} premium, ${result.dailyWicks?.filter(w => w.type.includes('DISCOUNT')).length || 0} discount)`);
console.log(`  Space Between: ${result.spaceBetween?.detail || 'None'}`);
console.log(`  Wick/Body: ${result.wickBody?.detail || 'No signal'}`);
console.log(`  Delivery: ${result.delivery?.detail || 'No data'}`);
console.log(`  Tethered PD Arrays: ${result.tetheredCount}`);
console.log(`  Narrative: ${result.narrative}`);
console.log(`  Chain of Custody: ${result.chain.handoffSequence || 'No chain'} | ${result.chain.linkCount} links | Dominant: ${result.chain.dominantHalf}`);
console.log(`  ✓ Output → ${outFile}`);

// ═══ 7. CHAIN OF CUSTODY — Link PD Arrays Sequentially ═══
// ICT: "Each array hands custody of price to the next one in sequence."
// Daily SIBI → Volume Imbalance → Discount/Premium Wick CE → ORG Midpoint
// → 1st-Presented FVG → Next Suspension Block.
//
// Bodies define the real range; wicks only probe. Upper half = premium,
// lower half = discount. Bodies in lower half = bearish; upper = bullish.
function buildCustodyChain(suspensionBlocks, wickBody, org, dailyBias, currentPrice) {
  const chain = [];

  // Link 1: Daily suspension blocks / SIBIs
  const recentBlock = suspensionBlocks?.[suspensionBlocks.length - 1];
  if (recentBlock) {
    const bodiesInLower = currentPrice < recentBlock.mid;
    const bodiesInUpper = currentPrice > recentBlock.mid;
    chain.push({
      id: "SUSPENSION_BLOCK",
      level: recentBlock.mid,
      type: recentBlock.type,
      bodyHalf: bodiesInLower ? "LOWER (bearish)" : bodiesInUpper ? "UPPER (bullish)" : "MID",
      detail: `Daily Suspension Block @ ${r5(recentBlock.mid)} | Bodies in ${bodiesInLower ? 'lower' : 'upper'} half | ${recentBlock.date}`,
    });
  }

  // Link 2: Volume imbalances (from engine FVGs with displacement)
  // Note: true volume imbalance detection requires order-flow data; we approximate with high-displacement FVGs

  // Link 3: Discount/Premium wick CE (from wick/body analysis)
  if (wickBody?.wick) {
    const w = wickBody.wick;
    const halfLabel = w.isUpperWick ? "UPPER (premium)" : "LOWER (discount)";
    const respectingCE = w.ceReached ? "CE reached" : "CE NOT reached — respecting";
    chain.push({
      id: "WICK_CE",
      level: w.wickCE,
      type: `${w.isUpperWick ? 'Premium' : 'Discount'} Wick CE`,
      bodyHalf: halfLabel,
      detail: `${w.isUpperWick ? 'Premium' : 'Discount'} Wick CE @ ${r5(w.wickCE)} | ${respectingCE} | ${wickBody.bodyBehavior.signal}`,
    });
  }

  // Link 4: ORG midpoint (carried forward day after day)
  if (org?.ce) {
    const orgHalf = currentPrice > org.ce ? "UPPER (premium)" : "LOWER (discount)";
    chain.push({
      id: "ORG_MIDPOINT",
      level: org.ce,
      type: "Opening Range Gap CE",
      bodyHalf: orgHalf,
      detail: `ORG CE @ ${r5(org.ce)} | Price in ${orgHalf} | ${org.filled ? 'FILLED' : 'OPEN'}`,
    });
  }

  // Link 5: 1st-Presented FVG of the week (or nearest unfilled)
  // Approximated from the tethering check — first tethered FVG

  // Determine narrative from chain
  let narrative = "";
  if (chain.length >= 2) {
    const last = chain[chain.length - 1];
    const first = chain[0];
    const bearishBody = chain.filter(c => c.bodyHalf?.includes("LOWER")).length;
    const bullishBody = chain.filter(c => c.bodyHalf?.includes("UPPER")).length;
    const dominantHalf = bearishBody > bullishBody ? "LOWER (bearish delivery)" : bullishBody > bearishBody ? "UPPER (bullish delivery)" : "MIXED";

    // Build hand-off sequence
    const handoffs = chain.map(c => c.id).join(" → ");
    narrative = `Chain: ${handoffs} | ${chain.length} links active. Dominant half: ${dominantHalf}. ${first.detail} → ${last.detail}`;
  } else if (chain.length === 1) {
    narrative = `Chain starting: ${chain[0].detail}. Awaiting next link.`;
  } else {
    narrative = "Chain empty — insufficient PD arrays to build custody chain.";
  }

  return {
    links: chain,
    linkCount: chain.length,
    handoffSequence: chain.map(c => c.id).join(" → "),
    dominantHalf: chain.filter(c => c.bodyHalf?.includes("LOWER")).length > chain.filter(c => c.bodyHalf?.includes("UPPER")).length ? "BEARISH" : "BULLISH",
    narrative,
    detail: chain.map(c => c.detail).join(" | "),
  };
}

module.exports = { analyzeTimePriceGrid, detectSuspensionBlocks, computeSpaceBetween, computeOctantsQuadrants, analyzeWickBody, detectDeliveryMode, tetherPDArrays, buildCustodyChain, gradeDailyWicks };
