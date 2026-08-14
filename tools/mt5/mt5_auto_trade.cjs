// MT5 Auto-Trader — wire auto_decision.gate() → MT5 execution
//
// This is the P3 bridge between the decision pipeline and MT5 execution.
// It runs ALONGSIDE the existing TV market_order.cjs (shadow mode).
//
// Flow:
//   1. Read decision.json for the pair
//   2. Run auto_decision.gate(pair) → {allowed, reasons, operative}
//   3. If BLOCKED → log reason, exit 1
//   4. If ALLOWED → calculate lot size, execute on MT5 (REVIEW or LIVE)
//   5. Write execution result to shared/<date>/<pair>/mt5_execution.json
//
// Usage:
//   node tools/mt5/mt5_auto_trade.cjs <PAIR>              # REVIEW mode (default)
//   node tools/mt5/mt5_auto_trade.cjs <PAIR> --live        # LIVE mode (real orders)
//   node tools/mt5/mt5_auto_trade.cjs --all                # All pairs with fresh decisions
//   node tools/mt5/mt5_auto_trade.cjs --all --live         # LIVE all pairs

const path = require("path");
const fs = require("fs");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "../..");
const MODE = process.env.MT5_MODE || "REVIEW";

// ═══ Dependencies (loaded on demand to avoid crashes when bridge is down) ═══

let gateModule, executorModule, lotModule;
function loadGate() {
  if (!gateModule) gateModule = require("../auto_decision.cjs");
  return gateModule;
}
function loadExecutor() {
  if (!executorModule) executorModule = require("./mt5_executor.cjs");
  return executorModule;
}
function loadLotCalc() {
  if (!lotModule) lotModule = require("./lot_size.cjs");
  return lotModule;
}

// ═══ Single pair execution ═══

async function autoTrade(pair, opts = {}) {
  const mode = opts.live ? "LIVE" : MODE;
  const startTime = Date.now();
  const result = {
    pair,
    mode,
    time: new Date().toISOString(),
    allowed: false,
    executed: false,
    ticket: null,
    error: null,
    details: {},
  };

  try {
    // 1. Gate
    const { gate } = loadGate();
    const gated = gate(pair);
    result.gate = {
      allowed: gated.allowed,
      reasons: gated.reasons,
      operative: gated.operative,
      secondChance: gated.secondChance || false,
      coherence: gated.decision?.coherence?.unified || null,
    };

    if (!gated.allowed) {
      result.error = "GATE_BLOCKED: " + (gated.reasons.join("; ") || "unknown");
      result.elapsedMs = Date.now() - startTime;
      return result;
    }

    result.allowed = true;

    // 2. Calculate lot size
    const op = gated.operative;
    const riskDist = Math.abs(op.entry - op.sl);
    const { calcVolume } = loadLotCalc();
    const sizing = await calcVolume({
      pair,
      riskDistance: riskDist,
      sizeMultiplier: op.sizeMultiplier || 1,
    });

    result.sizing = {
      volume: sizing.volume,
      riskDollars: sizing.riskDollars,
      stopPips: sizing.stopPips,
      pipValuePerLot: sizing.pipValuePerLot,
      source: sizing.specSource,
    };

    // 3. Execute
    const { createAdapter } = loadExecutor();
    const mt5 = createAdapter({ mode });

    const requestId = `auto.${pair}.${Date.now()}`;
    const execResult = await mt5.executeOrder({
      symbol: pair,
      side: op.side,
      volume: sizing.volume,
      sl: op.sl,
      tp: op.tp1,
      requestId,
    });

    result.executed = true;
    result.ticket = execResult.ticket;
    result.deal = execResult.deal;
    result.price = execResult.price;
    result.volume = execResult.volume;
    result.duplicate = execResult.duplicate || false;
    result.review = execResult.review || false;

    result.details = {
      side: op.side,
      entry: op.entry,
      sl: op.sl,
      tp1: op.tp1,
      kind: op.kind,
      sizeMultiplier: op.sizeMultiplier,
      requestId,
    };

  } catch (e) {
    result.error = "EXECUTION_ERROR: " + e.message;
  }

  result.elapsedMs = Date.now() - startTime;
  return result;
}

// ═══ Write result ═══

