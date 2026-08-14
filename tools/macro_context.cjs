// Stage 00 — Macro Context & Cycle Intelligence Engine
// Detects market cycle phase, day characteristics, and generates cycle-aware model filters.
const fs = require("fs");
const path = require("path");

const ROOT = "C:\\Users\\cash\\smc-icm-trading";
const now = new Date();
const DATE = require("./ny_time.cjs").getNYDate();
const { getNYHour, getNYDay, getNYSession, isInKillzoneNY, isInSilverBulletNY, NY_DAYS } = require("./ny_time.cjs");
const NY_HOUR = getNYHour();
const DAY_NUM = getNYDay();
const EFFECTIVE_DAY = DAY_NUM === 0 ? 1 : DAY_NUM;
const DAY = NY_DAYS[EFFECTIVE_DAY];
const WEEK_OF_MONTH = Math.ceil(now.getUTCDate() / 7);

function r2(v) { return Number(v).toFixed(2); }
function r5(v) { return Number(v).toFixed(5); }

// ── Day Profile ──────────────────────────────────────────────────────────
const DAY_PROFILES = {
  Monday:    { ictName: "Range Set Day", character: "Weekly range established. Often range-bound first half, manipulation second half.", risk: "Low", weight: 0.8, bestModels: ["Asian Range", "NWOG/NDOG", "Judas Swing"], avoidModels: ["2FVG", "MMXM (early)"], note: "Don't trade first 2h of London. Let the weekly range establish." },
  Tuesday:   { ictName: "Continuation Day", character: "Monday's range extends or reverses. Turnaround Tuesday.", risk: "Medium", weight: 1.0, bestModels: ["Breaker Block", "OTE + OB", "Silver Bullet"], avoidModels: [], note: "If Monday was range-bound, Tuesday is the expansion day." },
  Wednesday: { ictName: "Reversal Day", character: "Classic ICT reversal. Often marks weekly high or low.", risk: "Medium-High", weight: 1.2, bestModels: ["Turtle Soup", "Judas Swing", "Silver Bullet (NY AM)"], avoidModels: ["2FVG (early)"], note: "Highest probability reversal day. Watch manipulation then expansion." },
  Thursday:  { ictName: "Expansion Day", character: "Strongest trending day. Post-reversal continuation.", risk: "High", weight: 1.3, bestModels: ["MMXM", "Unicorn", "SCOB", "2FVG", "OTE + OB"], avoidModels: ["Asian Range", "NWOG"], note: "Best day for trend trades. Highest win rate for MMXM." },
  Friday:    { ictName: "Position Squaring", character: "Profit-taking dominates. Thursday's move often retraces.", risk: "Low", weight: 0.6, bestModels: ["Silver Bullet (AM only)"], avoidModels: ["MMXM (swing)", "2FVG (swing)", "Turtle Soup (swing)"], note: "Close all positions by NY close. No new swing trades." },
  Saturday:  { ictName: "Weekend", character: "Market closed.", risk: "None", weight: 0, bestModels: [], avoidModels: ["ALL"], note: "Market closed. Review and journal." },
  Sunday:    { ictName: "Weekend/Open", character: "Market closed or opening.", risk: "None", weight: 0, bestModels: [], avoidModels: ["ALL"], note: "Market closed or thin. Prep for the week." },
};

const profile = DAY_PROFILES[DAY] || DAY_PROFILES["Monday"];
// Override Sunday with Monday behavior for trading context
if (DAY_NUM === 0) { const mp = DAY_PROFILES["Monday"]; profile.weight = mp.weight; profile.ictName = "Monday (effective)"; profile.character = mp.character; profile.risk = mp.risk; profile.bestModels = mp.bestModels; profile.avoidModels = mp.avoidModels; }

// ── Session ──────────────────────────────────────────────────────────────
const nySession = getNYSession();
const session = nySession.label;
const sessionChar = nySession.character;
const inKillzone = isInKillzoneNY();
const sbActive = isInSilverBulletNY().active;

// ── Load Engine Reports ──────────────────────────────────────────────────
function loadEngine(pair, tf) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, "shared", DATE, pair, `engine_${tf}.json`), "utf8"));
  } catch { return null; }
}

