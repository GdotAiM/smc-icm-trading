// volume_imbalance.cjs
// Volume-flow momentum gauge — confirms or denies price direction via volume.
//
// Based on ICT lecture 2026-08-31:
//
//   "I don't trust my eyes. What's the close? It's no volume imbalance.
//    I'll check and make sure. But this is immediate rebalance."
//
//   "We made a lower low two times... booked 55 to 60 handles from that
//    volume imbalance. And that was the premise that we were watching price."
//
//   "Whenever you see that [immediate rebalance], that is one of my strongest
//    PD rays because it's immediate feedback."
//
// Three gauges:
//   1. volumeImbalance — up-volume vs down-volume ratio
//   2. immediateRebalance — does price revert within 1-2 candles after a move?
//   3. volumeEnergy — ATR-normalized average body size (proxy for volume intensity)
//
// Usage:
//   node tools/volume_imbalance.cjs <PAIR> [--tf 1m]
//   node tools/volume_imbalance.cjs EURUSD

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
  try { return JSON.parse(fs.readFileSync(candlesFile, "utf8")); }
  catch { return null; }
}

function loadEngine() {
  try { return JSON.parse(fs.readFileSync(engineFile, "utf8")); }
  catch { return null; }
}

// ─── 1. VOLUME IMBALANCE ──────────────────────────────────────────────────────
//
// Up-volume = sum of bodies where close > open (buying pressure).
// Down-volume = sum of bodies where close < open (selling pressure).
// Ratio > 1.3 = bullish imbalance. Ratio < 0.7 = bearish imbalance.
// Between 0.7–1.3 = balanced (no clear momentum).
//
// "Immediate rebalance" = price moves but immediately reverses (imbalance flips)
// → the move had no institutional backing, just retail noise.

function volumeImbalance(candles, window = 10) {
  if (!candles || candles.length < window + 2) return null;

  const recent = candles.slice(-window);
  let upVol = 0, downVol = 0;

  for (const c of recent) {
    const body = Math.abs(c.close - c.open);
    if (c.close > c.open) upVol += body;
    else downVol += body;
  }

  const total = upVol + downVol;
  const ratio = total > 0 ? upVol / downVol : 1;
  const upPct = total > 0 ? (upVol / total) * 100 : 50;

  let status = "balanced";
  if (ratio >= 1.3) status = "bullish_imbalance";
  else if (ratio <= 0.7) status = "bearish_imbalance";

  return {
    upVolume: r2(upVol),
    downVolume: r2(downVol),
    ratio: r2(ratio),
    upPct,
    status,
    interpretation: status === "bullish_imbalance"
      ? `Bullish volume imbalance (${r2(ratio)}:1 up/down). Buying pressure confirmed. Direction supported.`
      : status === "bearish_imbalance"
      ? `Bearish volume imbalance (${r2(ratio)}:1 up/down). Selling pressure confirmed. Direction supported.`
      : `Balanced volume (${r2(ratio)}:1). No clear institutional commitment. Wait for direction.`,
  };
}

// ─── 2. IMMEDIATE REBALANCE ───────────────────────────────────────────────────
//
// "I don't trust my eyes. What's the close? It's no volume imbalance. I'll check
// and make sure. But this is immediate rebalance. It can happen the next candle
// as it forms or the very next one. So there's no fair value gap there."
//
// Immediate rebalance = a candle makes a big move in one direction, then the
// NEXT candle reverses it completely. This means the initial move had NO follow-through.

function immediateRebalance(candles, window = 5) {
  if (!candles || candles.length < window + 1) return null;

  const recent = candles.slice(-window - 1);
  let rebalances = [];

  for (let i = 0; i < recent.length - 1; i++) {
    const c = recent[i];
    const n = recent[i + 1];
    const cRange = c.high - c.low;
    const nRange = n.high - n.low;

    if (cRange === 0 || nRange === 0) continue;

    // Big move up followed by full reversal down
    const bigUpMove = c.close - c.open > cRange * 0.6;
    const fullReversalDown = n.close < c.open && n.close < (c.low + c.high) / 2;

    // Big move down followed by full reversal up
    const bigDownMove = c.open - c.close > cRange * 0.6;
    const fullReversalUp = n.close > c.close && n.close > (c.low + c.high) / 2;

    if (bigUpMove && fullReversalDown) {
      rebalances.push({
        direction: "up_then_down",
        candleTime: c.time,
        candleClose: r5(c.close),
        reversalClose: r5(n.close),
        magnitude: r2(Math.abs(c.close - n.close)),
        note: "Failed breakout — immediate rejection",
      });
    } else if (bigDownMove && fullReversalUp) {
      rebalances.push({
        direction: "down_then_up",
        candleTime: c.time,
        candleClose: r5(c.close),
        reversalClose: r5(n.close),
        magnitude: r2(Math.abs(c.close - n.close)),
        note: "Failed breakdown — immediate bounce",
      });
    }
  }

  const latest = candles[candles.length - 1];
  const latestRange = latest.high - latest.low;
  const latestBody = Math.abs(latest.close - latest.open);

  return {
    count: rebalances.length,
    recent: rebalances.slice(-3),
    lastMove: {
      direction: latest.close > latest.open ? "up" : "down",
      bodyToRange: r2(latestBody / (latestRange || 1)),
      close: r5(latest.close),
    },
    implication: rebalances.length > 0
      ? `⚠️ ${rebalances.length} immediate rebalance(s) detected. Moves are being rejected — NO institutional follow-through. Do not chase.`
      : `No immediate rebalance. Directional moves are being held. Continuation more likely.`,
  };
}

