// MT5 Executor — Node adapter that drives mt5_bridge.py via HTTP
//
// Implements the BrokerAdapter surface so ExecutionManager / auto-traders
// can drive MT5 interchangeably with market_order.cjs (TV paper trading).
//
// Modes:
//   REVIEW  — log intent only, never place real orders
//   LIVE    — place real orders on MT5 (demo or live depending on terminal)
//
// Usage (CLI):
//   node tools/mt5/mt5_executor.cjs --pair GBPUSD --side BUY --sl 1.2650 --tp 1.2720 --qty 0.01
//   node tools/mt5/mt5_executor.cjs --gate XAUUSD        # consume auto_decision.gate()
//   node tools/mt5/mt5_executor.cjs --account             # print account snapshot
//   node tools/mt5/mt5_executor.cjs --positions           # list open bridge positions
//
// Usage (import):
//   const { createAdapter } = require("../mt5/mt5_executor.cjs");
//   const mt5 = createAdapter({ mode: "REVIEW" });
//   const result = await mt5.executeOrder({ symbol, side, volume, sl, tp, requestId });

const http = require("http");
const path = require("path");
const fs = require("fs");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "../..");
const BRIDGE_URL = process.env.MT5_BRIDGE_URL || "http://127.0.0.1:5111";
const MODE = (process.env.MT5_MODE || "REVIEW").toUpperCase();
const KNOWN_SYMBOLS = ["GBPUSD", "EURUSD", "XAUUSD", "USTEC", "US100", "NAS100"];
const DEFAULT_DEVIATION = 20;

// ═══ HTTP client ═══

function bridgeCall(cmd, args = {}, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ cmd, args });
    const url = new URL(BRIDGE_URL);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: "/",
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
        timeout: timeoutMs,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          try {
            const msg = JSON.parse(data);
            if (msg.ok) resolve(msg.result);
            else reject(new Error(msg.error || "bridge error"));
          } catch (e) {
            reject(new Error("bridge parse error: " + data.substring(0, 200)));
          }
        });
      }
    );
    req.on("error", (e) => reject(new Error("bridge unreachable: " + e.message)));
    req.on("timeout", () => { req.destroy(); reject(new Error("bridge timeout")); });
    req.write(body);
    req.end();
  });
}

// ═══ Symbol mapping ═══

function mapSymbol(pair) {
  // Normalize pipeline symbol names to MT5 broker symbol names
  const map = { NAS100: "USTEC", US100: "USTEC" };
  const s = (pair || "").toUpperCase();
  return map[s] || s;
}

// ═══ REVIEW mode logger ═══

function reviewLog(entry) {
  const date = require("../ny_time.cjs").getNYDate();
  const dir = path.join(ROOT, "shared", date);
  const file = path.join(dir, "mt5_review_log.jsonl");
  const line = { time: new Date().toISOString(), ...entry };
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(file, JSON.stringify(line) + "\n");
  } catch {}
  console.log("[MT5:REVIEW]", JSON.stringify(line));
}

// ═══ Adapter factory ═══

function createAdapter(opts = {}) {
  const mode = (opts.mode || MODE).toUpperCase();

  async function ping() {
    if (mode === "REVIEW") return { pong: true, mode: "REVIEW", note: "no terminal — simulated" };
    return bridgeCall("ping");
  }

  async function getBalance() {
    if (mode === "REVIEW") return { balance: 0, equity: 0, currency: "USD", mode: "REVIEW" };
    const acc = await bridgeCall("account_info");
    return { balance: acc.balance, equity: acc.equity, currency: acc.currency, mode };
  }

  async function getOpenPositions() {
    if (mode === "REVIEW") return [];
    const result = await bridgeCall("positions");
    return result.positions || [];
  }

  async function getSymbolInfo(symbol) {
    if (mode === "REVIEW") return { symbol: mapSymbol(symbol), mode: "REVIEW", note: "no terminal — use _config/mt5_symbols.json for specs" };
    return bridgeCall("symbol_info", { symbol: mapSymbol(symbol) });
  }

  async function executeOrder({ symbol, side, volume, sl, tp, deviation, requestId }) {
    const mt5sym = mapSymbol(symbol);
    const payload = {
      symbol: mt5sym,
      side: side.toUpperCase(),
      volume,
      sl,
      tp,
      deviation: deviation || DEFAULT_DEVIATION,
      request_id: requestId || "",
    };

    reviewLog({ action: "EXECUTE_INTENT", ...payload, mode });

    if (mode === "REVIEW") {
      return { ticket: 0, deal: 0, price: 0, volume, duplicate: false, review: true, mode: "REVIEW" };
    }

    return bridgeCall("market_order", payload);
  }

  async function modifySLTP({ position, sl, tp }) {
    reviewLog({ action: "MODIFY_SLTP", position, sl, tp, mode });

    if (mode === "REVIEW") {
      return { ticket: position, sl, tp, review: true, mode: "REVIEW" };
    }

    return bridgeCall("modify_sl_tp", { position, sl, tp });
  }

  async function partialClose({ position, volume, deviation }) {
    reviewLog({ action: "PARTIAL_CLOSE", position, volume, mode });

    if (mode === "REVIEW") {
      return { ticket: position, volume_closed: volume, review: true, mode: "REVIEW" };
    }

    return bridgeCall("partial_close", { position, volume, deviation: deviation || DEFAULT_DEVIATION });
  }

  async function closePosition({ position, deviation }) {
    reviewLog({ action: "CLOSE_POSITION", position, mode });

    if (mode === "REVIEW") {
      return { ticket: position, review: true, mode: "REVIEW" };
    }

    return bridgeCall("close_position", { position, deviation: deviation || DEFAULT_DEVIATION });
  }

  async function closeAll({ symbol } = {}) {
    reviewLog({ action: "CLOSE_ALL", symbol: symbol || "ALL", mode });

    if (mode === "REVIEW") {
      return { closed: [], review: true, mode: "REVIEW" };
    }

    return bridgeCall("close_all", { symbol: symbol ? mapSymbol(symbol) : "" });
  }

  async function getHistory() {
    if (mode === "REVIEW") return { realized: 0, open: 0, total: 0, deal_count: 0, mode: "REVIEW" };
    return bridgeCall("history");
  }

  // -- gate-driven execution: consume auto_decision.gate() output ----------

  async function executeFromGate(gateResult) {
    const { allowed, reasons, operative, decision } = gateResult;
    if (!allowed) {
      return { executed: false, reason: reasons.join("; "), review: mode === "REVIEW" };
    }

    const pair = decision?.pair || decision?.symbol || "GBPUSD";
    const entry = operative.entry;
    const sl = operative.sl;
    const tp1 = operative.tp1;
    const side = operative.side;
    const sizeMultiplier = operative.sizeMultiplier || 1;

    // Compute volume from lot-size calculator
    let volume = 0.01; // default minimum
    try {
      const { calcVolume } = require("./lot_size.cjs");
      const riskDist = Math.abs(entry - sl);
      volume = calcVolume({ pair, riskDistance: riskDist, sizeMultiplier });
    } catch (e) {
      // fallback to default
    }

    const requestId = `gate.${pair}.${Date.now()}`;

    return executeOrder({
      symbol: pair,
      side,
      volume,
      sl,
      tp: tp1,
      requestId,
    });
  }

  const adapter = {
    mode,
    ping, getBalance, getOpenPositions, getSymbolInfo, getHistory,
    executeOrder, modifySLTP, partialClose, closePosition, closeAll,
    BridgeAdapter: {
      executeOrder: (opts) => executeOrder(opts),
      getBalance,
      getOpenOrders: getOpenPositions,
      closeOrder: (ticket, dev) => closePosition({ position: ticket, deviation: dev }),
      getOrderStatus: (ticket) => getOpenPositions().then(ps => ps.find(p => p.ticket === ticket) || null),
    },
    executeFromGate,
    mapSymbol,
  };

  return adapter;
}

