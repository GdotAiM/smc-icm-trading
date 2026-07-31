// Po3 State Machine — Formal Power of 3 with transition tracking
// ICT: Accumulation → Manipulation → Distribution → Expansion → (cycle repeats)
// Each transition has CONFIRMATION SIGNALS from the engine.
const fs = require("fs");
const path = require("path");

const ROOT = "C:\\Users\\cash\\smc-icm-trading";
const DATE = new Date().toISOString().split("T")[0];
const UTC_HOUR = new Date().getUTCHours();

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
// Po3 STATE MACHINE
// ═══════════════════════════════════════════════════════════════════

const STATES = ["ACCUMULATION", "MANIPULATION", "DISTRIBUTION", "EXPANSION"];
const TRANSITIONS = {
  "ACCUMULATION→MANIPULATION": { signal: "Sweep of range extreme (BSL above or SSL below)", check: (r) => (r.liquidity || []).some(p => p.swept) && r.structure.bias !== "neutral" },
  "MANIPULATION→DISTRIBUTION": { signal: "BOS in reversal direction + displacement > 1.0x", check: (r) => r.structure.lastEvent === "BOS" && (r.volumeDisplacement?.atrRatio || 0) > 0.8 },
  "DISTRIBUTION→EXPANSION": { signal: "ATR > 2.0x OR consecutive FVGs ≥ 3", check: (r) => (r.volumeDisplacement?.atrRatio || 0) > 2.0 || (r.fvgs || []).length >= 3 },
  "EXPANSION→ACCUMULATION": { signal: "Exhaustion (CHoCH) OR sweep of opposite extreme", check: (r) => r.structure.lastEvent === "CHoCH" || (r.liquidity || []).filter(p => p.swept).length >= 2 },
};

function determineState(report) {
  if (!report) return { state: "UNKNOWN", confidence: 0 };

  const bias = report.structure.bias;
  const event = report.structure.lastEvent || "none";
  const swept = (report.liquidity || []).filter(p => p.swept).length;
  const displabel = report.volumeDisplacement?.label || "weak";
  const dispRatio = report.volumeDisplacement?.atrRatio || 0;
  const fvgs = (report.fvgs || []).length;
  const obs = (report.orderBlocks || []).length;

  // Expansion
  if (dispRatio > 2.0 && fvgs >= 2) return { state: "EXPANSION", confidence: 0.85, reason: `Strong displacement (${r2(dispRatio)}x) + ${fvgs} FVGs — blow-off phase` };

  // Distribution
  if (event === "BOS" && bias !== "neutral" && dispRatio > 0.5)
    return { state: "DISTRIBUTION", confidence: 0.8, reason: `BOS ${bias} + displacement (${r2(dispRatio)}x) — trend is distributing` };
  if (event === "BOS" && bias !== "neutral")
    return { state: "DISTRIBUTION", confidence: 0.6, reason: `BOS ${bias} — distribution beginning` };

  // Manipulation
  if (swept > 0 && (event === "CHoCH" || displabel === "strong" || displabel === "moderate"))
    return { state: "MANIPULATION", confidence: 0.85, reason: `${swept} sweep(s) + ${event} — manipulation active` };
  if (swept > 0 && displabel !== "strong")
    return { state: "MANIPULATION", confidence: 0.7, reason: `${swept} sweep(s) detected — manipulation in progress` };

  // Accumulation
  if (bias === "neutral" || displabel === "weak")
    return { state: "ACCUMULATION", confidence: 0.7, reason: `Ranging/weak displacement — accumulation. ${obs} OBs building.` };

  return { state: "ACCUMULATION", confidence: 0.5, reason: "Default — no clear Po3 signals" };
}

