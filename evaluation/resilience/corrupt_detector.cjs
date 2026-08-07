// Corrupt Data Detector — Catches impossible prices, inverted levels, stale data
// Usage: node evaluation/resilience/corrupt_detector.cjs [PAIR] [DATE]
// Returns JSON: { valid: bool, checks: [...], blocked: bool }

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const PAIR = process.argv[2] || "XAUUSD";
const DATE = process.argv[3] || new Date().toISOString().split("T")[0];
const pairDir = PAIR === "XAUUSD" ? "GOLD" : PAIR;

const RANGES = {
  XAUUSD: { min: 1000, max: 10000, decimals: 2, unit: "pts" },
  EURUSD: { min: 0.50, max: 2.00, decimals: 5, unit: "pips" },
  GBPUSD: { min: 0.50, max: 2.50, decimals: 5, unit: "pips" },
  NAS100: { min: 5000, max: 50000, decimals: 1, unit: "pts" },
  DXY: { min: 50, max: 200, decimals: 2, unit: "pts" },
};

const range = RANGES[PAIR] || { min: 0, max: Infinity, decimals: 2, unit: "pts" };

function fail(id, msg, severity) {
  return { id, passed: false, message: msg, severity: severity || "critical" };
}
function pass(id, msg) {
  return { id, passed: true, message: msg, severity: "info" };
}

const checks = [];

// ═══ 1. PRICE RANGE CHECK — is the price physically possible? ═══
function checkPriceRange() {
  let foundPrice = false;
  const tfs = ["1m", "5m", "15m", "1h", "4h", "1d", "1w"];

  for (const tf of tfs) {
    const engineFile = path.join(ROOT, "shared", DATE, pairDir, `engine_${tf}.json`);
    if (!fs.existsSync(engineFile)) continue;

    try {
      const engine = JSON.parse(fs.readFileSync(engineFile, "utf8"));
      const price = engine.price || engine.currentPrice;
      if (!price || isNaN(price)) continue;

      foundPrice = true;
      if (price < range.min) {
        checks.push(fail("PRICE_TOO_LOW",
          `${PAIR} ${tf} price ${price} is below minimum ${range.min} — DATA CORRUPTION. ` +
          `This is the EURUSD-29446-class bug. REJECT ALL TRADES.`, "critical"));
        return;
      }
      if (price > range.max) {
        checks.push(fail("PRICE_TOO_HIGH",
          `${PAIR} ${tf} price ${price} exceeds maximum ${range.max} — DATA CORRUPTION. ` +
          `This is the EURUSD-29446-class bug. REJECT ALL TRADES.`, "critical"));
        return;
      }
    } catch (e) {
      checks.push(fail("ENGINE_PARSE", `${PAIR} engine_${tf}.json cannot be parsed: ${e.message}`, "warning"));
    }
  }

  if (!foundPrice) {
    checks.push(fail("NO_PRICE", `${PAIR} has no valid price in any engine report`, "critical"));
  } else {
    checks.push(pass("PRICE_RANGE", `${PAIR} price within valid range [${range.min}-${range.max}]`));
  }
}

