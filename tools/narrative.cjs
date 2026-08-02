// Narrative Engine — The Market's Storyteller
// Builds a unified causal narrative from all system outputs.
// This is NOT pattern matching. It explains WHY, not just WHAT.

const fs = require("fs");
const path = require("path");
// Narrative engine — reads pre-generated outputs, no exec needed

const ROOT = "C:\\Users\\cash\\smc-icm-trading";
const DATE = new Date().toISOString().split("T")[0];
const ny = require("./ny_time.cjs");
const NY_HOUR = ny.getNYHour();
const DAY_NUM = ny.getNYDay();
const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const DAY = DAYS[DAY_NUM];

function r2(v) { return Number(v).toFixed(2); }
function r5(v) { return Number(v).toFixed(5); }

const PAIR = process.argv[2] || "GBPUSD";
const pairLabel = PAIR === "GOLD" ? "XAUUSD" : PAIR;
const sharedDir = path.join(ROOT, "shared", DATE, PAIR);

// ── Gather all intelligence ─────────────────────────────────────────────
function loadEngine(tf) {
  try { return JSON.parse(fs.readFileSync(path.join(sharedDir, `engine_${tf}.json`), "utf8")); }
  catch { return null; }
}
const r1w = loadEngine("1w"); const r1d = loadEngine("1d"); const r4h = loadEngine("4h");
const r1h = loadEngine("1h"); const r15m = loadEngine("15m"); const r5m = loadEngine("5m"); const r1m = loadEngine("1m");

// Read council vote from pre-generated output
let council = null;
try {
  const voteFile = path.join(ROOT, "stages", "00_council_vote", "output", `${PAIR.toLowerCase()}_vote.md`);
  if (fs.existsSync(voteFile)) {
    const md = fs.readFileSync(voteFile, "utf8");
    const verdictMatch = md.match(/Verdict: \*\*(.+?)\*\*/);
    const confMatch = md.match(/Confidence\*\*: (\d+)%/);
    const actionMatch = md.match(/Action\*\*: (.+)/);
    const posMatch = md.match(/\| (?:🟢|🔴|⚪) Position Trader.*?\*\*(BULLISH|BEARISH|NEUTRAL)\*\*/);
    const swgMatch = md.match(/\| (?:🟢|🔴|⚪) Swing Trader.*?\*\*(BULLISH|BEARISH|NEUTRAL)\*\*/);
    const dayMatch = md.match(/\| (?:🟢|🔴|⚪) Day Trader.*?\*\*(BULLISH|BEARISH|NEUTRAL)\*\*/);
    const scpMatch = md.match(/\| (?:🟢|🔴|⚪) Scalper.*?\*\*(BULLISH|BEARISH|NEUTRAL)\*\*/);
    const bullMatch = md.match(/Bullish\*\*: (\d+)/);
    const bearMatch = md.match(/Bearish\*\*: (\d+)/);
    council = {
      verdict: verdictMatch?.[1] || "UNKNOWN",
      confidencePct: confMatch ? parseInt(confMatch[1]) : 0,
      action: actionMatch?.[1] || "",
      votes: [
        { direction: (posMatch?.[1] || "neutral").toLowerCase() },
        { direction: (swgMatch?.[1] || "neutral").toLowerCase() },
        { direction: (dayMatch?.[1] || "neutral").toLowerCase() },
        { direction: (scpMatch?.[1] || "neutral").toLowerCase() },
      ],
      bullish: bullMatch ? parseInt(bullMatch[1]) : 0,
      bearish: bearMatch ? parseInt(bearMatch[1]) : 0,
    };
  }
} catch(e) { /* council unavailable */ }

// Read macro context
let macroPhase = "UNKNOWN", macroNarrative = "", macroLiquidity = "", macroMmxm = 0;
try {
  const md = fs.readFileSync(path.join(ROOT, "stages", "00_macro_context", "output", "cycle_phase.md"), "utf8");
  macroPhase = (md.match(/\*\*([A-Z]+)\*\*/) || [,"UNKNOWN"])[1];
  macroNarrative = (md.match(/Phase Narrative\n(.+)/) || [,""])[1] || "";
  macroLiquidity = (md.match(/Liquidity-Phase Coherence.*?\n(.+)/) || [,""])[1] || "";
  macroMmxm = parseInt((md.match(/MMXM Step.*?(\d)/) || [,"0"])[1]) || 0;
} catch(e) {}