// Use EURUSD as anchor for cycle detection, fallback to any available pair
let r1w = loadEngine("EURUSD", "1w");
let r1d = loadEngine("EURUSD", "1d");
let r4h = loadEngine("EURUSD", "4h");
if (!r1w) r1w = loadEngine("GBPUSD", "1w");
if (!r1d) r1d = loadEngine("GBPUSD", "1d");
if (!r4h) r4h = loadEngine("GBPUSD", "4h");

// ── Cycle Phase Detection ────────────────────────────────────────────────
// WP-3 (audit Gap 1.2): cycle phase comes from STRUCTURE ONLY via
// lib/cycle_phase.cjs — the single cycle authority. No calendar heuristic.
const { resolveCyclePhase } = require("./lib/cycle_phase.cjs");

function detectCycle(r1w, r1d, r4h) {
  if (!r1w && !r1d && !r4h) return { phase: "UNKNOWN", confidence: 0, narrative: "Engine reports not available" };

  const resolved = resolveCyclePhase({ "4H": r4h, "1D": r1d, "1W": r1w });
  return {
    phase: resolved.phase,
    confidence: resolved.confidence,
    narrative: resolved.reason || "Cycle phase derived from structure.",
    source: resolved.source,
  };
}

const cycle = detectCycle(r1w, r1d, r4h);

// ── Liquidity State Analysis (Macro Layer) ───────────────────────────────
function analyzeLiquidityMacro(report, label) {
  if (!report || !report.liquidity) return { drawDirection: "NONE", drawStrength: 0, activePools: [], state: "UNKNOWN", summary: "No data" };

  const pools = report.liquidity;
  const price = report.price;
  const classified = pools.map(p => {
    const distPct = Math.abs((p.price - price) / price * 100);
    const ageBars = p.ageBars || 50;
    let state;
    if (p.swept) {
      state = ageBars < 10 ? "JUST_SWEPT" : ageBars < 30 ? "SWEPT_RECENT" : "SWEPT_OLD";
    } else if (distPct < 0.3) {
      state = "TARGETED";
    } else if (distPct < 1.0) {
      state = "APPROACHING";
    } else if ((p.strength || p.touches || 1) >= 3) {
      state = "BUILDING";
    } else if (ageBars > 100) {
      state = "DRIED_UP";
    } else {
      state = "RESTING";
    }
    return { price: p.price, type: p.type, state, touches: p.strength || p.touches || 1, score: p.score || 0, distPct, ageBars, swept: p.swept, isEngineered: (p.strength || p.touches || 1) >= 2 };
  });

  const activeUp = classified.filter(p => p.type === "BSL" && ["TARGETED","APPROACHING","BUILDING"].includes(p.state));
  const activeDown = classified.filter(p => p.type === "SSL" && ["TARGETED","APPROACHING","BUILDING"].includes(p.state));
  const upStr = activeUp.reduce((s, p) => s + p.score, 0);
  const downStr = activeDown.reduce((s, p) => s + p.score, 0);
  const draw = upStr > downStr * 1.3 ? "UP" : downStr > upStr * 1.3 ? "DOWN" : upStr > 0 && downStr > 0 ? "BOTH" : "NONE";
  const drawStr = Math.max(upStr, downStr);
  const justSwept = classified.filter(p => p.state === "JUST_SWEPT" || p.state === "SWEPT_RECENT");
  const engineered = classified.filter(p => p.isEngineered && !p.swept);

  let stateSummary;
  if (justSwept.length > 0) stateSummary = `POST-SWEEP — ${justSwept.length} pool(s) recently swept. Price should move away from swept levels.`;
  else if (activeUp.length > 0 && activeDown.length > 0) stateSummary = `BOTH SIDES ACTIVE — ${activeUp.length} BSL above, ${activeDown.length} SSL below. Price at decision point.`;
  else if (draw === "UP") stateSummary = `DRAWING UP — ${activeUp.length} BSL pool(s) pulling price higher`;
  else if (draw === "DOWN") stateSummary = `DRAWING DOWN — ${activeDown.length} SSL pool(s) pulling price lower`;
  else if (engineered.length >= 2) stateSummary = `BUILDING — ${engineered.length} engineered pools forming (EQH/EQL)`;
  else stateSummary = `RESTING — No active draw. Wait for pools to build.`;

  return { drawDirection: draw, drawStrength: drawStr, activeUp, activeDown, justSwept, engineered, state: justSwept.length > 0 ? "POST_SWEEP" : draw === "NONE" ? "RESTING" : "DRAWING", summary: stateSummary };
}

