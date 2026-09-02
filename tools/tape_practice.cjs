#!/usr/bin/env node
// ICT Tape Reading Practice — Prediction → Observation → Journal loop
//
// Step 1: Record screen (Ctrl+Alt+R on TradingView)
// Step 2: Watch 1m chart, predict what price does next
// Step 3: Every 15min pause/unpause asking "What should it do? What is it doing?"
// Step 4: When it does what you predicted → screenshot, annotate, journal
// Step 5: Those confirmation moments build observational skill
//
// Usage:
//   node tools/tape_practice.cjs start [PAIR]     — log prediction + context
//   node tools/tape_practice.cjs observe [PAIR]    — record outcome vs prediction
//   node tools/tape_practice.cjs report            — accuracy summary
//
// Data stored in: shared/YYYY-MM-DD/PAIR/tape_journal.jsonl

const path = require("path");
const fs = require("fs");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..");
const DATE = require("./ny_time.cjs").getNYDate();
const nyTime = () => {
  const d = new Date();
  const offset = require("./ny_time.cjs").getNYOffset(d.getTime());
  return new Date(d.getTime() + offset * 60000);
};
const nyH = () => nyTime().getHours();
const nyM = () => nyTime().getMinutes();
const nyTS = () => `${String(nyH()).padStart(2,"0")}:${String(nyM()).padStart(2,"0")}`;

const RAW_ARGS = process.argv.slice(2);
const WITH_LLM = RAW_ARGS.includes("--llm");
const CMD = RAW_ARGS.find(a => a && !a.startsWith("--"));
const PAIR_RAW = RAW_ARGS.filter(a => a && !a.startsWith("--") && a !== CMD);
const PAIR = (PAIR_RAW[0] || "EURUSD").toUpperCase();
const DIR = PAIR === "XAUUSD" ? "GOLD" : PAIR;
const JOURNAL = path.join(ROOT, "shared", DATE, DIR, "tape_journal.jsonl");
const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const MIN_PREDICTION_AGE_MS = 30 * 60 * 1000; // 30 min guard — don't re-log predictions too soon

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, "shared", DATE, file), "utf8")); }
  catch { return null; }
}

function ensureJournal() {
  fs.mkdirSync(path.dirname(JOURNAL), { recursive: true });
  if (!fs.existsSync(JOURNAL)) fs.writeFileSync(JOURNAL, "", "utf8");
}

function appendEntry(entry) {
  ensureJournal();
  fs.appendFileSync(JOURNAL, JSON.stringify({ ...entry, ts: Date.now(), nyTime: nyTS() }) + "\n", "utf8");
}

function getLatestPrediction() {
  ensureJournal();
  const lines = fs.readFileSync(JOURNAL, "utf8").trim().split("\n").filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const e = JSON.parse(lines[i]);
      if (e.kind === "prediction" && !e.observed) return e;
    } catch {}
  }
  return null;
}

