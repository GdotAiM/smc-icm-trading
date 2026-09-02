// wick_acceleration.cjs
// Post-stop-rate momentum detection & wick-body defense tracking.
//
// Based on ICT lecture 2026-08-31 (Weekly Market Outlook):
//
//   "That stop rate right there. Now we want to see acceleration below this low.
//    We just got below it now, but we don't want to see any kind of come back up
//    in here. We want to see it get real heavy and draw down into the next level."
//
//   "Wicks are wonderful little mile markers for measuring continuation and selling
//    and buying. So when you're short, you want to see your shorts stay below the
//    midpoint. And the premium sensitivity is illustrated in the upper half —
//    don't go there."
//
//   "The more time you spend in that [consolidation], the less likely it is to
//    continue going lower because we're in macro time."
//
// Two detectors:
//   1. accelerationAfterSweep — detects follow-through after a liquidity raid
//   2. wickBodyDefense — checks whether candle bodies respect a wick CE level
//
// Usage:
//   node tools/wick_acceleration.cjs <PAIR> [--tf 1m]
//   node tools/wick_acceleration.cjs EURUSD
//
// Output: JSON with sweepAnalysis + wickDefense + verdict

const fs = require("fs");
const path = require("path");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..");
const DATE = require("./ny_time.cjs").getNYDate();
const PAIR = (process.argv[2] || "EURUSD").toUpperCase();
const tf = (process.argv[3] === "--tf" && process.argv[4]) ? process.argv[4] : "1m";
const dir = PAIR === "XAUUSD" ? "GOLD" : PAIR;
const candlesFile = path.join(ROOT, "shared", DATE, dir, `candles_${tf}.json`);
const engineFile = path.join(ROOT, "shared", DATE, dir, `engine_${tf}.json`);

function r5(v) { return Number(v).toFixed(5); }
function r2(v) { return Number(v).toFixed(2); }

function loadCandles() {
  try {
    return JSON.parse(fs.readFileSync(candlesFile, "utf8"));
  } catch { return null; }
}

function loadEngine() {
  try {
    return JSON.parse(fs.readFileSync(engineFile, "utf8"));
  } catch { return null; }
}

// ─── 1. ACCELERATION AFTER SWEEP ─────────────────────────────────────────────
//
// A "stop-rate" = price wicks below/above a swing extreme then closes back inside.
// After a stop-rate, we want to SEE CONTINUATION:
//   - Bearish: body closes BELOW the swept low (not just a wick), heavy down-closes
//   - Bullish: body closes ABOVE the swept high, strong up-closes
//
// If price simply wicks through and snaps back = manipulation, no acceleration.
// If price pushes through on body closes = continuation, draw to next liquidity pool.

