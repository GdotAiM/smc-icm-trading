#!/usr/bin/env node
// Tape Narrate — captures the "WHY" behind every tape prediction
// Answers 5 ICT questions per prediction:
//   1. Why THIS direction? (HTF bias + weekly profile)
//   2. Why THIS pool? (liquidity engineering logic)
//   3. Why NOW? (time catalyst)
//   4. What changes everything? (flip condition)
//   5. Why should it behave this way? (daily anchor)
//
// Usage:
//   node tools/tape_narrate.cjs [PAIR] [--all]
//
// Output: appends a "narrative" field to each prediction in tape_journal.jsonl
//         and writes shared/YYYY-MM-DD/PANEL/tape_narratives.md for human review

const fs = require("fs");
const path = require("path");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..");
const DATE = require("./ny_time.cjs").getNYDate();
const d = require("./ny_time.cjs");
const nyH = () => d.getNYHour();
const nyM = () => d.getNYMin();
const nyTS = () => `${String(nyH()).padStart(2,"0")}:${String(nyM()).padStart(2,"0")}`;
const DIR_MAP = { XAUUSD: "GOLD" };
const PAIRS = ["EURUSD", "GBPUSD", "XAUUSD", "NAS100"];
const TARGET = process.argv.slice(2).filter(a => !a.startsWith("--"));
const ALL_MODE = process.argv.includes("--all");

function log(msg) { console.log(`[${nyTS()}] ${msg}`); }
function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, "shared", DATE, file), "utf8")); }
  catch { return null; }
}

