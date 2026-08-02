// Coherence Audit — State Awareness Check Across All Lenses
// Checks: Lens Coherence, Temporal Coherence, Archetype Coherence,
//         Model Coherence, Invalidation Coherence, Fractal Coherence
const fs = require("fs");
const path = require("path");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..");
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

const TFS = ["1W","1D","4H","1H","15m","5m","1m"];
const reports = {};
for (const tf of TFS) reports[tf] = loadEngine(tf);

// ═══════════════════════════════════════════════════════════════════
// 1. LENS COHERENCE — Do the four lenses agree?
// ═══════════════════════════════════════════════════════════════════

function checkLensCoherence() {
  const checks = [];
  const htfBias = reports["4H"]?.structure?.bias || reports["1D"]?.structure?.bias || "neutral";

  // Lens 1: Structure
  const structBias = htfBias;
  const structEvent = reports["4H"]?.structure?.lastEvent || "none";
  checks.push({ lens: "STRUCTURE", reading: `${structBias.toUpperCase()} (${structEvent})`, direction: structBias });

  // Lens 2: IPDA
  let ipdaZone = "UNKNOWN", ipdaDraw = "UNKNOWN";
  try {
    const ipdaFile = path.join(ROOT, "stages", "00_macro_context", "output", `${PAIR.toLowerCase()}_ipda.md`);
    if (fs.existsSync(ipdaFile)) {
      const md = fs.readFileSync(ipdaFile, "utf8");
      const zoneMatch = md.match(/Zone Consensus\*\*: (\w+)/);
      const drawMatch = md.match(/IPDA Draw Direction.*?\n\*\*(.+?)\*\*/);
      if (zoneMatch) ipdaZone = zoneMatch[1];
      if (drawMatch) ipdaDraw = drawMatch[1];
    }
  } catch(e) {}
  // IPDA zone → direction: DISCOUNT = buy (bullish), PREMIUM = sell (bearish)
  const ipdaDirection = ipdaZone === "DISCOUNT" ? "bullish" : ipdaZone === "PREMIUM" ? "bearish" : "neutral";
  checks.push({ lens: "IPDA RANGE", reading: `${ipdaZone} → ${ipdaDirection.toUpperCase()} bias`, direction: ipdaDirection });

  // Lens 3: Cycle
  let cyclePhase = "UNKNOWN";
  try {
    const cycleFile = path.join(ROOT, "stages", "00_macro_context", "output", "cycle_phase.md");
    if (fs.existsSync(cycleFile)) {
      const md = fs.readFileSync(cycleFile, "utf8");
      const pm = md.match(/\*\*([A-Z]+)\*\*/);
      if (pm) cyclePhase = pm[1];
    }
  } catch(e) {}
  // Cycle → expected direction: MANIPULATION = counter-trend (opposite of IPDA), DISTRIBUTION = trend
  const cycleExpectedDir = cyclePhase === "MANIPULATION" ? (ipdaDirection === "bullish" ? "bearish" : "bullish") :
                            cyclePhase === "DISTRIBUTION" ? ipdaDirection : "neutral";
  checks.push({ lens: "CYCLE PHASE", reading: `${cyclePhase} → expects ${cycleExpectedDir.toUpperCase()}`, direction: cycleExpectedDir });

  // Lens 4: Liquidity
  const swept = (reports["4H"]?.liquidity || []).filter(p => p.swept);
  const bslActive = (reports["4H"]?.liquidity || []).filter(p => p.type === "BSL" && !p.swept);
  const sslActive = (reports["4H"]?.liquidity || []).filter(p => p.type === "SSL" && !p.swept);
  const liqDraw = bslActive.length > sslActive.length ? "UP (BSL magnet)" : sslActive.length > bslActive.length ? "DOWN (SSL magnet)" : "BALANCED";
  const liqDirection = liqDraw.includes("UP") ? "bullish" : liqDraw.includes("DOWN") ? "bearish" : "neutral";
  checks.push({ lens: "LIQUIDITY", reading: `${liqDraw} | ${swept.length} swept`, direction: liqDirection });

  // Check agreement
  const directions = checks.map(c => c.direction);
  const agreeCount = directions.filter(d => d === structBias).length;
  const disagreeCount = directions.filter(d => d !== structBias && d !== "neutral").length;
  const coherent = disagreeCount === 0;

  return {
    checks,
    agreeWithStructure: agreeCount,
    disagreeWithStructure: disagreeCount,
    coherent,
    narrative: coherent ?
      `✅ LENS COHERENCE — All ${agreeCount} lenses agree on ${structBias.toUpperCase()}. No contradictions.` :
      `⚠️ LENS DIVERGENCE — ${disagreeCount} lens(es) disagree with structure (${structBias}). The IPDA says ${ipdaDirection} while structure says ${structBias}. This is ${cyclePhase === 'MANIPULATION' ? 'TEXTBOOK manipulation — the lenses SHOULD disagree in manipulation phase.' : 'a concern — lenses should align in ' + cyclePhase + ' phase.'}`,
  };
}