const liqMacro1d = analyzeLiquidityMacro(r1d, "1D");
const liqMacro4h = analyzeLiquidityMacro(r4h, "4H");

// Macro-Micro liquidity coherence: does HTF liquidity draw align with detected cycle?
const liquidityNarrative = (() => {
  const draw = liqMacro1d.drawDirection;
  const phase = cycle.phase;
  if (phase === "MANIPULATION" && (liqMacro1d.justSwept || []).length > 0) {
    return "Liquidity confirms MANIPULATION — sweep detected on HTF. This is the inducement. Price should reverse from here.";
  }
  if (phase === "DISTRIBUTION" && draw !== "NONE") {
    return `Liquidity aligned with DISTRIBUTION — draw is ${draw}. Price being pulled toward unfilled pools in the ${draw.toLowerCase()} direction.`;
  }
  if (phase === "ACCUMULATION" && (liqMacro1d.engineered || []).length >= 2) {
    return `Liquidity confirms ACCUMULATION — ${(liqMacro1d.engineered || []).length} engineered pools building. Institutions accumulating positions.`;
  }
  if (phase === "EXPANSION" && (liqMacro1d.justSwept || []).length === 0) {
    return "Liquidity confirms EXPANSION — no recent sweeps. Price running away from pools. Trail stops, don't add.";
  }
  return `Liquidity state: ${liqMacro1d.summary}`;
})();

// ── Model-Cycle Mapping ──────────────────────────────────────────────────
const MODEL_CYCLE_MAP = {
  "2022 Model (MMXM)":       { ACCUMULATION: 0, MANIPULATION: 2, DISTRIBUTION: 3, EXPANSION: 2 },
  "Silver Bullet":           { ACCUMULATION: 0, MANIPULATION: 3, DISTRIBUTION: 2, EXPANSION: 3 },
  "OTE + Institutional OB":  { ACCUMULATION: 0, MANIPULATION: 2, DISTRIBUTION: 3, EXPANSION: 2 },
  "Turtle Soup":             { ACCUMULATION: 0, MANIPULATION: 3, DISTRIBUTION: 0, EXPANSION: 0 },
  "Breaker Block":           { ACCUMULATION: 1, MANIPULATION: 3, DISTRIBUTION: 1, EXPANSION: 0 },
  "Unicorn (OTE + FVG)":     { ACCUMULATION: 0, MANIPULATION: 0, DISTRIBUTION: 3, EXPANSION: 2 },
  "SCOB":                    { ACCUMULATION: 0, MANIPULATION: 1, DISTRIBUTION: 3, EXPANSION: 1 },
  "2FVG Entry":              { ACCUMULATION: 0, MANIPULATION: 0, DISTRIBUTION: 2, EXPANSION: 3 },
  "Judas Swing":             { ACCUMULATION: 2, MANIPULATION: 3, DISTRIBUTION: 0, EXPANSION: 0 },
  "Asian Range Breakout":    { ACCUMULATION: 3, MANIPULATION: 1, DISTRIBUTION: 0, EXPANSION: 0 },
  "NWOG/NDOG":              { ACCUMULATION: 3, MANIPULATION: 0, DISTRIBUTION: 0, EXPANSION: 0 },
};

const CYCLE_WEIGHTS = { ACCUMULATION: 1.3, MANIPULATION: 1.3, DISTRIBUTION: 1.4, EXPANSION: 1.2, UNKNOWN: 0.5 };

const cycleFitLabel = (score) => score >= 3 ? "⭐⭐⭐ PRIMARY" : score >= 2 ? "⭐⭐ Secondary" : score >= 1 ? "⭐ Situational" : "— Not recommended";
const dayFitLabel = (model) => {
  const cleanModel = model.toLowerCase();
  const isAvoided = profile.avoidModels.some(m => {
    const clean = m.toLowerCase().replace(" (early)","").replace(" (swing)","").replace(" (am only)","");
    return cleanModel.includes(clean);
  });
  if (isAvoided) return "AVOID";
  const isFavored = profile.bestModels.some(m => {
    const clean = m.toLowerCase().replace(" (ny am)","").replace(" (am only)","");
    return cleanModel.includes(clean);
  });
  if (isFavored) return "FAVORED";
  return "Neutral";
};

