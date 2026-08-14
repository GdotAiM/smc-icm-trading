// Fractal MMXM Coherence Engine
// ICT teaches: MMXM is fractal. It nests on EVERY timeframe simultaneously.
// This engine detects MMXM steps per TF, checks nesting, finds the 1m Inversion.
// "The MMXM on the 4H is the STORY. The 5m is the CHAPTER. The 1m is the SENTENCE."

const fs = require("fs");
const path = require("path");
const { CONFIG } = require("./lib/engine_config.cjs");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..");
const DATE = require("./ny_time.cjs").getNYDate();

function r2(v) { return Number(v).toFixed(2); }
function r5(v) { return Number(v).toFixed(5); }

const PAIR = process.argv[2] || "GBPUSD";
const pairLabel = PAIR === "GOLD" ? "XAUUSD" : PAIR;
const sharedDir = path.join(ROOT, "shared", DATE, PAIR);

// ── Load all 7 timeframes ────────────────────────────────────────────────
const TFS = ["1W", "1D", "4H", "1H", "15m", "5m", "1m"];
const reports = {};
for (const tf of TFS) {
  try { reports[tf] = JSON.parse(fs.readFileSync(path.join(sharedDir, `engine_${tf.toLowerCase()}.json`), "utf8")); }
  catch { reports[tf] = null; }
}

// ── MMXM Step Classifier ─────────────────────────────────────────────────
// Classifies each timeframe into one of 5 MMXM steps based on ICT criteria:
// Step 1: ORIGINAL CONSOLIDATION — Range-bound, no clear BOS, low displacement
// Step 2: MANIPULATION (Smart Money Reversal starts) — Sweep + reversal close
// Step 3: DISTRIBUTION (Expansion) — BOS in direction, displacement, FVGs forming
// Step 4: RE-ACCUMULATION — Return to PD Array, OB/FVG retest
// Step 5: COMPLETION — Opposite external liquidity taken, cycle ending

