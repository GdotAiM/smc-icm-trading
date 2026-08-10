// Prev-Day Lunch Carry-Forward Tool
// ─────────────────────────────────────────────────────────────────────────────
// Extracts the NY lunch inefficiency from the previous trading day and carries
// it forward as PDA levels for the current session.
//
// ICT CPI Day Video (2026):
//   "You take that inefficiency right before it takes the liquidity, carry that
//    forward into the next day. If it trades up into it, it can set the tone for
//    a shorting opportunity. Reverse it for going long."
//
// Usage:
//   node tools/prev_day_lunch_carry.cjs EURUSD
//   node tools/prev_day_lunch_carry.cjs XAUUSD --date 2026-08-07
//   node tools/prev_day_lunch_carry.cjs --all           # run for all 5 pairs
//   node tools/prev_day_lunch_carry.cjs EURUSD --json   # machine-readable output
//
// Output:
//   Writes: shared/YYYY-MM-DD/PAIR/prev_lunch_inefficiency.json
//   Prints: summary of detected inefficiency + event horizon levels
// ─────────────────────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");

// ── Config ──────────────────────────────────────────────────────────────────

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..");
const PAIRS = ["EURUSD", "GBPUSD", "XAUUSD", "NAS100", "DXY"];

// NY lunch window (ET)
const LUNCH_START_HOUR = 10;
const LUNCH_END_HOUR = 13; // window closes at 13:30

// ── Helpers ─────────────────────────────────────────────────────────────────

function r5(v) { return Number(v).toFixed(5); }
function r2(v) { return Number(v).toFixed(2); }

/** Get NY date string for a Date object (handles before-midnight rollover). */
function nyDate(d) {
  const offset = isDST(d) ? -4 : -5;
  const utcH = d.getUTCHours();
  if (utcH + offset < 0) {
    const prev = new Date(d.getTime() - 86400000);
    return prev.toISOString().split("T")[0];
  }
  return d.toISOString().split("T")[0];
}

function isDST(d) {
  const year = d.getUTCFullYear();
  const mar1 = new Date(Date.UTC(year, 2, 1));
  const mar2ndSun = new Date(Date.UTC(year, 2, (14 - mar1.getUTCDay()) % 7 + 8, 7));
  const nov1 = new Date(Date.UTC(year, 10, 1));
  const nov1stSun = new Date(Date.UTC(year, 10, (7 - nov1.getUTCDay()) % 7 + 1, 6));
  const t = d.getTime();
  return t >= mar2ndSun.getTime() && t < nov1stSun.getTime();
}

/**
 * Get the previous trading day's date (skip weekends).
 * On Monday, returns the previous Friday.
 */
function prevTradingDay(dateStr) {
  const d = new Date(dateStr + "T12:00:00-04:00");
  d.setDate(d.getDate() - 1);
  // Skip to Friday if weekend
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() - 1);
  }
  return d.toISOString().split("T")[0];
}

/**
 * Resolve the pair's directory name (XAUUSD → GOLD).
 */
function pairDir(pair) {
  if (pair === "XAUUSD") return "GOLD";
  if (pair === "DXY") return "DXY";
  return pair;
}

// ── Data loading ────────────────────────────────────────────────────────────

/**
 * Load candle JSON from shared/ directory.
 * Expected path: shared/YYYY-MM-DD/PAIR_DIR/candles_TF.json
 * Candle format: [{ time: number, open: number, high: number, low: number, close: number, volume: number }]
 */
function loadCandles(dateStr, pair, tf) {
  try {
    const dir = pairDir(pair);
    const filePath = path.join(ROOT, "shared", dateStr, dir, `candles_${tf}.json`);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    return null;
  }
}

/**
 * Load engine report JSON from shared/ directory.
 */
function loadEngine(dateStr, pair, tf) {
  try {
    const dir = pairDir(pair);
    const filePath = path.join(ROOT, "shared", dateStr, dir, `engine_${tf}.json`);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    return null;
  }
}

// ── NY time helpers (for filtering candles in the carry-forward tool) ──────

function nyOffsetFor(ts) {
  const d = new Date(ts);
  return isDST(d) ? -4 : -5;
}

function nyHourFor(ts) {
  let h = new Date(ts).getUTCHours() + nyOffsetFor(ts);
  if (h < 0) h += 24;
  if (h >= 24) h -= 24;
  return h;
}

// ── Core detection (inline version for tool use) ────────────────────────────

/**
 * Check whether a pivot was swept in the subsequent candles.
 */