// Read conflict data
let conflictWarnings = "";
try {
  const md = fs.readFileSync(path.join(ROOT, "stages", "04_model_selection", "output", `${PAIR.toLowerCase()}_active_models.md`), "utf8");
  const conflictSection = md.split("## Conflict Check")[1]?.split("## Confluence")[0] || "";
  conflictWarnings = conflictSection.includes("⚠️") ? conflictSection.trim() : "";
} catch(e) {}

// Read micro coherence
let coherence = 0;
try {
  const md = fs.readFileSync(path.join(ROOT, "stages", "05b_micro_confirmation", "output", `${PAIR.toLowerCase()}_coherence.md`), "utf8");
  coherence = parseInt((md.match(/\*\*(\d+)\/10\*\*/) || [,"0"])[1]) || 0;
} catch(e) {}

// Read invalidation
let invalidationSummary = "";
try {
  const md = fs.readFileSync(path.join(ROOT, "stages", "05b_micro_confirmation", "output", `${PAIR.toLowerCase()}_invalidation.md`), "utf8");
  invalidationSummary = md;
} catch(e) {}

// ── Build the Causal Chain ───────────────────────────────────────────────
// This is the core of narrative intelligence — connecting WHY each thing is true

function buildCausalChain() {
  const chain = [];
  const htfBias = r4h?.structure?.bias || r1d?.structure?.bias || "neutral";
  const bias1w = r1w?.structure?.bias || "neutral";
  const bias1d = r1d?.structure?.bias || "neutral";
  const bias4h = r4h?.structure?.bias || "neutral";
  const bias15m = r15m?.structure?.bias || "neutral";
  const bias5m = r5m?.structure?.bias || "neutral";
  const bias1m = r1m?.structure?.bias || "neutral";

  // 1. Weekly Foundation
  if (bias1w !== "neutral") {
    const trend = r1w?.structure?.lastEvent === "BOS" ? "continuation" : r1w?.structure?.lastEvent === "CHoCH" ? "potential change" : "established";
    chain.push({
      timeframe: "1W",
      event: r1w?.structure?.lastEvent || "structure",
      price: r1w?.structure?.lastEventPrice || r1w?.price,
      narrative: `The weekly chart shows a ${bias1w.toUpperCase()} structure with ${trend}. This is the macro foundation — all lower timeframe analysis must be read through this lens.${bias1w !== htfBias ? ' The trade direction OPPOSES the weekly trend — this is a counter-trend move within a larger structure, not a standalone trend.' : ' The trade direction ALIGNS with the weekly trend — the macro wind is at our back.'}`,
    });
  }

  // 2. Daily Transition
  if (bias1d !== "neutral") {
    const relation = bias1d === bias1w ? "CONTINUES" : bias1w !== "neutral" ? "DIVERGES from" : "establishes";
    const isManipulation = bias1w !== "neutral" && bias1d !== bias1w;
    chain.push({
      timeframe: "1D",
      event: r1d?.structure?.lastEvent || "structure",
      price: r1d?.structure?.lastEventPrice || r1d?.price,
      narrative: `The daily ${relation} the weekly. ${isManipulation ? `This divergence is the KEY to understanding today's market: the daily move against the weekly trend is MANIPULATION, not a genuine reversal. Institutions are engineering a ${bias1d} move to sweep liquidity before the real ${bias1w} move resumes.` : `The daily ${bias1d} bias confirms the larger picture — both timeframes agree, increasing conviction.`}`,
    });
  }

  // 3. 4H Entry Context
  const swept4h = (r4h?.liquidity || []).filter(p => p.swept);
  const hasOB4h = (r4h?.orderBlocks || []).length > 0;
  const disp4h = r4h?.volumeDisplacement?.label || "n/a";
  chain.push({
    timeframe: "4H",
    event: r4h?.structure?.lastEvent || "structure",
    price: r4h?.structure?.lastEventPrice || r4h?.price,
    narrative: `The 4H is our trade timeframe. ${r4h?.structure?.lastEvent} at ${r5(r4h?.structure?.lastEventPrice || 0)} confirms the ${bias4h} structure. ${swept4h.length > 0 ? `Liquidity sweep detected: ${swept4h.map(p => p.type + ' @ ' + r5(p.price)).join(', ')}. This is the INDUCEMENT — the manipulation that traps traders before the real move.` : 'No sweep yet — the manipulation may still be building.'} ${hasOB4h ? 'Order blocks present — institutional reference points for entry.' : 'No clear OBs — entry will use measured moves.'} Displacement is ${disp4h}.`,
  });

  // 4. 15m/5m Micro Confirmation
  const ltfAligned = bias15m === htfBias && bias5m === htfBias;
  const ltfDivergent = bias15m !== htfBias && bias15m !== "neutral";
  chain.push({
    timeframe: "15m/5m",
    event: `${r15m?.structure?.lastEvent || 'none'} / ${r5m?.structure?.lastEvent || 'none'}`,
    price: r15m?.price || r1h?.price,
    narrative: ltfAligned ?
      `The 15m and 5m both show ${htfBias} structure — LTF CONFIRMS HTF. This is the ideal entry environment: the lower timeframes agree with the higher timeframe direction.` :
      ltfDivergent ?
      `The 15m is ${bias15m} while HTF is ${htfBias}. This is a PULLBACK within the larger trend, not a reversal. The ${bias15m} move on 15m is counter-trend and likely to exhaust. Wait for LTF to realign with HTF before entering.` :
      `LTF structure is neutral — no clear micro confirmation yet. Wait for 5m/15m to commit to a direction.`,
  });

  // 5. 1m Trigger
  const fvg1m = (r1m?.fvgs || []).length;
  const swept1m = (r1m?.liquidity || []).filter(p => p.swept).length;
  chain.push({
    timeframe: "1m",
    event: r1m?.structure?.lastEvent || "none",
    price: r1m?.price,
    narrative: `The 1m shows ${bias1m} bias with ${fvg1m} FVGs. ${bias1m !== htfBias ? `The 1m ${bias1m} is a micro-bounce WITHIN the ${htfBias} trend — Scalpers can trade it but should NOT hold against the HTF.` : `The 1m ${bias1m} aligns with HTF — trigger may be imminent.`} ${swept1m > 0 ? 'Recent 1m sweep detected — micro-manipulation may have just occurred.' : ''} ${fvg1m > 0 ? `${fvg1m} FVG(s) available for entry refinement.` : 'No 1m FVG — wait for displacement to create entry inefficiency.'}`,
  });

  return chain;
}