// ── Weekly Position ──────────────────────────────────────────────────────
let weekPhase;
if (EFFECTIVE_DAY === 1) weekPhase = "Week start — range setting";
else if (DAY_NUM === 2) weekPhase = "Early week — range extending or reversing";
else if (DAY_NUM === 3) weekPhase = "Mid-week — classic reversal zone";
else if (DAY_NUM === 4) weekPhase = "Late week — strongest trending period";
else if (DAY_NUM === 5) weekPhase = "Week end — position squaring, avoid new risk";
else weekPhase = "Weekend — markets closed";

// ── Monthly Events ───────────────────────────────────────────────────────
let monthlyEvent = "None";
if (WEEK_OF_MONTH === 1 && DAY_NUM === 5) monthlyEvent = "⚠️ NFP WEEK — First Friday. Extreme volatility. No positions 30min before/after.";
if (WEEK_OF_MONTH === 1) monthlyEvent = "NFP week — elevated volatility expected";
// FOMC: roughly every 6 weeks — would need a calendar feed for precision
if (WEEK_OF_MONTH === 4 && DAY_NUM >= 4) monthlyEvent += " | Month-end rebalancing — follow the flow";

// ── Output ────────────────────────────────────────────────────────────────
const outDir = path.join(ROOT, "stages", "00_macro_context", "output");
fs.mkdirSync(outDir, { recursive: true });

// day_context.md
const dayMd = `# Macro Context — ${DATE} — ${DAY}

## Today's Profile
- **Day**: ${DAY} — "${profile.ictName}"
- **Character**: ${profile.character}
- **Risk Level**: ${profile.risk}
- **Day Weight**: ×${profile.weight}
- **Session**: ${session} (${sessionChar})
- **NY Hour**: ${String(NY_HOUR).padStart(2,'0')}:00 (ICT standard: New York local time)

## Weekly Position
- **Week Phase**: ${weekPhase}
- **Week of Month**: ${WEEK_OF_MONTH}
- **Expected Pattern**: ${cycle.phase === 'MANIPULATION' ? 'Manipulation phase — watch for sweep then reversal' : cycle.phase === 'DISTRIBUTION' ? 'Distribution phase — MMXM and trend-following models favored' : cycle.phase === 'EXPANSION' ? 'Expansion phase — take profits, no new swing risk' : 'Structure-based (not calendar-based)'}
- **Caution**: ${profile.note}

## Monthly Events
${monthlyEvent}

## Session-Cycle Alignment
- **Session Character**: ${sessionChar}
- **Cycle Phase**: ${cycle.phase}
- **Alignment Quality**: ${(session === 'London' || session === 'NY AM') && (cycle.phase === 'MANIPULATION' || cycle.phase === 'DISTRIBUTION') ? '✅ OPTIMAL — Active session aligned with cycle phase' : (session === 'Asia' && cycle.phase === 'ACCUMULATION') ? '✅ Aligned — Asian accumulation is normal' : session === 'Off' ? '⚠️ OFF HOURS — Low liquidity, avoid trading' : '⚠️ Sub-optimal — Session and cycle not ideally matched'}
`;
fs.writeFileSync(path.join(outDir, "day_context.md"), dayMd, "utf8");

// cycle_phase.md
const mmxmStep = (() => {
  if (!r1w || !r1d) return { step: "Unknown", action: "Insufficient data" };
  const hasPOI = (r1d.orderBlocks || []).length > 0 || (r1d.fvgs || []).length > 0;
  const hasSweep = (r1d.liquidity || []).some(p => p.swept);
  const atPDArray = r1d.pdArray && (r1d.pdArray.currentZone === (r1w.structure.bias === 'bullish' ? 'discount' : r1w.structure.bias === 'bearish' ? 'premium' : null));

  if (!hasPOI) return { step: 1, action: "BUILD WATCHLIST — No HTF POI identified yet. Wait for OB/FVG to form at premium/discount." };
  if (!hasSweep) return { step: 1, action: "WAIT FOR INDUCEMENT — HTF POI identified but no sweep yet. Price needs to take out liquidity beyond the POI." };
  if (hasSweep && atPDArray !== false) return { step: 2, action: "MANIPULATION IN PROGRESS — Sweep detected. Watch for reversal and return to POI. Turtle Soup / Breaker Block opportunity." };
  if (hasSweep) return { step: 3, action: "ENTRY WINDOW — Sweep confirmed, price returning to POI. Look for OTE/Unicorn/SCOB entries." };
  return { step: 4, action: "MANAGE — In trend. Trail stops, partial TP. Or wait for next cycle." };
})();

