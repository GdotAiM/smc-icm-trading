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

  // Step 4: Wick/body turn confirmation
  const wickBody = analyzeWickBody(candles1m, currentPrice, dailyBias);

  // Step 5: Delivery mode
  const delivery = detectDeliveryMode(spaceBetween, candles5m);

  // Step 6: Tethered PD arrays
  const fvgs = (reports["5m"]?.fvgs || []).concat(reports["1H"]?.fvgs || []);
  const obs = (reports["5m"]?.orderBlocks || []).concat(reports["1H"]?.orderBlocks || []);
  const tethered = tetherPDArrays(fvgs, obs, octants);

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
    wickBody,
    delivery,
    tetheredPDArrays: tethered,
    tetheredCount: tethered.length,
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

const outFile = path.join(outDir, `${PAIR.toLowerCase()}_time_price_grid.md`);
fs.writeFileSync(outFile, md, "utf8");

console.log(`\n═══ TIME & PRICE GRID — ${PAIR} ═══`);
console.log(`  Suspension Blocks: ${result.blockCount} on daily`);
console.log(`  Space Between: ${result.spaceBetween?.detail || 'None'}`);
console.log(`  Wick/Body: ${result.wickBody?.detail || 'No signal'}`);
console.log(`  Delivery: ${result.delivery?.detail || 'No data'}`);
console.log(`  Tethered PD Arrays: ${result.tetheredCount}`);
console.log(`  Narrative: ${result.narrative}`);
console.log(`  ✓ Output → ${outFile}`);

module.exports = { analyzeTimePriceGrid, detectSuspensionBlocks, computeSpaceBetween, computeOctantsQuadrants, analyzeWickBody, detectDeliveryMode, tetherPDArrays };