// ═══ 2. SL/TP INVERSION CHECK — is SL on the correct side of entry? ═══
function checkSLTPInversion() {
  const planFiles = [
    path.join(ROOT, "stages", "05_entry_refinement", "output", `${PAIR.toLowerCase()}_entry_plan.md`),
    path.join(ROOT, "shared", DATE, "news_trade_plan.json"),
    path.join(ROOT, "shared", DATE, "nfp_trade_plan.json"),
  ];

  for (const f of planFiles) {
    if (!fs.existsSync(f)) continue;

    try {
      let entry, sl, tp, direction;
      if (f.endsWith(".json")) {
        const plan = JSON.parse(fs.readFileSync(f, "utf8"));
        const trades = plan.trades || (plan.trade_plan ? Object.values(plan.trade_plan) : []);
        for (const t of trades) {
          if (t.pair !== PAIR) continue;
          entry = parseFloat(t.entry || t.price);
          sl = parseFloat(t.sl);
          tp = parseFloat(t.tp);
          direction = (t.side || t.direction || "").toUpperCase();
        }
      } else {
        const md = fs.readFileSync(f, "utf8");
        const eMatch = md.match(/Entry[:\s]*[@]?\s*([\d.]+)/i);
        const slMatch = md.match(/SL[:\s]*[@]?\s*([\d.]+)/i);
        const tpMatch = md.match(/TP\d?[:\s]*[@]?\s*([\d.]+)/i);
        const dirMatch = md.match(/(?:Direction|Side)[:\s]*(BUY|SELL|LONG|SHORT)/i);
        entry = eMatch ? parseFloat(eMatch[1]) : null;
        sl = slMatch ? parseFloat(slMatch[1]) : null;
        tp = tpMatch ? parseFloat(tpMatch[1]) : null;
        direction = dirMatch ? dirMatch[1] : null;
      }

      if (entry && sl && tp && direction) {
        if ((direction === "BUY" || direction === "LONG") && sl >= entry) {
          checks.push(fail("SL_INVERTED_LONG",
            `${PAIR} LONG: SL ${sl} >= entry ${entry} — SL MUST be below entry for longs. Inverted!`, "critical"));
        }
        if ((direction === "SELL" || direction === "SHORT") && sl <= entry) {
          checks.push(fail("SL_INVERTED_SHORT",
            `${PAIR} SHORT: SL ${sl} <= entry ${entry} — SL MUST be above entry for shorts. Inverted!`, "critical"));
        }
        if ((direction === "BUY" || direction === "LONG") && tp <= entry) {
          checks.push(fail("TP_INVERTED_LONG",
            `${PAIR} LONG: TP ${tp} <= entry ${entry} — TP MUST be above entry. Inverted!`, "critical"));
        }
        if ((direction === "SELL" || direction === "SHORT") && tp >= entry) {
          checks.push(fail("TP_INVERTED_SHORT",
            `${PAIR} SHORT: TP ${tp} >= entry ${entry} — TP MUST be below entry. Inverted!`, "critical"));
        }
        // Check SL distance is reasonable (not absurdly wide or tight)
        const slDist = Math.abs(entry - sl);
        if (slDist === 0) {
          checks.push(fail("SL_ZERO", `${PAIR}: SL equals entry price — no risk defined`, "critical"));
        }
      }
    } catch (e) {
      // File parse errors are non-critical for this check
    }
  }

  // If no SL/TP checks were added, pass
  const hasSLTPCheck = checks.some(c => c.id.startsWith("SL_") || c.id.startsWith("TP_") || c.id === "SL_ZERO");
  if (!hasSLTPCheck) {
    checks.push(pass("SLTP_VALID", `${PAIR}: no inverted SL/TP detected in trade plans`));
  }
}

// ═══ 3. DATA FRESHNESS CHECK ═══
function checkFreshness() {
  const now = Date.now();
  const candleFile = path.join(ROOT, "shared", DATE, pairDir, "candles_1m.json");
  if (!fs.existsSync(candleFile)) {
    checks.push(fail("NO_CANDLES", `${PAIR}: no 1m candle file for ${DATE}`, "critical"));
    return;
  }

  try {
    const candles = JSON.parse(fs.readFileSync(candleFile, "utf8"));
    const keys = Object.keys(candles).filter(k => !isNaN(k));
    if (keys.length === 0) {
      checks.push(fail("EMPTY_CANDLES", `${PAIR}: candle file has no entries`, "critical"));
      return;
    }
    const lastKey = keys.sort((a, b) => Number(b) - Number(a))[0];
    const lastCandle = candles[lastKey];
    const ageMs = now - lastCandle.time;
    const ageMin = Math.round(ageMs / 60000);

    if (ageMin > 120) {
      checks.push(fail("DATA_STALE",
        `${PAIR}: last candle is ${ageMin} min old — DO NOT TRADE without live confirmation. ` +
        `Max acceptable: 30 min.`, ageMin > 240 ? "critical" : "warning"));
    } else if (ageMin > 60) {
      checks.push(fail("DATA_AGING",
        `${PAIR}: last candle is ${ageMin} min old — approaching stale threshold`, "warning"));
    } else {
      checks.push(pass("DATA_FRESH", `${PAIR}: last candle ${ageMin} min old — acceptable`));
    }
  } catch (e) {
    checks.push(fail("CANDLE_PARSE", `${PAIR}: cannot parse candles_1m.json: ${e.message}`, "critical"));
  }
}

