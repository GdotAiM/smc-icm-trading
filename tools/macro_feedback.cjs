// macro_feedback.cjs — Timed session feedback agent
//
// Delivers structured, time-aware market feedback during ICT macro windows.
//
// Based on ICT lecture 2026-08-31:
//
//   "Every hour, the last 10 minutes of the hour that's closing and the first
//    10 minutes of the new hour, that's our macro time. So we're looking for
//    that little sweet spot in terms of time to justify the underlying narrative."
//
//   "If it consolidates like it's doing here, that's problematic. So when we have
//    that occur immediately after macro time, we would want to see it obviously
//    behave in a way where it can use this little consolidation and then it's like
//    a delay. I don't like to see that."
//
//   "The macro doesn't give you directional intel at all. It just gives you a time
//    at which price should start spooling. It means you want to see it start doing
//    whatever you expected with your other analysis concepts."
//
// Three delivery modes:
//   --now        — single snapshot of current state
//   --watch      — polling mode (checks every N seconds, defaults to 60s)
//   --summary    — end-of-session summary from journal data
//
// Usage:
//   node tools/macro_feedback.cjs <PAIR> [--now|--watch [seconds]|--summary]

const fs = require("fs");
const path = require("path");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..");
const DATE = require("./ny_time.cjs").getNYDate();
const PAIR = (process.argv[2] || "EURUSD").toUpperCase();
const dir = PAIR === "XAUUSD" ? "GOLD" : PAIR;

const ny = require("./ny_time.cjs");
const nyHour = ny.getNYHour();
const nyMin = ny.getNYMin();
const nySec = new Date().getSeconds();
const nyTS = () => `${String(nyHour).padStart(2, "0")}:${String(nyMin).padStart(2, "0")}`;

function r5(v) { return Number(v).toFixed(5); }
function r2(v) { return Number(v).toFixed(2); }

// ─── Load data ────────────────────────────────────────────────────────────────
function loadData(tf) {
  const candlesF = path.join(ROOT, "shared", DATE, dir, `candles_${tf}.json`);
  const engineF = path.join(ROOT, "shared", DATE, dir, `engine_${tf}.json`);
  try { return { candles: JSON.parse(fs.readFileSync(candlesF, "utf8")), engine: JSON.parse(fs.readFileSync(engineF, "utf8")) }; }
  catch { return { candles: null, engine: null }; }
}

// ─── 1. IS WE IN MACRO TIME? ─────────────────────────────────────────────────
// Last 10 min of hour (50-59) + first 10 min of next hour (00-09)
function inMacroTime() {
  return nyMin >= 50 || nyMin < 10;
}

function macroWindowLabel() {
  if (nyMin >= 50) return `Closing macro (${nyHour}:50–${nyHour + 1}:00)`;
  if (nyMin < 10) return `Opening macro (${nyHour - 1}:50–${nyHour}:10)`;
  return "Outside macro window";
}

function minutesToNextMacro() {
  if (nyMin >= 50) return 60 - nyMin + 10;  // min until next hour's macro starts
  if (nyMin < 10) return 10 - nyMin;        // min remaining in current macro
  return nyMin < 50 ? 50 - nyMin : 0;
}

// ─── 2. WHAT IS PRICE DOING RIGHT NOW? ───────────────────────────────────────
function currentSessionState(candles1m, candles5m, engine1m, engine5m) {
  if (!candles1m || candles1m.length < 5) return null;
  const latest = candles1m[candles1m.length - 1];
  const prev5 = candles1m[Math.max(0, candles1m.length - 5)];

  const priceChange5m = latest.close - prev5.close;
  const priceChangePct = prev5.close !== 0 ? (priceChange5m / prev5.close) * 100 : 0;
  const inPremium = engine5m?.pdArray?.inPremium === true;
  const inDiscount = engine5m?.pdArray?.inDiscount === true;
  const pdZone = inPremium ? "PREMIUM" : inDiscount ? "DISCOUNT" : "EQUILIBRIUM";

  // Where is price relative to yesterday's settlement (RTH)?
  const rthSettlement = engine5m?.sessionLevels?.rthSettlement;
  const distFromRTH = rthSettlement ? ((latest.close - rthSettlement) / rthSettlement) * 100 : null;
  const gapType = distFromRTH !== null
    ? (distFromRTH > 0.05 ? "premium_gap" : distFromRTH < -0.05 ? "discount_gap" : "no_gap")
    : "unknown";

  // Recent candle behavior (last 5 1m bars)
  const recent5 = candles1m.slice(-5);
  const upBodies = recent5.filter(c => c.close > c.open).length;
  const downBodies = recent5.filter(c => c.close < c.open).length;
  const avgBody = recent5.reduce((s, c) => s + Math.abs(c.close - c.open), 0) / 5;
  const netDirection = upBodies > downBodies ? "bullish" : downBodies > upBodies ? "bearish" : "neutral";

  return {
    price: r5(latest.close),
    change_5m: r5(priceChange5m),
    change_5m_pct: r2(priceChangePct),
    pd_zone: pdZone,
    gap_type: gapType,
    dist_from_rth: distFromRTH ? r2(distFromRTH) : null,
    recent_direction: netDirection,
    candle_split: `${upBodies}↑/${downBodies}↓`,
    avg_body_size: r5(avgBody),
  };
}

