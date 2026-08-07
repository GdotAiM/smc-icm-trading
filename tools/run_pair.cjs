// ICM Stage Runner — runs all 7 stages for a given pair
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..");
const now = new Date();
const DATE = now.toISOString().split("T")[0];
const ny = require("./ny_time.cjs");
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
try {
  const { analyzeHighPrecision } = require("./high_precision_secrets.cjs");
  const hp = analyzeHighPrecision(PAIR);
  if (hp.preSession) console.log(`  Pre-Session: ${hp.preSession.detail}`);
  console.log(`  Tethering: ${hp.tethering.detail}`);
  console.log(`  Body/Wick: ${hp.bodyWick.detail}`);
  if (hp.org) console.log(`  ORG: ${hp.org.detail}`);
  for (const g of hp.gapTypes) console.log(`  Gap: ${g.detail}`);
  console.log(`  Confidence: ${hp.confidenceAdjustment >= 0 ? '+' : ''}${hp.confidenceAdjustment} pts`);
} catch(e) { console.log(`  High Precision unavailable: ${e.message.slice(0, 80)}`); }

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
  // Try to read pre-generated macro context (from run_all_stages or manual)
  const cycleFile = path.join(ROOT, "stages", "00_macro_context", "output", "cycle_phase.md");
  const modelFilterFile = path.join(ROOT, "stages", "00_macro_context", "output", "model_filter.md");
  const dayFile = path.join(ROOT, "stages", "00_macro_context", "output", "day_context.md");

  if (fs.existsSync(cycleFile)) {
    // Parse cycle phase from markdown
    const cycleMd = fs.readFileSync(cycleFile, "utf8");
    const phaseMatch = cycleMd.match(/\*\*([A-Z]+)\*\*/); // First bold text = phase
    const mmxmMatch = cycleMd.match(/MMXM Step[* ]*: (\d)/);
    macroContext = {
      phase: phaseMatch ? phaseMatch[1] : "UNKNOWN",
      mmxmStep: mmxmMatch ? parseInt(mmxmMatch[1]) : 0,
      source: "pre-generated",
    };
    console.log(`  Cycle: ${macroContext.phase} | MMXM Step: ${macroContext.mxmStep}/4 (from Stage 00 output)`);
  } else {
    // Run macro context engine inline
    console.log(`  Generating macro context...`);
    try {
      const { execSync } = require("child_process");
      execSync(`node "${ROOT}/tools/macro_context.cjs"`, { stdio: ["ignore", "pipe", "ignore"], encoding: "utf8", timeout: 10000 });
      // Re-read after generation
      if (fs.existsSync(cycleFile)) {
        const cycleMd = fs.readFileSync(cycleFile, "utf8");
        const phaseMatch = cycleMd.match(/\*\*([A-Z]+)\*\*/);
        const mmxmMatch = cycleMd.match(/MMXM Step[* ]*: (\d)/);
        macroContext = {
          phase: phaseMatch ? phaseMatch[1] : "UNKNOWN",
          mmxmStep: mmxmMatch ? parseInt(mmxmMatch[1]) : 0,
          source: "auto-generated",
        };
        console.log(`  Cycle: ${macroContext.phase} | MMXM Step: ${macroContext.mxmStep}/4`);
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

// Determine cycle phase — try macro_context first, fall back to day-of-week estimate
let effectivePhase = macroContext ? (macroContext.phase || "UNKNOWN") : "UNKNOWN";
if (effectivePhase === "UNKNOWN") {
  try {
    const nyCheck = execSync(`node "${ROOT}/tools/ny_time.cjs" --now`, { stdio: ["ignore","pipe","ignore"], encoding: "utf8", timeout: 5000 });
    const nyData = JSON.parse(nyCheck);
    if (nyData.cycleEstimate) {
      effectivePhase = nyData.cycleEstimate;
      console.log(`  Cycle fallback: ${effectivePhase} (from day-of-week — macro_context returned UNKNOWN)`);
    }
  } catch(e) { /* ny_time.cjs may fail, use UNKNOWN */ }
}
const cycleWeights = CYCLE_MODEL_WEIGHTS[effectivePhase] || CYCLE_MODEL_WEIGHTS["UNKNOWN"];

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

// ═══ WEIGHTED BIAS — Multiple Sources, One Direction ═══
// ICT: Bias is binary — bullish or bearish. There is no third way.
// Multiple sources each vote. Higher TFs carry more weight.
// Agreement = high confidence. Disagreement = reduced confidence but still directional.

const bias1w = r1w ? r1w.structure.bias : null;
const bias1d = r1d.structure.bias;
const bias4h = r4h.structure.bias;
const bias1h = r1h.structure.bias;
const biasWeeklyProfile = weeklyProfile?.classification?.direction === "BULLISH" ? "bullish" : weeklyProfile?.classification?.direction === "BEARISH" ? "bearish" : null;
const biasOneTrade = oneTradeSetup?.dailyBias?.bias || null;

// Weighted vote: bullish = +1, bearish = -1
const votes = [
  { source: "1W", bias: bias1w, weight: 3 },
  { source: "1D", bias: bias1d, weight: 2.5 },
  { source: "4H", bias: bias4h, weight: 2 },
  { source: "1H", bias: bias1h, weight: 0.5 },
  { source: "Weekly Profile", bias: biasWeeklyProfile, weight: 1.5 },
  { source: "One Trade", bias: biasOneTrade, weight: 1 },
];

let bullishWeight = 0, bearishWeight = 0, totalWeight = 0;
const voteDetails = [];
for (const v of votes) {
  if (!v.bias || v.bias === "neutral") continue;
  totalWeight += v.weight;
  if (v.bias === "bullish") { bullishWeight += v.weight; voteDetails.push(`${v.source}:🟢`); }
  else if (v.bias === "bearish") { bearishWeight += v.weight; voteDetails.push(`${v.source}:🔴`); }
}

const weightedBias = bullishWeight > bearishWeight ? "bullish" : bearishWeight > bullishWeight ? "bearish" : "neutral";
const biasConfidence = totalWeight > 0 ? Math.round((Math.max(bullishWeight, bearishWeight) / totalWeight) * 100) : 0;
const biasAgreement = biasConfidence >= 80 ? "STRONG" : biasConfidence >= 60 ? "MODERATE" : "WEAK";

console.log(`  🎯 Weighted Bias: ${weightedBias.toUpperCase()} (${biasConfidence}% — ${biasAgreement}) | Votes: ${voteDetails.join(' ')} | Bull:${bullishWeight.toFixed(1)} Bear:${bearishWeight.toFixed(1)}`);
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
const obs = [...(r1d.orderBlocks || []), ...(r4h.orderBlocks || []), ...(r1h.orderBlocks || [])];
const fvgs = [...(r1d.fvgs || []), ...(r4h.fvgs || []), ...(r1h.fvgs || [])];
const uniqueOBs = obs.filter((o, i, arr) => arr.findIndex(x => r5(x.proximal) === r5(o.proximal)) === i);

writeMd("02_key_levels", "levels.md", `# Key Levels — ${pairLabel} — ${DATE}

## Bias Reminder — **${bias1d.toUpperCase()}**

## Liquidity Pools (${pools.length} on 4H)
| Type | Price | Role | Touches | Score | Distance | Swept |
|------|-------|------|---------|-------|----------|-------|
${pools.slice(0, 8).map(p => `| ${p.type} | ${r5(p.price)} | ${p.type === 'BSL' ? 'Resistance' : 'Support'} | ${p.strength} | ${r2(p.score)} | ${r2(p.distance)}% | ${p.swept ? '⚡' : 'Active'} |`).join("\n")}

## Order Blocks (${uniqueOBs.length} across 1D/4H/1H)
${uniqueOBs.length > 0 ? `| Type | Proximal | Distal | Impulse | FVG | TF |
|------|----------|--------|---------|-----|-----|
${uniqueOBs.map(ob => `| ${ob.type} ${ob.kind || 'OB'} | ${r5(ob.proximal)} | ${r5(ob.distal)} | ${r2(ob.impulseAtr || 0)}x | ${ob.hasFvg ? '✓' : '—'} | — |`).join("\n")}` : '| None detected | — | — | — | — | — |'}

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
  console.log(`  IRL: ${irlErlResult.irl.count} FVGs inside range (${irlErlResult.irl.unfilled} unfilled, ${irlErlResult.irl.filled} filled)`);
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
  londonPM:  { label: "London PM", char: "European distribution / pre-NY", kz: true },
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

// ═══════════════ INDUCEMENT PRE-CHECK (before model scoring) ═══════════════
// ICT: "Do not enter until inducement is swept." Check gate FIRST.
// If gate is closed, skip model scoring — no point scoring setups that can't be entered.
let inducementBlocked = false;
try {
  const { runInducementCheck } = require("./inducement_engine.cjs");
  const preInducement = runInducementCheck(PAIR);
  console.log(`\n═══ INDUCEMENT PRE-CHECK ═══`);
  console.log(`  ${preInducement.gate.reason}`);
  if (!preInducement.gate.open) {
    inducementBlocked = true;
    console.log(`  🛑 GATE CLOSED — skipping model scoring. No entry possible until inducement swept.`);
  }
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
const currentPhase = macroContext?.phase || "UNKNOWN";
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

// ═══════════════ PERFORMANCE WEIGHTS ═══════════════
// Load model/session/pair performance stats from trade history
let perfWeights = {}; // { "Silver Bullet": 1.3, "Turtle Soup": 0.8, ... }
try {
  const perfOutput = execSync(`node "${ROOT}/tools/performance_ledger.cjs"`, {
    stdio: ["ignore", "pipe", "ignore"], encoding: "utf8", timeout: 10000
  });
  const perfData = JSON.parse(perfOutput);
  perfWeights = perfData.modelWeights || {};
  if (Object.keys(perfWeights).length > 0) {
    console.log(`  📊 Performance: ${perfData.totalTrades || 0} trades | Edge: ${perfData.edgeScore || 0}/100 | Top model: ${perfData.topModel || 'N/A'}`);
  }
} catch(e) { console.log(`  Performance ledger unavailable — using neutral weights`); }

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
  { name: "Mitigation Block", score: (obs.filter(o => (o.mitigationFraction || 0) > 0.3 && (o.mitigationFraction || 0) < 0.7).length * 3) + (bias1d !== 'neutral' ? 1 : 0), max: 4 },
  { name: "Rejection Block", score: (hasOB ? 2 : 0) + (r1h && r1h.volumeDisplacement && r1h.volumeDisplacement.atrRatio > 0.8 ? 1 : 0) + (bias1d !== 'neutral' ? 1 : 0), max: 4 },
  { name: "London Hunt + IFVG", score: (lecture2?.setupReady ? 4 : 0) + (lecture2?.hunt?.active ? 2 : 0) + (lecture2?.direction && ((lecture2.direction === 'BUY' && bias1d === 'bullish') || (lecture2.direction === 'SELL' && bias1d === 'bearish')) ? 2 : 0) + (smtDetected ? 1 : 0) + (cisdDetected ? 1 : 0), max: 10 },
  { name: "NDOG/NWOG News Model", score: (lecture4?.setupReady ? 4 : 0) + (lecture4?.gapClusters?.hasGaps || lecture4?.substituteGap ? 2 : 0) + (lecture4?.gapDraw?.drawing ? 2 : 0) + (lecture4?.mss?.confirmed ? 1 : 0) + (lecture4?.inNewsWindow ? 1 : 0), max: 10 },
  { name: "08:30 Liquidity Raid Model", score: (lecture1?.setupReady ? 4 : 0) + (lecture1?.formation?.formed ? 2 : 0) + (lecture1?.raid?.active ? 2 : 0) + (lecture1?.mss?.confirmed ? 1 : 0) + (lecture1?.pdArrays?.length >= 2 ? 1 : 0), max: 10 },
];
// Apply cycle-aware weighting from Stage 00 + performance weights from trade history
models.forEach(m => {
  const cycleWeight = cycleWeights[m.name] || 1.0;
  const perfWeight = perfWeights[m.name] || 1.0; // From performance ledger (neutral if <5 trades)
  m.structuralScore = m.score; // preserve original
  m.cycleMultiplier = cycleWeight;
  m.perfMultiplier = perfWeight;
  // Killzone session multiplier (NY-local): London/NY AM = 1.0, NY PM = 0.8, Asia = 0.5, NY Lunch/Close = 0.4, Off = 0.3
  const sessionMultiplier = (NY_SESSION.name === "london" || NY_SESSION.name === "londonPM" || NY_SESSION.name === "nyAM") ? 1.0 :
                            NY_SESSION.name === "nyPM" ? 0.8 :
                            NY_SESSION.name === "asia" || NY_SESSION.name === "asiaLate" ? 0.5 :
                            NY_SESSION.name === "nyLunch" ? 0.4 :
                            NY_SESSION.name === "nyClose" ? 0.4 :
                            NY_SESSION.name === "offHours" ? 0.3 : 0.7;
  m.sessionMultiplier = sessionMultiplier;
  m.score = Math.round(m.score * cycleWeight * perfWeight * sessionMultiplier * 10) / 10;
  m.max = Math.round(m.max * Math.max(cycleWeight, 1.0) * Math.max(perfWeight, 1.0) * 10) / 10;

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
  // All models trade in the direction of the 1D bias — the single authority.
  const modelDirection = weightedBias === "bullish" ? "BUY" : weightedBias === "bearish" ? "SELL" : null;

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
});

// ═══ INDUCEMENT GATE: Zero all scores if gate is closed ═══
if (inducementBlocked) {
  models.forEach(m => { m.score = 0; m.inducementBlocked = true; });
}

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
const primary = models[0];

writeMd("04_model_selection", "active_models.md", `# Model Selection — ${pairLabel} — ${DATE}

## Market Context
- Bias: **${bias1d.toUpperCase()}** (1D/4H)
- Session: ${session} (${gate})
- **Cycle Phase**: ${effectivePhase} | **MMXM Step**: ${macroContext ? macroContext.mxmStep + '/4' : 'N/A'}
- Levels: ${uniqueOBs.length} OBs | ${fvgs.length} FVGs | ${pools.length} pools
- Sweeps: ${hasSweep ? 'Yes — liquidity sweep detected' : 'None'}

## Model Scores (Cycle-Weighted)

| Model | Structural | Cycle × | Perf × | Po3 | Final | Status |
|-------|-----------|---------|-----|-------|--------|
${models.map(m => `| ${m.name} | ${m.structuralScore}/${m.max.toFixed(0)} | ×${r2(m.cycleMultiplier)} | ×${r2(m.perfMultiplier||1.0)} | ${m.po3Blocked ? '⚠️ BLOCKED' : '✅'} | **${r2(m.score)}** | ${m === primary ? '★ PRIMARY' : m.score >= 3 ? 'Alternative' : 'Rejected'} |`).join("\n")}

${models.filter(m => m.po3Blocked).map(m => `⚠️ **${m.name}**: ${m.po3BlockReason}`).join('\n\n')}

## Primary: ${primary.name} (${r2(primary.score)} — structural ${primary.structuralScore} × cycle ${r2(primary.cycleMultiplier)} × perf ${r2(primary.perfMultiplier||1.0)})
${smtDetected ? `**SMT**: ✅ ${smtDetails}` : '**SMT**: ⚠️ Not detected — check correlated pairs manually'}

## Conflict Check
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
| **Total** | **${primary.score}/${primary.max}** | |
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

// ═══════════════ INDUCEMENT GATE STATUS (checked before Stage 04) ═══════════════
console.log(`\n═══ INDUCEMENT GATE: ${inducementBlocked ? '🛑 CLOSED' : '✅ OPEN'} ═══`);

// ═══════════════ STAGE 05 — Entry Refinement ═══════════════
console.log("\n═══ STAGE 05 — Entry Refinement ═══");
const atrValue = Math.abs((r4h.structure.lastSwingHigh || entryPrice + 0.003) - (r4h.structure.lastSwingLow || entryPrice - 0.003)) * 0.15;

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

if (weightedBias === 'bearish') {
  entryType = 'SHORT';
  const swingHigh = r4h.structure.lastSwingHigh || r1d.structure.lastSwingHigh || (entryPrice + 0.003);
  slPrice = swingHigh + atrValue;
  slReason = `4H Swing High @ ${r5(swingHigh)} + ATR buffer`;
  const slDist = Math.abs(entryPrice - slPrice);
  const sslPools = pools.filter(p => p.type === 'SSL' && p.price < entryPrice && (entryPrice - p.price) >= slDist).sort((a, b) => a.price - b.price);
  if (sslPools.length > 0) {
    tp1Price = sslPools[0].price;
    tp1Reason = `SSL pool @ ${r5(tp1Price)} (≥ SL distance)`;
  } else {
    tp1Price = entryPrice - slDist;
    tp1Reason = `1:1 measured move (${toPips(slDist)} ${pipLabel()})`;
  }
  const tp1Dist = Math.abs(entryPrice - tp1Price);
  tp2Price = entryPrice - tp1Dist * 2;
  tp2Reason = `2:1 measured move (${toPips(tp1Dist * 2)} ${pipLabel()})`;
} else if (weightedBias === 'bullish') {
  entryType = 'LONG';
  const swingLow = r4h.structure.lastSwingLow || r1d.structure.lastSwingLow || (entryPrice - 0.003);
  slPrice = swingLow - atrValue;
  slReason = `4H Swing Low @ ${r5(swingLow)} - ATR buffer`;
  const slDist = Math.abs(entryPrice - slPrice);
  const bslPools = pools.filter(p => p.type === 'BSL' && p.price > entryPrice && (p.price - entryPrice) >= slDist).sort((a, b) => a.price - b.price);
  if (bslPools.length > 0) {
    tp1Price = bslPools[0].price;
    tp1Reason = `BSL pool @ ${r5(tp1Price)} (≥ SL distance)`;
  } else {
    tp1Price = entryPrice + slDist;
    tp1Reason = `1:1 measured move (${toPips(slDist)} ${pipLabel()})`;
  }
  const tp1Dist = Math.abs(entryPrice - tp1Price);
  tp2Price = entryPrice + tp1Dist * 2;
  tp2Reason = `2:1 measured move (${toPips(tp1Dist * 2)} ${pipLabel()})`;
} else {
  entryType = 'NO TRADE'; slPrice = 0; tp1Price = 0; tp2Price = 0;
  slReason = ''; tp1Reason = ''; tp2Reason = '';
}

// ═══ SILVER BULLET SCALP OVERRIDE — Tighter SL/TP for SB window ═══
// During Silver Bullet windows, use 15m/1H levels instead of 4H/1D swing levels.
// This is a SCALP, not a swing trade. SL must be tight enough for valid R:R.
if (primary.name === "Silver Bullet" && inSBWindow && entryType !== 'NO TRADE') {
  const r15mSwing = r15m?.structure?.lastSwingHigh || r1h?.structure?.lastSwingHigh;
  const r15mSwingLow = r15m?.structure?.lastSwingLow || r1h?.structure?.lastSwingLow;
  const sbAtr = Math.abs((r15mSwing || entryPrice) - (r15mSwingLow || entryPrice)) * 0.1;

  if (entryType === 'SHORT') {
    const sbSL = (r15mSwing || (entryPrice + sbAtr * 2)) + sbAtr;
    slPrice = sbSL;
    slReason = `SB Scalp: 15m/1H Swing High @ ${r5(r15mSwing || 0)} + ATR`;
    const sbRisk = Math.abs(entryPrice - slPrice);
    const sbPools = pools.filter(p => p.type === 'SSL' && p.price < entryPrice).sort((a, b) => a.price - b.price);
    if (sbPools.length > 0 && Math.abs(entryPrice - sbPools[0].price) >= sbRisk * 0.5) {
      tp1Price = sbPools[0].price;
      tp1Reason = `SB Scalp: SSL pool @ ${r5(tp1Price)}`;
    } else {
      tp1Price = entryPrice - sbRisk;
      tp1Reason = `SB Scalp: 1:1 (${toPips(sbRisk)} ${pipLabel()})`;
    }
    tp2Price = entryPrice - sbRisk * 2;
    tp2Reason = `SB Scalp: 2:1 (${toPips(sbRisk * 2)} ${pipLabel()})`;
  } else {
    const sbSL = (r15mSwingLow || (entryPrice - sbAtr * 2)) - sbAtr;
    slPrice = sbSL;
    slReason = `SB Scalp: 15m/1H Swing Low @ ${r5(r15mSwingLow || 0)} - ATR`;
    const sbRisk = Math.abs(entryPrice - slPrice);
    const sbPools = pools.filter(p => p.type === 'BSL' && p.price > entryPrice).sort((a, b) => a.price - b.price);
    if (sbPools.length > 0 && Math.abs(sbPools[0].price - entryPrice) >= sbRisk * 0.5) {
      tp1Price = sbPools[0].price;
      tp1Reason = `SB Scalp: BSL pool @ ${r5(tp1Price)}`;
    } else {
      tp1Price = entryPrice + sbRisk;
      tp1Reason = `SB Scalp: 1:1 (${toPips(sbRisk)} ${pipLabel()})`;
    }
    tp2Price = entryPrice + sbRisk * 2;
    tp2Reason = `SB Scalp: 2:1 (${toPips(sbRisk * 2)} ${pipLabel()})`;
  }
  console.log(`  ⚡ SB Scalp SL/TP: SL ${r5(slPrice)} | TP1 ${r5(tp1Price)} | Risk ${toPips(Math.abs(entryPrice-slPrice))} ${pipLabel()}`);
}

// ═══ INDUCEMENT GATE OVERRIDE — Force NO TRADE if inducement not swept ═══
if (inducementBlocked) {
  entryType = 'NO TRADE';
  slPrice = 0; tp1Price = 0; tp2Price = 0;
  slReason = `🛑 Inducement not swept — entry gate closed at pre-check`;
  tp1Reason = ''; tp2Reason = '';
  console.log(`  🛑 Inducement Gate: Entry blocked — inducement must be swept before any entry.`);
}

// ═══ LECTURE 2 OVERRIDE — Use post-hunt swing SL + IFVG CE entry ═══
let lecture2Override = false;
if (lecture2?.setupReady && primary.name === "London Hunt + IFVG") {
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
    // Use Fib targets if available, otherwise 1:1 / 2:1
    if (lecture2.fibTargets) {
      tp1Price = lecture2.fibTargets.tp1;
      tp1Reason = `Fib ${lecture2.fibTargets.tp1Label} @ ${r5(tp1Price)}`;
      tp2Price = lecture2.fibTargets.tp2;
      tp2Reason = `Fib ${lecture2.fibTargets.tp2Label} @ ${r5(tp2Price)}`;
    } else {
      const l2Risk = Math.abs(entryPrice - slPrice);
      if (entryType === 'BUY') {
        tp1Price = entryPrice + l2Risk;
        tp1Reason = `1:1 from entry (${toPips(l2Risk)} ${pipLabel()})`;
        tp2Price = entryPrice + l2Risk * 2;
        tp2Reason = `2:1 from entry (${toPips(l2Risk * 2)} ${pipLabel()})`;
      } else {
        tp1Price = entryPrice - l2Risk;
        tp1Reason = `1:1 from entry (${toPips(l2Risk)} ${pipLabel()})`;
        tp2Price = entryPrice - l2Risk * 2;
        tp2Reason = `2:1 from entry (${toPips(l2Risk * 2)} ${pipLabel()})`;
      }
    }
    const source = lecture2.ifvg?.found ? 'IFVG CE' : 'Breaker';
    console.log(`  📐 Lecture 2 Override (${source}): Entry ${r5(prevEntry)}→${r5(entryPrice)} | SL ${r5(prevSL)}→${r5(slPrice)} | Dir: ${entryType}`);
  }
}

// ═══ LECTURE 1 OVERRIDE — Use first-tagged PD array entry + post-08:30 range SL ═══
let lecture1Override = false;
if (!lecture2Override && lecture1?.setupReady && primary.name === "08:30 Liquidity Raid Model") {
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
      const l1Risk = Math.abs(entryPrice - slPrice);
      if (entryType === 'BUY') {
        tp1Price = entryPrice + l1Risk;
        tp1Reason = `1:1 from entry (${toPips(l1Risk)} ${pipLabel()})`;
        tp2Price = entryPrice + l1Risk * 2;
        tp2Reason = `2:1 from entry (${toPips(l1Risk * 2)} ${pipLabel()})`;
      } else {
        tp1Price = entryPrice - l1Risk;
        tp1Reason = `1:1 from entry (${toPips(l1Risk)} ${pipLabel()})`;
        tp2Price = entryPrice - l1Risk * 2;
        tp2Reason = `2:1 from entry (${toPips(l1Risk * 2)} ${pipLabel()})`;
      }
    }
    console.log(`  📐 Lecture 1 Override (${lecture1.entrySource || 'PD Array'}): Entry ${r5(prevEntry)}→${r5(entryPrice)} | SL ${r5(prevSL)}→${r5(slPrice)} | Dir: ${entryType}`);
  }
}

// ═══ LECTURE 4 OVERRIDE — Use gap-based entry + post-MSS SL + gap TP ═══
let lecture4Override = false;
if (!lecture2Override && !lecture1Override && lecture4?.setupReady && primary.name === "NDOG/NWOG News Model") {
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
      // Fallback: 1:1 / 2:1 from entry
      const l4Risk = Math.abs(entryPrice - slPrice);
      if (entryType === 'BUY') {
        tp1Price = entryPrice + l4Risk;
        tp1Reason = `1:1 from entry (${toPips(l4Risk)} ${pipLabel()})`;
        tp2Price = entryPrice + l4Risk * 2;
        tp2Reason = `2:1 from entry (${toPips(l4Risk * 2)} ${pipLabel()})`;
      } else {
        tp1Price = entryPrice - l4Risk;
        tp1Reason = `1:1 from entry (${toPips(l4Risk)} ${pipLabel()})`;
        tp2Price = entryPrice - l4Risk * 2;
        tp2Reason = `2:1 from entry (${toPips(l4Risk * 2)} ${pipLabel()})`;
      }
    }
    const l4source = lecture4.entry?.source || 'Gap entry';
    console.log(`  📐 Lecture 4 Override (${l4source}): Entry ${r5(prevEntry)}→${r5(entryPrice)} | SL ${r5(prevSL)}→${r5(slPrice)} | Dir: ${entryType}`);
  }
}