const causalChain = buildCausalChain();

// ── Build Model-Fit Explanation ──────────────────────────────────────────
function explainModelFit() {
  const htfBias = r4h?.structure?.bias || "neutral";
  const hasOB = (r4h?.orderBlocks || []).length > 0 || (r1d?.orderBlocks || []).length > 0;
  const hasSweep = (r4h?.liquidity || []).some(p => p.swept) || (r1d?.liquidity || []).some(p => p.swept);
  const hasFVG = (r4h?.fvgs || []).length > 0 || (r15m?.fvgs || []).length > 0;
  const inKZ = (NY_HOUR >= 2 && NY_HOUR < 11) || (NY_HOUR >= 13 && NY_HOUR < 16); // London 02-08, NY AM 08-11, NY PM 13-16
  const inSB = (NY_HOUR >= 3 && NY_HOUR < 4) || (NY_HOUR >= 10 && NY_HOUR < 11) || (NY_HOUR >= 14 && NY_HOUR < 15);

  const explanations = [];

  // Silver Bullet
  if (inSB && htfBias !== "neutral") {
    explanations.push({
      model: "Silver Bullet",
      why: `Silver Bullet is appropriate RIGHT NOW because we are inside the ${inSB ? 'active' : ''} killzone window. The model is time-gated — it only works during specific 2-hour windows when institutional flow is highest. The ${htfBias} bias provides directional context. ${hasFVG ? 'FVGs are present for entry refinement.' : 'Waiting for a displacement FVG to form for the entry trigger.'}`,
      fit: "TIME-DRIVEN — this model is about WHEN, not WHAT",
    });
  } else {
    explanations.push({
      model: "Silver Bullet",
      why: `Silver Bullet is NOT currently appropriate — we are ${inKZ ? 'in a killzone but outside the SB window' : 'outside the killzone entirely'}. This model requires the 1-hour SB window (03-04, 10-11, or 14-15 NY). ${inKZ ? 'The killzone is active but the specific SB timing window is not.' : 'Wait for the next killzone.'}`,
      fit: "TIME-MISMATCHED — wrong window for this model",
    });
  }

  // MMXM
  if (hasOB && hasSweep) {
    explanations.push({
      model: "2022 Model (MMXM)",
      why: `MMXM fits the current market narrative perfectly. We have an unmitigated Order Block (the HTF POI — where institutions have unfilled orders), AND a liquidity sweep has occurred (the INDUCEMENT — trapping traders in the wrong direction). This is MMXM Step 2→3: manipulation confirmed, waiting for the return to POI for entry. ${htfBias === "bearish" ? 'The sweep took out BSL above — trapping breakout buyers. Price should now reverse DOWN from here.' : 'The sweep took out SSL below — trapping breakdown sellers. Price should now reverse UP from here.'}`,
      fit: "NARRATIVE-DRIVEN — the market is telling the MMXM story step by step",
    });
  } else if (hasOB) {
    explanations.push({
      model: "2022 Model (MMXM)",
      why: `MMXM Step 1 is present (HTF POI identified — ${hasOB ? 'OB found' : 'no OB'}) but Step 2 is NOT yet confirmed (${hasSweep ? 'sweep detected' : 'no sweep yet'}). The market hasn't completed the manipulation phase. WAIT for the inducement sweep before MMXM entry conditions are fully met.`,
      fit: "PARTIAL — Step 1 complete, waiting for Step 2 (inducement)",
    });
  } else {
    explanations.push({
      model: "2022 Model (MMXM)",
      why: `MMXM requires a clear HTF Point of Interest (unmitigated OB or significant FVG). Currently no clear POI is present — ${hasOB ? 'OBs found' : 'no OBs'}, ${hasFVG ? 'FVGs found' : 'no FVGs'}. Without a POI, the MMXM framework cannot be applied.`,
      fit: "NOT APPLICABLE — missing HTF POI",
    });
  }

  // Turtle Soup
  if (hasSweep) {
    explanations.push({
      model: "Turtle Soup",
      why: `Turtle Soup is the pure manipulation entry — enter ON the sweep reversal. A sweep just occurred (${(r4h?.liquidity || []).filter(p => p.swept).map(p => p.type).join(', ')}), making Turtle Soup eligible. This model fades the sweep: it assumes the breakout is FALSE and price will reverse. ${macroPhase === 'MANIPULATION' ? 'The macro cycle is in MANIPULATION phase — this is EXACTLY where Turtle Soup shines.' : 'The cycle phase may not be optimal for Turtle Soup — it works best in manipulation.'}`,
      fit: "SWEEP-DRIVEN — sweep detected, reversal expected",
    });
  }

  // Breaker Block
  const hasBreaker = (r4h?.orderBlocks || []).some(o => o.kind === "Breaker");
  if (hasBreaker) {
    explanations.push({
      model: "Breaker Block",
      why: `A Breaker Block has been detected — a previously mitigated OB that price has broken through and flipped polarity. This is a powerful reversal/continuation signal. The old ${r4h?.orderBlocks?.find(o => o.kind === 'Breaker')?.type} OB is now acting as the opposite — institutions have absorbed the orders and reversed.`,
      fit: "STRUCTURE-DRIVEN — breaker detected, polarity flipped",
    });
  }

  return explanations;
}

