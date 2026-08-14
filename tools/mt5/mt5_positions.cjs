// MT5 Positions Feed — JSON output for downstream tools
//
// Queries the MT5 bridge for open positions and outputs them in the same
// array-of-arrays format as the TV positions_json.cjs so session_monitor,
// management scripts, and Discord bots don't need changes.
//
// Output format: [[symbol, side, qty, entry, tp, sl, current, pnl], ...]
//
// Usage:
//   node tools/mt5/mt5_positions.cjs              # array-of-arrays (TV-compatible)
//   node tools/mt5/mt5_positions.cjs --json       # structured JSON with metadata
//   node tools/mt5/mt5_positions.cjs --summary    # summary only (count, total PnL)
//   node tools/mt5/mt5_positions.cjs --watch      # continuous feed (for monitor)

const http = require("http");
const path = require("path");
const fs = require("fs");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "../..");
const BRIDGE_URL = process.env.MT5_BRIDGE_URL || "http://127.0.0.1:5111";
const WATCH_INTERVAL = process.env.MT5_WATCH_INTERVAL || 60; // seconds

// ═══ Bridge call ═══

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
          } catch { reject(new Error("parse error: " + data.substring(0, 100))); }
        });
      }
    );
    req.on("error", (e) => reject(new Error("bridge unreachable: " + e.message)));
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.write(body);
    req.end();
  });
}

// ═══ Fetch positions with live prices ═══

async function fetchPositions() {
  let positions = [];
  let tickCache = {};

  try {
    const result = await bridgeCall("positions");
    positions = result.positions || [];
  } catch (e) {
    return { positions: [], error: e.message };
  }

  // Enrich with current price (tick) for each unique symbol
  const symbols = [...new Set(positions.map(p => p.symbol))];
  for (const sym of symbols) {
    try {
      const tick = await bridgeCall("tick", { symbol: sym });
      tickCache[sym] = tick;
    } catch {
      // tick unavailable — use price_open as fallback
    }
  }

  // Map to TV-compatible array format: [symbol, side, qty, entry, tp, sl, current, pnl]
  const rows = positions.map(p => {
    const tick = tickCache[p.symbol];
    const current = tick ? tick.bid : p.price_open;
    const sideStr = p.side === "BUY" ? "Long" : "Short";
    // Normalize symbol for downstream consumers
    const displaySymbol = p.symbol === "USTEC" ? "NAS100" : p.symbol;
    return [
      displaySymbol,
      sideStr,
      String(p.volume),
      String(p.price_open),
      String(p.tp || 0),
      String(p.sl || 0),
      String(current),
      String(Math.round(p.profit * 100) / 100),
    ];
  });

  return {
    positions: rows,
    count: rows.length,
    totalPnl: Math.round(positions.reduce((sum, p) => sum + p.profit, 0) * 100) / 100,
    raw: positions,
    tickCache,
  };
}

// ═══ Output formatters ═══

async function outputArray() {
  try {
    const { positions } = await fetchPositions();
    console.log(JSON.stringify(positions));
  } catch {
    console.log("[]");
  }
}

async function outputJson() {
  try {
    const data = await fetchPositions();
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.log(JSON.stringify({ error: e.message, positions: [] }));
  }
}

async function outputSummary() {
  try {
    const { count, totalPnl, positions } = await fetchPositions();
    console.log(JSON.stringify({
      count,
      totalPnl,
      maxPositions: 2,
      pairs: positions.map(r => r[0]),
      updated: new Date().toISOString(),
    }));
  } catch (e) {
    console.log(JSON.stringify({ count: 0, error: e.message }));
  }
}

// ═══ Main ═══

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--watch")) {
    // Continuous feed for session monitor
    console.log("[MT5_POSITIONS] Watch mode — interval " + WATCH_INTERVAL + "s");
    while (true) {
      try {
        const data = await fetchPositions();
        const line = JSON.stringify({
          time: new Date().toISOString(),
          count: data.count,
          totalPnl: data.totalPnl,
          positions: data.positions,
        });
        console.log(line);
      } catch (e) {
        console.log(JSON.stringify({ time: new Date().toISOString(), count: -1, error: e.message }));
      }
      await new Promise(r => setTimeout(r, WATCH_INTERVAL * 1000));
    }
  }

  if (args.includes("--json")) return outputJson();
  if (args.includes("--summary")) return outputSummary();

  // Default: TV-compatible array format
  return outputArray();
}

if (require.main === module) {
  main().catch((e) => {
    console.error("[MT5_POSITIONS] fatal:", e.message);
    console.log("[]");
    process.exit(1);
  });
}

module.exports = { fetchPositions, bridgeCall };
