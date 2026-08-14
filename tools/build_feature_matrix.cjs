// tools/build_feature_matrix.cjs — WP-16: ML Feature Matrix Builder
// =============================================================================
// Iterates all historical shared/<date>/<pair>/ directories, extracts structured
// features from SMC engine reports across all timeframes, joins with forward
// price outcomes, and writes a flat training table.
//
// Usage:
//   node tools/build_feature_matrix.cjs                    → all dates, all pairs
//   node tools/build_feature_matrix.cjs --days 30          → last 30 days only
//   node tools/build_feature_matrix.cjs --pair EURUSD      → single pair
//   node tools/build_feature_matrix.cjs --summary          → print feature stats
//
// Output: shared/training/feature_matrix.jsonl (one JSON object per line)
//         shared/training/feature_matrix_stats.json (summary statistics)
// =============================================================================

const fs = require("fs");
const path = require("path");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..");
const SHARED = path.join(ROOT, "shared");
const TRAINING_DIR = path.join(SHARED, "training");
const MATRIX_PATH = path.join(TRAINING_DIR, "feature_matrix.jsonl");
const STATS_PATH = path.join(TRAINING_DIR, "feature_matrix_stats.json");

const PAIRS = ["EURUSD", "GBPUSD", "XAUUSD", "NAS100"];
const PAIR_DIRS = { XAUUSD: ["XAUUSD", "GOLD"], NAS100: ["NAS100"], EURUSD: ["EURUSD"], GBPUSD: ["GBPUSD"] };
const TFS = ["1W", "1D", "4H", "1H", "15m", "5m", "1m"];

function r5(v) { return Number(v).toFixed(5); }

// ── Load engine report for a pair×TF ─────────────────────────────────
function loadEngine(dateDir, pairDir, tf) {
  const candidates = (PAIR_DIRS[pairDir] || [pairDir]);
  for (const dir of candidates) {
    const p = path.join(SHARED, dateDir, dir, `engine_${tf.toLowerCase()}.json`);
    if (fs.existsSync(p)) {
      try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
    }
  }
  return null;
}

// ── Load candles for outcome tracking ────────────────────────────────
function loadCandles(dateDir, pairDir, tf) {
  const candidates = (PAIR_DIRS[pairDir] || [pairDir]);
  for (const dir of candidates) {
    const p = path.join(SHARED, dateDir, dir, `candles_${tf}.json`);
    if (fs.existsSync(p)) {
      try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
    }
  }
  return null;
}

// ── Load decision.json ───────────────────────────────────────────────
function loadDecision(dateDir, pair) {
  const candidates = pair === "XAUUSD" ? ["XAUUSD", "GOLD"] : [pair];
  for (const dir of candidates) {
    const p = path.join(SHARED, dateDir, dir, "decision.json");
    if (fs.existsSync(p)) {
      try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
    }
  }
  return null;
}

// ── Extract features from a single engine report ─────────────────────
function extractEngineFeatures(engine, tf) {
  if (!engine || !engine.structure) return null;
  const prefix = tf.toLowerCase();

  const swept = (engine.liquidity || []).filter(p => p.swept);
  const unswept = (engine.liquidity || []).filter(p => !p.swept);
  const fvgs = engine.fvgs || [];
  const obs = engine.orderBlocks || [];

  return {
    [`${prefix}_bias_bullish`]: engine.structure.bias === "bullish" ? 1 : 0,
    [`${prefix}_bias_bearish`]: engine.structure.bias === "bearish" ? 1 : 0,
    [`${prefix}_event_bos`]: engine.structure.lastEvent === "BOS" ? 1 : 0,
    [`${prefix}_event_choch`]: engine.structure.lastEvent === "CHoCH" ? 1 : 0,
    [`${prefix}_swing_high`]: engine.structure.lastSwingHigh || null,
    [`${prefix}_swing_low`]: engine.structure.lastSwingLow || null,
    [`${prefix}_swept_bsl`]: swept.filter(p => p.type === "BSL").length,
    [`${prefix}_swept_ssl`]: swept.filter(p => p.type === "SSL").length,
    [`${prefix}_unswept_bsl`]: unswept.filter(p => p.type === "BSL").length,
    [`${prefix}_unswept_ssl`]: unswept.filter(p => p.type === "SSL").length,
    [`${prefix}_pool_total`]: (engine.liquidity || []).length,
    [`${prefix}_fvg_bullish`]: fvgs.filter(f => f.type === "bullish").length,
    [`${prefix}_fvg_bearish`]: fvgs.filter(f => f.type === "bearish").length,
    [`${prefix}_fvg_total`]: fvgs.length,
    [`${prefix}_ob_bullish`]: obs.filter(o => o.type === "bullish").length,
    [`${prefix}_ob_bearish`]: obs.filter(o => o.type === "bearish").length,
    [`${prefix}_ob_total`]: obs.length,
    [`${prefix}_disp_atr_ratio`]: engine.volumeDisplacement?.atrRatio || 0,
    [`${prefix}_disp_strong`]: engine.volumeDisplacement?.label === "strong" ? 1 : 0,
    [`${prefix}_disp_moderate`]: engine.volumeDisplacement?.label === "moderate" ? 1 : 0,
    [`${prefix}_disp_weak`]: engine.volumeDisplacement?.label === "weak" ? 1 : 0,
    [`${prefix}_price`]: engine.price || null,
  };
}

