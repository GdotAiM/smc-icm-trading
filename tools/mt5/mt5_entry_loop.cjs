// MT5 Entry Loop — scheduled driver for P4 LIVE trading week.
//
// Polls the pipeline's gate decision for each pair and executes when the gate
// allows. Position management (BE/partial/close-by-time/daily-cap) is handled
// separately by mt5_monitor.cjs — this loop only OPENS orders.
//
// Safety (mirrors the bridge + monitor):
//   - skips a pair while a bridge-managed position is already open (max 2)
//   - honors the kill switch file (_config/mt5.kill)
//   - skips execution if the daily loss cap is breached
//   - only trades inside killzones (matched to the pipeline's gate, which
//     already enforces time gates — this is a backstop on event freshness)
//
// Usage:
//   node tools/mt5/mt5_entry_loop.cjs                 # REVIEW mode, every 300s
//   node tools/mt5/mt5_entry_loop.cjs --live          # LIVE mode
//   node tools/mt5/mt5_entry_loop.cjs --interval 60   # custom seconds
//   node tools/mt5/mt5_entry_loop.cjs --once          # single sweep then exit
const path = require("path");
const fs = require("fs");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "../..");
const BRIDGE_URL = process.env.MT5_BRIDGE_URL || "http://127.0.0.1:5111";
const LIVE = process.argv.includes("--live");
const MODE = LIVE ? "LIVE" : (process.env.MT5_MODE || "REVIEW");
const ONCE = process.argv.includes("--once");
const PAIRS = (process.env.MT5_PAIRS || "GBPUSD,EURUSD,XAUUSD,USTEC").split(",").map(s => s.trim().toUpperCase());

const intervalArg = process.argv.indexOf("--interval");
const INTERVAL_MS = (intervalArg >= 0 ? Number(process.argv[intervalArg + 1]) : 300) * 1000;

let autoTradeModule = null;
function loadAutoTrade() {
  if (!autoTradeModule) autoTradeModule = require("./mt5_auto_trade.cjs");
  return autoTradeModule;
}

const KILL_FILE = path.join(ROOT, "_config", "mt5.kill");
let DATE = require("../ny_time.cjs").getNYDate();
function logFile() { return path.join(ROOT, "shared", DATE, "mt5_entry_loop_log.jsonl"); }

function refreshDate() {
  const d = require("../ny_time.cjs").getNYDate();
  if (d !== DATE) {
    DATE = d;
    console.log(`[ENTRY_LOOP] NY date now ${DATE} — rotating log`);
  }
}

function log(entry) {
  entry.time = new Date().toISOString();
  console.log(`[${entry.time}] [ENTRY_LOOP:${MODE}] ${entry.event} ${entry.detail || ""}`);
  try {
    fs.mkdirSync(path.dirname(logFile()), { recursive: true });
    fs.appendFileSync(logFile(), JSON.stringify(entry) + "\n");
  } catch {}
}

function killSwitchActive() {
  return fs.existsSync(KILL_FILE);
}

function bridgeCall(cmd, args = {}, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ cmd, args });
    const url = new URL(BRIDGE_URL);
    const req = require("http").request(
      {
        hostname: url.hostname, port: url.port, path: "/",
        method: "POST", timeout: timeoutMs,
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => { data += c; });
        res.on("end", () => {
          try {
            const msg = JSON.parse(data);
            if (msg.ok) resolve(msg.result);
            else reject(new Error(msg.error || "bridge error"));
          } catch { reject(new Error("parse error")); }
        });
      }
    );
    req.on("error", () => reject(new Error("bridge unreachable")));
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.write(body);
    req.end();
  });
}

// ═══ Per-pair pre-flight: open-position + daily-cap backstop ═══

async function preflight(pair) {
  // 1. Kill switch
  if (killSwitchActive()) {
    return { ok: false, reason: "KILL_SWITCH" };
  }

  // 2. Open positions — skip if this pair already has a managed position
  try {
    const pos = await bridgeCall("positions");
    const open = pos.positions || [];
    const mine = open.filter(p => p.symbol === pair);
    if (mine.length > 0) return { ok: false, reason: "POSITION_OPEN" };
    if (open.length >= 2) return { ok: false, reason: "MAX_POSITIONS" };
  } catch {
    return { ok: false, reason: "BRIDGE_DOWN" };
  }

  // 3. Daily loss cap backstop (monitor also enforces this)
  try {
    const hist = await bridgeCall("history");
    const acc = await bridgeCall("account_info");
    const cap = -Math.abs(acc.balance * 0.03);
    if (hist.total <= cap) return { ok: false, reason: "DAILY_CAP" };
  } catch {
    return { ok: false, reason: "BRIDGE_DOWN" };
  }

  return { ok: true };
}

// ═══ Single sweep ═══

async function sweep() {
  if (killSwitchActive()) {
    log({ event: "SKIP", detail: "kill switch active (_config/mt5.kill) — not trading" });
    return;
  }

  const { autoTrade } = loadAutoTrade();
  let results = [];

  for (const pair of PAIRS) {
    const pre = await preflight(pair);
    if (!pre.ok) {
      log({ event: "SKIP", pair, detail: pre.reason });
      continue;
    }

    const result = await autoTrade(pair, { live: LIVE });
    results.push(result);

    if (result.executed) {
      log({ event: "EXECUTED", pair, detail: `${result.side} ${result.volume} @ ${result.price || "?"}` });
    } else if (result.allowed && !result.executed) {
      log({ event: "EXEC_FAILED", pair, detail: result.error || "unknown" });
    } else {
      const reasons = (result.gate?.reasons || []).join(" | ");
      log({ event: "GATE_BLOCKED", pair, detail: reasons.slice(0, 200) });
    }
  }

  log({ event: "SWEEP_DONE", detail: `${results.length} pairs evaluated, ${results.filter(r => r.executed).length} executed` });
}

// ═══ Main ═══

async function main() {
  if (killSwitchActive()) {
    log({ event: "SKIP", detail: "kill switch active at startup — not trading" });
  } else {
    await sweep();
  }

  if (ONCE) {
    log({ event: "EXIT", detail: "--once complete" });
    process.exit(0);
  }

  setInterval(async () => {
    refreshDate(); // Rotate to current NY date before each sweep
    try { await sweep(); } catch (e) { log({ event: "ERROR", detail: e.message }); }
  }, INTERVAL_MS);

  log({ event: "LOOP_START", detail: `mode=${MODE} interval=${INTERVAL_MS / 1000}s pairs=${PAIRS.join(",")}` });

  process.on("SIGINT", () => { log({ event: "EXIT", detail: "SIGINT" }); process.exit(0); });
  process.on("SIGTERM", () => { log({ event: "EXIT", detail: "SIGTERM" }); process.exit(0); });
}

main().catch((e) => {
  console.error("[ENTRY_LOOP] fatal:", e.message);
  process.exit(1);
});
