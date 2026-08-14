// IRL/ERL Engine — ICT Internal & External Range Liquidity
// Proper implementation audited against innercircletrader.net 2026-07-31
//
// Core concepts:
//   IRL = Fair Value Gaps inside the dealing range (FVGs ONLY — not pools, not OBs)
//   ERL = Buy-side above swing high / Sell-side below swing low (liquidity pools)
//   Dealing Range = area between a swing high that swept old-high liquidity
//                   and a swing low that swept old-low liquidity
//   Cycle = ERL → IRL → ERL → IRL rotation
//
// Usage: node tools/irl_erl_engine.cjs PAIR

const fs = require("fs");
const path = require("path");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..");
const DATE = require("./ny_time.cjs").getNYDate();
const PAIR = process.argv[2] || "GBPUSD";

function r2(v) { return Number(v).toFixed(2); }
function r5(v) { return Number(v).toFixed(5); }

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

// ═══ 1. FIND VALID DEALING RANGE ═══
// ICT: "The swing high must have taken liquidity above an old high,
// and the swing low must have taken liquidity below an old low."
// WP-5 (audit Gap 2.2): the range is built from SWEEP-TO-SWEEP extremes —
// the last external liquidity sweep above and the last external sweep below.
// If either side is missing, there is NO operative range: return null and
// block the trade. Never fall back to last internal swings.
function findDealingRange(engineDaily, engine4h, engine1h) {
  const { computeDealingRange } = require("./lib/dealing_range.cjs");
  const tiers = [
    { tf: "1d", label: "1D", report: engineDaily },
    { tf: "4h", label: "4H", report: engine4h },
    { tf: "1h", label: "1H", report: engine1h },
  ];
  for (const { tf, label, report } of tiers) {
    const candles = loadCandles(tf);
    if (!candles || !candles.length) continue;
    const range = computeDealingRange(candles);
    if (!range) continue; // no sweep on one/both sides on this TF — try next
    const price = report?.price || range.price;
    return {
      high: range.high,
      low: range.low,
      range: range.range,
      midpoint: range.equilibrium,
      equilibrium: range.equilibrium,
      positionPct: range.positionPct,
      zone: range.zone,
      source: label,
      valid: true,
      validation: {
        highSwept: true,
        lowSwept: true,
        detail: `Sweep-to-sweep — high swept @ ${r5(range.sweepAbove.price)}, low swept @ ${r5(range.sweepBelow.price)}`,
      },
      // Premium/Discount zones
      premium: { high: range.high, low: range.equilibrium },
      discount: { high: range.equilibrium, low: range.low },
      detail: range.detail,
    };
  }
  return null; // no operative dealing range — trade is blocked
}

