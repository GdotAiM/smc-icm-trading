// tools/backtest_registry.cjs — WP-17: Full Registry Backtester
// =============================================================================
// Runs the complete WP-8 registry + pool-first cascade against ALL historical
// data in shared/<date>/. No CDP required — uses stored engine reports, candles,
// and decision files. Derives edge from 16+ days of data instead of waiting.
//
// Usage:
//   node tools/backtest_registry.cjs                    → all dates, all pairs
//   node tools/backtest_registry.cjs --days 30          → last 30 days
//   node tools/backtest_registry.cjs --model "2FVG Entry" → single model deep-dive
//   node tools/backtest_registry.cjs --regime            → regime-conditional stats
//
// Output: shared/backtest/registry_backtest.json (full results)
//         shared/backtest/registry_performance.md (human-readable summary)
// =============================================================================

const fs = require("fs");
const path = require("path");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..");
const SHARED = path.join(ROOT, "shared");
const BACKTEST_DIR = path.join(SHARED, "backtest", "registry");

const PAIRS = ["EURUSD", "GBPUSD", "XAUUSD", "NAS100"];
const PAIR_DIRS = { XAUUSD: ["XAUUSD", "GOLD"], NAS100: ["NAS100"], EURUSD: ["EURUSD"], GBPUSD: ["GBPUSD"] };
const TFS = ["1D", "4H", "1H", "15m", "5m", "1m"];

function r2(v) { return Number(v).toFixed(2); }
function r5(v) { return Number(v).toFixed(5); }

// ── Load engine report ──────────────────────────────────────────────
function loadEngine(dateDir, pair, tf) {
  for (const dir of (PAIR_DIRS[pair] || [pair])) {
    const p = path.join(SHARED, dateDir, dir, `engine_${tf.toLowerCase()}.json`);
    if (fs.existsSync(p)) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } }
  }
  return null;
}

// ── Load candles ─────────────────────────────────────────────────────
function loadCandles(dateDir, pair, tf) {
  for (const dir of (PAIR_DIRS[pair] || [pair])) {
    const p = path.join(SHARED, dateDir, dir, `candles_${tf}.json`);
    if (fs.existsSync(p)) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } }
  }
  return null;
}

// ── Build minimal registry context from engine data ──────────────────
function buildBacktestContext(dateDir, pair, engineReports) {
  const r1h = engineReports["1H"];
  const r4h = engineReports["4H"];
  const r1d = engineReports["1D"];
  if (!r1h?.structure) return null;

  const bias = r1d?.structure?.bias || r4h?.structure?.bias || "neutral";
  const hasSweep = [...(r1h.liquidity||[]), ...(r4h.liquidity||[]), ...(r1d?.liquidity||[])].some(p => p.swept);
  const sweptPools = [...(r1h.liquidity||[]), ...(r4h.liquidity||[])].filter(p => p.swept);
  const lastSweepType = sweptPools.length > 0 ? sweptPools[sweptPools.length - 1].type : null;

  // Approximate NY hour from the date + engine timestamp
  const d = new Date(dateDir + "T10:00:00-04:00");
  const nyHour = 10; // default to NY AM

  return {
    hour: nyHour,
    price: r1h.price || 0,
    bias,
    hasSweep,
    lastSweepType,
    hasReversal: false,
    mss: false,
    hasOB: (r1h.orderBlocks || []).length > 0,
    uniqueOBs: r1h.orderBlocks || [],
    mitigatedOBs: [],
    consumedOBs: [],
    hasFVG: (r1h.fvgs || []).length > 0,
    fvgs: r1h.fvgs || [],
    hasDraw: (r1h.liquidity || []).filter(p => !p.swept).length > 0,
    oteZone: false,
    cisd: false,
    smt: false,
    htfRanging: false,
    displacement: false,
    arrayInPlay: false,
    consumedAtPrice: false,
    hasDrawTarget: true,
    poolContext: null, // backtest: no live session pool data
    scalpOnly: false,
  };
}

