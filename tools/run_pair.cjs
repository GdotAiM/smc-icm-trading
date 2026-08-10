// ICM Stage Runner — runs all 7 stages for a given pair
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..");
const now = new Date();
const DATE = now.toISOString().split("T")[0];
const ny = require("./ny_time.cjs");
const { calcATR, loadCandles } = require("./lib/metrics.cjs");
const { resolveCyclePhase } = require("./lib/cycle_phase.cjs");
const NY_HOUR = ny.getNYHour();
const NY_SESSION = ny.getNYSession();

const PAIR = process.argv[2] || "EURUSD";
const pairLabel = PAIR === "GOLD" ? "XAUUSD" : PAIR;
const sharedDir = path.join(ROOT, "shared", DATE, PAIR);

// ── Instrument Type Detection & Point/Pip Scaling ──────────────────
const INDICES = ["NAS100", "US30", "SPX500", "US100", "US500", "GER40", "UK100", "JPN225"];
const CRYPTO = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "LINKUSDT"];

function instrumentConfig(pair) {
  if (pair === "DXY") {
    return { type: "dxy", pipSize: 0.01, pipMultiplier: 100, pipLabel: "ticks", priceDecimals: 2,
      pointValuePerLot: 10, // 1 tick (0.01) ≈ $10 per contract
    };
  }
  if (pair === "GOLD" || pair === "XAUUSD") {
    return { type: "gold", pipSize: 0.10, pipMultiplier: 10, pipLabel: "points", priceDecimals: 2,
      pointValuePerLot: 10, // 1 point (0.10) = $10 per standard lot (100 oz)
    };
  }
  if (INDICES.includes(pair)) {
    return { type: "index", pipSize: 1.0, pipMultiplier: 1, pipLabel: "points", priceDecimals: 1,
      pointValuePerLot: 1, // 1 point = $1 per contract (CFD standard)
    };
  }
  if (CRYPTO.includes(pair)) {
    return { type: "crypto", pipSize: 0.01, pipMultiplier: 100, pipLabel: "ticks", priceDecimals: 2,
      pointValuePerLot: 1, // 1 tick (0.01) ≈ $1 per coin
    };
  }
  // Default: forex (USD quote)
  return { type: "forex", pipSize: 0.0001, pipMultiplier: 10000, pipLabel: "pips", priceDecimals: 5,
    pointValuePerLot: 10, // 1 pip (0.0001) = $10 per standard lot (100k units)
  };
}

const IC = instrumentConfig(PAIR);

function r2(v) { return Number(v).toFixed(2); }
function r5(v) { return Number(v).toFixed(IC.priceDecimals); }
function toPips(v) { return Math.round(v * IC.pipMultiplier); } // Convert price distance to display units
function pipLabel() { return IC.pipLabel; }

function writeMd(stage, filename, content) {
  const dir = path.join(ROOT, "stages", stage, "output");
  fs.mkdirSync(dir, { recursive: true });
  const outPath = path.join(dir, `${PAIR.toLowerCase()}_${filename}`);
  fs.writeFileSync(outPath, content, "utf8");
  console.log(`  ✓ ${stage}/${PAIR.toLowerCase()}_${filename}`);
}

console.log(`\n${"=".repeat(55)}`);
console.log(`  ICM Pipeline — ${pairLabel} — ${DATE}`);
console.log(`${"=".repeat(55)}`);

// ═══════════════ TRACE START — Session Tracer ═══════════════
try {
  execSync(`node "${path.join(ROOT, "evaluation", "traces", "session_tracer.cjs")}" start ${PAIR}`, {
    timeout: 5000, stdio: "ignore",
  });
} catch {}

// ═══════════════ GRAPH MEMORY — Rebuild + Inject Context ═══════════════
console.log("\n═══ GRAPH MEMORY ═══");
try {
  const g = require("./trade_graph.cjs").buildGraph();
  require("./trade_graph.cjs").saveGraph(g);
  const tCount = Object.values(g.nodes).filter(n => n.type === "trade").length;
  console.log(`  Graph rebuilt: ${tCount} trades indexed`);

  // Inject memory context for this pair before analysis
  const ctx = require("./trade_graph.cjs").buildInjectionContext(g, pairLabel, null);
  const md = require("./trade_graph.cjs").formatContextMarkdown(ctx);
  const memDir = path.join(ROOT, "stages", "00_macro_context", "output");
  fs.mkdirSync(memDir, { recursive: true });
  const memFile = path.join(memDir, `${PAIR.toLowerCase()}_memory.md`);
  if (md) {
    fs.writeFileSync(memFile, md, "utf8");
    console.log(`  Memory injected: ${ctx.similarTrades.length} similar trades, ${ctx.activeLessons.length} active lessons, ${ctx.unresolvedGaps.length} unresolved gaps → ${memFile}`);
  } else {
    console.log(`  Memory: No prior data for ${pairLabel} — first session`);
  }
} catch (e) {
  console.log(`  ⚠️  Graph memory skipped: ${e.message}`);
}

// ═══════════════ WEEKLY RANGE PROFILE ═══════════════
console.log("\n═══ WEEKLY RANGE PROFILE — 12-Profile Classification ═══");
let weeklyProfile = null;
let weeklyAnchor = null;
try {
  const { analyzeWeeklyProfile } = require("./weekly_profile_engine.cjs");
  weeklyProfile = analyzeWeeklyProfile(PAIR);
  console.log(`  HTF: ${weeklyProfile.htf?.detail || 'N/A'}`);
  console.log(`  Bias: ${weeklyProfile.bias?.detail}`);
  console.log(`  Profile: ${weeklyProfile.classification.profileName} (${weeklyProfile.classification.confidence}%)`);
  if (weeklyProfile.classification.candidates.length > 0) {
    const top3 = weeklyProfile.classification.candidates.slice(0, 3).map(c => `${romanNumeral(c.id)} ${c.name}(${c.score})`).join(" | ");
    console.log(`  Candidates: ${top3}`);
  }
  weeklyAnchor = weeklyProfile.anchor;
  const anchorIcon = weeklyAnchor.skipWeek ? "⚠️ SKIP" : "✅";
  console.log(`  Anchor: ${anchorIcon} ${weeklyAnchor.direction} | Target: ${weeklyAnchor.targetDay} | Boost: ×${weeklyAnchor.boostMultiplier}`);
  if (weeklyAnchor.skipWeek) console.log(`  ⚠️ ${weeklyAnchor.detail}`);
} catch(e) {
  console.log(`  Weekly profile unavailable: ${e.message.slice(0, 80)}`);
}

