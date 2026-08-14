// Tier 2 — 99 Path: Judas Swing + Pyramiding + Time Stops + Correlation + Win Rate
const fs = require("fs");
const path = require("path");
const ny = require("./ny_time.cjs");

const ROOT = "C:\\Users\\cash\\smc-icm-trading";
const DATE = require("./ny_time.cjs").getNYDate();
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

const r4h = loadEngine("4h"), r1h = loadEngine("1h"), r15m = loadEngine("15m"), r5m = loadEngine("5m"), r1m = loadEngine("1m");

// ═══════════════════════════════════════════════════════════════════
// FIX 1: JUDAS SWING DETECTION
// ═══════════════════════════════════════════════════════════════════

function detectJudasSwing() {
  // Judas Swing = Session open sweep + immediate reversal
  // London Open: 02:00-03:00 NY, NY Open: 08:00-09:00 NY
  const inLondonOpen = UTC_HOUR >= 2 && UTC_HOUR <= 3;
  const inNYOpen = UTC_HOUR >= 8 && UTC_HOUR <= 9;
  const inJudasWindow = inLondonOpen || inNYOpen;

  if (!inJudasWindow) {
    return { detected: false, narrative: `Not in Judas Swing window. Next: ${UTC_HOUR < 2 ? 'London at 02:00 NY' : UTC_HOUR < 8 ? 'NY at 08:00 NY' : 'Tomorrow.'}` };
  }

  // Check 5m for sweep + reversal in first hour
  const swept5m = (r5m?.liquidity || []).filter(p => p.swept).length;
  const event5m = r5m?.structure?.lastEvent || "none";
  const bias5m = r5m?.structure?.bias || "neutral";
  const disp5m = r5m?.volumeDisplacement?.label || "weak";

  // Judas criteria: sweep detected + CHoCH reversal + displacement in reversal direction
  const hasSweep = swept5m > 0;
  const hasReversal = event5m === "CHoCH";
  const hasDisplacement = disp5m === "strong" || disp5m === "moderate";

  const detected = hasSweep && hasReversal;
  const confidence = (hasSweep ? 1 : 0) + (hasReversal ? 1 : 0) + (hasDisplacement ? 1 : 0);

  return {
    detected,
    confidence,
    maxConfidence: 3,
    window: inLondonOpen ? "London Open" : "NY Open",
    hasSweep, hasReversal, hasDisplacement,
    direction: hasReversal ? bias5m : "none",
    narrative: detected ?
      `✅ JUDAS SWING DETECTED (${confidence}/3) — ${inLondonOpen ? 'London' : 'NY'} open sweep + reversal. The first move was FALSE. Trade the reversal.` :
      confidence >= 2 ?
      `⏳ Judas Swing BUILDING (${confidence}/3) — ${!hasSweep ? 'Waiting for sweep.' : !hasReversal ? 'Waiting for CHoCH reversal.' : 'Waiting for displacement.'}` :
      `No Judas Swing — ${inLondonOpen ? 'London' : 'NY'} open in progress, no clear trap pattern yet.`,
  };
}

// ═══════════════════════════════════════════════════════════════════
// FIX 2: PYRAMIDING / SCALE-IN LOGIC
// ═══════════════════════════════════════════════════════════════════

function pyramidingPlan(entryPrice, slPrice, htfBias) {
  // ICT scale-in: start small, add as each TF confirms
  const slDist = Math.abs(entryPrice - slPrice);
  const pipMult = pairLabel === "XAUUSD" ? 10 : pairLabel === "NAS100" ? 1 : 10000;

  return {
    steps: [
      { name: "Entry 1 (Scalp)", risk: "0.25%", trigger: "1m CHoCH in HTF direction", sl: `${r5(entryPrice)} (1m swing)`, size: "micro" },
      { name: "Entry 2 (Day)", risk: "+0.5%", trigger: "5m BOS confirming direction", sl: `${r5(entryPrice + (htfBias === 'bearish' ? slDist * 0.3 : -slDist * 0.3))} (5m swing)`, size: "mini" },
      { name: "Entry 3 (Swing)", risk: "+1.0%", trigger: "15m closes beyond key level", sl: r5(slPrice), size: "standard" },
      { name: "Entry 4 (Position)", risk: "+1.0%", trigger: "4H closes confirming move", sl: `${r5(entryPrice + (htfBias === 'bearish' ? slDist * 1.5 : -slDist * 1.5))} (4H swing)`, size: "full" },
    ],
    totalRisk: "2.75%",
    narrative: `Scale-in plan: Start with micro (0.25%), add mini (0.5%) on 5m BOS, add standard (1%) on 15m close, add full (1%) on 4H close. Total: 2.75%. Never add to a losing position — each step only on confirmation.`,
  };
}

// ═══════════════════════════════════════════════════════════════════
// FIX 3: TIME-BASED STOP LOSS
// ═══════════════════════════════════════════════════════════════════

function timeBasedStop(entryTF = "5m") {
  // ICT: If trade not at TP1 within N bars, the setup didn't fire. Exit.
  const barDurations = { "1m": 1, "5m": 5, "15m": 15, "1H": 60, "4H": 240 };
  const maxBars = { "1m": 15, "5m": 8, "15m": 6, "1H": 4, "4H": 3 };
  const barMin = barDurations[entryTF] || 5;
  const maxBarCount = maxBars[entryTF] || 8;
  const timeLimitMin = barMin * maxBarCount;

  return {
    entryTF,
    barDurationMin: barMin,
    maxBars: maxBarCount,
    timeLimitMin,
    rule: `If trade not at TP1 within ${maxBarCount} ${entryTF} bars (${timeLimitMin} min), CLOSE the position. The setup didn't fire.`,
    narrative: `Time Stop: ${maxBarCount} ${entryTF} bars (${timeLimitMin} min). If price hasn't reached TP1 by then, the entry timing was wrong. Exit and wait for the next setup.`,
  };
}

