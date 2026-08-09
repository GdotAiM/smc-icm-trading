// tools/lib/metrics.cjs
// Single Source of Truth for market metrics (Remediation WP-1).
// Replaces the fake "ATR" (= 15% of a swing range) used across ~15 call sites
// with a real Wilder ATR, plus structural-SL helpers and candle loading.
const fs = require("fs");
const path = require("path");

// Real Wilder ATR (period-14 by default). Pure function, no I/O.
// Returns a number, or null when there isn't enough data.
function calcATR(candles, period = 14) {
  if (!Array.isArray(candles) || candles.length < 2) return null;
  const p = Math.max(2, Math.floor(period));
  const trs = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (c == null || c.high == null || c.low == null || c.high < c.low) continue;
    if (i === 0) { trs.push(c.high - c.low); continue; }
    const pc = candles[i - 1].close;
    const tr = Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
    trs.push(tr);
  }
  if (trs.length < Math.min(p, 2)) return null;
  if (trs.length < p) return trs.reduce((a, b) => a + b, 0) / trs.length;
  let atr = trs.slice(0, p).reduce((a, b) => a + b, 0) / p;
  for (let i = p; i < trs.length; i++) atr = (atr * (p - 1) + trs[i]) / p;
  return atr;
}

// Alias used by call sites that already have candles loaded.
function atrFromCandles(candles, period = 14) {
  return calcATR(candles, period);
}

// SL at structural invalidation + a real-ATR buffer (ICT rule: SL beyond the
// structural level, never at a liquidity pool). Pure.
function structuralSL({ direction, swingLevel, atr, bufferMultiple = 0.5 }) {
  if (swingLevel == null || atr == null || !isFinite(atr) || atr < 0) return null;
  const buf = atr * bufferMultiple;
  return direction === "bearish" ? swingLevel + buf : swingLevel - buf;
}

// Load raw candles for a timeframe from a session's shared directory.
// Returns an array or null (missing/corrupt). Never throws.
function loadCandles(sharedDir, tf) {
  try {
    const f = path.join(sharedDir, `candles_${tf}.json`);
    if (!fs.existsSync(f)) return null;
    const data = JSON.parse(fs.readFileSync(f, "utf8"));
    return Array.isArray(data) ? data : data.candles || null;
  } catch {
    return null;
  }
}

module.exports = { calcATR, atrFromCandles, structuralSL, loadCandles };