// ═══ 2. MARK IRL — FAIR VALUE GAPS INSIDE THE RANGE ═══
// ICT: "Only fair value gaps are marked as IRL."
// "Every unfilled FVG inside the dealing range is an IRL target."
// Order blocks, breakers, rejection blocks are EXPLICITLY excluded.
function markIRL(dealingRange, reports) {
  if (!dealingRange) return [];

  const price = reports["1H"]?.price || reports["4H"]?.price || 0;
  const irl = [];

  // 1) FVGs inside the range — unfilled/partially filled (fillFraction < 0.7)
  for (const tf of ["15m", "5m", "1h", "4h"]) {
    const r = reports[tf];
    if (!r || !r.fvgs) continue;
    for (const fvg of r.fvgs) {
      const fvgMid = (fvg.top + fvg.bottom) / 2;
      // Only FVGs that are INSIDE the dealing range
      if (fvgMid >= dealingRange.low && fvgMid <= dealingRange.high) {
        // Only unfilled or partially filled FVGs
        if ((fvg.fillFraction || 0) < 0.7) {
          irl.push({
            ...fvg,
            tf,
            kind: "FVG",
            midpoint: fvgMid,
            isIRL: true,
            fillPct: r2((fvg.fillFraction || 0) * 100),
            distance: Math.abs(price - fvgMid),
          });
        }
      }
    }
  }

  // 2) Equal highs/lows inside the range — ATR-relative clusters, unswept
  //    (WP-6 / Gap 2.1: fuel is fuel — a stop cluster is a stop cluster).
  //    Unswept cluster = 0% filled, ranked by distance like every other IRL.
  const { findRelativeEqualLevels } = require("./lib/liquidity.cjs");
  const { calcATR } = require("./lib/metrics.cjs");
  const candles5m = loadCandles("5m");
  const candles15m = loadCandles("15m");
  const src = candles5m || candles15m;
  if (src) {
    const atr = calcATR(src, 14) || 1;
    const rel = findRelativeEqualLevels(src, atr);
    const srcTf = candles5m ? "5m" : "15m";
    for (const h of rel.highs || []) {
      if (!h.swept && h.price >= dealingRange.low && h.price <= dealingRange.high) {
        irl.push({
          kind: "equalHighs",
          type: "equalHighs",
          price: h.price,
          top: h.top,
          bottom: h.bottom,
          tf: srcTf,
          midpoint: h.price,
          isIRL: true,
          fillFraction: 0,
          fillPct: r2(0),
          distance: Math.abs(price - h.price),
          detail: h.detail,
        });
      }
    }
    for (const l of rel.lows || []) {
      if (!l.swept && l.price >= dealingRange.low && l.price <= dealingRange.high) {
        irl.push({
          kind: "equalLows",
          type: "equalLows",
          price: l.price,
          top: l.top,
          bottom: l.bottom,
          tf: srcTf,
          midpoint: l.price,
          isIRL: true,
          fillFraction: 0,
          fillPct: r2(0),
          distance: Math.abs(price - l.price),
          detail: l.detail,
        });
      }
    }
  }

  // Rank by nearest unmitigated internal liquidity (distance from current price).
  irl.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));

  return irl;
}

// ═══ 3. MARK ERL — LIQUIDITY OUTSIDE THE RANGE ═══
// ICT: ERL sits outside the dealing range — buy-side above swing high,
// sell-side below swing low. The side with more equal highs/lows has
// the larger accumulation of resting orders = the magnet.
function markERL(dealingRange, reports) {
  if (!dealingRange) return { buySide: [], sellSide: [], dominant: "NONE" };

  const buySide = [];  // BSL above swing high
  const sellSide = []; // SSL below swing low

  for (const tf of ["4h", "1h", "15m"]) {
    const r = reports[tf];
    if (!r || !r.liquidity) continue;

    for (const pool of r.liquidity) {
      if (pool.type === "BSL" && pool.price > dealingRange.high) {
        buySide.push({ ...pool, tf });
      }
      if (pool.type === "SSL" && pool.price < dealingRange.low) {
        sellSide.push({ ...pool, tf });
      }
    }
  }

  // Check for equal highs/lows clustering (engineered liquidity)
  const buySideClusters = countEqualLevels(buySide);
  const sellSideClusters = countEqualLevels(sellSide);

  // Dominant ERL = side with more resting orders (equal levels = more stops)
  const buyStrength = buySide.length + buySideClusters * 2;
  const sellStrength = sellSide.length + sellSideClusters * 2;
  const dominant = buyStrength > sellStrength * 1.2 ? "BUY-SIDE (above)"
    : sellStrength > buyStrength * 1.2 ? "SELL-SIDE (below)"
    : "BALANCED";

  return {
    buySide,
    sellSide,
    buySideClusters,
    sellSideClusters,
    dominant,
    largerPool: buyStrength >= sellStrength ? "ABOVE" : "BELOW",
    detail: `ERL: ${buySide.length} buy-side pools above, ${sellSide.length} sell-side below. ${buySideClusters} equal-high clusters, ${sellSideClusters} equal-low clusters. Dominant: ${dominant}`
  };
}

// Helper: count equal level clusters (levels within 0.1% of each other)
function countEqualLevels(pools) {
  if (pools.length < 2) return 0;
  let clusters = 0;
  const sorted = [...pools].sort((a, b) => a.price - b.price);
  for (let i = 0; i < sorted.length - 1; i++) {
    if (Math.abs(sorted[i].price - sorted[i+1].price) / sorted[i].price < 0.001) {
      clusters++;
      i++; // Skip the paired one
    }
  }
  return clusters;
}

