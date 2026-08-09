// Po3 State Machine — Formal Power of 3 with transition tracking
// ICT: Accumulation → Manipulation → Distribution → Expansion → (cycle repeats)
// Each transition has CONFIRMATION SIGNALS from the engine.
//
// WP-3 (audit Gap 1.2): cycle phase comes from STRUCTURE ONLY via
// lib/cycle_phase.cjs — the single cycle authority. The calendar never
// fabricates a phase; UNKNOWN is a valid, honest answer.
const fs = require("fs");
const path = require("path");
const { determineState, resolveCyclePhase, TRANSITIONS, detectNextTransition } = require("./lib/cycle_phase.cjs");

const ROOT = "C:\\Users\\cash\\smc-icm-trading";
const DATE = new Date().toISOString().split("T")[0];
const ny = require("./ny_time.cjs");
const NY_HOUR = ny.getNYHour();

function r2(v) { return Number(v).toFixed(2); }
function r5(v) { return Number(v).toFixed(5); }

const PAIR = process.argv[2] || "GBPUSD";
const pairLabel = PAIR === "GOLD" ? "XAUUSD" : PAIR;
const sharedDir = path.join(ROOT, "shared", DATE, PAIR);

function loadEngine(tf) {
  try { return JSON.parse(fs.readFileSync(path.join(sharedDir, `engine_${tf.toLowerCase()}.json`), "utf8")); }
  catch { return null; }
}

// ═══════════════════════════════════════════════════════════════════
// STATE MACHINE (imported from lib/cycle_phase.cjs — sole cycle source)
// determineState, TRANSITIONS, detectNextTransition
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// Po3 TIMING GATES
// ═══════════════════════════════════════════════════════════════════

function getExpectedPo3Phase() {
  // Expected AMD phase in NEW YORK LOCAL time (DST-aware).
  const h = NY_HOUR;
  if (h >= 20) return { phase: "ACCUMULATION", session: "Asia (prev day evening)", expected: true };
  if (h >= 0 && h < 2) return { phase: "ACCUMULATION", session: "Asia (overnight)", expected: true };
  if (h >= 2 && h < 3) return { phase: "MANIPULATION", session: "London Open", expected: true };
  if (h >= 3 && h < 8) return { phase: "DISTRIBUTION", session: "London PM", expected: true };
  if (h >= 8 && h < 9) return { phase: "MANIPULATION", session: "NY Open", expected: true };
  if (h >= 9 && h < 11) return { phase: "DISTRIBUTION", session: "NY AM", expected: true };
  if (h >= 11 && h < 13) return { phase: "ACCUMULATION", session: "NY Lunch", expected: true };
  if (h >= 13 && h < 16) return { phase: "DISTRIBUTION", session: "NY PM", expected: true };
  return { phase: "ACCUMULATION", session: "NY Close / Off-hours", expected: false };
}

// ═══════════════════════════════════════════════════════════════════
// Po3 ENTRY RULES per phase
// ═══════════════════════════════════════════════════════════════════

function getPo3EntryRules(phase) {
  const rules = {
    ACCUMULATION: { entries: "NONE — Wait for manipulation sweep", models: ["Asian Range Breakout", "NWOG/NDOG"], sizeMultiplier: 0, confidenceAdj: -3, narrative: "Accumulation is the BUILD phase. No entries. Wait for the sweep that starts manipulation." },
    MANIPULATION: { entries: "AFTER sweep reversal confirmed", models: ["Turtle Soup", "Breaker Block", "Judas Swing", "Silver Bullet"], sizeMultiplier: 0.75, confidenceAdj: 0, narrative: "Manipulation is the TRAP phase. Enter on the reversal after the sweep. Turtle Soup and Breaker Block are primary." },
    DISTRIBUTION: { entries: "ON retracement to PD Array", models: ["MMXM Sell Model", "MMXM Buy Model", "OTE + Institutional OB", "Unicorn (OTE+FVG)", "SCOB"], sizeMultiplier: 1.0, confidenceAdj: +1, narrative: "Distribution is the TREND phase. Enter on retracements to OBs/FVGs. Full size." },
    EXPANSION: { entries: "NO NEW ENTRIES — Trail stops", models: ["2FVG Entry"], sizeMultiplier: 0, confidenceAdj: -2, narrative: "Expansion is the BLOW-OFF phase. Do not add. Trail stops tightly. Take partial profits." },
  };
  return rules[phase] || rules["ACCUMULATION"];
}

// ═══════════════════════════════════════════════════════════════════
// DAILY OPEN ANCHOR (Midnight NY)
// ICT: Accumulation begins at the daily open price (midnight NY time)
// ═══════════════════════════════════════════════════════════════════
function getDailyOpen(candles1h) {
  if (!candles1h || candles1h.length < 5) return null;
  // Midnight NY = 04:00 UTC (EDT) or 05:00 UTC (EST)
  const midnightCandle = candles1h.find(c => {
    return ny.getNYHourFor(c.time) === 0; // Midnight NY
  });
  if (!midnightCandle) return candles1h[0]; // Fallback to first available
  return { price: midnightCandle.open, time: midnightCandle.time, detail: `Daily Open (Midnight NY): ${r5(midnightCandle.open)}` };
}

