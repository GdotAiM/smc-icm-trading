// Stage 05b — Micro Context & Coherence Engine
// Detects LTF cycles, checks entry triggers, scores macro-micro coherence.
// NOW WITH SESSION AWARENESS — session-appropriate trigger filtering.
const fs = require("fs");
const path = require("path");

const ROOT = "C:\\Users\\cash\\smc-icm-trading";
const DATE = require("./ny_time.cjs").getNYDate();
const { getNYHour, getNYSession, isInKillzoneNY, isInSilverBulletNY } = require("./ny_time.cjs");
const NY_HOUR = getNYHour();
// Use NY session for ICT-correct killzone detection
const nySession = getNYSession();
const session = nySession.label;
const sessionChar = nySession.character;
const inKillzone = isInKillzoneNY();
const killzoneName = inKillzone ? nySession.label + " Killzone" : "none";
const inSB = isInSilverBulletNY().active;
const sbName = isInSilverBulletNY().active ? isInSilverBulletNY().label : "none";

function r2(v) { return Number(v).toFixed(2); }
function r5(v) { return Number(v).toFixed(5); }

const PAIR = process.argv[2] || "GBPUSD";
const pairLabel = PAIR === "GOLD" ? "XAUUSD" : PAIR;
const sharedDir = path.join(ROOT, "shared", DATE, PAIR);

// ── Session Awareness ────────────────────────────────────────────────────
// ICT session map with LTF-specific characteristics

// Session → LTF reliability multiplier
// LTF signals are less reliable in low-volume sessions
const SESSION_RELIABILITY = {
  "Asia (prev day evening)": 0.6,     "Asia (overnight)": 0.5,
  "London Killzone": 1.3,             "London PM / Pre-NY": 1.1,
  "NY AM Killzone": 1.4,              "NY Lunch": 0.4,
  "NY PM Session": 1.0,               "NY Close": 0.3,
  "Off Hours": 0.3,
};
const SESSION_BEST_TF = {
  "Asia (prev day evening)": "15m",   "Asia (overnight)": "15m",
  "London Killzone": "5m",            "London PM / Pre-NY": "15m",
  "NY AM Killzone": "5m",             "NY Lunch": "none",
  "NY PM Session": "5m",              "NY Close": "15m",
  "Off Hours": "none",
};

// Session-specific trigger weights — some triggers matter more in certain sessions
const SESSION_TRIGGER_BOOST = {
  "Asia": "none",          // No trigger is reliable in Asia
  "London": "manipulation", // Manipulation sweep is THE signal in London
  "London PM": "displacement",
  "NY AM": "displacement",  // Displacement is the key in NY AM
  "NY PM (early)": "displacement",
  "NY PM (late)": "none",
  "Off": "none",
};

const sessionReliability = SESSION_RELIABILITY[session] || 1.0;
const bestEntryTF = SESSION_BEST_TF[session] || "5m";

// ── Load reports ─────────────────────────────────────────────────────────
function loadEngine(tf) {
  try { return JSON.parse(fs.readFileSync(path.join(sharedDir, `engine_${tf}.json`), "utf8")); }
  catch { return null; }
}

const r15m = loadEngine("15m");
const r5m  = loadEngine("5m");
const r1m  = loadEngine("1m");
const r1h  = loadEngine("1h");
const r4h  = loadEngine("4h");

// ── Macro context (from Stage 00) ────────────────────────────────────────
let macroPhase = "UNKNOWN", macroMmxmStep = 0;
try {
  const cycleMd = fs.readFileSync(path.join(ROOT, "stages", "00_macro_context", "output", "cycle_phase.md"), "utf8");
  const pm = cycleMd.match(/\*\*([A-Z]+)\*\*/);
  if (pm) macroPhase = pm[1];
  const mm = cycleMd.match(/MMXM Step[* ]*: (\d)/);
  if (mm) macroMmxmStep = parseInt(mm[1]);
} catch (e) { /* use defaults */ }

const htfBias = r4h ? r4h.structure.bias : (r1h ? r1h.structure.bias : "neutral");
const htfDir = htfBias === "bearish" ? "SHORT" : htfBias === "bullish" ? "LONG" : "NONE";

