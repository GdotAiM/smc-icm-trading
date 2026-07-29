// Quick trade status read — zero CDP, reads from disk. Instant.
// Usage: node tools/tv-mcp/trade_status.cjs [pair]

const fs = require("fs");
const path = require("path");

const STATUS_DIR = "C:\\Users\\cash\\smc-icm-trading\\shared\\monitor";
const pair = (process.argv[2] || "nas100").toLowerCase();

const tradeFile = path.join(STATUS_DIR, `${pair}_trade.json`);
const eventsFile = path.join(STATUS_DIR, `events.jsonl`);
const statusFile = path.join(STATUS_DIR, `status.json`);

// ── Trade status ──
if (fs.existsSync(tradeFile)) {
  const trade = JSON.parse(fs.readFileSync(tradeFile, "utf8"));
  const sign = trade.pnl >= 0 ? "+" : "";
  const dir = trade.pnl >= 0 ? "✅" : "🔴";
  console.log(`${dir} ${trade.pair.toUpperCase()} SHORT`);
  console.log(`   Entry: ${trade.entry} | Now: ${trade.currentPrice}`);
  console.log(`   P&L:   ${sign}${trade.pnl.toFixed(0)} pts (${trade.pnlPct}% of risk)`);
  console.log(`   SL:    ${trade.sl} (${trade.slDist.toFixed(0)} pts away, ${trade.slDistPct}% buffer)`);
  console.log(`   TP1:   ${trade.tp1}`);
  console.log(`   Updated: ${trade.updated}`);
} else {
  console.log(`No active trade for ${pair.toUpperCase()}`);
}

// ── Recent events ──
console.log(`\n─── Recent structural events ───`);
if (fs.existsSync(eventsFile)) {
  const lines = fs.readFileSync(eventsFile, "utf8").trim().split("\n");
  const recent = lines.slice(-15);
  for (const line of recent) {
    try {
      const e = JSON.parse(line);
      const emoji = e.dir === "BULLISH" ? "🟢" : "🔴";
      console.log(`  [${e.pair || '?'}] ${emoji} ${e.type} ${e.dir} | from ${e.from} → to ${e.to} | ${e.time}`);
    } catch {}
  }
}

// ── All pairs snapshot ──
console.log(`\n─── All pairs snapshot ───`);
if (fs.existsSync(statusFile)) {
  const status = JSON.parse(fs.readFileSync(statusFile, "utf8"));
  for (const [p, s] of Object.entries(status.pairs)) {
    if (s.price) {
      console.log(`  ${p}: ${s.price} | events: ${(s.events||[]).map(e => e.type + ' ' + e.dir).join(', ') || 'none'}`);
    }
  }
}
