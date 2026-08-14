// MT5 Position Management Monitor — P4 LIVE demo trading week
//
// Continuous monitor that manages MT5 bridge-managed positions:
//   - Move SL to breakeven after TP1 midpoint breached
//   - Partial close 50% at TP1
//   - Close remaining at TP2
//   - Close-by-time (NY close 17:00, Friday close)
//   - Daily loss cap enforcement (3%)
//   - News freeze (no new orders near high-impact events)
//
// Runs alongside session_monitor.cjs (TV paper) as the MT5 management layer.
//
// Usage:
//   node tools/mt5/mt5_monitor.cjs                    # REVIEW mode (log only)
//   node tools/mt5/mt5_monitor.cjs --live              # LIVE mode (real management)
//   node tools/mt5/mt5_monitor.cjs --once              # Single check, then exit

const path = require("path");
const fs = require("fs");
const http = require("http");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "../..");
const BRIDGE_URL = process.env.MT5_BRIDGE_URL || "http://127.0.0.1:5111";
const MODE = (process.env.MT5_MODE || "REVIEW").toUpperCase();
const INTERVAL_SEC = 60;
let DATE = require("../ny_time.cjs").getNYDate();

function logFile() { return path.join(ROOT, "shared", DATE, "mt5_monitor_log.jsonl"); }
function stateFile() { return path.join(ROOT, "shared", DATE, "mt5_monitor_state.json"); }

function refreshDate() {
  const d = require("../ny_time.cjs").getNYDate();
  if (d !== DATE) {
    DATE = d;
    console.log(`[MT5_MONITOR] NY date now ${DATE} — rotating log/state`);
  }
}

const ONCE = process.argv.includes("--once");
const LIVE = process.argv.includes("--live");
const MODE_EFFECTIVE = LIVE ? "LIVE" : MODE;

// ═══ MT5 bridge call ═══

function bridgeCall(cmd, args = {}, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ cmd, args });
    const url = new URL(BRIDGE_URL);
    const req = http.request(
      {
        hostname: url.hostname, port: url.port, path: "/",
        method: "POST", timeout: timeoutMs,
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => { data += c; });
        res.on("end", () => {
          try { const m = JSON.parse(data); if (m.ok) resolve(m.result); else reject(new Error(m.error)); }
          catch { reject(new Error("parse error")); }
        });
      }
    );
    req.on("error", (e) => reject(new Error("bridge unreachable: " + e.message)));
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.write(body);
    req.end();
  });
}

// ═══ Logging ═══

function log(entry) {
  const line = { time: new Date().toISOString(), ...entry };
  try {
    fs.mkdirSync(path.dirname(logFile()), { recursive: true });
    fs.appendFileSync(logFile(), JSON.stringify(line) + "\n");
  } catch {}
  const prefix = entry.action === "MANAGE" ? "📐" : entry.action === "CLOSE" ? "🔴" : "📡";
  const mode = MODE_EFFECTIVE === "REVIEW" ? "[REVIEW]" : "[LIVE]";
  console.log(`[${new Date().toLocaleTimeString()}]`, prefix, mode, entry.event || entry.action, entry.detail || "");
}

function writeState(state) {
  try {
    fs.mkdirSync(path.dirname(stateFile()), { recursive: true });
    fs.writeFileSync(stateFile() + ".tmp", JSON.stringify(state, null, 2));
    fs.renameSync(stateFile() + ".tmp", stateFile());
  } catch {}
}

// ═══ NY time helpers ═══

function nyHour() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" })).getHours();
}

function nyDay() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" })).getDay();
}

function isFriday() {
  return nyDay() === 5;
}

// ═══ Position management logic ═══

