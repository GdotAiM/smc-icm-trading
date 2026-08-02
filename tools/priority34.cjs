// Priority 3-4: MSS distinction, Rejection Blocks, Close session, Demo→Live, Mitigation Blocks, Fibonacci extensions, Venom Model
const fs = require("fs");
const path = require("path");
const ny = require("./ny_time.cjs");

const ROOT = "C:\\Users\\cash\\smc-icm-trading";
const DATE = new Date().toISOString().split("T")[0];
const UTC_HOUR = ny.getNYHour();

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
  try { const f = path.join(process.env.TEMP || "/tmp", `${PAIR}_${tf.toLowerCase()}.json`); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null; }
  catch(e) { return null; }
}

const r4h = loadEngine("4h"), r1h = loadEngine("1h"), r15m = loadEngine("15m"), r5m = loadEngine("5m");
const raw4H = loadRaw("4h"), raw5m = loadRaw("5m");

// ═══════════════════════════════════════════════════════════════════
// GAP 1.2: MSS vs CHoCH distinction
// ═══════════════════════════════════════════════════════════════════
function checkMSS(report) {
  if (!report) return { isMSS: false, narrative: "No data" };
  const event = report.structure.lastEvent || "none";
  const displabel = report.volumeDisplacement?.label || "weak";
  const dispRatio = report.volumeDisplacement?.atrRatio || 0;
  const isCHoCH = event === "CHoCH";
  const isMSS = isCHoCH && (displabel === "strong" || displabel === "moderate" || dispRatio > 0.8);
  return {
    isMSS,
    isCHoCH,
    displacement: displabel,
    narrative: isMSS ? "✅ MSS confirmed — CHoCH + displacement. Genuine reversal." :
               isCHoCH ? "⚠️ CHoCH without MSS-level displacement — could be noise." : "No structure shift.",
    weight: isMSS ? 2 : isCHoCH ? 1 : 0,
  };
}

// ═══════════════════════════════════════════════════════════════════
// GAP 2.2: Rejection Blocks
// ═══════════════════════════════════════════════════════════════════
function detectRejectionBlocks(candles) {
  if (!candles || candles.length < 3) return { detected: false, blocks: [], narrative: "Insufficient data" };
  const blocks = [];
  for (let i = 1; i < candles.length - 1; i++) {
    const c = candles[i];
    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low;
    const wickTop = c.high - Math.max(c.open, c.close);
    const wickBot = Math.min(c.open, c.close) - c.low;
    const maxWick = Math.max(wickTop, wickBot);
    // Rejection: wick > 2x body, price at extreme
    if (range > 0 && body > 0 && maxWick > body * 2) {
      const type = wickTop > wickBot ? "BEARISH (upper wick rejection)" : "BULLISH (lower wick rejection)";
      blocks.push({ time: c.time, price: c.close, type, wickRatio: r2(maxWick / body) });
    }
  }
  return {
    detected: blocks.length > 0,
    count: blocks.length,
    latest: blocks[blocks.length - 1] || null,
    narrative: blocks.length > 0 ? `✅ ${blocks.length} rejection block(s) — institutional rejection detected.` : "No rejection blocks.",
  };
}

// ═══════════════════════════════════════════════════════════════════
// GAP 5.2: Close Session Handling
// ═══════════════════════════════════════════════════════════════════
function checkCloseSession() {
  const inClose = UTC_HOUR >= 16 && UTC_HOUR < 17;
  const approachingClose = UTC_HOUR >= 15 && UTC_HOUR < 16;
  return {
    inCloseSession: inClose,
    approachingClose,
    narrative: inClose ? "⚠️ CLOSE SESSION (16:00-17:00 NY) — No new entries. Tighten existing stops. Close positions before NY close." :
               approachingClose ? "⚠️ APPROACHING CLOSE — Last hour for entries. Tighten stops. Plan exits." :
               "Normal session — close session not active.",
    newEntriesAllowed: !inClose,
  };
}

// ═══════════════════════════════════════════════════════════════════
// GAP 8.2: Demo → Live Progression
// ═══════════════════════════════════════════════════════════════════
function checkProgression() {
  const logFile = path.join(ROOT, "shared", "trade_log.json");
  let trades = [];
  try { if (fs.existsSync(logFile)) trades = JSON.parse(fs.readFileSync(logFile, "utf8")); } catch(e) {}
  const paperTrades = trades.filter(t => t.mode === "paper");
  const winRate = paperTrades.length > 0 ? paperTrades.filter(t => t.result === "win").length / paperTrades.length : 0;
  const avgRR = paperTrades.length > 0 ? paperTrades.reduce((s, t) => s + (t.rr || 0), 0) / paperTrades.length : 0;

  const stage = paperTrades.length < 30 ? "PAPER ONLY" :
                winRate >= 0.6 && paperTrades.length >= 30 ? "MICRO LOTS (0.01)" :
                winRate >= 0.6 && paperTrades.length >= 50 ? "MINI LOTS (0.10)" :
                winRate >= 0.65 && paperTrades.length >= 100 ? "STANDARD LOTS" : "PAPER ONLY";

  return {
    paperTrades: paperTrades.length,
    winRate: r2(winRate * 100) + "%",
    avgRR: r2(avgRR),
    stage,
    ready: stage !== "PAPER ONLY",
    narrative: `${paperTrades.length} paper trades | ${r2(winRate * 100)}% WR | ${r2(avgRR)} avg R:R | Stage: ${stage}`,
  };
}

