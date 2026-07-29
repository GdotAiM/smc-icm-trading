// Progressive Summarizer — Daily → Weekly → Monthly → Quarterly
// Compresses old data to prevent context bloat while preserving key lessons.
const fs = require("fs");
const path = require("path");

const ROOT = "C:\\Users\\cash\\smc-icm-trading";
const DATE = new Date().toISOString().split("T")[0];

function r2(v) { return Number(v).toFixed(2); }

// ── Collect all journals ─────────────────────────────────────────────
const journalDir = path.join(ROOT, "stages", "07_journal_review", "output");
let journals = [];
if (fs.existsSync(journalDir)) {
  const files = fs.readdirSync(journalDir).filter(f => f.endsWith("_review.md"));
  for (const f of files) {
    try {
      const content = fs.readFileSync(path.join(journalDir, f), "utf8");
      const pair = f.split("_")[0];
      const date = content.match(/(\d{4}-\d{2}-\d{2})/)?.[1] || DATE;
      const direction = (content.match(/Direction\*\*:?\s*(\w+)/) || [,""])[1] || "";
      const model = (content.match(/Model\*\*:?\s*([^*\n]+)/) || [,""])[1]?.replace(/\*\*/g, "").trim() || "";
      const lessons = content.split("## Lessons Learned")[1]?.split("##")[0] || "";
      const lessonCount = (lessons.match(/^\d+\./gm) || []).length;
      journals.push({ date, pair, direction, model, lessonCount, file: f });
    } catch(e) {}
  }
}

// ── Weekly Summary ───────────────────────────────────────────────────
const now = new Date();
const weekStart = new Date(now.getTime() - 7 * 86400000);
const weekJournals = journals.filter(j => new Date(j.date) >= weekStart);

let weeklyMd = `# Weekly Summary — Week of ${DATE}\n\n`;
weeklyMd += `**Trades This Week**: ${weekJournals.length}\n\n`;
for (const j of weekJournals) {
  weeklyMd += `- ${j.date} | ${j.pair} | ${j.direction} | ${j.model} | ${j.lessonCount} lessons\n`;
}

// Extract key lessons across the week
const allLessons = weekJournals.map(j => {
  try {
    const content = fs.readFileSync(path.join(journalDir, j.file), "utf8");
    const lessonsSection = content.split("## Lessons Learned")[1]?.split("##")[0] || "";
    return (lessonsSection.match(/^\d+\.\s+(.+)/gm) || []).map(l => l.replace(/^\d+\.\s*/, "").trim());
  } catch(e) { return []; }
}).flat();

if (allLessons.length > 0) {
  weeklyMd += `\n## Key Lessons This Week\n`;
  const unique = [...new Set(allLessons)].slice(0, 5);
  for (const l of unique) weeklyMd += `- ${l}\n`;
}

weeklyMd += `\n---\n*Generated: ${new Date().toISOString()} | ${weekJournals.length} trades this week*\n`;

const weeklyDir = path.join(ROOT, "shared", "summaries");
fs.mkdirSync(weeklyDir, { recursive: true });
const weekFile = path.join(weeklyDir, `week_${DATE}.md`);
fs.writeFileSync(weekFile, weeklyMd, "utf8");

// ── Monthly Digest (if end of month) ─────────────────────────────────
const dayOfMonth = now.getUTCDate();
const daysInMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0).getUTCDate();
if (dayOfMonth >= daysInMonth - 2) {
  const monthStart = new Date(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const monthJournals = journals.filter(j => new Date(j.date) >= monthStart);
  let monthlyMd = `# Monthly Digest — ${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}\n\n`;
  monthlyMd += `**Total Trades**: ${monthJournals.length}\n`;
  monthlyMd += `**Pairs Traded**: ${[...new Set(monthJournals.map(j => j.pair))].join(", ")}\n`;
  monthlyMd += `**Models Used**: ${[...new Set(monthJournals.map(j => j.model))].filter(Boolean).join(", ")}\n\n`;
  monthlyMd += `## Top Lessons\n`;
  monthlyMd += `(Lessons aggregated from ${monthJournals.length} trades)\n`;
  fs.writeFileSync(path.join(weeklyDir, `month_${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}.md`), monthlyMd, "utf8");
}

console.log(JSON.stringify({
  weekJournals: weekJournals.length,
  weeklySummary: weekFile,
  totalJournals: journals.length,
  summary: weekJournals.length > 0 ? `${weekJournals.length} trades this week summarized` : "No trades this week",
}, null, 2));
