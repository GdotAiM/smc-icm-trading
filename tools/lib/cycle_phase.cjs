// tools/lib/cycle_phase.cjs
// Structure-only cycle phase (Remediation WP-3 / audit Gap 1.2).
//
// The PO3/AMD cycle is a DESCRIPTION of what price just did (sweeps, breaks,
// displacement) — never a prediction from the calendar. Saying "it's Tuesday so
// the market is manipulating" is like saying "it's the 3rd of the month so the
// tide is high." The tide follows the moon (price structure), not the date.
//
// This module is the SOLE cycle authority. When structure cannot decide, the
// honest answer is UNKNOWN — the caller must reduce confidence or block the
// decision, never fabricate a phase.
const STATES = ["ACCUMULATION", "MANIPULATION", "DISTRIBUTION", "EXPANSION"];

const TRANSITIONS = {
  "ACCUMULATION→MANIPULATION": { signal: "Sweep of range extreme (BSL above or SSL below)", check: (r) => (r.liquidity || []).some(p => p.swept) && r.structure.bias !== "neutral" },
  "MANIPULATION→DISTRIBUTION": { signal: "BOS in reversal direction + displacement > 1.0x", check: (r) => r.structure.lastEvent === "BOS" && (r.volumeDisplacement?.atrRatio || 0) > 0.8 },
  "DISTRIBUTION→EXPANSION": { signal: "ATR > 2.0x OR consecutive FVGs ≥ 3", check: (r) => (r.volumeDisplacement?.atrRatio || 0) > 2.0 || (r.fvgs || []).length >= 3 },
  "EXPANSION→ACCUMULATION": { signal: "Exhaustion (CHoCH) OR sweep of opposite extreme", check: (r) => r.structure.lastEvent === "CHoCH" || (r.liquidity || []).filter(p => p.swept).length >= 2 },
};

function determineState(report) {
  if (!report || !report.structure) {
    return { state: "UNKNOWN", confidence: 0, reason: "No engine report — cannot determine cycle from structure." };
  }

  const bias = report.structure.bias;
  const event = report.structure.lastEvent || "none";
  const swept = (report.liquidity || []).filter(p => p.swept).length;
  const displabel = report.volumeDisplacement?.label || "weak";
  const dispRatio = report.volumeDisplacement?.atrRatio || 0;
  const fvgs = (report.fvgs || []).length;

  // Expansion — blow-off
  if (dispRatio > 2.0 && fvgs >= 2) {
    return { state: "EXPANSION", confidence: 0.85, reason: `Strong displacement (${dispRatio.toFixed(2)}x) + ${fvgs} FVGs — blow-off phase` };
  }

  // Distribution — BOS in reversal direction + displacement
  if (event === "BOS" && bias !== "neutral" && dispRatio > 0.5) {
    return { state: "DISTRIBUTION", confidence: 0.8, reason: `BOS ${bias} + displacement (${dispRatio.toFixed(2)}x) — trend distributing` };
  }
  if (event === "BOS" && bias !== "neutral") {
    return { state: "DISTRIBUTION", confidence: 0.6, reason: `BOS ${bias} — distribution beginning` };
  }

  // Manipulation — sweep + reversal signal
  if (swept > 0 && (event === "CHoCH" || displabel === "strong" || displabel === "moderate")) {
    return { state: "MANIPULATION", confidence: 0.85, reason: `${swept} sweep(s) + ${event} — manipulation active` };
  }
  if (swept > 0) {
    return { state: "MANIPULATION", confidence: 0.7, reason: `${swept} sweep(s) — manipulation in progress` };
  }

  // Accumulation — ranging
  if (bias === "neutral" || displabel === "weak") {
    return { state: "ACCUMULATION", confidence: 0.7, reason: "Ranging/weak displacement — accumulation" };
  }

  // WP-3: NO fabricated default. Ambiguous structure → UNKNOWN.
  return {
    state: "UNKNOWN",
    confidence: 0,
    reason: "Structure is ambiguous — no decisive Po3 signal. Cycle phase UNKNOWN; no fabricated phase.",
  };
}

// Resolve a single cycle phase from engine reports across timeframes.
// Priority: 4H (primary intraday) → 1H → 1D. Returns UNKNOWN when nothing
// is decisive. `source` records which timeframe made the call.
function resolveCyclePhase(reports) {
  const order = ["4H", "1H", "1D"];
  for (const tf of order) {
    const r = reports ? (reports[tf] || reports[tf.toLowerCase()]) : null;
    if (!r) continue;
    const st = determineState(r);
    if (st.state !== "UNKNOWN") {
      return { phase: st.state, confidence: st.confidence, reason: st.reason, source: tf };
    }
  }
  const anyData = reports ? Object.keys(reports).some(k => reports[k]) : false;
  return {
    phase: "UNKNOWN",
    confidence: 0,
    reason: anyData ? "No decisive structure on 4H/1H/1D" : "No engine reports available",
    source: null,
  };
}

function detectNextTransition(currentState, report) {
  const transitionKeys = Object.keys(TRANSITIONS).filter(k => k.startsWith(currentState + "→"));
  if (transitionKeys.length === 0 || !report) return null;

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

module.exports = {
  STATES,
  TRANSITIONS,
  determineState,
  resolveCyclePhase,
  detectNextTransition,
};