async function cmdStart() {
  // Guard: only log fresh prediction if last one is older than MIN_PREDICTION_AGE_MS
  ensureJournal();
  const lines = fs.readFileSync(JOURNAL, "utf8").trim().split("\n").filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const e = JSON.parse(lines[i]);
      if (e.kind === "prediction" && e.pair === PAIR) {
        const age = Date.now() - e.ts;
        if (age < MIN_PREDICTION_AGE_MS) {
          console.log(`  ⏭ ${PAIR} prediction skipped — last one only ${Math.round(age/60000)}min ago (need ${Math.round(MIN_PREDICTION_AGE_MS/60000)}min cooldown)`);
          return;
        }
        break;
      }
    } catch {}
  }

  const engine1m = readJSON(`${DIR}/engine_1m.json`);
  const engine15m = readJSON(`${DIR}/engine_15m.json`);
  const marker = readJSON(`${DIR}/liquidity_marker.json`);
  const setup = readJSON(`${DIR}/one_trade_setup.json`);

  if (!engine1m) {
    console.error(`❌ No 1m engine data for ${PAIR} on ${DATE}. Run session_start.cjs first.`);
    process.exit(1);
  }

  const s = engine1m.structure || {};
  const l = engine1m.liquidity || [];
  const range = s.lastSwingHigh && s.lastSwingLow
    ? { low: s.lastSwingLow, high: s.lastSwingHigh, ce: (s.lastSwingLow + s.lastSwingHigh) / 2 }
    : null;

  const nearestPool = l.sort((a, b) => a.distance - b.distance)[0];
  const dailyBias = setup?.dailyBias || {};
  const zone = dailyBias.pdZone || "?";

  const entry = {
    kind: "prediction",
    pair: PAIR,
    source: WITH_LLM ? "hybrid" : "human",
    price: engine1m.price,
    htfBias: dailyBias.bias || "?",
    pdZone: zone,
    alignment: (dailyBias.alignment || "").replace(/†/g, "→"),
    structureEvent: s.lastEvent || "?",
    structureBias: s.bias || "?",
    structurePrice: s.lastEventPrice,
    nearestPool: nearestPool
      ? { type: nearestPool.type, price: nearestPool.price, distance: nearestPool.distance, swept: nearestPool.swept }
      : null,
    dealingRange: range
      ? { low: range.low, high: range.high, ce: range.ce, priceLoc: engine1m.price > range.ce ? "ABOVE_CE" : engine1m.price < range.ce ? "BELOW_CE" : "ON_CE" }
      : null,
    primaryDraw: marker?.drawTargets?.primary
      ? { label: marker.drawTargets.primary.label, price: marker.drawTargets.primary.price }
      : null,
    entryReady: marker?.entryGuidance?.ready || false,
    note: "", // user fills this in
  };

  // ── LLM prediction (if --llm flag) ─────────────────────────────────────────
  let llmPrediction = null;
  if (WITH_LLM) {
    try {
      const { chatCompletion } = require("./llm/llm_client.cjs");
      const poolDir = nearestPool?.type === "BSL" ? "UP toward BSL" :
                      nearestPool?.type === "SSL" ? "DOWN toward SSL" : "NEUTRAL";
      const llmPrompt = `You are an ICT/SMC trading analyst. Given this market state for ${PAIR}, predict the next 15-30 minute directional bias.

Market State:
- Price: ${engine1m.price}
- Structure: ${s.bias} ${s.lastEvent} @ ${s.lastEventPrice}
- HTF Bias: ${dailyBias.bias} (${zone})
- Alignment: ${(dailyBias.alignment || "N/A").replace(/†/g, "→")}
- Nearest Pool: ${nearestPool?.type || "none"} @ ${nearestPool?.price || "N/A"} (${nearestPool?.distance?.toFixed(2) || 0}% away)${nearestPool?.swept ? " [SWEPT]" : ""}
- Dealing Range: ${range?.low?.toFixed(5) || "?"}–${range?.high?.toFixed(5) || "?"} | CE=${range?.ce?.toFixed(5) || "?"} | Price is ${engine1m.price > (range?.ce||9999) ? "ABOVE" : "BELOW"} CE
- Primary Draw: ${marker?.drawTargets?.primary?.label || "none"} @ ${marker?.drawTargets?.primary?.price?.toFixed(5) || "N/A"}
- Entry Ready: ${marker?.entryGuidance?.ready ? "YES" : "NO"}

Respond with ONLY valid JSON, no explanation:
{"direction":"UP|DOWN|NEUTRAL","confidence":"high|medium|low","reasoning":"one sentence","targetPrice":null}`;

      const llmResult = await chatCompletion([{ role: "user", content: llmPrompt }], { timeout: 15000 });
      const parsed = JSON.parse(llmResult.text || "{}");
      if (parsed.direction) {
        llmPrediction = {
          direction: parsed.direction,
          confidence: parsed.confidence || "medium",
          reasoning: parsed.reasoning || "",
          targetPrice: parsed.targetPrice || null,
        };
      }
    } catch (_) {
      // LLM unavailable — continue with human-only prediction
    }
  }

  // Write to journal
  appendEntry(entry);

  console.log(`\n═══ TAPE PREDICTION LOGGED — ${PAIR} @ ${nyTS()} NY ═══\n`);
  console.log(`  Source:        ${WITH_LLM ? "🧠 HYBRID (you + LLM)" : "👤 HUMAN"}
  Price:         ${entry.price}
  Structure:     ${entry.structureBias} ${entry.structureEvent} @ ${entry.structurePrice}
  HTF Bias:      ${entry.htfBias} (${entry.pdZone})
  Alignment:     ${entry.alignment}
  Nearest Pool:  ${entry.nearestPool?.type || "none"} @ ${entry.nearestPool?.price || "N/A"} (${entry.nearestPool?.distance?.toFixed(2) || 0}% away)${entry.nearestPool?.swept ? " ✓SWEPT" : ""}
  Dealing Range: ${entry.dealingRange?.low}–${entry.dealingRange?.high} | CE=${entry.dealingRange?.ce} | Price=${entry.dealingRange?.priceLoc}
  Primary Draw:  ${entry.primaryDraw?.label || "none"} @ ${entry.primaryDraw?.price || "N/A"}
  Entry Ready:   ${entry.entryReady ? "✅ YES" : "❌ NO"}`);

  if (llmPrediction) {
    console.log(`\n  🤖 LLM Prediction: ${llmPrediction.direction} (${llmPrediction.confidence} confidence)`);
    console.log(`     Reasoning: "${llmPrediction.reasoning}"`);
    if (llmPrediction.targetPrice) console.log(`     Target: ${llmPrediction.targetPrice.toFixed(5)}`);
  }

  console.log(`\n  📝 Now watch the 1m chart. Pause at 15min intervals.`);
  console.log(`     When price does what you expect → run: node tools/tape_practice.cjs observe ${PAIR}`);
  if (llmPrediction) console.log(`     Compare your call with the LLM's: ${llmPrediction.direction}`);
  console.log("");
}

