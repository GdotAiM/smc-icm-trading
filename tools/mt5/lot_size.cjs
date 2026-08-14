// MT5 Lot-Size Calculator
//
// Derives trade volume from risk parameters and pair specifications.
// Can run standalone or be required as a module.
//
// Formula (from _config/trading_rules.md + MT5_INTEGRATION.md):
//   risk$ = min(1% of balance, remaining daily loss budget)
//   volume = risk$ / (stopDistancePips × pipValuePerLot)
//   → rounded down to volume_step, clamped to [volume_min, volume_max]
//
// Usage:
//   node tools/mt5/lot_size.cjs GBPUSD 0.0030        # pair + stop distance in price
//   node tools/mt5/lot_size.cjs XAUUSD 1.50 --risk 50 # explicit risk$

const http = require("http");
const path = require("path");
const fs = require("fs");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "../..");
const BRIDGE_URL = process.env.MT5_BRIDGE_URL || "http://127.0.0.1:5111";

// ═══ Default symbol specs (fallback when bridge is unreachable) ═══
// Using MetaQuotes-Demo specs from P0 verification (Aug 10, 2026)

const DEFAULTS = {
  GBPUSD: { pipSize: 0.0001, pipValuePerLot: 10.0, volMin: 0.01, volMax: 100, volStep: 0.01, digits: 5 },
  EURUSD: { pipSize: 0.0001, pipValuePerLot: 10.0, volMin: 0.01, volMax: 100, volStep: 0.01, digits: 5 },
  XAUUSD: { pipSize: 0.01,   pipValuePerLot: 1.0, volMin: 0.01, volMax: 50, volStep: 0.01, digits: 2 },
  USTEC:  { pipSize: 0.01,   pipValuePerLot: 0.01, volMin: 0.01, volMax: 100, volStep: 0.01, digits: 2 },
  NAS100: { pipSize: 0.01,   pipValuePerLot: 0.01, volMin: 0.01, volMax: 100, volStep: 0.01, digits: 2 },
  US100:  { pipSize: 0.01,   pipValuePerLot: 0.01, volMin: 0.01, volMax: 100, volStep: 0.01, digits: 2 },
};

const RISK_PER_TRADE = 0.01;   // 1% per trade
const DAILY_LOSS_CAP = 0.03;   // 3% daily max
const MAX_POSITIONS = 2;

// ═══ Bridge call (same pattern as mt5_executor.cjs) ═══

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
        res.on("data", (chunk) => { data += chunk; });
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

// ═══ Core calculation ═══

async function fetchSymbolSpec(symbol) {
  // Try bridge first, fall back to defaults
  try {
    const info = await bridgeCall("symbol_info", { symbol });
    const tickSize = info.tick_size || 0;
    const tickValue = info.tick_value || 0;
    const contractSize = info.contract_size || 0;
    const digits = info.digits || 5;

    let pipSize, pipValuePerLot, source = "bridge";

    if (digits === 5 || digits === 4) {
      // Forex: pip = 10 × point for 5-digit, 1 × point for 4-digit
      pipSize = (digits === 5 ? 10 : 1) * info.point;
      pipValuePerLot = (tickValue / tickSize) * pipSize;
    } else if (digits === 2 || digits === 3) {
      // Indices / Metals: pip = point for 2-digit
      pipSize = info.point;
      pipValuePerLot = (tickValue / tickSize) * info.point;
    } else {
      pipSize = info.point;
      pipValuePerLot = (tickValue / tickSize) * info.point;
    }

    // Authoritative pip value: ask MT5 what 1 lot × 1 pip move is worth.
    // Broker trade_tick_value is unreliable for some symbols on
    // MetaQuotes-Demo (XAUUSD reports 0.1 but true value is $1.00/pip/lot).
    try {
      const calc = await bridgeCall("order_calc_profit", {
        symbol, side: "buy", volume: 1,
        price_open: 1.0, price_close: 1.0 + pipSize,
      });
      if (calc && typeof calc.profit === "number") {
        pipValuePerLot = calc.profit;
        source = "bridge_calc";
      }
    } catch { /* fall back to tick_value derivation above */ }

    return {
      pipSize,
      pipValuePerLot,
      volMin: info.volume_min || 0.01,
      volMax: info.volume_max || 100,
      volStep: info.volume_step || 0.01,
      contractSize,
      source,
    };
  } catch {
    // Fallback: use hardcoded defaults
    const def = DEFAULTS[symbol];
    if (!def) throw new Error(`No defaults for ${symbol} and bridge is unreachable`);
    return {
      pipSize: def.pipSize,
      pipValuePerLot: def.pipValuePerLot,
      volMin: def.volMin,
      volMax: def.volMax,
      volStep: def.volStep,
      contractSize: null,
      source: "defaults",
    };
  }
}

async function fetchBalance() {
  try {
    const acc = await bridgeCall("account_info");
    return { balance: acc.balance, currency: acc.currency, source: "bridge" };
  } catch {
    return { balance: 100_000, currency: "USD", source: "defaults" };
  }
}

async function dailyPnl() {
  try {
    return await bridgeCall("history");
  } catch {
    return { realized: 0, open: 0, total: 0 };
  }
}