// ── Compute forward outcome ──────────────────────────────────────────
function computeOutcome(entryPrice, direction, candles1m, candles1h, candles4h) {
  const entry = parseFloat(entryPrice);
  if (!entry || entry <= 0) return { win1h: null, win4h: null, winEOD: null, pnl1h: 0, pnl4h: 0, pnlEOD: 0 };

  function priceAt(candles, offset) {
    if (!candles || candles.length < offset) return null;
    const c = candles[Math.min(candles.length - 1, offset)];
    return c?.close || c?.c || null;
  }

  const p1h = priceAt(candles1m, 60) || priceAt(candles1h, 1);
  const p4h = priceAt(candles1m, 240) || priceAt(candles4h, 1);
  const pEOD = priceAt(candles1m, candles1m ? candles1m.length - 1 : 0) || priceAt(candles1h, candles1h ? candles1h.length - 1 : 0);

  const pnl = (exit) => direction === "LONG" ? (exit - entry) : (entry - exit);

  return {
    win1h: p1h ? (pnl(p1h) > 0 ? 1 : 0) : null,
    win4h: p4h ? (pnl(p4h) > 0 ? 1 : 0) : null,
    winEOD: pEOD ? (pnl(pEOD) > 0 ? 1 : 0) : null,
    pnl1h: p1h ? r5(pnl(p1h)) : null,
    pnl4h: p4h ? r5(pnl(p4h)) : null,
    pnlEOD: pEOD ? r5(pnl(pEOD)) : null,
  };
}

// ── Extract time features ────────────────────────────────────────────
function extractTimeFeatures(dateStr, eng1h) {
  const d = new Date(dateStr + "T12:00:00-04:00");
  const dayOfWeek = d.getDay(); // 0=Sun, 1=Mon...
  const isMonday = dayOfWeek === 1 ? 1 : 0;
  const isTuesday = dayOfWeek === 2 ? 1 : 0;
  const isWednesday = dayOfWeek === 3 ? 1 : 0;
  const isThursday = dayOfWeek === 4 ? 1 : 0;
  const isFriday = dayOfWeek === 5 ? 1 : 0;

  // Approximate NY hour from the engine's last event time
  let nyHour = 10; // default to NY AM
  if (eng1h?.structure?.lastEventTime) {
    const eventDate = new Date(eng1h.structure.lastEventTime);
    nyHour = eventDate.getUTCHours() - 4; // rough EDT
    if (nyHour < 0) nyHour += 24;
  }

  const inLondonKZ = (nyHour >= 2 && nyHour < 5) ? 1 : 0;
  const inNYAMKZ = (nyHour >= 8 && nyHour < 11) ? 1 : 0;
  const inNYPMKZ = (nyHour >= 13 && nyHour < 16) ? 1 : 0;
  const inLunch = (nyHour >= 11 && nyHour < 13) ? 1 : 0;
  const inSB = ((nyHour >= 3 && nyHour < 4) || (nyHour >= 10 && nyHour < 11) || (nyHour >= 14 && nyHour < 15)) ? 1 : 0;

  return {
    day_of_week: dayOfWeek,
    is_monday: isMonday, is_tuesday: isTuesday, is_wednesday: isWednesday,
    is_thursday: isThursday, is_friday: isFriday,
    ny_hour: nyHour,
    in_london_kz: inLondonKZ, in_ny_am_kz: inNYAMKZ, in_ny_pm_kz: inNYPMKZ,
    in_lunch: inLunch, in_silver_bullet: inSB,
  };
}

