// Premium Session Data Fetcher — pulls all TFs for all pairs from TV
// Usage: node tools/tv-mcp/fetch_premium.cjs GBPUSD GOLD EURUSD DXY

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const ROOT = path.join(__dirname, "..", "..");
const DATE = new Date().toISOString().split("T")[0];
const PAIRS = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ["GBPUSD", "GOLD", "EURUSD", "DXY"];
const FETCH_SCRIPT = path.join(__dirname, "fetch_candles.cjs");

console.log(`Premium Data Fetch — ${DATE} — ${PAIRS.join(", ")}`);
console.log("=".repeat(50));

for (const pair of PAIRS) {
  const outputDir = path.join(ROOT, "shared", DATE, pair);
  fs.mkdirSync(outputDir, { recursive: true });

  console.log(`\n${pair}:`);
  try {
    const result = execSync(
      `node "${FETCH_SCRIPT}" --pair ${pair} --all-tfs --output-dir "${outputDir}" --silent`,
      { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", timeout: 120000 }
    );
    const data = JSON.parse(result);
    for (const [tf, info] of Object.entries(data.timeframes)) {
      if (info.last) {
        console.log(`  ${tf}: ${info.count} candles, last=${info.last.close}`);
      } else {
        console.log(`  ${tf}: ERROR — ${info.error}`);
      }
    }
  } catch (e) {
    console.log(`  FAILED: ${e.message.slice(0, 80)}`);
  }
}

console.log(`\nDone. Data saved to shared/${DATE}/`);