function detectNextTransition(currentState, report) {
  const transitionKeys = Object.keys(TRANSITIONS).filter(k => k.startsWith(currentState + "→"));
  if (transitionKeys.length === 0) return null;

  const nextKey = transitionKeys[0];
  const nextState = nextKey.split("→")[1];
  const config = TRANSITIONS[nextKey];
  const ready = config.check(report);

  return {
    from: currentState,
    to: nextState,
    signal: config.signal,
    ready,
    probability: ready ? 0.8 : 0.2,
    narrative: ready ? `✅ Transition to ${nextState} is CONFIRMED — ${config.signal}.` : `⏳ Waiting for transition to ${nextState}. Need: ${config.signal}.`,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Po3 TIMING GATES
// ═══════════════════════════════════════════════════════════════════

function getExpectedPo3Phase() {
  if (UTC_HOUR >= 0 && UTC_HOUR < 7) return { phase: "ACCUMULATION", session: "Asia", expected: true };
  if (UTC_HOUR >= 7 && UTC_HOUR < 8.5) return { phase: "MANIPULATION", session: "London Open", expected: true };
  if (UTC_HOUR >= 8.5 && UTC_HOUR < 12) return { phase: "DISTRIBUTION", session: "London PM", expected: true };
  if (UTC_HOUR >= 12 && UTC_HOUR < 13) return { phase: "MANIPULATION", session: "NY Open", expected: true };
  if (UTC_HOUR >= 13 && UTC_HOUR < 16) return { phase: "DISTRIBUTION", session: "NY AM", expected: true };
  if (UTC_HOUR >= 16 && UTC_HOUR < 17) return { phase: "ACCUMULATION", session: "NY Lunch", expected: true };
  if (UTC_HOUR >= 17 && UTC_HOUR < 20) return { phase: "DISTRIBUTION", session: "NY PM", expected: true };
  return { phase: "ACCUMULATION", session: "Off-hours", expected: false };
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
    const h = new Date(c.time).getUTCHours();
    return h === 4 || h === 5; // Midnight NY
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
const nextTransition = detectNextTransition(current4h.state, r4h);
const expected = getExpectedPo3Phase();
const timingAligned = current4h.state === expected.phase;
const entryRules = getPo3EntryRules(current4h.state);

// ── Output ──────────────────────────────────────────────────────────
const outDir = path.join(ROOT, "stages", "00_macro_context", "output");
fs.mkdirSync(outDir, { recursive: true });

const md = `# Po3 State Machine — ${pairLabel} — ${DATE}

## Current State: **${current4h.state}** (${r2(current4h.confidence)} confidence)
**${current4h.reason}**

## State Timeline

\`\`\`
ACCUMULATION → MANIPULATION → DISTRIBUTION → EXPANSION → (cycle repeats)
     ${current4h.state === 'ACCUMULATION' ? '●' : '○'}            ${current4h.state === 'MANIPULATION' ? '●' : '○'}           ${current4h.state === 'DISTRIBUTION' ? '●' : '○'}          ${current4h.state === 'EXPANSION' ? '●' : '○'}
\`\`\`

## Transition Status

**${nextTransition ? nextTransition.narrative : 'No transition data'}**
${nextTransition ? `- Current: ${nextTransition.from} → Next: ${nextTransition.to}` : ''}
${nextTransition ? `- Required signal: ${nextTransition.signal}` : ''}
${nextTransition ? `- Probability: ${r2(nextTransition.probability * 100)}%` : ''}

## Timing Gate Check

**Expected phase for ${expected.session} (${String(UTC_HOUR).padStart(2,'0')}:00 UTC): ${expected.phase}**
**Detected phase: ${current4h.state}**
${timingAligned ? '✅ TIMING ALIGNED — Detected phase matches expected phase for this time window.' : '⚠️ TIMING DIVERGENCE — Detected phase differs from expected. Market may be ahead of or behind the typical Po3 schedule.'}

## Per-TF States

| TF | State | Confidence | Reason |
|----|-------|------------|--------|
| 1D | ${current1d.state} | ${r2(current1d.confidence)} | ${current1d.reason} |
| 4H | ${current4h.state} | ${r2(current4h.confidence)} | ${current4h.reason} |
| 1H | ${current1h.state} | ${r2(current1h.confidence)} | ${current1h.reason} |

## Entry Rules for ${current4h.state}

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

console.log(JSON.stringify({
  pair: pairLabel,
  state: current4h.state,
  confidence: current4h.confidence,
  nextTransition: nextTransition ? `${nextTransition.from}→${nextTransition.to} (${r2(nextTransition.probability * 100)}%)` : "none",
  timingAligned,
  expected: expected.phase,
  session: expected.session,
  entryRules: { entries: entryRules.entries, models: entryRules.models, size: entryRules.sizeMultiplier, confidenceAdj: entryRules.confidenceAdj },
}, null, 2));