// ── Extract cross-pair features (DXY alignment) ──────────────────────
function extractCrossFeatures(dateDir, pair) {
  try {
    const dxyEngine = loadEngine(dateDir, "DXY", "1H");
    if (!dxyEngine?.structure) return { dxy_bias_bullish: 0, dxy_bias_bearish: 0, dxy_aligned: 0 };

    const dxyBias = dxyEngine.structure.bias;
    const pairEngine = loadEngine(dateDir, pair, "1H");
    const pairBias = pairEngine?.structure?.bias || "neutral";

    // DXY bullish → dollar strong → forex pairs should be bearish
    const aligned = (pairBias === "bearish" && dxyBias === "bullish") ||
                    (pairBias === "bullish" && dxyBias === "bearish");

    return {
      dxy_bias_bullish: dxyBias === "bullish" ? 1 : 0,
      dxy_bias_bearish: dxyBias === "bearish" ? 1 : 0,
      dxy_aligned: aligned ? 1 : 0,
    };
  } catch { return { dxy_bias_bullish: 0, dxy_bias_bearish: 0, dxy_aligned: 0 }; }
}

// ── Process one pair×date ────────────────────────────────────────────
function processPairDate(dateDir, pair) {
  const eng1h = loadEngine(dateDir, pair, "1H");
  if (!eng1h?.structure) return null;

  const decision = loadDecision(dateDir, pair);
  const candles1m = loadCandles(dateDir, pair, "1m");
  const candles1h = loadCandles(dateDir, pair, "1h");
  const candles4h = loadCandles(dateDir, pair, "4h");

  // Extract all features
  const features = {};
  for (const tf of TFS) {
    const eng = loadEngine(dateDir, pair, tf);
    const tfFeatures = extractEngineFeatures(eng, tf);
    if (tfFeatures) Object.assign(features, tfFeatures);
  }

  // Time features
  Object.assign(features, extractTimeFeatures(dateDir, eng1h));

  // Cross-pair features
  Object.assign(features, extractCrossFeatures(dateDir, pair));

  // WP-16: LLM features — narrative coherence, pattern similarity, etc.
  try {
    const llmPath = path.join(SHARED, dateDir, pair === "XAUUSD" ? "XAUUSD" : pair, "llm_features.json");
    if (fs.existsSync(llmPath)) {
      const llmFeatures = JSON.parse(fs.readFileSync(llmPath, "utf8"));
      features.llm_narrative_coherence = llmFeatures.narrative_coherence || 0.5;
      features.llm_dxy_confidence = llmFeatures.dxy_alignment_confidence || 0.5;
      features.llm_pattern_similarity = llmFeatures.pattern_similarity_score || 0.5;
      features.llm_macro_strength = llmFeatures.macro_context_strength || 0.5;
      features.llm_decision_confidence = llmFeatures.decision_confidence || 0.5;
      features.llm_mode = llmFeatures.mode || "none";
    }
  } catch { /* LLM features not available */ }

  // Registry features
  if (decision?.registry) {
    features.registry_verdict_setup = decision.registry.verdict === "SETUP COMPLETE" ? 1 : 0;
    features.registry_complete_count = decision.registry.completeCount || 0;
    features.registry_was_tie = (decision.registry.completeCount || 0) > 1 ? 1 : 0;
  } else {
    features.registry_verdict_setup = 0;
    features.registry_complete_count = 0;
    features.registry_was_tie = 0;
  }

  if (decision?.entry) {
    features.entry_type_long = decision.entry.type === "LONG" ? 1 : 0;
    features.entry_type_short = decision.entry.type === "SHORT" ? 1 : 0;
    features.entry_price = decision.entry.price || 0;
  }

  if (decision?.guard) {
    features.guard_blocked = decision.guard.blocked > 0 ? 1 : 0;
    features.guard_blocked_count = decision.guard.blocked || 0;
  }

  if (decision?.coherence) {
    features.coherence_unified = decision.coherence.unified || 0;
  }

  if (decision?.mmxmStep) {
    features.mmxm_step = decision.mmxmStep.step || 0;
    features.mmxm_tradeable = decision.mmxmStep.tradeable ? 1 : 0;
    features.mmxm_scalp_only = decision.mmxmStep.scalpOnly ? 1 : 0;
  }

  // Compute outcomes for each completed model
  const completedModels = [];
  if (decision?.registry?.primary) completedModels.push(decision.registry.primary);
  // Also capture tied models from the active_models.md
  const modelsMdPath = path.join(ROOT, "stages", "04_model_selection", "output", `${pair.toLowerCase()}_active_models.md`);
  if (fs.existsSync(modelsMdPath)) {
    const md = fs.readFileSync(modelsMdPath, "utf8");
    const lines = md.split("\n");
    for (const line of lines) {
      if (line.includes("✅ COMPLETE")) {
        const nameMatch = line.match(/^\|\s*(.+?)\s*\|/);
        if (nameMatch && !completedModels.includes(nameMatch[1].trim())) {
          completedModels.push(nameMatch[1].trim());
        }
      }
    }
  }

  const entryPrice = decision?.entry?.price || eng1h.price || 0;
  const entryType = decision?.entry?.type || "NEUTRAL";

  const rows = [];
  for (const model of completedModels) {
    const outcome = computeOutcome(entryPrice, entryType, candles1m, candles1h, candles4h);
    rows.push({
      date: dateDir,
      pair,
      model,
      ...features,
      ...outcome,
      is_primary: model === decision?.registry?.primary ? 1 : 0,
    });
  }

  return rows;
}

