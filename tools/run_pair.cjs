// ICM Stage Runner — runs all 7 stages for a given pair
const fs = require("fs");
const path = require("path");

const ROOT = "C:\\Users\\cash\\smc-icm-trading";
const now = new Date();
const DATE = now.toISOString().split("T")[0];
const UTC_HOUR = now.getUTCHours();

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
      execSync(`node "${ROOT}\\tools\\macro_context.cjs"`, { stdio: ["ignore", "pipe", "ignore"], encoding: "utf8", timeout: 10000 });
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

// Cycle weights for model scoring
const CYCLE_MODEL_WEIGHTS = {
  ACCUMULATION: { "2022 Model (MMXM)": 0.3, "Silver Bullet": 0.3, "OTE + Institutional OB": 0.3, "Turtle Soup": 0.3, "Breaker Block": 1.0, "Unicorn (OTE + FVG)": 0.3, "SCOB": 0.3, "2FVG Entry": 0.3, "Judas Swing": 1.3, "Asian Range Breakout": 1.3, "NWOG/NDOG": 1.3 },
  MANIPULATION: { "2022 Model (MMXM)": 1.0, "Silver Bullet": 1.3, "OTE + Institutional OB": 1.0, "Turtle Soup": 1.3, "Breaker Block": 1.3, "Unicorn (OTE + FVG)": 0.3, "SCOB": 0.5, "2FVG Entry": 0.3, "Judas Swing": 1.3, "Asian Range Breakout": 0.5, "NWOG/NDOG": 0.3 },
  DISTRIBUTION: { "2022 Model (MMXM)": 1.4, "Silver Bullet": 1.1, "OTE + Institutional OB": 1.4, "Turtle Soup": 0.3, "Breaker Block": 0.5, "Unicorn (OTE + FVG)": 1.4, "SCOB": 1.4, "2FVG Entry": 1.1, "Judas Swing": 0.3, "Asian Range Breakout": 0.3, "NWOG/NDOG": 0.3 },
  EXPANSION:    { "2022 Model (MMXM)": 1.0, "Silver Bullet": 1.2, "OTE + Institutional OB": 1.0, "Turtle Soup": 0.3, "Breaker Block": 0.3, "Unicorn (OTE + FVG)": 1.0, "SCOB": 0.5, "2FVG Entry": 1.2, "Judas Swing": 0.3, "Asian Range Breakout": 0.3, "NWOG/NDOG": 0.3 },
  UNKNOWN:      { "2022 Model (MMXM)": 1.0, "Silver Bullet": 1.0, "OTE + Institutional OB": 1.0, "Turtle Soup": 1.0, "Breaker Block": 1.0, "Unicorn (OTE + FVG)": 1.0, "SCOB": 1.0, "2FVG Entry": 1.0, "Judas Swing": 1.0, "Asian Range Breakout": 1.0, "NWOG/NDOG": 1.0 },
};

const cycleWeights = macroContext ? (CYCLE_MODEL_WEIGHTS[macroContext.phase] || CYCLE_MODEL_WEIGHTS["UNKNOWN"]) : CYCLE_MODEL_WEIGHTS["UNKNOWN"];

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