function classifyMmxmStep(report, tf) {
  if (!report) return { step: 0, label: "NO DATA", confidence: 0, narrative: "No data" };

  const bias = report.structure.bias;
  const event = report.structure.lastEvent || "none";
  const swept = (report.liquidity || []).filter(p => p.swept);
  const unsweptBSL = (report.liquidity || []).filter(p => p.type === "BSL" && !p.swept);
  const unsweptSSL = (report.liquidity || []).filter(p => p.type === "SSL" && !p.swept);
  const fvgs = report.fvgs || [];
  const obs = report.orderBlocks || [];
  const displabel = report.volumeDisplacement?.label || "weak";
  const dispRatio = report.volumeDisplacement?.atrRatio || 0;
  const swHi = report.structure.lastSwingHigh || report.price;
  const swLo = report.structure.lastSwingLow || report.price;
  const range = Math.abs(swHi - swLo) / report.price;

  // Step 5: COMPLETION — Opposite external liquidity taken
  const oppLiqTaken = (bias === "bearish" && swept.some(p => p.type === "SSL")) ||
                      (bias === "bullish" && swept.some(p => p.type === "BSL"));
  if (oppLiqTaken && displabel === "strong" && fvgs.length >= 1) {
    return { step: 5, label: "COMPLETION", confidence: 0.7, narrative: `Opposing liquidity taken. ${bias} cycle completing. ${swept.length} pool(s) swept.` };
  }

  // Step 4: RE-ACCUMULATION — Price returning to PD Array (OB/FVG zone)
  const nearOB = obs.some(ob => {
    const mid = (ob.proximal + ob.distal) / 2;
    return Math.abs(report.price - mid) / report.price < 0.002;
  });
  if (nearOB && displabel === "weak" && swept.length > 0) {
    return { step: 4, label: "RE-ACCUMULATION", confidence: 0.65, narrative: `Price returning to OB/FVG zone. Building base before next expansion. ${swept.length} prior sweep(s).` };
  }
  if (nearOB && displabel !== "strong") {
    return { step: 4, label: "RE-ACCUMULATION", confidence: 0.55, narrative: "Price near PD Array — potential re-accumulation. Watch for base to form." };
  }

  // Step 3: DISTRIBUTION — Clear BOS in direction, displacement, FVGs
  const hasBOS = event === "BOS";
  const hasFVG = fvgs.length > 0;
  if (hasBOS && bias !== "neutral" && (hasFVG || displabel === "strong" || displabel === "moderate")) {
    return { step: 3, label: "DISTRIBUTION", confidence: 0.8, narrative: `BOS ${bias} confirmed. ${hasFVG ? fvgs.length + ' FVG(s)' : 'No FVGs'}. Displacement: ${displabel} (${r2(dispRatio)}x). Trend is distributing.` };
  }
  if (hasBOS && bias !== "neutral") {
    return { step: 3, label: "DISTRIBUTION", confidence: 0.6, narrative: `BOS ${bias} detected. Distribution beginning. Waiting for displacement confirmation.` };
  }

  // Step 2: MANIPULATION — Sweep detected with reversal
  if (swept.length > 0 && event === "CHoCH") {
    return { step: 2, label: "MANIPULATION", confidence: 0.85, narrative: `Sweep (${swept.map(p => p.type).join(',')}) + CHoCH reversal. Classic manipulation. The trap is set — wait for reversal to confirm.` };
  }
  if (swept.length > 0 && displabel !== "strong") {
    return { step: 2, label: "MANIPULATION", confidence: 0.7, narrative: `${swept.length} pool(s) swept. Manipulation in progress. Watch for CHoCH confirmation.` };
  }
  if (event === "CHoCH" && displabel !== "weak") {
    return { step: 2, label: "MANIPULATION", confidence: 0.65, narrative: `CHoCH detected. Potential manipulation reversal. Wait for sweep confirmation.` };
  }

  // Step 1: ORIGINAL CONSOLIDATION — Range-bound or early structure
  if (bias === "neutral" || displabel === "weak") {
    return { step: 1, label: "CONSOLIDATION", confidence: 0.7, narrative: `Range-bound with ${displabel} displacement. Accumulation/distribution base forming. Wait for sweep.` };
  }
  if (range < 0.003 && swept.length === 0) {
    return { step: 1, label: "CONSOLIDATION", confidence: 0.6, narrative: "Tight range, no sweep. Original consolidation. Wait for breakout or manipulation." };
  }

  // Default
  return { step: 1, label: "CONSOLIDATION", confidence: 0.4, narrative: `Early structure. Bias: ${bias}. No clear MMXM step yet.` };
}

// ── Run classification on all TFs ────────────────────────────────────────
const mmxm = {};
for (const tf of TFS) {
  mmxm[tf] = classifyMmxmStep(reports[tf], tf);
}