// ═══ IOFED PYRAMID — 3-Level FVG Entry Drill ═══
// ICT: Enter at FVG edge (starter) → CE 50% (add) → Far edge (add)
// "Many setups reverse from the very edge without retracing to the 50% level."
let iofedPyramid = null;
const iofedDirection = weightedBias === 'bearish' ? 'SHORT' : weightedBias === 'bullish' ? 'LONG' : 'NO TRADE';
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

const risk = Math.abs(entryPrice - slPrice);
const reward1 = Math.abs(tp1Price - entryPrice);
const reward2 = Math.abs(tp2Price - entryPrice);
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

## Model: **${primary.name}** (${primary.score}/${primary.max})
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
| TP2 | ${r5(tp2Price)} | ${reward2Pips} ${pipLabelStr} | ${tp2Reason} |

## Risk-Reward
- **R:R TP1**: ${r2(rr1)}:1 ${rr1 >= 1.0 ? '✅' : '✗ Below 1:1'}
${iofedPyramid ? `
## IOFED Pyramid Entry (${iofedPyramid.fvgType} FVG)
| Level | Price | Size | Risk | R:R | Notes |
|-------|-------|------|------|-----|-------|
| 🥇 Starter | ${r5(iofedPyramid.starter.price)} | ${iofedPyramid.starter.size} | ${toPips(Math.abs(iofedPyramid.starter.price - iofedPyramid.slPrice))} ${pipLabelStr} | ${r2(Math.abs(iofedPyramid.tpPrice - iofedPyramid.starter.price) / Math.abs(iofedPyramid.starter.price - iofedPyramid.slPrice))}:1 | ${iofedPyramid.starter.label} |
| 🥈 Add #1 | ${r5(iofedPyramid.add1.price)} | ${iofedPyramid.add1.size} | ${toPips(Math.abs(iofedPyramid.add1.price - iofedPyramid.slPrice))} ${pipLabelStr} | ${r2(Math.abs(iofedPyramid.tpPrice - iofedPyramid.add1.price) / Math.abs(iofedPyramid.add1.price - iofedPyramid.slPrice))}:1 | ${iofedPyramid.add1.label} |
| 🥉 Add #2 | ${r5(iofedPyramid.add2.price)} | ${iofedPyramid.add2.size} | ${toPips(Math.abs(iofedPyramid.add2.price - iofedPyramid.slPrice))} ${pipLabelStr} | ${r2(Math.abs(iofedPyramid.tpPrice - iofedPyramid.add2.price) / Math.abs(iofedPyramid.add2.price - iofedPyramid.slPrice))}:1 | ${iofedPyramid.add2.label} |
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
| **Model** | ${primary.name} (${primary.score}/${primary.max}) |
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
| Model | ${primary.score >= 5 ? 4 : 3} |
| R:R | ${rr1 >= 1.0 ? 4 : 2} |
| **Overall** | **${r2(((bias1w === bias1d ? 4 : 3) + (hasOB || hasFVG ? 4 : 2) + (primary.score >= 5 ? 4 : 3) + (rr1 >= 1.0 ? 4 : 2)) / 4)}/5** |

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
console.log(`Model: ${primary.name} (${r2(primary.score)}/${primary.max.toFixed(0)}) — ${models.length} models scored`);
if (conflicts.length > 0) console.log(`⚠️  Conflicts: ${conflicts.length} mutual exclusivity issue(s) detected`);
if (phaseConflicts.length > 0) console.log(`⚠️  Phase conflicts: ${phaseConflicts.length} model(s) inappropriate for ${effectivePhase} phase`);
console.log(`Entry: ${entryType} @ ${r5(entryPrice)}`);
console.log(`SL: ${r5(slPrice)} | TP1: ${r5(tp1Price)} | TP2: ${r5(tp2Price)}`);
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