// ── Track forward outcome ────────────────────────────────────────────
function trackForwardOutcome(dateDir, pair, entryPrice, direction) {
  const candles1m = loadCandles(dateDir, pair, "1m");
  const candles1h = loadCandles(dateDir, pair, "1h");
  const candles4h = loadCandles(dateDir, pair, "4h");

  if (!candles1m || candles1m.length < 10) return null;

  const pNow = entryPrice;
  const p1h = candles1m[Math.min(candles1m.length - 1, 60)]?.close || pNow;
  const p4h = candles1m[Math.min(candles1m.length - 1, 240)]?.close || (candles4h?.[Math.min(candles4h.length - 1, 2)]?.close) || pNow;
  const pEOD = candles1m[candles1m.length - 1]?.close || (candles1h?.[candles1h.length - 1]?.close) || pNow;

  const pnl = (exit) => direction === "LONG" ? (exit - pNow) : (pNow - exit);

  return {
    win1h: pnl(p1h) > 0, win4h: pnl(p4h) > 0, winEOD: pnl(pEOD) > 0,
    rMultiple1h: pNow > 0 ? Math.abs(p1h - pNow) / Math.abs(pNow * 0.01) : 0,
    rMultiple4h: pNow > 0 ? Math.abs(p4h - pNow) / Math.abs(pNow * 0.01) : 0,
    rMultipleEOD: pNow > 0 ? Math.abs(pEOD - pNow) / Math.abs(pNow * 0.01) : 0,
    pnl1h: r5(pnl(p1h)), pnl4h: r5(pnl(p4h)), pnlEOD: r5(pnl(pEOD)),
  };
}

// ── Determine regime ──────────────────────────────────────────────────
function classifyRegime(reports, dateDir) {
  const r4h = reports["4H"];
  const r1d = reports["1D"];
  if (!r4h?.structure || !r1d?.structure) return "UNKNOWN";

  const dispRatio = r4h.volumeDisplacement?.atrRatio || 0;
  const swept = (r4h.liquidity || []).filter(p => p.swept).length;
  const fvgs = (r4h.fvgs || []).length;
  const bias4h = r4h.structure.bias;
  const bias1d = r1d.structure.bias;

  const HTFaligned = bias4h === bias1d && bias1d !== "neutral";

  if (dispRatio > 1.5 && fvgs >= 3) return "TRENDING_STRONG";
  if (dispRatio > 0.8 && HTFaligned) return "TRENDING";
  if (swept >= 2 && dispRatio < 0.5) return "MANIPULATION";
  if (dispRatio < 0.3 && !HTFaligned) return "RANGING";
  // Regimes come from PRICE (displacement, sweeps, alignment) — never from the
  // day of the week. "Wednesday trends" and "Monday range sets" are calendar
  // superstition, not structure.
  return "NORMAL";
}