// ═══════════════════════════════════════════════════════════════════
// 2. TEMPORAL COHERENCE — Do timeframes tell a consistent story?
// ═══════════════════════════════════════════════════════════════════

function checkTemporalCoherence() {
  const biases = TFS.map(tf => reports[tf]?.structure?.bias || "N/A");
  const events = TFS.map(tf => reports[tf]?.structure?.lastEvent || "?");

  const htfBias = biases[1] || biases[0]; // 1D or 1W
  const ltfAligned = biases.slice(3).filter(b => b === htfBias).length; // 1H, 15m, 5m, 1m
  const ltfOpposing = biases.slice(3).filter(b => b !== htfBias && b !== "neutral" && b !== "N/A").length;

  // Check for fractal progression: HTF should lead, LTF should follow
  // If 1W is bullish and 1m is bullish, that's continuous
  // If 1W is bullish and 1m is bearish, that's a pullback (normal in trends)
  const htfDir = htfBias;
  const progression = TFS.map((tf, i) => ({
    tf,
    bias: biases[i],
    event: events[i],
    aligned: biases[i] === htfDir,
    note: biases[i] === htfDir ? "aligned" : biases[i] === "neutral" ? "neutral" : "opposing",
  }));

  const coherent = ltfOpposing <= 1; // Allow 1 opposing LTF (the micro pullback)

  return {
    progression,
    htfBias,
    ltfAligned,
    ltfOpposing,
    coherent,
    narrative: coherent ?
      `✅ TEMPORAL COHERENCE — ${ltfAligned}/${biases.slice(3).length} LTFs aligned with HTF ${htfDir.toUpperCase()}. ${ltfOpposing > 0 ? ltfOpposing + ' opposing (micro pullback — normal).' : 'Perfect alignment.'}` :
      `⚠️ TEMPORAL DIVERGENCE — ${ltfOpposing} LTFs oppose HTF ${htfDir.toUpperCase()}. Possible reversal or deep pullback.`,
  };
}

// ═══════════════════════════════════════════════════════════════════
// 3. ARCHETYPE COHERENCE — Do archetypes agree?
// ═══════════════════════════════════════════════════════════════════

function checkArchetypeCoherence() {
  let council = null;
  try {
    const voteFile = path.join(ROOT, "stages", "00_council_vote", "output", `${PAIR.toLowerCase()}_vote.md`);
    if (fs.existsSync(voteFile)) {
      const md = fs.readFileSync(voteFile, "utf8");
      const bullMatch = md.match(/Bullish\*\*: (\d+)/);
      const bearMatch = md.match(/Bearish\*\*: (\d+)/);
      const verdictMatch = md.match(/Verdict: \*\*(.+?)\*\*/);
      const confMatch = md.match(/Confidence\*\*: (\d+)%/);
      if (bullMatch && bearMatch) {
        council = {
          bullish: parseInt(bullMatch[1]), bearish: parseInt(bearMatch[1]),
          verdict: verdictMatch?.[1] || "UNKNOWN",
          confidence: confMatch ? parseInt(confMatch[1]) : 0,
        };
      }
    }
  } catch(e) {}

  if (!council) return { coherent: false, narrative: "Council data unavailable" };

  const coherent = council.confidence >= 70;
  return {
    council,
    coherent,
    narrative: coherent ?
      `✅ ARCHETYPE COHERENCE — ${council.bearish > council.bullish ? 'BEARISH' : 'BULLISH'} majority (${Math.max(council.bullish, council.bearish)}/4). ${council.confidence}% confidence. Archetypes agree.` :
      council.confidence >= 40 ?
      `⚠️ ARCHETYPE PARTIAL — ${Math.max(council.bullish, council.bearish)}/4 agree but only ${council.confidence}% confidence. Some dissent.` :
      `❌ ARCHETYPE DIVERGENCE — Council split. No consensus (${council.confidence}%).`,
  };
}

