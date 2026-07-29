// Fractal Po3 Nesting — Power of 3 across all timeframes
// ICT: Po3 nests fractally. Weekly contains Daily contains Session contains Hourly.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = "C:\\Users\\cash\\smc-icm-trading";
const DATE = new Date().toISOString().split("T")[0];

const PAIR = process.argv[2] || "GBPUSD";
const pairLabel = PAIR === "GOLD" ? "XAUUSD" : PAIR;
const sharedDir = path.join(ROOT, "shared", DATE, PAIR);

function loadEngine(tf) {
  try { return JSON.parse(fs.readFileSync(path.join(sharedDir, `engine_${tf.toLowerCase()}.json`), "utf8")); }
  catch { return null; }
}

// Get Po3 state for each TF using the state machine
function getPo3State(tf) {
  try {
    const r = loadEngine(tf);
    if (!r) return "N/A";

    const bias = r.structure.bias;
    const event = r.structure.lastEvent || "none";
    const swept = (r.liquidity || []).filter(p => p.swept).length;
    const displabel = r.volumeDisplacement?.label || "weak";
    const dispRatio = r.volumeDisplacement?.atrRatio || 0;
    const fvgs = (r.fvgs || []).length;

    if (dispRatio > 2.0 && fvgs >= 2) return "EXPANSION";
    if (event === "BOS" && bias !== "neutral" && dispRatio > 0.5) return "DISTRIBUTION";
    if (event === "BOS" && bias !== "neutral") return "DISTRIBUTION";
    if (swept > 0 && (event === "CHoCH" || displabel !== "weak")) return "MANIPULATION";
    if (swept > 0) return "MANIPULATION";
    return "ACCUMULATION";
  } catch(e) { return "N/A"; }
}

// ═══════════════════════════════════════════════════════════════════
// FRACTAL Po3 NESTING
// ═══════════════════════════════════════════════════════════════════

const TFS = ["1W", "1D", "4H", "1H", "15m", "5m", "1m"];
const states = {};
for (const tf of TFS) states[tf] = getPo3State(tf);

// Define hierarchy levels
const macroTFs = ["1W", "1D"];
const mesoTFs = ["4H", "1H"];
const microTFs = ["15m", "5m", "1m"];

const macroState = states["1D"] || states["1W"];
const mesoState = states["4H"] || states["1H"];
const microState = states["15m"] || states["5m"];

// Check fractal nesting coherence
// Correct nesting: Micro should be AHEAD of or EQUAL to Meso, which should be AHEAD of or EQUAL to Macro
// The LOWER TF should be further along in the cycle (closer to entry)
const STATE_ORDER = { ACCUMULATION: 0, MANIPULATION: 1, DISTRIBUTION: 2, EXPANSION: 3 };
const macroIdx = STATE_ORDER[macroState] || 0;
const mesoIdx = STATE_ORDER[mesoState] || 0;
const microIdx = STATE_ORDER[microState] || 0;

const macroMesoOk = mesoIdx >= macroIdx;
const mesoMicroOk = microIdx >= mesoIdx - 1; // Allow micro to be 1 step behind (pullback)

const nestingScore =
  (macroMesoOk ? 3 : 0) +
  (mesoMicroOk ? 3 : 0) +
  (microIdx >= macroIdx ? 2 : 0) +
  (Object.values(states).filter(s => s !== "N/A" && s === macroState).length >= 4 ? 2 : 1);

const nestingMax = 10;

// Build the fractal visualization
function fractalBar(tf, state) {
  const icons = { ACCUMULATION: "▁", MANIPULATION: "▅", DISTRIBUTION: "█", EXPANSION: "▓" };
  const bar = (icons[state] || "·").repeat(state === "ACCUMULATION" ? 3 : state === "MANIPULATION" ? 4 : state === "DISTRIBUTION" ? 6 : 8);
  return `${tf.padEnd(4)} ${bar} ${state}`;
}

