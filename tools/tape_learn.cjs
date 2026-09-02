#!/usr/bin/env node
// Tape Learning Engine — extracts patterns from tape observations and writes to lessons
// Bridges tape_practice.cjs observations into the ICT continuous learning pipeline
//
// Usage:
//   node tools/tape_learn.cjs [PAIR] [--all] [--force]
//
// What it does:
//   1. Reads all tape observations from shared/YYYY-MM-DD/PANEL/tape_journal.jsonl
//   2. Classifies patterns: sweep→reversal, sweep→continuation, false breakout, etc.
//   3. Writes lessons to shared/performance/lessons_<pair>_YYYY-MM-DD.json
//   4. Updates shared/performance/playbook_<pair>.json if pattern recurs
//   5. Appends to trade_graph as a new edge type (tape_pattern)
//
// Run after each checkpoint or at end of day.

const fs = require("fs");
const path = require("path");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..");
const DATE = require("./ny_time.cjs").getNYDate();
const nyTime = () => {
  const d = new Date();
  const offset = require("./ny_time.cjs").getNYOffset(d.getTime());
  return new Date(d.getTime() + offset * 60000);
};
const nyTS = () => `${String(nyTime().getHours()).padStart(2,"0")}:${String(nyTime().getMinutes()).padStart(2,"0")}`;

const DIR_MAP = { XAUUSD: "GOLD" };
const PAIRS = ["EURUSD", "GBPUSD", "XAUUSD", "NAS100"];
const TARGET = process.argv[2] === "--all" ? PAIRS : [process.argv[2] || "EURUSD"];
const FORCE = process.argv.includes("--force");

function dirFor(pair) {
  return pair === "XAUUSD" ? "GOLD" : pair.toUpperCase();
}

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function classifyPattern(obs) {
  // Classify the observation into an ICT pattern category
  const { predictedStructure, observedStructure, predictedDirection, actualDirection, verdict, score } = obs;

  // Pattern: sweep → reversal vs sweep → continuation
  const sweptExpectedReversal = predictedDirection === "BSL" && actualDirection === "DOWN";
  const sweptExpectedContinuation = predictedDirection === "BSL" && actualDirection === "UP";
  const falseBreakoutUp = predictedDirection === "BSL" && actualDirection === "DOWN" && observedStructure === predictedStructure;
  const falseBreakoutDown = predictedDirection === "SSL" && actualDirection === "UP" && observedStructure === predictedStructure;
  const structuralShift = observedStructure !== predictedStructure;

  if (score >= 4) {
    if (structuralShift) return { category: "CONFIRMED_REVERSAL", label: "Sweep + MSS reversal", weight: 3 };
    return { category: "CONFIRMED_CONTINUATION", label: "Sweep + continuation maintained", weight: 2 };
  }
  if (score >= 2) {
    if (falseBreakoutUp || falseBreakoutDown) return { category: "FALSE_BREAKOUT", label: "Fake sweep + rejection", weight: 2 };
    return { category: "PARTIAL_SIGNAL", label: "Partial move toward target", weight: 1 };
  }
  // Score 0-1: no movement or moved against prediction
  if (structuralShift && score === 0) return { category: "STRUCTURE_FLIPPED", label: "Structure changed without price move", weight: 2 };
  return { category: "NO_MOVE", label: "Price stalled at prediction point", weight: 0 };
}

function extractLesson(pair, obs, pattern) {
  const lesson = {
    timestamp: obs.nyTime + " NY",
    source: "tape_practice",
    pair,
    category: pattern.category,
    label: pattern.label,
    score: obs.score,
    predictedPrice: obs.predictedPrice,
    observedPrice: obs.observedPrice,
    deltaPct: obs.deltaPct,
    predictedStructure: obs.predictedStructure,
    observedStructure: obs.observedStructure,
    insight: generateInsight(pair, obs, pattern),
  };
  return lesson;
}