function wasPivotSwept(candles, pivot, fromIdx) {
  for (let i = fromIdx + 1; i < candles.length; i++) {
    const k = candles[i];
    if (pivot.type === "high" && k.high > pivot.price && k.close <= pivot.price) {
      return { swept: true, sweepIdx: i, sweepTime: k.time, type: "BSL" };
    }
    if (pivot.type === "low" && k.low < pivot.price && k.close >= pivot.price) {
      return { swept: true, sweepIdx: i, sweepTime: k.time, type: "SSL" };
    }
  }
  return { swept: false };
}

/**
 * Simple swing pivot detection (inline, mirrors smc-engine pivot logic).
 * Lookback of 3 bars on each side.
 */
function findSwings(candles) {
  const pivots = [];
  const n = candles.length;
  for (let i = 3; i < n - 3; i++) {
    const c = candles[i];
    let isHigh = true;
    let isLow = true;
    for (let j = i - 3; j <= i + 3; j++) {
      if (j === i) continue;
      if (candles[j].high >= c.high) isHigh = false;
      if (candles[j].low <= c.low) isLow = false;
    }
    if (isHigh) pivots.push({ price: c.high, type: "high", index: i, time: c.time });
    if (isLow) pivots.push({ price: c.low, type: "low", index: i, time: c.time });
  }
  return pivots;
}

/**
 * Detect the last lunch sweep and its preceding inefficiency candle.
 */
function detectFromCandles(candles) {
  if (!candles || candles.length < 20) {
    return { found: false, summary: "Insufficient candle data (< 20 candles)" };
  }

  const n = candles.length;

  // Isolate lunch window candles (10:00-13:30 ET)
  const lunchCandles = [];
  for (let i = 0; i < n; i++) {
    const h = nyHourFor(candles[i].time);
    const m = new Date(candles[i].time).getUTCMinutes();
    const nyMins = h * 60 + m;
    if (nyMins >= 600 && nyMins <= 810) {
      lunchCandles.push({ ...candles[i], origIdx: i });
    }
  }

  if (lunchCandles.length < 5) {
    return { found: false, summary: "Insufficient NY lunch candles in prior day" };
  }

  // Find pivots and check which got swept during lunch
  const pivots = findSwings(candles);
  const lunchSweeps = [];

  for (const pivot of pivots) {
    const h = nyHourFor(pivot.time);
    const m = new Date(pivot.time).getUTCMinutes();
    const nyMins = h * 60 + m;
    if (nyMins < 600 || nyMins > 810) continue;

    const result = wasPivotSwept(candles, pivot, pivot.index);
    if (result.swept) {
      lunchSweeps.push({
        price: pivot.price,
        type: result.type,
        index: result.sweepIdx,
        time: result.sweepTime,
      });
    }
  }

  if (lunchSweeps.length === 0) {
    return { found: false, summary: "No liquidity sweep during NY lunch" };
  }

  // Pick the most recent sweep
  lunchSweeps.sort((a, b) => b.index - a.index);
  const sweep = lunchSweeps[0];

  // Find the inefficiency candle immediately before the sweep
  let inefficiency = null;
  for (let offset = 1; offset <= 3; offset++) {
    const idx = sweep.index - offset;
    if (idx < 1) break;

    const c = candles[idx];
    const body = Math.abs(c.close - c.open);

    // Must have a meaningful body (use a rough ATR estimate: avg candle range)
    const nearbyRange = candles.slice(Math.max(0, idx - 5), idx + 1)
      .reduce((sum, k) => sum + (k.high - k.low), 0) / Math.min(5, idx);
    if (nearbyRange === 0 || body / nearbyRange < 0.3) continue;

    const nextCandle = candles[idx + 1];
    const isBullish = c.close > c.open;
    const isBearish = c.close < c.open;

    // Must be opposite direction to the sweep
    if (sweep.type === "BSL" && !isBullish) continue;
    if (sweep.type === "SSL" && !isBearish) continue;

    // Check for VIB
    const vibGap = nextCandle.open - c.close;
    const hasVIB = vibGap !== 0;

    const kind = sweep.type === "BSL" ? "BISI" : "SIBI";
    const expectedReaction = kind === "BISI" ? "bearish_reversal" : "bullish_reversal";

    inefficiency = {
      top: c.high,
      bottom: c.low,
      midpoint: (c.high + c.low) / 2,
      anchor: c.close,
      kind,
      expectedReaction,
      hasVolumeImbalance: hasVIB,
      vibGap: Math.abs(vibGap),
      vibDirection: vibGap > 0 ? "up" : vibGap < 0 ? "down" : null,
      index: idx,
      time: c.time,
      atrApprox: nearbyRange,
    };
    break;
  }

  if (!inefficiency) {
    return {
      found: false,
      sweep,
      summary: `Lunch ${sweep.type} sweep found but no qualifying inefficiency before it`,
    };
  }

  return {
    found: true,
    sweep,
    inefficiency,
    summary: `${inefficiency.kind} before NY lunch ${sweep.type} sweep → ` +
      `carry ${inefficiency.top.toFixed(5)}–${inefficiency.bottom.toFixed(5)} ` +
      `(${inefficiency.expectedReaction.replace("_", " ")})`,
    lunchCandleCount: lunchCandles.length,
  };
}

