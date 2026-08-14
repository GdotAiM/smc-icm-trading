// tools/regime_detector.cjs
// Statistical regime/anomaly detection over raw OHLCV — identifies the CURRENT
// STATE of price (regime + volatility + anomaly flags), never predicts the path.
//
//   node tools/regime_detector.cjs <PAIR> [--tf 5m] [--date YYYY-MM-DD]
//   node tools/regime_detector.cjs --candles <file.json>
//
// Output: shared/<DATE>/<PAIR>/regime_{tf}.json
//   regime:   TRENDING_UP | TRENDING_DOWN | RANGING | COMPRESSED | UNKNOWN
//   volatility: LOW | NORMAL | HIGH (ATR percentile vs trailing window)
//   anomalies: [{ kind: SPREAD_EXPLOSION|VOLUME_SPIKE|WICK_GAP|TAIL_EXTREME, ... }]
//
// This is the "identify the state, not predict the path" layer — a deterministic
// statistical v1. Later it can feed a learned classifier, but it stands alone
// today with zero training data.
"use strict";

const fs = require("fs");
const path = require("path");
const ROOT = process.env.WORKSPACE_ROOT || "C:\\Users\\cash\\smc-icm-trading";

function detectRegime(candles, opts = {}) {
  const { lookback = 120, atrWindow = 20, atrRefWindow = 120 } = opts;
  if (!Array.isArray(candles) || candles.length < Math.max(atrWindow + 2, 30)) {
    return { error: "insufficient candles", candles: candles ? candles.length : 0 };
  }
  const c = candles.slice(-lookback).map(x => {
    if (Array.isArray(x)) return { t: x[0], o: x[1], h: x[2], l: x[3], c: x[4], v: x[5] || 0 };
    return { t: x.time, o: x.open, h: x.high, l: x.low, c: x.close, v: x.volume || 0 };
  });
  const closes = c.map(x => x.c);
  const highs = c.map(x => x.h);
  const lows = c.map(x => x.l);
  const vols = c.map(x => x.v);

  // ── ATR(20) on the trailing window ──
  const tr = [];
  for (let i = 1; i < c.length; i++) {
    tr.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    ));
  }
  const atr = tr.slice(-atrWindow).reduce((a, b) => a + b, 0) / atrWindow;
  const atrSeries = [];
  for (let i = atrWindow; i <= tr.length; i++) {
    atrSeries.push(tr.slice(i - atrWindow, i).reduce((a, b) => a + b, 0) / atrWindow);
  }

  // ── Volatility regime: current ATR vs distribution of trailing ATR values ──
  let volatility = "NORMAL";
  if (atrSeries.length >= 20) {
    const ref = atrSeries.slice(-atrRefWindow);
    const sorted = [...ref].sort((a, b) => a - b);
    const p80 = sorted[Math.floor(sorted.length * 0.8)];
    const p30 = sorted[Math.floor(sorted.length * 0.3)];
    if (atr > p80 * 1.15) volatility = "HIGH";
    else if (atr < p30 * 0.85) volatility = "COMPRESSED";
  }

  // ── Trend regime: linear regression slope on closes + range position ──
  const n = closes.length;
  const xMean = (n - 1) / 2;
  const yMean = closes.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (closes[i] - yMean);
    den += (i - xMean) * (i - xMean);
  }
  const slope = num / den;                    // price change per bar
  const normSlope = den ? slope / (atr || 1) : 0;  // in ATR units per bar
  const priceSpan = Math.max(...closes) - Math.min(...closes);

  let regime = "UNKNOWN";
  const strong = Math.abs(normSlope) > 0.25;  // ~1 ATR per 4 bars
  const wide = priceSpan > atr * 3;
  if (!wide) {
    regime = "COMPRESSED";
  } else if (strong && slope > 0) {
    regime = "TRENDING_UP";
  } else if (strong && slope < 0) {
    regime = "TRENDING_DOWN";
  } else if (priceSpan <= atr * 6) {
    regime = "RANGING";
  } else {
    regime = "TRENDING_UP"; // wide + mild slope → still directional, weak label
    if (slope < 0) regime = "TRENDING_DOWN";
  }

  // ── Anomalies ──
  const anomalies = [];
  const avgVol = vols.length ? vols.reduce((a, b) => a + b, 0) / vols.length : 0;
  const last = c[c.length - 1];
  const prev = c[c.length - 2];

  if (avgVol > 0 && (last.v || 0) > avgVol * 3) {
    anomalies.push({ kind: "VOLUME_SPIKE", bar: c.length - 1, volume: last.v, avg: avgVol, ratio: last.v / avgVol });
  }
  if (prev) {
    const gap = Math.abs(last.o - prev.c);  // open vs prev close
    if (gap > atr * 1.5) {
      anomalies.push({ kind: "GAP", bar: c.length - 1, gapPct: gap / (prev.c || 1) * 100 });
    }
    const body = Math.abs(last.c - last.o);
    const wick = Math.max(last.h, last.l) - Math.min(last.h, last.l) - body;
    if (wick > body * 2.5 && body > 0) {
      anomalies.push({ kind: "TAIL_EXTREME", bar: c.length - 1, tailRatio: wick / body });
    }
  }

  // ── Today's realized range vs trailing (delivery anomaly) ──
  const lastRange = highs[highs.length - 1] - lows[lows.length - 1];
  const avgRange = tr.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, tr.length) || atr;
  if (avgRange > 0 && lastRange > avgRange * 2.2) {
    anomalies.push({ kind: "SPREAD_EXPLOSION", range: lastRange, avg: avgRange, ratio: lastRange / avgRange });
  }

  return {
    bars: c.length,
    regime,
    volatility,
    atr,
    slopePerBar: slope,
    normSlope,
    rangeVsAtr: priceSpan / (atr || 1),
    lastBar: { time: last.t, open: last.o, high: last.h, low: last.l, close: last.c, volume: last.v },
    anomalies,
    summary: [
      regime === "COMPRESSED" ? "Price compressed — awaiting expansion. OTE/range models may be premature." :
      regime.startsWith("TRENDING") ? `Price ${regime === "TRENDING_UP" ? "advancing" : "declining"} — trade WITH the direction; counter-trend models are suspect.` :
      "Price ranging — sweep/reversal models (Turtle Soup, Judas) favored; directional models weakened.",
      volatility === "HIGH" ? "High volatility — SL buffers and ATR sizing are wide; chase risk elevated." :
      volatility === "COMPRESSED" ? "Low volatility — expect expansion soon; tight models (SB scalp) favored." :
      "Normal volatility regime.",
      anomalies.length ? `Anomalies: ${anomalies.map(a => a.kind).join(", ")}` : "No anomalies in the trailing window.",
    ],
  };
}

