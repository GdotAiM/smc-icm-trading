// Morning Briefing — Consolidated Pre-Session Analysis
// Runs ALL Stage 00 modules across ALL pairs. One command.
// Outputs: weekly plan, cross-pair comparison, best candidate, session schedule
//
// Usage: node tools/morning_briefing.cjs

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..");
const DATE = new Date().toISOString().split("T")[0];
const PAIRS = ["EURUSD", "GBPUSD", "XAUUSD", "NAS100"];
const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const dayOfWeek = new Date().getDay();
const dayName = dayNames[dayOfWeek];

function r5(v) { return Number(v).toFixed(5); }
function r2(v) { return Number(v).toFixed(2); }
function run(cmd, timeout) { try { return execSync(cmd, { encoding: "utf8", timeout: timeout || 30000, stdio: ["ignore","pipe","ignore"] }); } catch { return null; } }

const nyTime = new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false });
const nyHour = parseInt(nyTime.split(":")[0]);

console.log("═══════════════════════════════════════════════════════════");
console.log(`  MORNING BRIEFING — ${dayName} ${DATE} — ${nyTime} NY`);
console.log("═══════════════════════════════════════════════════════════\n");

// ═══ STEP 1: Data Check ═══
console.log("═══ STEP 1: Data Freshness ═══");
let dataAge = 999;
try {
  const c = JSON.parse(fs.readFileSync(path.join(ROOT, "shared", DATE, "GBPUSD", "candles_1m.json"), "utf8"));
  dataAge = Math.round((Date.now() - c[c.length - 1].time) / 60000);
} catch {}
if (dataAge > 10) {
  console.log(`  ⚠️ Data is ${dataAge} min stale — refreshing...`);
  run(`node "${path.join(ROOT, "tools", "session_start.cjs")}"`, 300000);
  console.log(`  ✅ Data refreshed`);
} else {
  console.log(`  ✅ Data is ${dataAge} min fresh — no refresh needed`);
}

// ═══ STEP 2: DXY Context ═══
console.log("\n═══ STEP 2: DXY / Risk Context ═══");
try {
  const dxy = JSON.parse(fs.readFileSync(path.join(ROOT, "shared", DATE, "DXY", "engine_1d.json"), "utf8"));
  const dxyBias = dxy?.structure?.bias || "neutral";
  const riskState = dxyBias === "bullish" ? "RISK-OFF (favor shorts indices, USD strength)" :
                     dxyBias === "bearish" ? "RISK-ON (favor longs indices, USD weakness)" : "NEUTRAL";
  console.log(`  DXY: ${dxyBias.toUpperCase()} → ${riskState}`);
  console.log(`  DXY Price: ${r5(dxy.price)} | Event: ${dxy.structure?.lastEvent || 'N/A'}`);
} catch { console.log(`  DXY data unavailable`); }

// ═══ STEP 3: Weekly Profile (once, uses any pair) ═══
console.log("\n═══ STEP 3: Weekly Profile ═══");
let weeklyAnchor = null;
try {
  const wp = require("./weekly_profile_engine.cjs").analyzeWeeklyProfile("EURUSD");
  weeklyAnchor = wp.anchor;
  console.log(`  Profile: ${wp.classification.profileName} (${wp.classification.confidence}%)`);
  console.log(`  Expected Extreme: ${wp.classification.targetDay} ${wp.classification.direction === 'BULLISH' ? 'LOW' : 'HIGH'}`);
  console.log(`  Anchor: ${wp.anchor.direction} | Boost: ×${wp.anchor.boostMultiplier} | Opposing: ×${wp.anchor.counterWeight}`);
  if (wp.classification.candidates.length > 0) {
    console.log(`  Top candidates: ${wp.classification.candidates.slice(0,3).map(c => c.name + '(' + c.score + ')').join(' | ')}`);
  }
} catch(e) { console.log(`  Weekly profile unavailable`); }

// ═══ STEP 4: Cross-Pair Analysis ═══
console.log("\n═══ STEP 4: Cross-Pair Analysis ═══");

