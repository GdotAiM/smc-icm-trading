// Decision Logger — append structured decisions in real-time
// Usage: node tools/tv-mcp/decision_log.cjs "EVENT" "Detail" "Reasoning"
const fs = require("fs");
const path = require("path");

const ROOT = "C:/Users/cash/smc-icm-trading";
const DATE = require("../ny_time.cjs").getNYDate();
const LOG_PATH = path.join(ROOT, "shared", DATE, "decision_journal.md");

const event = process.argv[2] || "LOG";
const detail = process.argv[3] || "";
const reasoning = process.argv[4] || "";

const ts = new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false });
const entry = `| ${ts} NY | ${event} | ${detail} | ${reasoning} |\n`;

// Initialize file with header if new
if (!fs.existsSync(LOG_PATH)) {
  fs.writeFileSync(LOG_PATH,
    `# Live Decision Journal — ${DATE}\n\n` +
    `London Killzone Session (02:00-05:00 NY)\n\n` +
    `| Time (NY) | Event | Detail | Reasoning |\n` +
    `|-----------|-------|--------|----------|\n`
  );
}

fs.appendFileSync(LOG_PATH, entry);
console.log(`Logged: [${ts} NY] ${event} — ${detail}`);