function writeResult(pair, result) {
  const date = require("../ny_time.cjs").getNYDate();
  const dir = path.join(ROOT, "shared", date, pair === "XAUUSD" ? "GOLD" : pair);
  const file = path.join(dir, "mt5_execution.json");
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(result, null, 2));
  } catch (e) {
    console.error("[MT5_AUTO] Failed to write result:", e.message);
  }

  // Also append to unified execution log
  const logFile = path.join(ROOT, "shared", date, "mt5_execution_log.jsonl");
  try {
    fs.appendFileSync(logFile, JSON.stringify(result) + "\n");
  } catch {}
}

// ═══ Console output ═══

function printResult(result) {
  const prefix = result.mode === "REVIEW" ? "[MT5:REVIEW]" : "[MT5:LIVE]";
  const status = result.executed ? "✅ EXECUTED" : result.allowed ? "❌ FAILED" : "⛔ BLOCKED";

  console.log(`${prefix} ${result.pair} — ${status}`);

  if (result.gate) {
    console.log(`  Gate: ${result.gate.allowed ? "ALLOWED" : "BLOCKED"} (coherence: ${result.gate.coherence || "N/A"})`);
    if (!result.gate.allowed) {
      console.log(`  Reasons: ${result.gate.reasons.join(" | ")}`);
    }
  }

  if (result.sizing) {
    console.log(`  Size: ${result.sizing.volume} lots | Risk: $${result.sizing.riskDollars} | Stop: ${result.sizing.stopPips} pips`);
  }

  if (result.executed) {
    console.log(`  Ticket: ${result.ticket} | Deal: ${result.deal} | Price: ${result.price}`);
    console.log(`  Details: ${result.details.side} ${result.pair} @ ${result.details.entry} | SL: ${result.details.sl} | TP1: ${result.details.tp1}`);
    if (result.review) console.log(`  ⚠ REVIEW mode — no real order placed`);
  }

  if (result.error) {
    console.log(`  Error: ${result.error}`);
  }

  console.log(`  Elapsed: ${result.elapsedMs}ms`);
  console.log("");
}

// ═══ Main ═══

async function main() {
  const args = process.argv.slice(2);
  const live = args.includes("--live");
  const mode = live ? "LIVE" : MODE;

  if (args.includes("--all")) {
    // Run all pairs with decision.json from today
    const date = require("../ny_time.cjs").getNYDate();
    const sharedDir = path.join(ROOT, "shared", date);
    const pairs = [];

    if (fs.existsSync(sharedDir)) {
      for (const entry of fs.readdirSync(sharedDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const decisionFile = path.join(sharedDir, entry.name, "decision.json");
          if (fs.existsSync(decisionFile)) {
            const pair = entry.name === "GOLD" ? "XAUUSD" : entry.name;
            pairs.push(pair);
          }
        }
      }
    }

    if (pairs.length === 0) {
      console.log("[MT5_AUTO] No decision.json files found for today");
      return;
    }

    console.log(`[MT5_AUTO] Processing ${pairs.length} pairs (${mode} mode): ${pairs.join(", ")}`);
    console.log("");

    for (const pair of pairs) {
      const result = await autoTrade(pair, { live });
      writeResult(pair, result);
      printResult(result);
    }

    console.log(`[MT5_AUTO] Done — ${pairs.length} pairs processed`);
    return;
  }

  // Single pair mode
  const pair = args[0];
  if (!pair) {
    console.log("MT5 Auto-Trader — usage:");
    console.log("  node tools/mt5/mt5_auto_trade.cjs <PAIR>             REVIEW mode");
    console.log("  node tools/mt5/mt5_auto_trade.cjs <PAIR> --live       LIVE mode");
    console.log("  node tools/mt5/mt5_auto_trade.cjs --all               All pairs REVIEW");
    console.log("  node tools/mt5/mt5_auto_trade.cjs --all --live        All pairs LIVE");
    console.log("");
    console.log("Env: MT5_MODE=REVIEW|LIVE  MT5_BRIDGE_URL=http://127.0.0.1:5111");
    return;
  }

  console.log(`[MT5_AUTO] ${pair} — ${mode} mode`);
  console.log("");

  const result = await autoTrade(pair, { live });
  writeResult(pair, result);
  printResult(result);

  process.exit(result.executed ? 0 : 1);
}

if (require.main === module) {
  main().catch((e) => {
    console.error("[MT5_AUTO] fatal:", e.message);
    process.exit(1);
  });
}

module.exports = { autoTrade };