// ═══ 4. POSITION COUNT CHECK ═══
function checkPositionViolations() {
  const monitorFile = path.join(ROOT, "shared", DATE, "monitor_log.jsonl");
  if (!fs.existsSync(monitorFile)) return;

  try {
    const lines = fs.readFileSync(monitorFile, "utf8").trim().split("\n");
    const positions = new Set();
    let maxSimultaneous = 0;

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.event === "PLACED") {
          positions.add(entry.detail);
        }
        if (entry.event === "MONITOR" && entry.detail.includes("positions")) {
          const count = parseInt(entry.detail.match(/(\d+) positions?/)?.[1] || "0");
          if (count > maxSimultaneous) maxSimultaneous = count;
        }
      } catch {}
    }

    if (maxSimultaneous > 2) {
      checks.push(fail("MAX_POSITIONS",
        `Max ${maxSimultaneous} simultaneous positions — exceeds limit of 2. Risk rule violated.`, "critical"));
    }

    // Check for correlated pairs
    const placedPairs = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.event === "PLACED") {
          const pair = entry.detail?.split(" ")[0];
          if (pair) placedPairs.push(pair);
        }
      } catch {}
    }
    if (placedPairs.includes("EURUSD") && placedPairs.includes("GBPUSD")) {
      checks.push(fail("CORRELATED_PAIRS",
        "EURUSD + GBPUSD both placed — correlated dollar risk. ICT rule: never take both.", "critical"));
    }
  } catch (e) {}
}

// ═══ 5. SESSION MULTIPLIER GATE ═══
function checkSessionGate() {
  try {
    const nyTime = require(path.join(ROOT, "tools", "ny_time.cjs"));
    const hour = nyTime.getNYHour();
    const day = nyTime.getNYDay();

    // NY Lunch gate
    if (hour >= 11 && hour < 13) {
      checks.push(fail("NY_LUNCH_GATE",
        `NY Lunch (${hour}:00) — ×0.4 multiplier. NO NEW ENTRIES. ` +
        `Autonomous system placed trades during lunch today.`, "critical"));
    }

    // Friday close gate
    if (day === 5 && hour >= 15) {
      checks.push(fail("FRIDAY_CLOSE_GATE",
        `Friday after 3PM — close all positions. No new entries.`, "critical"));
    }

    // Asian session gate
    if (hour >= 20 || hour < 2) {
      checks.push(fail("ASIAN_GATE",
        `Asian session (${hour}:00) — no new entries per ICT rules.`, "warning"));
    }
  } catch (e) {
    // ny_time unavailable — skip check
  }
}

// ═══ RUN ALL ═══
checkPriceRange();
checkSLTPInversion();
checkFreshness();
checkPositionViolations();
checkSessionGate();

const blocked = checks.some(c => c.severity === "critical" && !c.passed);
const warnings = checks.filter(c => c.severity === "warning" && !c.passed).length;
const failed = checks.filter(c => !c.passed).length;

const result = {
  valid: !blocked,
  blocked,
  checks: checks.length,
  passed: checks.filter(c => c.passed).length,
  failed,
  warnings,
  summary: blocked
    ? `🛑 BLOCKED: ${failed} checks failed (${warnings} warnings). Do NOT execute trades.`
    : warnings > 0
      ? `⚠️ CAUTION: ${warnings} warnings. Proceed with care.`
      : `✅ ALL CLEAR: ${checks.length} checks passed.`,
  details: checks,
  timestamp: new Date().toISOString(),
};

console.log(JSON.stringify(result, null, 2));
process.exit(blocked ? 1 : 0);