// ═══════════════════════════════════════════════════════════════════
// ACCUMULATION RANGE DETECTION
// ICT: Tight horizontal zone near daily open — support/resistance band
// with little net movement where institutions build positions.
// ═══════════════════════════════════════════════════════════════════
function detectAccumulationRange(candles1h, dailyOpen) {
  if (!candles1h || candles1h.length < 5) return null;
  const recent = candles1h.slice(-8); // Last 8 hours
  if (recent.length < 4) return null;

  const high = Math.max(...recent.map(c => c.high));
  const low = Math.min(...recent.map(c => c.low));
  const range = high - low;
  const avgPrice = (high + low) / 2;
  const rangePct = avgPrice > 0 ? range / avgPrice * 100 : 0;

  // Accumulation = tight range (< 0.3% for forex, < 0.5% for indices/gold)
  const isTight = rangePct < 0.3;
  const nearOpen = dailyOpen ? Math.abs(avgPrice - dailyOpen.price) / dailyOpen.price * 100 < 0.2 : false;

  return {
    high, low, range, rangePct: r2(rangePct),
    isTight, nearOpen,
    active: isTight || nearOpen,
    detail: isTight
      ? `✅ Accumulation Range: ${r5(low)}–${r5(high)} (${r2(rangePct)}% — TIGHT). Institutions building positions.${nearOpen ? ' Near daily open.' : ''}`
      : `Range: ${r5(low)}–${r5(high)} (${r2(rangePct)}% — ${isTight ? 'TIGHT' : 'WIDE'}). ${nearOpen ? 'Near open but wide — accumulation may be extending.' : 'Not tight accumulation.'}`,
  };
}

// ═══════════════════════════════════════════════════════════════════
// MANIPULATION DIRECTION CHECK
// ICT: "If the breakout direction is opposite to your bias, it is the
// manipulation, not the move." Manipulation must oppose daily bias.
// ═══════════════════════════════════════════════════════════════════
function checkManipulationDirection(reports) {
  const r1h = reports["1H"] || loadEngine("1h");
  const r1d = reports["1D"] || loadEngine("1d");
  if (!r1h || !r1d) return { isManipulation: false, detail: "Insufficient data" };

  const dailyBias = r1d.structure?.bias || "neutral";
  const sweptPools = (r1h.liquidity || []).filter(p => p.swept);
  if (sweptPools.length === 0) return { isManipulation: false, detail: "No recent sweeps" };

  const bsLSwept = sweptPools.filter(p => p.type === "BSL");
  const ssLSwept = sweptPools.filter(p => p.type === "SSL");

  // Manipulation = sweep OPPOSITE to daily bias
  // Bearish bias → sweep above (BSL) = manipulation (false rally before drop)
  // Bullish bias → sweep below (SSL) = manipulation (false drop before rally)
  const manipulationSweep = (dailyBias === "bearish" && bsLSwept.length > 0) ||
                            (dailyBias === "bullish" && ssLSwept.length > 0);
  const withBiasSweep = (dailyBias === "bearish" && ssLSwept.length > 0) ||
                         (dailyBias === "bullish" && bsLSwept.length > 0);

  return {
    isManipulation: manipulationSweep,
    isWithBias: withBiasSweep,
    dailyBias,
    sweptAbove: bsLSwept.length,
    sweptBelow: ssLSwept.length,
    detail: manipulationSweep
      ? `⚠️ MANIPULATION CONFIRMED: Sweep OPPOSITE to daily ${dailyBias} bias — this is the trap. Do NOT enter with the sweep direction.`
      : withBiasSweep
        ? `✅ Sweep WITH daily ${dailyBias} bias — likely distribution, not manipulation.`
        : `No clear manipulation signal — no sweep opposing daily ${dailyBias} bias.`,
  };
}

// ── Run ────────────────────────────────────────────────────────────
const r4h = loadEngine("4h"), r1h = loadEngine("1h"), r1d = loadEngine("1d"), r15m = loadEngine("15m");
const candles1h = (() => { try { return JSON.parse(fs.readFileSync(path.join(sharedDir, "candles_1h.json"), "utf8")); } catch { return null; } })();
const dailyOpen = getDailyOpen(candles1h);
const accumRange = detectAccumulationRange(candles1h, dailyOpen);
const manipCheck = checkManipulationDirection({ "1H": r1h, "1D": r1d });
const current4h = determineState(r4h);
const current1h = determineState(r1h);
const current1d = determineState(r1d);
const resolved = resolveCyclePhase({ "4H": r4h, "1H": r1h, "1D": r1d });
const authoritativeState = resolved.phase; // structure-only (WP-3)
const nextTransition = detectNextTransition(current4h.state, r4h);
const expected = getExpectedPo3Phase();
const timingAligned = current4h.state === expected.phase;
const entryRules = getPo3EntryRules(authoritativeState);