function cmdObserve() {
  const pred = getLatestPrediction();
  if (!pred) {
    console.error("❌ No pending prediction found. Run 'start' first.");
    process.exit(1);
  }

  // Re-read current engine for comparison
  const engine1m = readJSON(`${DIR}/engine_1m.json`);
  const engine15m = readJSON(`${DIR}/engine_15m.json`);

  if (!engine1m) {
    console.error("❌ No live 1m data available.");
    process.exit(1);
  }

  const s = engine1m.structure || {};
  const nowPrice = engine1m.price;
  const nowStructure = s.lastEvent || "?";
  const nowBias = s.bias || "?";

  // Determine what actually happened
  const priceDelta = nowPrice - pred.price;
  const deltaPct = (priceDelta / pred.price) * 100;
  const movedUp = priceDelta > 0;
  const movedDown = priceDelta < 0;

  const poolDirection = pred.nearestPool?.type === "BSL" ? "UP" : pred.nearestPool?.type === "SSL" ? "DOWN" : "?";
  const wasAtPool = Math.abs(deltaPct) >= (pred.nearestPool?.distance || 999) * 0.5;

  // Score the prediction
  let score = 0;
  let verdict = "";
  const notes = [];

  // Did price move toward the nearest pool?
  if ((pred.nearestPool?.type === "BSL" && movedUp) || (pred.nearestPool?.type === "SSL" && movedDown)) {
    score += 2;
    notes.push("Moved toward nearest pool ✅");
  } else if ((pred.nearestPool?.type === "BSL" && movedDown) || (pred.nearestPool?.type === "SSL" && movedUp)) {
    notes.push("Moved away from nearest pool ❌");
  }

  // Did the structure event match expectation?
  if (nowStructure !== pred.structureEvent) {
    score += 2;
    notes.push(`Structure shifted: ${pred.structureEvent} → ${nowStructure} ✅`);
  } else {
    notes.push(`Structure unchanged: ${nowStructure}`);
  }

  // Did price cross the dealing range CE?
  if (pred.dealingRange) {
    const crossedCE = (pred.price < pred.dealingRange.ce && nowPrice >= pred.dealingRange.ce) ||
                      (pred.price > pred.dealingRange.ce && nowPrice <= pred.dealingRange.ce);
    if (crossedCE) {
      score += 1;
      notes.push("Crossed CE (premium↔discount flip) ✅");
    }
  }

  // Did it reach the primary draw?
  if (pred.primaryDraw) {
    const distToDraw = Math.abs(nowPrice - pred.primaryDraw.price) / nowPrice * 100;
    if (distToDraw < 0.1) {
      score += 3;
      notes.push(`Touching primary draw @ ${pred.primaryDraw.price} ✅`);
    } else if (distToDraw < pred.nearestPool?.distance * 2) {
      notes.push(`Approaching primary draw (${distToDraw.toFixed(2)}% away)`);
    }
  }

  if (score >= 4) verdict = "CONFIRMED ✅";
  else if (score >= 2) verdict = "PARTIAL 👀";
  else verdict = "NO CONFIRMATION ❌";

  const entry = {
    kind: "observation",
    pair: PAIR,
    source: pred.source || "human",
    predictedPrice: pred.price,
    observedPrice: nowPrice,
    priceDelta: Number(priceDelta.toFixed(5)),
    deltaPct: Number(deltaPct.toFixed(4)),
    predictedDirection: pred.nearestPool?.type,
    actualDirection: movedUp ? "UP" : movedDown ? "DOWN" : "FLAT",
    predictedStructure: pred.structureEvent,
    observedStructure: nowStructure,
    observedBias: nowBias,
    score: score,
    verdict: verdict,
    notes: notes.join(" | "),
    userNote: "", // user fills this in
    predTimestamp: pred.ts,
    nyTime: nyTS(),
  };

  // Mark prediction as observed
  const lines = fs.readFileSync(JOURNAL, "utf8").trim().split("\n").filter(Boolean);
  const updated = lines.map(l => {
    try {
      const e = JSON.parse(l);
      if (e.kind === "prediction" && e.ts === pred.ts) return { ...e, observed: true, observedAt: Date.now() };
      return l;
    } catch { return l; }
  });
  fs.writeFileSync(JOURNAL, updated.join("\n") + "\n", "utf8");
  appendEntry(entry);

  console.log(`\n═══ OBSERVATION LOGGED — ${PAIR} @ ${nyTS()} NY ═══\n`);
  console.log(`  Predicted: ${pred.price} → Observed: ${nowPrice} (Δ${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(3)}%)`);
  console.log(`  Structure: ${pred.structureEvent} → ${nowStructure} | Bias: ${nowBias}`);
  console.log(`  Score: ${score}/7 | Verdict: ${verdict}`);
  console.log(`  Notes: ${notes.join(" | ")}`);
  console.log(`\n  💡 Annotate your screenshot and save to shared/${DATE}/${DIR}/screenshots/`);
  console.log("");
}