function generateInsight(pair, obs, pattern) {
  const { predictedDirection, actualDirection, observedStructure } = obs;

  const insights = {
    "CONFIRMED_REVERSAL": `After ${predictedDirection} sweep, ${observedStructure} confirmed reversal. Price moved ${obs.deltaPct > 0 ? "+" : ""}${obs.deltaPct.toFixed(2)}% confirming liquidity grab was distribution/accumulation. This ${predictedDirection} pool at ${obs.predictedPrice} should be treated as ${actualDirection === "DOWN" ? "supply zone entry" : "demand zone entry"} for next session.`,
    "CONFIRMED_CONTINUATION": `After ${predictedDirection} sweep, continuation held. ${observedStructure} maintained — no reversal yet. Next check: if price breaks beyond sweep extreme, expect acceleration. Current pattern suggests ${predictedDirection} pool acts as support/resistance, not reversal trigger.`,
    "FALSE_BREAKOUT": `Price swept ${predictedDirection} but rejected back inside range (${obs.deltaPct > 0 ? "+" : ""}${obs.deltaPct.toFixed(2)}%). This is a ${predictedDirection === "BSL" ? "sell" : "buy"} signal on retest. The sweep consumed liquidity but failed to hold — likely trap for late entrants.`,
    "PARTIAL_SIGNAL": `Partial movement toward ${predictedDirection} (${obs.deltaPct > 0 ? "+" : ""}${obs.deltaPct.toFixed(2)}%) with ${observedStructure} intact. Incomplete pattern — needs ${obs.deltaPct > 0 ? "further downside" : "further upside"} to confirm direction. Monitor next 30min.`,
    "STRUCTURE_FLIPPED": `Structure shifted from ${obs.predictedStructure} to ${observedStructure} while price barely moved (${obs.deltaPct > 0 ? "+" : ""}${obs.deltaPct.toFixed(2)}%). This indicates institutional repositioning — watch for displacement in next 15min as direction resolves.`,
    "NO_MOVE": `Price stalled near ${obs.predictedPrice} (${obs.deltaPct > 0 ? "+" : ""}${obs.deltaPct.toFixed(2)}%) with ${observedStructure} unchanged. Market consolidating — likely building energy for next move. Check volume imbalance and wick acceleration in next cycle.`,
  };
  return insights[pattern.category] || "No classification";
}

function processPair(pair) {
  const dir = DIR_MAP[pair] || pair.toUpperCase();
  const journalFile = path.join(ROOT, "shared", DATE, dir, "tape_journal.jsonl");
  const lessonsFile = path.join(ROOT, "shared", "performance", `lessons_${pair.toLowerCase()}_${DATE}.json`);

  if (!fs.existsSync(journalFile)) {
    console.log(`  ${pair}: no journal found`);
    return [];
  }

  const lines = fs.readFileSync(journalFile, "utf8").trim().split("\n").filter(Boolean);
  const observations = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(e => e && e.kind === "observation");

  if (observations.length === 0) {
    console.log(`  ${pair}: no observations`);
    return [];
  }

  // Load existing lessons
  let existingLessons = [];
  let existingPlaybook = {};
  if (fs.existsSync(lessonsFile) && !FORCE) {
    try {
      const data = JSON.parse(fs.readFileSync(lessonsFile, "utf8"));
      existingLessons = data.lessons || [];
      existingPlaybook = data.playbook || {};
    } catch {}
  }

  // Process new observations
  const newLessons = [];
  for (const obs of observations) {
    const pattern = classifyPattern(obs);
    const lesson = extractLesson(pair, obs, pattern);

    // Check for duplicate (same pattern within 30 min window)
    const recentSame = existingLessons.filter(l =>
      l.category === pattern.category &&
      Math.abs(new Date(obs.ts) - new Date(l.timestamp)) < 30 * 60 * 1000
    );
    if (recentSame.length === 0) {
      newLessons.push(lesson);
    }
  }

  // Update playbook based on recurring patterns
  for (const lesson of newLessons) {
    const key = lesson.category;
    existingPlaybook[key] = (existingPlaybook[key] || { count: 0, lastSeen: null, avgScore: 0, scoreSum: 0 });
    existingPlaybook[key].count++;
    existingPlaybook[key].lastSeen = lesson.timestamp;
    existingPlaybook[key].scoreSum += lesson.score;
    existingPlaybook[key].avgScore = existingPlaybook[key].scoreSum / existingPlaybook[key].count;
  }

  const allLessons = [...existingLessons, ...newLessons];

  writeJSON(lessonsFile, {
    pair: pair.toUpperCase(),
    date: DATE,
    extracted: new Date().toISOString(),
    totalObservations: observations.length,
    newLessons: newLessons.length,
    lessons: allLessons,
    playbook: existingPlaybook,
  });

  return newLessons;
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log(`\n═══ TAPE LEARNING ENGINE — ${DATE} ${nyTS()} NY ═══\n`);

let totalNew = 0;
for (const pair of TARGET) {
  const pl = processPair(pair);
  console.log(`  ${pair}: ${pl.length} new lesson(s) written (${pl.map(l => l.category).join(", ")})`);
  totalNew += pl.length;
}

console.log(`\nTotal new lessons: ${totalNew}`);
if (totalNew > 0) {
  console.log("Run 'node tools/trade_graph.cjs --rebuild' to propagate into graph memory.");
}
console.log("");