// ─── 3. WHAT DOES PRICE WANT TO DO? (Draw-on-liquidity) ──────────────────────
function expectedDraw(candles, engine, dailyBias) {
  if (!engine?.liquidity) return null;

  const price = candles[candles.length - 1]?.close;
  if (!price) return null;

  const bsl = engine.liquidity.highs?.filter(p => !p.swept).sort((a, b) => a.price - b.price)[0];
  const ssl = engine.liquidity.lows?.filter(p => !p.swept).sort((a, b) => b.price - a.price)[0];

  const distToBSL = bsl ? (bsl.price - price) / price * 100 : null;
  const distToSSL = ssl ? (price - ssl.price) / price * 100 : null;

  // Which side is closer?
  const closerSide = distToBSL !== null && distToSSL !== null
    ? (distToBSL < distToSSL ? "BSL" : "SSL")
    : distToBSL !== null ? "BSL" : distToSSL !== null ? "SSL" : "none";

  const expectedDirection = closerSide === "BSL" ? "long" : closerSide === "SSL" ? "short" : "neutral";

  return {
    nearest_bsl: bsl ? r5(bsl.price) : null,
    dist_to_bsl_pct: distToBSL ? r2(distToBSL) : null,
    nearest_ssl: ssl ? r5(ssl.price) : null,
    dist_to_ssl_pct: distToSSL ? r2(distToSSL) : null,
    closer_draw: closerSide,
    expected_direction: expectedDirection,
    narrative: dailyBias !== "neutral"
      ? `${dailyBias.toUpperCase()} bias — expecting draw toward ${dailyBias === "bullish" ? "BSL" : "SSL"} (${closerSide})`
      : `Neutral — draw depends on which liquidity pool price reaches first`,
  };
}

// ─── 4. IS PRICE BEHAVING AS EXPECTED? ───────────────────────────────────────
function behaviorAlignment(expected, current, macroActive) {
  if (!expected || !current) return null;

  const matches = () => {
    if (expected.expected_direction === "long" && current.recent_direction === "bullish") return true;
    if (expected.expected_direction === "short" && current.recent_direction === "bearish") return true;
    return false;
  };

  const aligned = matches();
  const concern = !aligned && macroActive;

  let verdict = "ALIGNING";
  let hint = "";

  if (aligned && macroActive) {
    verdict = "CONFIRMED";
    hint = "Price moving toward the draw during macro time. This is the sweet spot — watch for continuation.";
  } else if (aligned) {
    verdict = "BUILDING";
    hint = "Direction matches the draw, but not in macro time yet. Patience — wait for the 10-minute window.";
  } else if (concern) {
    verdict = "MISALIGNMENT";
    hint = "Price moving AGAINST the expected draw during macro time. This is problematic. Reduce size or wait.";
  } else {
    verdict = "DIVERGING";
    hint = "Price is moving against the expected draw outside macro time. Could be normal range behavior — don't overreact.";
  }

  return { verdict, aligned, concern, hint };
}