function accelerationAfterSweep(candles, lookback = 30) {
  if (!candles || candles.length < lookback + 5) return null;

  const recent = candles.slice(-lookback);
  const last3 = candles.slice(-3);
  const last2 = candles.slice(-2);
  const latest = candles[candles.length - 1];

  // Find the most recent swing low/high (2-bar pivot)
  let swingLow = null, swingHigh = null;
  for (let i = 1; i < recent.length - 1; i++) {
    const prev = recent[i - 1], curr = recent[i], next = recent[i + 1];
    if (curr.low < prev.low && curr.low < next.low) {
      if (!swingLow || curr.low < swingLow.price) swingLow = { ...curr, type: "low", index: candles.length - lookback + i };
    }
    if (curr.high > prev.high && curr.high > next.high) {
      if (!swingHigh || curr.high > swingHigh.price) swingHigh = { ...curr, type: "high", index: candles.length - lookback + i };
    }
  }

  // Also check absolute extremes of the lookback window
  const absLow = Math.min(...recent.map(c => c.low));
  const absHigh = Math.max(...recent.map(c => c.high));

  const results = {
    direction: null,
    sweptLevel: null,
    sweptPrice: null,
    acceleration: null,
    evidence: [],
  };

  // Check bearish acceleration (sweep of low → continuation down)
  if (swingLow || absLow) {
    const lowPrice = swingLow?.price ?? absLow;
    const wasSwept = candles.some(c => c.low < lowPrice && c.close > c.low); // wick below, close back inside
    const brokeThrough = candles.some(c => c.close < lowPrice); // body closed below

    if (wasSwept && !brokeThrough) {
      // Stop-rate: wick took stops, price snapped back → WAIT for acceleration
      results.direction = "bearish_waiting";
      results.sweptLevel = lowPrice;
      results.sweptPrice = lowPrice;
      results.acceleration = "NONE — stopped-rate, not broken. Watch for body close below.";
      results.evidence.push(`Swing low @ ${r5(lowPrice)} swept (wick), bodies stayed above. No acceleration yet.`);
    } else if (brokeThrough) {
      // True break with body close = CONFIRMED acceleration
      const downBodies = last3.filter(c => c.close < c.open).length;
      const avgBodySize = last3.reduce((s, c) => s + Math.abs(c.close - c.open), 0) / 3;
      results.direction = "bearish_confirmed";
      results.sweptLevel = lowPrice;
      results.sweptPrice = lowPrice;
      results.acceleration = `CONFIRMED — ${downBodies}/3 bodies below low, avg body ${r2(avgBodySize)}`;
      results.evidence.push(`Low @ ${r5(lowPrice)} broken by body close. ${downBodies} consecutive down-candles. Avg body ${r2(avgBodySize)}.`);
    }
  }

  // Check bullish acceleration (sweep of high → continuation up)
  if (swingHigh || absHigh) {
    const highPrice = swingHigh?.price ?? absHigh;
    const wasSwept = candles.some(c => c.high > highPrice && c.close < c.high);
    const brokeThrough = candles.some(c => c.close > highPrice);

    if (wasSwept && !brokeThrough) {
      results.direction = "bullish_waiting";
      results.sweptLevel = highPrice;
      results.sweptPrice = highPrice;
      results.acceleration = "NONE — stopped-rate above. Watch for body close above.";
      results.evidence.push(`Swing high @ ${r5(highPrice)} swept (wick), bodies stayed below. No acceleration yet.`);
    } else if (brokeThrough) {
      const upBodies = last3.filter(c => c.close > c.open).length;
      const avgBodySize = last3.reduce((s, c) => s + Math.abs(c.close - c.open), 0) / 3;
      if (!results.direction || results.direction.includes("waiting")) {
        results.direction = "bullish_confirmed";
      }
      results.sweptLevel = highPrice;
      results.sweptPrice = highPrice;
      results.acceleration = `CONFIRMED — ${upBodies}/3 bodies above high, avg body ${r2(avgBodySize)}`;
      results.evidence.push(`High @ ${r5(highPrice)} broken by body close. ${upBodies} consecutive up-candles.`);
    }
  }

  return results;
}

// ─── 2. WICK BODY DEFENSE (CE) ────────────────────────────────────────────────
//
// ICT: "The lower half is the premium sensitivity. If this is going to stay as a
// bearish fair value gap, that's its original utilization. We want to see it lose
// its ability to have discount sensitivity — wax right through that."
//
// Body defense check: after a key wick forms (rejection), bodies must stay on the
// correct side of the wick's CE (50% midpoint). Violation = narrative change.