// ═══ CLI ═══

async function main() {
  const args = process.argv.slice(2);
  const adapter = createAdapter({ mode: MODE });

  if (args.includes("--account")) {
    const bal = await adapter.getBalance();
    console.log(JSON.stringify(bal, null, 2));
    return;
  }

  if (args.includes("--positions") || args.includes("--orders")) {
    const positions = await adapter.getOpenPositions();
    console.log(JSON.stringify(positions, null, 2));
    return;
  }

  if (args.includes("--history")) {
    const h = await adapter.getHistory();
    console.log(JSON.stringify(h, null, 2));
    return;
  }

  if (args.includes("--ping")) {
    const p = await adapter.ping();
    console.log(JSON.stringify(p, null, 2));
    return;
  }

  // --gate mode: consume auto_decision.cjs gate output
  if (args.includes("--gate")) {
    const pairIdx = args.indexOf("--gate") + 1;
    const pair = args[pairIdx] || "GBPUSD";
    try {
      const { gate } = require("../auto_decision.cjs");
      const result = gate(pair);
      console.log("Gate:", JSON.stringify({ allowed: result.allowed, reasons: result.reasons, operative: result.operative }, null, 2));
      if (result.allowed) {
        const exec = await adapter.executeFromGate(result);
        console.log("Execution:", JSON.stringify(exec, null, 2));
      }
    } catch (e) {
      console.error("Gate execution failed:", e.message);
    }
    return;
  }

  // Direct trade: --pair GBPUSD --side BUY --sl 1.2650 --tp 1.2720 --qty 0.01
  const getArg = (flag, fallback) => {
    const i = args.indexOf(flag);
    return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
  };

  const pair = getArg("--pair", null);
  if (pair) {
    const side = getArg("--side", "BUY");
    const sl = parseFloat(getArg("--sl", "0"));
    const tp = parseFloat(getArg("--tp", "0"));
    const qty = parseFloat(getArg("--qty", "0.01"));
    const dev = parseInt(getArg("--dev", String(DEFAULT_DEVIATION)));
    const rid = getArg("--rid", `cli.${pair}.${Date.now()}`);

    const result = await adapter.executeOrder({
      symbol: pair, side, volume: qty, sl, tp, deviation: dev, requestId: rid,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // No recognized flags — show help
  console.log("MT5 Executor — usage:");
  console.log("  node tools/mt5/mt5_executor.cjs --account           account snapshot");
  console.log("  node tools/mt5/mt5_executor.cjs --positions          open positions");
  console.log("  node tools/mt5/mt5_executor.cjs --history            today P&L");
  console.log("  node tools/mt5/mt5_executor.cjs --ping               bridge health");
  console.log("  node tools/mt5/mt5_executor.cjs --gate <PAIR>        gate-driven trade");
  console.log("  node tools/mt5/mt5_executor.cjs --pair XAUUSD --side BUY --sl 2650 --tp 2680 --qty 0.01");
  console.log("");
  console.log("Env: MT5_MODE=REVIEW|LIVE  MT5_BRIDGE_URL=http://127.0.0.1:5111");
}

if (require.main === module) {
  main().catch((e) => {
    console.error("mt5_executor fatal:", e.message);
    process.exit(1);
  });
}

module.exports = { createAdapter, bridgeCall, mapSymbol };
