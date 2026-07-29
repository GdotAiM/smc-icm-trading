// Playbook Updater — Reads extracted lessons and proposes Playbook updates.
// Integrates with lesson_extractor.cjs output.
const fs = require("fs");
const path = require("path");

const ROOT = "C:\\Users\\cash\\smc-icm-trading";
const DATE = new Date().toISOString().split("T")[0];
const PAIR = process.argv[2] || "GBPUSD";

// ── Read lessons ─────────────────────────────────────────────────────
const lessonsFile = path.join(ROOT, "stages", "07_journal_review", "output", `${PAIR.toLowerCase()}_lessons.md`);
if (!fs.existsSync(lessonsFile)) {
  console.log(JSON.stringify({ updated: false, reason: "No lessons file" }));
  process.exit(0);
}

const lessonsMd = fs.readFileSync(lessonsFile, "utf8");
const proposals = (lessonsMd.match(/^- \*\*(?:REINFORCE|NEW)\*\*: "(.+)"/gm) || []).map(p => p.replace(/^- \*\*(?:REINFORCE|NEW)\*\*: /, "").replace(/"/g, ""));

// ── Update Playbook ──────────────────────────────────────────────────
const playbookFile = path.join(ROOT, "references", "playbook", "current.md");
if (!fs.existsSync(playbookFile)) {
  console.log(JSON.stringify({ updated: false, reason: "No playbook file" }));
  process.exit(0);
}

let playbook = fs.readFileSync(playbookFile, "utf8");

// Update "Last Updated" date
playbook = playbook.replace(/Updated \d{4}-\d{2}-\d{2}/, `Updated ${DATE}`);

// If there are reinforced lessons, increment their counts in the Mistakes table
for (const prop of proposals) {
  if (prop.includes("now")) {
    const match = prop.match(/"(.+)" — now (\d+)/);
    if (match) {
      const mistakeName = match[1];
      const newCount = match[2];
      const regex = new RegExp(`(\\| ${mistakeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\| )(\\d+)( \\|)`, "i");
      if (regex.test(playbook)) {
        playbook = playbook.replace(regex, `$1${newCount}$3`);
      }
    }
  }
}

// Add new lessons to relevant sections
const newProposals = proposals.filter(p => p.includes("Add to Playbook"));
if (newProposals.length > 0) {
  const mistakesSection = playbook.indexOf("## Recurring Mistakes");
  if (mistakesSection > 0) {
    const insertPoint = playbook.indexOf("\n\n", playbook.indexOf("|", mistakesSection + 200)) + 2;
    if (insertPoint > 2) {
      for (const prop of newProposals) {
        const lessonText = prop.replace(/Add to Playbook as new recurring mistake: /, "").replace(/"/g, "");
        const newRow = `| ${lessonText.slice(0, 50)} | 1 | TBD |\n`;
        if (!playbook.includes(lessonText.slice(0, 30))) {
          playbook = playbook.slice(0, insertPoint) + newRow + playbook.slice(insertPoint);
        }
      }
    }
  }
}

fs.writeFileSync(playbookFile, playbook, "utf8");

// ── Create monthly snapshot ───────────────────────────────────────────
const archiveDir = path.join(ROOT, "references", "playbook", "archive");
fs.mkdirSync(archiveDir, { recursive: true });
const snapshotFile = path.join(archiveDir, `playbook_${DATE.slice(0, 7)}.md`);
if (!fs.existsSync(snapshotFile)) {
  fs.writeFileSync(snapshotFile, playbook, "utf8");
}

console.log(JSON.stringify({
  updated: true,
  reinforcedCount: proposals.filter(p => p.includes("now")).length,
  newCount: newProposals.length,
  playbookSnapshot: `archive/playbook_${DATE.slice(0, 7)}.md`,
}, null, 2));