// ── Liquidity State Analysis ─────────────────────────────────────────────
// Goes beyond "is there a pool?" to "what STATE is the liquidity in?"
// ICT teaches: price seeks liquidity. Understanding the state tells you what's next.

function analyzeLiquidityState(report, label, currentPrice) {
  if (!report || !report.liquidity) return { pools: [], drawDirection: "none", drawStrength: 0, nearestBSL: null, nearestSSL: null, state: "UNKNOWN" };

  const pools = report.liquidity;
  const now = Date.now();
  const barAgeMs = (report.candles && report.candles.length > 1)
    ? (report.candles[report.candles.length - 1].time - report.candles[report.candles.length - 2].time) : 3600000;

  const classified = pools.map(p => {
    const distPct = Math.abs((p.price - currentPrice) / currentPrice * 100);
    const ageBars = p.ageBars || Math.round((now - (p.sweepTime || now)) / barAgeMs);
    let state;

    if (p.swept) {
      // Check if it was swept recently (manipulation) or long ago (dried up)
      state = ageBars < 10 ? "JUST_SWEPT" : ageBars < 30 ? "SWEPT_RECENT" : "SWEPT_OLD";
    } else if (distPct < 0.15) {
      state = "TARGETED"; // Price is very close — draw is active
    } else if (distPct < 0.5) {
      state = "APPROACHING"; // Within range — draw building
    } else if (p.touches >= 2 && ageBars < 20) {
      state = "BUILDING"; // EQH/EQL forming — stops accumulating
    } else if (ageBars > 100) {
      state = "DRIED_UP"; // Old pool, low probability
    } else {
      state = "RESTING"; // Established, not currently targeted
    }

    return {
      price: p.price, type: p.type, state, touches: p.strength || p.touches || 1,
      score: p.score || 0, distancePct: distPct, ageBars, swept: p.swept,
      isEngineered: (p.strength || p.touches || 1) >= 2,
    };
  });

  // Sort: active pools first (targeted > approaching > building > resting > swept > dried)
  const statePriority = { TARGETED: 0, APPROACHING: 1, BUILDING: 2, JUST_SWEPT: 3, RESTING: 4, SWEPT_RECENT: 5, SWEPT_OLD: 6, DRIED_UP: 7 };
  classified.sort((a, b) => (statePriority[a.state] || 5) - (statePriority[b.state] || 5));

  // Find draw direction
  const activeBSL = classified.filter(p => p.type === "BSL" && ["TARGETED", "APPROACHING", "BUILDING"].includes(p.state));
  const activeSSL = classified.filter(p => p.type === "SSL" && ["TARGETED", "APPROACHING", "BUILDING"].includes(p.state));
  const bslStrength = activeBSL.reduce((s, p) => s + p.score, 0);
  const sslStrength = activeSSL.reduce((s, p) => s + p.score, 0);

  // Draw: where is price being pulled?
  const drawDirection = bslStrength > sslStrength * 1.2 ? "UP" :
                        sslStrength > bslStrength * 1.2 ? "DOWN" :
                        bslStrength > 0 && sslStrength > 0 ? "BOTH" : "NONE";
  const drawStrength = Math.max(bslStrength, sslStrength);

  const nearestBSL = pools.filter(p => p.type === "BSL" && !p.swept).sort((a, b) => a.price - b.price)[0];
  const nearestSSL = pools.filter(p => p.type === "SSL" && !p.swept).sort((a, b) => b.price - a.price)[0];

  return {
    pools: classified,
    drawDirection,
    drawStrength,
    nearestBSL: nearestBSL ? { price: nearestBSL.price, state: classified.find(c => c.price === nearestBSL.price)?.state || "RESTING" } : null,
    nearestSSL: nearestSSL ? { price: nearestSSL.price, state: classified.find(c => c.price === nearestSSL.price)?.state || "RESTING" } : null,
    state: activeBSL.length > 0 && activeSSL.length > 0 ? "BOTH_SIDES_ACTIVE" :
           activeBSL.length > 0 ? "DRAWING_UP" :
           activeSSL.length > 0 ? "DRAWING_DOWN" :
           classified.some(p => p.state === "JUST_SWEPT") ? "POST_SWEEP" :
           classified.some(p => p.state === "BUILDING") ? "BUILDING" : "RESTING",
  };
}