// ═══ 4. TRACK DELIVERY CYCLE ═══
// ICT: ERL → IRL → ERL → IRL rotation
// "After price takes ERL on one side, it enters a corrective phase toward IRL.
//  After IRL is filled, price is loaded for the next ERL raid."
function trackCycle(dealingRange, irlFvgs, erl, reports) {
  if (!dealingRange) return { position: "UNKNOWN", phase: "UNKNOWN", detail: "No valid dealing range" };

  const currentPrice = reports["1h"]?.price || reports["4h"]?.price || 0;
  const priceInRange = currentPrice >= dealingRange.low && currentPrice <= dealingRange.high;

  // Check recent sweeps to determine cycle position
  const recentPools = (reports["4h"]?.liquidity || []).concat(reports["1h"]?.liquidity || []);
  const recentSweeps = recentPools.filter(p => p.swept);

  // Check if ERL was just taken (swept BSL above high or SSL below low)
  const erlAboveSwept = recentSweeps.filter(p => p.type === "BSL" && p.price > dealingRange.high).length;
  const erlBelowSwept = recentSweeps.filter(p => p.type === "SSL" && p.price < dealingRange.low).length;

  // Check IRL fill status
  const unfilledIRL = irlFvgs.filter(f => (f.fillFraction || 0) < 0.3).length;
  const partiallyFilledIRL = irlFvgs.filter(f => (f.fillFraction || 0) >= 0.3 && (f.fillFraction || 0) < 0.7).length;
  const recentlyFilled = irlFvgs.filter(f => (f.fillFraction || 0) >= 0.7).length;

  // Determine cycle position
  let position, phase, nextTarget;
  if (erlAboveSwept > 0 && unfilledIRL > 0) {
    position = "POST-ERL RAID (above)";
    phase = "CORRECTIVE — heading toward IRL below";
    nextTarget = "IRL (FVGs inside range)";
  } else if (erlBelowSwept > 0 && unfilledIRL > 0) {
    position = "POST-ERL RAID (below)";
    phase = "CORRECTIVE — heading toward IRL above";
    nextTarget = "IRL (FVGs inside range)";
  } else if (recentlyFilled > partiallyFilledIRL + unfilledIRL && erl.dominant !== "NONE") {
    position = "POST-IRL FILL";
    phase = `LOADED — targeting ${erl.dominant} ERL`;
    nextTarget = `ERL (${erl.dominant})`;
  } else if (priceInRange && unfilledIRL > 0) {
    position = "INSIDE RANGE";
    phase = "CONSOLIDATING — IRL filling in progress";
    nextTarget = "Nearest IRL";
  } else if (!priceInRange) {
    position = "OUTSIDE RANGE";
    phase = currentPrice > dealingRange.high ? "ABOVE range — ERL raid possible" : "BELOW range — ERL raid possible";
    nextTarget = "Opposite ERL or re-enter range toward IRL";
  } else {
    position = "INSIDE RANGE";
    phase = "EQUILIBRIUM — waiting for delivery signal";
    nextTarget = "Monitor for ERL raid or IRL fill";
  }

  return {
    position,
    phase,
    nextTarget,
    erlAboveSwept,
    erlBelowSwept,
    unfilledIRL,
    partiallyFilledIRL,
    recentlyFilled,
    priceInRange,
    currentPrice,
    detail: `${position} | ${phase} | Next: ${nextTarget} | IRL: ${unfilledIRL} unfilled, ${recentlyFilled} filled | ERL sweeps: ${erlAboveSwept} above, ${erlBelowSwept} below`
  };
}