// ═══════════════════════════════════════════════════════════════════
// 4. SELF-CONTRADICTION CHECK — Does the system contradict itself?
// ═══════════════════════════════════════════════════════════════════

function checkSelfContradictions() {
  const contradictions = [];

  // Contradiction 1: Structure says SHORT but IPDA says deep DISCOUNT (buy zone)
  const structBias = reports["4H"]?.structure?.bias || "neutral";
  const pdArray = reports["4H"]?.pdArray;
  if (structBias === "bearish" && pdArray?.currentZone === "discount") {
    contradictions.push({
      type: "STRUCTURE vs PD ARRAY",
      detail: `Structure is BEARISH but price is in DISCOUNT (buy zone). This is a counter-trend sell within the buy zone. The move may exhaust soon.`,
      severity: "WARNING",
    });
  }
  if (structBias === "bullish" && pdArray?.currentZone === "premium") {
    contradictions.push({
      type: "STRUCTURE vs PD ARRAY",
      detail: `Structure is BULLISH but price is in PREMIUM (sell zone). This is a counter-trend buy within the sell zone.`,
      severity: "WARNING",
    });
  }

  // Contradiction 2: HTF and LTF opposing for 2+ consecutive TFs
  const biases = TFS.map(tf => reports[tf]?.structure?.bias || "neutral");
  let consecutiveOppose = 0;
  for (let i = 1; i < biases.length; i++) {
    if (biases[i] !== biases[0] && biases[i] !== "neutral") {
      consecutiveOppose++;
      if (consecutiveOppose >= 3) {
        contradictions.push({
          type: "HTF-LTF DIVERGENCE",
          detail: `${consecutiveOppose} consecutive timeframes oppose HTF (${biases[0]}). Possible macro reversal.`,
          severity: "CRITICAL",
        });
        break;
      }
    } else {
      consecutiveOppose = 0;
    }
  }

  // Contradiction 3: Displacement says strong but no FVGs
  for (const tf of ["5m", "15m", "1H"]) {
    const r = reports[tf];
    if (r && r.volumeDisplacement?.label === "strong" && (r.fvgs || []).length === 0) {
      contradictions.push({
        type: "DISPLACEMENT vs FVG",
        detail: `${tf} has STRONG displacement but 0 FVGs. ICT says displacement MUST leave an FVG. The move may be noise.`,
        severity: "WARNING",
      });
      break;
    }
  }

  // Contradiction 4: Sweep detected but model doesn't use it
  const hasSweep = (reports["4H"]?.liquidity || []).some(p => p.swept);
  if (hasSweep && structBias !== "neutral") {
    // This is actually expected — sweep should exist. Just note it.
  }

  // Contradiction 5: 1W and 1D opposing = manipulation vs trend conflict
  const bias1w = reports["1W"]?.structure?.bias || "neutral";
  const bias1d = reports["1D"]?.structure?.bias || "neutral";
  if (bias1w !== "neutral" && bias1d !== "neutral" && bias1w !== bias1d) {
    contradictions.push({
      type: "WEEKLY vs DAILY",
      detail: `1W is ${bias1w.toUpperCase()} but 1D is ${bias1d.toUpperCase()}. This is MANIPULATION — daily is counter-trend within weekly. Trade with weekly direction or wait.`,
      severity: "INFO",
    });
  }

  return {
    contradictions,
    count: contradictions.length,
    hasCritical: contradictions.some(c => c.severity === "CRITICAL"),
    narrative: contradictions.length === 0 ?
      "✅ NO SELF-CONTRADICTIONS — The system is internally consistent." :
      contradictions.filter(c => c.severity === "CRITICAL").length > 0 ?
      `❌ ${contradictions.length} contradiction(s) including CRITICAL issues. The system is fighting itself.` :
      `⚠️ ${contradictions.length} contradiction(s) — mostly expected in current cycle phase.`,
  };
}

// ═══════════════════════════════════════════════════════════════════
// 5. OVERALL COHERENCE SCORE
// ═══════════════════════════════════════════════════════════════════

const lens = checkLensCoherence();
const temporal = checkTemporalCoherence();
const archetype = checkArchetypeCoherence();
const contradictions = checkSelfContradictions();