const liq15 = analyzeLiquidityState(r15m, "15m", r15m ? r15m.price : 0);
const liq5  = analyzeLiquidityState(r5m, "5m", r5m ? r5m.price : 0);
const liq1  = analyzeLiquidityState(r1m, "1m", r1m ? r1m.price : 0);
const liq4h = analyzeLiquidityState(r4h, "4H", r4h ? r4h.price : 0);

// Liquidity coherence: does the draw direction align with HTF?
function liquidityCoherence(htfBias, liq15, liq5) {
  let score = 0;
  const notes = [];

  // 1. Draw direction alignment (0-3)
  const expectedDraw = htfBias === "bearish" ? "DOWN" : htfBias === "bullish" ? "UP" : "NONE";
  if (liq5.drawDirection === expectedDraw) { score += 2; notes.push("5m draw aligns with HTF bias"); }
  else if (liq5.drawDirection === "BOTH") { score += 1; notes.push("5m draw is balanced — no clear direction"); }
  else { notes.push(`5m draw is ${liq5.drawDirection} — not aligned with HTF ${htfBias}`); }

  if (liq15.drawDirection === expectedDraw) { score += 1; notes.push("15m draw confirms"); }

  // 2. Has manipulation just occurred? (0-2)
  const justSwept15 = liq15.pools.filter(p => p.state === "JUST_SWEPT").length;
  const justSwept5 = liq5.pools.filter(p => p.state === "JUST_SWEPT").length;
  if (justSwept15 + justSwept5 > 0) {
    score += 2;
    notes.push(`Recent sweep detected — manipulation active (${justSwept15} on 15m, ${justSwept5} on 5m)`);
  }

  // 3. Engineered liquidity present? (0-1)
  const engineered15 = liq15.pools.filter(p => p.isEngineered && !p.swept).length;
  const engineered5 = liq5.pools.filter(p => p.isEngineered && !p.swept).length;
  if (engineered15 + engineered5 >= 2) { score += 1; notes.push(`Engineered liquidity (EQH/EQL) — higher probability draw`); }

  // 4. HTF pool targeted? (0-2)
  if (liq4h.nearestBSL && liq4h.nearestBSL.state === "TARGETED") { score += 1; notes.push(`4H BSL being targeted — draw is active`); }
  if (liq4h.nearestSSL && liq4h.nearestSSL.state === "TARGETED") { score += 1; notes.push(`4H SSL being targeted — draw is active`); }

  // 5. Post-sweep state? (0-1)
  if (liq15.state === "POST_SWEEP" || liq5.state === "POST_SWEEP") { score += 1; notes.push("Post-sweep — price should move away from swept level"); }

  return { score: Math.min(8, score), notes };
}

const liqCoh = liquidityCoherence(htfBias, liq15, liq5);
function analyzeLTF(report, label) {
  if (!report) return { bias: "N/A", event: "?", eventDir: "?", displacement: "n/a", dispRatio: 0, swept: false, sweepType: "none", fvgs: 0, obs: 0 };
  const r = report;
  const bias = r.structure.bias;
  const event = r.structure.lastEvent || "none";
  // Determine event direction from bias change context
  let eventDir = "none";
  if (event === "BOS") eventDir = bias; // BOS confirms current bias
  else if (event === "CHoCH") eventDir = bias === "bearish" ? "bearish" : bias === "bullish" ? "bullish" : "none";

  const swept = (r.liquidity || []).some(p => p.swept);
  const sweepTypes = (r.liquidity || []).filter(p => p.swept).map(p => p.type);
  const sweepType = sweepTypes.length > 0 ? sweepTypes.join(",") : "none";
  const dispLabel = r.volumeDisplacement ? r.volumeDisplacement.label : "n/a";
  const dispRatio = r.volumeDisplacement ? r.volumeDisplacement.atrRatio : 0;

  return {
    bias, event, eventDir, displacement: dispLabel, dispRatio,
    swept, sweepType, fvgs: (r.fvgs || []).length, obs: (r.orderBlocks || []).length,
  };
}