// ═══ 5. DERIVE DAILY BIAS FROM IRL/ERL ═══
// ICT: "Bullish bias: when price has recently taken IRL and the larger
// ERL sits above current price. Bearish bias: larger ERL below."
function deriveBias(cycle, erl, dealingRange, currentPrice) {
  if (!dealingRange || !cycle) return { bias: "neutral", confidence: 0, detail: "Insufficient IRL/ERL data" };

  const largerERLAbove = erl.largerPool === "ABOVE";
  const largerERLBelow = erl.largerPool === "BELOW";

  let bias = "neutral", confidence = 0, reasoning = "";

  // Post-IRL fill + larger ERL above = bullish bias
  if (cycle.position === "POST-IRL FILL" && largerERLAbove) {
    bias = "bullish";
    confidence = 0.8;
    reasoning = "IRL filled — loaded for ERL raid above. Larger ERL pool sits above = institutional magnet.";
  }
  // Post-IRL fill + larger ERL below = bearish bias
  else if (cycle.position === "POST-IRL FILL" && largerERLBelow) {
    bias = "bearish";
    confidence = 0.8;
    reasoning = "IRL filled — loaded for ERL raid below. Larger ERL pool sits below = institutional magnet.";
  }
  // Post-ERL raid above = corrective, bearish toward IRL
  else if (cycle.erlAboveSwept > 0 && cycle.unfilledIRL > 0) {
    bias = "bearish";
    confidence = 0.6;
    reasoning = "ERL above just swept. Corrective phase heading DOWN toward IRL inside range.";
  }
  // Post-ERL raid below = corrective, bullish toward IRL
  else if (cycle.erlBelowSwept > 0 && cycle.unfilledIRL > 0) {
    bias = "bullish";
    confidence = 0.6;
    reasoning = "ERL below just swept. Corrective phase heading UP toward IRL inside range.";
  }
  // Inside range, larger ERL above = bullish draw
  else if (cycle.position === "INSIDE RANGE" && largerERLAbove) {
    bias = "bullish";
    confidence = 0.4;
    reasoning = "Inside range. Larger ERL pool above acts as magnet. Expect eventual draw upward.";
  }
  // Inside range, larger ERL below = bearish draw
  else if (cycle.position === "INSIDE RANGE" && largerERLBelow) {
    bias = "bearish";
    confidence = 0.4;
    reasoning = "Inside range. Larger ERL pool below acts as magnet. Expect eventual draw downward.";
  }
  // Outside above = bearish (heading back in)
  else if (cycle.position === "OUTSIDE RANGE" && currentPrice > dealingRange.high) {
    bias = "bearish";
    confidence = 0.5;
    reasoning = "Price outside above dealing range. Expected to re-enter range toward IRL.";
  }
  // Outside below = bullish (heading back in)
  else if (cycle.position === "OUTSIDE RANGE" && currentPrice < dealingRange.low) {
    bias = "bullish";
    confidence = 0.5;
    reasoning = "Price outside below dealing range. Expected to re-enter range toward IRL.";
  }

  return { bias, confidence, reasoning, detail: `${bias.toUpperCase()} bias (${r2(confidence)}): ${reasoning}` };
}

// ═══ 6. ENTRY RULES ═══
// Based on IRL/ERL cycle position — what should we be looking for?
function getEntryGuidance(cycle, erl, bias, dealingRange) {
  if (!cycle || !dealingRange) return { action: "WAIT", detail: "No IRL/ERL cycle data" };

  const guidance = [];

  if (cycle.position === "POST-ERL RAID (above)" || cycle.position === "POST-ERL RAID (below)") {
    guidance.push({
      action: "LOOK FOR IRL FILL",
      direction: bias.bias,
      detail: `ERL swept — expect corrective move toward IRL inside range. Watch for IRL FVGs filling as entry trigger.`,
    });
  }

  if (cycle.position === "POST-IRL FILL") {
    guidance.push({
      action: "LOOK FOR ERL RAID",
      direction: bias.bias,
      detail: `IRL filled — price loaded for ERL raid. Look for displacement + MSS toward ${erl.largerPool} ERL.`,
    });
  }

  if (cycle.position === "INSIDE RANGE" && cycle.unfilledIRL > 0) {
    guidance.push({
      action: "MONITOR IRL FILLS",
      direction: bias.bias,
      detail: `${cycle.unfilledIRL} unfilled IRL targets inside range. Wait for fill + MSS before entry.`,
    });
  }

  if (guidance.length === 0) {
    guidance.push({ action: "WAIT", direction: "neutral", detail: "Unclear cycle position — wait for ERL raid or IRL fill to establish direction." });
  }

  return guidance;
}

