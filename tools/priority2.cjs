// Priority 2 Gap Closure: CISD engine + BPR + per-session Po3 + ISD Sequence
const fs = require("fs");
const path = require("path");
const ny = require("./ny_time.cjs");

const ROOT = "C:\\Users\\cash\\smc-icm-trading";
const DATE = new Date().toISOString().split("T")[0];

function r2(v) { return Number(v).toFixed(2); }
function r5(v) { return Number(v).toFixed(5); }

const PAIR = process.argv[2] || "GBPUSD";
const pairLabel = PAIR === "GOLD" ? "XAUUSD" : PAIR;
const sharedDir = path.join(ROOT, "shared", DATE, PAIR);

function loadEngine(tf) {
  try { return JSON.parse(fs.readFileSync(path.join(sharedDir, `engine_${tf.toLowerCase()}.json`), "utf8")); }
  catch { return null; }
}
function loadRaw(tf) {
  try {
    const f = path.join(process.env.TEMP || "/tmp", `${PAIR}_${tf.toLowerCase()}.json`);
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8"));
    return null;
  } catch(e) { return null; }
}

const r4h = loadEngine("4h"), r1h = loadEngine("1h"), r1d = loadEngine("1d"), r15m = loadEngine("15m");
const raw4H = loadRaw("4h"), raw1D = loadRaw("1d"), raw5m = loadRaw("5m");

// ═══════════════════════════════════════════════════════════════════
// GAP 1.1: CISD Moved Into Engine-Quality Detection
// ═══════════════════════════════════════════════════════════════════
function detectCISDEngine(candles) {
  if (!candles || candles.length < 5) return { detected: false, grade: "N/A", direction: "none", narrative: "Insufficient data" };

  const last = candles[candles.length - 1], prev = candles[candles.length - 2];
  const lastBody = Math.abs(last.close - last.open), prevBody = Math.abs(prev.close - prev.open);
  const lastRange = last.high - last.low, prevRange = prev.high - prev.low;
  const bodyRatio = lastRange > 0 ? lastBody / lastRange : 0;

  const bullCISD = last.open < prev.low && last.close > prev.high && bodyRatio > 0.5;
  const bearCISD = last.open > prev.high && last.close < prev.low && bodyRatio > 0.5;
  const detected = bullCISD || bearCISD;
  const direction = bullCISD ? "bullish" : bearCISD ? "bearish" : "none";
  const strength = (detected ? 3 : 0) + (lastBody > prevBody * 1.5 ? 1 : 0) + (lastRange > prevRange * 1.1 ? 1 : 0) + (bodyRatio > 0.7 ? 1 : 0);
  const grade = strength >= 5 ? "A" : strength >= 4 ? "B" : strength >= 3 ? "C" : "none";

  return {
    detected, grade, direction, strength, maxStrength: 6,
    narrative: detected ? `✅ CISD Grade ${grade} — ${direction} engulfing. State of Delivery shifted.` : "No CISD detected.",
    bodyRatio: r2(bodyRatio), engulfRatio: r2(lastBody / Math.max(prevBody, 0.0001)),
  };
}

// ═══════════════════════════════════════════════════════════════════
// GAP 2.3: BPR (Balanced Price Range) — overlapping FVG zones
// ═══════════════════════════════════════════════════════════════════
function detectBPR(report) {
  if (!report) return { detected: false, zones: [], narrative: "No data" };
  const fvgs = report.fvgs || [];
  if (fvgs.length < 2) return { detected: false, zones: [], narrative: `Only ${fvgs.length} FVG(s) — need 2+ for BPR` };

  const bprs = [];
  for (let i = 0; i < fvgs.length; i++) {
    for (let j = i + 1; j < fvgs.length; j++) {
      const a = fvgs[i], b = fvgs[j];
      if (a.type === b.type) continue; // BPR needs opposite-type FVGs overlapping
      const overlapTop = Math.min(a.top, b.top);
      const overlapBottom = Math.max(a.bottom, b.bottom);
      if (overlapTop > overlapBottom) {
        bprs.push({ top: overlapTop, bottom: overlapBottom, size: overlapTop - overlapBottom, fvg1: a.type, fvg2: b.type });
      }
    }
  }

  return {
    detected: bprs.length > 0,
    zones: bprs,
    narrative: bprs.length > 0 ? `✅ ${bprs.length} BPR(s) detected — strongest equilibrium zone(s).` : "No BPR — no overlapping opposite FVGs.",
  };
}

// ═══════════════════════════════════════════════════════════════════
// GAP 6.1: Po3 Per Session
// ═══════════════════════════════════════════════════════════════════
function detectPo3PerSession() {
  const sessions = [];
  const h = ny.getNYHour();
  // Asia: 20:00-24:00 + 00:00-02:00 NY
  if (h >= 20 || h < 2) sessions.push({ name: "Asia", phase: "ACCUMULATION", character: "Range-bound, building positions" });
  // London AM (Judas Swing): 02:00-05:00
  if (h >= 2 && h < 5) sessions.push({ name: "London AM", phase: "MANIPULATION", character: "Judas Swing window — false breakout likely" });
  if (h >= 5 && h < 8) sessions.push({ name: "London PM", phase: "DISTRIBUTION", character: "European distribution begins" });
  // NY AM: 08:00-11:00
  if (h >= 8 && h < 11) sessions.push({ name: "NY AM", phase: "DISTRIBUTION", character: "Highest volume — real displacement" });
  if (h >= 11 && h < 13) sessions.push({ name: "NY Lunch", phase: "ACCUMULATION", character: "Low liquidity chop" });
  // NY PM: 13:00-16:00
  if (h >= 13 && h < 16) sessions.push({ name: "NY PM", phase: "DISTRIBUTION", character: "Late continuation or reversal" });
  // Close
  if (h >= 16 && h < 17) sessions.push({ name: "Close", phase: "COMPLETION", character: "End-of-session — no new entries" });

  const currentSession = sessions[0] || { name: "Off", phase: "UNKNOWN", character: "Low liquidity" };

  return {
    sessions,
    current: currentSession,
    narrative: `Current session: ${currentSession.name} — ${currentSession.phase} phase. ${currentSession.character}.`,
  };
}

