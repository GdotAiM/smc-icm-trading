// Archetype Engine — runs one archetype's analysis from its anchor TFs
const fs = require("fs");
const path = require("path");

const ROOT = "C:\\Users\\cash\\smc-icm-trading";
const DATE = require("./ny_time.cjs").getNYDate();

function r2(v) { return Number(v).toFixed(2); }
function r5(v) { return Number(v).toFixed(5); }

const PAIR = process.argv[2] || "GBPUSD";
const ARCHETYPE = process.argv[3] || "day";

// Load archetype config
let config;
try {
  config = JSON.parse(fs.readFileSync(path.join(ROOT, "_config", "archetypes", `${ARCHETYPE}.json`), "utf8"));
} catch(e) {
  console.error(`Unknown archetype: ${ARCHETYPE}`);
  process.exit(1);
}

// Load engine reports for anchor TFs
const sharedDir = path.join(ROOT, "shared", DATE, PAIR);
function loadEngine(tf) {
  try { return JSON.parse(fs.readFileSync(path.join(sharedDir, `engine_${tf.toLowerCase()}.json`), "utf8")); }
  catch { return null; }
}

const reports = {};
for (const tf of config.anchor) {
  reports[tf] = loadEngine(tf);
}

// ── Run analysis as this archetype ──────────────────────────────────────
function analyze() {
  const anchorBias = reports[config.anchor[0]] ? reports[config.anchor[0]].structure.bias : "neutral";
  const secondBias = config.anchor.length > 1 && reports[config.anchor[1]] ? reports[config.anchor[1]].structure.bias : "neutral";

  // Direction from anchor TF
  const direction = anchorBias === "neutral" ? (secondBias === "neutral" ? "neutral" : secondBias) : anchorBias;
  const confidence = reports[config.anchor[0]] ? reports[config.anchor[0]].structure.confidence : 0;

  // Model picks appropriate for this archetype
  const hasOB = config.anchor.some(tf => (reports[tf]?.orderBlocks || []).length > 0);
  const hasFVG = config.anchor.some(tf => (reports[tf]?.fvgs || []).length > 0);
  const hasSweep = config.anchor.some(tf => (reports[tf]?.liquidity || []).some(p => p.swept));

  // Filter models to this archetype's approved list
  const modelScoring = {
    "2022 Model (MMXM)": (direction !== "neutral" ? 3 : 0) + (hasOB ? 2 : 0) + (hasSweep ? 2 : 0),
    "Silver Bullet": (hasFVG ? 3 : 0) + (direction !== "neutral" ? 2 : 0),
    "OTE + Institutional OB": (hasOB ? 3 : 0) + (direction !== "neutral" ? 2 : 0),
    "Turtle Soup": (hasSweep ? 3 : 0) + (direction !== "neutral" ? 2 : 0),
    "Breaker Block": (hasOB ? 3 : 0) + (hasSweep ? 2 : 0),
    "Unicorn (OTE+FVG)": (hasOB ? 2 : 0) + (hasFVG ? 2 : 0),
    "SCOB": (hasOB ? 2 : 0) + (hasFVG ? 2 : 0),
    "2FVG Entry": (hasFVG ? 3 : 0),
    "Judas Swing": (hasSweep ? 3 : 0),
    "Asian Range Breakout": (direction === "neutral" ? 3 : 1),
    "NWOG/NDOG": (direction === "neutral" ? 3 : 0),
    "PO3 (AMD)": (direction !== "neutral" ? 2 : 0),
  };

  const allowedModels = [...(config.models.primary || []), ...(config.models.secondary || [])];
  const picks = allowedModels
    .map(name => ({ name, score: modelScoring[name] || 0 }))
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const bestModel = picks[0] || { name: "none", score: 0 };

  // Notes from this archetype's perspective
  let notes = "";
  if (ARCHETYPE === "position") {
    notes = direction === "bullish" ? "1W structure intact — building longs on dips" :
            direction === "bearish" ? "1W structure breaking — distributing shorts" :
            "No clear HTF direction — waiting for weekly structure";
  } else if (ARCHETYPE === "swing") {
    notes = direction === "bearish" && secondBias === "bearish" ? "4H + 1D aligned bearish — looking for short entries at premium OBs" :
            direction === "bullish" && secondBias === "bullish" ? "4H + 1D aligned bullish — looking for long entries at discount OBs" :
            "HTF alignment unclear — waiting for 4H/1D agreement";
  } else if (ARCHETYPE === "day") {
    notes = hasSweep ? `Sweep detected — manipulation active. ${direction === "bearish" ? "Looking for 5m bearish FVG for short entry." : direction === "bullish" ? "Looking for 5m bullish FVG for long entry." : "Waiting for direction."}` :
            `No sweep yet — waiting for manipulation. ${direction !== "neutral" ? `Bias is ${direction}, watching for trigger.` : "No clear bias."}`;
  } else if (ARCHETYPE === "scalp") {
    notes = hasFVG ? `1m/5m FVGs present — scalp triggers available. Direction: ${direction}.` :
            "No 1m/5m FVGs — waiting for displacement to create entry inefficiency.";
  }

  return {
    archetype: config.name,
    anchorTFs: config.anchor,
    direction,
    confidence: r2(confidence),
    bestModel: bestModel.name,
    modelScore: bestModel.score,
    topPicks: picks,
    notes,
    enabled: true,
    riskParams: config.riskParams,
  };
}

const result = analyze();
console.log(JSON.stringify(result, null, 2));