const ltf = {
  "15m": analyzeLTF(r15m, "15m"),
  "5m":  analyzeLTF(r5m, "5m"),
  "1m":  analyzeLTF(r1m, "1m"),
};

// ── Coherence Scoring ────────────────────────────────────────────────────
function scoreCoherence(htfBias, ltf) {
  let score = 0;
  const breakdown = [];

  // 1. LTF Bias Alignment (0-3)
  let biasScore = 0;
  for (const tf of ["15m", "5m", "1m"]) {
    if (ltf[tf].bias === htfBias) biasScore++;
  }
  score += biasScore;
  breakdown.push(`Bias alignment: ${biasScore}/3 (${["15m","5m","1m"].map(t => ltf[t].bias === htfBias ? '✓' : '✗').join(' ')})`);

  // 2. LTF Structure (0-2)
  let structScore = 0;
  if (ltf["15m"].event === "BOS" && ltf["15m"].eventDir === htfBias) structScore = 2;
  else if (ltf["15m"].event === "CHoCH" && ltf["15m"].eventDir === htfBias) structScore = 2;
  else if (ltf["5m"].event === "BOS" && ltf["5m"].eventDir === htfBias) structScore = 2;
  else if (ltf["5m"].event === "CHoCH" && ltf["5m"].eventDir === htfBias) structScore = 1;
  else if (ltf["15m"].event !== "none" || ltf["5m"].event !== "none") structScore = 1; // something is happening
  score += structScore;
  breakdown.push(`Structure: ${structScore}/2 (15m:${ltf['15m'].event} ${ltf['15m'].eventDir}, 5m:${ltf['5m'].event} ${ltf['5m'].eventDir})`);

  // 3. LTF Displacement (0-2)
  let dispScore = 0;
  if (ltf["5m"].displacement === "strong" && ltf["5m"].bias === htfBias) dispScore = 2;
  else if (ltf["5m"].displacement === "moderate" && ltf["5m"].bias === htfBias) dispScore = 2;
  else if (ltf["5m"].displacement === "weak" && ltf["5m"].bias === htfBias) dispScore = 1;
  else if (ltf["1m"].displacement === "strong" && ltf["1m"].bias === htfBias) dispScore = 1;
  else if (ltf["1m"].dispRatio > 0.5 && ltf["1m"].bias === htfBias) dispScore = 1;
  score += dispScore;
  breakdown.push(`Displacement: ${dispScore}/2 (5m:${ltf['5m'].displacement} ${ltf['5m'].dispRatio}x, 1m:${ltf['1m'].displacement} ${ltf['1m'].dispRatio}x)`);

  // 4. LTF Manipulation (0-2)
  let manipScore = 0;
  // Manipulation = sweep in opposite direction of HTF (traps traders going the wrong way)
  const oppDir = htfBias === "bearish" ? "BSL" : "SSL";
  if (ltf["15m"].swept && ltf["15m"].sweepType.includes(oppDir)) manipScore = 2;
  else if (ltf["5m"].swept && ltf["5m"].sweepType.includes(oppDir)) manipScore = 2;
  else if (ltf["15m"].swept || ltf["5m"].swept) manipScore = 1;
  score += manipScore;
  breakdown.push(`Manipulation: ${manipScore}/2 (15m sweep:${ltf['15m'].swept} ${ltf['15m'].sweepType}, 5m:${ltf['5m'].swept} ${ltf['5m'].sweepType})`);

  // 5. Trigger Readiness (0-1)
  let triggerScore = 0;
  const hasFVG = ltf["5m"].fvgs > 0 && ltf["5m"].bias === htfBias;
  const hasCHoCH = ltf["1m"].event === "CHoCH" && ltf["1m"].eventDir === htfBias;
  if (hasFVG && hasCHoCH) triggerScore = 1;
  else if (hasFVG || hasCHoCH) triggerScore = 0; // need both
  score += triggerScore;
  breakdown.push(`Trigger readiness: ${triggerScore}/1 (5m FVG:${hasFVG}, 1m CHoCH:${hasCHoCH})`);

  // 6. Liquidity State (0-3) — NEW
  score += liqCoh.score;
  breakdown.push(`Liquidity: ${liqCoh.score}/3 — ${liqCoh.notes.join('; ')}`);

  return { score, breakdown };
}