// ── Generate narrative for one pair ──────────────────────────────────────────
function narrate(pair) {
  const dir = DIR_MAP[pair] || pair;
  const eng1m = readJSON(`${dir}/engine_1m.json`);
  const eng15m = readJSON(`${dir}/engine_15m.json`);
  const f5 = readJSON(`${dir}/forecast_5m.json`);
  const mk = readJSON(`${dir}/liquidity_marker.json`);
  const setup = readJSON(`${dir}/one_trade_setup.json`);
  const weekProfile = readJSON(`${dir}/../${dir.toLowerCase()}_weekly_profile.md`) || null;

  if (!eng1m) return null;
  const s = eng1m.structure;
  const price = eng1m.price;
  const nearest = (eng15m?.liquidity || []).sort((a,b) => a.distance - b.distance)[0];
  const primaryDraw = mk?.drawTargets?.primary;
  const dailyBias = setup?.dailyBias || {};

  // ── Q1: Why THIS direction? ────────────────────────────────────────────────
  const htfBias = dailyBias.alignment || "?";
  const biasConf = parseFloat(dailyBias.confidence) || 0;
  const weeklyProf = weekProfile?.profile || "unknown";
  const dailyZone = dailyBias.pdZone || "?";
  const q1Direction = s.bias === "bullish" ? "UP toward BSL draw" : s.bias === "bearish" ? "DOWN toward SSL draw" : "NEUTRAL / pending structure confirmation";
  const q1Why = [
    `1m structure: ${s.bias} ${s.lastEvent} @ ${s.lastEventPrice}`,
    `HTF alignment: ${htfBias}`,
    `Daily zone: ${dailyZone} (${(biasConf*100).toFixed(0)}% confidence)`,
    `Weekly profile: ${weeklyProf}`,
  ].join(" | ");

  // ── Q2: Why THIS pool? ─────────────────────────────────────────────────────
  const poolType = nearest?.type || "?";
  const poolPrice = nearest?.price || 0;
  const poolDist = nearest?.distance || 0;
  const poolSwept = nearest?.swept || false;
  const poolAge = nearest?.ageBars || 0;
  const poolStrength = nearest?.strength || 0;
  const q2Why = [
    `${poolType} @ ${poolPrice.toFixed(5)} (${poolDist.toFixed(2)}% away)`,
    poolSwept ? "ALREADY SWEPT — inducement formed, reversal likely" : "UNSWEPT — next target for liquidity grab",
    `Strength: ${poolStrength}/20 | Age: ${poolAge} bars`,
    poolSwept
      ? "Swept pools become support/resistance — price rejected after claiming liquidity"
      : "Unswept pools are where retail stops cluster — algorithm seeks them before reversing",
  ].join(" | ");

  // ── Q3: Why NOW? ───────────────────────────────────────────────────────────
  const kz = getKZ();
  const sb = getSB();
  const equityOpenMins = 9*60+30;
  const nowMins = nyH()*60+nyM();
  const equityIn = Math.max(0, equityOpenMins - nowMins);
  const q3Why = [
    `Killzone: ${kz.active} (next: ${kz.next.split("@")[0]})`,
    `Silver Bullet: ${sb.current} (next: ${sb.next})`,
    `Equity Open: ${equityIn > 0 ? `in ${equityIn} min` : "PAST"} (09:30 NY)`,
    kz.active
      ? "Killzone = institutional flow, highest probability displacement events"
      : "Off-killzone = lower volatility, range-bound behavior expected",
  ].join(" | ");

  // ── Q4: What changes everything? ───────────────────────────────────────────
  const range = s.lastSwingHigh && s.lastSwingLow
    ? { low: s.lastSwingLow, high: s.lastSwingHigh } : null;
  const flipCondition = range
    ? `Close above ${range.high} (bullish flip) OR close below ${range.low} (bearish flip)`
    : "Watch for new swing high/low on 1m";
  const q4Why = [
    `Deal range: ${range?.low?.toFixed(5)}–${range?.high?.toFixed(5)}`,
    `Flip trigger: ${flipCondition}`,
    `MSS status: ${mk?.sweepStatus?.mss ? "✅ CONFIRMED" : "⏳ Pending"} | Sweep: ${mk?.sweepStatus?.swept ? "YES" : "NO"}`,
    mk?.sweepStatus?.detail || "",
  ].join(" | ").replace(/\s+/g, " ").trim();

  // ── Q5: Why should it behave this way? (daily anchor) ─────────────────────
  const drawLabel = primaryDraw?.label || "?";
  const drawPrice = primaryDraw?.price || 0;
  const dailyOpen = setup?.dailyOpenProxy || "?";
  const isAboveDailyOpen = typeof dailyOpen === "number" && price > dailyOpen;
  const q5Why = [
    `Daily anchor: price ${isAboveDailyOpen ? "ABOVE" : "BELOW"} daily open proxy (${dailyOpen})`,
    `Primary draw: ${drawLabel} @ ${drawPrice}`,
    `Forecast direction: ${f5?.direction || "?"} (Δ ${(((f5?.median_path?.[f5?.median_path?.length-1] || price) - price) / price * 100).toFixed(3)}%)`,
    dailyBias.bias === "neutral"
      ? "No clear daily bias — wait for structure to resolve"
      : `Daily bias ${dailyBias.bias} at ${(biasConf*100).toFixed(0)}% anchors this draw as the higher-probability outcome`,
  ].join(" | ");

  return {
    q1Direction, q1Why,
    q2Pool: poolType, q2Price: poolPrice, q2Why,
    q3Why,
    q4Flip: flipCondition, q4Why,
    q5Why,
    meta: {
      price, structure: s.bias + " " + s.lastEvent,
      nearestPool: poolType + "@" + poolPrice.toFixed(5),
      forecastDir: f5?.direction, drawTarget: drawLabel + "@" + drawPrice,
    }
  };
}

function getKZ() {
  const mins = nyH()*60 + nyM();
  const zones = [
    { name: "London KZ", start: 2*60, end: 5*60 },
    { name: "NY AM KZ", start: 8*60, end: 11*60 },
    { name: "NY Lunch", start: 11*60, end: 13*60 },
    { name: "NY PM KZ", start: 13*60, end: 16*60 },
    { name: "NY Close", start: 16*60, end: 17*60 },
  ];
  const active = zones.find(z => mins >= z.start && mins < z.end);
  const next = zones.filter(z => mins < z.start).sort((a,b) => a.start - b.start)[0];
  return { active: active?.name || "none", next: next ? `${next.name} @ ${String(Math.floor(next.start/60)).padStart(2,"0")}:${String(next.start%60).padStart(2,"0")}` : "end of day" };
}

