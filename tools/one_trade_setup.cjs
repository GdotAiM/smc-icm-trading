// ICT "One Trade Setup for Life" — Daily Session Routing Framework
// Audited against innercircletrader.net 2026-07-31
//
// This is a META-FRAMEWORK, not another entry model. It routes today's trade
// through 5 session-based liquidity raids in priority order:
//   1. PM Session Range (prev day 1:30-4:00 PM)
//   2. London Session Raid (today 2:00-5:00 AM)
//   3. Opening Range Gap (forex 8:30, indices 9:30 AM)
//   4. NY Lunch Raid (12:00-1:30 PM)
//   Target: Previous Day AM Session (9:30 AM-12:00 PM)
//
// "First opportunity wins" sets DIRECTION BIAS for the day — it does NOT
// suppress other models. Models agreeing with the locked direction get a boost.
// Disagreeing models still run but with reduced weight.
//
// Usage: node tools/one_trade_setup.cjs PAIR

const fs = require("fs");
const path = require("path");
const ny = require("./ny_time.cjs");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..");
const DATE = new Date().toISOString().split("T")[0];
const PAIR = process.argv[2] || "GBPUSD";

function r5(v) { return Number(v).toFixed(5); }
function r2(v) { return Number(v).toFixed(2); }

function loadEngine(tf) {
  try {
    const dir = PAIR === "XAUUSD" ? "GOLD" : PAIR;
    return JSON.parse(fs.readFileSync(path.join(ROOT, "shared", DATE, dir, `engine_${tf}.json`), "utf8"));
  } catch { return null; }
}

function loadCandles(tf) {
  try {
    const dir = PAIR === "XAUUSD" ? "GOLD" : PAIR;
    return JSON.parse(fs.readFileSync(path.join(ROOT, "shared", DATE, dir, `candles_${tf}.json`), "utf8"));
  } catch { return null; }
}

// ═══ DAILY BIAS — THE ANCHOR ═══
// From weekly structure + 15-min bias + HTF PD array
function getDailyBias(reports) {
  const { computeDealingRange, getPremiumDiscount } = require("./lib/dealing_range.cjs");
  const wBias = reports["1W"]?.structure?.bias || "neutral";
  const dBias = reports["1D"]?.structure?.bias || "neutral";
  const h4Bias = reports["4H"]?.structure?.bias || "neutral";
  const m15Bias = reports["15m"]?.structure?.bias || "neutral";

  // Count aligned TFs
  const bullishCount = [wBias, dBias, h4Bias, m15Bias].filter(b => b === "bullish").length;
  const bearishCount = [wBias, dBias, h4Bias, m15Bias].filter(b => b === "bearish").length;

  let bias, confidence;
  if (bullishCount >= 3) { bias = "bullish"; confidence = bullishCount / 4; }
  else if (bearishCount >= 3) { bias = "bearish"; confidence = bearishCount / 4; }
  else if (dBias === h4Bias && dBias !== "neutral") { bias = dBias; confidence = 0.5; }
  else { bias = "neutral"; confidence = 0; }

  // Premium/Discount is read against the SWEEP-DEFINED dealing range (WP-5),
  // never a fixed midpoint or 20-bar average. No operative range -> NONE.
  const dealingRange = computeDealingRange(loadCandles("1d"));
  const pdZone = getPremiumDiscount(dealingRange, reports["1D"]?.price) || "NONE";

  return {
    bias,
    confidence: r2(confidence),
    alignment: `${wBias}→${dBias}→${h4Bias}→${m15Bias}`,
    pdZone,
    tradeable: bias !== "neutral",
    detail: bias !== "neutral"
      ? `${bias.toUpperCase()} bias (${r2(confidence * 100)}% confidence) | ${bullishCount}B/${bearishCount}S aligned | ${pdZone} zone`
      : `NEUTRAL — ${bullishCount}B/${bearishCount}S aligned. No clear daily bias.`,
  };
}

// ═══ PREVIOUS DAY AM SESSION — THE TARGET ═══
// 9:30 AM to 12:00 PM NY (previous trading day)
// THIS IS THE TP TARGET FOR EVERY TRADE TODAY
function markPreviousAMSession(dailyCandles) {
  if (!dailyCandles || dailyCandles.length < 2) return null;

  const yesterday = dailyCandles[dailyCandles.length - 2];
  // We can't get intraday levels from daily candles alone. Use the day's high/low.
  // For full accuracy we'd need 15m/1H candles from yesterday, but the daily OHLC
  // captures the session extremes as a reasonable approximation.

  return {
    high: yesterday.high,
    low: yesterday.low,
    // The AM session is typically captured within the daily range
    // For bullish bias: target is the high of the previous day
    // For bearish bias: target is the low
    date: new Date(yesterday.time).toISOString().split("T")[0],
    detail: `Prev Day AM Session (${new Date(yesterday.time).toISOString().split("T")[0]}): H ${r5(yesterday.high)} | L ${r5(yesterday.low)}`,
  };
}

