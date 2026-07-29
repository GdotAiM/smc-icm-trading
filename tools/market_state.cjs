// Market State Engine — News Awareness + Ranging Market Handling
// Closes the two remaining gaps: economic calendar integration + ranging market behavior

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = "C:\\Users\\cash\\smc-icm-trading";
const DATE = new Date().toISOString().split("T")[0];

function r2(v) { return Number(v).toFixed(2); }

const PAIR = process.argv[2] || "GBPUSD";
const pairLabel = PAIR === "GOLD" ? "XAUUSD" : PAIR;
const sharedDir = path.join(ROOT, "shared", DATE, PAIR);

function loadEngine(tf) {
  try { return JSON.parse(fs.readFileSync(path.join(sharedDir, `engine_${tf.toLowerCase()}.json`), "utf8")); }
  catch { return null; }
}

// ═══════════════════════════════════════════════════════════════════
// GAP 1: NEWS / ECONOMIC CALENDAR AWARENESS
// ═══════════════════════════════════════════════════════════════════

function checkNewsBlackout() {
  let calendar = null;
  try {
    const calFile = path.join(ROOT, "shared", "economic_calendar.json");
    if (fs.existsSync(calFile)) {
      calendar = JSON.parse(fs.readFileSync(calFile, "utf8"));
    }
  } catch(e) { /* calendar unavailable */ }

  if (!calendar) {
    // Try to fetch fresh
    try {
      execSync(`python "${ROOT}/tools/economic_calendar.py" --output "${ROOT}/shared/economic_calendar.json"`, { stdio: "ignore", timeout: 15000 });
      const calFile = path.join(ROOT, "shared", "economic_calendar.json");
      if (fs.existsSync(calFile)) {
        calendar = JSON.parse(fs.readFileSync(calFile, "utf8"));
      }
    } catch(e) { /* fetch failed */ }
  }

  if (!calendar) {
    return { available: false, inBlackout: false, narrative: "Economic calendar unavailable. Check ForexFactory manually." };
  }

  const inBlackout = calendar.active_blackout_pairs?.includes(pairLabel) || false;
  const todayEvents = (calendar.events || []).filter(e => e.date === new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }).replace(/\//g, "-"));
  const highImpactToday = todayEvents.filter(e => e.is_high_impact);
  const upcomingHighImpact = (calendar.events || []).filter(e => e.is_high_impact && e.affected_pairs?.includes(pairLabel)).slice(0, 3);

  return {
    available: true,
    inBlackout,
    totalEvents: calendar.total_events,
    highImpactCount: calendar.high_impact_count,
    todayHighImpact: highImpactToday.length,
    upcomingForPair: upcomingHighImpact,
    narrative: inBlackout ?
      `⚠️ NEWS BLACKOUT — ${pairLabel} has high-impact news within 30min. NO ENTRIES. Wait for the spike to settle.` :
      highImpactToday.length > 0 ?
      `⚠️ ${highImpactToday.length} high-impact event(s) today. ${upcomingHighImpact.length > 0 ? upcomingHighImpact.map(e => e.title + ' @ ' + e.time).join(', ') + '. Reduce size, tighten stops.' : 'None directly affect ' + pairLabel + '.'}` :
      "✅ No high-impact news for this pair. Normal trading conditions.",
    tradingAllowed: !inBlackout,
    reduceSize: highImpactToday.length > 0 && !inBlackout,
  };
}

// ═══════════════════════════════════════════════════════════════════
// GAP 2: RANGING MARKET HANDLING
// ═══════════════════════════════════════════════════════════════════

