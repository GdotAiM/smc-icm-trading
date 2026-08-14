// SMC Structure-Based Backtester
//
// Walks forward through historical 1M candles, detecting SMC patterns
// (swings, liquidity sweeps, MSS, FVGs, order blocks) and simulating
// trade execution with the same management rules as the live MT5 monitor.
//
// Uses engine reports for HTF bias context. Self-contained pattern
// detection on 1M data — no pre-computed signals needed.
//
// Usage:
//   node tools/backtest_sim.cjs GBPUSD 2026-08-02 2026-08-07
//   node tools/backtest_sim.cjs XAUUSD 2026-08-02 2026-08-06 --model "Silver Bullet"
//   node tools/backtest_sim.cjs --all 2026-08-02 2026-08-05
//   node tools/backtest_sim.cjs GBPUSD 2026-08-02 2026-08-07 --json > results.json

const fs = require("fs");
const path = require("path");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..");
const SHARED = path.join(ROOT, "shared");

// ═══ Config ═══
const CONFIG = {
  swingWindow: 5,           // bars for swing detection
  mssConfirmationBars: 2,   // bars after sweep to confirm MSS
  fvgMinGap: 0.00003,       // minimum gap for FVG (0.3 pips forex)
  entryDelay: 1,            // enter 1 bar after signal (simulate reaction time)
  spreadPips: 0.00002,      // 0.2 pips — typical ECN spread
  riskPerTrade: 0.01,       // 1% per trade
  accountSize: 100000,
  dailyLossCap: 0.03,       // 3%
  maxPositions: 2,
  partialClosePct: 0.5,     // close 50% at TP1
  moveBeAtTp1Mid: true,     // move SL to BE at TP1 midpoint
  endOfDayClose: true,      // close all at EOD
  pairs: ["GBPUSD", "EURUSD", "XAUUSD", "NAS100"],
  // Filters
  minSwingSizePips: 3,      // minimum swing size in pips
  signalCooldownBars: 15,   // minimum bars between signals
  mssCloseBeyondPct: 0.3,   // MSS close must be 30% beyond swept level
  atrSlBuffer: 1.5,         // SL buffer = 1.5 × ATR(14) beyond swing
  maxDailySignals: 5,       // max signals per day
};

const PIP_SIZES = {
  GBPUSD: 0.0001, EURUSD: 0.0001,
  XAUUSD: 0.01, NAS100: 0.01, USTEC: 0.01,
};

// ═══ Helpers ═══

function r2(v) { return Math.round(v * 100) / 100; }
function r5(v) { return Math.round(v * 100000) / 100000; }
function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function std(arr) { const m = avg(arr); return Math.sqrt(avg(arr.map(x => (x - m) ** 2))); }
function max(arr) { return arr.length ? Math.max(...arr) : 0; }
function min(arr) { return arr.length ? Math.min(...arr) : 0; }

// ═══ ATR calculation ═══

function calcATR(candles, period = 14, upToIdx = -1) {
  const end = upToIdx >= 0 ? Math.min(upToIdx + 1, candles.length) : candles.length;
  const start = Math.max(0, end - period * 2);
  const trValues = [];

  for (let i = start + 1; i < end; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - p.close),
      Math.abs(c.low - p.close)
    );
    trValues.push(tr);
  }

  if (trValues.length === 0) return 0;
  // Wilder's smoothed ATR
  let atr = avg(trValues.slice(0, period));
  for (let i = period; i < trValues.length; i++) {
    atr = (atr * (period - 1) + trValues[i]) / period;
  }
  return atr;
}

// ═══ Data Loader ═══