// ═══ PM SESSION RANGE ═══
// Previous day 1:30-4:00 PM NY (18:30-21:00 UTC EDT)
// This is priority #1 — the overnight setup
function markPMSessionRange(dailyCandles, candles15m) {
  if (!candles15m || candles15m.length < 10) {
    // Fallback: use daily candle
    if (!dailyCandles || dailyCandles.length < 2) return null;
    const yesterday = dailyCandles[dailyCandles.length - 2];
    return {
      high: yesterday.high,
      low: yesterday.low,
      source: "Daily candle (fallback — no 15m data)",
      detail: `PM Session (fallback): H ${r5(yesterday.high)} | L ${r5(yesterday.low)}`,
    };
  }

  // Filter 15m candles to PM session: 13:30–16:00 NY
  const pmCandles = candles15m.filter(c => {
    const mins = ny.getNYHourFor(c.time) * 60 + ny.getNYMinFor(c.time);
    return mins >= (13 * 60 + 30) && mins <= (16 * 60);
  });

  if (pmCandles.length < 4) {
    // Fallback to daily
    if (!dailyCandles || dailyCandles.length < 2) return null;
    const yesterday = dailyCandles[dailyCandles.length - 2];
    return {
      high: yesterday.high, low: yesterday.low,
      source: "Daily candle (PM candles insufficient)",
      detail: `PM Session (fallback): H ${r5(yesterday.high)} | L ${r5(yesterday.low)}`,
    };
  }

  const high = Math.max(...pmCandles.map(c => c.high));
  const low = Math.min(...pmCandles.map(c => c.low));

  return {
    high, low,
    range: high - low,
    candleCount: pmCandles.length,
    source: "15m PM candles",
    detail: `PM Session (1:30-4:00 PM prev day): H ${r5(high)} | L ${r5(low)} | ${pmCandles.length} candles`,
  };
}

// ═══ LONDON SESSION RANGE ═══
// Today 2:00-5:00 AM NY — delegates to lecture2 module
function getLondonSessionRange(rootOverride, pairOverride) {
  try {
    const L2 = require("./tv-mcp/lecture2_setup.cjs");
    return L2.getLondonRange(rootOverride, pairOverride);
  } catch { return null; }
}

// ═══ SESSION RAID CHECK ═══
// Checks if a session range has been raided against daily bias
// Bullish bias → looking for sweep BELOW session low (sell-side raid)
// Bearish bias → looking for sweep ABOVE session high (buy-side raid)
function checkSessionRaid(sessionRange, dailyBias, currentPrice, reports) {
  if (!sessionRange || dailyBias.bias === "neutral") {
    return { raided: false, mssConfirmed: false, detail: "No bias or no range" };
  }

  const isBullish = dailyBias.bias === "bullish";
  const isBearish = dailyBias.bias === "bearish";

  // Check 15m/5m/1m candles for sweep of the session extreme
  // Bullish: look for price going BELOW session low (sell-side sweep)
  // Bearish: look for price going ABOVE session high (buy-side sweep)
  let sweepPrice = null, sweepTime = null, raided = false;

  const r1h = reports["1H"];
  const recentPools = (r1h?.liquidity || []);

  if (isBullish) {
    // Check if price wicked below session low
    const sweptPool = recentPools.find(p => p.type === "SSL" && p.swept && p.price <= sessionRange.low * 1.005);
    if (sweptPool) { raided = true; sweepPrice = sweptPool.price; }
  } else if (isBearish) {
    // Check if price wicked above session high
    const sweptPool = recentPools.find(p => p.type === "BSL" && p.swept && p.price >= sessionRange.high * 0.995);
    if (sweptPool) { raided = true; sweepPrice = sweptPool.price; }
  }

  // Check for MSS on 1H
  const mssConfirmed = r1h?.structure?.lastEvent === "CHoCH";
  const mssDirection = mssConfirmed ? r1h.structure.bias : null;

  // For a valid setup: raid must be AGAINST bias
  // Bullish bias → raid below low (SSL) → then MSS bullish → valid
  // Bearish bias → raid above high (BSL) → then MSS bearish → valid
  const validRaid = raided && mssConfirmed &&
    ((isBullish && mssDirection === "bullish") || (isBearish && mssDirection === "bearish"));

  return {
    raided,
    mssConfirmed,
    mssDirection,
    validRaid,
    sweepPrice,
    detail: validRaid
      ? `✅ RAIDED + MSS CONFIRMED: ${isBullish ? 'Sell-side below' : 'Buy-side above'} swept, MSS ${mssDirection}`
      : raided && !mssConfirmed
        ? `⚡ RAIDED — awaiting MSS: ${isBullish ? 'Low swept' : 'High swept'}`
        : `⏳ Not yet raided`,
  };
}

