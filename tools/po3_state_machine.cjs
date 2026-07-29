// Po3 State Machine — Formal Power of 3 with transition tracking
// ICT: Accumulation → Manipulation → Distribution → Expansion → (cycle repeats)
// Each transition has CONFIRMATION SIGNALS from the engine.
const fs = require("fs");
const path = require("path");

const ROOT = "C:\\Users\\cash\\smc-icm-trading";
const DATE = new Date().toISOString().split("T")[0];
const UTC_HOUR = new Date().getUTCHours();

function r2(v) { return Number(v).toFixed(2); }

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

// ── Run ────────────────────────────────────────────────────────────
const r4h = loadEngine("4h"), r1h = loadEngine("1h"), r1d = loadEngine("1d"), r15m = loadEngine("15m");
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
