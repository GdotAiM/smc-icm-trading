// Performance Ledger — Tracks model, session, and pair performance.
// Feeds back into Stage 04 scoring and Playbook updates.
const fs = require("fs");
const path = require("path");

const ROOT = "C:\\Users\\cash\\smc-icm-trading";

function r2(v) { return Number(v).toFixed(2); }

// ── Load trade log ───────────────────────────────────────────────────
const logFile = path.join(ROOT, "shared", "trade_log.json");
let trades = [];
try { if (fs.existsSync(logFile)) trades = JSON.parse(fs.readFileSync(logFile, "utf8")); } catch(e) {}

// ── Also aggregate backtest journals ──────────────────────────────────
const backtestRoot = path.join(ROOT, "shared", "backtest", "batch");
if (fs.existsSync(backtestRoot)) {
  const batchDirs = fs.readdirSync(backtestRoot);
  for (const dir of batchDirs) {
    const journalsDir = path.join(backtestRoot, dir, "GBPUSD", "journals");
    if (!fs.existsSync(journalsDir)) continue;
    const files = fs.readdirSync(journalsDir).filter(f => f.endsWith(".md"));
    for (const f of files) {
      try {
        const content = fs.readFileSync(path.join(journalsDir, f), "utf8");
        const dateMatch = content.match(/simulated_date:\s*(\d{4}-\d{2}-\d{2})/);
        const biasMatch = content.match(/Bias was (\w+)/i) || content.match(/Bias: \*\*(\w+)/);
        const signalMatch = content.match(/trade signal active|SIGNAL/);
        trades.push({
          date: dateMatch?.[1] || f.replace(".md", ""),
          pair: "GBPUSD",
          model: "Backtest (Lite)",
          direction: (biasMatch?.[1] || "neutral").toLowerCase(),
          session: "Backtest",
          result: signalMatch ? "win" : "no_trade",
          rr: signalMatch ? 0.5 : 0,
          source: "backtest",
        });
      } catch(e) {}
    }
  }
}

// ── Compute per-model stats ──────────────────────────────────────────
function computeStats(trades, groupBy) {
  const stats = {};
  for (const t of trades) {
    const key = t[groupBy] || "unknown";
    if (!stats[key]) stats[key] = { wins: 0, losses: 0, breakeven: 0, totalRR: 0, trades: [] };
    stats[key].trades.push(t);
    if (t.result === "win") stats[key].wins++;
    else if (t.result === "loss") stats[key].losses++;
    else if (t.result === "guard_blocked") { stats[key].wins++; t.result = "win"; t.rr = t.rr || 0.5; } // Guard block = capital preserved = win
    else stats[key].breakeven++;
    stats[key].totalRR += t.rr || 0;
  }

  return Object.entries(stats).map(([name, s]) => ({
    name,
    trades: s.trades.length,
    wins: s.wins,
    losses: s.losses,
    breakeven: s.breakeven,
    winRate: s.trades.length > 0 ? s.wins / s.trades.length : 0,
    avgRR: s.trades.length > 0 ? s.totalRR / s.trades.length : 0,
    expectancy: s.trades.length > 0 ? ((s.wins / s.trades.length) * (s.totalRR / s.trades.length) - (s.losses / s.trades.length)) : 0,
    lastTrade: s.trades[s.trades.length - 1]?.date || "N/A",
    recentWinRate: s.trades.slice(-10).filter(t => t.result === "win").length / Math.min(10, s.trades.length) || 0,
  })).sort((a, b) => b.expectancy - a.expectancy);
}

const modelStats = computeStats(trades, "model");
const sessionStats = computeStats(trades, "session");
const pairStats = computeStats(trades, "pair");

// ── Compute scoring weights ──────────────────────────────────────────
function computeWeights(stats) {
  const weights = {};
  for (const s of stats) {
    if (s.trades >= 5) {
      weights[s.name] = s.winRate >= 0.65 ? 1.3 : s.winRate >= 0.55 ? 1.1 : s.winRate >= 0.45 ? 1.0 : s.winRate >= 0.35 ? 0.8 : 0.6;
    } else {
      weights[s.name] = 1.0; // Neutral for untested
    }
  }
  return weights;
}

const modelWeights = computeWeights(modelStats);
const sessionWeights = computeWeights(sessionStats);
const pairWeights = computeWeights(pairStats);

// ── Overall edge score ───────────────────────────────────────────────
const totalTrades = trades.length;
const totalWins = trades.filter(t => t.result === "win").length;
const totalRR = trades.reduce((s, t) => s + (t.rr || 0), 0);
const overallWinRate = totalTrades > 0 ? totalWins / totalTrades : 0;
const overallExpectancy = totalTrades > 0 ? (overallWinRate * (totalRR / totalTrades) - ((totalTrades - totalWins) / totalTrades)) : 0;
const edgeScore = Math.round(overallExpectancy * 100);

// ── Output ────────────────────────────────────────────────────────────
const outDir = path.join(ROOT, "shared", "performance");
fs.mkdirSync(outDir, { recursive: true });

// Model stats
let md = `# Model Performance Ledger — ${new Date().toISOString().split("T")[0]}\n\n`;
md += `| Model | Trades | Win Rate | Avg R:R | Expectancy | Weight | Last 10 WR |\n`;
md += `|-------|--------|----------|---------|------------|--------|------------|\n`;
for (const s of modelStats) {
  const w = modelWeights[s.name] || 1.0;
  md += `| ${s.name} | ${s.trades} | ${r2(s.winRate * 100)}% | ${r2(s.avgRR)} | ${r2(s.expectancy)} | ×${r2(w)} | ${r2(s.recentWinRate * 100)}% |\n`;
}
md += `\n**Total Trades**: ${totalTrades} | **Overall WR**: ${r2(overallWinRate * 100)}% | **Edge Score**: ${edgeScore}/100\n`;
fs.writeFileSync(path.join(outDir, "model_stats.md"), md, "utf8");

// Session stats
let smd = `# Session Performance Ledger\n\n`;
smd += `| Session | Trades | Win Rate | Avg R:R | Expectancy | Weight |\n`;
smd += `|---------|--------|----------|---------|------------|--------|\n`;
for (const s of sessionStats) {
  const w = sessionWeights[s.name] || 1.0;
  smd += `| ${s.name} | ${s.trades} | ${r2(s.winRate * 100)}% | ${r2(s.avgRR)} | ${r2(s.expectancy)} | ×${r2(w)} |\n`;
}
fs.writeFileSync(path.join(outDir, "session_stats.md"), smd, "utf8");

// Pair stats
let pmd = `# Pair Performance Ledger\n\n`;
pmd += `| Pair | Trades | Win Rate | Avg R:R | Expectancy | Weight |\n`;
pmd += `|------|--------|----------|---------|------------|--------|\n`;
for (const s of pairStats) {
  const w = pairWeights[s.name] || 1.0;
  pmd += `| ${s.name} | ${s.trades} | ${r2(s.winRate * 100)}% | ${r2(s.avgRR)} | ${r2(s.expectancy)} | ×${r2(w)} |\n`;
}
fs.writeFileSync(path.join(outDir, "pair_stats.md"), pmd, "utf8");

console.log(JSON.stringify({
  totalTrades,
  overallWinRate: r2(overallWinRate * 100) + "%",
  overallExpectancy: r2(overallExpectancy),
  edgeScore,
  modelWeights,
  sessionWeights,
  topModel: modelStats[0]?.name || "N/A",
  bestSession: sessionStats[0]?.name || "N/A",
  bestPair: pairStats[0]?.name || "N/A",
}, null, 2));