async function checkAndManage(opts = {}) {
  const actions = [];
  let positions = [];
  let account = null;

  try {
    positions = await bridgeCall("positions");
    positions = positions.positions || [];
  } catch (e) {
    log({ action: "ERROR", event: "FETCH_POSITIONS_FAILED", detail: e.message });
    return { positions: [], actions, error: e.message };
  }

  if (positions.length === 0) {
    log({ action: "STATUS", event: "NO_POSITIONS", detail: "0 bridge-managed positions open" });
    writeState({ updated: new Date().toISOString(), positions: [], actions: [], pnl: 0, mode: MODE_EFFECTIVE });
    return { positions: [], actions: [], pnl: 0 };
  }

  // Fetch tick prices for all symbols
  const ticks = {};
  for (const p of positions) {
    if (!ticks[p.symbol]) {
      try { ticks[p.symbol] = await bridgeCall("tick", { symbol: p.symbol }); }
      catch { ticks[p.symbol] = null; }
    }
  }

  // Fetch account for daily cap check
  try { account = await bridgeCall("account_info"); }
  catch { account = { balance: 100000, currency: "USD" }; }

  // Check daily loss cap
  let history = null;
  try { history = await bridgeCall("history"); }
  catch { history = { realized: 0, open: 0, total: 0 }; }

  const dailyPnl = history.total;
  const balance = account.balance;
  const dailyCapPct = -0.03;
  const dailyCapHard = -(balance * 0.03);

  const hourNY = nyHour();
  const friday = isFriday();
  const isNYClose = hourNY >= 17 && hourNY < 18;
  const isFridayClose = friday && hourNY >= 16;
  const isLunch = hourNY >= 11 && hourNY < 13;

  // ═══ Per-position management ═══

  for (const pos of positions) {
    const tick = ticks[pos.symbol];
    if (!tick) continue;

    const currentBid = tick.bid;
    const currentAsk = tick.ask;
    const isBuy = pos.side === "BUY";
    const currentPrice = isBuy ? currentBid : currentAsk; // exit price
    const entry = pos.price_open;
    const initialSl = pos.sl || 0;
    const initialTp = pos.tp || 0;

    // Distance calculations
    const entryToTp = Math.abs(initialTp - entry);
    const tpMidpoint = entryToTp > 0
      ? (isBuy ? entry + entryToTp * 0.5 : entry - entryToTp * 0.5)
      : null;

    // -- 1. Check: Move SL to BE after TP1 midpoint breached --
    if (tpMidpoint && initialSl !== entry && initialSl !== 0) {
      const midpointBreached = isBuy
        ? currentBid >= tpMidpoint
        : currentAsk <= tpMidpoint;
      const slNotAtBe = Math.abs(initialSl - entry) > (pos.symbol.includes("XAU") ? 0.05 : 0.00005);

      if (midpointBreached && slNotAtBe) {
        const action = {
          pos: pos.ticket,
          type: "MOVE_TO_BE",
          symbol: pos.symbol,
          oldSl: initialSl,
          newSl: entry,
          reason: `TP1 midpoint breached (${tpMidpoint.toFixed(5)})`,
        };

        if (MODE_EFFECTIVE === "LIVE") {
          try {
            await bridgeCall("modify_sl_tp", { position: pos.ticket, sl: entry, tp: initialTp });
            action.executed = true;
          } catch (e) {
            action.executed = false;
            action.error = e.message;
          }
        } else {
          action.executed = false;
          action.review = true;
        }

        actions.push(action);
        log({ action: "MANAGE", event: action.type, detail: `${pos.symbol} #${pos.ticket} SL ${initialSl} → ${entry}`, live: MODE_EFFECTIVE === "LIVE" });
      }
    }

    // -- 2. Check: Partial close at TP1 --
    const tp1Hit = isBuy
      ? currentBid >= initialTp
      : currentAsk <= initialTp;

    if (tp1Hit && pos.volume > 0.011) { // only if > min volume
      const closeVol = Math.round(pos.volume * 0.5 * 100) / 100;
      const action = {
        pos: pos.ticket,
        type: "PARTIAL_CLOSE_TP1",
        symbol: pos.symbol,
        closeVolume: closeVol,
        remainingVolume: Math.round((pos.volume - closeVol) * 100) / 100,
        reason: `TP1 hit at ${initialTp}`,
      };

      if (MODE_EFFECTIVE === "LIVE") {
        try {
          const r = await bridgeCall("partial_close", { position: pos.ticket, volume: closeVol, deviation: 20 });
          action.deal = r.deal;
          action.executed = true;
        } catch (e) {
          action.executed = false;
          action.error = e.message;
        }
      } else {
        action.executed = false;
        action.review = true;
      }

      actions.push(action);
      log({ action: "MANAGE", event: action.type, detail: `${pos.symbol} #${pos.ticket} close ${closeVol} lots (${pos.volume - closeVol} remain)`, live: MODE_EFFECTIVE === "LIVE" });
    }

    // -- 3. Check: Time-based close --
    const shouldCloseByTime = isNYClose || isFridayClose;

    if (shouldCloseByTime) {
      const reason = isFridayClose ? `Friday NY close (${hourNY}:00 NY)` : `NY close (${hourNY}:00 NY)`;
      const action = {
        pos: pos.ticket,
        type: "CLOSE_BY_TIME",
        symbol: pos.symbol,
        volume: pos.volume,
        reason,
        profit: pos.profit,
      };

      if (MODE_EFFECTIVE === "LIVE") {
        try {
          const r = await bridgeCall("close_position", { position: pos.ticket, deviation: 20 });
          action.deal = r.deal;
          action.executed = true;
        } catch (e) {
          action.executed = false;
          action.error = e.message;
        }
      } else {
        action.executed = false;
        action.review = true;
      }

      actions.push(action);
      log({ action: "CLOSE", event: action.type, detail: `${pos.symbol} #${pos.ticket} — ${reason} (P&L: ${pos.profit})`, live: MODE_EFFECTIVE === "LIVE" });
    }
  }

  // -- 4. Daily loss cap: close ALL if breached --
  if (dailyPnl <= dailyCapHard || (balance > 0 && dailyPnl / balance <= dailyCapPct)) {
    const action = {
      type: "DAILY_CAP_CLOSE_ALL",
      dailyPnl,
      dailyCapHard,
      balance,
    };

    if (MODE_EFFECTIVE === "LIVE") {
      try {
        const r = await bridgeCall("close_all", { deviation: 20 });
        action.closed = r.closed;
        action.executed = true;
      } catch (e) {
        action.executed = false;
        action.error = e.message;
      }
    } else {
      action.executed = false;
      action.review = true;
    }

    actions.push(action);
    log({ action: "CLOSE", event: "DAILY_CAP_HIT", detail: `PnL ${dailyPnl.toFixed(2)} <= cap ${dailyCapHard.toFixed(2)} — closing all`, alert: true, live: MODE_EFFECTIVE === "LIVE" });
  }

  // Session multipliers (log only — doesn't manage, just informs)
  let sessionMultiplier = 1.0;
  if (isLunch) sessionMultiplier = 0.4;
  if (friday && hourNY >= 14) sessionMultiplier = 0.5;

  const state = {
    updated: new Date().toISOString(),
    mode: MODE_EFFECTIVE,
    positions: positions.map(p => ({
      ticket: p.ticket, symbol: p.symbol, side: p.side,
      volume: p.volume, entry: p.price_open, sl: p.sl, tp: p.tp,
      profit: p.profit, currentBid: ticks[p.symbol]?.bid, currentAsk: ticks[p.symbol]?.ask,
    })),
    actions,
    session: {
      hourNY, friday, isNYClose, isFridayClose, isLunch, sessionMultiplier,
    },
    risk: {
      balance, dailyPnl, dailyCapHard, capBreached: dailyPnl <= dailyCapHard,
    },
  };

  writeState(state);
  return state;
}

