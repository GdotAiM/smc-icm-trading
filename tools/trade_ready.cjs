// Trade Ready Scanner — "Is anything tradeable right now?"
// Lightweight. Runs in ~10 seconds. Only reports actionable setups.
// Usage: node tools/trade_ready.cjs
//        node tools/trade_ready.cjs --watch  (every 10 min)

const { execSync } = require("child_process");
const path = require("path");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..");
const PAIRS = ["EURUSD", "GBPUSD", "XAUUSD", "NAS100"];
const WATCH = process.argv.includes("--watch");

function r5(v) { return Number(v).toFixed(5); }

async function scan() {
  const nyTime = new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false });
  const setups = [];

  for (const pair of PAIRS) {
    const output = execSync(`node "${path.join(ROOT, "tools", "run_pair.cjs")}" ${pair}`, {
      encoding: "utf8", timeout: 120000, stdio: ["ignore", "pipe", "ignore"]
    });

    const tradeable = !output.includes("Entry: NO TRADE") && output.includes("INDUCEMENT GATE: ✅");
    if (!tradeable) continue;

    const entry = (output.match(/Entry: (\w+) @ ([\d.]+)/) || [])[0] || "?";
    const model = (output.match(/Model: (.+?) \(([\d.]+)\//) || [])[1] || "?";
    const rr = (output.match(/R:R: ([\d.]+):1/) || [])[1] || "?";
    const coh = parseInt((output.match(/Unified Coherence: (\d+)/) || [])[1] || "0");
    const lectures = [];
    if (output.includes("LECTURE 2 SETUP READY")) lectures.push("L2");
    if (output.includes("LECTURE 1 SETUP READY")) lectures.push("L1");
    if (output.includes("LECTURE 4 SETUP READY")) lectures.push("L4");
    const entryPrice = (output.match(/Entry: \w+ @ ([\d.]+)/) || [])[1];
    const slPrice = (output.match(/\| SL \| ([\d.]+)/) || [])[1];
    const tpPrice = (output.match(/\| TP1 \| ([\d.]+)/) || [])[1];

    setups.push({ pair, entry, model, rr: parseFloat(rr), coh, lectures, entryPrice, slPrice, tpPrice });
  }

  // Output
  console.log(`\n🔍 Trade Ready Scan — ${nyTime} NY`);
  if (setups.length === 0) {
    console.log(`  ⏳ No tradeable setups. ${PAIRS.length} pairs scanned, all blocked or no entry.`);
    return setups;
  }

  setups.sort((a, b) => (b.coh + b.rr * 10) - (a.coh + a.rr * 10));

  for (const s of setups) {
    const lectureStr = s.lectures.length > 0 ? ` [${s.lectures.join(',')}]` : '';
    console.log(`  ✅ ${s.pair}: ${s.entry} | ${s.model}${lectureStr} | R:R ${s.rr}:1 | Coh: ${s.coh}/100`);
    if (s.entryPrice) console.log(`     Entry: ${s.entryPrice} | SL: ${s.slPrice || '?'} | TP: ${s.tpPrice || '?'}`);
  }

  console.log(`\n  🎯 BEST: ${setups[0].pair} ${setups[0].entry.split(' @ ')[0]} | R:R ${setups[0].rr}:1`);
  if (setups[0].entryPrice) {
    console.log(`     node tools/tv-mcp/market_order.cjs ${setups[0].pair} ${setups[0].entry.split(' @ ')[0]} ${setups[0].slPrice} ${setups[0].tpPrice} 5000`);
  }

  return setups;
}

scan().then(setups => {
  if (WATCH && setups.length === 0) {
    console.log(`  Next scan in 10 min...`);
    setTimeout(() => require(__filename), 600000);
  }
});