// ═══ MAIN ═══
const args = process.argv.slice(2);
const MAX_DAYS = parseInt(args.find(a => a.startsWith("--days="))?.split("=")[1] || "0") || Infinity;
const TARGET_PAIR = args.find(a => a.startsWith("--pair="))?.split("=")[1] || null;
const SUMMARY = args.includes("--summary");

if (SUMMARY) {
  if (!fs.existsSync(MATRIX_PATH)) {
    console.log("No feature matrix found. Run without --summary first.");
    process.exit(1);
  }
  const lines = fs.readFileSync(MATRIX_PATH, "utf8").trim().split("\n").filter(Boolean);
  const rows = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  console.log(`Feature matrix: ${rows.length} samples`);
  console.log(`Pairs: ${[...new Set(rows.map(r => r.pair))].join(", ")}`);
  console.log(`Dates: ${[...new Set(rows.map(r => r.date))].sort().join(", ")}`);
  console.log(`Models: ${[...new Set(rows.map(r => r.model))].join(", ")}`);
  if (rows[0]) console.log(`Features per sample: ${Object.keys(rows[0]).filter(k => !["date","pair","model","win1h","win4h","winEOD","pnl1h","pnl4h","pnlEOD","is_primary"].includes(k)).length}`);
  const withOutcome = rows.filter(r => r.winEOD !== null);
  console.log(`Samples with EOD outcome: ${withOutcome.length}/${rows.length}`);
  if (withOutcome.length > 0) {
    const winRate = withOutcome.filter(r => r.winEOD === 1).length / withOutcome.length * 100;
    console.log(`Overall win rate (EOD): ${winRate.toFixed(1)}%`);
  }
  process.exit(0);
}

// Build matrix
const dateDirs = fs.readdirSync(SHARED).filter(d => {
  const full = path.join(SHARED, d);
  return fs.statSync(full).isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d);
}).sort().reverse();

const pairs = TARGET_PAIR ? [TARGET_PAIR] : PAIRS;
const limitedDates = MAX_DAYS < Infinity ? dateDirs.slice(0, MAX_DAYS) : dateDirs;

fs.mkdirSync(TRAINING_DIR, { recursive: true });

let totalRows = 0;
const allSamples = [];

console.log(`Building feature matrix from ${limitedDates.length} dates × ${pairs.length} pairs...`);

for (const dateDir of limitedDates) {
  for (const pair of pairs) {
    try {
      const rows = processPairDate(dateDir, pair);
      if (rows && rows.length > 0) {
        for (const row of rows) {
          fs.appendFileSync(MATRIX_PATH, JSON.stringify(row) + "\n");
          allSamples.push(row);
          totalRows++;
        }
      }
    } catch (e) {
      // skip errors silently
    }
  }
}

// Write stats
const stats = {
  generated: new Date().toISOString(),
  totalSamples: totalRows,
  datesScanned: limitedDates.length,
  pairs: pairs,
  models: [...new Set(allSamples.map(r => r.model))],
  featureCount: allSamples[0] ? Object.keys(allSamples[0]).filter(k => !["date","pair","model","win1h","win4h","winEOD","pnl1h","pnl4h","pnlEOD","is_primary"].includes(k)).length : 0,
  outcomeCoverage: {
    eod: allSamples.filter(r => r.winEOD !== null).length,
    fourH: allSamples.filter(r => r.win4h !== null).length,
    oneH: allSamples.filter(r => r.win1h !== null).length,
  },
};
fs.writeFileSync(STATS_PATH, JSON.stringify(stats, null, 2));

console.log(`\nDone: ${totalRows} samples written to ${MATRIX_PATH}`);
console.log(`Stats: ${STATS_PATH}`);
if (stats.outcomeCoverage.eod > 0) {
  const wr = allSamples.filter(r => r.winEOD === 1).length / stats.outcomeCoverage.eod * 100;
  console.log(`EOD win rate: ${wr.toFixed(1)}% (${stats.outcomeCoverage.eod} with outcomes)`);
}