function loadCandles(pair, date, tf) {
  const pairDir = pair === "XAUUSD" ? "GOLD" : pair;
  const file = path.join(ROOT, "shared", date, pairDir, `candles_${tf}.json`);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

function runRegimeDetector(pair, date, tf) {
  const candles = loadCandles(pair, date, tf);
  if (!candles) return { error: `no candles_${tf}.json for ${pair} ${date}` };
  const result = detectRegime(candles);
  const sharedDir = path.join(ROOT, "shared", date, pair === "XAUUSD" ? "GOLD" : pair);
  fs.mkdirSync(sharedDir, { recursive: true });
  const outPath = path.join(sharedDir, `regime_${tf}.json`);
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  return result;
}

module.exports = { detectRegime, runRegimeDetector };

// ── CLI ──────────────────────────────────────────────────────────────────
if (require.main === module) {
  const args = process.argv.slice(2);
  const candleFileArg = args.indexOf("--candles");
  if (candleFileArg >= 0) {
    const raw = JSON.parse(fs.readFileSync(args[candleFileArg + 1], "utf8"));
    console.log(JSON.stringify(detectRegime(raw), null, 2));
    process.exit(0);
  }
  const PAIR = (args[0] || "").toUpperCase();
  const tfArg = args.indexOf("--tf");
  const tf = tfArg >= 0 ? args[tfArg + 1] : "5m";
  const dateArg = args.indexOf("--date");
  const DATE = dateArg >= 0 ? args[dateArg + 1] : new Date().toISOString().slice(0, 10);
  if (!PAIR) {
    console.log("Usage: node tools/regime_detector.cjs <PAIR> [--tf 5m] [--date YYYY-MM-DD]");
    process.exit(1);
  }
  const out = runRegimeDetector(PAIR, DATE, tf);
  if (out.error) {
    console.error(out.error);
    process.exit(1);
  }
  console.log(`Regime ${PAIR} ${tf} (${DATE}): ${out.regime} | volatility ${out.volatility} | ATR ${out.atr.toFixed(5)}`);
  for (const s of out.summary) console.log(`  · ${s}`);
  console.log(`  → ${path.join(ROOT, "shared", DATE, PAIR === "XAUUSD" ? "GOLD" : PAIR, `regime_${tf}.json`)}`);
}