// ═══════════════ LIVE STRUCTURE CHECK ═══════════════
console.log("\n═══ LIVE STRUCTURE CHECK ═══");
try {
  const { execSync } = require("child_process");
  for (const tf of ["4h", "1h"]) {
    const liveOutput = execSync(`node "${ROOT}\\tools\\tv-mcp\\check_live_structure.cjs" --pair ${PAIR} --tf ${tf} --date ${DATE}`, {
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
    const slOutput = execSync(`node "${ROOT}\\tools\\tv-mcp\\check_sl.cjs" --pair ${PAIR} --trades '${JSON.stringify(trades)}'`, {
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
  const f5mOutput = fexec(`python "${ROOT}\\tools\\forecast.py" --input "${sharedDir}\\candles_5m.json" --pred-len 24 --samples 20 --output "${sharedDir}\\forecast_5m.json"`, {
    stdio: ["ignore", "pipe", "ignore"], encoding: "utf8", timeout: 15000
  });
  forecastContext.f5m = JSON.parse(fs.readFileSync(`${sharedDir}\\forecast_5m.json`, "utf8"));
  console.log(`  5m: ${forecastContext.f5m.direction} | ${r5(forecastContext.f5m.current_price)} → ${r5(forecastContext.f5m.median_path[forecastContext.f5m.median_path.length-1])} (${toPips(forecastContext.f5m.median_path[forecastContext.f5m.median_path.length-1] - forecastContext.f5m.current_price)} ${pipLabel()})`);
} catch(e) { console.log(`  5m forecast unavailable`); }

try {
  const { execSync: fexec2 } = require("child_process");
  const f1mOutput = fexec2(`python "${ROOT}\\tools\\forecast.py" --input "${sharedDir}\\candles_1m.json" --pred-len 48 --samples 20 --output "${sharedDir}\\forecast_1m.json"`, {
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
} catch(e) { console.log(`  Intraday profile unavailable`); }

// ── Run Tier 1 (SMT+Fib+ATR+BPR+Po3) ───────────────────────
let tier1Context = null;
try {
  const tier1Output = execSync(`node "${ROOT}\\tools\\tier1.cjs" ${PAIR}`, {
    stdio: ["ignore", "pipe", "ignore"], encoding: "utf8", timeout: 20000
  });
  tier1Context = JSON.parse(tier1Output);
  if (tier1Context.smt) console.log(`  SMT: ${tier1Context.smt.detected ? '✅ ' + tier1Context.smt.type : '✗ Not detected'} | Fib: ${tier1Context.fib4h?.inOTE ? '✅ OTE' : '✗'} | BPR: ${tier1Context.bpr.detected ? '✅' : '✗'} | ATR SL: ${tier1Context.atrSL.slPips} ${pairLabel === 'XAUUSD' ? 'pts' : 'pips'} | Po3: ${tier1Context.po3.state}`);
  if (tier1Context.fibConfluence) console.log(`  Fib Confluence: ${tier1Context.fibConfluence.clusters} cluster(s)`);
} catch(e) { console.log(`  Tier 1 unavailable`); }

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
} catch(e) { console.log(`  Guard unavailable`); }

// ── Run IPDA Lens (NEW) ──────────────────────────────────────
let ipdaContext = null;
try {
  const { execSync } = require("child_process");
  const ipdaOutput = execSync(`node "${ROOT}\\tools\\ipda.cjs" ${PAIR}`, {
    stdio: ["ignore", "pipe", "ignore"], encoding: "utf8", timeout: 15000
  });
  ipdaContext = JSON.parse(ipdaOutput);
  if (ipdaContext.draw) {
    console.log(`  IPDA: ${ipdaContext.draw.consensus} (${ipdaContext.draw.strength}) | Draw: ${ipdaContext.draw.direction}`);
    console.log(`  EQ Cascade: ${ipdaContext.equilibriumCascade.map(c => c.tf + '@' + c.eq).join(' → ')}`);
    console.log(`  AMD: ${ipdaContext.amd.position}`);
  }
} catch(e) { console.log(`  IPDA unavailable`); }

const bias1w = r1w ? r1w.structure.bias : "N/A";
const bias1d = r1d.structure.bias;
const bias4h = r4h.structure.bias;
const bias1h = r1h.structure.bias;
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

// ═══════════════ STAGE 03 — Session ═══════════════
console.log("═══ STAGE 03 — Session ═══");
let session, char;
if (UTC_HOUR >= 0 && UTC_HOUR < 7) { session = "Asia"; char = "Accumulation"; }
else if (UTC_HOUR >= 7 && UTC_HOUR < 12) { session = "London"; char = "Institutional flow"; }
else if (UTC_HOUR >= 12 && UTC_HOUR < 16) { session = "NY AM"; char = "High volume"; }
else if (UTC_HOUR >= 16 && UTC_HOUR < 21) { session = "NY PM"; char = "Late session"; }
else { session = "Off"; char = "Low liquidity"; }
const inKZ = session === "London" || session === "NY AM";
const gate = (bias1d !== "neutral" && inKZ) ? "ACTIVE" : inKZ ? "MONITOR" : "NO TRADE";

writeMd("03_session_time", "session.md", `# Session Analysis — ${pairLabel} — ${DATE} ${String(UTC_HOUR).padStart(2,'0')}:00 UTC

## Current Session
- **Session**: ${session} | Killzone: ${inKZ ? '✅ ACTIVE' : 'Inactive'}
- **Character**: ${char}
- **Gate**: **${gate}**

## Silver Bullet
| Window | UTC | Status |
|--------|-----|--------|
| London SB | 08-10 | ${UTC_HOUR >= 8 && UTC_HOUR < 10 ? '✅' : '—'} |
| NY AM SB | 13-15 | ${UTC_HOUR >= 13 && UTC_HOUR < 15 ? '✅' : '—'} |
| NY PM SB | 17-19 | ${UTC_HOUR >= 17 && UTC_HOUR < 19 ? '✅' : '—'} |

## Alignment
- Bias: **${bias1d}** | Session: ${session}
- ${bias1d !== 'neutral' && inKZ ? '✅ ALIGNED — Active killzone with directional bias' : '⚠️ NOT ALIGNED'}
`);

// ═══════════════ STAGE 04 — Model Selection ═══════════════
console.log("═══ STAGE 04 — Model Selection ═══");
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

const models = [
  { name: "MMXM Sell Model", score: (bias1d === 'bearish' ? 3 : 0) + (hasOB ? 2 : 0) + (hasSweep ? 2 : 0) + (smtDetected ? 1 : 0) + (cisdDetected ? 1 : 0), max: 9 },
  { name: "MMXM Buy Model", score: (bias1d === 'bullish' ? 3 : 0) + (hasOB ? 2 : 0) + (hasSweep ? 2 : 0) + (smtDetected ? 1 : 0) + (cisdDetected ? 1 : 0), max: 9 },
  { name: "Silver Bullet", score: ((UTC_HOUR >= 8 && UTC_HOUR < 10) || (UTC_HOUR >= 13 && UTC_HOUR < 15) || (UTC_HOUR >= 17 && UTC_HOUR < 19) ? 3 : 0) + (bias1d !== 'neutral' && inKZ ? 2 : 0) + (hasFVG ? 2 : 0) + (smtDetected ? 1 : 0) + (cisdDetected ? 1 : 0), max: 9 },
  { name: "OTE + Institutional OB", score: (hasOB ? 3 : 0) + (inOTEZoneSimple ? 2 : 0) + (bias1d !== 'neutral' ? 2 : 0) + (smtDetected ? 1 : 0), max: 8 },
  { name: "Turtle Soup", score: (hasSweep ? 3 : 0) + (nearSSL && nearSSL.swept ? 2 : 0) + (bias1d !== 'neutral' ? 1 : 0) + (smtDetected ? 1 : 0), max: 7 },
  { name: "Unicorn (OTE+FVG)", score: (hasOB ? 2 : 0) + (hasFVG ? 3 : 0) + (inOTEZoneSimple ? 2 : 0) + (smtDetected ? 1 : 0), max: 8 },
  { name: "Breaker Block", score: (obs.filter(o => o.kind === 'Breaker').length * 3) + (hasFVG ? 1 : 0) + (smtDetected ? 1 : 0), max: 7 },
];
// Apply cycle-aware weighting from Stage 00
models.forEach(m => {
  const cycleWeight = cycleWeights[m.name] || 1.0;
  m.structuralScore = m.score; // preserve original
  m.score = Math.round(m.score * cycleWeight * 10) / 10; // apply cycle weight
  m.cycleMultiplier = cycleWeight;
  m.max = Math.round(m.max * Math.max(cycleWeight, 1.0) * 10) / 10;

  // PRIORITY 1: Po3 Phase Filter — zero out models outside their phase
  if (!isPhaseValid(m.name)) {
    m.po3Blocked = true;
    m.po3BlockReason = `${m.name} requires ${(PO3_MODEL_PHASE_MAP[m.name]||[]).join('/')} phase, but we are in ${currentPhase}`;
    m.score = Math.round(m.score * 0.3 * 10) / 10; // Reduce score by 70% instead of zeroing (ICT allows exceptions with strong confluence)
  } else {
    m.po3Blocked = false;
  }
});
models.sort((a, b) => b.score - a.score);

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
    ACCUMULATION: ["2022 Model (MMXM)", "2FVG Entry", "Silver Bullet"],
    MANIPULATION: ["Unicorn (OTE+FVG)", "2FVG Entry", "NWOG/NDOG"],
    DISTRIBUTION: ["Asian Range Breakout", "NWOG/NDOG", "Turtle Soup"],
    EXPANSION: ["Asian Range Breakout", "NWOG/NDOG", "Turtle Soup", "Breaker Block"],
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
const phaseConflicts = detectPhaseConflicts(models, macroContext ? macroContext.phase : "UNKNOWN");
const primary = models[0];

writeMd("04_model_selection", "active_models.md", `# Model Selection — ${pairLabel} — ${DATE}

## Market Context
- Bias: **${bias1d.toUpperCase()}** (1D/4H)
- Session: ${session} (${gate})
- **Cycle Phase**: ${macroContext ? macroContext.phase : 'UNKNOWN'} | **MMXM Step**: ${macroContext ? macroContext.mxmStep + '/4' : 'N/A'}
- Levels: ${uniqueOBs.length} OBs | ${fvgs.length} FVGs | ${pools.length} pools
- Sweeps: ${hasSweep ? 'Yes — liquidity sweep detected' : 'None'}

## Model Scores (Cycle-Weighted)

| Model | Structural | Cycle × | Po3 | Final | Status |
|-------|-----------|---------|-----|-------|--------|
${models.map(m => `| ${m.name} | ${m.structuralScore}/${m.max.toFixed(0)} | ×${r2(m.cycleMultiplier)} | ${m.po3Blocked ? '⚠️ BLOCKED' : '✅'} | **${r2(m.score)}** | ${m === primary ? '★ PRIMARY' : m.score >= 3 ? 'Alternative' : 'Rejected'} |`).join("\n")}

${models.filter(m => m.po3Blocked).map(m => `⚠️ **${m.name}**: ${m.po3BlockReason}`).join('\n\n')}

## Primary: ${primary.name} (${r2(primary.score)} — structural ${primary.structuralScore} × cycle ${r2(primary.cycleMultiplier)})
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
  const microOutput = execSync(`node "${ROOT}\\tools\\micro_context.cjs" ${PAIR}`, {
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
    const fractalOutput = execSync(`node "${ROOT}\\tools\\fractal_mmxm.cjs" ${PAIR}`, {
      stdio: ["ignore", "pipe", "ignore"], encoding: "utf8", timeout: 15000
    });
    const fractalData = JSON.parse(fractalOutput);
    console.log(`  Fractal MMXM: ${fractalData.fractalScore}/${fractalData.fractalMax} — ${fractalData.fractalLabel}`);
    console.log(`  1m Inversion: ${fractalData.inversionDetected ? '✅ DETECTED' : '⏳ NOT YET'} (${fractalData.inversionScore}/${fractalData.inversionMax})`);
    console.log(`  6 Confirmations: ${fractalData.confirmationsPassed}/6 | CISD: ${fractalData.cisdDetected ? '✅' : '✗'} | SMT: ${fractalData.smtDetected ? '✅' : '✗'}`);
    console.log(`  Nesting: ${fractalData.nestingScore}/${fractalData.nestingMax} | Steps: ${Object.values(fractalData.mmxmSteps).join('→')}`);

  // ── Run Priority 2 (CISD + BPR + Po3 + ISD) ─────────────────
  try {
    const p2Output = execSync(`node "${ROOT}\\tools\\priority2.cjs" ${PAIR}`, {
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

// ═══════════════ STAGE 05 — Entry Refinement ═══════════════
console.log("═══ STAGE 05 — Entry Refinement ═══");
const entryPrice = r1h.price;
const atrValue = Math.abs((r4h.structure.lastSwingHigh || entryPrice + 0.003) - (r4h.structure.lastSwingLow || entryPrice - 0.003)) * 0.15;

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

if (bias1d === 'bearish') {
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
} else if (bias1d === 'bullish') {
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

## Model: **${primary.name}** (${primary.score}/${primary.max})

## Setup
- **Direction**: **${entryType}** | **Entry TF**: 15m/5m
- **Trigger**: ${bias1d === 'bearish' ? 'MSS downside + bearish FVG fill on 5m' : bias1d === 'bullish' ? 'MSS upside + bullish FVG fill on 5m' : 'N/A'}

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
const accountBalance = 10000, riskPct = 1;
const riskAmount = accountBalance * riskPct / 100;

// Position sizing: riskInPips × pointValuePerLot = $ risk per standard lot
const riskInPips = toPips(risk);
const riskDollarsPerLot = riskInPips * IC.pointValuePerLot;
const posSizeLots = riskDollarsPerLot > 0 ? riskAmount / riskDollarsPerLot : 0;
const lots = posSizeLots >= 0.1
  ? posSizeLots.toFixed(2) + " std"
  : posSizeLots >= 0.01
    ? (posSizeLots * 10).toFixed(2) + " mini"
    : (posSizeLots * 100).toFixed(0) + " micro";

const maxLoss = posSizeLots * riskInPips * IC.pointValuePerLot;
const maxGain = posSizeLots * toPips(reward1) * IC.pointValuePerLot;

writeMd("06_risk_management", "risk_plan.md", `# Risk Plan — ${pairLabel} — ${DATE}

## Account
- **Balance**: $${accountBalance.toLocaleString()} | **Risk**: ${riskPct}% = $${riskAmount}
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

// ═══════════════ SUMMARY ═══════════════
console.log(`\n${"=".repeat(55)}`);
console.log(`  ${pairLabel} — COMPLETE`);
console.log(`${"=".repeat(55)}`);
console.log(`Bias: ${bias1d.toUpperCase()} | 1W→${bias1w} 1D→${bias1d} 4H→${bias4h}`);
console.log(`Model: ${primary.name} (${r2(primary.score)}/${primary.max.toFixed(0)})`);
if (conflicts.length > 0) console.log(`⚠️  Conflicts: ${conflicts.length} mutual exclusivity issue(s) detected`);
if (phaseConflicts.length > 0) console.log(`⚠️  Phase conflicts: ${phaseConflicts.length} model(s) inappropriate for ${macroContext ? macroContext.phase : 'current'} phase`);
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