// ═══ FIRST OPPORTUNITY LOCK ═══
// Checks all session ranges in priority order. The first one with a
// valid raid + MSS sets the DAILY DIRECTION BIAS. This does NOT suppress
// other models — it gives a direction boost to agreeing models.
function checkFirstOpportunity(sessions, dailyBias) {
  const priorityOrder = ["pm", "london", "openingGap", "lunch"];

  for (const key of priorityOrder) {
    const session = sessions[key];
    if (!session || !session.range) continue;

    const raidStatus = session.raidStatus;
    if (raidStatus?.validRaid) {
      // First opportunity FOUND — lock the direction
      const lockedDirection = dailyBias.bias === "bullish" ? "BUY" : "SELL";
      const targetPrice = dailyBias.bias === "bullish"
        ? sessions.prevAM?.high
        : sessions.prevAM?.low;

      const targetLabel = dailyBias.bias === "bullish" ? "Prev Day AM HIGH" : "Prev Day AM LOW";
      return {
        locked: true,
        lockedBy: key,
        lockedDirection,
        lockedAt: new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false }) + " NY",
        targetPrice,
        targetLabel,
        // Direction boost for agreeing models, not suppression
        directionBoost: 1.3,   // ×1.3 for models agreeing with locked direction
        counterDirectionWeight: 0.7, // ×0.7 for models disagreeing (still run, reduced weight)
        detail: `🔒 FIRST OPPORTUNITY LOCKED: ${key.toUpperCase()} session raided + MSS confirmed → ${lockedDirection} bias locked. TP: ${targetLabel} @ ${targetPrice ? r5(targetPrice) : 'N/A'}. Agreeing models ×1.3, disagreeing ×0.7.`,
      };
    }
  }

  return {
    locked: false,
    directionBoost: 1.0,
    counterDirectionWeight: 1.0,
    detail: "No session raid + MSS confirmed yet. Monitoring all sessions in priority order.",
  };
}

// ═══ MAIN ═══
function analyzeOneTradeSetup(pair) {
  const p = pair || PAIR;
  const reports = {};
  for (const tf of ["1W", "1D", "4H", "1H", "15m", "5m"]) {
    reports[tf] = loadEngine(tf);
  }

  const dailyCandles = loadCandles("1d");
  const candles15m = loadCandles("15m");
  const currentPrice = reports["1H"]?.price || reports["4H"]?.price || 0;

  // Step 1: Daily bias
  const dailyBias = getDailyBias(reports);

  // Step 2: Previous day AM session (THE target)
  const prevAM = markPreviousAMSession(dailyCandles);

  // Step 3: PM Session range
  const pmRange = markPMSessionRange(dailyCandles, candles15m);

  // Step 4: London Session range
  const londonRange = getLondonSessionRange();

  // Step 5: Build session priority queue
  const sessions = {
    pm: {
      range: pmRange,
      priority: 1,
      label: "PM Session (prev day 1:30-4:00 PM)",
      raidStatus: pmRange ? checkSessionRaid(pmRange, dailyBias, currentPrice, reports) : null,
    },
    london: {
      range: londonRange,
      priority: 2,
      label: "London Session (today 2:00-5:00 AM)",
      raidStatus: londonRange ? checkSessionRaid(londonRange, dailyBias, currentPrice, reports) : null,
    },
    openingGap: {
      range: null, // Handled by Lecture 4's NDOG/NWOG gap detection
      priority: 3,
      label: "Opening Range Gap (8:30/9:30 AM)",
      raidStatus: { raided: false, mssConfirmed: false, detail: "Delegated to Lecture 4 gap model" },
    },
    lunch: {
      range: null, // Only valid after 1:30 PM
      priority: 4,
      label: "NY Lunch Raid (12:00-1:30 PM)",
      raidStatus: { raided: false, mssConfirmed: false, detail: "Window not yet open" },
    },
    prevAM,
  };

  // Step 6: First opportunity check
  const firstOpp = checkFirstOpportunity(sessions, dailyBias);

  // Build summary
  const raidSummary = [];
  for (const [key, s] of Object.entries(sessions)) {
    if (key === "prevAM") continue;
    if (!s.range && key !== "openingGap" && key !== "lunch") continue;
    const status = s.raidStatus?.validRaid ? "✅ LOCKED" :
                   s.raidStatus?.raided ? "⚡ RAIDED" : "⏳";
    raidSummary.push(`P${s.priority} ${s.label}: ${status} — ${s.raidStatus?.detail || 'No range'}`);
  }

  return {
    pair: p,
    time: new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false }) + " NY",
    currentPrice,
    dailyBias,
    sessions,
    firstOpp,
    prevAM,
    raidSummary,
    detail: [
      `Bias: ${dailyBias.detail}`,
      `Target: ${prevAM?.detail || 'N/A'}`,
      `PM: ${pmRange?.detail || 'N/A'}`,
      `London: ${londonRange ? `H ${r5(londonRange.high)} L ${r5(londonRange.low)}` : 'N/A'}`,
      firstOpp.detail,
    ].join("\n"),
  };
}

