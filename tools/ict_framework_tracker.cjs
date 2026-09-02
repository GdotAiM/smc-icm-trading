#!/usr/bin/env node
// ICT Framework Tracker — outputs the 5-question analysis for all pairs
// Usage: node tools/ict_framework_tracker.cjs [PAIR] [--live]
//
// Reads from engine_15m.json, liquidity_marker.json, one_trade_setup.json
// Outputs a structured 5-question summary per pair.

const path = require("path");
const fs = require("fs");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..");
const DATE = require("./ny_time.cjs").getNYDate();
const nyH = require("./ny_time.cjs").getNYHour();
const nyM = require("./ny_time.cjs").getNYMin();
const session = require("./ny_time.cjs").getNYSession();

const PAIRS = process.argv[2]
  ? [process.argv[2].toUpperCase()]
  : ["EURUSD", "GBPUSD", "XAUUSD", "NAS100"];

function dirName(pair) {
  return pair === "XAUUSD" ? "GOLD" : pair;
}

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, "shared", DATE, file), "utf8"));
  } catch {
    return null;
  }
}

function getDealingRange(engine) {
  const s = engine.structure;
  if (!s) return null;
  return { low: s.lastSwingLow, high: s.lastSwingHigh, ce: (s.lastSwingLow + s.lastSwingHigh) / 2 };
}

function classifyPool(pool, range) {
  if (!range) return pool.type; // can't classify without range
  if (pool.price > range.high) return "EXTERNAL";
  if (pool.price < range.low) return "EXTERNAL";
  return "INTERNAL";
}

function q3Verdict(engine) {
  const ev = engine.structure?.lastEvent;
  const bias = engine.structure?.bias;
  if (ev === "CHoCH") return `REVERSAL CONFIRMED — ${bias} CHoCH @ ${engine.structure.lastEventPrice}`;
  if (ev === "BOS") return `CONTINUATION INTEREST — ${bias} BOS @ ${engine.structure.lastEventPrice}`;
  return `NEUTRAL — no structure event recorded`;
}

function q4Retracement(engine) {
  const obs = (engine.orderBlocks || []).filter(ob => ob.distance !== undefined && ob.distance >= 0);
  if (obs.length === 0) return "No clean OBs — first retracement zone = recent internal pool (swept support/resistance)";
  const near = obs.sort((a, b) => a.distance - b.distance).slice(0, 2);
  return near.map(ob => `${ob.type} ${ob.kind} [${ob.bottom.toFixed(5)}–${ob.top.toFixed(5)}] dist=${ob.distance.toFixed(3)}`).join(" | ");
}

function q1Summary(marker, engine) {
  const primary = marker.drawTargets?.primary;
  const hrlr = marker.hrlrLrlr;
  const range = getDealingRange(engine);
  const price = engine.price;
  if (!range) return "No dealing range available";
  const loc = price > range.ce ? "ABOVE CE (premium)" : price < range.ce ? "BELOW CE (discount)" : "ON CE (neutral)";
  return [
    `Primary draw: ${primary?.label || "?"} @ ${primary?.price}`,
    `Opposite: ${marker.drawTargets?.allTargets?.[1]?.label || "?"} @ ${marker.drawTargets?.allTargets?.[1]?.price || "?"}`,
    `15m range: ${range.low.toFixed(5)}–${range.high.toFixed(5)} | CE: ${range.ce.toFixed(5)}`,
    `Price ${price} → ${loc}`,
    `HRLR/LRLR: ${hrlr?.hrlrCount || 0} hard / ${hrlr?.lrlrCount || 0} easy`
  ].join(" | ");
}

function q2Status(marker) {
  const sw = marker.sweepStatus;
  if (!sw) return "No sweep data";
  const status = sw.swept ? "SWEPT ✅" : "NOT swept ⏳";
  const mss = sw.mss ? "✅ CONFIRMED" : "⏳ Pending";
  const detail = sw.detail || "";
  return `${status} | MSS: ${mss} | ${detail}`;
}

function q5Anchor(setup) {
  const db = setup?.dailyBias || {};
  const zone = db.pdZone || "?";
  // Read weekly profile from stage output
  const pairDir = (pair) => pair === "XAUUSD" ? "GOLD" : pair;
  const wpm = path.join(ROOT, "stages", "00_macro_context", "output", pairDir(PAIRS[0]).toLowerCase() + "_weekly_profile.md");
  // For non-first pairs, just use setup data
  return [
    `Daily bias: ${db.bias || "?"} (${(parseFloat(db.confidence) * 100).toFixed(0)}% conf)`,
    `PD Zone: ${zone}`,
    `Alignment: ${(db.alignment || "?").replace(/†/g, "→")}`
  ].join(" | ");
}

console.log(`\n═══ ICT FRAMEWORK TRACKER — ${DATE} ${String(nyH).padStart(2,"0")}:${String(nyM).padStart(2,"0")} NY ═══\n`);
console.log(`Session: ${session?.name || "unknown"}\n`);

for (const pair of PAIRS) {
  const dir = dirName(pair);
  const engine = readJSON(`${dir}/engine_15m.json`);
  const marker = readJSON(`${dir}/liquidity_marker.json`);
  const setup = readJSON(`${dir}/one_trade_setup.json`);
  const weekly = readJSON(`${dir}/../eurusd_weekly_profile.md`) || null; // fallback; real weekly in stages

  console.log(`─`.repeat(60));
  console.log(`  ${pair}  |  Price: ${engine?.price || "?"}`);
  console.log(`─`.repeat(60));

  if (!engine) {
    console.log("  ⚠️ No 15m engine data for today — run session_start.cjs first\n");
    continue;
  }

  const range = getDealingRange(engine);

  console.log(`  Q1 — WHAT AM I LOOKING FOR?`);
  console.log(`      ${q1Summary(marker, engine)}\n`);

  console.log(`  Q2 — CLOSE ABOVE/BELOW CHANGES EVERYTHING?`);
  console.log(`      ${q2Status(marker)}\n`);

  console.log(`  Q3 — LACK OF INTEREST IN CONTINUATION?`);
  console.log(`      ${q3Verdict(engine)}\n`);

  console.log(`  Q4 — IF IT RETRACES, WHAT DOES IT RETRACE INTO?`);
  console.log(`      ${q4Retracement(engine)}\n`);

  console.log(`  Q5 — WHY, ANCHORED TO DAILY?`);
  console.log(`      ${q5Anchor(setup, pair)}\n`);

  // Quick external/internal pool map
  if (range && engine.liquidity) {
    console.log(`  LIQUIDITY POOLS (15m):`);
    for (const p of engine.liquidity) {
      const class_ = classifyPool(p, range);
      const swept = p.swept ? "✓SWEPT" : "○";
      console.log(`    ${p.type} @ ${p.price.toFixed(5)} | ${class_} | str=${p.strength} | age=${p.ageBars}b | ${swept}`);
    }
    console.log("");
  }

  const entry = marker?.entryGuidance;
  if (entry) {
    console.log(`  ENTRY STATUS: ${entry.ready ? "✅ READY" : "❌ NOT READY"} — ${entry.detail || ""}`);
  }
  console.log("");
}

console.log(`═`.repeat(60));
console.log(`Tracker saved to shared/${DATE}/ICT_FRAMEWORK_TRACKER.md`);
console.log(`═`.repeat(60) + "\n");