// Need romanNumeral helper for the candidates display
function romanNumeral(n) { const r = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"]; return r[n] || String(n); }

// ═══════════════ ONE TRADE SETUP FOR LIFE ═══════════════
console.log("\n═══ ONE TRADE SETUP FOR LIFE — Session Framework ═══");
let oneTradeSetup = null;
try {
  const { analyzeOneTradeSetup } = require("./one_trade_setup.cjs");
  oneTradeSetup = analyzeOneTradeSetup(PAIR);
  console.log(`  Daily Bias: ${oneTradeSetup.dailyBias.bias.toUpperCase()} (${oneTradeSetup.dailyBias.confidence} confidence) | ${oneTradeSetup.dailyBias.alignment}`);
  console.log(`  Zone: ${oneTradeSetup.dailyBias.pdZone} | Tradeable: ${oneTradeSetup.dailyBias.tradeable ? '✅' : '❌'}`);
  if (oneTradeSetup.prevAM) {
    console.log(`  TP Target: Prev AM H ${r5(oneTradeSetup.prevAM.high)} / L ${r5(oneTradeSetup.prevAM.low)} (${oneTradeSetup.prevAM.date})`);
  }
  for (const r of oneTradeSetup.raidSummary) console.log(`  ${r}`);
  console.log(`  ${oneTradeSetup.firstOpp.detail}`);
  if (oneTradeSetup.firstOpp.locked) {
    console.log(`  ⚡ Direction Boost: ×${oneTradeSetup.firstOpp.directionBoost} for ${oneTradeSetup.firstOpp.lockedDirection} models`);
  }
} catch(e) {
  console.log(`  One Trade Setup unavailable: ${e.message.slice(0, 80)}`);
}

// ═══════════════ BREAD AND BUTTER — Session Scalp Framework ═══════════════
console.log("\n═══ BREAD AND BUTTER — Session Scalp ═══");
try {
  const { analyzeBreadAndButter } = require("./bread_and_butter.cjs");
  const bnb = analyzeBreadAndButter(PAIR);
  console.log(`  Session: ${bnb.session?.label || 'None'} | HTF: ${bnb.htfBias.detail}`);
  if (bnb.setup?.active) {
    console.log(`  ${bnb.setup.detail}`);
    console.log(`  ⚡ Direction: ${bnb.setup.direction} | Engine: ${bnb.setup.engine} | TP: ${bnb.setup.tp} | SL: ${bnb.setup.sl}`);
  } else {
    console.log(`  ${bnb.setup?.detail || 'No setup for current session'}`);
  }
} catch(e) {
  console.log(`  Bread and Butter unavailable: ${e.message.slice(0, 80)}`);
}

// ═══ TIME & PRICE GRID — Pre-Session Narrative ═══
console.log("\n═══ TIME & PRICE GRID — Daily Narrative ═══");
try {
  const { analyzeTimePriceGrid } = require("./time_price_grid.cjs");
  const tpg = analyzeTimePriceGrid(PAIR);
  console.log(`  Suspension Blocks: ${tpg.blockCount} on daily`);
  if (tpg.spaceBetween) console.log(`  Space Between: ${tpg.spaceBetween.detail}`);
  if (tpg.wickBody) console.log(`  Wick/Body: ${tpg.wickBody.detail}`);
  if (tpg.delivery) console.log(`  Delivery: ${tpg.delivery.detail}`);
  if (tpg.tetheredCount > 0) console.log(`  Tethered PD Arrays: ${tpg.tetheredCount} anchored to graded levels`);
  console.log(`  Narrative: ${tpg.narrative}`);
} catch(e) { console.log(`  Time & Price Grid unavailable: ${e.message.slice(0, 80)}`); }

// ═══ HIGH PRECISION SECRETS — Parts 1 & 2 ═══
console.log("\n═══ HIGH PRECISION — 7-9AM Range + ORG ═══");
// Hoisted so Stage 04 (tethering multiplier) and Stage 05 (-0.5 TP) can consume it.
let hpPrecision = null;
let precisionFacts = { active: false, tetheredCount: 0, tetherBoost: 1, range: null, bodyWickAdj: 0 };
try {
  const { analyzeHighPrecision } = require("./high_precision_secrets.cjs");
  hpPrecision = analyzeHighPrecision(PAIR);
  if (hpPrecision.preSession) console.log(`  Pre-Session: ${hpPrecision.preSession.detail}`);
  console.log(`  Tethering: ${hpPrecision.tethering.detail}`);
  console.log(`  Body/Wick: ${hpPrecision.bodyWick.detail}`);
  if (hpPrecision.org) console.log(`  ORG: ${hpPrecision.org.detail}`);
  for (const g of hpPrecision.gapTypes) console.log(`  Gap: ${g.detail}`);
  console.log(`  Confidence: ${hpPrecision.confidenceAdjustment >= 0 ? '+' : ''}${hpPrecision.confidenceAdjustment} pts`);

  // The 7-9AM range locks at ~9:01 NY and becomes the "algorithm's" reference
  // canvas for the rest of the session (High Precision Secrets / ICT Gems 9:30AM).
  if (hpPrecision.preSession) {
    const nyMin = ny.getNYMin();
    const postLock = NY_HOUR > 9 || (NY_HOUR === 9 && nyMin >= 1);
    precisionFacts = {
      active: postLock,
      tetheredCount: hpPrecision.tethering?.tetheredCount || 0,
      tetheredDailyCount: hpPrecision.tethering?.tetheredDailyCount || 0,
      tetherBoost: parseFloat(hpPrecision.tethering?.boost || 1),
      range: hpPrecision.preSession,
      bodyWickAdj: hpPrecision.bodyWick?.adjustment || 0,
      confidenceAdjustment: hpPrecision.confidenceAdjustment || 0,
    };
    console.log(`  🔒 7-9AM framework: ${precisionFacts.active ? 'ACTIVE (post-9:01)' : 'locked, awaiting 9:01'} | ${precisionFacts.tetheredCount} tethered array(s)${precisionFacts.tetheredDailyCount ? ` (${precisionFacts.tetheredDailyCount} to daily/weekly levels)` : ''} | tether ×${r2(precisionFacts.tetherBoost)}`);
  }
} catch(e) { console.log(`  High Precision unavailable: ${e.message.slice(0, 80)}`); }

// ═══ SOFT-OPEN BIAS GUARD — one-day soft open ≠ daily reversal ═══
// After a multi-day rally, a single soft/inside day is normal digestion, not a
// reversal. The fact is consumed by registryCtx and checked against 1D bias.
let softOpenFact = null;
try {
  const { analyzeSoftOpen } = require("./soft_open.cjs");
  softOpenFact = analyzeSoftOpen(PAIR);
  if (softOpenFact?.available) console.log(`  Soft-Open: ${softOpenFact.detail}`);
} catch(e) { console.log(`  Soft-open guard unavailable: ${e.message.slice(0, 60)}`); }

// ═══ PD ARRAY MATRIX — 20-Day Quadrant Grading ═══
console.log("\n═══ PD ARRAY MATRIX — 20-Day + Quadrants ═══");
try {
  const { analyzePDAMatrix } = require("./pd_array_matrix.cjs");
  const pda = analyzePDAMatrix(PAIR);
  console.log(`  ${pda.range20?.detail || 'N/A'}`);
  console.log(`  Current: ${pda.currentQuadrant} | ${pda.arrayCount} arrays catalogued | ${pda.dxy.detail}`);
  for (const c of pda.confluence) console.log(`  ${c.detail}`);
} catch(e) { console.log(`  PDA Matrix unavailable: ${e.message.slice(0,80)}`); }

// ═══ MMXM — Smart Money Reversal + Side of Curve ═══
console.log("\n═══ MMXM — Market Maker Model ═══");
try {
  const { analyzeMMXM } = require("./mmxm_engine.cjs");
  const mmxm = analyzeMMXM(PAIR);
  console.log(`  SMR: ${mmxm.smr.detected ? '✅ ' + mmxm.smr.type : '⏳ ' + mmxm.smr.detail}`);
  console.log(`  Side of Curve: ${mmxm.side.side} (${mmxm.side.confidence})`);
  if (mmxm.symmetry?.target) console.log(`  Symmetry Target: ${r5(mmxm.symmetry.target)}`);
  console.log(`  Entry Phase: ${mmxm.entry.phase} — ${mmxm.entry.action}`);
} catch(e) { console.log(`  MMXM unavailable: ${e.message.slice(0,80)}`); }

// ═══════════════ STAGE 00 — Macro Context ═══════════════
console.log("\n═══ STAGE 00 — Macro Context ═══");
let macroContext = null;
try {
  // Try to read pre-generated macro context (from session_start or manual)
  const cycleFile = path.join(ROOT, "stages", "00_macro_context", "output", "cycle_phase.md");
  const modelFilterFile = path.join(ROOT, "stages", "00_macro_context", "output", "model_filter.md");
  const dayFile = path.join(ROOT, "stages", "00_macro_context", "output", "day_context.md");

  // WP-3: the cycle phase is derived from PRICE STRUCTURE via
  // lib/cycle_phase.cjs after the engine reports load below. The old
  // markdown-regex parser (`/\*\*([A-Z]+)\*\*/`) is removed — phase never
  // comes from parsing narrative text. We keep the markdown ONLY for the
  // MMXM step narrative.
  if (fs.existsSync(cycleFile)) {
    const cycleMd = fs.readFileSync(cycleFile, "utf8");
    const mmxmMatch = cycleMd.match(/MMXM Step[* ]*: (\d)/);
    macroContext = {
      phase: null,
      mmxmStep: mmxmMatch ? parseInt(mmxmMatch[1]) : 0,
      source: "pre-generated",
    };
    console.log(`  Macro context loaded (MMXM step ${macroContext.mxmStep}/4 from Stage 00 output)`);
  } else {
    // Run macro context engine inline
    console.log(`  Generating macro context...`);
    try {
      const { execSync } = require("child_process");
      execSync(`node "${ROOT}/tools/macro_context.cjs"`, { stdio: ["ignore", "pipe", "ignore"], encoding: "utf8", timeout: 10000 });
      if (fs.existsSync(cycleFile)) {
        const cycleMd = fs.readFileSync(cycleFile, "utf8");
        const mmxmMatch = cycleMd.match(/MMXM Step[* ]*: (\d)/);
        macroContext = {
          phase: null,
          mmxmStep: mmxmMatch ? parseInt(mmxmMatch[1]) : 0,
          source: "auto-generated",
        };
        console.log(`  Macro context auto-generated (MMXM step ${macroContext.mxmStep}/4)`);
      }
    } catch (e) {
      console.log(`  Macro context unavailable — skipping (${e.message.slice(0, 50)})`);
    }
  }
} catch (e) {
  console.log(`  Macro context unavailable — continuing without`);
}

// Cycle weights for model scoring — all 14 models (matching model_cycle_map.md)
// Note: MMXM Sell/Buy both map to "2022 Model (MMXM)" weight
const CYCLE_MODEL_WEIGHTS = {
  ACCUMULATION: { "MMXM Sell Model": 0.3, "MMXM Buy Model": 0.3, "Silver Bullet": 0.3, "OTE + Institutional OB": 0.3, "Turtle Soup": 0.3, "Breaker Block": 1.0, "Unicorn (OTE+FVG)": 0.3, "SCOB": 0.3, "2FVG Entry": 0.3, "Judas Swing": 1.3, "Asian Range Breakout": 1.3, "NWOG/NDOG": 1.3, "Mitigation Block": 0.8, "Rejection Block": 0.5, "London Hunt + IFVG": 0.3, "NDOG/NWOG News Model": 0.3, "08:30 Liquidity Raid Model": 0.3 },
  MANIPULATION: { "MMXM Sell Model": 1.0, "MMXM Buy Model": 1.0, "Silver Bullet": 1.3, "OTE + Institutional OB": 1.0, "Turtle Soup": 1.3, "Breaker Block": 1.3, "Unicorn (OTE+FVG)": 0.3, "SCOB": 0.5, "2FVG Entry": 0.3, "Judas Swing": 1.3, "Asian Range Breakout": 0.5, "NWOG/NDOG": 0.3, "Mitigation Block": 1.0, "Rejection Block": 1.0, "London Hunt + IFVG": 1.5, "NDOG/NWOG News Model": 1.3, "08:30 Liquidity Raid Model": 1.5 },
  DISTRIBUTION: { "MMXM Sell Model": 1.4, "MMXM Buy Model": 1.4, "Silver Bullet": 1.1, "OTE + Institutional OB": 1.4, "Turtle Soup": 0.3, "Breaker Block": 0.5, "Unicorn (OTE+FVG)": 1.4, "SCOB": 1.4, "2FVG Entry": 1.1, "Judas Swing": 0.3, "Asian Range Breakout": 0.3, "NWOG/NDOG": 0.3, "Mitigation Block": 0.5, "Rejection Block": 0.8, "London Hunt + IFVG": 1.0, "NDOG/NWOG News Model": 1.5, "08:30 Liquidity Raid Model": 1.3 },
  EXPANSION:    { "MMXM Sell Model": 1.0, "MMXM Buy Model": 1.0, "Silver Bullet": 1.2, "OTE + Institutional OB": 1.0, "Turtle Soup": 0.3, "Breaker Block": 0.3, "Unicorn (OTE+FVG)": 1.0, "SCOB": 0.5, "2FVG Entry": 1.2, "Judas Swing": 0.3, "Asian Range Breakout": 0.3, "NWOG/NDOG": 0.3, "Mitigation Block": 0.3, "Rejection Block": 0.5, "London Hunt + IFVG": 0.3, "NDOG/NWOG News Model": 0.5, "08:30 Liquidity Raid Model": 0.5 },
  UNKNOWN:      { "MMXM Sell Model": 1.0, "MMXM Buy Model": 1.0, "Silver Bullet": 1.0, "OTE + Institutional OB": 1.0, "Turtle Soup": 1.0, "Breaker Block": 1.0, "Unicorn (OTE+FVG)": 1.0, "SCOB": 1.0, "2FVG Entry": 1.0, "Judas Swing": 1.0, "Asian Range Breakout": 1.0, "NWOG/NDOG": 1.0, "Mitigation Block": 1.0, "Rejection Block": 1.0, "London Hunt + IFVG": 1.0, "NDOG/NWOG News Model": 1.0, "08:30 Liquidity Raid Model": 1.0 },
};

// Load engine reports
const TFS = ["1W", "1D", "4H", "1H", "15m", "5m", "1m"];
const reports = {};
for (const tf of TFS) {
  const file = path.join(sharedDir, `engine_${tf.toLowerCase()}.json`);
  try { reports[tf] = JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { reports[tf] = null; }
}

const r1d = reports["1D"]; const r4h = reports["4H"]; const r1h = reports["1H"];
const r15m = reports["15m"]; const r5m = reports["5m"]; const r1m = reports["1m"];
const r1w = reports["1W"];
if (!r1d || !r4h || !r1h) { console.error("Missing engine reports"); process.exit(1); }

// Determine cycle phase — structure-based ONLY (Remediation WP-3 / audit Gap 1.2).
// The PO3/AMD cycle is a price-and-time delivery cycle, never a calendar
// artifact. resolveCyclePhase (lib/cycle_phase.cjs) reads engine structure
// (sweeps, BOS/CHoCH, displacement, FVGs) and is the SOLE source. If structure
// is ambiguous, the honest answer is UNKNOWN (which drops confidence) — never
// a fabricated phase.
const resolvedCycle = resolveCyclePhase({ "4H": reports["4H"], "1H": reports["1H"], "1D": reports["1D"] });
let effectivePhase = resolvedCycle.phase;
if (effectivePhase === "UNKNOWN") {
  console.log(`  Cycle: UNKNOWN (structure ambiguous — no calendar fallback; confidence reduced)`);
} else {
  console.log(`  Cycle: ${effectivePhase} (from ${resolvedCycle.source}, structure-based)`);
}
const cycleWeights = CYCLE_MODEL_WEIGHTS[effectivePhase] || CYCLE_MODEL_WEIGHTS["UNKNOWN"];

// Load 1m candles early (needed by Turtle Soup, inducement, and freshness checks)
let candles1m = null;
try { candles1m = JSON.parse(fs.readFileSync(path.join(sharedDir, "candles_1m.json"), "utf8")); } catch {}

// ═══════════════ LIVE STRUCTURE CHECK ═══════════════
console.log("\n═══ LIVE STRUCTURE CHECK ═══");
try {
  const { execSync } = require("child_process");
  for (const tf of ["4h", "1h"]) {
    const liveOutput = execSync(`node "${ROOT}/tools/tv-mcp/check_live_structure.cjs" --pair ${PAIR} --tf ${tf} --date ${DATE}`, {
      stdio: ["ignore", "pipe", "ignore"], encoding: "utf8", timeout: 25000
    });
    const live = JSON.parse(liveOutput);
    if (live.provisional && live.provisional.trigger) {
      console.log(`  ${tf}: ${live.provisional.trigger}`);
    } else {
      console.log(`  ${tf}: ${live.confirmed.bias} ${live.confirmed.event} — consistent with live chart`);
    }
  }
} catch (e) {
  console.log(`  Live check skipped — TV may not be connected`);
}

// ═══════════════ SL MONITOR ═══════════════
try {
  const slFile = path.join(ROOT, "stages", "07_journal_review", "output", `${PAIR.toLowerCase()}_sl.json`);
  if (fs.existsSync(slFile)) {
    const trades = JSON.parse(fs.readFileSync(slFile, "utf8"));
    const slOutput = execSync(`node "${ROOT}/tools/tv-mcp/check_sl.cjs" --pair ${PAIR} --trades '${JSON.stringify(trades)}'`, {
      stdio: ["ignore", "pipe", "ignore"], encoding: "utf8", timeout: 30000
    });
    const slResults = JSON.parse(slOutput);
    for (const r of slResults) {
      if (r.status === "STOPPED") {
        console.log(`  🛑 ${r.id} STOPPED at ${r.hitPrice} (SL: ${r.sl}) — ${r.afterHit?.verdict || ""}`);
      } else {
        console.log(`  ✅ ${r.id} ACTIVE — max adverse: ${r.maxAdverse} (SL: ${r.sl})`);
      }
    }
  }
} catch (e) {
  // SL monitor optional — skip if no trades file
}

// ═══════════════ FORECASTS ═══════════════
console.log("\n═══ FORECASTS ═══");
let forecastContext = { f5m: null, f1m: null };
try {
  const { execSync: fexec } = require("child_process");
  const f5mOutput = fexec(`python "${ROOT}/tools/forecast.py" --input "${sharedDir}/candles_5m.json" --pred-len 24 --samples 20 --output "${sharedDir}/forecast_5m.json"`, {
    stdio: ["ignore", "pipe", "ignore"], encoding: "utf8", timeout: 15000
  });
  forecastContext.f5m = JSON.parse(fs.readFileSync(`${sharedDir}\\forecast_5m.json`, "utf8"));
  console.log(`  5m: ${forecastContext.f5m.direction} | ${r5(forecastContext.f5m.current_price)} → ${r5(forecastContext.f5m.median_path[forecastContext.f5m.median_path.length-1])} (${toPips(forecastContext.f5m.median_path[forecastContext.f5m.median_path.length-1] - forecastContext.f5m.current_price)} ${pipLabel()})`);
} catch(e) { console.log(`  5m forecast unavailable`); }

try {
  const { execSync: fexec2 } = require("child_process");
  const f1mOutput = fexec2(`python "${ROOT}/tools/forecast.py" --input "${sharedDir}/candles_1m.json" --pred-len 48 --samples 20 --output "${sharedDir}/forecast_1m.json"`, {
    stdio: ["ignore", "pipe", "ignore"], encoding: "utf8", timeout: 15000
  });
  forecastContext.f1m = JSON.parse(fs.readFileSync(`${sharedDir}\\forecast_1m.json`, "utf8"));
  console.log(`  1m: ${forecastContext.f1m.direction} | ${r5(forecastContext.f1m.current_price)} → ${r5(forecastContext.f1m.median_path[forecastContext.f1m.median_path.length-1])} (${toPips(forecastContext.f1m.median_path[forecastContext.f1m.median_path.length-1] - forecastContext.f1m.current_price)} ${pipLabel()})`);
  const agree = forecastContext.f5m && forecastContext.f1m && forecastContext.f5m.direction === forecastContext.f1m.direction;
  if (forecastContext.f5m && forecastContext.f1m) {
    console.log(`  Agreement: ${agree ? '✅ ALIGNED' : '⚠️ DIVERGENT'} (5m=${forecastContext.f5m.direction}, 1m=${forecastContext.f1m.direction})`);
  }
} catch(e) { console.log(`  1m forecast unavailable`); }

// ═══════════════ STAGE 01 — HTF Bias ═══════════════
console.log("\n═══ STAGE 01 — HTF Bias ═══");

// ── Run Intraday Profile (ICT CBDR Framework) ──────────────
let intradayProfile = null;
try {
  const ipOutput = execSync(`node tools/intraday_profile.cjs ${PAIR}`, {
    cwd: ROOT, stdio: ["ignore", "pipe", "ignore"], encoding: "utf8", timeout: 15000
  });
  intradayProfile = JSON.parse(ipOutput);
  console.log(`  📊 Intraday: ${intradayProfile.profile} | Bias: ${intradayProfile.dailyBias} | CBDR: ${intradayProfile.cbdr?.range || '?'} | Checklist: ${intradayProfile.checklist}`);
} catch(e) { console.log(`  Intraday profile unavailable: ${e.message.slice(0,80)}`); }

// ── Run Tier 1 (SMT+Fib+ATR+BPR+Po3) ───────────────────────
let tier1Context = null;
try {
  const tier1Output = execSync(`node "${ROOT}/tools/tier1.cjs" ${PAIR}`, {
    stdio: ["ignore", "pipe", "ignore"], encoding: "utf8", timeout: 20000
  });
  tier1Context = JSON.parse(tier1Output);
  if (tier1Context.smt) console.log(`  SMT: ${tier1Context.smt.detected ? '✅ ' + tier1Context.smt.type : '✗ Not detected'} | Fib: ${tier1Context.fib4h?.inOTE ? '✅ OTE' : '✗'} | BPR: ${tier1Context.bpr.detected ? '✅' : '✗'} | ATR SL: ${tier1Context.atrSL.slPips} ${pairLabel === 'XAUUSD' ? 'pts' : 'pips'} | Po3: ${tier1Context.po3.state}`);
  if (tier1Context.fibConfluence) console.log(`  Fib Confluence: ${tier1Context.fibConfluence.clusters} cluster(s)`);
} catch(e) { console.log(`  Tier 1 unavailable: ${e.message.slice(0,80)}`); }

// ── Run Cross-System Guard (ALL GAPS CLOSED) ────────────────────
let guardContext = null;
try {
  const guardOutput = execSync(`node tools/cross_system_guard.cjs ${PAIR}`, {
    cwd: ROOT, stdio: ["ignore", "pipe", "ignore"], encoding: "utf8", timeout: 20000
  });
  guardContext = JSON.parse(guardOutput);
  console.log(`  🛡️ Guard: ${guardContext.verdict} | Blocked: ${guardContext.blocked} | Warnings: ${guardContext.warnings} | Size: ×${guardContext.sizeMultiplier}`);
  if (guardContext.blocked > 0) {
    console.log(`  ⚠️ BLOCKED by: ${guardContext.guards.filter(g => g.blocked).map(g => g.id).join(', ')}`);
  }
} catch(e) { console.log(`  Guard unavailable: ${e.message.slice(0,80)}`); }

// ── WP-4 Dominance-chain bias (declared BEFORE IPDA cascade block) ──
// Previously bias1d was declared after the IPDA block but used inside it,
// causing "Cannot access 'bias1d' before initialization" (TDZ ReferenceError).
const bias1w = r1w ? r1w.structure.bias : null;
const bias1d = r1d.structure.bias;
const bias4h = r4h.structure.bias;

// ── Run IPDA Lens (NEW) ──────────────────────────────────────
let ipdaContext = null;
try {
  const { execSync } = require("child_process");
  const ipdaOutput = execSync(`node "${ROOT}/tools/ipda.cjs" ${PAIR}`, {
    stdio: ["ignore", "pipe", "ignore"], encoding: "utf8", timeout: 15000
  });
  ipdaContext = JSON.parse(ipdaOutput);
  if (ipdaContext.draw) {
    console.log(`  IPDA: ${ipdaContext.draw.consensus} (${ipdaContext.draw.strength}) | Draw: ${ipdaContext.draw.direction}`);
    console.log(`  EQ Cascade: ${ipdaContext.equilibriumCascade.map(c => c.tf + '@' + c.eq).join(' → ')}`);
    console.log(`  AMD: ${ipdaContext.amd.position}`);
    // IPDA cascade confidence: aligned cascade = stronger signal
    const cascadeTFs = ipdaContext.equilibriumCascade || [];
    const premiumCount = cascadeTFs.filter(c => c.zone?.includes("PREMIUM")).length;
    const discountCount = cascadeTFs.filter(c => c.zone?.includes("DISCOUNT")).length;
    const cascadeAligned = (bias1d === "bearish" && premiumCount > discountCount) || (bias1d === "bullish" && discountCount > premiumCount);
    if (cascadeAligned) console.log(`  IPDA Cascade: ✅ Aligned with 1D ${bias1d} (${premiumCount}P/${discountCount}D) — +confidence`);
    if (ipdaContext.falseBreakout) {
      console.log(`  False Breakout: ⚠️ ${ipdaContext.falseBreakout.type} → ${ipdaContext.falseBreakout.direction}`);
    }
    if (ipdaContext.objective) {
      console.log(`  Objective: ${ipdaContext.objective.primary} | FVGs: ${ipdaContext.objective.unfilledFvgs} | Swept: ${ipdaContext.objective.sweptPools}`);
    }
    if (ipdaContext.killZone?.inKillZone) {
      console.log(`  Kill Zone: ${ipdaContext.killZone.active} (${ipdaContext.killZone.highConviction ? 'HIGH conviction' : 'active'})`);
    }
    if (ipdaContext.weeklyRefs) {
      console.log(`  Weekly Refs: 20D H ${r5(ipdaContext.weeklyRefs.twentyDay.high)} L ${r5(ipdaContext.weeklyRefs.twentyDay.low)}`);
    }
  }
} catch(e) { console.log(`  IPDA unavailable: ${e.message.slice(0,80)}`); }

// ═══ DOMINANCE-CHAIN BIAS — The Big Context Wins (WP-4) ═══
// ICT: Bias is a hierarchy of dominance (1W → 1D → 4H), NOT a democratic vote.
// A lower TF opposing the governing HTF is a pullback — an entry within the
// trend — never a swing in confidence. Confidence comes from confluence quality
// (killzone window + PD array proximity + liquidity draw), never vote margin.

const { resolveBias, confidenceFromConfluence, nearUnmitigatedPdArray, describeBias } = require("./lib/narrative.cjs");
const { nextDraw, drawTargets, drawReason } = require("./lib/draw.cjs");
const bias1h = r1h.structure.bias;

const narrative = resolveBias({ bias1W: bias1w, bias1D: bias1d, bias4H: bias4h, bias1H: bias1h });
const governingBias = narrative.direction;

// Soft-open guard vs 1D bias: if today is a soft open after a multi-day rally
// and the 1D bias has already flipped against the rally, that flip is suspect.
if (softOpenFact?.softOpen) {
  const rallyDir = softOpenFact.direction === "up" ? "bullish" : softOpenFact.direction === "down" ? "bearish" : null;
  if (rallyDir && bias1d && bias1d !== "neutral" && rallyDir !== bias1d) {
    console.log(`  ⚠️  Soft-open guard: ${softOpenFact.biasGuard} | 1D bias is ${bias1d.toUpperCase()} (flipped vs the ${softOpenFact.direction === "up" ? "rally" : "decline"}) — treat the flip with suspicion`);
  }
}
const inKillzone = ny.isInKillzoneNY();
const nearPdArray = nearUnmitigatedPdArray(r1d.price, {
  orderBlocks: [...(r1d.orderBlocks || []), ...(r4h.orderBlocks || []), ...(r1h.orderBlocks || [])],
  fvgs: [...(r1d.fvgs || []), ...(r4h.fvgs || []), ...(r1h.fvgs || [])],
});
const hasDraw = !!nextDraw({
  direction: governingBias,
  price: r1d.price,
  liquidityMap: [
    ...(r4h.liquidity || []),
    ...(r1h.liquidity || []),
    ...(oneTradeSetup?.prevAM?.high ? [{ type: "BSL", price: oneTradeSetup.prevAM.high }] : []),
    ...(oneTradeSetup?.prevAM?.low ? [{ type: "SSL", price: oneTradeSetup.prevAM.low }] : []),
  ],
}); // WP-7 draw-on-liquidity engine — an external draw in bias direction boosts confidence
const conf = confidenceFromConfluence({ inKillzone, nearPdArray, hasDraw });
const biasConfidence = conf.confidence;
const biasAgreement = conf.agreement;

console.log(`  🎯 Dominance Bias: ${governingBias.toUpperCase()} (${biasConfidence}% — ${biasAgreement}) | ${describeBias(narrative)}`);
console.log(`  📍 Current Price: ${r5(r1d.price)} | 1D Range: ${r5(r1d.structure.lastSwingLow || 0)}–${r5(r1d.structure.lastSwingHigh || 0)}`);
const aligned = bias1d === bias4h;

writeMd("01_htf_bias", "bias.md", `# HTF Bias — ${pairLabel} — ${DATE}

## Structural Bias
**${bias1d.toUpperCase()}** — 1W ${bias1w.toUpperCase()} → 1D ${bias1d.toUpperCase()} → 4H ${bias4h.toUpperCase()}

| Timeframe | Bias | Last Event | Price | Confidence | Pools | OBs | FVGs |
|-----------|------|------------|-------|------------|-------|-----|------|
${TFS.map(tf => {
  const r = reports[tf];
  if (!r) return `| ${tf} | — | — | — | — | — | — | — |`;
  return `| ${tf} | ${r.structure.bias} | ${r.structure.lastEvent || 'none'} | ${r5(r.structure.lastEventPrice || r.price)} | ${r2(r.structure.confidence)} | ${r.liquidity.length} | ${r.orderBlocks.length} | ${r.fvgs.length} |`;
}).join("\n")}

## Key Observations
- 1W: ${bias1w.toUpperCase()} | 1D: **${bias1d.toUpperCase()}** | 4H: **${bias4h.toUpperCase()}**
- 1D & 4H ${aligned ? 'aligned ✅ — strong directional conviction' : 'diverging ⚠️ — reduced confidence'}
- 1W 1D swing: H ${r5(r1d.structure.lastSwingHigh || 0)} / L ${r5(r1d.structure.lastSwingLow || 0)}
- Current price: ${r5(r1d.price)}

## Multi-TF Cascade
\`\`\`
1W  ${bias1w === 'bearish' ? '🔴' : bias1w === 'bullish' ? '🟢' : '⚪'} ${bias1w.toUpperCase()}
1D  ${bias1d === 'bearish' ? '🔴' : bias1d === 'bullish' ? '🟢' : '⚪'} ${bias1d.toUpperCase()} ← TRADE BIAS
4H  ${bias4h === 'bearish' ? '🔴' : bias4h === 'bullish' ? '🟢' : '⚪'} ${bias4h.toUpperCase()}
1H  ${bias1h === 'bearish' ? '🔴' : bias1h === 'bullish' ? '🟢' : '⚪'} ${bias1h.toUpperCase()} ← ENTRY TF
15m ${r15m && r15m.structure.bias === 'bearish' ? '🔴' : r15m && r15m.structure.bias === 'bullish' ? '🟢' : '⚪'} ${r15m ? r15m.structure.bias.toUpperCase() : 'N/A'}
5m  ${r5m && r5m.structure.bias === 'bearish' ? '🔴' : r5m && r5m.structure.bias === 'bullish' ? '🟢' : '⚪'} ${r5m ? r5m.structure.bias.toUpperCase() : 'N/A'}
1m  ${r1m && r1m.structure.bias === 'bearish' ? '🔴' : r1m && r1m.structure.bias === 'bullish' ? '🟢' : '⚪'} ${r1m ? r1m.structure.bias.toUpperCase() : 'N/A'}
\`\`\`

## Final Bias
**${bias1d.toUpperCase()}** — Confidence: **${r2((r1d.structure.confidence + r4h.structure.confidence) / 2)}**
`);

// ═══════════════ STAGE 02 — Key Levels ═══════════════
console.log("═══ STAGE 02 — Key Levels ═══");
const pools = r4h.liquidity.sort((a, b) => b.score - a.score);
const fvgs = [...(r1d.fvgs || []), ...(r4h.fvgs || []), ...(r1h.fvgs || [])];
// ── IFVG extraction (WP-14): engine detects inversion FVGs but pipeline
// never consumed them. Bias-aligned: bullish → IFVGs below price (pullback
// support), bearish → IFVGs above price (rally resistance).
const inversionFvgs = [...(r1d.inversionFvgs || []), ...(r4h.inversionFvgs || []), ...(r1h.inversionFvgs || [])];
const biasAlignedIFVGs = inversionFvgs.filter(iv => {
  if (governingBias === "bullish") return iv.top < r1d.price; // support below
  if (governingBias === "bearish") return iv.bottom > r1d.price; // resistance above
  return false;
}).map(iv => ({...iv, ce: (iv.top + iv.bottom) / 2})); // add CE midpoint
const ifvgInPlay = biasAlignedIFVGs.some(iv => r1d.price >= iv.bottom && r1d.price <= iv.top);
// ── end IFVG extraction ──────────────────────────────────────────────
// WP-11 (audit Gap 4.3): every OB gets an explicit grade — fresh (unmitigated),
// used (mitigated), or broken (consumed). Only displacement-backed fresh blocks
// count as tradeable arrays. Computed once, in the fact layer (lib/ob_grading.cjs).
const { gradeOrderBlocks, unmitigatedOf, mitigatedOf, consumedOf, arrayInPlayFor } = require("./lib/ob_grading.cjs");
const OB_TFS = ["1D", "4H", "1H"];
const gradedObs = [];
for (const tf of OB_TFS) {
  const tfObs = reports[tf]?.orderBlocks || [];
  if (tfObs.length === 0) continue;
  gradedObs.push(...gradeOrderBlocks(tfObs, loadCandles(sharedDir, tf.toLowerCase()) || null, { minImpulseAtr: 1.0 }));
}
const unmitigatedOBs = unmitigatedOf(gradedObs);
const mitigatedOBs = mitigatedOf(gradedObs);
const consumedOBs = consumedOf(gradedObs);
const obs = gradedObs;
const uniqueOBs = unmitigatedOBs.filter((o, i, arr) => arr.findIndex(x => r5(x.proximal) === r5(o.proximal)) === i);

writeMd("02_key_levels", "levels.md", `# Key Levels — ${pairLabel} — ${DATE}

## Bias Reminder — **${bias1d.toUpperCase()}**

## Liquidity Pools (${pools.length} on 4H)
| Type | Price | Role | Touches | Score | Distance | Swept |
|------|-------|------|---------|-------|----------|-------|
${pools.slice(0, 8).map(p => `| ${p.type} | ${r5(p.price)} | ${p.type === 'BSL' ? 'Resistance' : 'Support'} | ${p.strength} | ${r2(p.score)} | ${r2(p.distance)}% | ${p.swept ? '⚡' : 'Active'} |`).join("\n")}

## Order Blocks (${uniqueOBs.length} unmitigated across 1D/4H/1H)
${gradedObs.length > 0 ? `| Type | Proximal | Distal | Impulse | FVG | Grade |
|------|----------|--------|---------|-----|-------|
${gradedObs.map(ob => `| ${ob.type} ${ob.kind || 'OB'} | ${r5(ob.proximal)} | ${r5(ob.distal)} | ${r2(ob.impulseAtr || 0)}x | ${ob.hasFvg ? '✓' : '—'} | ${ob.consumed ? '❌ consumed' : ob.mitigated ? '⚠️ mitigated' : '✅ unmitigated'} |`).join("\n")}` : '| None detected | — | — | — | — | — |'}

## FVGs (${fvgs.length} across 1D/4H/1H)
${fvgs.length > 0 ? `| Type | Top | Bottom | Gap ATR | Disp ATR | Fill % |
|------|-----|--------|---------|----------|--------|
${fvgs.map(f => `| ${f.type} | ${r5(f.top)} | ${r5(f.bottom)} | ${r2(f.gapAtr || 0)}x | ${r2(f.displacementAtr || 0)}x | ${r2((f.fillFraction || 0) * 100)}% |`).join("\n")}` : '| None detected | — | — | — | — | — |'}

## Draw Targets
- **Primary**: ${r4h.draw ? `${r4h.draw.side.toUpperCase()} @ ${r5(r4h.draw.price)} — ${r4h.draw.reason} (${r2(r4h.draw.score)})` : 'None'}
- **Alternate**: ${r4h.alt ? `${r4h.alt.side.toUpperCase()} @ ${r5(r4h.alt.price)} — ${r4h.alt.reason} (${r2(r4h.alt.score)})` : 'None'}
`);

// ═══════════════ IRL/ERL — Internal & External Range Liquidity ═══════════════
console.log("\n═══ IRL/ERL — Range Liquidity Analysis ═══");
let irlErlResult = null;
try {
  const { analyzeIRLERL } = require("./irl_erl_engine.cjs");
  irlErlResult = analyzeIRLERL(PAIR);
  if (irlErlResult.dealingRange) {
    const dr = irlErlResult.dealingRange;
    const validIcon = dr.valid ? "✅" : "⚠️";
    console.log(`  Dealing Range (${dr.source}): ${validIcon} ${r5(dr.low)} — ${r5(dr.high)} | ${dr.validation.detail}`);
    console.log(`  Premium: ${r5(dr.premium.high)} — ${r5(dr.premium.low)} | Discount: ${r5(dr.discount.high)} — ${r5(dr.discount.low)}`);
  }
  console.log(`  IRL: ${irlErlResult.irl.count} objects (${irlErlResult.irl.fvgCount} FVGs, ${irlErlResult.irl.equalHighCount} EQ-H, ${irlErlResult.irl.equalLowCount} EQ-L) — ${irlErlResult.irl.unfilled} unfilled, ${irlErlResult.irl.filled} filled`);
  console.log(`  ERL: ${irlErlResult.erl.detail}`);
  console.log(`  Cycle: ${irlErlResult.cycle.position} | ${irlErlResult.cycle.phase}`);
  console.log(`  IRL/ERL Bias: ${irlErlResult.bias.bias.toUpperCase()} (confidence: ${r2(irlErlResult.bias.confidence)})`);
  if (irlErlResult.entryGuidance[0]) {
    console.log(`  Guidance: ${irlErlResult.entryGuidance[0].action} → ${irlErlResult.entryGuidance[0].detail}`);
  }
} catch(e) {
  console.log(`  IRL/ERL analysis unavailable: ${e.message.slice(0, 80)}`);
}

// ═══════════════ LIQUIDITY MARKER — 8-Step Pre-Session Workflow ═══════════════
console.log("\n═══ LIQUIDITY MARKER — PDH/PDL/PWH/PWL ═══");
let liquidityMarker = null;
try {
  const { analyzeLiquidity } = require("./liquidity_marker.cjs");
  liquidityMarker = analyzeLiquidity(PAIR);
  console.log(`  HTF Bias: ${liquidityMarker.htfBias.detail}`);
  if (liquidityMarker.pdhPdl) {
    console.log(`  PDH: ${r5(liquidityMarker.pdhPdl.pdh)} | PDL: ${r5(liquidityMarker.pdhPdl.pdl)} | Range: ${toPips(liquidityMarker.pdhPdl.range)} ${pipLabel()}`);
  }
  if (liquidityMarker.pwhPwl) {
    console.log(`  PWH: ${r5(liquidityMarker.pwhPwl.pwh)} | PWL: ${r5(liquidityMarker.pwhPwl.pwl)}`);
  }
  console.log(`  Primary Draw: ${liquidityMarker.drawTargets.detail}`);
  console.log(`  Sweep: ${liquidityMarker.sweepStatus.detail}`);
  console.log(`  HRLR/LRLR: ${liquidityMarker.hrlrLrlr?.detail || 'N/A'}`);
  // Dominant liquidity: which side has more resting orders (institutional magnet)
  if (liquidityMarker.erl) {
    const buyPower = (liquidityMarker.erl.buySide?.length || 0) + (liquidityMarker.erl.buySideClusters || 0) * 2;
    const sellPower = (liquidityMarker.erl.sellSide?.length || 0) + (liquidityMarker.erl.sellSideClusters || 0) * 2;
    const dominant = buyPower > sellPower * 1.2 ? '🧲 BUY-SIDE (above)' : sellPower > buyPower * 1.2 ? '🧲 SELL-SIDE (below)' : 'BALANCED';
    console.log(`  Dominant Liquidity: ${dominant} | BSL: ${liquidityMarker.erl.buySide?.length || 0} pools | SSL: ${liquidityMarker.erl.sellSide?.length || 0} pools`);
  }
  if (liquidityMarker.sweepVsRun) {
    const svIcon = liquidityMarker.sweepVsRun.classification === "SWEEP" ? "🔄" :
                    liquidityMarker.sweepVsRun.classification === "RUN" ? "🏃" :
                    liquidityMarker.sweepVsRun.classification === "INDUCEMENT" ? "⚠️" : "❓";
    console.log(`  Sweep/Run: ${svIcon} ${liquidityMarker.sweepVsRun.classification} — ${liquidityMarker.sweepVsRun.action}`);
  }
  console.log(`  Entry: ${liquidityMarker.entryGuidance.detail}`);
  if (liquidityMarker.relEquals?.magnetCount > 0) {
    console.log(`  Smooth Magnets: ${liquidityMarker.relEquals.magnetCount} (${liquidityMarker.relEquals.magnets.map(m => `${m.type === 'equalHighs' ? 'EQH' : 'EQL'} ${r5(m.price)}`).join(', ')}) — bumped w/o acceptance = unfinished business`);
  }
} catch(e) {
  console.log(`  Liquidity marker unavailable: ${e.message.slice(0, 80)}`);
}

// ═══════════════ STAGE 03 — Session ═══════════════
// ═══ ORDER FLOW ZONES ═══
// ═══ OPENING RANGES — 5-Window 30-Min Framework ═══
console.log("\n═══ OPENING RANGES — 5-Window Framework ═══");
try {
  const { analyzeOpeningRanges } = require("./opening_range.cjs");
  const or = analyzeOpeningRanges(PAIR);
  console.log(`  ${or.detail}`);
  for (const r of or.ranges) {
    if (!r.range) continue;
    const icon = r.isActive ? '⚡' : r.tradeable ? '✅' : r.hasPassed ? '  ' : '⏳';
    console.log(`  ${icon} ${r.name.padEnd(30)} ${r.time} | ${r.tradeable ? 'TRADEABLE' : r.pfvg?.valid ? 'PFVG valid' : 'Range marked'}`);
  }
} catch(e) { console.log(`  Opening Ranges unavailable: ${e.message.slice(0, 80)}`); }

console.log("\n═══ ORDER FLOW — Pullback Zones ═══");
try {
  const { analyzeOrderFlow } = require("./order_flow.cjs");
  const of = analyzeOrderFlow(PAIR);
  if (of.bosLeg) console.log(`  ${of.bosLeg.detail}`);
  console.log(`  OF Zones: ${of.zoneCount} marked`);
  for (const z of of.zones.slice(0, 3)) console.log(`    ${z.detail}`);
  if (of.zones.length > 3) console.log(`    ... +${of.zones.length - 3} more`);
  console.log(`  Retracement: ${of.retracement.detail}`);
  if (of.confirmation.confirmed) console.log(`  ✅ ${of.confirmation.detail}`);
} catch(e) { console.log(`  Order Flow unavailable: ${e.message.slice(0, 80)}`); }

console.log("\n═══ STAGE 03 — Session ═══");
// Session classification in NEW YORK LOCAL TIME (ICT mandate) — DST-aware via ny_time.cjs
const NY_SESSION_MAP = {
  asia:      { label: "Asia",      char: "Accumulation / low liquidity", kz: false },
  asiaLate:  { label: "Asia",      char: "Overnight low-liquidity drift", kz: false },
  london:    { label: "London",    char: "Institutional flow, manipulation", kz: true },
  londonPM:  { label: "London PM", char: "Dead zone (London close / NY pre-open) — NOT a killzone", kz: false },
  nyAM:      { label: "NY AM",     char: "High volume, displacement", kz: true },
  nyLunch:   { label: "NY Lunch",  char: "Low liquidity, avoid entries", kz: false },
  nyPM:      { label: "NY PM",     char: "Afternoon continuation / reversal", kz: true },
  nyClose:   { label: "NY Close",  char: "Position squaring, no new entries", kz: false },
  offHours:  { label: "Off",       char: "Low liquidity", kz: false },
};
const _sInfo = NY_SESSION_MAP[NY_SESSION.name] || { label: NY_SESSION.name, char: NY_SESSION.character, kz: false };
let session = _sInfo.label;
let char = _sInfo.char;
const inKZ = _sInfo.kz;
// WP-2: the dead zone (05-08 NY) is NOT a killzone (ICT London-close / NY-pre-open).
if (NY_SESSION.name === "londonPM") {
  console.log(`  ℹ️  London PM dead zone (05-08 NY) — not a killzone (WP-2)`);
}
const gate = (bias1d !== "neutral" && inKZ) ? "ACTIVE" : inKZ ? "MONITOR" : "NO TRADE";

writeMd("03_session_time", "session.md", `# Session Analysis — ${pairLabel} — ${DATE} ${String(NY_HOUR).padStart(2,'0')}:00 NY (${ny.getNYOffset() > -5 ? 'EDT' : 'EST'})

## Current Session
- **Session**: ${session} | Killzone: ${inKZ ? '✅ ACTIVE' : 'Inactive'}
- **Character**: ${char}
- **Gate**: **${gate}**

## Silver Bullet
| Window | NY Time | Status |
|--------|---------|--------|
| London SB | 03-04 | ${NY_HOUR >= 3 && NY_HOUR < 4 ? '✅' : '—'} |
| NY AM SB | 10-11 | ${NY_HOUR >= 10 && NY_HOUR < 11 ? '✅' : '—'} |
| NY PM SB | 14-15 | ${NY_HOUR >= 14 && NY_HOUR < 15 ? '✅' : '—'} |

## Alignment
- Bias: **${bias1d}** | Session: ${session}
- ${bias1d !== 'neutral' && inKZ ? '✅ ALIGNED — Active killzone with directional bias' : '⚠️ NOT ALIGNED'}
`);

// ═══════════════ LECTURE 2 — 07:00 AM Setup ═══════════════
console.log("\n═══ LECTURE 2 — 07:00 AM Setup ═══");
let lecture2 = null;
try {
  const { runLecture2Setup } = require("./tv-mcp/lecture2_setup.cjs");
  lecture2 = runLecture2Setup(PAIR, DATE, ROOT);
  // London range (context)
  if (lecture2.londonRange) {
    console.log(`  London Range: H ${lecture2.londonRange.high.toFixed(IC.priceDecimals)} / L ${lecture2.londonRange.low.toFixed(IC.priceDecimals)} (${lecture2.londonRange.source})`);
  } else {
    console.log(`  London Range: No 1H data`);
  }
  // Relative equal levels
  const relHighs = lecture2.relEqualHighs || [];
  const relLows = lecture2.relEqualLows || [];
  if (relHighs.length > 0) console.log(`  Rel Equal Highs: ${relHighs.map(l => l.price.toFixed(IC.priceDecimals)).join(', ')}`);
  if (relLows.length > 0) console.log(`  Rel Equal Lows: ${relLows.map(l => l.price.toFixed(IC.priceDecimals)).join(', ')}`);
  // Hunt
  if (lecture2.hunt) {
    const hIcon = lecture2.hunt.active ? '⚡' : '⏳';
    console.log(`  Hunt: ${hIcon} ${lecture2.hunt.active ? lecture2.hunt.direction + (lecture2.hunt.reversed ? ' — REVERSED' : ' — awaiting reversal') : lecture2.hunt.detail}`);
  }
  // MSS
  if (lecture2.mss) {
    const mssIcon = lecture2.mss.confirmed ? '✅' : '⏳';
    console.log(`  MSS: ${mssIcon} ${lecture2.mss.detail || ''}`);
  }
  // IFVG
  if (lecture2.ifvg) {
    const iIcon = lecture2.ifvg.found ? '✅' : '⏳';
    console.log(`  IFVG: ${iIcon} ${lecture2.ifvg.detail}`);
  }
  // Breaker
  if (lecture2.breaker) {
    const bIcon = lecture2.breaker.found ? '✅' : '—';
    console.log(`  Breaker: ${bIcon} ${lecture2.breaker.detail || 'Not found'}`);
  }
  // SL
  if (lecture2.postHuntSL) {
    console.log(`  SL (post-hunt): ${lecture2.postHuntSL.price.toFixed(IC.priceDecimals)} — ${lecture2.postHuntSL.source}`);
  }
  // 30-min reversal
  if (lecture2.reversalCheck?.active) {
    console.log(`  ⚠️ ${lecture2.reversalCheck.warning}`);
  }
  // Fib targets
  if (lecture2.fibTargets) {
    console.log(`  Fib TP: ${lecture2.fibTargets.detail}`);
  }
  // Summary
  const readyIcon = lecture2.setupReady ? '✅ READY' : '⏳ NOT READY';
  console.log(`  Setup: ${readyIcon}${lecture2.direction ? ' — ' + lecture2.direction : ''}`);
  console.log(`  ${lecture2.detail}`);
} catch(e) {
  console.log(`  Lecture 2 setup unavailable: ${e.message.slice(0, 80)}`);
}

// ═══════════════ LECTURE 1 — 08:30 Liquidity Raid + PD Array Model ═══════════════
console.log("\n═══ LECTURE 1 — 08:30 Liquidity Raid Model ═══");
let lecture1 = null;
try {
  const { runLecture1Setup } = require("./tv-mcp/lecture1_setup.cjs");
  lecture1 = runLecture1Setup(PAIR, DATE, ROOT);
  // 15m context
  if (lecture1.ctx15m) {
    console.log(`  15m Context: Bias ${lecture1.ctx15m.bias.toUpperCase()} | ${lecture1.ctx15m.drawTargets?.length || 0} draw targets`);
  }
  // Formation
  if (lecture1.formation) {
    const fIcon = lecture1.formation.formed ? '✅' : '⏳';
    console.log(`  Formation (08:00-08:30): ${fIcon} ${lecture1.formation.detail}`);
  }
  // Raid
  if (lecture1.raid) {
    const rIcon = lecture1.raid.active ? '⚡' : '⏳';
    console.log(`  Raid (post-08:30): ${rIcon} ${lecture1.raid.detail}`);
  }
  // MSS
  if (lecture1.mss) {
    const mIcon = lecture1.mss.confirmed ? '✅' : '⏳';
    console.log(`  MSS: ${mIcon} ${lecture1.mss.detail}`);
  }
  // PD Arrays
  if (lecture1.pdArrays?.length > 0) {
    console.log(`  PD Arrays: ${lecture1.pdArrays.length} found — First-tagged: ${lecture1.firstTagged?.type} @ ${lecture1.firstTagged?.price?.toFixed(IC.priceDecimals)}`);
  } else {
    console.log(`  PD Arrays: None discovered yet`);
  }
  // SL
  if (lecture1.post0830SL) {
    console.log(`  SL (post-08:30 range): ${lecture1.post0830SL.price.toFixed(IC.priceDecimals)} — ${lecture1.post0830SL.source}`);
  }
  // TP
  if (lecture1.tpTargets) {
    console.log(`  TP: ${lecture1.tpTargets.detail}`);
  }
  // Summary
  const readyIcon = lecture1.setupReady ? '✅ READY' : '⏳ NOT READY';
  console.log(`  Setup: ${readyIcon}${lecture1.direction ? ' — ' + lecture1.direction : ''}`);
  console.log(`  ${lecture1.detail}`);
} catch(e) {
  console.log(`  Lecture 1 setup unavailable: ${e.message.slice(0, 80)}`);
}

// ═══════════════ LECTURE 4 — 08:30 News + NDOG/NWOG Gap Model ═══════════════
console.log("\n═══ LECTURE 4 — 08:30 News + Gap Model ═══");
let lecture4 = null;
try {
  const { runLecture4Setup } = require("./tv-mcp/lecture4_setup.cjs");
  lecture4 = runLecture4Setup(PAIR, DATE, ROOT);
  // Gaps
  if (lecture4.gapClusters?.hasGaps) {
    console.log(`  Gaps: ${lecture4.gapClusters.detail}`);
    if (lecture4.gapDraw?.nearestGap) {
      const ng = lecture4.gapDraw.nearestGap;
      console.log(`  Nearest Gap: ${ng.type} ${ng.detail} | Quarters: ${ng.quarters.q025.toFixed(IC.priceDecimals)} / ${ng.quarters.q50.toFixed(IC.priceDecimals)} / ${ng.quarters.q075.toFixed(IC.priceDecimals)}`);
    }
  } else if (lecture4.substituteGap) {
    console.log(`  Gap Substitute: ${lecture4.substituteGap.detail}`);
  } else {
    console.log(`  Gaps: No NDOG/NWOG or FVG substitute available`);
  }
  // Time window
  const wIcon = lecture4.inNewsWindow ? '✅' : '⏳';
  const aIcon = lecture4.inAPlusWindow ? '⭐ A-PLUS' : '';
  console.log(`  Window: ${wIcon} 08:30-10:00 NY ${aIcon}`);
  // Gap draw
  if (lecture4.gapDraw) {
    const dIcon = lecture4.gapDraw.drawing ? '⚡' : '⏳';
    console.log(`  Draw: ${dIcon} ${lecture4.gapDraw.detail}`);
  }
  // MSS
  if (lecture4.mss) {
    const mIcon = lecture4.mss.confirmed ? '✅' : '⏳';
    console.log(`  MSS: ${mIcon} ${lecture4.mss.detail}`);
  }
  // Entry
  if (lecture4.entry) {
    const eIcon = lecture4.entry.found ? '✅' : '⏳';
    console.log(`  Entry: ${eIcon} ${lecture4.entry.detail}`);
  }
  // Quarter tap
  if (lecture4.quarterTap?.detected) {
    console.log(`  ⚠️ ${lecture4.quarterTap.detail}`);
  }
  // SL
  if (lecture4.postMSS_SL) {
    console.log(`  SL (post-MSS): ${lecture4.postMSS_SL.price.toFixed(IC.priceDecimals)} — ${lecture4.postMSS_SL.source}`);
  }
  // TP
  if (lecture4.tpTargets) {
    console.log(`  TP: ${lecture4.tpTargets.detail}`);
  }
  // Summary
  const rIcon = lecture4.setupReady ? '✅ READY' : '⏳ NOT READY';
  console.log(`  Setup: ${rIcon}${lecture4.direction ? ' — ' + lecture4.direction : ''}`);
  console.log(`  ${lecture4.detail}`);
} catch(e) {
  console.log(`  Lecture 4 setup unavailable: ${e.message.slice(0, 80)}`);
}

// ═══════════════ INDUCEMENT CHECK — structure TF (WP-9) ═══════════════
// ICT: "Do not enter until inducement is swept." The inducement library now
// validates BOS/CHOCH, first pullback, sweep, reversal, AND MSS all on the
// SAME timeframe as the structure break (15m by default). The 1m is never used
// to confirm a 15m-sized fact (audit Bug 6.6 / WP-9).
// This is informational pre-scoring context. The registry evaluator's
// sweep/reversal/mss gates consume these structure-TF facts per-model, instead
// of a single hard gate zeroing every model.
let inducement15m = null;
try {
  const { runInducementCheck } = require("./inducement_engine.cjs");
  inducement15m = runInducementCheck(PAIR, { structureTF: "15m", confirmTF: "15m" });
  console.log(`  Inducement (${inducement15m.structureTF} structure / ${inducement15m.confirmTF} confirm): ${inducement15m.gate?.open ? '✅ GATE OPEN — swept + reversed + MSS confirmed' : '⏳ informational — swept status feeds per-model registry gates (WP-9)'}`);
} catch(e) { /* inducement engine may not be available */ }

// ═══════════════ STAGE 04 — Model Selection ═══════════════
console.log("\n═══ STAGE 04 — Model Selection ═══");
const hasOB = uniqueOBs.length > 0, hasFVG = fvgs.length > 0;
const hasSweep = pools.some(p => p.swept);
const nearSSL = pools.filter(p => p.type === 'SSL')[0];
const nearBSL = pools.filter(p => p.type === 'BSL')[0];

// ── PRIORITY 1: SMT Divergence Fully Wired ─────────────────────────
let smtDetected = false;
let smtDetails = "";
try {
  // Load correlated pair engine data for SMT
  const corrPair = PAIR === "EURUSD" ? "GBPUSD" : PAIR === "GBPUSD" ? "EURUSD" : PAIR === "GOLD" ? "XAUUSD" : PAIR === "NAS100" ? "DXY" : "EURUSD";
  const corrDir = corrPair === "XAUUSD" ? "GOLD" : corrPair;
  // Check if any TF has SMT from the engine's smt module
  for (const tf of ["1D","4H","1H"]) {
    const r = reports[tf];
    if (r && r.smt && r.smt.detected) {
      smtDetected = true;
      smtDetails = `SMT detected on ${tf} — ${r.smt.type || 'divergence'} vs ${corrPair}`;
      break;
    }
    // Also check if the report has smt divergences array
    if (r && r.smt && Array.isArray(r.smt) && r.smt.length > 0) {
      smtDetected = true;
      smtDetails = `SMT: ${r.smt.length} divergence(s) on ${tf}`;
      break;
    }
  }
  // Fallback: check if any swept pools indicate manipulation (indirect SMT signal)
  if (!smtDetected) {
    const swept1H = (reports["1H"]?.liquidity || []).filter(p => p.swept).length;
    const swept4H = (reports["4H"]?.liquidity || []).filter(p => p.swept).length;
    if (swept1H >= 2 || swept4H >= 2) {
      smtDetected = true;
      smtDetails = `Indirect SMT: ${swept1H + swept4H} sweeps across 1H/4H suggest manipulation`;
    }
  }
} catch(e) {}

// ── PRIORITY 1: Po3 Phase Filter — block models outside their phase ─
const PO3_MODEL_PHASE_MAP = {
  "MMXM Sell Model": ["DISTRIBUTION", "EXPANSION", "MANIPULATION"],
  "MMXM Buy Model": ["DISTRIBUTION", "EXPANSION", "MANIPULATION"],
  "Silver Bullet": ["MANIPULATION", "DISTRIBUTION", "EXPANSION"],
  "OTE + Institutional OB": ["DISTRIBUTION", "EXPANSION"],
  "Turtle Soup": ["MANIPULATION"],
  "Unicorn (OTE+FVG)": ["DISTRIBUTION", "EXPANSION"],
  "Breaker Block": ["MANIPULATION", "DISTRIBUTION"],
  "SCOB": ["DISTRIBUTION", "EXPANSION"],
  "2FVG Entry": ["EXPANSION", "DISTRIBUTION"],
  "Judas Swing": ["MANIPULATION"],
  "Asian Range Breakout": ["ACCUMULATION", "MANIPULATION"],
  "NWOG/NDOG": ["ACCUMULATION"],
  "Mitigation Block": ["ACCUMULATION", "MANIPULATION"],
  "Rejection Block": ["MANIPULATION", "DISTRIBUTION"],
  "London Hunt + IFVG": ["MANIPULATION", "DISTRIBUTION"],
  "NDOG/NWOG News Model": ["MANIPULATION", "DISTRIBUTION"],
  "08:30 Liquidity Raid Model": ["MANIPULATION", "DISTRIBUTION"],
};
const currentPhase = effectivePhase;
function isPhaseValid(modelName) {
  const validPhases = PO3_MODEL_PHASE_MAP[modelName];
  if (!validPhases) return true; // Models not in map pass through
  return validPhases.includes(currentPhase);
}

// ── PRIORITY 2: CISD in engine (enhanced) ──────────────────────────
let cisdDetected = false;
try {
  const r5mEng = reports["5m"];
  if (r5mEng && r5mEng.candles && r5mEng.candles.length >= 3) {
    const c = r5mEng.candles;
    const last = c[c.length - 1], prev = c[c.length - 2];
    const lastBody = Math.abs(last.close - last.open);
    const prevBody = Math.abs(prev.close - prev.open);
    if (lastBody > prevBody * 1.2 && lastBody > 0) {
      const bullEngulf = last.close > last.open && last.close > prev.high && last.open < prev.low;
      const bearEngulf = last.close < last.open && last.close < prev.low && last.open > prev.high;
      cisdDetected = bullEngulf || bearEngulf;
    }
  }
} catch(e) {}

// ── Quick OTE check for Stage 04 scoring ─────────────────────────
let inOTEZoneSimple = false;
try {
  const swHi4h = r4h.structure.lastSwingHigh || 0;
  const swLo4h = r4h.structure.lastSwingLow || 0;
  if (swHi4h > 0 && swLo4h > 0 && swHi4h !== swLo4h) {
    const range = swHi4h - swLo4h;
    const retracePct = (swHi4h - r4h.price) / range;
    inOTEZoneSimple = retracePct >= 0.62 && retracePct <= 0.79;
  }
} catch(e) {}

// ═══════════════ PERFORMANCE LEDGER — AUDIT ONLY (WP-10) ═══════════════
// WP-10 (audit Gap 3.3): past performance is for LEARNING, not for VOTING.
// The ledger still runs and its report is written for the operator/dashboard,
// but its model weights are NEVER fed back into live scoring. Today's setup is
// validated by today's price/time facts, not by what happened on other days.
let perfAudit = null;
try {
  const perfOutput = execSync(`node "${ROOT}/tools/performance_ledger.cjs"`, {
    stdio: ["ignore", "pipe", "ignore"], encoding: "utf8", timeout: 10000
  });
  const perfData = JSON.parse(perfOutput);
  perfAudit = perfData;
  console.log(`  📊 Audit only: ${perfData.totalTrades || 0} trades | Edge: ${perfData.edgeScore || 0}/100 | Top model: ${perfData.topModel || 'N/A'} (not used as a weight — WP-10)`);
} catch(e) { console.log(`  Performance ledger unavailable — audit report skipped`); }

// ═══ TURTLE SOUP DETECTION ═══
// ICT: Failed breakout — price spikes through level, sweeps stops, fails to hold, reverses.
// Requires: HTF ranging + clean sweep (wick through, body close back) + LTF MSS + displacement FVG/OB
function detectTurtleSoup() {
  if (!r1h || !r5m || !candles1m || candles1m.length < 5) return { detected: false, score: 0, detail: "Insufficient data" };

  // 1. HTF ranging check: 1D/4H not strongly trending (CHoCH or neutral = ranging)
  const htfRanging = (r1d.structure?.lastEvent === "CHoCH" || r1d.structure?.bias === "neutral") &&
                     (r4h.structure?.lastEvent === "CHoCH" || r4h.structure?.bias === "neutral");
  const htfConsolidating = Math.abs((r4h.structure?.lastSwingHigh || 0) - (r4h.structure?.lastSwingLow || 0)) / r4h.price < 0.02;

  // 2. Find recent sweep: pool was swept (wick through) and price closed back inside
  const sweptPools = (r1h.liquidity || []).concat(r5m?.liquidity || []).filter(p => p.swept);
  let turtleSoupSweep = null;
  for (const pool of sweptPools) {
    const isBSLSwept = pool.type === "BSL" && r1h.price < pool.price;
    const isSSLSwept = pool.type === "SSL" && r1h.price > pool.price;
    if (isBSLSwept || isSSLSwept) {
      turtleSoupSweep = { pool, direction: isBSLSwept ? "BEARISH" : "BULLISH", sweptPrice: pool.price };
      break;
    }
  }

  // 3. Check LTF MSS in direction opposite the sweep
  let mssConfirmed = false;
  if (turtleSoupSweep) {
    const fakeHunt = {
      active: true, reversed: true,
      direction: turtleSoupSweep.direction === "BEARISH" ? "BEARISH (highs swept → reversal down)" : "BULLISH (lows swept → reversal up)",
      swept: turtleSoupSweep.direction === "BEARISH" ? "BSL" : "SSL",
      sweepPrice: turtleSoupSweep.sweptPrice,
      sweepTime: new Date().toISOString(),
    };
    const L2 = require("./tv-mcp/lecture2_setup.cjs");
    const mssCheck = L2.confirmMSS(candles1m, fakeHunt);
    mssConfirmed = mssCheck?.confirmed || false;
  }

  // 4. Find displacement FVG/OB for entry zone
  const hasDisplacementFVG = fvgs.some(f => (f.fillFraction || 0) < 0.3 &&
    (turtleSoupSweep?.direction === "BEARISH" ? f.type === "bearish" : f.type === "bullish"));

  const hasDisplacementOB = obs.some(o => o.kind !== "Breaker" &&
    (turtleSoupSweep?.direction === "BEARISH" ? o.type === "bearish" : o.type === "bullish"));

  // Score
  const htfRangingScore = (htfRanging || htfConsolidating) ? 2 : 0;
  const sweepScore = turtleSoupSweep ? 3 : 0;
  const mssScore = mssConfirmed ? 2 : 0;
  const displacementScore = (hasDisplacementFVG || hasDisplacementOB) ? 2 : 0;
  const totalScore = htfRangingScore + sweepScore + mssScore + displacementScore;
  const detected = turtleSoupSweep && mssConfirmed && (hasDisplacementFVG || hasDisplacementOB);

  return {
    detected,
    score: totalScore,
    max: 9,
    htfRanging: htfRanging || htfConsolidating,
    sweep: turtleSoupSweep,
    mssConfirmed,
    hasDisplacementFVG, hasDisplacementOB,
    detail: detected
      ? `🐢 TURTLE SOUP: ${turtleSoupSweep.direction} — ${turtleSoupSweep.pool.type} swept @ ${r5(turtleSoupSweep.sweptPrice)}, MSS confirmed. Entry: ${hasDisplacementFVG ? 'FVG' : 'OB'} retracement.`
      : turtleSoupSweep
        ? `Turtle Soup forming: sweep detected, ${mssConfirmed ? 'MSS confirmed' : 'awaiting MSS'}, ${hasDisplacementFVG || hasDisplacementOB ? 'displacement zone found' : 'awaiting displacement'}`
        : "No Turtle Soup: no failed-breakout sweep detected",
  };
}
const turtleSoupCheck = detectTurtleSoup();
if (turtleSoupCheck.detected) console.log(`  🐢 ${turtleSoupCheck.detail}`);

const models = [
  { name: "MMXM Sell Model", score: (bias1d === 'bearish' ? 3 : 0) + (hasOB ? 2 : 0) + (hasSweep ? 2 : 0) + (smtDetected ? 1 : 0) + (cisdDetected ? 1 : 0), max: 9 },
  { name: "MMXM Buy Model", score: (bias1d === 'bullish' ? 3 : 0) + (hasOB ? 2 : 0) + (hasSweep ? 2 : 0) + (smtDetected ? 1 : 0) + (cisdDetected ? 1 : 0), max: 9 },
  { name: "Silver Bullet", score: ((NY_HOUR >= 3 && NY_HOUR < 4) || (NY_HOUR >= 10 && NY_HOUR < 11) || (NY_HOUR >= 14 && NY_HOUR < 15) ? 3 : 0) + (bias1d !== 'neutral' && inKZ ? 2 : 0) + (hasFVG ? 2 : 0) + (smtDetected ? 1 : 0) + (cisdDetected ? 1 : 0), max: 9 },
  { name: "OTE + Institutional OB", score: (hasOB ? 3 : 0) + (inOTEZoneSimple ? 2 : 0) + (bias1d !== 'neutral' ? 2 : 0) + (smtDetected ? 1 : 0), max: 8 },
  { name: "Turtle Soup", score: turtleSoupCheck.score, max: turtleSoupCheck.max },
  { name: "Unicorn (OTE+FVG)", score: (hasOB ? 2 : 0) + (hasFVG ? 3 : 0) + (inOTEZoneSimple ? 2 : 0) + (smtDetected ? 1 : 0), max: 8 },
  { name: "Breaker Block", score: (obs.filter(o => o.kind === 'Breaker').length * 3) + (hasFVG ? 1 : 0) + (smtDetected ? 1 : 0), max: 7 },
  // ── Tier 2: Strong (phase-specific) ──
  { name: "SCOB", score: (hasOB && hasFVG ? 3 : 0) + (r1d.volumeDisplacement && r1d.volumeDisplacement.atrRatio > 1.0 ? 2 : 0) + (bias1d !== 'neutral' ? 1 : 0) + (smtDetected ? 1 : 0), max: 7 },
  { name: "2FVG Entry", score: (fvgs.length >= 2 ? 3 : 0) + (bias1d !== 'neutral' ? 2 : 0) + (hasSweep ? 1 : 0), max: 6 },
  { name: "Judas Swing", score: ((NY_HOUR >= 2 && NY_HOUR < 3) || (NY_HOUR >= 8 && NY_HOUR < 9) ? 3 : 0) + (hasSweep ? 2 : 0) + (bias1d !== 'neutral' ? 2 : 0) + (smtDetected ? 1 : 0), max: 8 },
  { name: "Asian Range Breakout", score: ((NY_HOUR >= 20 || NY_HOUR < 2) ? 3 : 0) + (hasSweep ? 2 : 0) + (hasOB ? 1 : 0), max: 6 },
  { name: "NWOG/NDOG", score: (r1w ? 2 : 0) + (bias1d !== 'neutral' ? 1 : 0) + (hasOB ? 1 : 0), max: 4 },
  // ── Tier 3: Situational ──
  { name: "Mitigation Block", score: (mitigatedOBs.length * 3) + (bias1d !== 'neutral' ? 1 : 0), max: 4 },
  { name: "Rejection Block", score: (hasOB ? 2 : 0) + (r1h && r1h.volumeDisplacement && r1h.volumeDisplacement.atrRatio > 0.8 ? 1 : 0) + (bias1d !== 'neutral' ? 1 : 0), max: 4 },
  { name: "London Hunt + IFVG", score: (lecture2?.setupReady ? 4 : 0) + (lecture2?.hunt?.active ? 2 : 0) + (lecture2?.direction && ((lecture2.direction === 'BUY' && bias1d === 'bullish') || (lecture2.direction === 'SELL' && bias1d === 'bearish')) ? 2 : 0) + (smtDetected ? 1 : 0) + (cisdDetected ? 1 : 0), max: 10 },
  { name: "NDOG/NWOG News Model", score: (lecture4?.setupReady ? 4 : 0) + (lecture4?.gapClusters?.hasGaps || lecture4?.substituteGap ? 2 : 0) + (lecture4?.gapDraw?.drawing ? 2 : 0) + (lecture4?.mss?.confirmed ? 1 : 0) + (lecture4?.inNewsWindow ? 1 : 0), max: 10 },
  { name: "08:30 Liquidity Raid Model", score: (lecture1?.setupReady ? 4 : 0) + (lecture1?.formation?.formed ? 2 : 0) + (lecture1?.raid?.active ? 2 : 0) + (lecture1?.mss?.confirmed ? 1 : 0) + (lecture1?.pdArrays?.length >= 2 ? 1 : 0), max: 10 },
];
// Apply cycle-aware weighting from Stage 00. Performance is audit-only (WP-10):
// the ledger's historical model weights are never fed into today's score.
models.forEach(m => {
  const cycleWeight = cycleWeights[m.name] || 1.0;
  m.structuralScore = m.score; // preserve original
  m.cycleMultiplier = cycleWeight;
  // WP-2: Session windows are GATES (pass/fail), never multipliers.
  // Time eligibility is enforced by the registry — no numeric weight.
  m.sessionMultiplier = 1.0;
  m.score = Math.round(m.score * cycleWeight * 10) / 10;
  m.max = Math.round(m.max * Math.max(cycleWeight, 1.0) * 10) / 10;

  // PRIORITY 1: Po3 Phase Filter — zero out models outside their phase
  if (!isPhaseValid(m.name)) {
    m.po3Blocked = true;
    m.po3BlockReason = `${m.name} requires ${(PO3_MODEL_PHASE_MAP[m.name]||[]).join('/')} phase, but we are in ${currentPhase}`;
    m.score = Math.round(m.score * 0.3 * 10) / 10; // Reduce score by 70% instead of zeroing (ICT allows exceptions with strong confluence)
  } else {
    m.po3Blocked = false;
  }

  // PRIORITY 2: Weekly Profile direction boost
  // Models aligned with the weekly anchor get boosted; opposing get reduced
  // Skip-weeks (IX/X) suppress all models to ×0.3
  // ═══ DIRECTION FROM PRICE, NOT NAME ═══
  // ICT: The chart tells you the direction. Not the model name.
  // All models trade in the direction of the governing bias — the single authority.
  const modelDirection = governingBias === "bullish" ? "BUY" : governingBias === "bearish" ? "SELL" : null;

  // PRIORITY 2: Weekly Profile direction boost
  if (weeklyAnchor) {
    if (weeklyAnchor.skipWeek) {
      m.score = Math.round(m.score * 0.3 * 10) / 10;
      m.weeklyProfileSkipped = true;
    } else if (modelDirection === weeklyAnchor.direction) {
      m.score = Math.round(m.score * weeklyAnchor.boostMultiplier * 10) / 10;
      m.weeklyProfileBoost = true;
    } else if (modelDirection && modelDirection !== weeklyAnchor.direction) {
      m.score = Math.round(m.score * weeklyAnchor.counterWeight * 10) / 10;
      m.weeklyProfileReduced = true;
    }
  }

  // PRIORITY 3: One Trade Setup direction boost
  if (oneTradeSetup?.firstOpp?.locked && modelDirection) {
    const lockedDir = oneTradeSetup.firstOpp.lockedDirection;
    if (modelDirection === lockedDir) {
      m.score = Math.round(m.score * oneTradeSetup.firstOpp.directionBoost * 10) / 10;
      m.oneTradeBoost = true;
    } else if (modelDirection !== lockedDir) {
      m.score = Math.round(m.score * oneTradeSetup.firstOpp.counterDirectionWeight * 10) / 10;
      m.oneTradeReduced = true;
    }
  }

  // PRIORITY 4: High Precision Secrets — 7-9AM tethering + time authority
  // ICT Gems 9:30AM Liquidity Target / High Precision Secrets scoring:
  //   tethered to a 7-9 range level → strong boost (×1.3 for 3+, ×1.1 for 1+)
  //   forms at/after 9:01 → time-authority boost (framework is only active post-lock)
  //   untethered arrays → heavy penalty (×0.9)
  if (precisionFacts.active) {
    const tetherCount = precisionFacts.tetheredCount;
    const tetherMult = tetherCount >= 3 ? 1.3 : tetherCount >= 1 ? 1.1 : 0.9;
    m.hpTetherMultiplier = tetherMult;
    m.hpTetherDetail = `${tetherCount} tethered array(s) → ×${r2(tetherMult)}${tetherCount === 0 ? ' (untethered penalty)' : ' (7-9AM tether)'}`;
    m.score = Math.round(m.score * tetherMult * 10) / 10;
  }

  // PRIORITY 4b: Body Defense — global confidence penalty when wick CE violated
  // ICT: "I don't want to see any bodies buried south of its consequent
  // encroachment level." Violated body defense → deeper retracement expected.
  if (defensiveWickCE?.bodyViolated) {
    const penalty = Math.round(m.score * 0.15); // 15% confidence reduction
    m.score -= penalty;
    m.bodyDefensePenalty = penalty;
    m.bodyDefenseDetail = defensiveWickCE.violationDetail || "bodies past CE";
  }
});

models.sort((a, b) => b.score - a.score);

// ═══ SILVER BULLET WINDOW OVERRIDE ═══
// During active SB windows (London 03:00-04:00, NY AM 10:00-11:00, NY PM 14:00-15:00),
// the Silver Bullet model gets priority. This is THE scalp model for these windows.
const inSBWindow = (NY_HOUR >= 3 && NY_HOUR < 4) || (NY_HOUR >= 10 && NY_HOUR < 11) || (NY_HOUR >= 14 && NY_HOUR < 15);
if (inSBWindow) {
  const sbModel = models.find(m => m.name === "Silver Bullet");
  if (sbModel && sbModel.score >= 5) {
    // Boost Silver Bullet to primary during its window — this is a scalp, not a swing trade
    sbModel.score = Math.max(sbModel.score, models[0].score + 0.5);
    sbModel.sbWindowBoost = true;
    models.sort((a, b) => b.score - a.score);
    console.log(`  ⚡ Silver Bullet Window ACTIVE — boosted to primary (was ${sbModel.structuralScore}/${sbModel.max.toFixed(0)}, now ${r2(sbModel.score)})`);
  }
}

// ═══ LECTURE + WEEKLY ANCHOR ALIGNMENT BOOST ═══
// When a lecture setup is READY AND the weekly anchor agrees on direction,
// jump that lecture model to primary. This resolves conflicts where the weekly
// anchor boosts a buy-labeled model but bias makes it execute short.
if (weeklyAnchor && !weeklyAnchor.skipWeek) {
  const lectureModels = [
    { name: "London Hunt + IFVG", ready: lecture2?.setupReady, dir: lecture2?.direction },
    { name: "08:30 Liquidity Raid Model", ready: lecture1?.setupReady, dir: lecture1?.direction },
    { name: "NDOG/NWOG News Model", ready: lecture4?.setupReady, dir: lecture4?.direction },
  ];
  for (const lm of lectureModels) {
    if (lm.ready && lm.dir === weeklyAnchor.direction) {
      const model = models.find(m => m.name === lm.name);
      if (model && model.score < models[0].score) {
        model.score = models[0].score + 0.5;
        model.lectureWeeklyAligned = true;
        models.sort((a, b) => b.score - a.score);
        console.log(`  ⚡ Lecture+Weekly Aligned: ${lm.name} (${lm.dir}) boosted to primary — weekly anchor agrees`);
      }
    }
  }
}

// ── Model Conflict & Mutual Exclusivity Detection ──────────────────────
const MUTUAL_EXCLUSIVITY = {
  // [modelA, modelB]: reason they can't coexist
  "Turtle Soup,Breaker Block": "Turtle Soup enters ON the sweep reversal; Breaker Block enters AFTER the OB flips. Different phases of the same manipulation event.",
  "Turtle Soup,OTE + Institutional OB": "Turtle Soup is a manipulation entry; OTE+OB is a distribution entry. Cannot be in both phases simultaneously.",
  "Turtle Soup,Unicorn (OTE+FVG)": "Turtle Soup fades the sweep; Unicorn enters on the return to POI. Mutually exclusive timing.",
  "Silver Bullet,Asian Range Breakout": "Silver Bullet requires London/NY killzone; Asian Range requires Asian session. Session-exclusive.",
  "Silver Bullet,NWOG/NDOG": "Silver Bullet is intraday; NWOG/NDOG are weekly/daily opening gaps. Different time horizons.",
  "Breaker Block,Unicorn (OTE+FVG)": "Breaker Block trades the OB flip; Unicorn trades the unmitigated OB. The OB can't be both flipped and unflipped.",
  "2022 Model (MMXM),Turtle Soup": "MMXM requires HTF trend alignment; Turtle Soup fades any sweep regardless of trend. Can conflict on direction.",
  "2FVG Entry,Asian Range Breakout": "2FVG needs active expansion; Asian Range trades accumulation. Opposite cycle phases.",
  "Mitigation Block,Breaker Block": "Mitigation Block means the OB was TAGGED but not broken; Breaker Block means the OB was BROKEN and flipped. The same OB cannot be both.",
  "Judas Swing,Asian Range Breakout": "Judas Swing requires London/NY session open; Asian Range requires Asian session. Session-exclusive.",
  "SCOB,Unicorn (OTE+FVG)": "SCOB requires clean OB+FVG with displacement; Unicorn requires OTE retracement to the FVG. Different entry mechanics on the same structure.",
  "NWOG/NDOG,Silver Bullet": "NWOG/NDOG are weekly opening gap plays; Silver Bullet is intraday time-based. Different time horizons.",
  "Rejection Block,Breaker Block": "Rejection Block means the OB HELD (wick rejected); Breaker Block means the OB BROKE. They are opposite outcomes at the same level.",
  "London Hunt + IFVG,Judas Swing": "Both are session-open hunt setups. London Hunt + IFVG is the 07:00 AM macro; Judas Swing is the session-open first-hour sweep. Mutually exclusive timing.",
  "London Hunt + IFVG,Turtle Soup": "London Hunt enters on the IFVG after reversal; Turtle Soup fades the sweep. Different entry mechanics on the same manipulation event.",
  "London Hunt + IFVG,Silver Bullet": "London Hunt fires at 07:00-07:40 NY; Silver Bullet fires at 10:00-11:00 NY. Different time windows — mutually exclusive by session.",
  "London Hunt + IFVG,Asian Range Breakout": "London Hunt requires NY pre-open; Asian Range requires Asian session. Session-exclusive.",
  "NDOG/NWOG News Model,Asian Range Breakout": "News Model requires 08:30-10:00 NY; Asian Range requires Asian session. Session-exclusive.",
  "NDOG/NWOG News Model,Silver Bullet": "News Model fires 08:30-10:00 NY; Silver Bullet fires 10:00-11:00 NY. Sequential — can both be valid but not simultaneously.",
  "NDOG/NWOG News Model,London Hunt + IFVG": "News Model fires 08:30-10:00; London Hunt fires 07:00-07:40. Sequential by time — not conflicting.",
  "NDOG/NWOG News Model,Judas Swing": "News Model uses gap draw catalyst; Judas Swing uses session-open sweep. Different catalysts, overlapping time.",
  "08:30 Liquidity Raid Model,Asian Range Breakout": "Raid Model requires 08:00-10:00 NY; Asian Range requires Asian session. Session-exclusive.",
  "08:30 Liquidity Raid Model,London Hunt + IFVG": "Raid Model fires 08:30+; London Hunt fires 07:00-07:40. Sequential by time — not conflicting.",
  "08:30 Liquidity Raid Model,NDOG/NWOG News Model": "Both fire at 08:30 but target different draws (rel equal levels vs gap clusters). Complementary — can coexist.",
  "08:30 Liquidity Raid Model,Silver Bullet": "Raid Model fires 08:30-10:00; Silver Bullet fires 10:00-11:00. Sequential — can both be valid.",
  "08:30 Liquidity Raid Model,Turtle Soup": "Raid Model enters on PD array retrace after MSS; Turtle Soup fades the sweep. Different entry timing on same event.",
};

function detectConflicts(models) {
  const conflicts = [];
  const topModels = models.filter(m => m.score >= 3).slice(0, 4); // Top 4 viable models

  for (let i = 0; i < topModels.length; i++) {
    for (let j = i + 1; j < topModels.length; j++) {
      const a = topModels[i].name;
      const b = topModels[j].name;
      const key1 = `${a},${b}`;
      const key2 = `${b},${a}`;
      const reason = MUTUAL_EXCLUSIVITY[key1] || MUTUAL_EXCLUSIVITY[key2];
      if (reason) {
        conflicts.push({ modelA: a, modelB: b, reason, winner: topModels[i].score >= topModels[j].score + 1 ? a : topModels[j].score >= topModels[i].score + 1 ? b : null });
      }
    }
  }
  return conflicts;
}

// Also check phase-appropriateness conflicts
function detectPhaseConflicts(models, cyclePhase) {
  const phaseConflicts = [];
  const phaseModelMap = {
    ACCUMULATION: ["MMXM Sell Model", "MMXM Buy Model", "2FVG Entry", "Silver Bullet", "Unicorn (OTE+FVG)", "SCOB"],
    MANIPULATION: ["Unicorn (OTE+FVG)", "2FVG Entry", "NWOG/NDOG", "Mitigation Block"],
    DISTRIBUTION: ["Asian Range Breakout", "NWOG/NDOG", "Turtle Soup", "Judas Swing"],
    EXPANSION: ["Asian Range Breakout", "NWOG/NDOG", "Turtle Soup", "Breaker Block", "Judas Swing", "Rejection Block"],
  };
  const inappropriate = phaseModelMap[cyclePhase] || [];
  for (const model of models) {
    if (inappropriate.includes(model.name) && model.score >= 4) {
      phaseConflicts.push({ model: model.name, phase: cyclePhase, issue: `${model.name} is not designed for ${cyclePhase} phase. High structural score (${model.score}) may be misleading.` });
    }
  }
  return phaseConflicts;
}

const conflicts = detectConflicts(models);
const phaseConflicts = detectPhaseConflicts(models, effectivePhase);
// ═══ WP-8 FLIP — the registry is the DECISION; legacy ranking is shadow ═══
const legacyPrimary = models[0];   // legacy ranked pick (read-only shadow reporter)
let primary = null;                 // registry decision primary (null = NO TRADE)

// ═══ WP-8 — Model registry evaluator (THE DECISION PATH) ═══
// Eligibility + sequence booleans, no rank. A model is either COMPLETE or it
// is nothing. Exactly one complete model → SETUP COMPLETE (primary = its
// registry entry). Zero or several → NO TRADE. The legacy ranked scoring above
// now runs as a READ-ONLY shadow reporter — disagreements are logged, never
// consumed (plan D2, flipped).
let registryDecision = null;
try {
  const { runRegistry } = require("./models/registry.cjs");
  const sweptPools = (pools || []).filter(p => p.swept);
  // WP-9: sweep / reversal / MSS facts come from the structure-TF inducement
  // check (15m) first; pool-based 1m composites are the fallback.
  const inducementSwept = !!inducement15m?.sweepStatus?.swept;
  const inducementReversed = !!inducement15m?.sweepStatus?.reversed;
  const inducementMss = !!inducement15m?.sweepStatus?.mssConfirmed;
  // WP-12 facts (audit 5.1/5.4/5.5/5.7/5.8): objective facts computed ONCE.
  const { killzoneFor } = require("./lib/killzone.cjs");
  const { detectRejection } = require("./lib/rejection.cjs");
  const { previousSessionHL } = require("./lib/session_levels.cjs");
  const { LIQUIDITY_RAID_CONFIRMATION } = require("./lib/raid_config.cjs");
  const { findRelativeEqualLevels } = require("./lib/liquidity.cjs");
  const kzFact = killzoneFor(NY_HOUR);
  const rejectionFact = detectRejection(candles1m, { direction: governingBias === "bullish" ? "bullish" : "bearish" });
  const prevHLFact = previousSessionHL(loadCandles(sharedDir, "1d"));
  const poolTarget = nextDraw({ direction: governingBias, liquidityMap: pools, price: r1d.price });
  // WP-12 Gap 4.4: equal highs/lows as facts on the structure TF (1h) — a stop
  // cluster is a stop cluster whether the right shoulder is higher or lower.
  const eqCandles = loadCandles(sharedDir, "1h") || [];
  const eqFact = findRelativeEqualLevels(eqCandles, calcATR(eqCandles, 14));
  // ── Wick CE / Body Defense (WP-14): defensive wicks from 1m ──────
  let defensiveWickCE = null;
  try {
    const { findDefensiveWicks, checkBodyDefense } = require("./lib/wick_ce.cjs");
    const wickCandles = candles1m || [];
    const defWicks = findDefensiveWicks(wickCandles, governingBias, 20);
    if (defWicks.length > 0) {
      const dw = defWicks[0];
      const bodyCheck = checkBodyDefense(wickCandles, dw.wickCE, dw.direction, dw.originalIndex);
      defensiveWickCE = {
        ce: dw.wickCE,
        direction: dw.direction,
        bodyViolated: !bodyCheck.defended,
        violationDetail: bodyCheck.violationCandle?.detail || null,
        violationCount: bodyCheck.violationCount,
        detail: dw.detail,
      };
    }
  } catch (e) { /* wick CE unavailable */ }
  // ── end wick CE ──────────────────────────────────────────────────
  // ── NY Lunch Reversal: load prior day's carried inefficiency ──────
  let prevLunchFact = null;
  try {
    const prevTradingDay = (() => {
      const d = new Date(DATE + "T12:00:00-04:00");
      d.setDate(d.getDate() - 1);
      while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
      return d.toISOString().split("T")[0];
    })();
    const lunchPath = path.join(ROOT, "shared", prevTradingDay, pairDir, "prev_lunch_inefficiency.json");
    if (!fs.existsSync(lunchPath)) {
      const todayLunchPath = path.join(ROOT, "shared", DATE, pairDir, "prev_lunch_inefficiency.json");
      if (fs.existsSync(todayLunchPath)) {
        prevLunchFact = JSON.parse(fs.readFileSync(todayLunchPath, "utf8"));
      }
    } else {
      prevLunchFact = JSON.parse(fs.readFileSync(lunchPath, "utf8"));
    }
  } catch (e) { /* lunch carry data unavailable — model won't fire */ }
  const prevLunchCtx = prevLunchFact?.found ? {
    sweepType: prevLunchFact.sweep?.type || null,
    sweepPrice: parseFloat(prevLunchFact.sweep?.price) || null,
    inefficiencyKind: prevLunchFact.inefficiency?.kind || null,
    top: parseFloat(prevLunchFact.inefficiency?.top) || 0,
    bottom: parseFloat(prevLunchFact.inefficiency?.bottom) || 0,
    midpoint: parseFloat(prevLunchFact.inefficiency?.midpoint) || 0,
    anchor: parseFloat(prevLunchFact.inefficiency?.anchor) || 0,
    hasVIB: prevLunchFact.inefficiency?.hasVolumeImbalance || false,
    expectedReaction: prevLunchFact.inefficiency?.expectedReaction || null,
    sourceDate: prevLunchFact.prevDate || prevLunchFact.prevSessionDate || null,
    eventHorizons: (prevLunchFact.eventHorizons || []).map(eh => ({
      horizon: parseFloat(eh.horizon),
      distancePct: parseFloat(eh.distancePct),
    })),
  } : null;
  // ── end lunch reversal context ────────────────────────────────────
  const registryCtx = {
    hour: NY_HOUR,
    price: r1d.price,   // WP-13: current price for zone check (lunch inefficiency entry)
    bias: governingBias,
    lastSweepType: sweptPools.length ? sweptPools[sweptPools.length - 1].type : null,
    hasSweep: inducementSwept || hasSweep,
    hasReversal: inducementReversed || sweptPools.some(p => (p.type === 'BSL' && r1h.price < p.price) || (p.type === 'SSL' && r1h.price > p.price)),
    mss: inducementMss || !!(turtleSoupCheck?.mssConfirmed || lecture2?.mss?.confirmed || lecture1?.mss?.confirmed || lecture4?.mss?.confirmed),
    hasOB,
    uniqueOBs,
    mitigatedOBs,
    consumedOBs,
    hasFVG,
    fvgs,
    // WP-12: event-time quality (5.4) — when did the sweep/MSS happen?
    killzone: kzFact.inKillzone,
    killzoneName: kzFact.name,
    // WP-12: rejection as leading signal (5.8 / Gap 4.2)
    rejection: rejectionFact.detected,
    rejectionCandle: rejectionFact.candle?.time || null,
    // WP-12: draw-on-liquidity, nearest first (5.1)
    poolTarget,
    // WP-12: raid confirmation basis (5.7) — the decision constant
    raid: hasSweep,
    raidBasis: LIQUIDITY_RAID_CONFIRMATION,
    raidCandle: sweptPools.length ? `${sweptPools[sweptPools.length - 1].type} raid` : null,
    // WP-12: previous-session H/L draws (5.5)
    prevSessionHigh: prevHLFact?.high ?? null,
    prevSessionLow: prevHLFact?.low ?? null,
    // WP-12: equal highs/lows — the facts layer knows the engineered liquidity
    // clusters (Gap 4.4), not just the lecture-window ones.
    equalHighs: eqFact.highs,
    equalLows: eqFact.lows,
    // WP-11: "array in play" means price is at a FRESH (unmitigated) array.
    // Consumed blocks are never counted — a broken spring can't be re-entered.
    arrayInPlay: arrayInPlayFor(r1d.price, unmitigatedOBs)
      || fvgs.some(f => { const ff = f.fillFraction || 0; return ff >= 0.2 && ff <= 0.8; }),
    // Defensive step-level guard: if the ONLY array near price is consumed, the
    // array_mitigated step must fail (consumed blocks never satisfy it).
    consumedAtPrice: consumedOBs.some(ob => {
      const top = ob.top ?? ob.distal, bottom = ob.bottom ?? ob.proximal;
      return r1d.price >= bottom && r1d.price <= top;
    }),
    oteZone: inOTEZoneSimple,
    cisd: cisdDetected,
    smt: smtDetected,
    htfRanging: !!turtleSoupCheck?.htfRanging,
    displacement: !!(turtleSoupCheck?.hasDisplacementFVG || turtleSoupCheck?.hasDisplacementOB),
    hasDraw,
    // High Precision Secrets — 7-9AM tethering gate (post-9:01 framework).
    // The registry consumes this as a boolean FACT: models in the NY-AM window
    // that carry the `tethered_array` step are gated by it (not by a rank).
    precision: {
      active: precisionFacts.active,
      tetheredCount: precisionFacts.tetheredCount,
      tetheredDailyCount: precisionFacts.tetheredDailyCount || 0,
    },
    // Soft-open bias guard — a one-day soft open after a multi-day move is
    // digestion, not a reversal. Available to gate premature daily-bias flips.
    softOpen: softOpenFact || { available: false, softOpen: false },
    // Smoothness grading — equal highs/lows left smooth with energy and bumped
    // without acceptance are unfinished-business magnets (ICT Gems).
    smoothMagnetCount: liquidityMarker?.relEquals?.magnetCount || 0,
    magnetLevels: (liquidityMarker?.relEquals?.magnets || []).map(m => ({
      price: m.price,
      type: m.type === "equalHighs" ? "equalHighs" : "equalLows",
      grade: m.smoothness?.grade || null,
    })),
    lecture2,
    lecture1,
    lecture4,
    prevLunch: prevLunchCtx,        // WP-13: prior day lunch inefficiency carry-forward
    inversionFvgs: biasAlignedIFVGs,   // WP-14: bias-aligned inversion FVGs
    ifvgInPlay,                        // WP-14: price inside an IFVG zone
    defensiveWickCE,                   // WP-14: body defense against wick CE
  };
  registryDecision = runRegistry(registryCtx);
  // WP-8 FLIP: the registry verdict is the decision. A single complete setup
  // → its entry is primary. Zero or several complete → NO TRADE (ties are
  // never multiplied; a model is COMPLETE or it is nothing).
  primary = registryDecision.verdict === "SETUP COMPLETE" && registryDecision.primary
    ? registryDecision.primary
    : null;
  const legacyPrimaryName = legacyPrimary.name;
  const agree = !!(registryDecision.primary && registryDecision.primary.name === legacyPrimaryName);
  console.log(`\n═══ WP-8 — Registry Evaluator (DECISION PATH) ═══`);
  console.log(`  Verdict: ${registryDecision.verdict} | Complete setups: ${registryDecision.count}`);
  console.log(`  Registry primary: ${registryDecision.primary ? `${registryDecision.primary.name} (tier ${registryDecision.primary.tier})` : 'NONE'}`);
  console.log(`  Legacy shadow:    ${legacyPrimaryName}${agree ? ' — ✅ AGREE' : ' — ⚠️ DISAGREE (legacy is read-only now)'}`);
  if (registryDecision.count > 1) console.log(`  ⚠️  ${registryDecision.count} complete setups — tie rule: NO TRADE unless exactly one complete`);
  if (registryDecision.primary) {
    const t = registryDecision.primary.gateTrace;
    console.log(`  Primary gates: window=${t.window.pass ? '✅' : '❌'} direction=${t.direction.pass ? '✅' : '❌'} purge=${t.purge.pass ? '✅' : '❌'} seq=${t.sequence.map(s => `${s.name}${s.pass ? '✓' : '✗'}`).join(' ')}`);
  }
} catch(e) {
  console.log(`  ⚠️  WP-8 registry decision unavailable: ${e.message.slice(0, 80)}`);
  primary = null; // fail-closed: registry is the gate, so no registry → no trade
}

writeMd("04_model_selection", "active_models.md", `# Model Selection — ${pairLabel} — ${DATE}

## Market Context
- Bias: **${bias1d.toUpperCase()}** (1D/4H)
- Session: ${session} (${gate})
- **Cycle Phase**: ${effectivePhase} | **MMXM Step**: ${macroContext ? macroContext.mxmStep + '/4' : 'N/A'}
- Levels: ${uniqueOBs.length} OBs | ${fvgs.length} FVGs | ${pools.length} pools
- Sweeps: ${hasSweep ? 'Yes — liquidity sweep detected' : 'None'}

## WP-8 Decision — Model Registry (eligibility + sequence, no rank)

${registryDecision ? `
### Verdict: **${registryDecision.verdict}** — ${registryDecision.count} complete setup(s)
- **Primary model**: ${primary ? `**${primary.name}** (tier ${primary.tier})` : 'NONE — NO TRADE'}
- **Rules**: exactly one complete sequence → SETUP COMPLETE; zero or several → NO TRADE (ties by tier, never multiplication).

| Model | Window | Direction | Purge | Sequence gates | Verdict |
|-------|--------|-----------|-------|----------------|---------|
${registryDecision.results.map(r => {
  const el = r.gateTrace;
  const elig = [el.window.pass, el.direction.pass, el.purge.pass];
  return `| ${r.name} | ${el.window.pass ? '✅' : '❌'} | ${el.direction.pass ? '✅' : '❌'} | ${el.purge.pass ? '✅' : '❌'} | ${el.sequence.map(s => `${s.name}:${s.pass ? '✓' : '✗'}`).join(', ')} | ${r.complete ? '✅ COMPLETE' : '—'} |`;
}).join('\n')}
` : `⚠️ Registry decision unavailable — ${'NO TRADE'} (fail-closed).`}

## Legacy Shadow Scores (read-only — NOT the decision)
${models.map(m => `| ${m.name} | ${m.structuralScore}/${m.max.toFixed(0)} | ×${r2(m.cycleMultiplier)} | ${m.po3Blocked ? '⚠️ BLOCKED' : '✅'} | **${r2(m.score)}** | ${m === legacyPrimary ? '★ legacy primary' : m.score >= 3 ? 'Alternative' : 'Rejected'} |`).join("\n")}

${models.filter(m => m.po3Blocked).map(m => `⚠️ **${m.name}**: ${m.po3BlockReason}`).join('\n\n')}

## High Precision Secrets — 7-9AM Tethering
${precisionFacts.active
  ? `**Framework ACTIVE** (post-9:01 lock) — ${precisionFacts.tetheredCount} tethered PD array(s)${precisionFacts.tetheredDailyCount ? ` (${precisionFacts.tetheredDailyCount} to daily/weekly levels)` : ''}, tether boost ×${r2(precisionFacts.tetherBoost)} applied to legacy shadow scores. Registry gate: NY-AM models require a tethered array.`
  : 'Framework **inactive** (pre-9:01 or no 7-9AM range) — tethering not applied.'}
${models.filter(m => m.hpTetherMultiplier).map(m => `- **${m.name}**: ${m.hpTetherDetail}`).join('\n')}

## Soft-Open Bias Guard
${softOpenFact?.available
  ? (softOpenFact.softOpen
      ? `⚠️ **Soft open day** — ${softOpenFact.biasGuard}. 1D bias flips are suspect.`
      : `No soft open — ${softOpenFact.detail}`)
  : 'Insufficient daily data to evaluate.'}

## Smooth Magnets (unfinished business)
${liquidityMarker?.relEquals?.magnetCount > 0
  ? (liquidityMarker.relEquals.magnets.map(m => `- **${m.type === 'equalHighs' ? 'EQH' : 'EQL'} @ ${r5(m.price)}** — ${m.smoothness?.detail}`).join('\n'))
  : 'No smooth-magnet levels (bumped equal highs/lows left unfinished).'}

## Primary: ${primary ? primary.name : 'NO TRADE — no single complete model'}
${smtDetected ? `**SMT**: ✅ ${smtDetails}` : '**SMT**: ⚠️ Not detected — check correlated pairs manually'}

## Conflict Check (legacy shadow, read-only)
${conflicts.length === 0 && phaseConflicts.length === 0 ? '✅ **NO CONFLICTS** — All top models are compatible.' : ''}
${conflicts.map(c => `⚠️ **MUTUAL EXCLUSIVITY**: **${c.modelA}** vs **${c.modelB}** — ${c.reason} ${c.winner ? '→ **' + c.winner + '** takes priority (higher score).' : '→ Scores too close to resolve automatically. MANUAL REVIEW needed.'}`).join('\n\n')}
${phaseConflicts.map(c => `⚠️ **PHASE CONFLICT**: **${c.model}** scored ${models.find(m => m.name === c.model)?.score || '?'} but is not designed for ${c.phase} phase. ${c.issue}`).join('\n\n')}

## Confluence
| Factor | Status | Weight |
|--------|--------|--------|
| HTF Bias | ${bias1d !== 'neutral' ? '✓' : '✗'} | 3 |
| Key Levels | ${(hasOB || hasFVG) ? '✓' : '✗'} | 2 |
| Session | ${inKZ ? '✓' : '✗'} | 1 |
| Sweep | ${hasSweep ? '✓' : '✗'} | 2 |
| **Registry verdict** | **${registryDecision ? registryDecision.verdict : 'NO TRADE (fail-closed)'}** | |
`);

// ═══════════════ STAGE 05b — Micro Confirmation ═══════════════
console.log("═══ STAGE 05b — Micro Confirmation ═══");
let microContext = null;
try {
  const { execSync } = require("child_process");
  const microOutput = execSync(`node "${ROOT}/tools/micro_context.cjs" ${PAIR}`, {
    stdio: ["ignore", "pipe", "ignore"], encoding: "utf8", timeout: 15000
  });
  console.log(microOutput.trim().split("\n").filter(l => l.includes(":") && !l.includes("=")).join("\n"));

  // Read coherence score
  const cohFile = path.join(ROOT, "stages", "05b_micro_confirmation", "output", `${PAIR.toLowerCase()}_coherence.md`);
  if (fs.existsSync(cohFile)) {
    const cohMd = fs.readFileSync(cohFile, "utf8");
    const scoreMatch = cohMd.match(/\*\*(\d+)\/10\*\*/);
    microContext = {
      score: scoreMatch ? parseInt(scoreMatch[1]) : 0,
      ready: scoreMatch ? parseInt(scoreMatch[1]) >= 7 : false,
    };
    console.log(`  Coherence: ${microContext.score}/10 — ${microContext.ready ? '✅ GO' : '⏳ WAIT'}`);
  }

  // ── Run Fractal MMXM (Gap Fix #9) ──────────────────────────────
  try {
    const fractalOutput = execSync(`node "${ROOT}/tools/fractal_mmxm.cjs" ${PAIR}`, {
      stdio: ["ignore", "pipe", "ignore"], encoding: "utf8", timeout: 15000
    });
    const fractalData = JSON.parse(fractalOutput);
    console.log(`  Fractal MMXM: ${fractalData.fractalScore}/${fractalData.fractalMax} — ${fractalData.fractalLabel}`);
    console.log(`  1m Inversion: ${fractalData.inversionDetected ? '✅ DETECTED' : '⏳ NOT YET'} (${fractalData.inversionScore}/${fractalData.inversionMax})`);
    console.log(`  6 Confirmations: ${fractalData.confirmationsPassed}/6 | CISD: ${fractalData.cisdDetected ? '✅' : '✗'} | SMT: ${fractalData.smtDetected ? '✅' : '✗'}`);
    console.log(`  Nesting: ${fractalData.nestingScore}/${fractalData.nestingMax} | Steps: ${Object.values(fractalData.mmxmSteps).join('→')}`);

  // ── Run Priority 2 (CISD + BPR + Po3 + ISD) ─────────────────
  try {
    const p2Output = execSync(`node "${ROOT}/tools/priority2.cjs" ${PAIR}`, {
      stdio: ["ignore", "pipe", "ignore"], encoding: "utf8", timeout: 15000
    });
    const p2 = JSON.parse(p2Output);
    console.log(`  CISD: ${p2.cisd.grade} | BPR: ${p2.bpr.detected4h || p2.bpr.detected1h ? '✅' : '✗'} | ISD: ${p2.isd.score}/${p2.isd.maxScore} ${p2.isd.ready ? '✅' : '⏳'}`);
    console.log(`  Po3/Session: ${p2.po3.current.name} — ${p2.po3.current.phase}`);
    if (microContext) {
      microContext.isdReady = p2.isd.ready;
      microContext.isdScore = p2.isd.score;
      microContext.cisdGrade = p2.cisd.grade;
    }
  } catch(e) { console.log(`  Priority 2 unavailable — ${e.message.slice(0, 40)}`); }

    // Store for Stage 05
    if (microContext) {
      microContext.fractalScore = fractalData.fractalScore;
      microContext.fractalReady = fractalData.fractalScore >= 12;
      microContext.inversionDetected = fractalData.inversionDetected;
    }
  } catch(e) { console.log(`  Fractal MMXM unavailable — ${e.message.slice(0, 40)}`); }
} catch (e) {
  console.log(`  Micro context unavailable — ${e.message.slice(0, 50)}`);
}

// ── Invalidation Engine (7-dimension check) ──────────────────
let invalidationResult = null;
try {
  const invOut = execSync(`node "${ROOT}/tools/invalidation.cjs" ${PAIR}`, {
    stdio: ["ignore", "pipe", "ignore"], encoding: "utf8", timeout: 15000
  });
  invalidationResult = JSON.parse(invOut);
  const invIcon = invalidationResult.overallStatus === "VALID" ? "✅" :
                   invalidationResult.overallStatus === "INVALIDATED" ? "🛑" :
                   invalidationResult.overallStatus === "HIGH RISK" ? "⚠️" : "🔍";
  console.log(`  🛡️ Invalidation: ${invIcon} ${invalidationResult.overallStatus} | Invalid: ${invalidationResult.totalInvalidated || 0} | Warnings: ${invalidationResult.totalWarnings || 0} | Valid: ${invalidationResult.totalValid || 0}`);
} catch(e) { console.log(`  Invalidation unavailable`); }

// ── Coherence Audit (0-100 score across 4 dimensions) ──────────────────
let coherenceScore = null;
try {
  const cohOut = execSync(`node "${ROOT}/tools/coherence_audit.cjs" ${PAIR}`, {
    stdio: ["ignore", "pipe", "ignore"], encoding: "utf8", timeout: 15000
  });
  const cohData = JSON.parse(cohOut);
  coherenceScore = cohData.coherenceScore;
  console.log(`  🔍 Coherence: ${cohData.coherenceScore}/100 (${cohData.coherenceLabel}) | Lens: ${cohData.lens?.coherent ? '✅' : '⚠️'} | Temporal: ${cohData.temporal?.coherent ? '✅' : '⚠️'} | Archetype: ${cohData.archetype?.coherent ? '✅' : '⚠️'}`);
} catch(e) { console.log(`  Coherence audit unavailable`); }

// ═══════════════ PRICE FRESHNESS GUARD ═══════════════
// Prevents trading on stale data. Compares 1H close vs 1m close
// vs live CDP price. Flags divergences and auto-corrects entry.
console.log("\n═══ PRICE FRESHNESS GUARD ═══");
const r1mPrice = r1m ? r1m.price : null;
const r1hPrice = r1h.price;
const h1mDivergence = r1mPrice ? Math.abs(r1hPrice - r1mPrice) : 0;
const h1mDivergencePct = r1mPrice ? (h1mDivergence / r1mPrice) * 100 : 0;

// Check candle data age — how old is the last 1m bar?
let dataAgeMin = 999;
let lastCandleTime = null;
try {
  const candles1mPath = path.join(sharedDir, "candles_1m.json");
  if (fs.existsSync(candles1mPath)) {
    const candles1m = JSON.parse(fs.readFileSync(candles1mPath, "utf8"));
    if (candles1m.length > 0) {
      lastCandleTime = candles1m[candles1m.length - 1].time;
      dataAgeMin = (Date.now() - lastCandleTime) / 60000;
    }
  }
} catch (e) { /* candles file may not exist */ }

// Attempt live CDP price check if TV is reachable
let livePrice = null;
let livePriceAge = null;
try {
  const tvCheck = require("child_process").execSync(
    `node -e "
      const CDP = require('${ROOT.replace(/\\/g,"/")}/tools/tv-mcp/node_modules/chrome-remote-interface');
      (async()=>{
        const r=await fetch('http://127.0.0.1:9222/json/list');
        const t=await r.json();
        const c=t.find(x=>x.type==='page'&&/tradingview/.test(x.url||''));
        if(!c){console.log(JSON.stringify({error:'no chart'}));return;}
        const cl=await CDP({host:'127.0.0.1',port:9222,target:c.id});
        await cl.Runtime.enable();
        const sym='${PAIR==='DXY'?'FX:USDOLLAR':PAIR==='GOLD'||PAIR==='XAUUSD'?'OANDA:XAUUSD':PAIR==='NAS100'?'CAPITALCOM:NAS100':'OANDA:'+PAIR}';
        await cl.Runtime.evaluate({expression:'window.TradingViewApi._activeChartWidgetWV.value().setSymbol(\\\"'+sym+'\\\",{})',returnByValue:true});
        await new Promise(r=>setTimeout(r,2000));
        const v=await cl.Runtime.evaluate({expression:'(function(){var a=window.TradingViewApi._activeChartWidgetWV.value();var b=a._chartWidget.model().mainSeries().bars();var i=b.lastIndex();var x=b.valueAt(i);return JSON.stringify({price:x[4],time:x[0]*1000});})()',returnByValue:true});
        console.log(v.result.value);
        await cl.close();
      })();
    "`,
    { stdio: ["ignore", "pipe", "ignore"], encoding: "utf8", timeout: 15000 }
  );
  if (tvCheck) {
    try {
      const lp = JSON.parse(tvCheck.trim());
      if (lp.price && !lp.error) {
        livePrice = lp.price;
        livePriceAge = lp.time ? (Date.now() - lp.time) / 60000 : null;
      }
    } catch (e) { /* parse failed */ }
  }
} catch (e) { /* TV not connected */ }

// Determine staleness level and best entry price
let freshnessScore = 10; // 10 = real-time, 0 = unusable
let priceSource = "1H";
let entryPrice = r1hPrice;
const stalenessWarnings = [];

// Factor 1: 1H vs 1m divergence
if (h1mDivergencePct > 0.5) {
  freshnessScore -= 5;
  stalenessWarnings.push(`1H/1m DIVERGENCE: ${r5(h1mDivergence)} (${h1mDivergencePct.toFixed(2)}%) — 1H price is stale`);
  priceSource = "1m";
  entryPrice = r1mPrice;
} else if (h1mDivergencePct > 0.1) {
  freshnessScore -= 2;
  stalenessWarnings.push(`1H/1m drift: ${r5(h1mDivergence)} (${h1mDivergencePct.toFixed(2)}%) — using 1m`);
  priceSource = "1m";
  entryPrice = r1mPrice;
} else {
  stalenessWarnings.push(`1H/1m aligned (${h1mDivergencePct.toFixed(3)}% drift)`);
}

// Factor 2: Data age (last candle timestamp)
if (dataAgeMin > 30) {
  freshnessScore -= 5;
  stalenessWarnings.push(`DATA AGE: last candle ${Math.round(dataAgeMin)}m old — highly stale, do not trade without live confirmation`);
} else if (dataAgeMin > 10) {
  freshnessScore -= 3;
  stalenessWarnings.push(`DATA AGE: last candle ${Math.round(dataAgeMin)}m old — moderately stale, prefer live price`);
} else if (dataAgeMin > 3) {
  freshnessScore -= 1;
  stalenessWarnings.push(`DATA AGE: last candle ${Math.round(dataAgeMin)}m old — acceptable`);
} else {
  stalenessWarnings.push(`DATA AGE: last candle ${dataAgeMin.toFixed(0)}m old — fresh`);
}

// Factor 3: Live CDP price vs best available
if (livePrice !== null) {
  const liveVsBest = Math.abs(livePrice - entryPrice);
  const liveVsBestPct = (liveVsBest / entryPrice) * 100;
  if (liveVsBestPct > 0.3) {
    freshnessScore -= 3;
    stalenessWarnings.push(`LIVE PRICE DIVERGENCE: ${r5(livePrice)} vs ${r5(entryPrice)} (${liveVsBestPct.toFixed(2)}%) — using live CDP price`);
    priceSource = "CDP live";
    entryPrice = livePrice;
  } else if (liveVsBestPct > 0.05) {
    freshnessScore -= 1;
    stalenessWarnings.push(`Live price check: ${r5(livePrice)} vs ${r5(entryPrice)} (${liveVsBestPct.toFixed(2)}% drift)`);
  } else {
    stalenessWarnings.push(`Live price check: ${r5(livePrice)} — matches engine data`);
  }
} else {
  stalenessWarnings.push(`Live price check: TV not connected — no cross-reference available`);
}

freshnessScore = Math.max(0, freshnessScore);

const freshnessLabel = freshnessScore >= 8 ? "FRESH" : freshnessScore >= 5 ? "ACCEPTABLE" : freshnessScore >= 3 ? "STALE — CAUTION" : "DANGER — DO NOT TRADE";

for (const w of stalenessWarnings) console.log(`  ${w}`);
console.log(`  Freshness: ${freshnessScore}/10 — ${freshnessLabel}`);
console.log(`  Entry price source: ${priceSource} @ ${r5(entryPrice)}`);

// ═══════════════ INDUCEMENT GATE STATUS (structure-TF fact, informational) ═══════════════
console.log(`\n═══ INDUCEMENT GATE (${inducement15m?.structureTF || '15m'} structure): ${inducement15m?.gate?.open ? '✅ OPEN — inducement swept + MSS confirmed' : '⏳ status informational — per-model registry gates consume these facts (WP-9)'} ═══`);

// ═══════════════ STAGE 05 — Entry Refinement ═══════════════
console.log("\n═══ STAGE 05 — Entry Refinement ═══");
// Real ATR-14 (Remediation WP-1 / audit Gap 4.1). The old "ATR" was
// 15% of the 4H swing range — a guess at volatility, not a measurement.
const _c4hCandles = loadCandles(sharedDir, "4h");
const _realATR = calcATR(_c4hCandles, 14);
const atrValue = (_realATR != null && _realATR > 0)
  ? _realATR
  : null; // WP-1: No fake ATR fallback. No valid candles → no valid SL → block.
// WP-1 guard: null ATR means we cannot compute a valid structural SL.
// Fail-closed — do not fabricate a stop from swing-range arithmetic.
if (atrValue == null) {
  console.log('  ⛔ WP-1 ATR unavailable — cannot compute valid SL. Real candles required.');
}

// ── PRIORITY 0: 3rd Daily Candle OTE (Simple ICT Scalping Strategy) ──
// "Once a new swing low (bullish) or swing high (bearish) forms on the daily,
// price retraces to the 62-79% Fib of that 3rd candle before continuing."
let thirdCandleOTE = null;
try {
  const dailyCandles = JSON.parse(fs.readFileSync(path.join(sharedDir, "candles_1d.json"), "utf8"));
  if (dailyCandles && dailyCandles.length >= 4) {
    // Find the 3rd candle back from the most recent swing
    const last3 = dailyCandles.slice(-4, -1); // 3 candles before current
    if (last3.length === 3) {
      const c3High = Math.max(...last3.map(c => c.high));
      const c3Low = Math.min(...last3.map(c => c.low));
      const c3Range = c3High - c3Low;
      const c3OTE62 = bias1d === "bearish" ? c3High - c3Range * 0.62 : c3Low + c3Range * 0.62;
      const c3OTE79 = bias1d === "bearish" ? c3High - c3Range * 0.79 : c3Low + c3Range * 0.79;
      const in3rdOTE = r1h.price >= Math.min(c3OTE62, c3OTE79) && r1h.price <= Math.max(c3OTE62, c3OTE79);
      thirdCandleOTE = {
        high: c3High, low: c3Low, range: c3Range,
        ote62: c3OTE62, ote79: c3OTE79,
        inZone: in3rdOTE,
        detail: `3rd Candle OTE: ${r5(c3OTE62)}–${r5(c3OTE79)} | ${in3rdOTE ? '✅ IN ZONE' : '⏳ Outside zone'}`,
      };
      console.log(`  🎯 3rd Candle OTE: ${thirdCandleOTE.detail}`);
    }
  }
} catch(e) { /* candles may not exist */ }

// ── PRIORITY 1: Fibonacci OTE Zone Calculation ──────────────────────
const swHi4h = r4h.structure.lastSwingHigh || entryPrice;
const swLo4h = r4h.structure.lastSwingLow || entryPrice;
const dealRange = Math.abs(swHi4h - swLo4h);
const tradeBias = bias4h || bias1d || "bearish";
const oteLevel62 = tradeBias === "bearish" ? swHi4h - dealRange * 0.62 : swLo4h + dealRange * 0.62;
const oteLevel705 = tradeBias === "bearish" ? swHi4h - dealRange * 0.705 : swLo4h + dealRange * 0.705;
const oteLevel79 = tradeBias === "bearish" ? swHi4h - dealRange * 0.79 : swLo4h + dealRange * 0.79;
const inOTEZone = entryPrice >= Math.min(oteLevel62, oteLevel79) && entryPrice <= Math.max(oteLevel62, oteLevel79);
const oteIdeal = oteLevel705;
const distanceToIdeal = Math.abs(entryPrice - oteIdeal);
const otePips = toPips(distanceToIdeal);

let slPrice, tp1Price, tp2Price, entryType, slReason, tp1Reason, tp2Reason;

// ═══ WP-7 DRAW MAP — external liquidity + session draw references ═══
// Targets are draws on liquidity, never measured moves. The map fuses engine
// pools with the operative window's own references: previous NY-AM H/L and
// London H/L (Missing 5.5). Extreme levels give TP2 a destination when only one
// external pool exists.
const drawRefs = [
  ...(pools || []).map(p => ({ type: p.type, price: p.price, swept: p.swept, label: `${p.type} pool`, detail: `${p.type} pool @ ${r5(p.price)}` })),
  ...(oneTradeSetup?.prevAM?.high ? [{ type: "BSL", price: oneTradeSetup.prevAM.high, label: "Prev NY AM High", detail: `Previous NY AM high @ ${r5(oneTradeSetup.prevAM.high)}` }] : []),
  ...(oneTradeSetup?.prevAM?.low ? [{ type: "SSL", price: oneTradeSetup.prevAM.low, label: "Prev NY AM Low", detail: `Previous NY AM low @ ${r5(oneTradeSetup.prevAM.low)}` }] : []),
  ...(lecture2?.londonRange?.high ? [{ type: "BSL", price: lecture2.londonRange.high, label: "London High", detail: `London high @ ${r5(lecture2.londonRange.high)}` }] : []),
  ...(lecture2?.londonRange?.low ? [{ type: "SSL", price: lecture2.londonRange.low, label: "London Low", detail: `London low @ ${r5(lecture2.londonRange.low)}` }] : []),
];
const drawExtremes = {
  above: [r1d?.structure?.lastSwingHigh, r1w?.structure?.lastSwingHigh, ipdaContext?.weeklyRefs?.twentyDay?.high].filter(Number.isFinite),
  below: [r1d?.structure?.lastSwingLow, r1w?.structure?.lastSwingLow, ipdaContext?.weeklyRefs?.twentyDay?.low].filter(Number.isFinite),
};
let noDrawDir = null; // set when a required external draw is absent → NO TRADE

// ═══ Cascading SL — tightest structural level that still has a draw ═══
// Defaulting to 4H swing for every trade produces wide stops that can't find
// valid R:R draws (especially on wide-range pairs like XAUUSD). ICT allows
// tighter SLs for intraday setups: the structural invalidation on the ENTRY
// timeframe, not always the highest TF.
// Cascade: 4H → 1H → 15m swing + ATR buffer. Use the first level that finds
// a draw at ≥ 1:1 R:R. If none work, NO TRADE.
function cascadingEntry(bias, entryPrice, atrVal, drawRefs, drawExtremes, reports) {
  const isShort = bias === 'bearish';
  const dir = isShort ? 'bearish' : 'bullish';
  const extremes = isShort ? drawExtremes.below : drawExtremes.above;

  // Structural swing candidates: [tf, label, minRR]
  // Intraday setups (15m/1H) allow 0.75:1 minimum — tighter stops on volatile
  // pairs like XAUUSD may not clear 1:1 against the nearest BSL, but the trade
  // is still directional with a defined draw. Swing setups (4H/1D) keep 1:1.
  const swingCandidates = [
    { tf: '15m', label: '15m Swing', minRR: 0.75 },
    { tf: '1h',  label: '1H Swing',  minRR: 0.75 },
    { tf: '4h',  label: '4H Swing',  minRR: 1.0 },
    { tf: '1d',  label: '1D Swing',  minRR: 1.0 },
  ];

  for (const cand of swingCandidates) {
    const r = reports[cand.tf];
    if (!r?.structure) continue;
    const swHi = r.structure.lastSwingHigh;
    const swLo = r.structure.lastSwingLow;
    if (swHi == null || swLo == null || swHi <= swLo) continue;

    const swingPrice = isShort ? swHi : swLo;
    const slPrice = atrVal != null
      ? (isShort ? swingPrice + atrVal : swingPrice - atrVal)
      : 0;
    if (slPrice <= 0) continue;

    const slDist = Math.abs(entryPrice - slPrice);
    if (slDist <= 0) continue;

    const minDistance = slDist * cand.minRR;
    const draw = drawTargets({ direction: dir, price: entryPrice, liquidityMap: drawRefs, extremes, minDistance });
    if (draw) {
      const slReason = `${cand.label} ${isShort ? 'High' : 'Low'} @ ${r5(swingPrice)} ${isShort ? '+' : '-'} ATR buffer`;
      const rr1 = Math.abs(draw.tp1.price - entryPrice) / slDist;
      if (rr1 < 1.0) {
        console.log(`  ⚠️ Tight R:R ${r2(rr1)}:1 using ${cand.label} (intraday) — draw ${r5(draw.tp1.price)} is ${Math.round(Math.abs(draw.tp1.price - entryPrice))} pts away, SL is ${Math.round(slDist)} pts`);
      }
      return {
        entryType: isShort ? 'SHORT' : 'LONG',
        slPrice, slReason, slDist,
        tp1Price: draw.tp1.price,
        tp1Reason: drawReason(draw.tp1, 'TP1'),
        tp2Price: draw.tp2 ? draw.tp2.price : 0,
        tp2Reason: draw.tp2 ? drawReason(draw.tp2, 'TP2') : '',
        noDrawDir: null,
        found: true,
      };
    }
  }

  // No swing level found a valid draw — report why
  const noDrawDir = isShort ? 'sell-side (SSL) below' : 'buy-side (BSL) above';
  return {
    entryType: 'NO TRADE', slPrice: 0, tp1Price: 0, tp2Price: 0,
    slReason: '', tp1Reason: `No ${isShort ? 'SSL' : 'BSL'} draw ≥ SL distance — no external liquidity target`, tp2Reason: '',
    noDrawDir, found: false,
  };
}

const reportsForSL = { '15m': r15m, '1h': r1h, '4h': r4h, '1d': r1d };
if (governingBias === 'bearish' || governingBias === 'bullish') {
  const cas = cascadingEntry(governingBias, entryPrice, atrValue, drawRefs, drawExtremes, reportsForSL);
  entryType = cas.entryType;
  slPrice = cas.slPrice;
  slReason = cas.slReason;
  tp1Price = cas.tp1Price;
  tp1Reason = cas.tp1Reason;
  tp2Price = cas.tp2Price;
  tp2Reason = cas.tp2Reason;
  noDrawDir = cas.noDrawDir;
  if (!cas.found) {
    console.log(`  ⛔ NO TRADE — no draw on liquidity (${noDrawDir}) in range at any swing level`);
  }
} else {
  entryType = 'NO TRADE'; slPrice = 0; tp1Price = 0; tp2Price = 0;
  slReason = ''; tp1Reason = ''; tp2Reason = '';
}

// ═══ WP-8 REGISTRY GATE — the registry is the decision ═══
// No complete registry setup (zero OR several complete) → NO TRADE, regardless
// of the draw-map entry logic above. This is the fail-closed gate.
if (!primary) {
  entryType = 'NO TRADE'; slPrice = 0; tp1Price = 0; tp2Price = 0;
  slReason = ''; tp1Reason = ''; tp2Reason = '';
  console.log(`  ⛔ WP-8 REGISTRY GATE — verdict ${registryDecision ? registryDecision.verdict : 'UNAVAILABLE'} (${registryDecision ? registryDecision.count : 0} complete setups). No single complete model → NO TRADE.`);
}

// ═══ SILVER BULLET SCALP OVERRIDE — Tighter SL/TP for SB window ═══
// During Silver Bullet windows, use 15m/1H levels instead of 4H/1D swing levels.
// This is a SCALP, not a swing trade. SL must be tight enough for valid R:R.
if (primary?.name === "Silver Bullet" && inSBWindow && entryType !== 'NO TRADE') {
  const r15mSwing = r15m?.structure?.lastSwingHigh || r1h?.structure?.lastSwingHigh;
  const r15mSwingLow = r15m?.structure?.lastSwingLow || r1h?.structure?.lastSwingLow;
  // Real ATR from 15m candles (fallback 1h), WP-1. Old code used 10% of the swing range.
  const _sbAtrReal = calcATR(loadCandles(sharedDir, "15m") || loadCandles(sharedDir, "1h"), 14);
  const sbAtr = (_sbAtrReal != null && _sbAtrReal > 0)
    ? _sbAtrReal * 0.25
    : null; // WP-1: No fake ATR fallback

  if (entryType === 'SHORT') {
    const sbSL = (r15mSwing || (entryPrice + sbAtr * 2)) + sbAtr;
    slPrice = sbSL;
    slReason = `SB Scalp: 15m/1H Swing High @ ${r5(r15mSwing || 0)} + ATR`;
    const sbRisk = Math.abs(entryPrice - slPrice);
    const sbDraw = drawTargets({ direction: 'bearish', price: entryPrice, liquidityMap: drawRefs, extremes: drawExtremes.below, minDistance: sbRisk * 0.5 });
    if (sbDraw) {
      tp1Price = sbDraw.tp1.price;
      tp1Reason = `SB Scalp: ${drawReason(sbDraw.tp1, 'TP1')}`;
      tp2Price = sbDraw.tp2 ? sbDraw.tp2.price : 0;
      tp2Reason = sbDraw.tp2 ? `SB Scalp: ${drawReason(sbDraw.tp2, 'TP2')}` : '';
    } else {
      entryType = 'NO TRADE'; tp1Price = 0; tp2Price = 0;
      tp1Reason = 'SB Scalp: no SSL draw in range — no external liquidity target';
      tp2Reason = '';
      noDrawDir = 'sell-side (SSL) below';
      console.log('  ⛔ SB Scalp NO TRADE — no draw on liquidity (sell-side SSL below) in range');
    }
  } else {
    const sbSL = (r15mSwingLow || (entryPrice - sbAtr * 2)) - sbAtr;
    slPrice = sbSL;
    slReason = `SB Scalp: 15m/1H Swing Low @ ${r5(r15mSwingLow || 0)} - ATR`;
    const sbRisk = Math.abs(entryPrice - slPrice);
    const sbDraw = drawTargets({ direction: 'bullish', price: entryPrice, liquidityMap: drawRefs, extremes: drawExtremes.above, minDistance: sbRisk * 0.5 });
    if (sbDraw) {
      tp1Price = sbDraw.tp1.price;
      tp1Reason = `SB Scalp: ${drawReason(sbDraw.tp1, 'TP1')}`;
      tp2Price = sbDraw.tp2 ? sbDraw.tp2.price : 0;
      tp2Reason = sbDraw.tp2 ? `SB Scalp: ${drawReason(sbDraw.tp2, 'TP2')}` : '';
    } else {
      entryType = 'NO TRADE'; tp1Price = 0; tp2Price = 0;
      tp1Reason = 'SB Scalp: no BSL draw in range — no external liquidity target';
      tp2Reason = '';
      noDrawDir = 'buy-side (BSL) above';
      console.log('  ⛔ SB Scalp NO TRADE — no draw on liquidity (buy-side BSL above) in range');
    }
  }
  console.log(`  ⚡ SB Scalp SL/TP: SL ${r5(slPrice)} | TP1 ${r5(tp1Price)} | Risk ${toPips(Math.abs(entryPrice-slPrice))} ${pipLabel()}`);
}

// ═══ LECTURE 2 OVERRIDE — Use post-hunt swing SL + IFVG CE entry ═══
let lecture2Override = false;
if (lecture2?.setupReady && primary?.name === "London Hunt + IFVG") {
  lecture2Override = true;
  const l2Entry = lecture2.entryPrice; // IFVG CE or breaker entry
  const l2SL = lecture2.slReference;   // post-hunt swing + buffer
  if (l2Entry && l2SL && l2Entry !== l2SL) {
    const prevEntry = entryPrice;
    const prevSL = slPrice;
    entryPrice = l2Entry;
    slPrice = l2SL;
    entryType = lecture2.direction; // "BUY" or "SELL"
    slReason = `Lecture 2: ${lecture2.slSource || 'Post-hunt swing'} @ ${r5(slPrice)} (ICT structural invalidation)`;
    // Use Fib targets if available, otherwise draw-on-liquidity targets
    if (lecture2.fibTargets) {
      tp1Price = lecture2.fibTargets.tp1;
      tp1Reason = `Fib ${lecture2.fibTargets.tp1Label} @ ${r5(tp1Price)}`;
      tp2Price = lecture2.fibTargets.tp2;
      tp2Reason = `Fib ${lecture2.fibTargets.tp2Label} @ ${r5(tp2Price)}`;
    } else {
      const l2Dir = entryType; // "BUY" | "SELL" — before any NO TRADE override
      const l2Draw = drawTargets({ direction: l2Dir, price: entryPrice, liquidityMap: drawRefs, extremes: l2Dir === 'BUY' ? drawExtremes.above : drawExtremes.below });
      if (l2Draw) {
        tp1Price = l2Draw.tp1.price;
        tp1Reason = drawReason(l2Draw.tp1, 'TP1');
        tp2Price = l2Draw.tp2 ? l2Draw.tp2.price : 0;
        tp2Reason = l2Draw.tp2 ? drawReason(l2Draw.tp2, 'TP2') : '';
      } else {
        entryType = 'NO TRADE'; tp1Price = 0; tp2Price = 0;
        tp1Reason = 'Lecture 2: no external liquidity draw — no trade';
        tp2Reason = '';
        noDrawDir = l2Dir === 'BUY' ? 'buy-side (BSL) above' : 'sell-side (SSL) below';
        console.log(`  ⛔ Lecture 2 NO TRADE — no draw on liquidity (${noDrawDir}) in range`);
      }
    }
    const source = lecture2.ifvg?.found ? 'IFVG CE' : 'Breaker';
    console.log(`  📐 Lecture 2 Override (${source}): Entry ${r5(prevEntry)}→${r5(entryPrice)} | SL ${r5(prevSL)}→${r5(slPrice)} | Dir: ${entryType}`);
  }
}

// ═══ LECTURE 1 OVERRIDE — Use first-tagged PD array entry + post-08:30 range SL ═══
let lecture1Override = false;
if (!lecture2Override && lecture1?.setupReady && primary?.name === "08:30 Liquidity Raid Model") {
  lecture1Override = true;
  const l1Entry = lecture1.entryPrice;
  const l1SL = lecture1.slReference;
  if (l1Entry && l1SL && l1Entry !== l1SL) {
    const prevEntry = entryPrice;
    const prevSL = slPrice;
    entryPrice = l1Entry;
    slPrice = l1SL;
    entryType = lecture1.direction;
    slReason = `Lecture 1: ${lecture1.slSource || 'Post-08:30 range'} @ ${r5(slPrice)} (ICT structural invalidation)`;
    if (lecture1.tpTargets?.tp1) {
      tp1Price = lecture1.tpTargets.tp1.price;
      tp1Reason = lecture1.tpTargets.tp1.detail;
    }
    if (lecture1.tpTargets?.tp2) {
      tp2Price = lecture1.tpTargets.tp2.price;
      tp2Reason = lecture1.tpTargets.tp2.detail;
    }
    if (!lecture1.tpTargets?.tp1) {
      const l1Dir = entryType;
      const l1Draw = drawTargets({ direction: l1Dir, price: entryPrice, liquidityMap: drawRefs, extremes: l1Dir === 'BUY' ? drawExtremes.above : drawExtremes.below });
      if (l1Draw) {
        tp1Price = l1Draw.tp1.price;
        tp1Reason = drawReason(l1Draw.tp1, 'TP1');
        tp2Price = l1Draw.tp2 ? l1Draw.tp2.price : 0;
        tp2Reason = l1Draw.tp2 ? drawReason(l1Draw.tp2, 'TP2') : '';
      } else {
        entryType = 'NO TRADE'; tp1Price = 0; tp2Price = 0;
        tp1Reason = 'Lecture 1: no external liquidity draw — no trade';
        tp2Reason = '';
        noDrawDir = l1Dir === 'BUY' ? 'buy-side (BSL) above' : 'sell-side (SSL) below';
        console.log(`  ⛔ Lecture 1 NO TRADE — no draw on liquidity (${noDrawDir}) in range`);
      }
    }
    console.log(`  📐 Lecture 1 Override (${lecture1.entrySource || 'PD Array'}): Entry ${r5(prevEntry)}→${r5(entryPrice)} | SL ${r5(prevSL)}→${r5(slPrice)} | Dir: ${entryType}`);
  }
}

// ═══ LECTURE 4 OVERRIDE — Use gap-based entry + post-MSS SL + gap TP ═══
let lecture4Override = false;
if (!lecture2Override && !lecture1Override && lecture4?.setupReady && primary?.name === "NDOG/NWOG News Model") {
  lecture4Override = true;
  const l4Entry = lecture4.entryPrice;
  const l4SL = lecture4.slReference;
  if (l4Entry && l4SL && l4Entry !== l4SL) {
    const prevEntry = entryPrice;
    const prevSL = slPrice;
    entryPrice = l4Entry;
    slPrice = l4SL;
    entryType = lecture4.direction;
    slReason = `Lecture 4: ${lecture4.slSource || 'Post-MSS swing'} @ ${r5(slPrice)} (ICT structural invalidation)`;
    // Use gap-based TP targets if available
    if (lecture4.tpTargets?.tp1) {
      tp1Price = lecture4.tpTargets.tp1.price;
      tp1Reason = lecture4.tpTargets.tp1.detail;
    }
    if (lecture4.tpTargets?.tp2) {
      tp2Price = lecture4.tpTargets.tp2.price;
      tp2Reason = lecture4.tpTargets.tp2.detail;
    }
    if (!lecture4.tpTargets?.tp1) {
      const l4Dir = entryType;
      const l4Draw = drawTargets({ direction: l4Dir, price: entryPrice, liquidityMap: drawRefs, extremes: l4Dir === 'BUY' ? drawExtremes.above : drawExtremes.below });
      if (l4Draw) {
        tp1Price = l4Draw.tp1.price;
        tp1Reason = drawReason(l4Draw.tp1, 'TP1');
        tp2Price = l4Draw.tp2 ? l4Draw.tp2.price : 0;
        tp2Reason = l4Draw.tp2 ? drawReason(l4Draw.tp2, 'TP2') : '';
      } else {
        entryType = 'NO TRADE'; tp1Price = 0; tp2Price = 0;
        tp1Reason = 'Lecture 4: no external liquidity draw — no trade';
        tp2Reason = '';
        noDrawDir = l4Dir === 'BUY' ? 'buy-side (BSL) above' : 'sell-side (SSL) below';
        console.log(`  ⛔ Lecture 4 NO TRADE — no draw on liquidity (${noDrawDir}) in range`);
      }
    }
    const l4source = lecture4.entry?.source || 'Gap entry';
    console.log(`  📐 Lecture 4 Override (${l4source}): Entry ${r5(prevEntry)}→${r5(entryPrice)} | SL ${r5(prevSL)}→${r5(slPrice)} | Dir: ${entryType}`);
  }
}

// ═══ HIGH PRECISION TP EXTENSION — 7-9AM projected level as destination ═══
// ICT Gems 9:30AM Liquidity Target: "Target the projected level — the -0.5 or
// the opposite side of the 7-9 range." This only EXTENDS the destination (TP2)
// to the bias-aligned 7-9AM projection — it never tightens TP1 — and only when
// the framework is active (range locked post-9:01).
let hpTpOverride = null;
if (precisionFacts.active && entryType !== 'NO TRADE' && tp1Price > 0 && precisionFacts.range) {
  const rng = precisionFacts.range;
  if (entryType === 'LONG') {
    const candidates = [rng.high, rng.projNeg05].filter(v => Number.isFinite(v) && v > tp1Price);
    if (candidates.length > 0) {
      const dest = Math.max(...candidates);
      const isProj = dest >= rng.projNeg05;
      if (tp2Price === 0 || dest > tp2Price) {
        tp2Price = dest;
        tp2Reason = isProj ? `7-9AM -0.5 projection @ ${r5(dest)} (daily high objective)` : `7-9AM range high @ ${r5(dest)}`;
        hpTpOverride = { level: dest, label: isProj ? '-0.5 projection' : 'range high' };
        console.log(`  🎯 High Precision TP2 → ${hpTpOverride.label} @ ${r5(dest)} (bias-aligned 7-9AM target)`);
      }
    }
  } else if (entryType === 'SHORT') {
    const candidates = [rng.low, rng.projNeg05Low].filter(v => Number.isFinite(v) && v < tp1Price);
    if (candidates.length > 0) {
      const dest = Math.min(...candidates);
      const isProj = dest <= rng.projNeg05Low;
      if (tp2Price === 0 || dest < tp2Price) {
        tp2Price = dest;
        tp2Reason = isProj ? `7-9AM -0.5 projection @ ${r5(dest)} (daily low objective)` : `7-9AM range low @ ${r5(dest)}`;
        hpTpOverride = { level: dest, label: isProj ? '-0.5 projection' : 'range low' };
        console.log(`  🎯 High Precision TP2 → ${hpTpOverride.label} @ ${r5(dest)} (bias-aligned 7-9AM target)`);
      }
    }
  }
}

// ═══ IOFED PYRAMID — 3-Level FVG Entry Drill ═══
// ICT: Enter at FVG edge (starter) → CE 50% (add) → Far edge (add)
// "Many setups reverse from the very edge without retracing to the 50% level."
let iofedPyramid = null;
const iofedDirection = governingBias === 'bearish' ? 'SHORT' : governingBias === 'bullish' ? 'LONG' : 'NO TRADE';
if (iofedDirection !== 'NO TRADE' && fvgs.length > 0) {
  // Find the nearest FVG in the trade direction for IOFED entry
  const tradeFvgs = fvgs.filter(f => {
    if (iofedDirection === 'SHORT') return f.type === 'bearish' && (f.fillFraction || 0) < 0.5;
    return f.type === 'bullish' && (f.fillFraction || 0) < 0.5;
  });
  if (tradeFvgs.length > 0) {
    const fvg = tradeFvgs.reduce((a, b) =>
      Math.abs(((a.top + a.bottom) / 2) - entryPrice) < Math.abs(((b.top + b.bottom) / 2) - entryPrice) ? a : b
    );
    const gap = Math.abs(fvg.top - fvg.bottom);
    const ce = (fvg.top + fvg.bottom) / 2;

    if (iofedDirection === 'SHORT') {
      iofedPyramid = {
        starter: { price: fvg.top - gap * 0.1, label: 'IOFED (FVG edge)', size: '40%' },
        add1: { price: ce, label: 'CE 50%', size: '35%' },
        add2: { price: fvg.bottom, label: 'Far edge (full mitigation)', size: '25%' },
      };
    } else {
      iofedPyramid = {
        starter: { price: fvg.bottom + gap * 0.1, label: 'IOFED (FVG edge)', size: '40%' },
        add1: { price: ce, label: 'CE 50%', size: '35%' },
        add2: { price: fvg.top, label: 'Far edge (full mitigation)', size: '25%' },
      };
    }
    iofedPyramid.fvgType = fvg.type;
    iofedPyramid.slPrice = slPrice;
    iofedPyramid.tpPrice = tp1Price;
    console.log(`  📐 IOFED Pyramid: Starter @ ${r5(iofedPyramid.starter.price)} | CE @ ${r5(iofedPyramid.add1.price)} | Far @ ${r5(iofedPyramid.add2.price)}`);
  }
}
// ── IFVG Scale-In Pyramid (WP-14): uses inversion FVGs instead of regular FVGs ──
let ifvgPyramid = null;
if (iofedDirection !== 'NO TRADE' && biasAlignedIFVGs.length > 0 && primary?.name === "IFVG Scale-In") {
  const bestIFVG = biasAlignedIFVGs[0]; // nearest bias-aligned IFVG
  const gap = Math.abs(bestIFVG.top - bestIFVG.bottom);

  if (iofedDirection === 'SHORT') {
    ifvgPyramid = {
      starter: { price: bestIFVG.top - gap * 0.1, label: 'IFVG Top (resistance edge)', size: '40%' },
      add1: { price: bestIFVG.ce, label: 'IFVG CE 50%', size: '35%' },
      add2: { price: bestIFVG.bottom, label: 'IFVG Bottom (deep fill)', size: '25%' },
    };
  } else {
    ifvgPyramid = {
      starter: { price: bestIFVG.bottom + gap * 0.1, label: 'IFVG Bottom (support edge)', size: '40%' },
      add1: { price: bestIFVG.ce, label: 'IFVG CE 50%', size: '35%' },
      add2: { price: bestIFVG.top, label: 'IFVG Top (full mitigation)', size: '25%' },
    };
  }
  ifvgPyramid.ifvgType = 'inversion';
  ifvgPyramid.ifvgTop = bestIFVG.top;
  ifvgPyramid.ifvgBottom = bestIFVG.bottom;
  ifvgPyramid.slPrice = slPrice;
  ifvgPyramid.tpPrice = tp1Price;
  console.log(`  📐 IFVG Scale-In Pyramid: Starter @ ${r5(ifvgPyramid.starter.price)} | CE @ ${r5(ifvgPyramid.add1.price)} | Far @ ${r5(ifvgPyramid.add2.price)}`);
}

const risk = Math.abs(entryPrice - slPrice);
const reward1 = Math.abs(tp1Price - entryPrice);
const reward2 = tp2Price > 0 ? Math.abs(tp2Price - entryPrice) : 0;
const rr1 = risk > 0 ? reward1 / risk : 0;
const rr2 = risk > 0 ? reward2 / risk : 0;

const riskPips = toPips(risk);
const reward1Pips = toPips(reward1);
const reward2Pips = toPips(reward2);
const pipLabelStr = pipLabel();

writeMd("05_entry_refinement", "entry_plan.md", `# Entry Plan — ${pairLabel} — ${DATE}

## Data Freshness: ${freshnessScore}/10 — ${freshnessLabel}
- **Price source**: ${priceSource} @ ${r5(entryPrice)}
- **1H close**: ${r5(r1hPrice)} | **1m close**: ${r1mPrice ? r5(r1mPrice) : 'N/A'}${livePrice !== null ? ` | **Live CDP**: ${r5(livePrice)}` : ''}
- **Data age**: ${Math.round(dataAgeMin)}m since last candle
- ${freshnessScore >= 5 ? '✅ Data is tradeable' : '⛔ DO NOT TRADE — refresh data first'}

## Model: **${primary ? primary.name : 'NO TRADE — registry'}**${primary ? ` (sequence complete, tier ${primary.tier})` : ' (no single complete model)'}
${lecture2?.setupReady ? `
## 📐 Lecture 2 Override ACTIVE
- **Entry Source**: ${lecture2.ifvg?.found ? `IFVG CE @ ${r5(lecture2.ifvg.ce)} (${lecture2.ifvg.type})` : `Breaker Block @ ${r5(lecture2.breaker?.entry || 0)}`}
- **SL Source**: ${lecture2.slSource || 'Post-hunt swing'} @ ${lecture2.slReference ? r5(lecture2.slReference) : 'N/A'}
- **MSS**: Confirmed ${lecture2.mss?.direction || ''} — close beyond prior swing
- **London Range**: H ${lecture2.londonRange ? r5(lecture2.londonRange.high) : 'N/A'} / L ${lecture2.londonRange ? r5(lecture2.londonRange.low) : 'N/A'} (draw reference)
- **Hunt**: ${lecture2.hunt.swept} swept @ ${r5(lecture2.hunt.sweepPrice)} → reversed → IFVG confirmed
${lecture2.fibTargets ? `- **Fib TP**: ${lecture2.fibTargets.detail}` : ''}
` : ''}${lecture2?.hunt?.active && !lecture2?.setupReady ? `
## ⏳ Lecture 2 Monitoring
- **Hunt**: ${lecture2.hunt.detail || 'Active'}
- **MSS**: ${lecture2.mss?.confirmed ? '✅ Confirmed' : '⏳ ' + (lecture2.mss?.detail || 'Pending')}
- **IFVG**: ${lecture2.ifvg?.found ? '✅ Found' : '⏳ ' + (lecture2.ifvg?.detail || 'Pending')}
- **Breaker**: ${lecture2.breaker?.found ? '✅ Available as backup' : 'Not found'}
${lecture2.reversalCheck?.active ? `- **⚠️ ${lecture2.reversalCheck.warning}**` : ''}
` : ''}${lecture1?.setupReady ? `
## 📐 Lecture 1 Override ACTIVE (08:30 Liquidity Raid Model)
- **Entry Source**: ${lecture1.entrySource || 'PD Array'} @ ${lecture1.entryPrice ? r5(lecture1.entryPrice) : 'N/A'} (first-tagged)
- **SL Source**: ${lecture1.slSource || 'Post-08:30 range'} @ ${lecture1.slReference ? r5(lecture1.slReference) : 'N/A'}
- **MSS**: Confirmed ${lecture1.mss?.direction || ''}
- **15m Bias**: ${lecture1.bias?.toUpperCase() || 'N/A'} | ${lecture1.ctx15m?.drawTargets?.length || 0} draw targets
- **Raid**: ${lecture1.raid?.swept || 'Levels'} swept @ ${lecture1.raid?.sweepPrice ? r5(lecture1.raid.sweepPrice) : 'N/A'}
- **PD Arrays**: ${lecture1.pdArrays?.length || 0} found — ${lecture1.firstTagged?.type || 'None'} first-tagged
${lecture1.tpTargets ? `- **TP**: ${lecture1.tpTargets.detail}` : ''}
` : ''}${lecture1?.inWindow && !lecture1?.setupReady ? `
## ⏳ Lecture 1 Monitoring (08:30 Liquidity Raid Model)
- **Formation (08:00-08:30)**: ${lecture1.formation?.formed ? '✅ ' + lecture1.formation.detail : '⏳ ' + (lecture1.formation?.detail || 'Pending')}
- **Raid (post-08:30)**: ${lecture1.raid?.active ? '⚡ ' + lecture1.raid.detail : '⏳ ' + (lecture1.raid?.detail || 'Pending')}
- **MSS**: ${lecture1.mss?.confirmed ? '✅ Confirmed' : '⏳ ' + (lecture1.mss?.detail || 'Pending')}
- **PD Arrays**: ${lecture1.pdArrays?.length || 0} discovered${lecture1.firstTagged ? ' — first: ' + lecture1.firstTagged.type : ''}
${lecture1.reversalCheck?.active ? `- **⚠️ ${lecture1.reversalCheck.warning}**` : ''}
` : ''}${lecture4?.setupReady ? `
## 📐 Lecture 4 Override ACTIVE (NDOG/NWOG News Model)
- **Entry Source**: ${lecture4.entry?.source || 'Gap'} @ ${lecture4.entryPrice ? r5(lecture4.entryPrice) : 'N/A'} (${lecture4.entry?.detail || ''})
- **SL Source**: ${lecture4.slSource || 'Post-MSS swing'} @ ${lecture4.slReference ? r5(lecture4.slReference) : 'N/A'}
- **MSS**: Confirmed ${lecture4.mss?.direction || ''}
- **Gap Draw**: ${lecture4.gapDraw?.nearestGap?.type || 'GAP'} — ${lecture4.gapDraw?.detail || ''}
- **Quarters**: ${lecture4.quarters ? `0.25@${r5(lecture4.quarters.q025)} / 0.50@${r5(lecture4.quarters.q50)} / 0.75@${r5(lecture4.quarters.q075)}` : 'N/A'}
${lecture4.quarterTap?.detected ? `- **⚠️ ${lecture4.quarterTap.detail}**` : ''}
${lecture4.tpTargets ? `- **Gap TP**: ${lecture4.tpTargets.detail}` : ''}
` : ''}${lecture4?.inNewsWindow && !lecture4?.setupReady ? `
## ⏳ Lecture 4 Monitoring (NDOG/NWOG News Model)
- **Gaps**: ${lecture4.gapClusters?.hasGaps ? lecture4.gapClusters.detail : (lecture4.substituteGap ? 'Using FVG substitute' : 'None')}
- **Draw**: ${lecture4.gapDraw?.drawing ? '⚡ Drawing toward gap' : '⏳ ' + (lecture4.gapDraw?.detail || 'Pending')}
- **MSS**: ${lecture4.mss?.confirmed ? '✅ Confirmed' : '⏳ ' + (lecture4.mss?.detail || 'Pending')}
- **Entry**: ${lecture4.entry?.found ? '✅ ' + lecture4.entry.detail : '⏳ Pending'}
${lecture4.inAPlusWindow ? '- **⭐ 09:30 A-PLUS WINDOW ACTIVE** — equity market open delivery' : ''}
${lecture4.reversalCheck?.active ? `- **⚠️ ${lecture4.reversalCheck.warning}**` : ''}
` : ''}
## Setup
- **Direction**: **${entryType}** | **Entry TF**: 15m/5m
- **Trigger**: ${bias1d === 'bearish' ? 'MSS downside + bearish FVG fill on 5m' : bias1d === 'bullish' ? 'MSS upside + bullish FVG fill on 5m' : 'N/A'}

${thirdCandleOTE ? `
## 3rd Daily Candle OTE (Priority 0 — Simple Scalping Strategy)
| Level | Price | Notes |
|-------|-------|-------|
| 3rd Candle High | ${r5(thirdCandleOTE.high)} | 3-candle range: ${r5(thirdCandleOTE.range)} |
| 62% Retrace | ${r5(thirdCandleOTE.ote62)} | OTE zone entry |
| 79% Retrace | ${r5(thirdCandleOTE.ote79)} | OTE zone boundary |
| Current Price | ${r5(r1h.price)} | ${thirdCandleOTE.inZone ? '✅ IN 3RD CANDLE OTE ZONE' : '⏳ Outside zone'} |
` : ''}
## Fibonacci OTE Zone (Priority 1)
| Level | Price | Notes |
|-------|-------|-------|
| 62% Retracement | ${r5(oteLevel62)} | OTE zone entry |
| **70.5% (Ideal)** | **${r5(oteIdeal)}** | ICT ideal entry |
| 79% Retracement | ${r5(oteLevel79)} | OTE zone boundary |
| Current Price | ${r5(entryPrice)} | ${inOTEZone ? '✅ IN OTE ZONE' : '⚠️ ' + otePips + ' ' + pipLabel() + ' from ideal'} |

## Parameters (ICT-Correct)
| | Price | Distance | Reasoning |
|---|-------|----------|-----------|
| Entry | ${r5(entryPrice)} | — | Current 1H price |
| SL | ${r5(slPrice)} | ${riskPips} ${pipLabelStr} | ${slReason} |
| TP1 | ${r5(tp1Price)} | ${reward1Pips} ${pipLabelStr} | ${tp1Reason} |
| TP2 | ${tp2Price > 0 ? `${r5(tp2Price)} | ${reward2Pips} ${pipLabelStr}` : '— (single draw — manage runner)'} | ${tp2Reason || '—'} |

## Risk-Reward
- **R:R TP1**: ${r2(rr1)}:1 ${rr1 >= 1.0 ? '✅' : '✗ Below 1:1'}
${iofedPyramid ? `
## IOFED Pyramid Entry (${iofedPyramid.fvgType} FVG)
| Level | Price | Size | Risk | R:R | Notes |
|-------|-------|------|------|-----|-------|
| 🥇 Starter | ${r5(iofedPyramid.starter.price)} | ${iofedPyramid.starter.size} | ${toPips(Math.abs(iofedPyramid.starter.price - iofedPyramid.slPrice))} ${pipLabelStr} | ${r2(Math.abs(iofedPyramid.tpPrice - iofedPyramid.starter.price) / Math.abs(iofedPyramid.starter.price - iofedPyramid.slPrice))}:1 | ${iofedPyramid.starter.label} |
| 🥈 Add #1 | ${r5(iofedPyramid.add1.price)} | ${iofedPyramid.add1.size} | ${toPips(Math.abs(iofedPyramid.add1.price - iofedPyramid.slPrice))} ${pipLabelStr} | ${r2(Math.abs(iofedPyramid.tpPrice - iofedPyramid.add1.price) / Math.abs(iofedPyramid.add1.price - iofedPyramid.slPrice))}:1 | ${iofedPyramid.add1.label} |
| 🥉 Add #2 | ${r5(iofedPyramid.add2.price)} | ${iofedPyramid.add2.size} | ${toPips(Math.abs(iofedPyramid.add2.price - iofedPyramid.slPrice))} ${pipLabelStr} | ${r2(Math.abs(iofedPyramid.tpPrice - iofedPyramid.add2.price) / Math.abs(iofedPyramid.add2.price - iofedPyramid.slPrice))}:1 | ${iofedPyramid.add2.label} |
` : ''}${ifvgPyramid ? `
## IFVG Scale-In Pyramid (inversion FVG — ${r5(ifvgPyramid.ifvgBottom)}–${r5(ifvgPyramid.ifvgTop)})
| Level | Price | Size | Risk | R:R | Notes |
|-------|-------|------|------|-----|-------|
| 🥇 Starter | ${r5(ifvgPyramid.starter.price)} | ${ifvgPyramid.starter.size} | ${toPips(Math.abs(ifvgPyramid.starter.price - ifvgPyramid.slPrice))} ${pipLabelStr} | ${r2(Math.abs(ifvgPyramid.tpPrice - ifvgPyramid.starter.price) / Math.abs(ifvgPyramid.starter.price - ifvgPyramid.slPrice))}:1 | ${ifvgPyramid.starter.label} |
| 🥈 Add #1 | ${r5(ifvgPyramid.add1.price)} | ${ifvgPyramid.add1.size} | ${toPips(Math.abs(ifvgPyramid.add1.price - ifvgPyramid.slPrice))} ${pipLabelStr} | ${r2(Math.abs(ifvgPyramid.tpPrice - ifvgPyramid.add1.price) / Math.abs(ifvgPyramid.add1.price - ifvgPyramid.slPrice))}:1 | ${ifvgPyramid.add1.label} |
| 🥉 Add #2 | ${r5(ifvgPyramid.add2.price)} | ${ifvgPyramid.add2.size} | ${toPips(Math.abs(ifvgPyramid.add2.price - ifvgPyramid.slPrice))} ${pipLabelStr} | ${r2(Math.abs(ifvgPyramid.tpPrice - ifvgPyramid.add2.price) / Math.abs(ifvgPyramid.add2.price - ifvgPyramid.slPrice))}:1 | ${ifvgPyramid.add2.label} |
` : ''}${defensiveWickCE ? `
## Body Defense (Wick CE)
- **Defensive Wick CE**: ${r5(defensiveWickCE.ce)} (${defensiveWickCE.direction})
- **Status**: ${defensiveWickCE.bodyViolated ? '❌ VIOLATED — ' + defensiveWickCE.violationDetail : '✅ Holding — bodies respecting CE'}
- **Action**: ${defensiveWickCE.bodyViolated ? 'Consider partial close. Bodies closing past CE → deeper retracement expected.' : 'Hold position. Bodies defending CE — reversal structure intact.'}
` : ''}
- **R:R TP2**: ${r2(rr2)}:1
- **Risk**: ${riskPips} ${pipLabelStr}

## Checklist
- [ ] SL at structural invalidation: ✓
- [ ] HTF bias aligned: ${bias1d !== 'neutral' ? '✓' : '✗'}
- [ ] Killzone active: ${inKZ ? '✓' : '✗'}
- [ ] R:R ≥ 1:1: ${rr1 >= 1.0 ? '✓' : '✗'}
`);

// ═══════════════ STAGE 06 — Risk ═══════════════
console.log("═══ STAGE 06 — Risk Management ═══");

// ── Risk Gate: Check daily/weekly limits, drawdown, consecutive losses ──
let riskState = null;
let riskAllowed = true;
let riskBlockReason = "";
try {
  const riskOut = execSync(`node "${ROOT}/tools/risk_tracker.cjs" --check`, {
    stdio: ["ignore", "pipe", "ignore"], encoding: "utf8", timeout: 5000
  });
  riskState = JSON.parse(riskOut);
  riskAllowed = riskState.allowed !== false;
  if (!riskAllowed) riskBlockReason = riskState.reason;
  if (riskState.sizeMultiplier < 1.0) console.log(`  ⚠️ Size reduced to ×${riskState.sizeMultiplier} (${riskState.consecutiveLosses} consecutive losses)`);
  if (riskState.dailyLossRemaining < 50) console.log(`  ⚠️ Daily loss budget low: $${riskState.dailyLossRemaining} remaining`);
  if (riskState.reason) console.log(`  ℹ️ ${riskState.reason}`);
} catch(e) { console.log(`  Risk tracker unavailable — using default limits`); }

const accountBalance = riskState ? parseFloat(riskState.balance) : 10000;
const riskPct = 1;
const riskAmount = accountBalance * riskPct / 100;
const sizeMultiplier = riskState ? riskState.sizeMultiplier : 1.0;

// Position sizing: riskInPips × pointValuePerLot = $ risk per standard lot
const riskInPips = toPips(risk);
const riskDollarsPerLot = riskInPips * IC.pointValuePerLot;
const posSizeLots = riskDollarsPerLot > 0 ? (riskAmount / riskDollarsPerLot) * sizeMultiplier : 0;
const lots = posSizeLots >= 0.1
  ? posSizeLots.toFixed(2) + " std"
  : posSizeLots >= 0.01
    ? (posSizeLots * 10).toFixed(2) + " mini"
    : (posSizeLots * 100).toFixed(0) + " micro";

// market_order.cjs QTY: forex→units (100k=1 lot), gold→units (100=1 lot), index→contracts
const qtyUnits = IC.type === "index"
  ? Math.max(1, Math.round(posSizeLots))
  : Math.max(1, Math.round(posSizeLots * (IC.type === "gold" ? 100 : 100000)));

const maxLoss = posSizeLots * riskInPips * IC.pointValuePerLot;
const maxGain = posSizeLots * toPips(reward1) * IC.pointValuePerLot;

writeMd("06_risk_management", "risk_plan.md", `# Risk Plan — ${pairLabel} — ${DATE}

${!riskAllowed ? `## 🛑 RISK GATE: BLOCKED — ${riskBlockReason}\n\nTrade not allowed under current risk parameters.\n\n` : ''}
## Account
- **Balance**: $${accountBalance.toLocaleString()} | **Risk**: ${riskPct}% = $${riskAmount}${riskState ? ` | **Size**: ×${sizeMultiplier}` : ''}
- **Daily P&L**: ${riskState ? '$' + riskState.dailyPnl + ' / $' + riskState.dailyLossLimit + ' limit' : 'N/A'}
- **Weekly P&L**: ${riskState ? '$' + riskState.weeklyPnl + ' / $' + riskState.weeklyLossLimit + ' limit' : 'N/A'}
- **Drawdown**: ${riskState ? riskState.drawdownPct + '% (peak $' + riskState.peakBalance + ')' : 'N/A'} | **Consecutive**: ${riskState ? riskState.consecutiveLosses + 'L / ' + riskState.consecutiveWins + 'W' : 'N/A'}
- **Daily Loss Limit**: $${r2(accountBalance * 0.03)}

## Position Size
| Parameter | Value |
|-----------|-------|
| Entry | ${r5(entryPrice)} |
| SL | ${r5(slPrice)} (structural invalidation) |
| Stop Distance | ${riskPips} ${pipLabelStr} |
| **Position** | **${lots} lots** |
| Risk | $${r2(Math.abs(maxLoss))} |
| Max Gain (TP1) | $${r2(maxGain)} |

## Trade Ticket
\`\`\`
PAIR:       ${pairLabel}
DIRECTION:  ${entryType}
ENTRY:      ${r5(entryPrice)}
SL:         ${r5(slPrice)}
TP1:        ${r5(tp1Price)} (close 50%)
TP2:        ${r5(tp2Price)} (close 50%)
R:R:        ${r2(rr1)}:1 / ${r2(rr2)}:1
\`\`\`

## Execution: **PAPER**

## Checklist
- [ ] R:R ≥ 1:1: ${rr1 >= 1.0 ? '✓' : '✗'}
- [ ] Risk ≤ 1%: ✓
- [ ] SL at structural invalidation: ✓
`);

// ═══════════════ STAGE 07 — Journal ═══════════════
console.log("═══ STAGE 07 — Journal ═══");
writeMd("07_journal_review", "review.md", `# Session Review — ${pairLabel} — ${DATE}

## Setup Summary
| | |
|---|---|
| **Direction** | ${entryType} |
| **Model** | ${primary ? `${primary.name} (sequence complete)` : 'NO TRADE — no single complete model'} |
| **Bias** | 1W ${bias1w} → 1D ${bias1d} → 4H ${bias4h} |
| **Session** | ${session} ${inKZ ? '(Killzone ✅)' : ''} |
| **Entry** | ${r5(entryPrice)} | SL: ${r5(slPrice)} | TP1: ${r5(tp1Price)} |
| **R:R** | ${r2(rr1)}:1 | ${rr1 >= 1.0 ? 'Meets 1:1 ✓' : 'Below minimum ✗'} |

## Multi-TF Alignment
\`\`\`
1W  ${bias1w === bias1d ? '✅' : '⚠️'} ${bias1w.toUpperCase()}
1D  ✅ ${bias1d.toUpperCase()} ← TRADE BIAS
4H  ${bias4h === bias1d ? '✅' : '⚠️'} ${bias4h.toUpperCase()}
1H  ${bias1h === bias1d ? '✅' : '⚠️'} ${bias1h.toUpperCase()}
\`\`\`

## Decision Quality
| Decision | Rating (1-5) |
|----------|-------------|
| HTF Bias | ${bias1w === bias1d ? 4 : 3} |
| Levels | ${(hasOB || hasFVG) ? 4 : 2} |
| Model | ${primary ? 4 : 2} |
| R:R | ${rr1 >= 1.0 ? 4 : 2} |
| **Overall** | **${r2(((bias1w === bias1d ? 4 : 3) + (hasOB || hasFVG ? 4 : 2) + (primary ? 4 : 2) + (rr1 >= 1.0 ? 4 : 2)) / 4)}/5** |

## Confluence Check
- DXY correlation: EURUSD + GBPUSD both ${r1d.structure.bias} → DXY should be ${r1d.structure.bias === 'bearish' ? 'bullish' : 'bearish'}
- ${hasFVG ? 'FVGs present for entry refinement ✅' : 'No FVGs — wait for displacement'}
`);

// ═══════════════ NARRATIVE — Causal Chain ═══════════════
console.log("═══ NARRATIVE SYNTHESIS ═══");
let narrativeResult = null;
try {
  const narOut = execSync(`node "${ROOT}/tools/narrative.cjs" ${PAIR}`, {
    stdio: ["ignore", "pipe", "ignore"], encoding: "utf8", timeout: 20000
  });
  narrativeResult = JSON.parse(narOut);
  console.log(`  📖 Narrative: ${narrativeResult.bias?.toUpperCase() || 'N/A'} | Strength: ${narrativeResult.strength || '?'} | Coherence: ${narrativeResult.coherence || '?'}/10 | Council: ${narrativeResult.councilVerdict || '?'}`);
} catch(e) { console.log(`  Narrative unavailable`); }

// ═══════════════ SUMMARY ═══════════════
console.log(`\n${"=".repeat(55)}`);
console.log(`  ${pairLabel} — COMPLETE`);
console.log(`${"=".repeat(55)}`);
console.log(`Data: ${freshnessLabel} (${freshnessScore}/10) | Source: ${priceSource} | Age: ${Math.round(dataAgeMin)}m`);
// ═══ UNIFIED COHERENCE — worst dimension wins ═══
const microCoh = microContext?.score || 0;
const auditCoh = coherenceScore || 0;
const isInvalid = invalidationResult?.overallStatus === "INVALIDATED";
const unifiedCoh = isInvalid ? 0 : Math.min(microCoh * 10, auditCoh); // Normalize micro to 0-100, take minimum
const unifiedLabel = isInvalid ? "🛑 INVALIDATED" : unifiedCoh >= 70 ? "✅ STRONG" : unifiedCoh >= 50 ? "⚠️ ADEQUATE" : unifiedCoh >= 30 ? "⏳ WEAK" : "❌ POOR";
console.log(`Unified Coherence: ${unifiedCoh}/100 — ${unifiedLabel}${isInvalid ? ' (invalidation overrides all)' : ''}`);
console.log(`Cycle: ${effectivePhase} | Coherence: ${coherenceScore || '?'}/100 | Invalidation: ${invalidationResult ? invalidationResult.overallStatus : '?'}`);
console.log(`Bias: ${bias1d.toUpperCase()} | 1W→${bias1w} 1D→${bias1d} 4H→${bias4h}`);
console.log(`Model: ${primary ? primary.name : 'NO TRADE'} (${registryDecision ? registryDecision.verdict : 'registry unavailable'}) — ${registryDecision ? registryDecision.count : 0} complete of ${models.length} registry models`);
if (conflicts.length > 0) console.log(`⚠️  Legacy-shadow conflicts: ${conflicts.length} mutual exclusivity issue(s) detected (read-only)`);
if (phaseConflicts.length > 0) console.log(`⚠️  Legacy-shadow phase conflicts: ${phaseConflicts.length} model(s) inappropriate for ${effectivePhase} phase (read-only)`);
console.log(`Entry: ${entryType} @ ${r5(entryPrice)}`);
console.log(`SL: ${r5(slPrice)} | TP1: ${r5(tp1Price)} | TP2: ${r5(tp2Price)}`);
if (entryType === 'NO TRADE' && noDrawDir) {
  console.log(`⛔ NO TRADE — no draw on liquidity (${noDrawDir}) in range`);
} else if (entryType !== 'NO TRADE') {
  console.log(`🎯 TPs: ${r5(tp1Price)} → ${r5(tp2Price || tp1Price)} (draws: ${tp1Reason}${tp2Reason ? `, ${tp2Reason}` : ''})`);
}
console.log(`R:R: ${r2(rr1)}:1 / ${r2(rr2)}:1 | ${rr1 >= 1.0 ? '✅ MEETS 1:1' : '✗ BELOW 1:1'}`);
console.log(`Position: ${lots} lots | Risk: $${r2(Math.abs(maxLoss))}`);

// ═══════════════ GRAPH MEMORY — Continuous Learn + Sync ═══════════════
console.log("\n═══ GRAPH MEMORY — Sync ═══");
try {
  // Extract lessons and sync to graph
  const { execSync } = require("child_process");
  const clResult = execSync(
    `node "${path.join(ROOT, "tools", "ict_continuous_learn.cjs")}" --extract ${PAIR} ${DATE}`,
    { encoding: "utf8", timeout: 10000 }
  );
  console.log(`  Continuous learn: ${clResult.split("\n").filter(l => l.includes("Saved:") || l.includes("Lessons")).join(" | ")}`);

  // Rebuild graph with new data
  const g2 = require("./trade_graph.cjs").buildGraph();
  require("./trade_graph.cjs").saveGraph(g2);
  const t2 = Object.values(g2.nodes).filter(n => n.type === "trade").length;
  const l2 = Object.values(g2.nodes).filter(n => n.type === "lesson").length;
  console.log(`  Graph synced: ${t2} trades, ${l2} lessons`);
} catch (e) {
  console.log(`  ⚠️  Graph sync skipped: ${e.message}`);
}

// ═══════════════ EVALUATION — Quality Gates ═══════════════
let evaluationVerdict = null;
let evaluationScore = null;
let evaluationBlocked = false;
console.log("\n═══ EVALUATION — Quality Gates ═══");
try {
  const evalResult = execSync(
    `node "${path.join(ROOT, "evaluation", "run_evaluation.cjs")}" ${PAIR}`,
    { encoding: "utf8", timeout: 60000, stdio: ["ignore", "pipe", "pipe"] }
  );
  const lines = evalResult.split("\n");
  const verdictLine = lines.find(l => l.includes("VERDICT:"));
  const scoreLine = lines.find(l => l.includes("Score:"));
  if (verdictLine) { evaluationVerdict = verdictLine.split("VERDICT:")[1]?.trim() || null; console.log(`  ${verdictLine.trim()}`); }
  if (scoreLine) { evaluationScore = scoreLine.split("Score:")[1]?.trim() || null; console.log(`  ${scoreLine.trim()}`); }
  if (evalResult.includes("BLOCKED")) {
    evaluationBlocked = true;
    console.log("  ⚠️ EVALUATION BLOCKED — review before trading");
  }
} catch (e) {
  const stderr = e.stderr ? String(e.stderr).slice(0, 300) : "";
  console.log(`  ⚠️  Evaluation skipped: ${e.message} ${stderr}`);
}

// ═══════════════ DECISION EMIT — structured artifact for auto-traders ═══════════════
try {
  const decision = {
    pair: PAIR,
    symbol: pairLabel,
    date: DATE,
    emittedAt: new Date().toISOString(),
    registry: {
      verdict: registryDecision ? registryDecision.verdict : null,
      primary: primary ? primary.name : null,
      completeCount: registryDecision ? registryDecision.count : 0,
    },
    entry: {
      type: entryType,
      price: entryPrice,
      sl: slPrice,
      tp1: tp1Price,
      tp2: tp2Price,
      noDrawDir: noDrawDir || null,
      slReason: slReason || null,   // for auto_decision R:R gating (intraday vs swing)
    },
    rr: { rr1, rr2 },
    coherence: { unified: unifiedCoh, phase: effectivePhase, base: coherenceScore ?? null },
    invalidation: invalidationResult ? {
      status: invalidationResult.overallStatus,
      totalInvalidated: invalidationResult.totalInvalidated || 0,
      totalWarnings: invalidationResult.totalWarnings || 0,
    } : null,
    guard: guardContext ? {
      verdict: guardContext.verdict,
      blocked: guardContext.blocked,
      warnings: guardContext.warnings,
      sizeMultiplier: guardContext.sizeMultiplier,
      blockedIds: guardContext.guards ? guardContext.guards.filter(g => g.blocked).map(g => g.id) : [],
    } : null,
    freshness: { score: freshnessScore, label: freshnessLabel, source: priceSource, ageMin: dataAgeMin ?? null },
    risk: { allowed: riskAllowed, reason: riskBlockReason || null, accountBalance, riskAmount, sizeMultiplier },
    evaluation: { verdict: evaluationVerdict, score: evaluationScore, blocked: evaluationBlocked },
    conflicts: { legacy: conflicts.length, phase: phaseConflicts.length },
    sizing: {
      posSizeLots,
      lots,
      maxLoss: Math.abs(maxLoss),
      maxGain,
      riskPips,
      qty: qtyUnits, // units/contracts for market_order.cjs
    },
    gates: {
      hasSetup: entryType !== 'NO TRADE' && !!primary,
      rrOk: rr1 >= 1.0,
      notInvalidated: !invalidationResult || invalidationResult.overallStatus !== "INVALIDATED",
      notGuardBlocked: !guardContext || guardContext.blocked === 0,
      freshEnough: freshnessScore >= 5,
      riskAllowed: riskAllowed !== false,
    },
  };
  // Missed-Entry handler — does a still-valid idea warrant a disciplined
  // second-chance entry? (ICT lecture 19:12). Runs every pipeline cycle and
  // persists per-pair state so a missed setup is recognized across re-runs.
  try {
    const { assessMissedEntry } = require("./missed_entry.cjs");
    decision.missedEntry = assessMissedEntry(PAIR, decision);
    if (decision.missedEntry.allowSecondaryEntry) {
      const se = decision.missedEntry.secondaryEntry;
      console.log(`  🎯 SECOND CHANCE: ${se.entry} SL ${se.sl} ×${se.sizeMultiplier} (${se.array.kind} ${se.array.tf} tethered to original)`);
    }
  } catch (e) {
    console.log(`  ⚠️  Missed-entry check skipped: ${e.message}`);
  }
  const decisionPath = path.join(sharedDir, "decision.json");
  const atomicWrite = require(path.join(ROOT, "tools", "tv-mcp", "atomic_write.cjs")).atomicWrite;
  atomicWrite(decisionPath, decision);
  console.log(`  📄 Decision written: ${decisionPath}`);
} catch (e) {
  console.log(`  ⚠️  Decision emit skipped: ${e.message}`);
}