// ═══ MAIN ═══
function analyzeIRLERL(pair) {
  const p = pair || PAIR;
  const reports = {};
  for (const tf of ["1D", "4H", "1H", "15m", "5m"]) {
    reports[tf] = loadEngine(tf);
  }

  const currentPrice = reports["1H"]?.price || reports["4H"]?.price || 0;

  // Step 1: Find valid dealing range
  const dealingRange = findDealingRange(reports["1D"], reports["4H"], reports["1H"]);

  // Step 2: Mark IRL (FVGs inside range)
  const irlFvgs = markIRL(dealingRange, reports);

  // Step 3: Mark ERL (liquidity outside range)
  const erl = markERL(dealingRange, reports);

  // Step 4: Track delivery cycle
  const cycle = trackCycle(dealingRange, irlFvgs, erl, reports);

  // Step 5: Derive daily bias
  const bias = deriveBias(cycle, erl, dealingRange, currentPrice);

  // Step 6: Entry guidance
  const entryGuidance = getEntryGuidance(cycle, erl, bias, dealingRange);

  return {
    pair: p,
    time: new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false }) + " NY",
    currentPrice,
    dealingRange,
    irl: {
      count: irlFvgs.length,
      fvgs: irlFvgs.slice(0, 10), // Top 10 most potent
      unfilled: irlFvgs.filter(f => f.kind === "equalHighs" || f.kind === "equalLows" ? !f.swept : (f.fillFraction || 0) < 0.3).length,
      partial: irlFvgs.filter(f => (f.fillFraction || 0) >= 0.3 && (f.fillFraction || 0) < 0.7).length,
      filled: irlFvgs.filter(f => f.kind !== "equalHighs" && f.kind !== "equalLows" && (f.fillFraction || 0) >= 0.7).length,
      fvgCount: irlFvgs.filter(f => f.kind === "FVG").length,
      equalHighCount: irlFvgs.filter(f => f.kind === "equalHighs").length,
      equalLowCount: irlFvgs.filter(f => f.kind === "equalLows").length,
    },
    erl,
    cycle,
    bias,
    entryGuidance,
    detail: [
      dealingRange?.detail || "No valid dealing range",
      `IRL: ${irlFvgs.length} objects (${irlFvgs.filter(f => f.kind === "FVG").length} FVGs, ${irlFvgs.filter(f => f.kind === "equalHighs").length} EQ-H, ${irlFvgs.filter(f => f.kind === "equalLows").length} EQ-L) — ${irlFvgs.filter(f => f.kind === "equalHighs" || f.kind === "equalLows" ? !f.swept : (f.fillFraction||0) < 0.3).length} unfilled`,
      erl.detail,
      cycle.detail,
      bias.detail,
    ].join("\n"),
  };
}

// ═══ OUTPUT ═══
const result = analyzeIRLERL(PAIR);

// Write to stages
const outDir = path.join(ROOT, "stages", "02_key_levels", "output");
fs.mkdirSync(outDir, { recursive: true });

let md = `# IRL / ERL Analysis — ${result.pair} — ${DATE}\n\n`;
md += `## Current Price: ${r5(result.currentPrice)}\n\n`;

if (result.dealingRange) {
  const dr = result.dealingRange;
  md += `## Dealing Range (${dr.source})\n`;
  md += `- **Range**: ${r5(dr.low)} — ${r5(dr.high)} (${r5(dr.range)})\n`;
  md += `- **Midpoint (Equilibrium)**: ${r5(dr.midpoint)}\n`;
  md += `- **Validation**: ${dr.validation.detail}\n`;
  md += `- **Premium Zone**: ${r5(dr.premium.high)} — ${r5(dr.premium.low)}\n`;
  md += `- **Discount Zone**: ${r5(dr.discount.high)} — ${r5(dr.discount.low)}\n\n`;
}

