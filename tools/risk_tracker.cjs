// Risk Tracker — Enforces risk limits from _config/risk_parameters.md
// Usage:
//   node tools/risk_tracker.cjs --check          Pre-trade risk gate
//   node tools/risk_tracker.cjs --summary         Full risk state
//   node tools/risk_tracker.cjs --log <json>      Log a completed trade
//   node tools/risk_tracker.cjs --reset           Reset risk state (new day/week)

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const LOG_PATH = path.join(ROOT, "shared", "trade_log.json");
const STATE_PATH = path.join(ROOT, "shared", "risk_state.json");
const { getNYDate } = require("./ny_time.cjs");

// ═══════════════ CONFIG ═══════════════
const CONFIG = {
  initialBalance: 10000,
  maxRiskPerTrade: 0.01,    // 1%
  maxDailyLoss: 0.03,       // 3% = $300
  maxWeeklyLoss: 0.05,      // 5% = $500
  maxPositions: 2,
  drawdownRule: { afterLosses: 3, reduceBy: 0.5, recoverAfterWins: 2 },
};

function r2(v) { return Number(v).toFixed(2); }

// ═══════════════ LOAD/SAVE ═══════════════

function loadTradeLog() {
  try { return JSON.parse(fs.readFileSync(LOG_PATH, "utf8")); }
  catch { return []; }
}

function loadRiskState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, "utf8")); }
  catch {
    return {
      balance: CONFIG.initialBalance,
      peakBalance: CONFIG.initialBalance,
      consecutiveLosses: 0,
      consecutiveWins: 0,
      lastUpdated: null,
    };
  }
}

function saveRiskState(state) {
  state.lastUpdated = new Date().toISOString();
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}

// ═══════════════ COMPUTE ═══════════════

function getWeekKey(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const mon = new Date(d.setDate(diff));
  return mon.toISOString().split("T")[0];
}

function computeRisk(trades, state) {
  const today = getNYDate();
  const thisWeek = getWeekKey(today);

  const todaysTrades = trades.filter(t => t.date === today);
  const weeksTrades = trades.filter(t => getWeekKey(t.date) === thisWeek);

  const dailyPnl = todaysTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const weeklyPnl = weeksTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const balance = state.balance;

  // Drawdown
  const drawdown = state.peakBalance > balance ? (state.peakBalance - balance) / state.peakBalance * 100 : 0;

  // Size multiplier from drawdown rules
  let sizeMultiplier = 1.0;
  if (state.consecutiveLosses >= CONFIG.drawdownRule.afterLosses) {
    sizeMultiplier = CONFIG.drawdownRule.reduceBy;
  }

  // Risk budget calculation
  const dailyLossLimit = CONFIG.initialBalance * CONFIG.maxDailyLoss;
  const weeklyLossLimit = CONFIG.initialBalance * CONFIG.maxWeeklyLoss;
  const dailyLossRemaining = Math.max(0, dailyLossLimit + dailyPnl); // dailyPnl is negative if losing
  const weeklyLossRemaining = Math.max(0, weeklyLossLimit + weeklyPnl);
  const riskBudget = Math.min(dailyLossRemaining, weeklyLossRemaining, balance * CONFIG.maxRiskPerTrade);

  // Determine if trading is allowed
  let allowed = true;
  let reason = "";
  if (dailyPnl <= -dailyLossLimit) { allowed = false; reason = `Daily loss limit reached ($${r2(Math.abs(dailyPnl))} lost, limit $${r2(dailyLossLimit)})`; }
  else if (weeklyPnl <= -weeklyLossLimit) { allowed = false; reason = `Weekly loss limit reached ($${r2(Math.abs(weeklyPnl))} lost, limit $${r2(weeklyLossLimit)})`; }
  else if (dailyLossRemaining < 25) { reason = `Daily loss limit near ($${r2(dailyLossRemaining)} remaining)`; }
  else if (sizeMultiplier < 1.0) { reason = `Size reduced to ×${sizeMultiplier} (${state.consecutiveLosses} consecutive losses)`; }

  const openCount = trades.filter(t => t.status === "OPEN").length;

  return {
    balance: r2(balance),
    peakBalance: r2(state.peakBalance),
    drawdownPct: r2(drawdown),
    dailyPnl: r2(dailyPnl),
    weeklyPnl: r2(weeklyPnl),
    dailyLossLimit: r2(dailyLossLimit),
    weeklyLossLimit: r2(weeklyLossLimit),
    dailyLossRemaining: r2(dailyLossRemaining),
    riskBudget: r2(riskBudget),
    consecutiveLosses: state.consecutiveLosses,
    consecutiveWins: state.consecutiveWins,
    sizeMultiplier: sizeMultiplier,
    openPositions: openCount,
    allowed,
    reason,
  };
}

