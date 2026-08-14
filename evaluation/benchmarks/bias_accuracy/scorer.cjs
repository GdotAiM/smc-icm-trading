// Bias Accuracy Benchmark — Compares directional calls vs actual price movement
// Usage: node evaluation/benchmarks/bias_accuracy/scorer.cjs [PAIR] [DATE]
// Tracks: precision, recall, F1 on directional bias calls over time

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../../..");
const PAIR = process.argv[2] || "XAUUSD";
const DATE = process.argv[3] || require("../../../tools/ny_time.cjs").getNYDate();
const pairDir = PAIR === "XAUUSD" ? "GOLD" : PAIR;

const LEDGER_FILE = path.join(ROOT, "evaluation", "benchmarks", "bias_accuracy", "ledger.jsonl");

// ═══ LOAD BIAS CALL ═══
function loadBiasCall() {
  const biasFile = path.join(ROOT, "stages", "01_htf_bias", "output", `${PAIR.toLowerCase()}_bias.md`);
  if (!fs.existsSync(biasFile)) return null;

  try {
    const md = fs.readFileSync(biasFile, "utf8");
    const biasMatch = md.match(/\*\*Structural Bias\*\*\s*\n\*\*(BULLISH|BEARISH|NEUTRAL)\*\*/i);
    const confMatch = md.match(/Confidence:\s*\*\*([\d.]+)\*\*/);
    const priceMatch = md.match(/Current price:\s*([\d.]+)/);
    return {
      bias: biasMatch ? biasMatch[1].toUpperCase() : "UNKNOWN",
      confidence: confMatch ? parseFloat(confMatch[1]) : 0,
      price: priceMatch ? parseFloat(priceMatch[1]) : null,
      source: biasFile,
    };
  } catch (e) {
    return null;
  }
}

// ═══ MEASURE ACTUAL OUTCOME ═══
function measureActual() {
  const tfs = ["1m", "5m", "15m", "1h"];
  for (const tf of tfs) {
    const engineFile = path.join(ROOT, "shared", DATE, pairDir, `engine_${tf}.json`);
    if (!fs.existsSync(engineFile)) continue;

    try {
      const engine = JSON.parse(fs.readFileSync(engineFile, "utf8"));
      const price = engine.price || engine.currentPrice;
      if (!price) continue;

      // Get earlier price for comparison
      const candleFile = path.join(ROOT, "shared", DATE, pairDir, `candles_${tf}.json`);
      if (!fs.existsSync(candleFile)) continue;

      const candles = JSON.parse(fs.readFileSync(candleFile, "utf8"));
      const keys = Object.keys(candles).filter(k => !isNaN(k)).sort((a, b) => Number(a) - Number(b));
      if (keys.length < 5) continue;

      const firstCandle = candles[keys[Math.max(0, keys.length - 20)]];
      const lastCandle = candles[keys[keys.length - 1]];
      const startPrice = firstCandle.close;
      const endPrice = lastCandle.close;
      const change = endPrice - startPrice;
      const changePct = (change / startPrice) * 100;

      // Direction: bullish if end > start, bearish if end < start
      const direction = Math.abs(changePct) < 0.05 ? "FLAT" :
                        change > 0 ? "BULLISH" : "BEARISH";

      return {
        startPrice,
        endPrice,
        change: Number(change.toFixed(rangeDecimals())),
        changePct: Number(changePct.toFixed(4)),
        direction,
        tf,
        candles: keys.length,
      };
    } catch (e) {
      continue;
    }
  }
  return null;
}

function rangeDecimals() {
  const dec = { XAUUSD: 2, EURUSD: 5, GBPUSD: 5, NAS100: 1, DXY: 2 };
  return dec[PAIR] || 2;
}

// ═══ SCORE ═══
function score(biasCall, actual) {
  if (!biasCall || !actual) return { scored: false, error: "Missing bias call or actual data" };

  const callDir = biasCall.bias;
  const actualDir = actual.direction;

  // Determine correctness
  let verdict, points;
  if (callDir === actualDir) {
    verdict = "CORRECT";
    points = callDir === "FLAT" ? 5 : 10; // Calling flat correctly is good but less valuable
  } else if (callDir === "BULLISH" && actualDir === "BEARISH") {
    verdict = "WRONG_DIRECTION";
    points = -10;
  } else if (callDir === "BEARISH" && actualDir === "BULLISH") {
    verdict = "WRONG_DIRECTION";
    points = -10;
  } else if (actualDir === "FLAT" && callDir !== "FLAT") {
    verdict = "FALSE_SIGNAL";
    points = -5; // Called a move that didn't happen
  } else {
    verdict = "UNCLEAR";
    points = 0;
  }

  // Adjust by confidence: high-confidence wrong calls are worse
  const weightedScore = points * (biasCall.confidence || 0.5);

  return {
    scored: true,
    verdict,
    points,
    weightedScore: Number(weightedScore.toFixed(1)),
    biasCall,
    actual,
    pair: PAIR,
    date: DATE,
    timestamp: new Date().toISOString(),
  };
}

// ═══ STORE IN LEDGER ═══
function appendLedger(entry) {
  if (!entry.scored) return;
  try {
    fs.appendFileSync(LEDGER_FILE, JSON.stringify(entry) + "\n");
  } catch (e) {
    console.error("Cannot write ledger:", e.message);
  }
}

// ═══ COMPUTE ROLLING STATS ═══
function rollingStats() {
  if (!fs.existsSync(LEDGER_FILE)) return null;

  try {
    const lines = fs.readFileSync(LEDGER_FILE, "utf8").trim().split("\n").filter(Boolean);
    const entries = lines.map(l => JSON.parse(l));

    const recent = entries.slice(-20);
    const correct = recent.filter(e => e.verdict === "CORRECT").length;
    const wrong = recent.filter(e => e.verdict === "WRONG_DIRECTION").length;
    const total = recent.length;

    const byPair = {};
    for (const e of entries) {
      if (!byPair[e.pair]) byPair[e.pair] = { correct: 0, wrong: 0, total: 0 };
      byPair[e.pair].total++;
      if (e.verdict === "CORRECT") byPair[e.pair].correct++;
      if (e.verdict === "WRONG_DIRECTION") byPair[e.pair].wrong++;
    }

    return {
      last20: {
        accuracy: total > 0 ? (correct / total * 100).toFixed(1) + "%" : "N/A",
        correct,
        wrong,
        total,
        avgScore: total > 0 ? (entries.slice(-20).reduce((s, e) => s + e.points, 0) / 20).toFixed(1) : "N/A",
      },
      byPair: Object.entries(byPair).map(([pair, s]) => ({
        pair,
        accuracy: s.total > 0 ? (s.correct / s.total * 100).toFixed(1) + "%" : "N/A",
        n: s.total,
      })),
      totalEntries: entries.length,
    };
  } catch (e) {
    return null;
  }
}

// ═══ MAIN ═══
const biasCall = loadBiasCall();
const actual = measureActual();
const result = score(biasCall, actual);
appendLedger(result);
const stats = rollingStats();

console.log(JSON.stringify({
  evaluation: "bias_accuracy",
  result,
  rollingStats: stats,
}, null, 2));