const modelExplanations = explainModelFit();

// ── Build Invalidation Narrative ─────────────────────────────────────────
function buildInvalidationStory() {
  const htfBias = r4h?.structure?.bias || "neutral";
  const swHi = r4h?.structure?.lastSwingHigh || 0;
  const swLo = r4h?.structure?.lastSwingLow || 0;

  return {
    primary: htfBias === "bearish" ?
      `If price CLOSES above ${r5(swHi)} (4H swing high) — the bearish structure is invalidated. A close above the swing high means buyers have absorbed all the selling pressure. The manipulation thesis is WRONG — this is not a trap, it's a genuine breakout. EXIT the short immediately.` :
      `If price CLOSES below ${r5(swLo)} (4H swing low) — the bullish structure is invalidated. A close below the swing low means sellers have overwhelmed buyers. EXIT the long immediately.`,
    secondary: [
      `If the 1D flips to ${htfBias === 'bearish' ? 'BULLISH' : 'BEARISH'} — the daily trend has changed. The HTF thesis is no longer valid. Close all positions and re-evaluate.`,
      `If DXY correlation breaks (DXY moves WITH ${pairLabel} instead of against it) — the dollar-direction thesis is weakening. Reduce position size by 50%.`,
      `If ${macroPhase} shifts to ${macroPhase === 'MANIPULATION' ? 'EXPANSION' : macroPhase === 'DISTRIBUTION' ? 'ACCUMULATION' : 'a different phase'} — the cycle context has changed. Re-evaluate model appropriateness.`,
      `If the killzone window closes without an entry trigger — TIME invalidation. The setup didn't fire in time. Cancel pending orders and wait for the next window.`,
      `If 1m and 5m both flip ${htfBias === 'bearish' ? 'BULLISH' : 'BEARISH'} for 3+ consecutive candles — MICRO invalidation. The LTF is no longer pulling back; it's reversing. Tighten SL.`,
    ],
    narrative: `The invalidation story is: "${htfBias === 'bearish' ? 'We are short because the structure is bearish. We are WRONG if price proves the structure has changed — a close above the swing high. Everything else is noise. The cycle, the correlation, the micro — they all support the thesis but the swing high is the line in the sand.' : 'We are long because the structure is bullish. We are WRONG if price proves the structure has changed — a close below the swing low. Everything else supports the thesis but that level is the invalidation.'}"`,
  };
}