// ─── 3. VOLUME ENERGY (ATR-Normalized) ────────────────────────────────────────
//
// Proxy for volume intensity using body size relative to ATR.
// High energy = large bodies relative to ATR = strong institutional participation.
// Low energy = small bodies = retail chop, no conviction.

function volumeEnergy(candles, atrPeriod = 14) {
  if (!candles || candles.length < atrPeriod + 5) return null;

  // Calculate ATR
  const trs = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (i === 0) { trs.push(c.high - c.low); continue; }
    const pc = candles[i - 1].close;
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc)));
  }
  const atr = trs.length >= atrPeriod
    ? trs.slice(-atrPeriod).reduce((a, b) => a + b, 0) / atrPeriod
    : trs.reduce((a, b) => a + b, 0) / trs.length;

  const recent = candles.slice(-10);
  const avgBody = recent.reduce((s, c) => s + Math.abs(c.close - c.open), 0) / recent.length;
  const energy = atr > 0 ? avgBody / atr : 0;

  let grade = "chop";
  if (energy >= 1.0) grade = "strong";
  else if (energy >= 0.5) grade = "moderate";
  else if (energy >= 0.3) grade = "weak";

  return {
    atr: r5(atr),
    avgBody: r5(avgBody),
    energyRatio: r2(energy),
    grade,
    interpretation: grade === "strong"
      ? `High energy (${r2(energy)}× ATR). Institutional participation confirmed. Trust the direction.`
      : grade === "moderate"
      ? `Moderate energy (${r2(energy)}× ATR). Some conviction, but not overwhelming. Watch for confirmation.`
      : `Low energy (${r2(energy)}× ATR). Retail chop. Direction lacks institutional backing. Avoid chasing.`,
  };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

const candles = loadCandles();
const engine = loadEngine();

if (!candles || candles.length < 15) {
  console.error(`No candle data for ${PAIR}/${tf}. Run session_start.cjs first.`);
  process.exit(1);
}

const latest = candles[candles.length - 1];
const dailyBias = engine?.structure?.bias || "neutral";

const vol = volumeImbalance(candles);
const rebal = immediateRebalance(candles);
const energy = volumeEnergy(candles);

// Combined signal: only trust direction when BOTH volume imbalance AND energy agree
const volDir = vol?.status === "bullish_imbalance" ? "bullish" : vol?.status === "bearish_imbalance" ? "bearish" : null;
const energyDir = energy?.grade === "strong" ? (vol?.status === "bullish_imbalance" ? "bullish" : vol?.status === "bearish_imbalance" ? "bearish" : "strong_neutral") : "weak";

let overallSignal = "UNCERTAIN";
if (volDir && energy?.grade !== "chop") {
  overallSignal = volDir.toUpperCase();
} else if (rebal?.count > 0) {
  overallSignal = "REJECTED";
}

const output = {
  pair: PAIR,
  timeframe: tf,
  date: DATE,
  timestamp: new Date().toISOString(),
  currentPrice: r5(latest.close),
  dailyBias,

  volumeImbalance: vol,
  immediateRebalance: rebal,
  volumeEnergy: energy,

  signal: overallSignal,

  combinedVerdict: (() => {
    if (overallSignal === "BULLISH") return "Volume confirms UP direction. Institutions are buying. Follow the draw on liquidity above.";
    if (overallSignal === "BEARISH") return "Volume confirms DOWN direction. Institutions are selling. Follow the draw on liquidity below.";
    if (overallSignal === "REJECTED") return "Moves being immediately reversed. No institutional commitment. Wait for clean imbalance + energy alignment.";
    if (overallSignal === "UNCERTAIN") return "Volume balanced and/or energy weak. No clear directional signal. Monitor for next macro time window.";
    return "Check volume_imbalance and volume_energy outputs for details.";
  })(),

  actionHint: (() => {
    if (rebal?.count > 0) return "Do NOT chase — immediate rebalances mean every move is being flipped. Wait for sustained body closes.";
    if (energy?.grade === "strong" && vol?.status === "bullish_imbalance") return "Strong buy pressure. Watch for pullback to FVG/OB for entry.";
    if (energy?.grade === "strong" && vol?.status === "bearish_imbalance") return "Strong sell pressure. Watch for retest of breaker block for short entry.";
    if (energy?.grade === "chop") return "Low energy environment. Reduce size ×0.4 or skip. Wait for displacement.";
    return "Mixed signals. Use wick_acceleration.cjs to check if stop-rates are forming.";
  })(),
};

console.log(JSON.stringify(output, null, 2));
