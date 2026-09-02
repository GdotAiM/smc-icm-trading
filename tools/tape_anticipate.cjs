#!/usr/bin/env node
// Tape Anticipation — bridges structure + forecast + time windows into a time-aware prediction
// Shows WHERE price is likely going and WHEN key ICT windows align with forecast paths
//
// Usage:
//   node tools/tape_anticipate.cjs [PAIR]   # all pairs or single pair
//
// Output per pair:
//   - Current state: price, structure, nearest pools
//   - Forecast path: median direction, ATR-based range, confidence band
//   - Time window alignment: which upcoming ICT window overlaps with forecast reach
//   - Scenario matrix: bullish / bearish / range-bound with probability weights
//   - Tape prediction: what to watch for in next 15-30min

const fs = require("fs");
const path = require("path");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..");
const DATE = require("./ny_time.cjs").getNYDate();
const d = require("./ny_time.cjs");
const nyH = () => d.getNYHour();
const nyM = () => d.getNYMin();
const nyTS = () => `${String(nyH()).padStart(2,"0")}:${String(nyM()).padStart(2,"0")}`;
const DIR_MAP = { XAUUSD: "GOLD" };
const PAIRS = ["EURUSD", "GBPUSD", "XAUUSD", "NAS100"];
const TARGET = process.argv[2] ? [process.argv[2].toUpperCase()] : PAIRS;

function log(msg) { console.log(`[${nyTS()}] ${msg}`); }
function readJSON(file) { try { return JSON.parse(fs.readFileSync(path.join(ROOT, "shared", DATE, file), "utf8")); } catch { return null; } }

function getKZ() {
  const h = nyH(), m = nyM();
  const mins = h * 60 + m;
  const zones = [
    { name: "London KZ", start: 2*60, end: 5*60, active: mins >= 180 && mins < 300 },
    { name: "NY AM KZ", start: 8*60, end: 11*60, active: mins >= 480 && mins < 660 },
    { name: "NY Lunch", start: 11*60, end: 13*60, active: mins >= 660 && mins < 780 },
    { name: "NY PM KZ", start: 13*60, end: 16*60, active: mins >= 780 && mins < 960 },
    { name: "NY Close", start: 16*60, end: 17*60, active: mins >= 960 && mins < 1020 },
  ];
  const active = zones.find(z => z.active);
  const next = zones.filter(z => mins < z.start).sort((a,b) => a.start - b.start)[0];
  return { active: active?.name || "none", next: next ? `${next.name} @ ${String(Math.floor(next.start/60)).padStart(2,"0")}:${String(next.start%60).padStart(2,"0")}` : "end of day" };
}

function getSB() {
  const h = nyH(), m = nyM();
  const mins = h * 60 + m;
  const windows = [
    { name: "London SB", start: 3*60, end: 4*60 },
    { name: "NY AM SB", start: 10*60, end: 11*60 },
    { name: "NY PM SB", start: 14*60, end: 15*60 },
  ];
  const current = windows.find(w => mins >= w.start && mins < w.end);
  const next = windows.filter(w => mins < w.start).sort((a,b) => a.start - b.start)[0];
  return { current: current?.name || "none", next: next ? `${next.name} (${String(Math.floor(next.start/60)).padStart(2,"0")}:${String(next.start%60).padStart(2,"0")})` : "none" };
}