const pairData = [];
for (const pair of PAIRS) {
  console.log(`\n  ── ${pair} ──`);
  const data = { pair };

  // Run pipeline quietly, extract key metrics
  const output = run(`node "${path.join(ROOT, "tools", "run_pair.cjs")}" ${pair}`, 120000);
  if (!output) { console.log(`    ❌ Pipeline failed`); continue; }

  // Extract key metrics
  const weightedBias = output.match(/Weighted Bias: (\w+) \((\d+)%/);
  const entryLine = output.match(/Entry: (\w+) @ ([\d.]+)/);
  const modelLine = output.match(/Model: (.+?) \(([\d.]+)\//);
  const rrLine = output.match(/R:R: ([\d.]+):1/);
  const cohLine = output.match(/Unified Coherence: (\d+)\/100/);
  const gateLine = output.match(/INDUCEMENT GATE: (.)/);
  const weekAnchor = output.match(/Anchor: ✅ (\w+)/);

  data.bias = weightedBias ? `${weightedBias[1]} ${weightedBias[2]}%` : "?";
  data.entry = entryLine ? `${entryLine[1]} @ ${entryLine[2]}` : "NO TRADE";
  data.model = modelLine ? `${modelLine[1]} (${modelLine[2]})` : "?";
  data.rr = rrLine ? rrLine[1] : "?";
  data.coherence = cohLine ? parseInt(cohLine[1]) : 0;
  data.gateOpen = output.includes("INDUCEMENT GATE: ✅");
  data.tradeable = output.includes("INDUCEMENT GATE: ✅") && !output.includes("Entry: NO TRADE");

  // PD Array Matrix
  const pda20 = output.match(/20-Day Range: (.+?) \| EQ/);
  const pdaQuad = output.match(/Current: (\w+.*?) \|/);
  data.range20 = pda20 ? pda20[1] : "?";
  data.quadrant = pdaQuad ? pdaQuad[1] : "?";

  // MMXM
  const smr = output.match(/SMR: (✅ .+?)(\n|$)/);
  const side = output.match(/Side of Curve: (\w+)/);
  data.smr = smr ? "✅" : "⏳";
  data.sideOfCurve = side ? side[1] : "?";

  // Wick grading
  const wicks = output.match(/Daily Wicks Graded: (\d+)/);
  data.wicksGraded = wicks ? parseInt(wicks[1]) : 0;

  // Lecture readiness
  data.lecture2 = output.includes("LECTURE 2 SETUP READY");
  data.lecture1 = output.includes("LECTURE 1 SETUP READY");
  data.lecture4 = output.includes("LECTURE 4 SETUP READY");
  data.turtleSoup = output.includes("TURTLE SOUP:");

  console.log(`    Bias: ${data.bias} | 20-Day: ${data.quadrant}`);
  console.log(`    MMXM: SMR ${data.smr} | Side: ${data.sideOfCurve} | Wicks: ${data.wicksGraded}`);
  console.log(`    Entry: ${data.entry} | Gate: ${data.gateOpen ? 'OPEN' : 'CLOSED'} | R:R ${data.rr}:1`);
  if (data.lecture2 || data.lecture1 || data.lecture4) console.log(`    Lectures: ${data.lecture2 ? 'L2 ' : ''}${data.lecture1 ? 'L1 ' : ''}${data.lecture4 ? 'L4 ' : ''}`);
  if (data.turtleSoup) console.log(`    🐢 Turtle Soup detected`);

  pairData.push(data);
}

// ═══ STEP 5: Cross-Pair Ranking ═══
console.log("\n\n═══════════════════════════════════════════════════════════");
console.log("  CROSS-PAIR RANKING");
console.log("═══════════════════════════════════════════════════════════\n");

// Rank by: tradeable + gate open + coherence + R:R
const ranked = [...pairData].sort((a, b) => {
  const aScore = (a.tradeable ? 100 : 0) + (a.gateOpen ? 50 : 0) + a.coherence + parseFloat(a.rr || 0) * 10;
  const bScore = (b.tradeable ? 100 : 0) + (b.gateOpen ? 50 : 0) + b.coherence + parseFloat(b.rr || 0) * 10;
  return bScore - aScore;
});

console.log("| Rank | Pair | Bias | Entry | Gate | R:R | Coh | 20-Day | SMR | Lectures |");
console.log("|------|------|------|-------|------|-----|-----|--------|-----|----------|");
for (let i = 0; i < ranked.length; i++) {
  const d = ranked[i];
  const rank = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}`;
  const lectures = [d.lecture2 ? 'L2' : '', d.lecture1 ? 'L1' : '', d.lecture4 ? 'L4' : ''].filter(Boolean).join(',') || '—';
  console.log(`| ${rank} | ${d.pair} | ${d.bias} | ${d.entry} | ${d.gateOpen ? '✅' : '🛑'} | ${d.rr}:1 | ${d.coherence} | ${d.quadrant} | ${d.smr} | ${lectures} |`);
}

// ═══ STEP 6: Best Candidate ═══
const best = ranked[0];
if (!best) { console.log(`\n═══ NO CANDIDATES — all pairs failed ═══\n`); process.exit(0); }
console.log(`\n═══ BEST CANDIDATE: ${best.pair} ═══`);
if (best.tradeable) {
  console.log(`  ✅ TRADEABLE — ${best.entry} | Gate: OPEN | R:R ${best.rr}:1 | Coherence: ${best.coherence}/100`);
  console.log(`  Model: ${best.model} | Bias: ${best.bias} | 20-Day: ${best.quadrant}`);
  console.log(`\n  🎯 ACTION: ${best.pair} ${best.entry.split(' @ ')[0]} @ ${best.entry.split(' @ ')[1]}`);
} else {
  console.log(`  ⏳ NOT TRADEABLE — ${best.gateOpen ? 'Gate open but no valid entry' : 'Inducement gate closed'}`);
  console.log(`  Closest: ${best.pair} ${best.bias} | Gate: ${best.gateOpen ? 'OPEN' : 'CLOSED'} | R:R ${best.rr}:1`);
}

// ═══ STEP 7: Session Schedule ═══
console.log(`\n\n═══════════════════════════════════════════════════════════`);
console.log(`  TODAY'S SESSION SCHEDULE — ${dayName}`);
console.log(`═══════════════════════════════════════════════════════════\n`);

const schedule = [
  { time: "02:00 AM", event: "London KZ opens", action: dayOfWeek === 1 ? "Range-setting — wait for first hour" : "Watch for London session raid" },
  { time: "07:00 AM", event: "Lecture 2 window", action: "London Hunt + IFVG — relative equal levels on 5m/1m" },
  { time: "08:00 AM", event: "Lecture 1 formation", action: "Pre-08:30 levels building — do not enter yet" },
  { time: "08:30 AM", event: "Lecture 4 + NY open", action: "NDOG/NWOG gap model + 08:30 liquidity raid" },
  { time: "09:30 AM", event: "AMOR + NYSE open", action: "AM Session Opening Range — most important for indices" },
  { time: "09:50 AM", event: "⭐⭐ NY-AM Macro", action: "Highest conviction window — algorithmic delivery peak" },
  { time: "10:00 AM", event: "Silver Bullet", action: "Scalp window — SB model gets priority boost" },
  { time: "10:30 AM", event: "London Close (counter)", action: "Counter-trend retracement — strict prerequisites" },
  { time: "1:30 PM", event: "PMOR + PM Session", action: "Afternoon reset — closing framework" },
  { time: "4:00 PM", event: "NY Close", action: dayOfWeek === 5 ? "CLOSE ALL POSITIONS — Friday" : "End of regular session" },
];

const nowMins = nyHour * 60 + parseInt(nyTime.split(":")[1]);
for (const s of schedule) {
  const [h, mPart] = s.time.replace(" AM","").replace(" PM","").split(":");
  let hNum = parseInt(h);
  if (s.time.includes("PM") && hNum !== 12) hNum += 12;
  if (s.time.includes("AM") && hNum === 12) hNum = 0;
  const sMins = hNum * 60 + parseInt(mPart);
  const isNow = Math.abs(nowMins - sMins) < 30;
  const isPast = nowMins > sMins;
  const icon = isNow ? '⚡ NOW' : isPast ? '  ✓' : '  ⏳';
  console.log(`  ${icon} ${s.time.padEnd(12)} ${s.event.padEnd(28)} ${s.action}`);
}

// ═══ QUICK COMMANDS ═══
console.log(`\n\n═══════════════════════════════════════════════════════════`);
console.log(`  QUICK COMMANDS`);
console.log(`═══════════════════════════════════════════════════════════\n`);
console.log(`  Full analysis:      node tools/run_pair.cjs ${best.pair}`);
console.log(`  Refresh data:       node tools/session_start.cjs`);
console.log(`  Autonomous NY AM:   node tools/tv-mcp/ny_am_autonomous.cjs`);
console.log(`  Journal session:    node tools/ict_continuous_learn.cjs --run`);
console.log(`  Re-run briefing:    node tools/morning_briefing.cjs`);