// ── 1m Inversion Detection ───────────────────────────────────────────────
// ICT: "Inversion = price breaks a level, returns, and closes in the opposite direction"
// This is different from a breakout — it signals genuine reversal, not just liquidity collection.
function detectInversion(report1m, report5m, htfBias) {
  if (!report1m) return { detected: false, narrative: "No 1m data" };

  const r1m = report1m;
  const bias1m = r1m.structure.bias;
  const event1m = r1m.structure.lastEvent || "none";
  const swept1m = (r1m.liquidity || []).filter(p => p.swept);
  const fvgs1m = r1m.fvgs || [];
  const disp1m = r1m.volumeDisplacement?.label || "weak";
  const dispRatio = r1m.volumeDisplacement?.atrRatio || 0;

  // WP-15: Inversion is a SEQUENCE, not a score — ICT teaches the 1m "sentence":
  //   SWEEP (subject) → CHoCH (verb) → FVG (object)
  // You either have a complete sentence or you don't. Alignment and displacement
  // are quality modifiers — they affect confidence and sizing, not detection.
  const hasCHoCH = event1m === "CHoCH";
  const hasRecentSweep = swept1m.length > 0;
  const alignedWithHTF = bias1m === htfBias;
  const hasEntryFVG = fvgs1m.some(f => f.type === htfBias);
  const strongDisp = disp1m === "strong" || disp1m === "moderate";

  // Core sequence: all three must pass for inversion to be detected
  const coreSequence = hasCHoCH && hasRecentSweep && hasEntryFVG;
  // Quality grade (informational — affects narrative, not detection)
  const qualityScore = (alignedWithHTF ? 1 : 0) + (strongDisp ? 1 : 0);
  const quality = qualityScore === 2 ? "PREMIUM" : qualityScore === 1 ? "ADEQUATE" : "WEAK";

  // Legacy numeric score (kept for CONFIG compatibility, but detection is sequence-based)
  const score = (hasCHoCH ? 2 : 0) + (hasRecentSweep ? 2 : 0) + (hasEntryFVG ? 2 : 0) + (alignedWithHTF ? 1 : 0) + (strongDisp ? 1 : 0);

  const detected = coreSequence;

  return {
    detected,
    score,
    maxScore: 8,
    coreSequence,          // NEW: the boolean sequence gate
    quality,               // NEW: PREMIUM / ADEQUATE / WEAK
    qualityScore,
    hasCHoCH, hasRecentSweep, alignedWithHTF, hasEntryFVG, strongDisp,
    narrative: detected ?
      `✅ 1m INVERSION DETECTED — SWEEP + CHoCH + FVG complete. Quality: ${quality}. The entry sentence is written.` :
      !hasRecentSweep && !hasCHoCH ?
      `⏳ 1m Inversion NOT READY — no sweep AND no CHoCH on 1m. Price hasn't begun the reversal sentence.` :
      !hasRecentSweep ?
      `⏳ 1m Inversion MISSING SWEEP — CHoCH detected but no liquidity swept. Wait for sweep before the reversal.` :
      !hasCHoCH ?
      `⏳ 1m Inversion MISSING CHoCH — sweep present but no structure reversal (event=${event1m}). Need CHoCH, not just BOS.` :
      `⏳ 1m Inversion MISSING FVG — sweep + CHoCH present but no displacement FVG in ${htfBias} direction. Wait for the object of the sentence.`,
  };
}

// ── CISD Detection (5m) ──────────────────────────────────────────────────
// Change in State of Delivery = engulfing candle that closes beyond prior opposing candles
function detectCISD(report5m) {
  if (!report5m || !report5m.candles || report5m.candles.length < 5) {
    return { detected: false, narrative: "Insufficient candle data" };
  }

  const candles = report5m.candles;
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const prev2 = candles[candles.length - 3];

  const lastBody = Math.abs(last.close - last.open);
  const lastRange = last.high - last.low;
  const prevBody = Math.abs(prev.close - prev.open);

  // Engulfing: last candle body > previous candle body AND closes beyond previous candle's range
  const bullishEngulf = last.close > last.open && last.close > prev.high && last.open < prev.low && lastBody > prevBody * 1.2;
  const bearishEngulf = last.close < last.open && last.close < prev.low && last.open > prev.high && lastBody > prevBody * 1.2;

  const detected = bullishEngulf || bearishEngulf;
  const direction = bullishEngulf ? "bullish" : bearishEngulf ? "bearish" : "none";

  return {
    detected,
    direction,
    narrative: detected ?
      `✅ CISD DETECTED — ${direction} engulfing candle on 5m. Change in State of Delivery confirmed.` :
      "No CISD on 5m — waiting for engulfing confirmation candle.",
  };
}

