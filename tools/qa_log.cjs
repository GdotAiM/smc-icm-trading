// Lightweight Q&A log — structured, searchable, token-efficient
// Usage: node tools/qa_log.cjs "Q: question" "A: answer" "Decision/Action"
const fs = require("fs");
const path = require("path");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..");
const DATE = require("./ny_time.cjs").getNYDate();
const LOG = path.join(ROOT, "shared", DATE, "qa_log.md");

const question = process.argv[2] || "";
const answer = process.argv[3] || "";
const action = process.argv[4] || "";

const ts = new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false });

// Initialize with header if new
if (!fs.existsSync(LOG)) {
  fs.writeFileSync(LOG, `# Q&A Log — ${DATE}\n\n| Time | Topic | Q | A | Action |\n|------|-------|---|---|--------|\n`);
}

// Truncate long entries for token efficiency
const q = question.length > 150 ? question.substring(0, 147) + "..." : question;
const a = answer.length > 200 ? answer.substring(0, 197) + "..." : answer;
const act = action.length > 100 ? action.substring(0, 97) + "..." : action;

fs.appendFileSync(LOG, `| ${ts} | ${q.split(" ").slice(0, 3).join(" ")}... | ${q} | ${a} | ${act} |\n`);
console.log(`Logged: [${ts}] ${q.substring(0, 50)}`);