function checkRangingMarket() {
  const r4h = loadEngine("4h");
  const r1h = loadEngine("1h");
  if (!r4h) return { isRanging: false, narrative: "Insufficient data" };

  const bias4h = r4h.structure.bias;
  const bias1h = r1h?.structure?.bias || "neutral";
  const conf4h = r4h.structure.confidence || 0;
  const swHi = r4h.structure.lastSwingHigh || 0;
  const swLo = r4h.structure.lastSwingLow || 0;
  const range = swHi > 0 && swLo > 0 ? Math.abs(swHi - swLo) / r4h.price : 0;
  const displacement = r4h.volumeDisplacement?.label || "weak";
  const dispRatio = r4h.volumeDisplacement?.atrRatio || 0;
  const swept = (r4h.liquidity || []).filter(p => p.swept).length;
  const obs = (r4h.orderBlocks || []).length;
  const fvgs = (r4h.fvgs || []).length;

  // Ranging criteria:
  // 1. Neutral bias or low confidence
  // 2. Tight range (< 0.5% of price)
  // 3. Weak displacement (no directional conviction)
  // 4. Few or no sweeps (no manipulation)
  // 5. Multiple OBs/FVGs accumulating (building phase)

  let rangeScore = 0;
  const reasons = [];

  if (bias4h === "neutral" || conf4h < 0.5) { rangeScore += 2; reasons.push("Neutral/low-confidence bias"); }
  if (range > 0 && range < 0.005) { rangeScore += 2; reasons.push(`Tight range (${r2(range * 100)}%)`); }
  if (displacement === "weak" && dispRatio < 0.5) { rangeScore += 1; reasons.push("Weak displacement"); }
  if (swept === 0) { rangeScore += 1; reasons.push("No sweeps — no manipulation"); }
  if (obs + fvgs >= 3) { rangeScore += 1; reasons.push("PD Arrays accumulating"); }
  if (bias4h !== bias1h && bias4h !== "neutral" && bias1h !== "neutral") { rangeScore += 1; reasons.push("HTF-LTF divergence"); }

  const isRanging = rangeScore >= 4;

  // Ranging market recommendations
  const rangingModels = ["Asian Range Breakout", "NWOG/NDOG", "Judas Swing"];
  const avoidModels = ["2022 Model (MMXM)", "2FVG Entry", "Silver Bullet"];

  return {
    isRanging,
    rangeScore,
    maxRangeScore: 8,
    reasons,
    bias: bias4h,
    confidence: conf4h,
    rangePct: r2(range * 100) + "%",
    displacement,
    recommendedModels: rangingModels,
    avoidModels,
    narrative: isRanging ?
      `⚠️ RANGING MARKET (${rangeScore}/8 indicators). Price is accumulating, not trending. Use range-trading models: ${rangingModels.join(', ')}. Avoid trend models: ${avoidModels.join(', ')}.` :
      rangeScore >= 2 ?
      `⚡ TRANSITIONAL — ${rangeScore}/8 range indicators. Market may be shifting between range and trend. Reduce size, keep stops tight.` :
      `✅ TRENDING MARKET — ${rangeScore}/8 range indicators. Trend-following models appropriate.`,
    sizeMultiplier: isRanging ? 0.5 : rangeScore >= 3 ? 0.75 : 1.0,
    confidenceAdjustment: isRanging ? -2 : rangeScore >= 2 ? -1 : 0,
  };
}

// ── Run All ─────────────────────────────────────────────────────────────
const news = checkNewsBlackout();
const ranging = checkRangingMarket();

// ── Output ──────────────────────────────────────────────────────────────
const out = {
  pair: pairLabel,
  news: {
    available: news.available,
    inBlackout: news.inBlackout,
    tradingAllowed: news.tradingAllowed,
    narrative: news.narrative,
  },
  ranging: {
    isRanging: ranging.isRanging,
    rangeScore: ranging.rangeScore,
    narrative: ranging.narrative,
    sizeMultiplier: ranging.sizeMultiplier,
    confidenceAdjustment: ranging.confidenceAdjustment,
    recommendedModels: ranging.recommendedModels,
    avoidModels: ranging.avoidModels,
  },
  combinedVerdict: news.inBlackout ? "NO TRADE — News blackout" :
                   ranging.isRanging ? "RANGE STRATEGY — Use range models only, 50% size" :
                   news.reduceSize ? "CAUTION — High impact news today, reduce size" :
                   "NORMAL — Standard trading conditions",
};

// Save
const outDir = path.join(ROOT, "stages", "00_macro_context", "output");
fs.mkdirSync(outDir, { recursive: true });
const md = `# Market State — ${pairLabel} — ${DATE}

## News / Economic Calendar
**${news.narrative}**
- Trading Allowed: ${news.tradingAllowed ? '✅' : '❌'}
- Today's High Impact: ${news.todayHighImpact || 0} events
${(news.upcomingForPair || []).map(e => `- ⚠️ ${e.title} @ ${e.time} (${e.impact})`).join("\n")}

## Ranging Market Assessment
**${ranging.narrative}**
- Range Score: ${ranging.rangeScore}/${ranging.maxRangeScore}
- Reasons: ${ranging.reasons.join(', ')}
- Size Multiplier: ×${ranging.sizeMultiplier}
- Confidence Adjustment: ${ranging.confidenceAdjustment}
- Recommended: ${ranging.recommendedModels.join(', ')}
- Avoid: ${ranging.avoidModels.join(', ')}

## Combined Verdict
**${out.combinedVerdict}**
`;

fs.writeFileSync(path.join(outDir, `${PAIR.toLowerCase()}_market_state.md`), md, "utf8");
console.log(JSON.stringify(out, null, 2));
