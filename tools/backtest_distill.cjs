// Backtest Distiller — Extracts lessons from backtest journals into Playbook + Performance Ledger
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = "C:\\Users\\cash\\smc-icm-trading";

const PAIR = process.argv[2] || "GBPUSD";
const BATCH_DIR = process.argv[3] || ""; // Optional: specific batch directory

// ── Find backtest journals ─────────────────────────────────────────────
function findBacktestJournals() {
  const journals = [];
  const batchRoot = path.join(ROOT, "shared", "backtest", "batch");

  if (!fs.existsSync(batchRoot)) return journals;

  const batchDirs = BATCH_DIR ? [path.join(batchRoot, BATCH_DIR)] : fs.readdirSync(batchRoot).map(d => path.join(batchRoot, d));

  for (const batchDir of batchDirs) {
    const journalsDir = path.join(batchDir, PAIR, "journals");
    if (!fs.existsSync(journalsDir)) continue;

    const files = fs.readdirSync(journalsDir).filter(f => f.endsWith(".md"));
    for (const f of files) {
      try {
        const content = fs.readFileSync(path.join(journalsDir, f), "utf8");
        const dateMatch = content.match(/simulated_date:\s*(\d{4}-\d{2}-\d{2})/);
        const pairMatch = content.match(/pair:\s*(\w+)/);
        const biasMatch = content.match(/Bias was (\w+)/i) || content.match(/Bias: \*\*(\w+)/);
        const sweepMatch = content.match(/Sweep (\w+) present/i) || content.match(/(\d+) swept/);
        journals.push({
          date: dateMatch?.[1] || f.replace(".md", ""),
          pair: pairMatch?.[1] || PAIR,
          bias: biasMatch?.[1]?.toLowerCase() || "neutral",
          hasSignal: content.includes("trade signal active") || content.includes("SIGNAL"),
          file: path.join(journalsDir, f),
        });
      } catch(e) {}
    }
  }

  return journals;
}

const journals = findBacktestJournals();
console.error(`Found ${journals.length} backtest journals for ${PAIR}`);

if (journals.length === 0) {
  console.log(JSON.stringify({ distilled: false, reason: "No backtest journals found" }));
  process.exit(0);
}

// ── Extract patterns ───────────────────────────────────────────────────
const signalDays = journals.filter(j => j.hasSignal);
const signalRate = journals.length > 0 ? signalDays.length / journals.length : 0;
const biases = { bullish: journals.filter(j => j.bias === "bullish").length, bearish: journals.filter(j => j.bias === "bearish").length, neutral: journals.filter(j => j.bias === "neutral").length };

// ── Generate Playbook candidates ────────────────────────────────────────
const candidates = [];

if (signalRate > 0.5) {
  candidates.push(`High signal environment: ${Math.round(signalRate * 100)}% of backtest days had trade signals. Consider increasing session coverage.`);
} else {
  candidates.push(`Low signal environment: only ${Math.round(signalRate * 100)}% of backtest days had trade signals. Being selective is working.`);
}

if (biases.bearish > biases.bullish * 2) {
  candidates.push(`Dominant bias: BEARISH (${biases.bearish} days vs ${biases.bullish} bullish). The backtest period was strongly bearish.`);
} else if (biases.bullish > biases.bearish * 2) {
  candidates.push(`Dominant bias: BULLISH (${biases.bullish} days vs ${biases.bearish} bearish). The backtest period was strongly bullish.`);
}

// ── Update Performance Ledger ───────────────────────────────────────────
try {
  execSync(`node "${ROOT}\\tools\\performance_ledger.cjs"`, { stdio: "ignore", timeout: 10000 });
  console.error("Performance Ledger updated with backtest data");
} catch(e) {}

// ── Generate distillation report ────────────────────────────────────────
const distillDir = path.join(ROOT, "shared", "backtest", "meta");
fs.mkdirSync(distillDir, { recursive: true });

const reportMd = `# Backtest Distillation — ${PAIR}
## Period analyzed: ${journals[0]?.date || '?'} to ${journals[journals.length-1]?.date || '?'}
## Journals found: ${journals.length}

## Statistics
- Signal days: ${signalDays.length}/${journals.length} (${Math.round(signalRate * 100)}%)
- Bias: Bearish ${biases.bearish} | Bullish ${biases.bullish} | Neutral ${biases.neutral}

## Playbook Candidates
${candidates.map((c, i) => `${i + 1}. ${c}`).join("\n")}

## Signal Days Detail
${signalDays.map(d => `- ${d.date}: ${d.bias.toUpperCase()}`).join("\n")}

---
*Run /playbook to review current Playbook. These candidates are proposed updates.*
`;

fs.writeFileSync(path.join(distillDir, `${PAIR}_distillation.md`), reportMd, "utf8");

console.log(JSON.stringify({
  distilled: true,
  journals: journals.length,
  signalDays: signalDays.length,
  signalRate: Math.round(signalRate * 100) + "%",
  biasDistribution: biases,
  candidates: candidates.length,
  report: path.join(distillDir, `${PAIR}_distillation.md`),
}, null, 2));