const invalidationStory = buildInvalidationStory();

// ── Build Bias Awareness ─────────────────────────────────────────────────
function buildBiasAwareness() {
  const bias1d = r1d?.structure?.bias || "neutral";
  const bias4h = r4h?.structure?.bias || "neutral";
  const conf1d = r1d?.structure?.confidence || 0;
  const conf4h = r4h?.structure?.confidence || 0;

  const evidence = [];
  if (r4h?.structure?.lastEvent === "BOS") evidence.push("4H BOS (Break of Structure) — continuation confirmed");
  if (r4h?.structure?.lastEvent === "CHoCH") evidence.push("4H CHoCH (Change of Character) — potential reversal");
  if (r1d?.structure?.lastEvent === "BOS") evidence.push("1D BOS — daily structure intact");
  if ((r4h?.liquidity || []).some(p => p.swept)) evidence.push("Liquidity sweep — institutional manipulation detected");
  if ((r4h?.orderBlocks || []).length > 0) evidence.push(`${r4h?.orderBlocks?.length} Order Block(s) — institutional reference levels present`);
  if ((r4h?.fvgs || []).length > 0) evidence.push(`${r4h?.fvgs?.length} FVG(s) — price inefficiencies to fill`);
  if (bias1d === bias4h) evidence.push("1D and 4H aligned — no timeframe conflict");
  if (bias1d !== bias4h && bias1d !== "neutral" && bias4h !== "neutral") evidence.push("1D and 4H diverging — HTF conflict, reduced conviction");

  return {
    bias: bias4h,
    strength: conf4h > 0.8 ? "STRONG" : conf4h > 0.5 ? "MODERATE" : "WEAK",
    foundation: `The ${bias4h.toUpperCase()} bias is built on ${evidence.length} pieces of structural evidence, not a single indicator. Confidence is ${conf4h > 0.8 ? 'high' : conf4h > 0.5 ? 'moderate' : 'low'} because ${conf4h > 0.8 ? 'multiple confirmations align' : conf4h > 0.5 ? 'most signals agree but some conflict' : 'signals are mixed or weak'}.`,
    evidence,
    context: macroPhase !== "UNKNOWN" ?
      `This ${bias4h} bias exists within a ${macroPhase} cycle phase. ${macroPhase === 'MANIPULATION' ? 'In manipulation, bias direction is LESS important than sweep detection — the sweep tells you where the REAL move will go, which may be opposite the current bias.' : macroPhase === 'DISTRIBUTION' ? 'In distribution, bias is HIGHLY reliable — the trend is established and continuing.' : macroPhase === 'ACCUMULATION' ? 'In accumulation, bias is UNRELIABLE — the market is ranging and can break either way.' : 'In expansion, bias is reliable but late — the move may be near exhaustion.'}` :
      "No cycle context available — bias is based on structure alone.",
  };
}

const biasAwareness = buildBiasAwareness();

// ── Assemble the Full Narrative ──────────────────────────────────────────
const htfBias = r4h?.structure?.bias || "neutral";
const htfDir = htfBias === "bearish" ? "SHORT" : htfBias === "bullish" ? "LONG" : "NONE";
const entryPrice = r1h?.price || r4h?.price || 0;