/**
 * Calculate trade volume from risk parameters.
 *
 * @param {object} opts
 * @param {string} opts.pair        - e.g. "GBPUSD", "XAUUSD", "USTEC"
 * @param {number} opts.riskDistance - stop distance in PRICE units (entry - sl)
 * @param {number} [opts.riskDollars] - explicit risk amount (overrides % calculation)
 * @param {number} [opts.accountBalance] - override account balance
 * @param {number} [opts.sizeMultiplier] - scale volume (e.g. 0.5 for second-chance)
 * @returns {object} { volume, riskDollars, stopPips, pipValue, ...meta }
 */
async function calcVolume(opts = {}) {
  const pair = (opts.pair || "GBPUSD").toUpperCase();
  const riskDistance = Math.abs(opts.riskDistance || 0);
  const sizeMultiplier = opts.sizeMultiplier || 1;

  if (riskDistance <= 0) {
    return { volume: 0.01, error: "riskDistance must be > 0", fallback: true };
  }

  // Fetch specs and balance in parallel
  const [spec, balance, pnl] = await Promise.all([
    fetchSymbolSpec(pair),
    opts.accountBalance ? Promise.resolve({ balance: opts.accountBalance, currency: "USD", source: "manual" }) : fetchBalance(),
    dailyPnl(),
  ]);

  const accountBalance = balance.balance;

  // Risk budget
  const risk1Pct = accountBalance * RISK_PER_TRADE;
  const dailyRemaining = Math.max(0, accountBalance * DAILY_LOSS_CAP - Math.abs(pnl.total));
  const riskDollars = opts.riskDollars || Math.min(risk1Pct, dailyRemaining);

  // Stop distance in pips
  const stopPips = riskDistance / spec.pipSize;

  // Volume
  let volume = riskDollars / (stopPips * spec.pipValuePerLot);
  volume *= sizeMultiplier;

  // Round down to volume_step
  const step = spec.volStep;
  volume = Math.floor(volume / step) * step;
  volume = Math.round(volume * 1e6) / 1e6; // floating-point cleanup

  // Clamp
  const clamped = Math.max(spec.volMin, Math.min(spec.volMax, volume));

  const warnings = [];
  if (volume < spec.volMin) warnings.push(`volume ${volume} < min ${spec.volMin} — clamped UP`);
  if (volume > spec.volMax) warnings.push(`volume ${volume} > max ${spec.volMax} — clamped DOWN`);
  if (clamped !== volume) warnings.push(`volume adjusted: ${volume} → ${clamped}`);

  return {
    volume: clamped,
    rawVolume: volume,
    riskDollars: Math.round(riskDollars * 100) / 100,
    stopPips: Math.round(stopPips * 10) / 10,
    pipSize: spec.pipSize,
    pipValuePerLot: spec.pipValuePerLot,
    accountBalance,
    dailyPnl: pnl.total,
    dailyRemaining: Math.round(dailyRemaining * 100) / 100,
    sizeMultiplier,
    specSource: spec.source,
    balanceSource: balance.source,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

// ═══ CLI ═══

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    console.log("MT5 Lot-Size Calculator");
    console.log("");
    console.log("Usage:");
    console.log("  node tools/mt5/lot_size.cjs <PAIR> <STOP_DISTANCE_PRICE> [--risk N] [--balance N] [--mult N]");
    console.log("");
    console.log("Examples:");
    console.log("  node tools/mt5/lot_size.cjs GBPUSD 0.0030");
    console.log("  node tools/mt5/lot_size.cjs XAUUSD 1.50 --risk 50");
    console.log("  node tools/mt5/lot_size.cjs USTEC 15.0 --balance 100000 --mult 0.5");
    console.log("");
    console.log("Options:");
    console.log("  --risk N      Explicit risk in dollars (default: 1% of balance or daily remaining)");
    console.log("  --balance N   Manual account balance (default: from bridge or 100000)");
    console.log("  --mult N      Size multiplier (e.g. 0.5 for second-chance entries)");
    console.log("  --json        Output raw JSON");
    return;
  }

  const pair = args[0];
  const stopDist = parseFloat(args[1]);
  if (!stopDist || stopDist <= 0) {
    console.error("Error: stop distance must be a positive number");
    process.exit(1);
  }

  const getArgNum = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? parseFloat(args[i + 1]) : null;
  };

  const result = await calcVolume({
    pair,
    riskDistance: stopDist,
    riskDollars: getArgNum("--risk"),
    accountBalance: getArgNum("--balance"),
    sizeMultiplier: getArgNum("--mult") || 1,
  });

  if (args.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`\n  Pair:        ${pair}`);
    console.log(`  Stop dist:   ${stopDist} (${result.stopPips} pips)`);
    console.log(`  Risk:        $${result.riskDollars} (balance: $${result.accountBalance.toLocaleString()})`);
    console.log(`  Multiplier:  ${result.sizeMultiplier}×`);
    console.log(`  Volume:      ${result.volume} lots`);
    if (result.warnings) {
      for (const w of result.warnings) console.log(`  ⚠ ${w}`);
    }
    console.log(`  Sources:     specs=${result.specSource} balance=${result.balanceSource}`);
    console.log("");
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error("lot_size error:", e.message);
    process.exit(1);
  });
}

module.exports = { calcVolume, fetchSymbolSpec, fetchBalance, DEFAULTS };