const { score, breakdown } = scoreCoherence(htfBias, ltf);

// Apply session reliability multiplier
const sessionAdjustedScore = Math.round(score * sessionReliability);
const effectiveScore = Math.min(10, sessionAdjustedScore);

function coherenceLabel(s) {
  if (s >= 9) return "✅ PERFECT — Textbook setup";
  if (s >= 7) return "✅ HIGH — Enter with confidence";
  if (s >= 5) return "⏳ MODERATE — Wait or reduce size 50%";
  if (s >= 3) return "⏳ LOW — Let LTF develop, check again soon";
  return "❌ NO TRADE — LTF contradicts HTF, thesis may be wrong";
}

function goNoGo(s) {
  if (s >= 7) return "✅ GO — All conditions met for entry";
  if (s >= 5) return "⏳ NEARLY — Wait 1-3 candles for trigger";
  if (s >= 3) return "⏳ WAIT — Let LTF develop further";
  return "❌ NO TRADE — Micro does not confirm Macro";
}

// Session-adjusted
const goNoGoSession = session === "Off" ? "❌ NO TRADE — Off-hours, markets closed or illiquid" : goNoGo(effectiveScore);

// Build session notes for triggers
const sessionNote = session === "Asia" ? "⚠️ Asia session — LTF signals less reliable. Wait for London." :
  session === "London" ? "✅ London killzone — manipulation probability HIGH. Watch for Judas Swing on 5m." :
  session === "NY AM" ? "✅ NY AM killzone — best entry window. 5m displacement is real." :
  session === "Off" ? "❌ Off-hours — do not trade." :
  `Standard session — ${sessionChar}`;

const bestTFNote = `Best entry TF for ${session}: **${bestEntryTF}**`;

// ── Entry Trigger Checklist ──────────────────────────────────────────────
function checkTriggers(htfBias, ltf) {
  const dir = htfBias; // "bearish" or "bullish"
  const opp = dir === "bearish" ? "bullish" : "bearish";
  const sweepTarget = dir === "bearish" ? "BSL" : "SSL";

  return [
    { check: `15m bias = ${dir.toUpperCase()} (not opposing)`, pass: ltf["15m"].bias === dir || ltf["15m"].bias === "neutral", detail: `15m bias is ${ltf['15m'].bias}` },
    { check: `5m ${dir} CHoCH or BOS in recent bars`, pass: ltf["5m"].event !== "none" && ltf["5m"].eventDir === dir, detail: `5m event: ${ltf['5m'].event} ${ltf['5m'].eventDir}` },
    { check: `5m ${dir} FVG present and unfilled`, pass: ltf["5m"].fvgs > 0 && ltf["5m"].bias === dir, detail: `${ltf['5m'].fvgs} FVGs on 5m, bias=${ltf['5m'].bias}` },
    { check: `1m displacement ${dir} (body > 0.7× ATR)`, pass: ltf["1m"].dispRatio > 0.7 && ltf["1m"].bias === dir, detail: `1m disp: ${ltf['1m'].displacement} (${r2(ltf['1m'].dispRatio)}x), bias=${ltf['1m'].bias}` },
    { check: `${sweepTarget} sweep on 5m or 15m (manipulation)`, pass: ltf["15m"].swept || ltf["5m"].swept, detail: `15m: ${ltf['15m'].swept ? ltf['15m'].sweepType : 'none'}, 5m: ${ltf['5m'].swept ? ltf['5m'].sweepType : 'none'}` },
  ];
}

const triggers = checkTriggers(htfBias, ltf);
const triggersPassed = triggers.filter(t => t.pass).length;

// ── Output ────────────────────────────────────────────────────────────────
const outDir = path.join(ROOT, "stages", "05b_micro_confirmation", "output");
fs.mkdirSync(outDir, { recursive: true });