// ── Event Horizon ───────────────────────────────────────────────────────────

function eventHorizon(upper, lower) {
  return (upper + lower) / 2;
}

/**
 * Compute Event Horizon levels from prior day liquidity pools.
 */
function computeEventHorizons(engineReport, currentPrice) {
  if (!engineReport || !engineReport.liquidity) return [];

  const bsl = engineReport.liquidity
    .filter(p => p.type === "BSL")
    .sort((a, b) => a.price - b.price);
  const ssl = engineReport.liquidity
    .filter(p => p.type === "SSL")
    .sort((a, b) => a.price - b.price);

  const horizons = [];
  for (const b of bsl) {
    for (const s of ssl) {
      if (b.price <= s.price) continue;
      const horizon = eventHorizon(b.price, s.price);
      const dist = currentPrice ? ((horizon - currentPrice) / currentPrice) * 100 : 0;
      horizons.push({
        horizon: r5(horizon),
        upperPool: r5(b.price),
        lowerPool: r5(s.price),
        distancePct: r2(dist),
        label: `Event Horizon: BSL ${r5(b.price)} ↔ SSL ${r5(s.price)}`,
      });
    }
  }

  // Sort by distance from current price, return top 3
  horizons.sort((a, b) => Math.abs(parseFloat(a.distancePct)) - Math.abs(parseFloat(b.distancePct)));
  return horizons.slice(0, 3);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  // Parse flags
  let targetPair = null;
  let targetDate = null;
  let jsonOutput = false;
  let runAll = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--date" && args[i + 1]) {
      targetDate = args[++i];
    } else if (args[i] === "--json") {
      jsonOutput = true;
    } else if (args[i] === "--all") {
      runAll = true;
    } else if (!args[i].startsWith("--")) {
      targetPair = args[i].toUpperCase();
    }
  }

  const today = targetDate || nyDate(new Date());

  if (runAll) {
    const results = {};
    for (const pair of PAIRS) {
      results[pair] = processPair(pair, today);
    }
    if (jsonOutput) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      for (const [pair, result] of Object.entries(results)) {
        printResult(pair, result);
      }
    }
    return;
  }

  if (!targetPair) {
    console.error("Usage: node tools/prev_day_lunch_carry.cjs <PAIR> [--date YYYY-MM-DD] [--json] [--all]");
    console.error("  PAIR: EURUSD, GBPUSD, XAUUSD, NAS100, DXY");
    console.error("  --all: process all 5 primary pairs");
    process.exit(1);
  }

  const result = processPair(targetPair, today);
  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printResult(targetPair, result);
  }
}

function processPair(pair, today) {
  const prevDate = prevTradingDay(today);

  // Load prior day's 1m candles (best for precision)
  let candles = loadCandles(prevDate, pair, "1m");

  // Fall back to 5m if 1m not available
  if (!candles || candles.length < 20) {
    candles = loadCandles(prevDate, pair, "5m");
  }

  if (!candles || candles.length < 20) {
    const result = {
      pair,
      today,
      prevDate,
      found: false,
      error: `No usable candle data for ${pair} on ${prevDate}`,
      candlesAvailable: candles ? candles.length : 0,
      sweep: null,
      inefficiency: null,
      eventHorizons: [],
    };
    saveResult(today, pair, result);
    return result;
  }

  // Run detection
  const detection = detectFromCandles(candles);

  // Load engine report for Event Horizon computation
  const engineReport = loadEngine(prevDate, pair, "15m") || loadEngine(prevDate, pair, "1h");
  const currentPrice = candles[candles.length - 1]?.close || null;
  const horizons = engineReport ? computeEventHorizons(engineReport, currentPrice) : [];

  const result = {
    pair,
    today,
    prevDate,
    found: detection.found,
    summary: detection.summary,
    candlesAnalyzed: candles.length,
    lunchCandleCount: detection.lunchCandleCount || 0,
    sweep: detection.sweep ? {
      price: r5(detection.sweep.price),
      type: detection.sweep.type,
      time: detection.sweep.time,
    } : null,
    inefficiency: detection.inefficiency ? {
      top: r5(detection.inefficiency.top),
      bottom: r5(detection.inefficiency.bottom),
      midpoint: r5(detection.inefficiency.midpoint),
      anchor: r5(detection.inefficiency.anchor),
      kind: detection.inefficiency.kind,
      expectedReaction: detection.inefficiency.expectedReaction,
      hasVolumeImbalance: detection.inefficiency.hasVolumeImbalance,
      vibGap: detection.inefficiency.vibGap ? r5(detection.inefficiency.vibGap) : "0",
      vibDirection: detection.inefficiency.vibDirection,
    } : null,
    eventHorizons: horizons,
    // Action guidance
    action: detection.found ? buildActionGuidance(detection, currentPrice) : null,
    // Date of prior day session
    prevSessionDate: prevDate,
  };

  // Save to today's directory
  saveResult(today, pair, result);

  return result;
}

