// bias_tracker.cjs - Track bias accuracy across sessions
const fs = require("fs");
const path = require("path");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..");
const LOG_DIR = path.join(ROOT, "shared", "bias_accuracy");
const LOG_FILE = path.join(LOG_DIR, "bias_log.jsonl");

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function getNYTime(dateOverride) {
  let nyDate;
  if (dateOverride) {
    // Treat the override as an NY date string (YYYY-MM-DD), not UTC
    // Parse as local NY time to avoid UTC shift issues
    const parts = dateOverride.split("-");
    nyDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    // Set to noon NY to avoid any DST edge cases
    nyDate.setHours(12, 0, 0, 0);
  } else {
    const now = new Date();
    const nyOffset = -4;
    const nyMs = now.getTime() + nyOffset * 3600 * 1000;
    nyDate = new Date(nyMs);
  }
  return {
    date: nyDate.toISOString().split("T")[0],
    hour: nyDate.getHours(),
    ts: nyDate.toISOString().replace("Z", "-04:00").slice(0, 19)
  };
}

function logBias(pair, bias, opts) {
  opts = opts || {};
  const P = String(pair || "").toUpperCase();
  const ny = getNYTime(opts.date);
  const entry = {
    ts: ny.ts,
    nyDate: ny.date,
    nyHour: ny.hour,
    pair: P,
    bias: bias.toUpperCase(),
    timeframe: opts.tf || "1h",
    source: opts.source || "manual",
    note: opts.note || "",
    locked: opts.locked || false
  };
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n", "utf8");
  console.log("Logged: " + P + " " + bias + " (" + (opts.tf || "1h") + ") @" + ny.hour + ":00 NY");
  return entry;
}

function resolveActualDirection(pair, date) {
  const P = String(pair || "").toUpperCase();
  const sharedDir = path.join(ROOT, "shared", date, P);
  try {
    const eng1h = JSON.parse(fs.readFileSync(path.join(sharedDir, "engine_1h.json"), "utf8"));
    const priceNow = eng1h.price;
    const candles = JSON.parse(fs.readFileSync(path.join(sharedDir, "candles_1d.json"), "utf8"));
    const candleList = Array.isArray(candles) ? candles : (candles.candles || []);
    const morningPrice = candleList[0] ? candleList[0].open : priceNow;
    const delta = priceNow - morningPrice;
    if (Math.abs(delta) < 0.0001 * morningPrice) return "NEUTRAL";
    return delta > 0 ? "BULLISH" : "BEARISH";
  } catch (_) { return "UNKNOWN"; }
}

function generateReport(date) {
  if (!fs.existsSync(LOG_FILE)) { console.log("No bias log found."); return; }
  const lines = fs.readFileSync(LOG_FILE, "utf8").split("\n").filter(Boolean);
  const entries = lines.map(l => JSON.parse(l));
  const filtered = entries.filter(e => e.nyDate === date);
  if (filtered.length === 0) { console.log("No bias calls for " + date); return; }

  const pairs = [...new Set(filtered.map(e => e.pair))];
  const results = {};
  let totalCorrect = 0, totalWrong = 0, totalMixed = 0;

  for (const pair of pairs) {
    const actual = resolveActualDirection(pair, date);
    const pairEntries = filtered.filter(e => e.pair === pair);
    let correct = 0, wrong = 0, mixed = 0;
    const details = [];
    for (const e of pairEntries) {
      let result = "CORRECT";
      if (e.bias === actual) correct++;
      else if (actual === "NEUTRAL" || actual === "UNKNOWN") { mixed++; result = "MIXED"; }
      else { wrong++; result = "WRONG"; }
      details.push({ time: e.ts, bias: e.bias, actual: actual, result: result, note: e.note });
    }
    const total = pairEntries.length;
    results[pair] = {
      correct: correct,
      wrong: wrong,
      mixed: mixed,
      total: total,
      accuracy: total > 0 ? ((correct/total)*100).toFixed(1) : "0.0",
      details: details
    };
    totalCorrect += correct;
    totalWrong += wrong;
    totalMixed += mixed;
  }

  const totalCalls = totalCorrect + totalWrong + totalMixed;
  const overallAccuracy = totalCalls > 0 ? ((totalCorrect/totalCalls)*100).toFixed(1) : "0.0";

  console.log("");
  console.log("=== BIAS ACCURACY REPORT -- " + date + " ===");
  console.log("");
  console.log("Overall: " + totalCorrect + "/" + totalCalls + " CORRECT = " + overallAccuracy + "%");
  console.log("         " + totalWrong + " WRONG, " + totalMixed + " MIXED/NEUTRAL");
  console.log("");
  console.log("Per-Pair:");
  for (const p of pairs.sort()) {
    const r = results[p];
    console.log("  " + p + ": " + r.correct + "/" + r.total + " = " + r.accuracy + "%");
  }

  const reportPath = path.join(LOG_DIR, date + "_report.md");
  let md = "# Bias Accuracy Report -- " + date + "\n\n";
  md += "**Overall: " + totalCorrect + "/" + totalCalls + " CORRECT = " + overallAccuracy + "%**\n\n";
  md += "| Pair | Correct | Total | Accuracy | Wrong | Mixed |\n";
  md += "|------|---------|-------|----------|-------|-------|\n";
  for (const p of pairs.sort()) {
    const r = results[p];
    md += "| " + p + " | " + r.correct + " | " + r.total + " | " + r.accuracy + "% | " + r.wrong + " | " + r.mixed + " |\n";
  }
  md += "\n## Details\n\n";
  for (const p of pairs.sort()) {
    const r = results[p];
    md += "### " + p + " (" + r.accuracy + "%)\n\n";
    md += "| Time | Bias Called | Actual | Result | Note |\n";
    md += "|------|-------------|--------|--------|------|\n";
    for (const d of r.details) {
      const timeStr = d.time.split("T")[1] ? d.time.split("T")[1].slice(0,5) : d.time;
      md += "| " + timeStr + " | " + d.bias + " | " + d.actual + " | " + d.result + " | " + d.note + " |\n";
    }
    md += "\n";
  }
  md += "---\n*Generated: " + new Date().toISOString() + "*\n";
  fs.writeFileSync(reportPath, md, "utf8");
  console.log("");
  console.log("Report saved: " + reportPath);
  return { overallAccuracy: overallAccuracy, results: results, totalCalls: totalCalls };
}

const args = process.argv.slice(2);
const cmd = args[0];
if (cmd === "log") {
  const opts = { tf: "1h", note: "", date: null };
  for (let i = 3; i < args.length; i++) {
    if (args[i] === "--tf" && args[i+1]) { opts.tf = args[++i]; }
    else if (args[i] === "--note" && args[i+1]) { opts.note = args[++i]; }
    else if (args[i] === "--locked") { opts.locked = true; }
    else if (args[i] === "--date" && args[i+1]) { opts.date = args[++i]; }
  }
  logBias(args[1], args[2], opts);
} else if (cmd === "report") {
  const dateArg = args.find(a => a === "--date") ? args[args.indexOf("--date")+1] : null;
  generateReport(dateArg || new Date().toISOString().split("T")[0]);
} else {
  console.log("Usage:");
  console.log("  node tools/bias_tracker.cjs log <PAIR> <BIAS> [--tf <tf>] [--note <txt>] [--locked]");
  console.log("  node tools/bias_tracker.cjs report [--date YYYY-MM-DD]");
}