// ═══════════════════════════════════════════════════════════════════
// GAP 7.1: ISD Sequence (Induce → Sweep → Displacement)
// ═══════════════════════════════════════════════════════════════════
function detectISD(report4h, report15m, report5m) {
  if (!report4h || !report15m) return { score: 0, maxScore: 3, narrative: "Insufficient data" };

  let score = 0;
  const details = [];

  // Step 1: Inducement — liquidity grab detected
  const swept4h = (report4h.liquidity || []).filter(p => p.swept).length;
  const swept15m = (report15m.liquidity || []).filter(p => p.swept).length;
  const induced = swept4h > 0 || swept15m > 0;
  if (induced) { score++; details.push(`✅ Inducement: ${swept4h + swept15m} pool(s) swept across 4H/15m`); }
  else { details.push("✗ Inducement: No liquidity sweep detected"); }

  // Step 2: Structural sweep — 5-bar high/low sweep in IDM direction
  const hasCHoCH = report15m?.structure?.lastEvent === "CHoCH" || report5m?.structure?.lastEvent === "CHoCH";
  const hasBOS = report15m?.structure?.lastEvent === "BOS";
  const sweptStruct = hasCHoCH || (hasBOS && swept15m > 0);
  if (sweptStruct) { score++; details.push(`✅ Structural Sweep: ${hasCHoCH ? 'CHoCH' : 'BOS'} confirms on 15m/5m`); }
  else { details.push("✗ Structural Sweep: No CHoCH or sweep-confirmed BOS on entry TF"); }

  // Step 3: Displacement — ATR-gated displacement candle with body confirmation
  const disp5m = report5m?.volumeDisplacement?.label || "weak";
  const disp15m = report15m?.volumeDisplacement?.label || "weak";
  const dispRatio5m = report5m?.volumeDisplacement?.atrRatio || 0;
  const displaced = disp5m === "strong" || disp5m === "moderate" || disp15m === "strong" || (dispRatio5m > 0.8);
  if (displaced) { score++; details.push(`✅ Displacement: ${disp5m} on 5m (${r2(dispRatio5m)}x), ${disp15m} on 15m`); }
  else { details.push(`✗ Displacement: ${disp5m} on 5m (${r2(dispRatio5m)}x) — below threshold`); }

  return {
    score, maxScore: 3, details,
    ready: score >= 2,
    narrative: score === 3 ? "✅ ISD COMPLETE (3/3) — Inducement → Sweep → Displacement confirmed. HIGHEST confidence entry." :
               score === 2 ? "⏳ ISD 2/3 — Near complete. One more confirmation needed." :
               "⏳ ISD 1/3 — Early stage. Wait for sweep + displacement.",
  };
}

// ── Run All ──────────────────────────────────────────────────────────────
const cisd = detectCISDEngine(raw4H || raw5m || []);
const bpr4h = detectBPR(r4h);
const bpr1h = detectBPR(r1h);
const po3 = detectPo3PerSession();
const isd = detectISD(r4h, r15m || loadEngine("15m"), loadEngine("5m"));

// ── Output ────────────────────────────────────────────────────────────────
const out = {
  pair: pairLabel,
  cisd: { detected: cisd.detected, grade: cisd.grade, direction: cisd.direction, narrative: cisd.narrative },
  bpr: {
    detected4h: bpr4h.detected, zones4h: bpr4h.zones.length,
    detected1h: bpr1h.detected, zones1h: bpr1h.zones.length,
    narrative: bpr4h.detected ? bpr4h.narrative : bpr1h.detected ? bpr1h.narrative : "No BPR detected",
  },
  po3: { current: po3.current, sessions: po3.sessions.length, narrative: po3.narrative },
  isd: { score: isd.score, maxScore: isd.maxScore, ready: isd.ready, narrative: isd.narrative, details: isd.details },
};

// Save to file
const outDir = path.join(ROOT, "stages", "05b_micro_confirmation", "output");
fs.mkdirSync(outDir, { recursive: true });
const md = `# Priority 2 Report — ${pairLabel} — ${DATE}

## CISD (Engine-Quality)
**${cisd.narrative}**
- Body Ratio: ${cisd.bodyRatio} | Engulf Ratio: ${cisd.engulfRatio}
- Strength: ${cisd.strength}/${cisd.maxStrength}

## BPR (Balanced Price Range)
**${bpr4h.detected ? bpr4h.narrative : bpr1h.detected ? bpr1h.narrative : 'No BPR'}**
${bpr4h.zones.map(z => `- BPR: ${r5(z.bottom)} → ${r5(z.top)} (${z.fvg1} ∩ ${z.fvg2})`).join("\n")}
${bpr1h.zones.map(z => `- BPR (1H): ${r5(z.bottom)} → ${r5(z.top)} (${z.fvg1} ∩ ${z.fvg2})`).join("\n")}

## Per-Session Po3
**${po3.narrative}**
${po3.sessions.map(s => `- ${s.name}: ${s.phase} — ${s.character}`).join("\n")}

## ISD Sequence
**${isd.narrative}**
${isd.details.map(d => `- ${d}`).join("\n")}
`;
fs.writeFileSync(path.join(outDir, `${PAIR.toLowerCase()}_priority2.md`), md, "utf8");

console.log(JSON.stringify(out, null, 2));