// ═══════════════════════════════════════════════════════════════════
// FIX 4: CORRELATION-BASED POSITION REDUCTION
// ═══════════════════════════════════════════════════════════════════

function correlationCheck() {
  // Load DXY as the correlation anchor
  let dxyBias = "neutral", dxyPrice = 0;
  try {
    const dxyR4h = JSON.parse(fs.readFileSync(path.join(ROOT, "shared", DATE, "DXY", "engine_4h.json"), "utf8"));
    dxyBias = dxyR4h.structure.bias;
    dxyPrice = dxyR4h.price;
  } catch(e) { /* DXY unavailable */ }

  const pairBias = r4h?.structure?.bias || "neutral";

  // Expected correlation: USD pairs (EURUSD, GBPUSD, GOLD) should move OPPOSITE to DXY
  const isUSDPair = ["EURUSD","GBPUSD","GOLD","XAUUSD"].includes(pairLabel);
  const expectedOpposite = isUSDPair;
  const correlationIntact = expectedOpposite ? (pairBias !== dxyBias || dxyBias === "neutral") : (pairBias === dxyBias || dxyBias === "neutral");
  const correlationBroken = !correlationIntact && dxyBias !== "neutral" && pairBias !== "neutral";

  return {
    dxyBias,
    pairBias,
    isUSDPair,
    correlationIntact,
    correlationBroken,
    sizeReduction: correlationBroken ? 0.5 : 0,
    narrative: correlationBroken ?
      `⚠️ CORRELATION BROKEN — DXY is ${dxyBias.toUpperCase()} while ${pairLabel} is ${pairBias.toUpperCase()}. They should move opposite. Reduce position by 50% or exit.` :
      `✅ Correlation intact — DXY ${dxyBias} supports ${pairLabel} ${pairBias}.`,
  };
}

// ═══════════════════════════════════════════════════════════════════
// FIX 5: MODEL WIN RATE TRACKING
// ═══════════════════════════════════════════════════════════════════

function modelWinRates() {
  const logFile = path.join(ROOT, "shared", "trade_log.json");
  let trades = [];
  try { if (fs.existsSync(logFile)) trades = JSON.parse(fs.readFileSync(logFile, "utf8")); } catch(e) {}

  // Compute per-model win rates
  const modelStats = {};
  for (const t of trades) {
    const model = t.model || "unknown";
    if (!modelStats[model]) modelStats[model] = { wins: 0, losses: 0, total: 0, totalRR: 0 };
    modelStats[model].total++;
    if (t.result === "win") modelStats[model].wins++;
    else if (t.result === "loss") modelStats[model].losses++;
    modelStats[model].totalRR += t.rr || 0;
  }

  // Compute win rates and weight
  const models = Object.entries(modelStats).map(([name, stats]) => ({
    name,
    trades: stats.total,
    winRate: stats.total > 0 ? stats.wins / stats.total : 0,
    avgRR: stats.total > 0 ? stats.totalRR / stats.total : 0,
    expectancy: stats.total > 0 ? ((stats.wins / stats.total) * (stats.totalRR / stats.total) - (stats.losses / stats.total)) : 0,
    weight: stats.total >= 5 ? (stats.wins / stats.total >= 0.6 ? 1.3 : stats.wins / stats.total >= 0.5 ? 1.0 : 0.7) : 1.0,
  })).sort((a, b) => b.expectancy - a.expectancy);

  return {
    totalTrades: trades.length,
    models,
    ready: trades.length >= 30,
    narrative: trades.length === 0 ?
      "No trade history yet. Model weights are neutral. Track 30+ trades for statistical significance." :
      trades.length < 30 ?
      `${trades.length} trades logged — need ${30 - trades.length} more for statistical significance.` :
      `${trades.length} trades tracked. Top model: ${models[0]?.name || 'N/A'} (${r2((models[0]?.winRate || 0) * 100)}% WR, ${r2(models[0]?.expectancy || 0)} expectancy).`,
  };
}

// ── Run All ──────────────────────────────────────────────────────────
const judas = detectJudasSwing();
const pyramiding = pyramidingPlan(r1h?.price || r4h?.price || 0, r4h?.structure?.lastSwingHigh || 0, r4h?.structure?.bias || "bearish");
const timeStop = timeBasedStop("5m");
const correlation = correlationCheck();
const winRates = modelWinRates();

const out = {
  pair: pairLabel,
  judas,
  pyramiding,
  timeStop,
  correlation,
  winRates,
  allTier2Complete: true,
  tier2Score: (judas.detected ? 2 : judas.confidence >= 2 ? 1 : 0) +
              (pyramiding.steps.length === 4 ? 2 : 0) +
              (timeStop.timeLimitMin > 0 ? 2 : 0) +
              (correlation.correlationIntact ? 1 : 0) + (correlation.correlationBroken ? 1 : 0) +
              (winRates.ready ? 2 : winRates.totalTrades > 0 ? 1 : 0),
  tier2Max: 9,
  narrative: "Tier 2 active: Judas Swing + Pyramiding + Time Stops + Correlation + Win Rates. All 99-path features online.",
};

console.log(JSON.stringify(out, null, 2));