function wickBodyDefense(candles, wickLookback = 10, ceBuffer = 0.0001) {
  if (!candles || candles.length < wickLookback + 3) return null;

  const recent = candles.slice(-wickLookback - 3);
  const latest = candles[candles.length - 1];
  const allNew = candles.slice(-5);

  // Find the most recent prominent wick (wick > 50% of range)
  let bestWick = null;
  for (let i = 0; i < recent.length - 1; i++) {
    const c = recent[i];
    const range = c.high - c.low;
    if (range === 0) continue;

    const upperWick = c.high - Math.max(c.open, c.close);
    const lowerWick = Math.min(c.open, c.close) - c.low;
    const wickRatio = Math.max(upperWick, lowerWick) / range;

    if (wickRatio >= 0.5) {
      // Prominent wick found — track the one closest to the most recent price action
      if (!bestWick || i > bestWick.index) {
        const dominant = upperWick > lowerWick ? "upper" : "lower";
        const ce = dominant === "upper"
          ? c.high - upperWick / 2
          : c.low + lowerWick / 2;
        bestWick = {
          index: candles.length - wickLookback - 3 + i,
          time: c.time,
          high: c.high,
          low: c.low,
          open: c.open,
          close: c.close,
          wickRatio,
          dominantWick: dominant,
          ce,       // consequent encroachment (50% midpoint)
          extreme: dominant === "upper" ? c.high : c.low,
          bodySide: c.close > c.open ? "bullish" : "bearish",
        };
      }
    }
  }

  if (!bestWick) return { detected: false, reason: "No prominent wick (≥50%) found in lookback" };

  // Check body defense from the wick onwards
  const postWickCandles = allNew.filter(c => c.time >= bestWick.time);
  let violations = 0;
  let defensiveBodies = 0;
  let totalChecks = 0;
  let firstViolation = null;

  for (const c of postWickCandles) {
    if (c.time <= bestWick.time) continue;
    totalChecks++;

    if (bestWick.dominantWick === "upper") {
      // Upper wick = resistance. Bodies must NOT close above CE.
      if (c.close > bestWick.ce + ceBuffer) {
        violations++;
        if (!firstViolation) firstViolation = c;
      } else {
        defensiveBodies++;
      }
    } else {
      // Lower wick = support. Bodies must NOT close below CE.
      if (c.close < bestWick.ce - ceBuffer) {
        violations++;
        if (!firstViolation) firstViolation = c;
      } else {
        defensiveBodies++;
      }
    }
  }

  const defenseRate = totalChecks > 0 ? defensiveBodies / totalChecks : 1;
  const isHolding = violations === 0;
  const isViolated = violations > 0 && defenseRate < 0.3;
  const isWeakening = violations > 0 && defenseRate >= 0.3;

  return {
    detected: true,
    wick: {
      price: bestWick.extreme,
      ce: r5(bestWick.ce),
      wickRatio: r2(bestWick.wickRatio),
      dominantWick: bestWick.dominantWick,
      time: bestWick.time,
    },
    defense: {
      holding: isHolding,
      weakening: isWeakening,
      violated: isViolated,
      defenseRate: r2(defenseRate),
      violations,
      totalChecks,
      firstViolationTime: firstViolation?.time ?? null,
      firstViolationClose: firstViolation ? r5(firstViolation.close) : null,
    },
    verdict: isHolding
      ? "BODY DEFENSE HOLDING — wick CE respected, continuation likely in wick direction"
      : isViolated
      ? "BODY DEFENSE BROKEN — bodies crossing CE = narrative changed, reverse expectation"
      : "WEAKENING — some bodies testing CE, monitor closely for break",
    actionableHint: isViolated
      ? `Body closed ${isWeakening ? 'near' : 'through'} CE ${r5(bestWick.ce)}. Expect move toward opposite liquidity draw.`
      : `Bodies staying ${bestWick.dominantWick === 'upper' ? 'below' : 'above'} CE ${r5(bestWick.ce)}. Continue watching for ${bestWick.dominantWick === 'upper' ? 'break below' : 'break above'} for acceleration signal.`,
  };
}

// ─── 3. CONSOLIDATION AFTER MACRO TIME ────────────────────────────────────────
//
// ICT: "If it consolidates like it's doing here, that's problematic... The more
// time you spend in that, the less likely it is to continue going lower."
//
// Macro time = last 10 min of the hour + first 10 min of the next hour.
// If price has been ranging (low body size, no directional bias) DURING macro,
// it suggests the algorithm is NOT committing to the expected direction.