// ── Fractal Nesting Check ─────────────────────────────────────────────────
// ICT: The MMXM steps should nest correctly across timeframes.
// Correct nesting: HTF Step N → Mid-TF Step N+1 or N → LTF Step N+1 or N+2
// The LTF should be AHEAD of the HTF in the cycle (closer to entry)
function checkFractalNesting(mmxm, htfBias) {
  const tfOrder = ["1W", "1D", "4H", "1H", "15m", "5m", "1m"];
  const checks = [];

  for (let i = 0; i < tfOrder.length - 1; i++) {
    const htf = tfOrder[i];
    const ltf = tfOrder[i + 1];
    const hStep = mmxm[htf].step;
    const lStep = mmxm[ltf].step;

    if (hStep === 0 || lStep === 0) continue;

    // Valid nesting: LTF step should be >= HTF step (LTF is further along the cycle)
    // OR HTF step 1-2 and LTF step 2-3 (LTF sees manipulation/distribution while HTF consolidates)
    const validNesting = (lStep >= hStep) || (hStep <= 2 && lStep >= 2);

    if (validNesting) {
      checks.push({ htf, ltf, hStep, lStep, status: "VALID", detail: `${htf} Step ${hStep} → ${ltf} Step ${lStep} — correctly nested` });
    } else {
      checks.push({ htf, ltf, hStep, lStep, status: "BROKEN", detail: `${htf} Step ${hStep} → ${ltf} Step ${lStep} — LTF behind HTF. Nesting broken.` });
    }
  }

  const validCount = checks.filter(c => c.status === "VALID").length;
  const brokenCount = checks.filter(c => c.status === "BROKEN").length;
  const score = Math.round((validCount / Math.max(1, checks.length)) * 6); // 0-6 points

  return {
    checks,
    validCount,
    brokenCount,
    score,
    maxScore: 6,
    narrative: brokenCount === 0 ?
      "✅ PERFECT NESTING — all timeframes correctly aligned. The MMXM is nesting properly from 1W → 1m." :
      brokenCount <= 2 ?
      `⚠️ ${brokenCount} nesting break(s). Minor misalignment — the fractal is mostly intact.` :
      `❌ ${brokenCount} nesting breaks. The MMXM is NOT nesting correctly across timeframes. Wait for alignment.`,
  };
}

// ── Run all detections ────────────────────────────────────────────────────
const htfBias = (reports["4H"] || reports["1D"] || reports["1H"])?.structure?.bias || "neutral";
const inversion = detectInversion(reports["1m"], reports["5m"], htfBias);
const cisd = detectCISD(reports["5m"]);
const nesting = checkFractalNesting(mmxm, htfBias);

// ── SMT Divergence ────────────────────────────────────────────────────────
// Check if SMT divergence exists from engine reports
function detectSMT(report1m, report5m) {
  if (!report1m || !report5m) return { detected: false, narrative: "Insufficient data for SMT" };
  // SMT is detected by the engine's SMT module — check if it's present in any report
  const hasSMT1m = report1m.smt?.detected;
  const hasSMT5m = report5m.smt?.detected;
  const detected = hasSMT1m || hasSMT5m;
  return {
    detected,
    narrative: detected ? "✅ SMT Divergence detected — correlated pair diverging. Smart money signal." : "No SMT divergence detected. Check correlated pairs manually.",
  };
}
const smt = detectSMT(reports["1m"], reports["5m"]);

// ── The 6 Confirmations Checklist ────────────────────────────────────────
const sixConfirmations = [
  { name: "SMT Divergence", passed: smt.detected, detail: smt.narrative },
  { name: "Liquidity Sweep", passed: mmxm["1H"].step >= 2 || mmxm["4H"].step >= 2, detail: `Sweep detected on ${mmxm["1H"].step >= 2 ? '1H' : mmxm["4H"].step >= 2 ? '4H' : 'none'}` },
  { name: "MSS / CHoCH", passed: (reports["5m"]?.structure?.lastEvent === "CHoCH" || reports["5m"]?.structure?.lastEvent === "BOS"), detail: `5m event: ${reports["5m"]?.structure?.lastEvent || 'none'}` },
  { name: "CISD (Engulfing)", passed: cisd.detected, detail: cisd.narrative },
  { name: "FVG Creation", passed: (reports["5m"]?.fvgs || []).length > 0 || (reports["1m"]?.fvgs || []).length > 0, detail: `5m: ${(reports['5m']?.fvgs || []).length} FVGs, 1m: ${(reports['1m']?.fvgs || []).length} FVGs` },
  { name: "HTF PD Array", passed: mmxm["4H"].step >= 2 || mmxm["1D"].step >= 2, detail: `HTF at Step ${Math.max(mmxm['4H'].step, mmxm['1D'].step)} — ${mmxm['4H'].step >= 2 ? 'PD Array context active' : 'Waiting for HTF context'}` },
];

const confirmationsPassed = sixConfirmations.filter(c => c.passed).length;

// ── Fractal Coherence Score ───────────────────────────────────────────────
const fractalScore = nesting.score + inversion.score + (cisd.detected ? 2 : 0) + (smt.detected ? 1 : 0) + Math.min(3, confirmationsPassed);
const fractalMax = 6 + 8 + 2 + 1 + 3; // 20