// micro_cycle.md
fs.writeFileSync(path.join(outDir, `${PAIR.toLowerCase()}_micro_cycle.md`), `# LTF Cycle Analysis — ${pairLabel} — ${DATE}

## Macro Context (from Stage 00)
- **HTF Bias**: ${htfBias.toUpperCase()}
- **Cycle Phase**: ${macroPhase}
- **MMXM Step**: ${macroMmxmStep}/4

## LTF Cycle Phases

| Timeframe | Bias | Event | Direction | Displacement | Sweeps | FVGs | OBs |
|-----------|------|-------|-----------|-------------|--------|------|-----|
| 15m | **${ltf['15m'].bias.toUpperCase()}** | ${ltf['15m'].event} | ${ltf['15m'].eventDir} | ${ltf['15m'].displacement} (${r2(ltf['15m'].dispRatio)}x) | ${ltf['15m'].swept ? ltf['15m'].sweepType : 'none'} | ${ltf['15m'].fvgs} | ${ltf['15m'].obs} |
| 5m | **${ltf['5m'].bias.toUpperCase()}** | ${ltf['5m'].event} | ${ltf['5m'].eventDir} | ${ltf['5m'].displacement} (${r2(ltf['5m'].dispRatio)}x) | ${ltf['5m'].swept ? ltf['5m'].sweepType : 'none'} | ${ltf['5m'].fvgs} | ${ltf['5m'].obs} |
| 1m | **${ltf['1m'].bias.toUpperCase()}** | ${ltf['1m'].event} | ${ltf['1m'].eventDir} | ${ltf['1m'].displacement} (${r2(ltf['1m'].dispRatio)}x) | ${ltf['1m'].swept ? ltf['1m'].sweepType : 'none'} | ${ltf['1m'].fvgs} | ${ltf['1m'].obs} |

## LTF Alignment
- **15m vs HTF**: ${ltf['15m'].bias === htfBias ? '✅ ALIGNED' : ltf['15m'].bias === 'neutral' ? '⚪ Neutral' : '⚠️ OPPOSING'}
- **5m vs HTF**: ${ltf['5m'].bias === htfBias ? '✅ ALIGNED' : ltf['5m'].bias === 'neutral' ? '⚪ Neutral' : '⚠️ OPPOSING'}
- **1m vs HTF**: ${ltf['1m'].bias === htfBias ? '✅ ALIGNED' : ltf['1m'].bias === 'neutral' ? '⚪ Neutral' : '⚠️ OPPOSING'}
`, "utf8");

// trigger_check.md
fs.writeFileSync(path.join(outDir, `${PAIR.toLowerCase()}_trigger_check.md`), `# Entry Trigger Checklist — ${pairLabel} — ${DATE}

## Direction: **${htfDir}** (HTF: ${htfBias.toUpperCase()})

| # | Trigger Condition | Status | Detail |
|---|------------------|--------|--------|
${triggers.map((t, i) => `| ${i + 1} | ${t.check} | ${t.pass ? '✅' : '✗'} | ${t.detail} |`).join('\n')}

## Result: ${triggersPassed}/5 triggers met

${triggersPassed >= 5 ? '✅ ALL TRIGGERS MET — Ready for entry' : triggersPassed >= 3 ? '⏳ PARTIAL — ' + (5 - triggersPassed) + ' triggers missing. Wait for confirmation.' : '❌ INSUFFICIENT — Entry conditions not met. Do not enter.'}
`, "utf8");