let story = `# The Market's Story — ${pairLabel} — ${DATE}

## The Narrative

${causalChain.map((c, i) => `
### ${i === 0 ? 'I. MACRO FOUNDATION' : i === 1 ? 'II. THE TRANSITION' : i === 2 ? 'III. THE TRADE CONTEXT' : i === 3 ? 'IV. MICRO CONFIRMATION' : 'V. THE TRIGGER'} — ${c.timeframe}
${c.narrative}
`).join("\n")}

---

## Why These Models? (Not Just Scores)

Model selection is narrative-driven, not pattern-matched. Each model tells a different part of the market's story.

${modelExplanations.map(m => `
### ${m.model}
**Fit**: ${m.fit}
**Why**: ${m.why}
`).join("\n")}

---

## The Bias — And WHY It Exists

**Direction**: ${biasAwareness.bias.toUpperCase()} — ${biasAwareness.strength}

${biasAwareness.foundation}

**Evidence chain**:
${biasAwareness.evidence.map(e => `- ${e}`).join("\n")}

**Cycle context**: ${biasAwareness.context}

---

## The Invalidation Story

${invalidationStory.narrative}

### Primary Invalidation (The Line in the Sand)
${invalidationStory.primary}

### Secondary Invalidations (Early Warnings)
${invalidationStory.secondary.map((s, i) => `${i + 1}. ${s}`).join("\n")}

---

## The Council's Read

${council ? `
| Archetype | Direction | Sees |
|-----------|-----------|------|
| Position (1W) | ${(council.votes[0].direction || council.votes[0]).toUpperCase()} | ${r1w?.structure?.bias === (council.votes[0].direction || council.votes[0]) ? 'The weekly structure supports this read' : 'Note: weekly structure may conflict with this vote'} |
| Swing (4H/1D) | ${(council.votes[1].direction || council.votes[1]).toUpperCase()} | ${r4h?.structure?.bias === (council.votes[1].direction || council.votes[1]) ? 'Aligned with 4H structure' : 'May be seeing something the 4H alone does not capture'} |
| Day (15m/1H) | ${(council.votes[2].direction || council.votes[2]).toUpperCase()} | Entry timing and session context |
| Scalp (1m/5m) | ${(council.votes[3].direction || council.votes[3]).toUpperCase()} | Micro trigger readiness |

**Verdict**: ${council.verdict} (${council.confidencePct}%)
**Action**: ${council.action}
` : 'Council data unavailable — run tools/council.cjs first.'}

---

## Putting It All Together

${htfDir !== "NONE" ? `
The market is telling us a coherent story:

**${pairLabel} is in a ${macroPhase} phase within a larger ${r1w?.structure?.bias?.toUpperCase() || 'NEUTRAL'} weekly structure.**

${causalChain.slice(0, 3).map(c => c.narrative.split('.')[0] + '.').join(' ')}

${macroPhase === 'MANIPULATION' ? 'This is NOT a trend trade — it\'s a manipulation trade. The move is engineered to trap traders before the real direction emerges. Enter on the reversal, not the breakout.' : macroPhase === 'DISTRIBUTION' ? 'This IS a trend trade. The structure is established and institutions are distributing. Ride the trend, trail stops, and let winners run.' : 'The cycle phase is unclear — trade with caution and reduced size.'}

**The Council sees this**: ${council ? council.verdict : 'N/A'} (${council ? council.confidencePct + '%' : 'N/A'}). ${council?.confidencePct >= 70 ? 'High conviction — the archetypes agree on the story.' : council?.confidencePct >= 40 ? 'Moderate conviction — most archetypes agree but some dissent.' : 'Low conviction — the Council is divided. The story may not be clear yet.'}

**The invalidation is clear**: ${invalidationStory.primary.split('.')[0]}.

**This is not pattern matching.** This is understanding the story the market is telling, at every timeframe, with every archetype, and knowing exactly where the story would be wrong.
` : 'The market is not giving a clear directional story right now. The bias is neutral — wait for structure to commit before assigning narrative.'}

---

*Generated: ${new Date().toISOString()} | Narrative Engine v1.0*
*"The market is a storyteller. Our job is to listen, not to guess."*
`;

// ── Output ────────────────────────────────────────────────────────────────
const outDir = path.join(ROOT, "stages", "00_council_vote", "output");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `${PAIR.toLowerCase()}_narrative.md`), story, "utf8");

console.log(JSON.stringify({
  pair: pairLabel,
  bias: biasAwareness.bias,
  strength: biasAwareness.strength,
  phase: macroPhase,
  coherence,
  councilVerdict: council?.verdict || "N/A",
  narrativeLength: story.length,
  output: `stages/00_council_vote/output/${PAIR.toLowerCase()}_narrative.md`,
}, null, 2));