// ═══════════════ CLI ═══════════════

const args = process.argv.slice(2);
const mode = args[0];

if (mode === "--check") {
  const trades = loadTradeLog();
  const state = loadRiskState();
  const result = computeRisk(trades, state);
  console.log(JSON.stringify(result, null, 2));

} else if (mode === "--summary") {
  const trades = loadTradeLog();
  const state = loadRiskState();
  const result = computeRisk(trades, state);
  console.log(JSON.stringify({
    ...result,
    totalTrades: trades.length,
    todayCount: trades.filter(t => t.date === getNYDate()).length,
    weekCount: trades.filter(t => getWeekKey(t.date) === getWeekKey(getNYDate())).length,
    lastTrade: trades[trades.length - 1] || null,
  }, null, 2));

} else if (mode === "--log") {
  const tradeData = JSON.parse(args[1] || "{}");
  if (!tradeData.pair || !tradeData.direction) {
    console.log(JSON.stringify({ error: "Missing required fields: pair, direction" }));
    process.exit(1);
  }
  const trades = loadTradeLog();
  tradeData.date = tradeData.date || getNYDate();
  tradeData.status = tradeData.status || "CLOSED";
  tradeData.pnl = tradeData.pnl || 0;
  trades.push(tradeData);
  fs.writeFileSync(LOG_PATH, JSON.stringify(trades, null, 2), "utf8");

  // Update risk state
  const state = loadRiskState();
  // WP-15: Number() coercion — r2() returns a string via .toFixed(2).
  // Without coercion, the next log concatentates instead of adds, corrupting to NaN.
  state.balance = r2(Number(state.balance) + Number(tradeData.pnl || 0));
  if (Number(state.balance) > Number(state.peakBalance || 0)) state.peakBalance = Number(state.balance);

  if ((tradeData.pnl || 0) > 0) {
    state.consecutiveWins++;
    state.consecutiveLosses = 0;
    if (state.consecutiveWins >= CONFIG.drawdownRule.recoverAfterWins) {
      state.consecutiveLosses = 0; // Reset drawdown
    }
  } else if ((tradeData.pnl || 0) < 0) {
    state.consecutiveLosses++;
    state.consecutiveWins = 0;
  }
  saveRiskState(state);
  console.log(JSON.stringify({ logged: true, balance: state.balance, consecutiveLosses: state.consecutiveLosses }));

} else if (mode === "--reset") {
  // Reset for new day/week
  const state = loadRiskState();
  state.consecutiveLosses = 0;
  state.consecutiveWins = 0;
  saveRiskState(state);
  console.log(JSON.stringify({ reset: true, balance: state.balance }));

} else {
  console.log(JSON.stringify({
    usage: "node tools/risk_tracker.cjs [--check|--summary|--log|--reset]",
    modes: {
      "--check": "Pre-trade risk gate — returns allowed/blocked status",
      "--summary": "Full risk state with trade counts",
      "--log <json>": "Record a completed trade: {\"pair\":\"EURUSD\",\"direction\":\"SHORT\",\"pnl\":13.5,\"model\":\"Silver Bullet\",\"session\":\"NY AM SB\"}",
      "--reset": "Reset daily streak counters",
    }
  }, null, 2));
}