// ─── OUTPUT FORMATTER ─────────────────────────────────────────────────────────
function formatReport(pair, tf, state, draw, behavior, macroActive) {
  const lines = [];
  lines.push(`═══════════════════════════════════════════════════════`);
  lines.push(`  MACRO FEEDBACK — ${pair}  |  ${DATE}  ${nyTS()}`);
  lines.push(`═══════════════════════════════════════════════════════`);
  lines.push("");

  // Time context
  lines.push(`🕐 TIME CONTEXT`);
  lines.push(`   Window: ${macroWindowLabel()}`);
  if (macroActive) {
    lines.push(`   ⚡ MACRO ACTIVE — price should commit within 10 min`);
  } else {
    lines.push(`   Next macro in ~${minutesToNextMacro()} min`);
  }
  lines.push("");

  // Current state
  if (state) {
    lines.push(`📊 CURRENT STATE`);
    lines.push(`   Price: ${state.price}  |  5m change: ${state.change_5m} (${state.change_5m_pct}%)`);
    lines.push(`   PD Zone: ${state.pd_zone}  |  Gap: ${state.gap_type}`);
    lines.push(`   Recent: ${state.candle_split}  (${state.recent_direction})`);
    lines.push("");
  }

  // Draw on liquidity
  if (draw) {
    lines.push(`🎯 DRAW ON LIQUIDITY`);
    lines.push(`   Nearest BSL: ${draw.nearest_bsl || "none"}  (${draw.dist_to_bsl_pct ? draw.dist_to_bsl_pct + "%" : "?"})`);
    lines.push(`   Nearest SSL: ${draw.nearest_ssl || "none"}  (${draw.dist_to_ssl_pct ? draw.dist_to_ssl_pct + "%" : "?"})`);
    lines.push(`   Closer draw: ${draw.closer_draw}`);
    lines.push(`   Expectation: ${draw.narrative}`);
    lines.push("");
  }

  // Behavior alignment
  if (behavior) {
    lines.push(`🔍 BEHAVIOR ALIGNMENT`);
    lines.push(`   Verdict: ${behavior.verdict}`);
    lines.push(`   → ${behavior.hint}`);
    lines.push("");
  }

  // Action call
  lines.push(`──── ACTIONS ────`);
  if (macroActive && behavior?.verdict === "CONFIRMED") {
    lines.push(`   ✅ MACRO CONFIRMED — Price aligning with draw. Watch for acceleration.`);
    lines.push(`   📌 Check wick_acceleration.cjs for body-defense signals.`);
    lines.push(`   📌 Check volume_imbalance.cjs for volume confirmation.`);
  } else if (behavior?.verdict === "MISALIGNMENT") {
    lines.push(`   ⚠️ MISALIGNMENT — Price going against expected draw in macro time.`);
    lines.push(`   📌 DO NOT enter. Wait for price to commit or reverse.`);
    lines.push(`   📌 Check if wick defense is breaking on the opposing side.`);
  } else if (macroActive) {
    lines.push(`   👀 WATCHING — In macro time but no clear alignment yet.`);
    lines.push(`   📌 Wait for 1-2 more candles to see commitment.`);
  } else {
    lines.push(`   ⏳ PREGAME — Outside macro window.`);
    lines.push(`   📌 Map your draws. Set alerts at liquidity levels.`);
    lines.push(`   📌 Next macro in ~${minutesToNextMacro()} min.`);
  }
  lines.push("");

  return lines.join("\n");
}

// ─── POLLING MODE ─────────────────────────────────────────────────────────────
function runWatchLoop(pair, intervalSec) {
  const INTERVAL = (intervalSec || 60) * 1000;
  console.log(`🔄 Watching ${pair} every ${intervalSec}s. Press Ctrl+C to stop.`);
  console.log("");

  let lastReport = "";
  let changeCount = 0;

  const tick = () => {
    const report = generateReport(pair);
    if (report !== lastReport) {
      changeCount++;
      lastReport = report;
      console.log(report);
      // Append to session log
      const logFile = path.join(ROOT, "shared", DATE, dir, "macro_feedback.jsonl");
      fs.mkdirSync(path.dirname(logFile), { recursive: true });
      fs.appendFileSync(logFile, JSON.stringify({ ts: new Date().toISOString(), report, changeCount }) + "\n");
    }
  };

  tick(); // immediate first check
  return setInterval(tick, INTERVAL);
}

function generateReport(pair) {
  const { candles: c1m, engine: e1m } = loadData("1m");
  const { candles: c5m, engine: e5m } = loadData("5m");
  const { engine: e1d } = loadData("1d");
  const dailyBias = e1d?.structure?.bias || "neutral";

  const macroActive = inMacroTime();
  const state = currentSessionState(c1m, c5m, e1m, e5m);
  const draw = expectedDraw(c1m, e1m, dailyBias);
  const behavior = behaviorAlignment(draw, state, macroActive);

  return formatReport(pair, "1m", state, draw, behavior, macroActive);
}

// ─── ENTRY POINT ──────────────────────────────────────────────────────────────
const cmd = process.argv[3] || "--now";

if (cmd === "--watch") {
  const interval = parseInt(process.argv[4]) || 60;
  const timer = runWatchLoop(PAIR, interval);
  process.on("SIGINT", () => {
    clearInterval(timer);
    console.log("\n🛑 Watch stopped.");
    process.exit(0);
  });
} else if (cmd === "--summary") {
  // Read from macro feedback log and summarize
  const logFile = path.join(ROOT, "shared", DATE, dir, "macro_feedback.jsonl");
  if (!fs.existsSync(logFile)) {
    console.log("No macro feedback log found. Run with --watch first, then --summary.");
    process.exit(0);
  }
  const entries = fs.readFileSync(logFile, "utf8").trim().split("\n").filter(Boolean).map(l => JSON.parse(l));
  const confirmations = entries.filter(e => e.report.includes("CONFIRMED")).length;
  const misalignments = entries.filter(e => e.report.includes("MISALIGNMENT")).length;
  const total = entries.length;
  console.log(`\n📋 MACRO FEEDBACK SUMMARY — ${PAIR} — ${DATE}`);
  console.log(`   Total checks: ${total}`);
  console.log(`   Confirmed alignment: ${confirmations} (${total > 0 ? r2(confirmations/total*100) : 0}%)`);
  console.log(`   Misalignment warnings: ${misalignments}`);
  console.log(`   Next: Run with --watch to see live, --now for single snapshot.\n`);
} else {
  // Default: --now
  console.log(generateReport(PAIR));
}