function cmdReport() {
  ensureJournal();
  const lines = fs.readFileSync(JOURNAL, "utf8").trim().split("\n").filter(Boolean);
  const predictions = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(e => e && e.kind === "prediction");
  const observations = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(e => e && e.kind === "observation");

  if (predictions.length === 0 && observations.length === 0) {
    console.log("No data yet. Run 'start' to begin.");
    return;
  }

  const confirmed = observations.filter(o => o.verdict && o.verdict.includes("CONFIRMED")).length;
  const partial = observations.filter(o => o.verdict && o.verdict.includes("PARTIAL")).length;
  const none = observations.filter(o => o.verdict && o.verdict.includes("NO CONFIRMATION")).length;
  const totalObserved = observations.length;
  const pending = predictions.filter(p => !p.observed).length;

  // Per-source breakdown
  const bySource = {};
  for (const o of observations) {
    const src = o.source || "unknown";
    if (!bySource[src]) bySource[src] = { confirmed: 0, partial: 0, none: 0, total: 0, avgScore: 0, scoreSum: 0 };
    bySource[src].total++;
    if (o.verdict.includes("CONFIRMED")) bySource[src].confirmed++;
    else if (o.verdict.includes("PARTIAL")) bySource[src].partial++;
    else bySource[src].none++;
    bySource[src].scoreSum += o.score || 0;
  }
  for (const src of Object.keys(bySource)) {
    bySource[src].avgScore = (bySource[src].scoreSum / bySource[src].total).toFixed(1);
  }

  console.log(`\n═══ TAPE PRACTICE REPORT — ${PAIR} — ${DATE} ═══\n`);
  console.log(`  Predictions logged:    ${predictions.length}`);
  console.log(`  Observed:              ${totalObserved}`);
  console.log(`  Pending observation:   ${pending}`);
  console.log(`  `);
  if (totalObserved > 0) {
    console.log(`  Overall Accuracy:`);
    console.log(`    CONFIRMED ✅:        ${confirmed} (${(confirmed/totalObserved*100).toFixed(0)}%)`);
    console.log(`    PARTIAL 👀:          ${partial} (${(partial/totalObserved*100).toFixed(0)}%)`);
    console.log(`    NO CONFIRMATION ❌:  ${none} (${(none/totalObserved*100).toFixed(0)}%)`);

    // Source breakdown
    const sources = Object.keys(bySource);
    if (sources.length > 1) {
      console.log(`\n  Breakdown by Source:`);
      for (const src of sources) {
        const b = bySource[src];
        const emoji = src === "human" ? "👤" : src === "llm" || src === "hybrid" ? "🤖" : "❓";
        console.log(`    ${emoji} ${src.toUpperCase()}: ${b.total} obs | Confirmed ${(b.confirmed/b.total*100).toFixed(0)}% | Partial ${(b.partial/b.total*100).toFixed(0)}% | Avg Score ${b.avgScore}/7`);
      }
    }
  } else {
    console.log("  No observations recorded yet. Run 'observe' after watching 15min+");
  }
  console.log(`\n  Journal: ${JOURNAL}\n`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
const cmd = process.argv[2];

if (cmd === "start") cmdStart();
else if (cmd === "observe") cmdObserve();
else if (cmd === "report") cmdReport();
else {
  console.log(`
═══ ICT Tape Reading Practice — Hybrid Mode ═══
Track predictions vs reality to build tape-reading skill.
Both human and LLM predict; both get scored. Compare accuracy.

Usage:
  node tools/tape_practice.cjs start [PAIR]          Log a HUMAN prediction with context
  node tools/tape_practice.cjs start --llm [PAIR]    Log HUMAN + LLM predictions side by side
  node tools/tape_practice.cjs observe [PAIR]        Record what actually happened
  node tools/tape_practice.cjs report                Accuracy summary (broken down by source)

Method:
  1. Run 'start --llm' → see both your call and the LLM's call
  2. Watch 1m chart, pause/unpause every 15min
  3. When price moves → run 'observe'
  4. Both predictions get scored against the same outcome
  5. Review 'report' to compare human vs LLM accuracy over time

Data: shared/${DATE}/${DIR}/tape_journal.jsonl
  `);
}