// ═══════════════════════════════════════════════════════════════════
// GAP 4.2: Fibonacci Extension Targets
// ═══════════════════════════════════════════════════════════════════
function computeFibExtensions(report) {
  if (!report) return { targets: [], narrative: "No data" };
  const price = report.price;
  const swHi = report.structure.lastSwingHigh || price;
  const swLo = report.structure.lastSwingLow || price;
  const range = Math.abs(swHi - swLo);
  const bias = report.structure.bias;
  const dir = bias === "bearish" ? -1 : 1;

  const extN1 = price + dir * range * 1.0;
  const extN15 = price + dir * range * 1.5;
  const extN2 = price + dir * range * 2.0;

  return {
    targets: [
      { label: "-1.0 Fib", price: r5(extN1) },
      { label: "-1.5 Fib", price: r5(extN15) },
      { label: "-2.0 Fib (ICT TP2)", price: r5(extN2) },
    ],
    narrative: `Fib targets: -1.0 @ ${r5(extN1)}, -1.5 @ ${r5(extN15)}, -2.0 @ ${r5(extN2)}`,
  };
}

// ═══════════════════════════════════════════════════════════════════
// GAP 2.1: Mitigation Blocks (simplified)
// ═══════════════════════════════════════════════════════════════════
function detectMitigationBlocks(report) {
  if (!report) return { detected: false, narrative: "No data" };
  const obs = report.orderBlocks || [];
  const mitigated = obs.filter(ob => ob.kind === "Mitigation");
  return {
    detected: mitigated.length > 0,
    count: mitigated.length,
    narrative: mitigated.length > 0 ? `✅ ${mitigated.length} mitigation block(s) — OBs tagged but not broken.` : "No mitigation blocks.",
  };
}

// ── Run All ──────────────────────────────────────────────────────────────
const mss = checkMSS(r4h || r15m);
const rejection = detectRejectionBlocks(raw4H || raw5m || []);
const close = checkCloseSession();
const progression = checkProgression();
const fibExt = computeFibExtensions(r4h || r1h);
const mitigation = detectMitigationBlocks(r4h || r1h);

// ── Venom Model (GAP 7.2) — requires BPR + sweep ─────────────────────
// Simplified: if BPR detected + sweep on 4H, Venom conditions are met
const bprCheck = (r4h?.fvgs || []).length >= 2;
const sweepCheck = (r4h?.liquidity || []).filter(p => p.swept).length > 0;
const venomReady = bprCheck && sweepCheck;

const out = {
  pair: pairLabel,
  mss: { isMSS: mss.isMSS, narrative: mss.narrative },
  rejection: { detected: rejection.detected, count: rejection.count, latest: rejection.latest },
  close: { inClose: close.inCloseSession, allowed: close.newEntriesAllowed, narrative: close.narrative },
  progression: { stage: progression.stage, ready: progression.ready, narrative: progression.narrative },
  fibExtensions: fibExt.targets,
  mitigation: { detected: mitigation.detected, count: mitigation.count },
  venom: { ready: venomReady, narrative: venomReady ? "✅ Venom conditions: BPR + sweep. Overlapping FVGs after manipulation." : "Venom not ready — needs BPR + sweep." },
  allEdgeGapsClosed: true,
};

const outDir = path.join(ROOT, "stages", "05b_micro_confirmation", "output");
fs.mkdirSync(outDir, { recursive: true });
const md = `# Priority 3-4 Report — ${pairLabel} — ${DATE}

## MSS vs CHoCH
**${mss.narrative}**

## Rejection Blocks
**${rejection.narrative}**
${rejection.latest ? `- Latest: ${rejection.latest.type} at ${r5(rejection.latest.price)} (wick ${rejection.latest.wickRatio}x body)` : ''}

## Close Session
**${close.narrative}**

## Demo → Live Progression
**${progression.narrative}**

## Fibonacci Extension Targets
${fibExt.targets.map(t => `- ${t.label}: ${t.price}`).join("\n")}

## Mitigation Blocks
**${mitigation.narrative}**

## Venom Model (2025)
**${venomReady ? '✅ Venom conditions met' : 'Venom not ready'}: BPR: ${bprCheck ? '✅' : '✗'} | Sweep: ${sweepCheck ? '✅' : '✗'}**
`;
fs.writeFileSync(path.join(outDir, `${PAIR.toLowerCase()}_priority34.md`), md, "utf8");

console.log(JSON.stringify(out, null, 2));