// coherence.md
fs.writeFileSync(path.join(outDir, `${PAIR.toLowerCase()}_coherence.md`), `# Macro-Micro Coherence — ${pairLabel} — ${DATE}

## Coherence Score: **${score}/10** (raw) → **${effectiveScore}/10** (session-adjusted)

> Session: **${session}** (×${sessionReliability}) | Killzone: ${inKillzone ? '✅ ' + killzoneName : 'Inactive'} | Silver Bullet: ${inSB ? '✅ ' + sbName : 'Inactive'}
> ${sessionNote}
> ${bestTFNote}

| Component | Score | Detail |
|-----------|-------|--------|
${breakdown.map(b => `| ${b.split(':')[0]} | ${b.split(':')[1].split('/')[0].trim()}/${b.split('/')[1] ? b.split('/')[1].split(' ')[0] : '?'} | ${b.split(':').slice(1).join(':').trim()} |`).join('\n')}
| **Session Adj** | ×${sessionReliability} | ${session} reliability multiplier |

## Go/No-Go Decision

**${goNoGoSession}**

| Score Range | Action |
|-------------|--------|
| 9-10 | ✅ ENTER — Textbook setup, full size |
| 7-8 | ✅ ENTER — High coherence, standard size |
| 5-6 | ⏳ WAIT — Moderate, or reduce size 50% |
| 3-4 | ⏳ WAIT — Low coherence, re-check in 15-30 min |
| 0-2 | ❌ NO TRADE — LTF contradicts HTF |

## Macro-Micro Relationship

- **Macro says**: ${macroPhase} phase, HTF ${htfBias.toUpperCase()}, MMXM Step ${macroMmxmStep}
- **Micro says**: 15m ${ltf['15m'].bias}, 5m ${ltf['5m'].bias}, 1m ${ltf['1m'].bias}
- **Interpretation**: ${score >= 7 ?
    `LTF confirms HTF — ${htfBias} trend is intact on lower timeframes. Entry signal is valid.` :
    score >= 4 ?
    `LTF partially confirms HTF — some alignment but not full. Wait for clearer LTF structure.` :
    `LTF does NOT confirm HTF — ${htfBias === 'bearish' && ltf['15m'].bias === 'bullish' ? 'This is a pullback within the larger trend, not a reversal. Wait for LTF to resume HTF direction.' : htfBias === 'bullish' && ltf['15m'].bias === 'bearish' ? 'This is a pullback within the larger trend, not a reversal. Wait for LTF to resume HTF direction.' : 'Mixed signals — stay out until coherence improves.'}`
  }
`, "utf8");

// ── Summary ──────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(60)}`);
console.log(`  STAGE 05b — MICRO CONFIRMATION — ${pairLabel}`);
console.log(`${"=".repeat(60)}`);
console.log(`Session: ${session} ${inKillzone ? '(KILLZONE)' : ''} | ${inSB ? 'SB ' + sbName : 'No SB'} | Reliability: ×${sessionReliability}`);
console.log(`HTF Bias: ${htfBias.toUpperCase()} (Macro: ${macroPhase}, MMXM: ${macroMmxmStep})`);
console.log(`LTF 15m: ${ltf['15m'].bias.toUpperCase()} | 5m: ${ltf['5m'].bias.toUpperCase()} | 1m: ${ltf['1m'].bias.toUpperCase()}`);
console.log(`Coherence: ${score}/10 → ${effectiveScore}/10 (session-adjusted) — ${coherenceLabel(effectiveScore)}`);
console.log(`Triggers: ${triggersPassed}/5 met | ${sessionNote}`);
console.log(`Decision: ${goNoGoSession}`);
if (effectiveScore >= 7) {
  console.log(`\n✅ Micro confirms Macro — ${htfDir} entry is valid`);
  console.log(`   Session: ${session} ×${sessionReliability} reliability`);
  if (ltf['5m'].fvgs > 0) console.log(`   5m FVG available for entry refinement`);
  if (ltf['5m'].swept) console.log(`   Manipulation sweep confirmed on 5m`);
} else if (effectiveScore >= 4) {
  console.log(`\n⏳ Partial coherence — waiting for LTF to develop`);
  console.log(`   Session: ${session} ×${sessionReliability} reliability`);
  if (ltf['15m'].bias !== htfBias) console.log(`   15m bias (${ltf['15m'].bias}) ≠ HTF (${htfBias}) — wait for alignment`);
  if (ltf['5m'].fvgs === 0) console.log(`   No 5m FVG — wait for displacement to create entry inefficiency`);
} else {
  console.log(`\n❌ No coherence — LTF contradicts HTF`);
  console.log(`   Session: ${session === 'Off' ? 'OFF HOURS' : session} — ${session === 'Off' ? 'do not trade' : 're-evaluate in 15-30 min'}`);
}