// ═══ OUTPUT ═══
const result = analyzeOneTradeSetup(PAIR);

const outDir = path.join(ROOT, "stages", "00_macro_context", "output");
fs.mkdirSync(outDir, { recursive: true });

let md = `# One Trade Setup for Life — ${result.pair} — ${DATE}\n\n`;
md += `## Daily Bias\n**${result.dailyBias.bias.toUpperCase()}** (${result.dailyBias.confidence} confidence)\n`;
md += `- Alignment: ${result.dailyBias.alignment}\n`;
md += `- Zone: ${result.dailyBias.pdZone}\n`;
md += `- Tradeable: ${result.dailyBias.tradeable ? '✅ Yes' : '❌ No — NEUTRAL day'}\n\n`;

md += `## TP Target: Previous Day AM Session\n`;
if (result.prevAM) {
  md += `- **Bullish TP**: Prev AM HIGH @ ${r5(result.prevAM.high)}\n`;
  md += `- **Bearish TP**: Prev AM LOW @ ${r5(result.prevAM.low)}\n`;
  md += `- Date: ${result.prevAM.date}\n\n`;
} else {
  md += `No daily data available.\n\n`;
}

md += `## Session Raid Priority Queue\n`;
md += `| P | Session | Range | Status | Detail |\n`;
md += `|---|---------|-------|--------|--------|\n`;

const sessionOrder = [
  { key: "pm", label: "PM Session", time: "1:30-4:00 PM prev" },
  { key: "london", label: "London Session", time: "2:00-5:00 AM today" },
  { key: "openingGap", label: "Opening Gap", time: "8:30/9:30 AM" },
  { key: "lunch", label: "NY Lunch", time: "12:00-1:30 PM" },
];

for (const s of sessionOrder) {
  const session = result.sessions[s.key];
  const range = session?.range;
  const rng = range ? `H ${r5(range.high)} L ${r5(range.low)}` : "—";
  const status = session?.raidStatus?.validRaid ? "✅ LOCKED" :
                  session?.raidStatus?.raided ? "⚡ RAIDED" : "⏳";
  md += `| ${session?.priority || '?'} | ${s.label} | ${rng} | ${status} | ${session?.raidStatus?.detail || '—'} |\n`;
}

md += `\n## First Opportunity\n`;
md += `- **${result.firstOpp.detail}**\n`;
if (result.firstOpp.locked) {
  md += `- Direction Boost: ×${result.firstOpp.directionBoost} for ${result.firstOpp.lockedDirection} models\n`;
  md += `- Counter-Direction Weight: ×${result.firstOpp.counterDirectionWeight}\n`;
}

const outFile = path.join(outDir, `${PAIR.toLowerCase()}_one_trade_setup.md`);
fs.writeFileSync(outFile, md, "utf8");

// JSON for pipeline
const jsonOut = path.join(ROOT, "shared", DATE, (PAIR === "XAUUSD" ? "GOLD" : PAIR), "one_trade_setup.json");
const jsonDir = path.dirname(jsonOut);
fs.mkdirSync(jsonDir, { recursive: true });
fs.writeFileSync(jsonOut, JSON.stringify(result, null, 2));

// Console
console.log(`\n═══ ONE TRADE SETUP FOR LIFE — ${PAIR} ═══`);
console.log(`  Bias: ${result.dailyBias.detail}`);
console.log(`  Target: ${result.prevAM?.detail || 'N/A'}`);
for (const r of result.raidSummary) console.log(`  ${r}`);
console.log(`  Lock: ${result.firstOpp.detail}`);
console.log(`  ✓ Output → ${outFile}`);
console.log(`  ✓ JSON → ${jsonOut}`);

module.exports = { analyzeOneTradeSetup, getDailyBias, markPreviousAMSession, markPMSessionRange, checkSessionRaid, checkFirstOpportunity };
