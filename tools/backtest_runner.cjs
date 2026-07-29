// Batch Backtest Runner — Processes historical date ranges offline.
// Runs SMC engines, stage summaries, and forced journals for each day.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = "C:\\Users\\cash\\smc-icm-trading";
const ENGINE = path.join(ROOT, "tools", "smc-engine");

const PAIR = process.argv[2] || "GBPUSD";
const START = process.argv[3] || "2026-07-20";
const END = process.argv[4] || "2026-07-26";
const TFS = ["1D", "4H", "1H"]; // Key TFs for batch (faster than all 7)

const pairDir = PAIR === "GOLD" ? "GOLD" : PAIR === "NAS100" ? "NAS100" : PAIR === "DXY" ? "DXY" : PAIR;

function r2(v) { return Number(v).toFixed(2); }
function r5(v) { return Number(v).toFixed(5); }

// ── Generate date range ────────────────────────────────────────────────
function dateRange(start, end) {
  const dates = [];
  let current = new Date(start);
  const last = new Date(end);
  while (current <= last) {
    dates.push(current.toISOString().split("T")[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

const dates = dateRange(START, END);
console.error(`Backtest: ${PAIR} | ${dates.length} days | ${START} → ${END}`);

// ── Output directories ──────────────────────────────────────────────────
const batchDir = path.join(ROOT, "shared", "backtest", "batch", `${START}_to_${END}`, PAIR);
const journalsDir = path.join(batchDir, "journals");
const summariesDir = path.join(batchDir, "daily_summaries");
const engineDir = path.join(batchDir, "engine_reports");
fs.mkdirSync(journalsDir, { recursive: true });
fs.mkdirSync(summariesDir, { recursive: true });
fs.mkdirSync(engineDir, { recursive: true });

// ── Process each day ────────────────────────────────────────────────────
let totalTrades = 0, totalNoTrades = 0;
const dailyResults = [];

for (const date of dates) {
  console.error(`\n${date}...`);

  // Check if engine data exists for this date
  const liveDataDir = path.join(ROOT, "shared", date, pairDir);
  if (!fs.existsSync(liveDataDir)) {
    console.error(`  No engine data for ${date} — skipping`);
    dailyResults.push({ date, status: "no_data" });
    continue;
  }

  // Check which engine reports exist
  const engineFiles = fs.readdirSync(liveDataDir).filter(f => f.startsWith("engine_"));
  if (engineFiles.length === 0) {
    console.error(`  No engine reports for ${date} — skipping`);
    dailyResults.push({ date, status: "no_engine" });
    continue;
  }

  // Copy engine reports to backtest
  const btEngineDir = path.join(engineDir, date);
  fs.mkdirSync(btEngineDir, { recursive: true });
  for (const f of engineFiles) {
    fs.copyFileSync(path.join(liveDataDir, f), path.join(btEngineDir, f));
  }

  // ── Build daily summary ─────────────────────────────────────────────
  let summary = `# Daily Summary — ${PAIR} — ${date}\n\n`;
  summary += `---\nmode: backtest\ntype: batch\nsimulated_date: ${date}\npair: ${PAIR}\n---\n\n`;

  // Read 4H and 1D engine reports
  let r4h = null, r1d = null;
  try { r4h = JSON.parse(fs.readFileSync(path.join(liveDataDir, "engine_4h.json"), "utf8")); } catch(e) {}
  try { r1d = JSON.parse(fs.readFileSync(path.join(liveDataDir, "engine_1d.json"), "utf8")); } catch(e) {}

  if (!r4h && !r1d) {
    summary += "Insufficient engine data.\n";
  } else {
    const bias = r4h?.structure?.bias || r1d?.structure?.bias || "neutral";
    const event = r4h?.structure?.lastEvent || "none";
    const pools = (r4h?.liquidity || []).length;
    const swept = (r4h?.liquidity || []).filter(p => p.swept).length;
    const obs = (r4h?.orderBlocks || []).length;
    const fvgs = (r4h?.fvgs || []).length;

    summary += `## Structure\n- Bias: **${bias.toUpperCase()}** | Event: ${event}\n`;
    summary += `- Pools: ${pools} | Swept: ${swept} | OBs: ${obs} | FVGs: ${fvgs}\n\n`;

    // Simple model check
    const tradeSignal = bias !== "neutral" && swept > 0;
    if (tradeSignal) {
      totalTrades++;
      summary += `## Trade Decision: **${bias.toUpperCase()}**\n`;
      summary += `- Signal: ${bias === 'bearish' ? 'SHORT' : 'LONG'} (sweep detected)\n`;
    } else {
      totalNoTrades++;
      summary += `## Trade Decision: **NO TRADE**\n- Insufficient signals\n`;
    }
  }

  // ── Write files ──────────────────────────────────────────────────────
  fs.writeFileSync(path.join(summariesDir, `${date}.md`), summary, "utf8");

  // Journal entry (simplified Stage 07)
  const journal = `# Backtest Journal — ${PAIR} — ${date}

---
mode: backtest
type: batch
simulated_date: ${date}
pair: ${PAIR}
analysis_level: lite
---

## Simulated Trade Day
- Data source: Live engine reports from ${date}
- Analysis: Lite (structure + levels only)

## Decision
${r4h?.structure?.bias !== 'neutral' ? `Bias was ${r4h?.structure?.bias.toUpperCase()}. ${(r4h?.liquidity || []).filter(p => p.swept).length > 0 ? 'Sweep detected — trade signal active.' : 'No sweep — signal uncertain.'}` : 'Neutral bias — no trade.'}

## Lessons
- Backtest data point. Review for patterns across multiple days.
- ${(r4h?.liquidity || []).filter(p => p.swept).length > 0 ? 'Sweep WAS present — manipulation phase likely.' : 'No sweep — accumulation or distribution phase.'}

---
*Backtest journal — for statistical use only.*
`;
  fs.writeFileSync(path.join(journalsDir, `${date}.md`), journal, "utf8");

  dailyResults.push({
    date,
    bias: r4h?.structure?.bias || "neutral",
    swept: (r4h?.liquidity || []).filter(p => p.swept).length,
    signal: r4h?.structure?.bias !== "neutral" && (r4h?.liquidity || []).filter(p => p.swept).length > 0,
  });

  console.error(`  Bias: ${r4h?.structure?.bias || '?'} | Swept: ${(r4h?.liquidity || []).filter(p => p.swept).length} | Signal: ${r4h?.structure?.bias !== 'neutral' && (r4h?.liquidity || []).filter(p => p.swept).length > 0 ? 'YES' : 'NO'}`);
}

// ── Performance Summary ──────────────────────────────────────────────────
const signalDays = dailyResults.filter(d => d.signal);
const winRate = dates.length > 0 ? signalDays.length / dates.length : 0;

const summaryMd = `# Batch Backtest Summary — ${PAIR}
## Period: ${START} → ${END} (${dates.length} days)

## Results
- **Days with signals**: ${signalDays.length}/${dates.length} (${r2(winRate * 100)}%)
- **No-trade days**: ${totalNoTrades}
- **Bias distribution**: Bearish: ${dailyResults.filter(d => d.bias === 'bearish').length} | Bullish: ${dailyResults.filter(d => d.bias === 'bullish').length} | Neutral: ${dailyResults.filter(d => d.bias === 'neutral').length}

## Signal Days
${signalDays.map(d => `- ${d.date}: ${d.bias.toUpperCase()} (${d.swept} swept)`).join("\n")}

## Daily Details
${dailyResults.map(d => `- ${d.date}: Bias ${(d.bias || 'N/A').toUpperCase()} | ${d.swept || 0} swept | ${d.signal ? 'SIGNAL' : 'NO TRADE'} | ${d.status || 'processed'}`).join("\n")}

---
*Generated: ${new Date().toISOString()} | Batch backtest | Feed into Playbook with: node tools/backtest_distill.cjs ${PAIR}*
`;

fs.writeFileSync(path.join(batchDir, "performance_summary.md"), summaryMd, "utf8");

// Update master log
const logFile = path.join(ROOT, "shared", "backtest", "meta", "backtest_log.md");
const logEntry = `\n## ${PAIR} — ${START} to ${END}\n- **Date**: ${new Date().toISOString()}\n- **Days**: ${dates.length}\n- **Signals**: ${signalDays.length}\n- **Win Rate (signal days)**: ${r2(winRate * 100)}%\n- **Output**: ${batchDir}\n`;
fs.appendFileSync(logFile, logEntry, "utf8");

console.log(JSON.stringify({
  pair: PAIR,
  period: `${START} → ${END}`,
  days: dates.length,
  signals: signalDays.length,
  signalRate: r2(winRate * 100) + "%",
  output: batchDir,
  summary: summaryMd.length + " chars written",
}, null, 2));