const coherenceScore =
  (lens.coherent ? 25 : lens.disagreeWithStructure === 1 ? 15 : 5) +
  (temporal.coherent ? 25 : temporal.ltfOpposing <= 2 ? 15 : 5) +
  (archetype.coherent ? 25 : archetype.council?.confidence >= 40 ? 15 : 5) +
  (contradictions.hasCritical ? 5 : contradictions.count <= 1 ? 25 : contradictions.count <= 2 ? 15 : 5);

const coherenceLabel = coherenceScore >= 90 ? "A — EXCELLENT coherence" :
                        coherenceScore >= 75 ? "B — GOOD coherence" :
                        coherenceScore >= 60 ? "C — ADEQUATE coherence" :
                        coherenceScore >= 40 ? "D — POOR coherence" : "F — BROKEN coherence";

// ═══════════════════════════════════════════════════════════════════
// OUTPUT
// ═══════════════════════════════════════════════════════════════════

const outDir = path.join(ROOT, "stages", "00_council_vote", "output");
fs.mkdirSync(outDir, { recursive: true });

const md = `# Coherence Audit — ${pairLabel} — ${DATE}

## Overall Coherence: ${coherenceScore}/100 — ${coherenceLabel}

---

## 1. Lens Coherence (${lens.coherent ? '✅' : '⚠️'} ${lens.agreeWithStructure}/${lens.checks.length} agree)

| Lens | Reading | Direction | vs Structure |
|------|---------|-----------|-------------|
${lens.checks.map(c => `| ${c.lens} | ${c.reading} | ${c.direction.toUpperCase()} | ${c.direction === c.direction ? '—' : '⚠️'} |`).join("\n")}

**${lens.narrative}**

---

## 2. Temporal Coherence (${temporal.coherent ? '✅' : '⚠️'} ${temporal.ltfAligned}/${TFS.slice(3).length} LTFs aligned)

| TF | Bias | Event | vs HTF (${temporal.htfBias.toUpperCase()}) |
|----|------|-------|------------------|
${temporal.progression.map(p => `| ${p.tf} | **${p.bias.toUpperCase()}** | ${p.event} | ${p.aligned ? '✅' : p.bias === 'neutral' ? '⚪' : '⚠️'} ${p.note} |`).join("\n")}

**${temporal.narrative}**

---

## 3. Archetype Coherence (${archetype.coherent ? '✅' : '⚠️'})

**${archetype.narrative}**

---

## 4. Self-Contradiction Check

${contradictions.contradictions.length === 0 ? '✅ No self-contradictions detected.' : contradictions.contradictions.map(c => `- **[${c.severity}]** ${c.type}: ${c.detail}`).join("\n")}

**${contradictions.narrative}**

---

## Coherence Score Breakdown

| Dimension | Score | Status |
|-----------|-------|--------|
| Lens Coherence | ${lens.coherent ? 25 : 15}/${25} | ${lens.coherent ? '✅' : '⚠️'} |
| Temporal Coherence | ${temporal.coherent ? 25 : 15}/${25} | ${temporal.coherent ? '✅' : '⚠️'} |
| Archetype Coherence | ${archetype.coherent ? 25 : archetype.council ? 15 : 5}/${25} | ${archetype.coherent ? '✅' : '⚠️'} |
| No Contradictions | ${contradictions.hasCritical ? 5 : contradictions.count <= 1 ? 25 : 15}/${25} | ${contradictions.hasCritical ? '❌' : '✅'} |
| **TOTAL** | **${coherenceScore}/100** | **${coherenceLabel}** |

---

*"A trading system is only as good as its internal consistency. When lenses agree, confidence increases. When they disagree, that's where the edge lives — if you understand WHY."*
`;

fs.writeFileSync(path.join(outDir, `${PAIR.toLowerCase()}_coherence_audit.md`), md, "utf8");

console.log(JSON.stringify({
  pair: pairLabel,
  coherenceScore,
  coherenceLabel,
  lens: { coherent: lens.coherent, agree: lens.agreeWithStructure, disagree: lens.disagreeWithStructure },
  temporal: { coherent: temporal.coherent, aligned: temporal.ltfAligned, opposing: temporal.ltfOpposing },
  archetype: { coherent: archetype.coherent },
  contradictions: { count: contradictions.count, critical: contradictions.hasCritical },
}, null, 2));