// ═══ MAIN ═══
async function main() {
  const args = process.argv.slice(2);
  const MAX_DAYS = parseInt((args.find(a => a.startsWith("--days=")) || "--days=999").split("=")[1]);
  const TARGET_MODEL = args.includes("--model") ? args[args.indexOf("--model") + 1] : null;
  const SHOW_REGIME = args.includes("--regime");

  const dateDirs = fs.readdirSync(SHARED)
    .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d) && fs.statSync(path.join(SHARED, d)).isDirectory())
    .sort()
    .slice(-MAX_DAYS);

  console.log(`Backtesting ${dateDirs.length} dates × ${PAIRS.length} pairs...`);

  fs.mkdirSync(BACKTEST_DIR, { recursive: true });

  const allResults = [];
  const modelStats = {};
  const regimeStats = {};
  const pairStats = {};

  for (const dateDir of dateDirs) {
    for (const pair of PAIRS) {
      // Load all engine reports
      const reports = {};
      for (const tf of TFS) {
        reports[tf] = loadEngine(dateDir, pair, tf);
      }
      if (!reports["1H"]?.structure) continue;

      const ctx = buildBacktestContext(dateDir, pair, reports);
      if (!ctx) continue;

      // Run registry
      let registryResult;
      try {
        const { runRegistry } = require("./models/registry.cjs");
        registryResult = runRegistry(ctx);
      } catch(e) { continue; }

      if (!registryResult || registryResult.count === 0) continue;

      const regime = classifyRegime(reports, dateDir);
      const dayOfWeek = new Date(dateDir + "T12:00:00-04:00").getDay();

      // For each completed model, track outcome
      for (const complete of registryResult.complete) {
        const modelName = complete.name;
        const direction = registryResult.direction || (ctx.bias === "bullish" ? "LONG" : "SHORT");
        const entryPrice = ctx.price;

        const outcome = trackForwardOutcome(dateDir, pair, entryPrice, direction);
        if (!outcome) continue;

        const row = {
          date: dateDir, pair, model: modelName, direction, entryPrice: r5(entryPrice),
          regime, dayOfWeek,
          ...outcome,
          tier: complete.tier,
          wasTie: registryResult.count > 1,
          confidence: registryResult.confidence,
        };
        allResults.push(row);

        // Accumulate model stats
        if (!modelStats[modelName]) modelStats[modelName] = { trades: 0, wins1h: 0, wins4h: 0, winsEOD: 0, totalR: 0, byPair: {}, byRegime: {} };
        const ms = modelStats[modelName];
        ms.trades++;
        if (outcome.win1h) ms.wins1h++;
        if (outcome.win4h) ms.wins4h++;
        if (outcome.winEOD) ms.winsEOD++;
        ms.totalR += outcome.rMultipleEOD || 0;
        ms.byPair[pair] = (ms.byPair[pair] || 0) + 1;
        const rKey = `${regime}`;
        if (!ms.byRegime[rKey]) ms.byRegime[rKey] = { trades: 0, wins: 0 };
        ms.byRegime[rKey].trades++;
        if (outcome.winEOD) ms.byRegime[rKey].wins++;

        // Accumulate regime stats
        if (!regimeStats[regime]) regimeStats[regime] = { trades: 0, wins: 0, models: {} };
        regimeStats[regime].trades++;
        if (outcome.winEOD) regimeStats[regime].wins++;
        if (!regimeStats[regime].models[modelName]) regimeStats[regime].models[modelName] = { trades: 0, wins: 0 };
        regimeStats[regime].models[modelName].trades++;
        if (outcome.winEOD) regimeStats[regime].models[modelName].wins++;

        // Accumulate pair stats
        if (!pairStats[pair]) pairStats[pair] = { trades: 0, wins: 0 };
        pairStats[pair].trades++;
        if (outcome.winEOD) pairStats[pair].wins++;
      }
    }
  }

  // ── Compute derived metrics ──────────────────────────────────────────
  const modelPerformance = {};
  for (const [name, stats] of Object.entries(modelStats)) {
    if (stats.trades < 3) continue; // need minimum sample
    const wrEOD = stats.winsEOD / stats.trades;
    const avgR = stats.totalR / stats.trades;
    const expectancy = wrEOD * avgR - (1 - wrEOD) * 1;
    const sharpeApprox = expectancy / Math.max(0.01, Math.sqrt(wrEOD * (1 - wrEOD)));

    // Best regime for this model
    let bestRegime = null, bestRegimeWR = 0;
    for (const [r, rs] of Object.entries(stats.byRegime)) {
      const rwr = rs.trades >= 2 ? rs.wins / rs.trades : 0;
      if (rwr > bestRegimeWR) { bestRegimeWR = rwr; bestRegime = r; }
    }

    modelPerformance[name] = {
      trades: stats.trades,
      winRate1h: r2(wrEOD), // using EOD for primary metric display — we track all three
      winRate4h: r2(stats.wins4h / stats.trades),
      winRateEOD: r2(wrEOD),
      avgRMultiple: r2(avgR),
      expectancy: r2(expectancy),
      sharpeApprox: r2(sharpeApprox),
      verdict: expectancy > 0.1 ? "POSITIVE_EDGE" : expectancy > -0.05 ? "NEAR_ZERO" : "NEGATIVE_EDGE",
      bestRegime,
      bestRegimeWR: r2(bestRegimeWR),
      pairs: stats.byPair,
    };
  }

  // ── Regime performance ──────────────────────────────────────────────
  const regimePerformance = {};
  for (const [regime, stats] of Object.entries(regimeStats)) {
    if (stats.trades < 3) continue;
    const wr = stats.wins / stats.trades;
    // Find best model in this regime
    let bestModel = null, bestWR = 0;
    for (const [m, ms] of Object.entries(stats.models)) {
      const mwr = ms.trades >= 2 ? ms.wins / ms.trades : 0;
      if (mwr > bestWR) { bestWR = mwr; bestModel = m; }
    }
    regimePerformance[regime] = {
      trades: stats.trades, winRate: r2(wr),
      bestModel, bestModelWR: r2(bestWR),
      recommendation: wr > 0.5 ? "TRADE_AGGRESSIVE" : wr > 0.4 ? "TRADE_CAUTIOUS" : "AVOID",
    };
  }

  // ── Pair performance ────────────────────────────────────────────────
  const pairPerformance = {};
  for (const [pair, stats] of Object.entries(pairStats)) {
    pairPerformance[pair] = {
      trades: stats.trades,
      winRate: r2(stats.trades > 0 ? stats.wins / stats.trades : 0),
    };
  }

  // ── Output ──────────────────────────────────────────────────────────
  const output = {
    generated: new Date().toISOString(),
    methodology: "Full WP-8 registry run against historical engine reports. Each completed model tracked for EOD outcome. No live CDP required.",
    summary: {
      totalTrades: allResults.length,
      datesCovered: dateDirs.length,
      pairsCovered: Object.keys(pairStats).length,
      modelsWithEdge: Object.values(modelPerformance).filter(m => m.verdict === "POSITIVE_EDGE").length,
      modelsTotal: Object.keys(modelPerformance).length,
    },
    modelPerformance,
    regimePerformance,
    pairPerformance,
    topRecommendation: (() => {
      const positive = Object.entries(modelPerformance)
        .filter(([, m]) => m.verdict === "POSITIVE_EDGE")
        .sort(([, a], [, b]) => parseFloat(b.expectancy) - parseFloat(a.expectancy));
      if (positive.length > 0) {
        const [name, perf] = positive[0];
        return `STRONGEST EDGE: ${name} (expectancy ${perf.expectancy}R, ${perf.trades} trades, best in ${perf.bestRegime} regime)`;
      }
      const best = Object.entries(modelPerformance)
        .sort(([, a], [, b]) => parseFloat(b.expectancy) - parseFloat(a.expectancy));
      if (best.length > 0) {
        return `BEST AVAILABLE: ${best[0][0]} (expectancy ${best[0][1].expectancy}R — still negative, need more data)`;
      }
      return "INSUFFICIENT DATA";
    })(),
    allTrades: allResults.length,
  };

  const outPath = path.join(BACKTEST_DIR, "registry_backtest.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

  // ── Print summary ───────────────────────────────────────────────────
  console.log(`\n${"=".repeat(65)}`);
  console.log(`  REGISTRY BACKTEST — ${allResults.length} trades across ${dateDirs.length} days`);
  console.log(`${"=".repeat(65)}`);

  console.log(`\n  MODEL PERFORMANCE (EOD):`);
  console.log(`  ${"Model".padEnd(25)} ${"Trades".padStart(6)} ${"WR".padStart(6)} ${"AvgR".padStart(6)} ${"Exp".padStart(6)} ${"Verdict"}`);
  console.log(`  ${"-".repeat(60)}`);
  for (const [name, m] of Object.entries(modelPerformance).sort(([,a],[,b]) => parseFloat(b.expectancy) - parseFloat(a.expectancy))) {
    console.log(`  ${name.padEnd(25)} ${String(m.trades).padStart(6)} ${(m.winRateEOD*100).toFixed(0).padStart(5)}% ${m.avgRMultiple.padStart(6)} ${m.expectancy.padStart(6)} ${m.verdict}`);
  }

  if (SHOW_REGIME) {
    console.log(`\n  REGIME PERFORMANCE:`);
    for (const [regime, r] of Object.entries(regimePerformance)) {
      console.log(`  ${regime.padEnd(20)} ${String(r.trades).padStart(4)} trades ${(r.winRate*100).toFixed(0).padStart(4)}% WR — best: ${r.bestModel} (${(r.bestModelWR*100).toFixed(0)}%) — ${r.recommendation}`);
    }
  }

  console.log(`\n  ${output.topRecommendation}`);
  console.log(`\n  Full results: ${outPath}`);

  // Also write markdown
  let md = `# Registry Backtest — ${output.summary.datesCovered} Days\n\n`;
  md += `**Total trades tracked**: ${allResults.length}\n`;
  md += `**Models with positive edge**: ${output.summary.modelsWithEdge}/${output.summary.modelsTotal}\n\n`;
  md += `## Model Performance\n\n`;
  md += `| Model | Trades | WR(EOD) | Avg R | Expectancy | Verdict | Best Regime |\n`;
  md += `|-------|--------|---------|-------|------------|---------|------------|\n`;
  for (const [name, m] of Object.entries(modelPerformance).sort(([,a],[,b]) => parseFloat(b.expectancy) - parseFloat(a.expectancy))) {
    md += `| ${name} | ${m.trades} | ${(m.winRateEOD*100).toFixed(0)}% | ${m.avgRMultiple}R | ${m.expectancy}R | ${m.verdict} | ${m.bestRegime} (${(m.bestRegimeWR*100).toFixed(0)}%) |\n`;
  }
  md += `\n## Recommendation\n\n${output.topRecommendation}\n`;
  const mdPath = path.join(BACKTEST_DIR, "registry_performance.md");
  fs.writeFileSync(mdPath, md);
  console.log(`  Report: ${mdPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