function getSB() {
  const mins = nyH()*60 + nyM();
  const wins = [
    { name: "London SB", start: 3*60, end: 4*60 },
    { name: "NY AM SB", start: 10*60, end: 11*60 },
    { name: "NY PM SB", start: 14*60, end: 15*60 },
  ];
  const cur = wins.find(w => mins >= w.start && mins < w.end);
  const nxt = wins.filter(w => mins < w.start).sort((a,b) => a.start - b.start)[0];
  return { current: cur?.name || "none", next: nxt ? `${nxt.name} (${String(Math.floor(nxt.start/60)).padStart(2,"0")}:${String(nxt.start%60).padStart(2,"0")})` : "none" };
}

// ── Write narrative to journal ───────────────────────────────────────────────
function writeNarrative(pair, narrative) {
  const dir = DIR_MAP[pair] || pair;
  const journalFile = path.join(ROOT, "shared", DATE, dir, "tape_journal.jsonl");
  if (!fs.existsSync(journalFile)) return;

  const lines = fs.readFileSync(journalFile, "utf8").trim().split("\n").filter(Boolean);
  const updated = lines.map(l => {
    try {
      const e = JSON.parse(l);
      if (e.kind === "prediction" && !e.observed) {
        return { ...e, narrative, timestamp: Date.now() };
      }
      return l;
    } catch { return l; }
  });
  fs.writeFileSync(journalFile, updated.join("\n") + "\n", "utf8");

  // Also write human-readable markdown
  const mdFile = path.join(ROOT, "shared", DATE, dir, "tape_narrative.md");
  const md = [`# Tape Narrative — ${pair} — ${DATE}\n`, `---\n`];
  md.push(`**Price:** ${narrative.meta.price} | **Structure:** ${narrative.meta.structure} | **Draw:** ${narrative.meta.drawTarget}\n`);
  md.push(`\n## Q1 — Why THIS Direction?\n\n${narrative.q1Direction}\n\n${narrative.q1Why}\n`);
  md.push(`## Q2 — Why THIS Pool?\n\n${narrative.q2Pool} @ ${narrative.q2Price.toFixed(5)}\n\n${narrative.q2Why}\n`);
  md.push(`## Q3 — Why NOW?\n\n${narrative.q3Why}\n`);
  md.push(`## Q4 — What Changes Everything?\n\n${narrative.q4Flip}\n\n${narrative.q4Why}\n`);
  md.push(`## Q5 — Why Should It Behave This Way?\n\n${narrative.q5Why}\n`);
  md.push(`\n---\n*Generated ${nyTS()} NY*\n`);
  fs.writeFileSync(mdFile, md.join(""), "utf8");
}

// ── Main ─────────────────────────────────────────────────────────────────────
const pairs = ALL_MODE ? PAIRS : (TARGET.length > 0 ? TARGET : ["EURUSD"]);

log(`═══ TAPE NARRATE — ${DATE} ${nyTS()} NY ═══`);
log(`Answering: Why THIS direction? Why THIS pool? Why NOW? What flips it? Why it should behave this way?\n`);

for (const pair of pairs) {
  const n = narrate(pair);
  if (!n) { log(`  ${pair}: no data`); continue; }

  writeNarrative(pair, n);
  log(`  ${pair}: ✅ narrative written → ${DIR_MAP[pair]||pair}/tape_narrative.md`);
  console.log(`\n── ${pair} @ ${n.meta.price} (${n.meta.structure}) ──`);
  console.log(`  Q1 [Direction]: ${n.q1Direction}`);
  console.log(`  Q2 [Pool]:      ${n.q2Pool} @ ${n.q2Price.toFixed(5)} — ${n.q2Why.split(" | ")[1]}`);
  console.log(`  Q3 [Time]:      ${n.q3Why.split(" | ")[0]} | ${n.q3Why.split(" | ")[1]}`);
  console.log(`  Q4 [Flip]:      ${n.q4Flip}`);
  console.log(`  Q5 [Anchor]:    ${n.q5Why.split(" | ")[3]}`);
  console.log("");
}

console.log(`═══ Done. Narratives saved to shared/${DATE}/PANEL/tape_narrative.md per pair ═══\n`);
