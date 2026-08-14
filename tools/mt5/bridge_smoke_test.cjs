// MT5 Bridge smoke test — drives tools/mt5/mt5_bridge.py over stdio
// Validates: ping, account_info, symbol_info (all 4 pairs), tick,
// market_order (0.01 demo), modify_sl_tp, partial_close, close_position,
// positions, history, shutdown.
//
// Usage: node tools/mt5/bridge_smoke_test.cjs
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const ROOT = process.env.WORKSPACE_ROOT || "C:\\Users\\cash\\smc-icm-trading";
const BRIDGE = path.join(ROOT, "tools", "mt5", "mt5_bridge.py");

const PY = process.env.PYTHON || "python";
const DEV = 30;
const REQUEST_ID = `s${Date.now() % 100000}`;  // compact for MT5 27-char comment limit
let reqId = 0;
let failed = 0;

function check(label, ok, extra = "") {
  if (ok) {
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label} ${extra}`);
  }
}

function req(bridge, cmd, args = {}) {
  const id = ++reqId;
  return new Promise((resolve, reject) => {
    const onLine = (line) => {
      try {
        const msg = JSON.parse(line);
        if (msg.id !== id) return;
        bridge.stdout.off("data", onLine);
        resolve(msg);
      } catch (e) {
        // not for us, keep waiting
      }
    };
    bridge.stdout.on("data", onLine);
    bridge.stdin.write(JSON.stringify({ id, cmd, args }) + "\n");
  });
}

async function main() {
  console.log(`[smoke] spawning ${PY} ${BRIDGE}`);
  const bridge = spawn(PY, [BRIDGE], { cwd: ROOT });
  bridge.stderr.on("data", (d) => process.stderr.write(`[bridge] ${d}`));

  await new Promise((r) => setTimeout(r, 1500));

  // 1. ping
  let r = await req(bridge, "ping");
  check("ping -> pong", r.ok && r.result.pong === true, JSON.stringify(r));

  // 2. account_info
  r = await req(bridge, "account_info");
  check("account_info -> balance>0", r.ok && r.result.balance > 0, JSON.stringify(r));
  check("account_info -> masked login", r.ok && /\*\*/.test(r.result.login || ""), JSON.stringify(r.result?.login));

  // 3. symbol_info for all 4 mapped pairs
  for (const sym of ["GBPUSD", "EURUSD", "XAUUSD", "USTEC"]) {
    r = await req(bridge, "symbol_info", { symbol: sym });
    check(`symbol_info ${sym} -> ok`, r.ok, JSON.stringify(r));
    check(`symbol_info ${sym} -> volume_step`, r.ok && r.result.volume_step > 0, `step=${r.result?.volume_step}`);
    check(`symbol_info ${sym} -> visible`, r.ok && r.result.visible === true, `visible=${r.result?.visible}`);
  }

  // 4. tick
  r = await req(bridge, "tick", { symbol: "GBPUSD" });
  check("tick GBPUSD -> bid>0", r.ok && r.result.bid > 0, JSON.stringify(r.result));

  // 4b. order_calc_profit — authoritative pip-value check
  r = await req(bridge, "order_calc_profit", { symbol: "XAUUSD", side: "buy", volume: 1, price_open: 4380, price_close: 4381 });
  check("order_calc_profit XAUUSD -> $100/1$ move/lot", r.ok && Math.abs(r.result.profit - 100) < 0.01, JSON.stringify(r.result));
  r = await req(bridge, "order_calc_profit", { symbol: "GBPUSD", side: "buy", volume: 1, price_open: 1.2650, price_close: 1.2660 });
  check("order_calc_profit GBPUSD -> $100/10pip/lot", r.ok && Math.abs(r.result.profit - 100) < 0.01, JSON.stringify(r.result));

  // 5. market_order BUY 0.02 GBPUSD with SL/TP (0.02 so partial close of 0.01 is valid)
  r = await req(bridge, "market_order", { symbol: "GBPUSD", side: "BUY", volume: 0.02, request_id: REQUEST_ID });
  check("market_order BUY -> ticket", r.ok && r.result.ticket > 0, JSON.stringify(r));
  const ticket = r.result?.ticket;
  const entry = r.result?.price;

  // 6. positions
  r = await req(bridge, "positions");
  check("positions -> 1 open", r.ok && r.result.count === 1, JSON.stringify(r.result));

  // 7. modify_sl_tp
  const sl = +(entry - 0.0015).toFixed(5);
  const tp = +(entry + 0.0015).toFixed(5);
  r = await req(bridge, "modify_sl_tp", { position: ticket, sl, tp });
  check("modify_sl_tp -> ok", r.ok && Math.abs(r.result.sl - sl) < 1e-6, JSON.stringify(r));

  // 8. partial_close 50% (0.01 from 0.02 — matches GBPUSD volume_step)
  r = await req(bridge, "partial_close", { position: ticket, volume: 0.01, deviation: DEV });
  check("partial_close -> ok", r.ok, JSON.stringify(r));
  r = await req(bridge, "positions");
  check("positions -> volume reduced", r.ok && Math.abs(r.result.positions[0]?.volume - 0.01) < 1e-6, JSON.stringify(r.result));

  // 9. close_position (close remaining 0.01 before idempotency test)
  r = await req(bridge, "close_position", { position: ticket, deviation: DEV });
  check("close_position -> ok", r.ok, JSON.stringify(r));
  r = await req(bridge, "positions");
  check("positions -> 0 open", r.ok && r.result.count === 0, JSON.stringify(r.result));

  // 10. idempotency: same request_id must NOT double-place (comment dedup catches it in history)
  r = await req(bridge, "market_order", { symbol: "GBPUSD", side: "BUY", volume: 0.02, request_id: REQUEST_ID });
  check("idempotent duplicate -> duplicate=true", r.ok && r.result.duplicate === true, JSON.stringify(r));

  // 11. history
  r = await req(bridge, "history");
  check("history -> ok", r.ok && typeof r.result.realized === "number", JSON.stringify(r.result));

  // 12. shutdown
  r = await req(bridge, "shutdown");
  check("shutdown -> bye", r.ok && r.result.bye === true, JSON.stringify(r));

  console.log(`\n[smoke] ${failed === 0 ? "ALL PASS" : `${failed} FAILURES`}`);
  bridge.kill();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("[smoke] crashed:", e);
  process.exit(1);
});
