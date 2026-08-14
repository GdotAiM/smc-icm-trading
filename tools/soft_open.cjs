// ICT Gems — One-day soft open after a multi-day rally ≠ daily reversal.
//
// After a multi-day vertical move (consecutive daily closes in one direction),
// a single soft / inside day is NORMAL digestion — the algorithm absorbing the
// move before continuation — NOT evidence of a reversal. Flipping the daily
// bias on a soft open is the classic trap. This module emits the fact so the
// pipeline can guard against it.
//
// Usage: node tools/soft_open.cjs PAIR

const fs = require("fs");
const path = require("path");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..");
const DATE = require("./ny_time.cjs").getNYDate();
const PAIR = process.argv[2] || "GBPUSD";

function r5(v) { return Number(v).toFixed(5); }
function r2(v) { return Number(v).toFixed(2); }

function loadCandles(tf) {
  try {
    const dir = PAIR === "XAUUSD" ? "GOLD" : PAIR;
    return JSON.parse(fs.readFileSync(path.join(ROOT, "shared", DATE, dir, `candles_${tf}.json`), "utf8"));
  } catch { return null; }
}

function analyzeSoftOpen(pair) {
  const p = pair || PAIR;
  const daily = loadCandles("1d");
  if (!daily || daily.length < 6) {
    return { pair: p, available: false, softOpen: false, rallyDays: 0, direction: null, reversalRisk: "N/A", biasGuard: null, detail: "Insufficient daily data" };
  }

  const today = daily[daily.length - 1];
  const closed = daily.slice(0, -1);
  const yesterday = closed[closed.length - 1];

  // Consecutive daily closes in one direction, walking back from yesterday.
  let streak = 0;
  let dir = null; // true = up, false = down
  for (let i = closed.length - 1; i >= 1; i--) {
    const d = closed[i].close - closed[i - 1].close;
    if (d === 0) break;
    const up = d > 0;
    if (dir === null) dir = up;
    if (up !== dir) break;
    streak++;
  }

  // Today's softness: inside-day (contained within yesterday) or small range
  // relative to the average of recent closed days.
  const avgRange = closed.slice(-5).reduce((s, c) => s + (c.high - c.low), 0) / Math.min(5, closed.length) || 1;
  const todayRange = (today.high - today.low) || 0;
  const insideDay = today.high <= yesterday.high && today.low >= yesterday.low;
  const softRange = todayRange < 0.5 * avgRange;

  const softOpen = streak >= 2 && (insideDay || softRange);
  const direction = dir === null ? null : dir ? "up" : "down";

  let reversalRisk = "N/A", biasGuard = null;
  if (streak >= 2 && softOpen) {
    reversalRisk = "LOW";
    const dirLabel = direction === "up" ? "bullish" : "bearish";
    const moveLabel = direction === "up" ? "rally" : "decline";
    biasGuard = `DO NOT flip ${dirLabel} bias — ${streak}-day ${moveLabel} then one-day soft open = normal digestion, not a reversal (ICT)`;
  } else if (streak >= 2) {
    reversalRisk = "NORMAL";
    const moveLabel = direction === "up" ? "rally" : "decline";
    biasGuard = `No soft open — ${streak}-day ${moveLabel} continuing normally; bias holds`;
  }

  return {
    pair: p,
    available: true,
    softOpen,
    rallyDays: streak,
    direction,
    insideDay,
    softRange: todayRange / avgRange,
    reversalRisk,
    biasGuard,
    detail: (() => {
      const move = direction === "up" ? "rally" : "decline";
      const pct = r2((todayRange / avgRange) * 100) + "% of avg";
      const soft = softOpen
        ? `one-day SOFT OPEN (${insideDay ? "inside day" : "range " + pct})`
        : `today not soft (${insideDay ? "not inside" : "range " + pct})`;
      return `${streak}-day ${move} + ${soft} — reversal risk ${reversalRisk}`;
    })(),
  };
}

if (require.main === module) {
  const result = analyzeSoftOpen(PAIR);

  const outDir = path.join(ROOT, "stages", "00_macro_context", "output");
  fs.mkdirSync(outDir, { recursive: true });

  let md = `# Soft-Open Bias Guard — ${result.pair} — ${DATE}\n\n`;
  if (result.available) {
    md += `- **Streak**: ${result.rallyDays} consecutive daily ${result.direction === "up" ? "rally" : "decline"} closes\n`;
    md += `- **Today**: ${result.insideDay ? "INSIDE DAY (contained within yesterday)" : "not inside"} | range ${r2(result.softRange * 100)}% of avg\n`;
    md += `- **Soft open**: ${result.softOpen ? '✅ YES' : '❌ No'}\n`;
    md += `- **Reversal risk**: ${result.reversalRisk}\n`;
    md += result.biasGuard ? `- **Guard**: ${result.biasGuard}\n` : "";
  } else {
    md += result.detail + "\n";
  }

  const outFile = path.join(outDir, `${PAIR.toLowerCase()}_soft_open.md`);
  fs.writeFileSync(outFile, md, "utf8");

  console.log(`\n═══ SOFT-OPEN BIAS GUARD — ${PAIR} ═══`);
  console.log(`  ${result.detail}`);
  if (result.reversalRisk === "LOW") console.log(`  ⚠️  ${result.biasGuard}`);
  console.log(`  ✓ Output → ${outFile}`);
}

module.exports = { analyzeSoftOpen };