function fractalLabel(s) {
  if (s >= 16) return "✅ FRACTAL CONFIRMED — MMXM nesting perfectly. The 1m Inversion is the sentence within the 5m chapter within the 4H story. ENTER.";
  if (s >= 12) return "✅ HIGH fractal coherence — nesting mostly intact. 1m Inversion building. Near entry.";
  if (s >= 8) return "⏳ MODERATE fractal coherence — some nesting gaps. Wait for tighter alignment.";
  if (s >= 4) return "⏳ LOW fractal coherence — nesting is loose. Let the cycles develop further.";
  return "❌ NO fractal coherence — MMXM cycles are not aligned. Do not enter.";
}

// ── Output ────────────────────────────────────────────────────────────────
const outDir = path.join(ROOT, "stages", "05b_micro_confirmation", "output");
fs.mkdirSync(outDir, { recursive: true });

const out = `# Fractal MMXM Coherence — ${pairLabel} — ${DATE}

## HTF Direction: **${htfBias.toUpperCase()}**

## MMXM Steps Per Timeframe

| TF | Step | Label | Confidence | Narrative |
|----|------|-------|------------|-----------|
${TFS.map(tf => `| ${tf} | **${mmxm[tf].step}** | ${mmxm[tf].label} | ${r2(mmxm[tf].confidence)} | ${mmxm[tf].narrative} |`).join("\n")}

## Fractal Nesting Check (6 pairs)

${nesting.checks.map(c => `- ${c.status === 'VALID' ? '✅' : '❌'} ${c.htf} Step ${c.hStep} → ${c.ltf} Step ${c.lStep} — ${c.detail}`).join("\n")}

**Nesting Score**: ${nesting.score}/${nesting.maxScore} — ${nesting.narrative}

## 1m Inversion Detection

**Score**: ${inversion.score}/${inversion.maxScore}

| Signal | Status |
|--------|--------|
| CHoCH on 1m | ${inversion.hasCHoCH ? '✅' : '✗'} |
| Recent sweep on 1m | ${inversion.hasRecentSweep ? '✅' : '✗'} |
| 1m bias aligned with HTF (${htfBias}) | ${inversion.alignedWithHTF ? '✅' : '✗'} |
| Entry FVG on 1m | ${inversion.hasEntryFVG ? '✅' : '✗'} |
| Strong displacement | ${inversion.strongDisp ? '✅' : '✗'} |

**${inversion.narrative}**

## 5m CISD (Change in State of Delivery)

**${cisd.narrative}**

## SMT Divergence

**${smt.narrative}**

## The 6 Confirmations

| # | Confirmation | Status | Detail |
|---|-------------|--------|--------|
${sixConfirmations.map((c, i) => `| ${i + 1} | ${c.name} | ${c.passed ? '✅' : '✗'} | ${c.detail} |`).join("\n")}

**Passed**: ${confirmationsPassed}/6

## Fractal Coherence Score: **${fractalScore}/${fractalMax}**

**${fractalLabel(fractalScore)}**

---

*"The MMXM on the 4H is the STORY. The 5m is the CHAPTER. The 1m is the SENTENCE where you enter."*
`;

fs.writeFileSync(path.join(outDir, `${PAIR.toLowerCase()}_fractal_mmxm.md`), out, "utf8");

// Only run CLI output when executed directly (not required as a module)
if (require.main === module) {
  console.log(JSON.stringify({
    pair: pairLabel,
    htfBias,
    mmxmSteps: Object.fromEntries(TFS.map(tf => [tf, mmxm[tf].step])),
    nestingScore: nesting.score,
    nestingMax: nesting.maxScore,
    inversionScore: inversion.score,
    inversionMax: inversion.maxScore,
    inversionDetected: inversion.detected,
    cisdDetected: cisd.detected,
    smtDetected: smt.detected,
    confirmationsPassed,
    fractalScore,
    fractalMax,
    fractalLabel: fractalLabel(fractalScore),
    output: `stages/05b_micro_confirmation/output/${PAIR.toLowerCase()}_fractal_mmxm.md`,
  }, null, 2));
}

module.exports = {
  classifyMmxmStep,
  detectInversion,
  checkFractalNesting,
  detectCISD,
  detectSMT,
  fractalLabel,
};