// Session Po3
const UTC_HOUR = new Date().getUTCHours();
let sessionPhase;
if (UTC_HOUR >= 0 && UTC_HOUR < 7) sessionPhase = "ACCUMULATION";
else if (UTC_HOUR >= 7 && UTC_HOUR < 10) sessionPhase = "MANIPULATION";
else if (UTC_HOUR >= 10 && UTC_HOUR < 16) sessionPhase = "DISTRIBUTION";
else if (UTC_HOUR >= 16 && UTC_HOUR < 21) sessionPhase = "DISTRIBUTION";
else sessionPhase = "ACCUMULATION";

const sessionAlignsWithMicro = sessionPhase === microState;

// ── Output ──────────────────────────────────────────────────────────
const outDir = path.join(ROOT, "stages", "00_macro_context", "output");
fs.mkdirSync(outDir, { recursive: true });

const md = `# Fractal Po3 Nesting — ${pairLabel} — ${DATE}

## Hierarchy

\`\`\`
MACRO (${macroState})
  └─ MESO (${mesoState})  ${macroMesoOk ? '✅ nested correctly' : '⚠️ LTF behind HTF'}
       └─ MICRO (${microState})  ${mesoMicroOk ? '✅ nested correctly' : '⚠️ LTF behind MTF'}
            └─ SESSION (${sessionPhase})  ${sessionAlignsWithMicro ? '✅ aligned' : '⚠️ session differs'}
\`\`\`

## Per-TF Po3 Map

\`\`\`
${TFS.map(tf => fractalBar(tf, states[tf])).join("\n")}
\`\`\`

## Fractal Nesting Score: **${nestingScore}/${nestingMax}**

${nestingScore >= 8 ? '✅ EXCELLENT fractal nesting — Po3 is coherent from macro to micro.' :
  nestingScore >= 6 ? '⚠️ GOOD nesting — minor misalignments. Trade with standard size.' :
  nestingScore >= 4 ? '⏳ ADEQUATE nesting — some fractal breaks. Reduce size.' :
  '❌ POOR nesting — Po3 phases are not aligned across timeframes. WAIT.'}

## Nesting Details

- **Macro-Meso**: ${macroState} → ${mesoState} — ${macroMesoOk ? '✅ LTF is at same phase or ahead of HTF (correct fractal nesting)' : '⚠️ LTF is BEHIND HTF — the lower timeframe should be further along the cycle'}
- **Meso-Micro**: ${mesoState} → ${microState} — ${mesoMicroOk ? '✅ LTF is aligned or leading (correct)' : '⚠️ LTF is behind — possible micro pullback or cycle reset'}
- **Session-Micro**: ${sessionPhase} → ${microState} — ${sessionAlignsWithMicro ? '✅ Session phase matches micro detection' : '⚠️ Session expectation differs from detected micro state'}

## Entry Implication

${nestingScore >= 8 ?
  `All Po3 layers are aligned in ${macroState}. ${macroState === 'DISTRIBUTION' ? 'ENTER with full size — trend is fractally confirmed.' : macroState === 'MANIPULATION' ? 'Wait for distribution confirmation before entering full size. Turtle Soup entries allowed.' : macroState === 'ACCUMULATION' ? 'No entries — wait for manipulation sweep. The cycle is building.' : 'Trail stops, no new entries — expansion is the blow-off phase.'}` :
  `Po3 nesting is incomplete. ${mesoIdx < macroIdx ? 'Meso is behind Macro — the daily trend hasn\'t caught up to the weekly. Wait.' : microIdx < mesoIdx ? 'Micro is behind Meso — LTF pullback. Wait for micro to resume HTF direction.' : 'Mixed signals — reduce size and tighten stops.'}`}
`;

fs.writeFileSync(path.join(outDir, `${PAIR.toLowerCase()}_po3_fractal.md`), md, "utf8");

console.log(JSON.stringify({
  pair: pairLabel,
  states,
  macro: macroState, meso: mesoState, micro: microState, session: sessionPhase,
  nestingScore, nestingMax,
  macroMesoOk, mesoMicroOk, sessionAlignsWithMicro,
  fractalCoherent: nestingScore >= 6,
  narrative: nestingScore >= 8 ? "EXCELLENT fractal Po3" : nestingScore >= 6 ? "GOOD fractal Po3" : "POOR fractal Po3",
}, null, 2));