md += `## IRL — Internal Range Liquidity (${result.irl.count} objects: FVGs + equal highs/lows)\n`;
md += `| Status | Count |\n|--------|-------|\n`;
md += `| Unfilled (<30%) | ${result.irl.unfilled} |\n`;
md += `| Partial (30-70%) | ${result.irl.partial} |\n`;
md += `| Filled (>70%) | ${result.irl.filled} |\n\n`;

if (result.irl.fvgs.length > 0) {
  md += `| TF | Type | Price (CE) | Fill % | Distance |\n`;
  md += `|-----|------|------------|--------|----------|\n`;
  for (const fvg of result.irl.fvgs.slice(0, 8)) {
    const dist = result.currentPrice ? r2(Math.abs(fvg.midpoint - result.currentPrice) / result.currentPrice * 100) : "?";
    md += `| ${fvg.tf} | ${fvg.type} | ${r5(fvg.midpoint)} | ${fvg.fillPct}% | ${dist}% |\n`;
  }
  md += `\n`;
}

md += `## ERL — External Range Liquidity\n`;
md += `- **Dominant**: ${result.erl.dominant}\n`;
md += `- **Larger Pool**: ${result.erl.largerPool}\n`;
md += `- **Buy-Side (above range)**: ${result.erl.buySide.length} pools | ${result.erl.buySideClusters} equal-high clusters\n`;
md += `- **Sell-Side (below range)**: ${result.erl.sellSide.length} pools | ${result.erl.sellSideClusters} equal-low clusters\n\n`;

md += `## Delivery Cycle\n`;
md += `- **Position**: ${result.cycle.position}\n`;
md += `- **Phase**: ${result.cycle.phase}\n`;
md += `- **Next Target**: ${result.cycle.nextTarget}\n`;
md += `- **ERL Sweeps**: ${result.cycle.erlAboveSwept} above, ${result.cycle.erlBelowSwept} below\n\n`;

md += `## IRL/ERL Bias\n`;
md += `- **Bias**: **${result.bias.bias.toUpperCase()}** (confidence: ${r2(result.bias.confidence)})\n`;
md += `- **Reasoning**: ${result.bias.reasoning}\n\n`;

md += `## Entry Guidance\n`;
for (const g of result.entryGuidance) {
  md += `- **${g.action}** (${g.direction}) — ${g.detail}\n`;
}

const outFile = path.join(outDir, `${PAIR.toLowerCase()}_irl_erl.md`);
fs.writeFileSync(outFile, md, "utf8");
console.log(`  ✓ IRL/ERL analysis → ${outFile}`);

// JSON output for pipeline consumption
const jsonOut = path.join(ROOT, "shared", DATE, (PAIR === "XAUUSD" ? "GOLD" : PAIR), "irl_erl.json");
const jsonDir = path.dirname(jsonOut);
fs.mkdirSync(jsonDir, { recursive: true });
fs.writeFileSync(jsonOut, JSON.stringify(result, null, 2));
console.log(`  ✓ IRL/ERL JSON → ${jsonOut}`);

// Console summary
console.log(`\n═══ IRL/ERL — ${PAIR} ═══`);
console.log(`  Dealing Range: ${result.dealingRange?.detail || 'None'}`);
console.log(`  IRL: ${result.irl.count} objects (${result.irl.fvgCount} FVGs, ${result.irl.equalHighCount} EQ-H, ${result.irl.equalLowCount} EQ-L) — ${result.irl.unfilled} unfilled`);
console.log(`  ERL: ${result.erl.detail}`);
console.log(`  Cycle: ${result.cycle.position} | ${result.cycle.phase}`);
console.log(`  Bias: ${result.bias.bias.toUpperCase()} (${r2(result.bias.confidence)})`);
console.log(`  Guidance: ${result.entryGuidance[0]?.action || 'WAIT'}`);

module.exports = { analyzeIRLERL, findDealingRange, markIRL, markERL, trackCycle, deriveBias };