function buildActionGuidance(detection, currentPrice) {
  const { inefficiency, sweep } = detection;
  if (!inefficiency) return null;

  const kind = inefficiency.kind;
  const isBISI = kind === "BISI";

  const entryZone = `${inefficiency.bottom} – ${inefficiency.top}`;
  const direction = isBISI ? "SHORT" : "LONG";
  const trigger = isBISI
    ? "Price trades UP into the BISI zone → expect bearish reversal"
    : "Price trades DOWN into the SIBI zone → expect bullish reversal";

  const sl = isBISI
    ? `Above inefficiency high: ${inefficiency.top} + buffer`
    : `Below inefficiency low: ${inefficiency.bottom} - buffer`;

  const tp1 = isBISI
    ? "Consequent encroachment (midpoint) of the inefficiency"
    : "Consequent encroachment (midpoint) of the inefficiency";

  const tp2 = "Previous day RTH opening range gap, or Event Horizon level";

  return {
    direction,
    entryZone,
    trigger,
    stopLoss: sl,
    takeProfit1: tp1,
    takeProfit2: tp2,
    note: `${kind} from ${sweep.type} sweep during NY lunch → complex reversal setup`,
  };
}

function printResult(pair, result) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Prev-Day Lunch Inefficiency — ${pair}`);
  console.log(`${"=".repeat(60)}`);
  console.log(`  Prior date:  ${result.prevDate}`);
  console.log(`  Today:       ${result.today}`);
  console.log(`  Candles:     ${result.candlesAnalyzed || 0}`);
  console.log(`${"-".repeat(60)}`);

  if (result.error) {
    console.log(`  ⚠ ERROR: ${result.error}`);
    return;
  }

  if (!result.found) {
    console.log(`  ❌ No NY lunch reversal setup detected`);
    console.log(`  ${result.summary}`);
    console.log(`  Lunch candles analyzed: ${result.lunchCandleCount}`);
    return;
  }

  console.log(`  ✅ SETUP FOUND`);
  console.log(`  ${result.summary}`);
  console.log();

  const ine = result.inefficiency;
  const sw = result.sweep;

  console.log(`  ┌─ Sweep`);
  console.log(`  │  Type:  ${sw.type} @ ${sw.price}`);
  console.log(`  ├─ Inefficiency (${ine.kind})`);
  console.log(`  │  Zone:  ${ine.bottom} – ${ine.top}`);
  console.log(`  │  Mid:   ${ine.midpoint} (CE — consequent encroachment)`);
  console.log(`  │  Anchor:${ine.anchor}`);
  if (ine.hasVolumeImbalance) {
    console.log(`  │  VIB:   ${ine.vibGap} ${ine.vibDirection} (volume imbalance)`);
  }
  console.log(`  │  Expect:${ine.expectedReaction.replace("_", " ")}`);

  if (result.action) {
    const a = result.action;
    console.log(`  ├─ Trade Plan`);
    console.log(`  │  Direction: ${a.direction}`);
    console.log(`  │  Entry:     ${a.entryZone}`);
    console.log(`  │  Trigger:   ${a.trigger}`);
    console.log(`  │  SL:        ${a.stopLoss}`);
    console.log(`  │  TP1:       ${a.takeProfit1}`);
    console.log(`  │  TP2:       ${a.takeProfit2}`);
  }

  if (result.eventHorizons && result.eventHorizons.length > 0) {
    console.log(`  ├─ Event Horizons (from prior day liquidity)`);
    for (const eh of result.eventHorizons) {
      console.log(`  │  ${eh.horizon} (${eh.distancePct}%) ← ${eh.label}`);
    }
  }

  console.log(`  └─ Saved: shared/${result.today}/${pairDir(pair)}/prev_lunch_inefficiency.json`);
  console.log();
}

function saveResult(dateStr, pair, result) {
  try {
    const dir = pairDir(pair);
    const outDir = path.join(ROOT, "shared", dateStr, dir);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    const outPath = path.join(outDir, "prev_lunch_inefficiency.json");
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2), "utf8");
  } catch (e) {
    // Don't fail on save errors — just report
    if (!process.argv.includes("--json")) {
      console.error(`  ⚠ Failed to save: ${e.message}`);
    }
  }
}

// ── Run ─────────────────────────────────────────────────────────────────────

main().catch(err => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