function anticipate(pair) {
  const dir = DIR_MAP[pair] || pair;
  const eng1m = readJSON(`${dir}/engine_1m.json`);
  const eng15m = readJSON(`${dir}/engine_15m.json`);
  const f5 = readJSON(`${dir}/forecast_5m.json`);
  const marker = readJSON(`${dir}/liquidity_marker.json`);

  if (!eng1m) return null;
  const s = eng1m.structure;
  const price = eng1m.price;
  const nearest = (eng15m?.liquidity || []).sort((a,b) => a.distance - b.distance)[0];
  const primaryDraw = marker?.drawTargets?.primary;

  // Forecast projection
  const med = f5?.median_path || [];
  const upper90 = f5?.upper_90 || [];
  const lower90 = f5?.lower_90 || f5?.lower_bound || [];
  const forecastDir = f5?.direction || "?";
  const forecastStr = f5?.strength || 0;
  const atr = f5?.volatility_atr || 0;

  // Time context
  const kz = getKZ();
  const sb = getSB();

  // Build anticipation: what does the forecast say vs where the structure says price should go?
  const forecastEnd = med.length > 0 ? med[med.length - 1] : price;
  const forecastDelta = ((forecastEnd - price) / price) * 100;
  const upperBandEnd = upper90.length > 0 ? upper90[Math.min(upper90.length - 1, 5)] : price;
  const lowerBandEnd = lower90.length > 0 ? lower90[Math.min(lower90.length - 1, 5)] : price;

  // Does forecast agree with structure bias?
  const structBias = s.bias;
  const forecastAgreesWithStructure =
    (structBias === "bullish" && forecastDir === "bullish") ||
    (structBias === "bearish" && forecastDir === "bearish") ||
    (structBias === "bullish" && Math.abs(forecastDelta) < 0.01) ||  // flat = neutral
    (structBias === "bearish" && Math.abs(forecastDelta) < 0.01);

  // Scenario weighting
  let scenarios = {};
  if (forecastAgreesWithStructure) {
    scenarios.bullish = structBias === "bullish" ? 0.6 : 0.3;
    scenarios.bearish = structBias === "bearish" ? 0.6 : 0.3;
    scenarios.range = 0.2;
  } else {
    scenarios.divergence = 0.5;  // structure says one way, forecast another
    scenarios.range = 0.3;
    scenarios[structBias === "bullish" ? "bearish" : "bullish"] = 0.2;
  }

  // Key levels to watch (from forecast bands + liquidity pools)
  const watchLevels = [];
  if (nearest) watchLevels.push({ label: `Nearest ${nearest.type}`, price: nearest.price, dist: nearest.distance });
  if (primaryDraw) watchLevels.push({ label: primaryDraw.label, price: primaryDraw.price, dist: null });
  if (upper90.length > 0) watchLevels.push({ label: "Forecast upper 90%", price: upperBandEnd, dist: null });
  if (lower90.length > 0) watchLevels.push({ label: "Forecast lower 90%", price: lowerBandEnd, dist: null });

  return {
    pair, price,
    structure: { bias: structBias, lastEvent: s.lastEvent, lastEventPrice: s.lastEventPrice },
    nearest: nearest,
    primaryDraw,
    forecast: { dir: forecastDir, deltaPct: forecastDelta.toFixed(3), strength: forecastStr, atr, bands: { upper: upperBandEnd, lower: lowerBandEnd } },
    time: { kz: kz.active, nextKZ: kz.next, sb: sb.current, nextSB: sb.next },
    scenarios,
    forecastAgreesWithStructure,
    watchLevels,
  };
}

function formatAnticipation(a) {
  const lines = [];
  lines.push(`── ${a.pair} ──`);
  lines.push(`  Price:     ${a.price} | 1m: ${a.structure.bias} ${a.structure.lastEvent} @${a.structure.lastEventPrice}`);
  if (a.nearestPool) lines.push(`  Nearest:   ${a.nearestPool.type} @ ${a.nearestPool.price.toFixed(5)} (${a.nearestPool.distance.toFixed(2)}%) ${a.nearestPool.swept ? "✓SWEPT" : "○"}`);
  if (a.primaryDraw) lines.push(`  Draw:      ${a.primaryDraw.label} @ ${a.primaryDraw.price}`);
  lines.push(`  Forecast:  ${a.forecast.dir} (Δ${a.forecast.deltaPct > 0 ? "+" : ""}${a.forecast.deltaPct}%, str=${a.forecast.strength}, ATR=${a.forecast.atr})`);
  lines.push(`  Range:     ${a.forecast.bands.lower.toFixed(5)} – ${a.forecast.bands.upper.toFixed(5)}`);
  lines.push(`  Align:     ${a.forecastAgreesWithStructure ? "✅ YES" : "⚠️ DIVERGENCE"} (structure ${a.structure.bias} vs forecast ${a.forecast.dir})`);
  lines.push(`  Time:      KZ=${a.time.kz} | Next KZ=${a.time.nextKZ.split("@")[0]} | SB=${a.time.sb} | Next SB=${a.time.nextSB}`);
  lines.push(`  Scenarios: ${Object.entries(a.scenarios).map(([k,v]) => `${k}=${Math.round(v*100)}%`).join(", ")}`);
  lines.push(`  Watch:     ${a.watchLevels.map(l => `${l.label} @ ${typeof l.price === 'number' ? l.price.toFixed(5) : l.price}`).join(" | ")}`);
  return lines.join("\n");
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log(`\n═══ TAPE ANTICIPATION — ${DATE} ${nyTS()} NY ═══`);
console.log(`═══ TIME CONTEXT ═══\n`);
const kz = getKZ(); const sb = getSB();
console.log(`  Killzone:     ${kz.active} (next: ${kz.next})`);
console.log(`  Silver Bullet: ${sb.current} (next: ${sb.next})`);
console.log(`  Equity Open:  09:30 NY (in ${Math.max(0, (9*60+30 - nyH()*60 - nyM()))} min)`);
console.log(`\n`);

for (const pair of TARGET) {
  const a = anticipate(pair);
  if (!a) { console.log(`${pair}: no data`); continue; }
  console.log(formatAnticipation(a));
  console.log("");
}

console.log(`═══════════════════════════════════════════════════════════`);
console.log(`Interpretation:`);
console.log(`  ✅ Aligned = forecast agrees with structure → higher conviction move`);
console.log(`  ⚠️  Divergence = structure + forecast disagree → consolidation expected`);
console.log(`  Watch levels = price targets to track; entry when price taps + reverts`);
console.log(`═══════════════════════════════════════════════════════════\n`);