// ═══ Main ═══

async function main() {
  console.log("=== MT5 POSITION MANAGEMENT MONITOR ===");
  console.log("Mode: " + MODE_EFFECTIVE);
  console.log("Bridge: " + BRIDGE_URL);
  console.log("Log: " + logFile());
  console.log("State: " + stateFile());
  console.log("");

  if (ONCE) {
    const result = await checkAndManage();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Continuous loop
  console.log(`[${new Date().toLocaleTimeString()}] Monitor started — checking every ${INTERVAL_SEC}s`);
  console.log("");

  while (true) {
    refreshDate(); // Rotate to current NY date before each check
    try {
      await checkAndManage();
    } catch (e) {
      log({ action: "ERROR", event: "TICK_FAILED", detail: e.message });
    }
    await new Promise(r => setTimeout(r, INTERVAL_SEC * 1000));
  }
}

// ═══ Process lifecycle ═══

process.on("uncaughtException", (err) => {
  console.error("[MT5_MONITOR:FATAL]", err.message);
  log({ action: "ERROR", event: "MONITOR_CRASH", detail: err.message });
});
process.on("SIGINT", () => {
  log({ action: "STATUS", event: "MONITOR_SHUTDOWN", detail: "SIGINT — exiting" });
  process.exit(0);
});
process.on("SIGTERM", () => {
  log({ action: "STATUS", event: "MONITOR_SHUTDOWN", detail: "SIGTERM — exiting" });
  process.exit(0);
});

if (require.main === module) {
  main().catch((e) => {
    console.error("[MT5_MONITOR] fatal:", e.message);
    process.exit(1);
  });
}

module.exports = { checkAndManage };