function consolidationAfterMacro(candles) {
  const ny = require("./ny_time.cjs");
  const nyHour = ny.getNYHour();
  const nyMin = ny.getNYMin();
  const nySec = new Date().getSeconds();

  // Within 20-min macro window? (last 10 min of current hour + first 10 of next)
  const inMacroWindow = nyMin >= 50 || nyMin < 10;

  // Check last 10 candles for range-bound behavior
  const recent = candles.slice(-10);
  if (recent.length < 5) return null;

  const ranges = recent.map(c => c.high - c.low);
  const avgRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;
  const bodySizes = recent.map(c => Math.abs(c.close - c.open));
  const avgBody = bodySizes.reduce((a, b) => a + b, 0) / bodySizes.length;
  const bodyToRange = avgBody / (avgRange || 1);

  // Directional bias in recent candles
  const upCloses = recent.filter(c => c.close > c.open).length;
  const downCloses = recent.filter(c => c.close < c.open).length;
  const netDirection = upCloses > downCloses ? "bullish" : downCloses > upCloses ? "bearish" : "neutral";

  // High body-to-range ratio + neutral direction = consolidation
  const isConsolidating = bodyToRange < 0.4 && Math.abs(upCloses - downCloses) <= 1;

  return {
    inMacroWindow,
    isConsolidating,
    avgBodyToRange: r2(bodyToRange),
    directionalBias: netDirection,
    upDownSplit: `${upCloses}↑/${downCloses}↓`,
    concern: isConsolidating
      ? `Consolidation DETECTED during ${inMacroWindow ? 'macro window' : 'recent session'}. Price is NOT committing to direction. This is a WARNING sign.`
      : `Directional commitment present (${netDirection}, ${r2(bodyToRange)} body/range). Normal expansion behavior.`,
    timeContext: inMacroWindow
      ? `In macro time (${nyHour}:${String(nyMin).padStart(2, '0')}). Decision window — expect animation within next 10 min.`
      : `Outside macro window. Watching for next macro at ${nyHour}:50 or ${(nyHour + 1) % 24}:10.`,
  };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

const candles = loadCandles();
const engine = loadEngine();

if (!candles || candles.length < 30) {
  console.error(`No candle data for ${PAIR}/${tf}. Run session_start.cjs first.`);
  process.exit(1);
}

const dailyBias = engine?.structure?.bias || "neutral";
const currentPrice = candles[candles.length - 1].close;

const sweep = accelerationAfterSweep(candles);
const wickDef = wickBodyDefense(candles);
const macro = consolidationAfterMacro(candles);

const output = {
  pair: PAIR,
  timeframe: tf,
  date: DATE,
  timestamp: new Date().toISOString(),
  nyTime: (() => { const d = new Date(); const off = require("./ny_time.cjs").getNYOffset(d.getTime()); const nd = new Date(d.getTime() + off * 60000); return `${String(nd.getHours()).padStart(2,'0')}:${String(nd.getMinutes()).padStart(2,'0')}`; })(),
  currentPrice: r5(currentPrice),
  dailyBias,

  // ── Sweep/Acceleration ──
  sweepAnalysis: sweep ? {
    status: sweep.direction || "none",
    sweptLevel: sweep.sweptPrice ? r5(sweep.sweptPrice) : null,
    acceleration: sweep.acceleration,
    evidence: sweep.evidence,
    nextDraw: sweep.direction?.includes("confirmed")
      ? "Next liquidity pool in direction of acceleration"
      : "Waiting for acceleration confirmation",
  } : { status: "no_data", note: "Insufficient candles" },

  // ── Wick Body Defense ──
  wickDefense: wickDef,

  // ── Macro Consolidation ──
  macroState: macro,

  // ── Combined Verdict ──
  verdict: (() => {
    const parts = [];

    // Sweep state
    if (sweep?.direction?.includes("confirmed")) {
      parts.push({ signal: "ACCELERATION", status: "CONFIRMED", direction: sweep.direction.replace("_confirmed", "") });
    } else if (sweep?.direction?.includes("waiting")) {
      parts.push({ signal: "STOP-RATE", status: "PENDING", direction: sweep.direction.replace("_waiting", "") });
    }

    // Wick defense
    if (wickDef?.detected) {
      parts.push({ signal: "WICK_DEFENSE", status: wickDef.verdict.split("—")[0].trim() });
    }

    // Macro
    if (macro?.isConsolidating) {
      parts.push({ signal: "MACRO_STATE", status: "CONSOLIDATION_WARNING" });
    } else if (macro?.inMacroWindow && !macro.isConsolidating) {
      parts.push({ signal: "MACRO_STATE", status: "ACTIVE" });
    }

    // Overall
    const accelConfirmed = sweep?.direction?.includes("confirmed");
    const wickBroken = wickDef?.defense?.violated;
    const consolidating = macro?.isConsolidating;

    if (accelConfirmed && !wickBroken) {
      return "ACTIONABLE — Acceleration confirmed, wick defense holding. Follow the draw on liquidity.";
    } else if (wickBroken && !accelConfirmed) {
      return "REVERSAL SIGNAL — Wick defense broken. Narrative may be changing. Wait for next structure.";
    } else if (consolidating && macro?.inMacroWindow) {
      return "WATCH — In macro time but price is consolidating, not committing. Reduce position size or wait.";
    } else if (!sweep?.direction && !wickDef?.detected) {
      return "NO SIGNAL — No sweep or wick detected. Market structure unclear.";
    } else {
      return "MONITOR — Mixed signals. Track wick CE and watch for acceleration in next macro window.";
    }
  })(),
};

console.log(JSON.stringify(output, null, 2));

// no-op placeholder — time is computed inline above
const _nyTimeHelper = () => {};