const cycleMd = `# Cycle Phase — ${DATE}

## Detected Phase: **${cycle.phase}**
- **1W Bias**: ${r1w ? r1w.structure.bias.toUpperCase() : 'N/A'}
- **1D Bias**: ${r1d ? r1d.structure.bias.toUpperCase() : 'N/A'}
- **Sweeps**: ${r1d && r1d.liquidity.some(p => p.swept) ? '✅ Detected — ' + r1d.liquidity.filter(p => p.swept).map(p => p.type + ' @ ' + r5(p.price)).join(', ') : 'None detected'}
- **Displacement**: ${r1d ? r1d.volumeDisplacement.label + ' (' + r2(r1d.volumeDisplacement.atrRatio) + 'x ATR)' : 'N/A'}
- **Confidence**: ${r2(cycle.confidence)}

## Phase Narrative
${cycle.narrative}

## Liquidity State (HTF)
- **1D Draw Direction**: **${liqMacro1d.drawDirection}** (BSL: ${r2((liqMacro1d.activeUp || []).reduce((s,p)=>s+p.score,0))} | SSL: ${r2((liqMacro1d.activeDown || []).reduce((s,p)=>s+p.score,0))})
- **1D State**: ${liqMacro1d.summary}
- **4H State**: ${liqMacro4h.summary}
- **Just Swept**: ${(liqMacro1d.justSwept || []).length > 0 ? liqMacro1d.justSwept.map(p => p.type + ' @ ' + r5(p.price)).join(', ') : 'None'}
- **Engineered Pools**: ${(liqMacro1d.engineered || []).length} EQH/EQL building
- **Liquidity-Phase Coherence**: ${liquidityNarrative}

## MMXM Assessment
- **MMXM Step**: ${mmxmStep.step}/4
- **HTF POI Present**: ${r1d && ((r1d.orderBlocks || []).length > 0 || (r1d.fvgs || []).length > 0) ? '✅ Yes — ' + (r1d.orderBlocks || []).length + ' OB(s), ' + (r1d.fvgs || []).length + ' FVG(s)' : '❌ No clear POI'}
- **Inducement Occurred**: ${r1d && r1d.liquidity.some(p => p.swept) ? '✅ Yes — liquidity sweep detected' : '⏳ Not yet — waiting for manipulation'}
- **Action**: **${mmxmStep.action}**

## Cycle Phase (structure-based — never the calendar)
- **Actual phase**: ${cycle.phase}${cycle.source ? ` (from ${cycle.source} structure)` : ''} — ${cycle.narrative}
- **Policy**: PO3/AMD is a price-and-time delivery cycle, never a day-of-week table. Phase comes from sweeps/BOS/CHoCH/displacement (lib/cycle_phase.cjs), or UNKNOWN when structure cannot decide.
- **Context**: ${cycle.phase === 'ACCUMULATION' ? 'Building — wait for the manipulation sweep before entries.' : cycle.phase === 'MANIPULATION' ? 'Sweep active — enter on the reversal AFTER the sweep confirms.' : cycle.phase === 'DISTRIBUTION' ? 'Trend established — enter on retracements to PD arrays.' : cycle.phase === 'EXPANSION' ? 'Blow-off — trail stops, no new entries.' : 'Structure ambiguous — no fabricated phase.'}
`;
fs.writeFileSync(path.join(outDir, "cycle_phase.md"), cycleMd, "utf8");

// model_filter.md
const cycleWeight = CYCLE_WEIGHTS[cycle.phase] || 0.5;