// ── Output ──────────────────────────────────────────────────────────
const outDir = path.join(ROOT, "stages", "00_macro_context", "output");
fs.mkdirSync(outDir, { recursive: true });

const md = `# Po3 State Machine — ${pairLabel} — ${DATE}

## Current State: **${authoritativeState}** (${r2(resolved.confidence)} confidence, from ${resolved.source || 'structure'})
${resolved.reason}

## State Timeline

\`\`\`
ACCUMULATION → MANIPULATION → DISTRIBUTION → EXPANSION → (cycle repeats)
     ${authoritativeState === 'ACCUMULATION' ? '●' : '○'}            ${authoritativeState === 'MANIPULATION' ? '●' : '○'}           ${authoritativeState === 'DISTRIBUTION' ? '●' : '○'}          ${authoritativeState === 'EXPANSION' ? '●' : '○'}
\`\`\`

## Transition Status

**${nextTransition ? nextTransition.narrative : 'No transition data'}**
${nextTransition ? `- Current: ${nextTransition.from} → Next: ${nextTransition.to}` : ''}
${nextTransition ? `- Required signal: ${nextTransition.signal}` : ''}
${nextTransition ? `- Probability: ${r2(nextTransition.probability * 100)}%` : ''}

## Timing Gate Check

**Expected phase for ${expected.session} (${String(NY_HOUR).padStart(2,'0')}:00 NY): ${expected.phase}**
**Detected phase: ${authoritativeState}**
${timingAligned ? '✅ TIMING ALIGNED — Detected phase matches expected phase for this time window.' : '⚠️ TIMING DIVERGENCE — Detected phase differs from expected. Market may be ahead of or behind the typical Po3 schedule.'}

## Per-TF States

| TF | State | Confidence | Reason |
|----|-------|------------|--------|
| 1D | ${current1d.state} | ${r2(current1d.confidence)} | ${current1d.reason} |
| 4H | ${current4h.state} | ${r2(current4h.confidence)} | ${current4h.reason} |
| 1H | ${current1h.state} | ${r2(current1h.confidence)} | ${current1h.reason} |

## Entry Rules for ${authoritativeState}

**${entryRules.narrative}**

## Daily Open Anchor
${dailyOpen ? dailyOpen.detail : 'No 1H candle data available'}

## Accumulation Range
${accumRange ? accumRange.detail : 'No accumulation range data'}

## Manipulation Direction Check
${manipCheck.detail}
- Daily Bias: ${manipCheck.dailyBias.toUpperCase()}
- Swept Above (BSL): ${manipCheck.sweptAbove} | Swept Below (SSL): ${manipCheck.sweptBelow}
- Is Manipulation: ${manipCheck.isManipulation ? '⚠️ YES — do not trade with the sweep' : 'No'}
- With Bias: ${manipCheck.isWithBias ? '✅ Yes — likely distribution' : 'No'}
- Entries: ${entryRules.entries}
- Models: ${entryRules.models.join(', ')}
- Size: ×${entryRules.sizeMultiplier}
- Confidence Adjustment: ${entryRules.confidenceAdj > 0 ? '+' + entryRules.confidenceAdj : entryRules.confidenceAdj}

## Transition Confirmation Checklist

| Transition | Signal | Status |
|-----------|--------|--------|
${Object.entries(TRANSITIONS).map(([key, config]) => {
  const passed = config.check(r4h);
  const isCurrent = key.startsWith(current4h.state + "→");
  return `| ${key} | ${config.signal} | ${passed ? '✅' : '✗'} ${isCurrent ? '← CURRENT' : ''} |`;
}).join("\n")}
`;

fs.writeFileSync(path.join(outDir, `${PAIR.toLowerCase()}_po3_state.md`), md, "utf8");

// WP-3: machine-readable cycle phase for run_pair.cjs — no markdown regex.
// This is the sole structure-derived phase consumed by the decision pipeline.
const cycleJson = {
  pair: pairLabel,
  phase: authoritativeState,
  confidence: resolved.confidence,
  reason: resolved.reason,
  source: resolved.source,
  timestamp: new Date().toISOString(),
  structureOnly: true,
};
fs.writeFileSync(path.join(outDir, `${PAIR.toLowerCase()}_cycle_phase.json`), JSON.stringify(cycleJson, null, 2), "utf8");

console.log(JSON.stringify({
  pair: pairLabel,
  state: authoritativeState,
  confidence: resolved.confidence,
  nextTransition: nextTransition ? `${nextTransition.from}→${nextTransition.to} (${r2(nextTransition.probability * 100)}%)` : "none",
  timingAligned,
  expected: expected.phase,
  session: expected.session,
  entryRules: { entries: entryRules.entries, models: entryRules.models, size: entryRules.sizeMultiplier, confidenceAdj: entryRules.confidenceAdj },
}, null, 2));