function loadCandles(pair, date) {
  const dir = path.join(SHARED, date, pair);
  const file = path.join(dir, "candles_1m.json");
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function loadEngine(pair, date, tf) {
  const dir = path.join(SHARED, date, pair);
  const file = path.join(dir, `engine_${tf}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function dateRange(start, end) {
  const dates = [];
  let cur = new Date(start + "T12:00:00");
  const last = new Date(end + "T12:00:00");
  while (cur <= last) {
    dates.push(cur.toISOString().split("T")[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

// ═══ Swing Detection ═══

function detectSwings(candles, window = 5) {
  const highs = [];
  const lows = [];

  for (let i = window; i < candles.length - window; i++) {
    const c = candles[i];
    let isHigh = true, isLow = true;

    for (let j = i - window; j <= i + window; j++) {
      if (j === i) continue;
      if (candles[j].high >= c.high) isHigh = false;
      if (candles[j].low <= c.low) isLow = false;
    }

    if (isHigh) highs.push({ index: i, price: c.high, time: c.time });
    if (isLow) lows.push({ index: i, price: c.low, time: c.time });
  }

  return { highs, lows };
}

// ═══ FVG Detection ═══

function detectFVG(candles, i) {
  if (i < 2) return null;

  const c0 = candles[i - 2];
  const c2 = candles[i];

  // Bullish FVG: c0.high < c2.low (gap up — imbalance)
  if (c0.high < c2.low && (c2.low - c0.high) >= CONFIG.fvgMinGap) {
    return { type: "bullish", top: c2.low, bottom: c0.high, index: i, time: c2.time };
  }

  // Bearish FVG: c0.low > c2.high (gap down)
  if (c0.low > c2.high && (c0.low - c2.high) >= CONFIG.fvgMinGap) {
    return { type: "bearish", top: c0.low, bottom: c2.high, index: i, time: c2.time };
  }

  return null;
}

// ═══ Liquidity Sweep + MSS Detection ═══

function detectSweepAndMSS(candles, swings, engineBias, startIdx, pair) {
  const signals = [];
  const sweptSwings = new Set();    // dedup: don't re-trade same swing
  let lastSignalIdx = -999;          // cooldown between signals
  const pipSize = PIP_SIZES[pair] || 0.0001;
  const minSwingSize = CONFIG.minSwingSizePips * pipSize / (pair.includes("XAU") ? 100 : pair.includes("NAS") ? 100 : 1);

  // Only use swings of minimum size
  const filteredHighs = swings.highs.filter(sh => {
    // Find nearest low to measure swing size
    const nearLows = swings.lows.filter(sl => Math.abs(sl.index - sh.index) < 15);
    if (nearLows.length === 0) return false;
    const nearestLow = nearLows.reduce((a, b) => Math.abs(a.index - sh.index) < Math.abs(b.index - sh.index) ? a : b);
    return Math.abs(sh.price - nearestLow.price) >= minSwingSize;
  });

  const filteredLows = swings.lows.filter(sl => {
    const nearHighs = swings.highs.filter(sh => Math.abs(sh.index - sl.index) < 15);
    if (nearHighs.length === 0) return false;
    const nearestHigh = nearHighs.reduce((a, b) => Math.abs(a.index - sl.index) < Math.abs(b.index - sl.index) ? a : b);
    return Math.abs(sl.price - nearestHigh.price) >= minSwingSize;
  });

  for (let i = startIdx; i < candles.length - CONFIG.mssConfirmationBars; i++) {
    const c = candles[i];

    // Cooldown: skip if too close to last signal
    if (i - lastSignalIdx < CONFIG.signalCooldownBars) continue;
    // Position limit: skip if 2 signals already fired recently
    const recentSignals = signals.filter(s => s.mssIndex >= i - 30);
    if (recentSignals.length >= CONFIG.maxPositions * 2) continue;

    // Check for sweep of recent swing high (bearish setup)
    for (const sh of filteredHighs) {
      if (sh.index >= i - 20 && sh.index < i && !sweptSwings.has(`H${sh.index}`)) {
        const sweptHigh = c.high > sh.price;
        if (!sweptHigh) continue;

        // MSS: price must close meaningfully below the swept level
        for (let j = i + 1; j <= i + CONFIG.mssConfirmationBars && j < candles.length; j++) {
          const conf = candles[j];
          const closeBeyond = sh.price - conf.close;
          const requiredBeyond = (sh.price - (swings.lows.find(sl => sl.index > sh.index && sl.index < j)?.price || sh.price)) * CONFIG.mssCloseBeyondPct;
          if (conf.close < sh.price && closeBeyond >= pipSize * 0.5) {
            sweptSwings.add(`H${sh.index}`);
            lastSignalIdx = j;
            const fvg = detectFVG(candles, j);
            const atr = calcATR(candles, 14, j);
            const slBuffer = atr * CONFIG.atrSlBuffer;
            signals.push({
              type: "SHORT",
              time: conf.time,
              sweepIndex: i,
              sweepPrice: c.high,
              swingPrice: sh.price,
              mssIndex: j,
              entryPrice: conf.close,
              fvg: fvg,
              sl: sh.price + Math.max(slBuffer, pipSize * 3),
              atr,
              reason: `BSL swept ${sh.price.toFixed(5)}, MSS confirmed at ${conf.close.toFixed(5)}`,
            });
            break;
          }
        }
      }
    }

    // Check for sweep of recent swing low (bullish setup)
    for (const sl of filteredLows) {
      if (sl.index >= i - 20 && sl.index < i && !sweptSwings.has(`L${sl.index}`)) {
        const sweptLow = c.low < sl.price;
        if (!sweptLow) continue;

        for (let j = i + 1; j <= i + CONFIG.mssConfirmationBars && j < candles.length; j++) {
          const conf = candles[j];
          const closeBeyond = conf.close - sl.price;
          if (conf.close > sl.price && closeBeyond >= pipSize * 0.5) {
            sweptSwings.add(`L${sl.index}`);
            lastSignalIdx = j;
            const fvg = detectFVG(candles, j);
            const atr = calcATR(candles, 14, j);
            const slBuffer = atr * CONFIG.atrSlBuffer;
            signals.push({
              type: "LONG",
              time: conf.time,
              sweepIndex: i,
              sweepPrice: c.low,
              swingPrice: sl.price,
              mssIndex: j,
              entryPrice: conf.close,
              fvg: fvg,
              sl: sl.price - Math.max(slBuffer, pipSize * 3),
              atr,
              reason: `SSL swept ${sl.price.toFixed(5)}, MSS confirmed at ${conf.close.toFixed(5)}`,
            });
            break;
          }
        }
      }
    }
  }

  return signals;
}

// ═══ Trade Simulator ═══

function simulateTrade(signal, candles, startIdx, accountBalance) {
  const pipSize = PIP_SIZES[signal.pair] || 0.0001;
  const spread = CONFIG.spreadPips;

  // Entry: next candle open after signal (with spread)
  const entryIdx = Math.min(startIdx + CONFIG.entryDelay, candles.length - 1);
  const entryCandle = candles[entryIdx];
  const entryPrice = signal.type === "LONG"
    ? entryCandle.open + spread
    : entryCandle.open - spread;

  // SL: at the swept swing level (structural invalidation)
  const sl = signal.sl;

  // TP: opposing liquidity — use recent swing on opposite side
  // Fallback: 2:1 R:R
  const riskDist = Math.abs(entryPrice - sl);
  const tp1 = signal.type === "LONG"
    ? entryPrice + riskDist * 1.5   // 1.5R for TP1
    : entryPrice - riskDist * 1.5;
  const tp2 = signal.type === "LONG"
    ? entryPrice + riskDist * 3.0   // 3R for TP2
    : entryPrice - riskDist * 3.0;

  // Position sizing
  const riskDollars = Math.min(
    accountBalance * CONFIG.riskPerTrade,
    accountBalance * CONFIG.dailyLossCap
  );
  const stopPips = riskDist / pipSize;
  const pipValue = signal.pair.includes("XAU") ? 100
    : signal.pair.includes("NAS") || signal.pair.includes("USTEC") ? 1
    : 10;
  let volume = riskDollars / (stopPips * pipValue);
  volume = Math.round(volume * 100) / 100;
  volume = Math.max(0.01, Math.min(volume, 50));

  // Walk forward to simulate trade lifecycle
  let position = {
    type: signal.type,
    entryPrice,
    entryIdx,
    entryTime: entryCandle.time,
    sl, tp1, tp2,
    volume,
    remainingVolume: volume,
    slMovedToBe: false,
    partialClosed: false,
    partialCloseIdx: -1,
    exitPrice: null,
    exitIdx: -1,
    exitReason: null,
    pnl: 0,
    bars: [],
  };

  const isLong = signal.type === "LONG";

  for (let i = entryIdx + 1; i < candles.length; i++) {
    const c = candles[i];
    position.bars.push({ idx: i, o: c.open, h: c.high, l: c.low, c: c.close });

    // Check if SL hit (use low for longs, high for shorts)
    const slHit = isLong ? c.low <= position.sl : c.high >= position.sl;

    if (slHit) {
      position.exitPrice = position.sl;
      position.exitIdx = i;
      position.exitReason = position.slMovedToBe ? "BE" : "SL";
      const pnlPips = isLong
        ? (position.sl - entryPrice) / pipSize
        : (entryPrice - position.sl) / pipSize;
      position.pnl = position.remainingVolume * pnlPips * pipValue;
      break;
    }

    // Check if TP1 midpoint — move SL to BE
    if (!position.slMovedToBe && CONFIG.moveBeAtTp1Mid) {
      const tpMid = (entryPrice + tp1) / 2;
      const midHit = isLong ? c.high >= tpMid : c.low <= tpMid;
      if (midHit) {
        position.sl = entryPrice;
        position.slMovedToBe = true;
      }
    }

    // Check TP1 — partial close
    if (!position.partialClosed) {
      const tp1Hit = isLong ? c.high >= tp1 : c.low <= tp1;
      if (tp1Hit) {
        const closeVol = Math.round(position.volume * CONFIG.partialClosePct * 100) / 100;
        const tp1Pips = isLong
          ? (tp1 - entryPrice) / pipSize
          : (entryPrice - tp1) / pipSize;
        position.pnl += closeVol * tp1Pips * pipValue;
        position.remainingVolume = Math.round((position.volume - closeVol) * 100) / 100;
        position.partialClosed = true;
        position.partialCloseIdx = i;
        // Move SL to BE after partial close
        if (!position.slMovedToBe) {
          position.sl = entryPrice;
          position.slMovedToBe = true;
        }
      }
    }

    // Check TP2
    const tp2Hit = isLong ? c.high >= tp2 : c.low <= tp2;
    if (tp2Hit) {
      const tp2Pips = isLong
        ? (tp2 - entryPrice) / pipSize
        : (entryPrice - tp2) / pipSize;
      position.pnl += position.remainingVolume * tp2Pips * pipValue;
      position.exitPrice = tp2;
      position.exitIdx = i;
      position.exitReason = "TP2";
      position.remainingVolume = 0;
      break;
    }
  }

  // End of day close
  if (position.exitReason === null && CONFIG.endOfDayClose) {
    const lastCandle = candles[candles.length - 1];
    position.exitPrice = lastCandle.close;
    position.exitIdx = candles.length - 1;
    position.exitReason = "EOD";

    if (position.remainingVolume > 0) {
      const eodPips = isLong
        ? (lastCandle.close - entryPrice) / pipSize
        : (entryPrice - lastCandle.close) / pipSize;
      position.pnl += position.remainingVolume * eodPips * pipValue;
    }
  }

  position.pnl = r2(position.pnl);

  return {
    pair: signal.pair,
    direction: signal.type,
    entryTime: new Date(position.entryTime).toISOString(),
    exitTime: position.exitIdx >= 0 ? new Date(candles[position.exitIdx].time).toISOString() : null,
    entryPrice: r5(position.entryPrice),
    exitPrice: position.exitPrice ? r5(position.exitPrice) : null,
    sl: r5(position.sl),
    tp1: r5(position.tp1),
    tp2: r5(position.tp2),
    volume: position.volume,
    pnl: position.pnl,
    exitReason: position.exitReason,
    slMovedToBe: position.slMovedToBe,
    partialClosed: position.partialClosed,
    barsHeld: position.exitIdx >= 0 ? position.exitIdx - position.entryIdx : 0,
    signalReason: signal.reason,
  };
}

// ═══ Daily simulation ═══

function simulateDay(pair, date, opts = {}) {
  const candles = loadCandles(pair, date);
  if (!candles || candles.length < 100) {
    return { date, pair, error: "no candle data", trades: [] };
  }

  // Load HTF engine reports for bias context
  const engine4h = loadEngine(pair, date, "4h");
  const engine1d = loadEngine(pair, date, "1d");
  const htfBias = engine1d?.structure?.bias || engine4h?.structure?.bias || "neutral";

  // Detect swings and patterns
  const swings = detectSwings(candles, CONFIG.swingWindow);

  // Find signals (start from bar 50 to let swings establish)
  const signals = detectSweepAndMSS(candles, swings, htfBias, 50, pair);

  // Filter by HTF bias alignment (optional, per opts)
  let filteredSignals = signals;
  if (opts.requireBiasAlign && htfBias !== "neutral") {
    filteredSignals = signals.filter(s =>
      (htfBias === "bullish" && s.type === "LONG") ||
      (htfBias === "bearish" && s.type === "SHORT")
    );
  }

  // Simulate trades (max 2 concurrent positions + daily cap)
  const trades = [];
  let accountBalance = CONFIG.accountSize;
  let openPositions = [];
  let dailySignalCount = 0;

  for (const signal of filteredSignals) {
    // Daily signal cap
    if (dailySignalCount >= CONFIG.maxDailySignals) break;
    dailySignalCount++;
    // Position limits
    if (openPositions.length >= CONFIG.maxPositions) continue;

    // No correlated positions on same pair
    if (openPositions.some(p => p.pair === pair)) continue;

    // Daily loss cap
    const dayPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
    if (dayPnl <= -CONFIG.accountSize * CONFIG.dailyLossCap) continue;

    const trade = simulateTrade(
      { ...signal, pair },
      candles,
      signal.mssIndex,
      accountBalance
    );

    trades.push(trade);
    openPositions.push(trade);
    openPositions = openPositions.filter(t => t.exitReason === null);

    accountBalance += trade.pnl;
    CONFIG.accountSize = accountBalance; // compound
  }

  // Close any remaining open positions at EOD
  for (const t of openPositions) {
    if (t.exitReason === null) {
      const lastCandle = candles[candles.length - 1];
      t.exitPrice = r5(lastCandle.close);
      t.exitReason = "EOD_FORCED";
      t.exitTime = new Date(lastCandle.time).toISOString();
    }
  }

  const dayPnl = r2(trades.reduce((sum, t) => sum + t.pnl, 0));

  return {
    date,
    pair,
    candles: candles.length,
    htfBias,
    signalsFound: signals.length,
    signalsFiltered: filteredSignals.length,
    trades: trades.length,
    dayPnl,
    trades,
  };
}

// ═══ Multi-Day Runner ═══

function runBacktest(pair, startDate, endDate, opts = {}) {
  const dates = dateRange(startDate, endDate);
  const allTrades = [];
  const dailyResults = [];

  console.error(`\n${pair}: ${dates.length} days | ${startDate} → ${endDate}`);
  console.error("─".repeat(60));

  for (const date of dates) {
    const result = simulateDay(pair, date, opts);
    dailyResults.push(result);
    allTrades.push(...result.trades.map(t => ({ ...t, date })));

    const winLoss = result.trades.filter(t => t.exitReason !== null && t.exitReason !== "EOD_FORCED");
    const wins = winLoss.filter(t => t.pnl > 0).length;
    const losses = winLoss.filter(t => t.pnl < 0).length;
    const emoji = result.dayPnl > 0 ? "🟢" : result.dayPnl < 0 ? "🔴" : "⚪";
    console.error(`${emoji} ${date} | ${result.trades} trades | P&L: $${result.dayPnl} | bias: ${result.htfBias} | signals: ${result.signalsFound}`);
  }

  return { pair, startDate, endDate, dailyResults, allTrades };
}

// ═══ Stats Engine ═══

function computeStats(trades, label) {
  const closed = trades.filter(t => t.exitReason && t.exitReason !== "EOD_FORCED" && t.pnl !== 0);
  const all = trades.filter(t => t.exitReason);

  if (closed.length === 0) return { label, trades: 0, note: "no closed trades" };

  const wins = closed.filter(t => t.pnl > 0);
  const losses = closed.filter(t => t.pnl < 0);
  const winRate = closed.length > 0 ? wins.length / closed.length : 0;
  const totalPnl = r2(all.reduce((s, t) => s + t.pnl, 0));
  const avgWin = wins.length > 0 ? r2(avg(wins.map(t => t.pnl))) : 0;
  const avgLoss = losses.length > 0 ? r2(avg(losses.map(t => t.pnl))) : 0;
  const grossProfit = r2(wins.reduce((s, t) => s + t.pnl, 0));
  const grossLoss = r2(Math.abs(losses.reduce((s, t) => s + t.pnl, 0)));
  const profitFactor = grossLoss > 0 ? r2(grossProfit / grossLoss) : (grossProfit > 0 ? Infinity : 0);

  // Equity curve + drawdown
  let equity = CONFIG.accountSize;
  const equityCurve = [equity];
  let peak = equity;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;

  for (const t of all) {
    equity += t.pnl;
    equityCurve.push(equity);
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    const ddPct = peak > 0 ? dd / peak : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;
    if (ddPct > maxDrawdownPct) maxDrawdownPct = ddPct;
  }

  // R:R stats
  const rMultiples = closed.map(t => {
    const r = Math.abs(t.pnl) / (CONFIG.accountSize * CONFIG.riskPerTrade);
    return t.pnl > 0 ? r : -r;
  });
  const avgR = r2(avg(rMultiples));
  const expectancy = r2(winRate * avgWin + (1 - winRate) * avgLoss);

  // Sharpe (simplified — assumes 0% risk-free rate)
  const returns = [];
  for (let i = 1; i < equityCurve.length; i++) {
    if (equityCurve[i - 1] > 0) {
      returns.push((equityCurve[i] - equityCurve[i - 1]) / equityCurve[i - 1]);
    }
  }
  const avgReturn = avg(returns);
  const stdReturn = std(returns);
  const sharpe = stdReturn > 0 ? r2((avgReturn / stdReturn) * Math.sqrt(252)) : 0;

  // Exit reason breakdown
  const exitReasons = {};
  for (const t of all) {
    exitReasons[t.exitReason] = (exitReasons[t.exitReason] || 0) + 1;
  }

  return {
    label,
    totalTrades: all.length,
    closedTrades: closed.length,
    winRate: r2(winRate * 100) + "%",
    totalPnl: "$" + totalPnl.toLocaleString(),
    avgWin: "$" + avgWin,
    avgLoss: "$" + avgLoss,
    profitFactor,
    expectancy: "$" + expectancy,
    avgR,
    maxDrawdown: "$" + r2(maxDrawdown),
    maxDrawdownPct: r2(maxDrawdownPct * 100) + "%",
    sharpe,
    finalEquity: "$" + r2(equity),
    returnPct: r2(((equity - CONFIG.accountSize) / CONFIG.accountSize) * 100) + "%",
    exitReasons,
    barsHeldAvg: r2(avg(all.map(t => t.barsHeld || 0))),
  };
}

// ═══ Main CLI ═══

async function main() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes("--json");
  const filterBias = args.includes("--bias-align");
  const argsClean = args.filter(a => !a.startsWith("--"));

  if (args.includes("--all")) {
    const startDate = argsClean[0] || "2026-08-02";
    const endDate = argsClean[1] || "2026-08-05";
    const allPairs = CONFIG.pairs;

    const allResults = {};
    for (const pair of allPairs) {
      const result = runBacktest(pair, startDate, endDate, { requireBiasAlign: filterBias });
      const stats = computeStats(result.allTrades, pair);
      allResults[pair] = stats;
    }

    if (jsonOutput) {
      console.log(JSON.stringify(allResults, null, 2));
    } else {
      console.log("\n=== ALL PAIRS SUMMARY ===\n");
      for (const [pair, stats] of Object.entries(allResults)) {
        console.log(`${pair}: ${stats.totalTrades} trades | Win: ${stats.winRate} | PF: ${stats.profitFactor} | P&L: ${stats.totalPnl} | Sharpe: ${stats.sharpe}`);
      }
    }
    return;
  }

  const pair = argsClean[0] || "GBPUSD";
  const startDate = argsClean[1] || "2026-08-02";
  const endDate = argsClean[2] || "2026-08-05";

  const result = runBacktest(pair, startDate, endDate, { requireBiasAlign: filterBias });

  // Trade-by-trade detail
  if (!jsonOutput) {
    console.log(`\n=== ${pair} TRADE LOG ===\n`);
    for (const t of result.allTrades) {
      const win = t.pnl > 0 ? "WIN" : t.pnl < 0 ? "LOSS" : "BE";
      console.log(`${t.date} | ${t.direction} | ${t.entryTime?.substring(11, 19) || "?"} → ${t.exitTime?.substring(11, 19) || "?"} | ${t.exitReason} | $${t.pnl} | ${win}`);
      console.log(`  Entry: ${t.entryPrice} | Exit: ${t.exitPrice} | SL: ${t.sl} | TP1: ${t.tp1}`);
      console.log(`  BE moved: ${t.slMovedToBe} | Partial: ${t.partialClosed} | Bars: ${t.barsHeld}`);
      if (t.signalReason) console.log(`  Signal: ${t.signalReason}`);
      console.log("");
    }
  }

  const stats = computeStats(result.allTrades, pair);

  if (jsonOutput) {
    console.log(JSON.stringify({ stats, trades: result.allTrades }, null, 2));
  } else {
    console.log(`=== ${pair} STATS ===`);
    console.log(`Trades:       ${stats.totalTrades} (${stats.closedTrades} closed)`);
    console.log(`Win Rate:     ${stats.winRate}`);
    console.log(`Profit Factor: ${stats.profitFactor}`);
    console.log(`Total P&L:    ${stats.totalPnl}`);
    console.log(`Avg Win:      ${stats.avgWin}  |  Avg Loss: ${stats.avgLoss}`);
    console.log(`Expectancy:   ${stats.expectancy}  |  Avg R: ${stats.avgR}`);
    console.log(`Max DD:       ${stats.maxDrawdown} (${stats.maxDrawdownPct})`);
    console.log(`Sharpe:       ${stats.sharpe}`);
    console.log(`Return:       ${stats.returnPct}`);
    console.log(`Avg Bars:     ${stats.barsHeldAvg}`);
    console.log(`Exits:        ${JSON.stringify(stats.exitReasons)}`);
  }
}

if (require.main === module) {
  main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
}

module.exports = { runBacktest, computeStats, simulateDay, detectSwings, detectSweepAndMSS, CONFIG };