let modelTable = "";
for (const [model, phases] of Object.entries(MODEL_CYCLE_MAP)) {
  const cycleFit = phases[cycle.phase] !== undefined ? phases[cycle.phase] : 0;
  const dayFit = dayFitLabel(model);
  const dayWeight = profile.weight;
  const combined = cycleFit * cycleWeight * dayWeight;
  const recommended = combined >= 3.0 ? "✅ HIGHLY RECOMMENDED" :
                     combined >= 1.5 ? "✓ Recommended" :
                     combined >= 0.5 ? "⚡ Situational" : "✗ Skip today";
  modelTable += `| ${model} | ${cycleFit}/3 | ${cycleFitLabel(cycleFit)} | ${dayFit} | ×${dayWeight} | ${r2(combined)} | ${recommended} |\n`;
}

const bestModels = Object.entries(MODEL_CYCLE_MAP)
  .filter(([, phases]) => phases[cycle.phase] >= 2)
  .sort((a, b) => b[1][cycle.phase] - a[1][cycle.phase])
  .slice(0, 3);

const avoidModels = Object.entries(MODEL_CYCLE_MAP)
  .filter(([, phases]) => phases[cycle.phase] === 0)
  .map(([model]) => model);

const modelMd = `# Cycle-Aware Model Filter — ${DATE}

## Active Cycle: **${cycle.phase}** — Day: **${DAY}** — Session: **${session}**

## Full Model Matrix

| Model | Cycle Fit | Cycle Rating | Day Fit | Day Weight | Combined | Recommendation |
|-------|----------|-------------|---------|-----------|----------|----------------|
${modelTable}

## Today's Best Models (Cycle-Recommended)
${bestModels.map(([model, phases], i) => `${i + 1}. **${model}** — Cycle fit: ${phases[cycle.phase]}/3. Best for ${cycle.phase.toLowerCase()} phase on ${DAY}s.`).join('\n')}

## Models to Avoid Today
${avoidModels.map(model => `- **${model}** — Not designed for ${cycle.phase.toLowerCase()} phase. Structural confluence would need to be exceptional to override.`).join('\n')}

## MMXM Integration
- **MMXM Step Today**: ${mmxmStep.step}/4
- **If Step 1-2**: Focus on Turtle Soup and Breaker Block (manipulation entries)
- **If Step 3**: Focus on OTE + OB, Unicorn, SCOB (return-to-POI entries)
- **If Step 4**: Manage existing positions or wait for next cycle

## Session Override
- **${session} Session** → ${session === 'London' || session === 'NY AM' ? 'Active session — full model eligibility' : session === 'Asia' ? 'Asian session — accumulation/range models preferred over trend models' : session === 'Off' ? 'OFF HOURS — reduce position size or skip entirely' : 'Standard session'}
`;
fs.writeFileSync(path.join(outDir, "model_filter.md"), modelMd, "utf8");

// ── Summary ──────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(60)}`);
console.log(`  STAGE 00 — MACRO CONTEXT — ${DATE} ${String(NY_HOUR).padStart(2,'0')}:00 NY time`);
console.log(`${"=".repeat(60)}`);
console.log(`Day:      ${DAY} — ${profile.ictName} (weight ×${profile.weight})`);
console.log(`Session:  ${session} (${sessionChar})`);
console.log(`Cycle:    ${cycle.phase} (confidence ${r2(cycle.confidence)})`);
console.log(`MMXM:     Step ${mmxmStep.step}/4 — ${mmxmStep.action}`);
console.log(`1W Bias:  ${r1w ? r1w.structure.bias.toUpperCase() : 'N/A'} | 1D Bias: ${r1d ? r1d.structure.bias.toUpperCase() : 'N/A'}`);
console.log(`Sweeps:   ${r1d && r1d.liquidity.some(p => p.swept) ? 'YES' : 'none'}`);
console.log(`Liquidity: ${liqMacro1d.drawDirection} draw | ${liqMacro1d.state} | ${liqMacro1d.summary}`);
console.log(`Disp:     ${r1d ? r1d.volumeDisplacement.label + ' (' + r2(r1d.volumeDisplacement.atrRatio) + 'x)' : 'N/A'}`);
console.log(`Top Models: ${bestModels.map(([m]) => m).join(', ')}`);
console.log(`Avoid:    ${avoidModels.join(', ')}`);
console.log(`\nOutput:   stages/00_macro_context/output/`);
console.log(`  day_context.md`);
console.log(`  cycle_phase.md`);
console.log(`  model_filter.md`);
