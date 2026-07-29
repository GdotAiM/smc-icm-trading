// Lesson Extractor — Auto-extracts lessons from Stage 07 journals
// Compares against Playbook, proposes updates, tracks recurring mistakes.
const fs = require("fs");
const path = require("path");

const ROOT = "C:\\Users\\cash\\smc-icm-trading";
const DATE = new Date().toISOString().split("T")[0];

const PAIR = process.argv[2] || "GBPUSD";

// ── Read latest journal ──────────────────────────────────────────────
const journalDir = path.join(ROOT, "stages", "07_journal_review", "output");
const journalFile = path.join(journalDir, `${PAIR.toLowerCase()}_review.md`);

if (!fs.existsSync(journalFile)) {
  console.log(JSON.stringify({ error: "No journal found", lessons: 0 }));
  process.exit(0);
}

const journal = fs.readFileSync(journalFile, "utf8");

// ── Extract structured data ──────────────────────────────────────────
const extract = (pattern, text) => (text.match(pattern) || [,""])[1]?.trim() || "";

const tradeInfo = {
  date: DATE,
  pair: PAIR,
  direction: extract(/Direction\*\*:?\s*(\w+)/, journal),
  model: extract(/Model\*\*:?\s*([^*\n]+)/, journal).replace(/\*\*/g, "").trim(),
  session: extract(/Session\*\*:?\s*([^*\n]+)/, journal).replace(/Killzone.*/, "").trim() || "Unknown",
  bias1w: extract(/1W\s+(\w+)/, journal),
  bias1d: extract(/1D\s+(\w+)/, journal),
  coherence: extract(/\*\*(\d+\.?\d*)\/5\*\*/, journal) || extract(/Overall.*?\*\*(\d+\.?\d*)\/5/, journal) || "N/A",
};

// ── Extract lessons ──────────────────────────────────────────────────
const lessonsSection = journal.split("## Lessons Learned")[1]?.split("##")[0] || "";
const lessonLines = lessonsSection.match(/[-*]\s*\d+\.\s*(.+)/g) || [];
const lessons = lessonLines.map(l => l.replace(/^[-*\s\d.]+/, "").trim()).filter(l => l.length > 10);

// ── Extract improvement actions ──────────────────────────────────────
const actionsSection = journal.split("## Improvement Actions")[1]?.split("##")[0] || "";
const actionLines = actionsSection.match(/- \[ \]\s*(.+)/g) || [];
const actions = actionLines.map(a => a.replace(/- \[ \]\s*/, "").trim());

// ── Check against existing Playbook ──────────────────────────────────
const playbookFile = path.join(ROOT, "references", "playbook", "current.md");
let playbookMistakes = [];
if (fs.existsSync(playbookFile)) {
  const playbook = fs.readFileSync(playbookFile, "utf8");
  const mistakeSection = playbook.split("## Recurring Mistakes")[1]?.split("##")[0] || "";
  playbookMistakes = (mistakeSection.match(/\| (.+) \| (\d+) \| (.+) \|/g) || [])
    .map(m => {
      const parts = m.split("|").map(p => p.trim()).filter(Boolean);
      return { mistake: parts[0], count: parseInt(parts[1]) || 0, counter: parts[2] };
    });
}

// ── Match new lessons against known mistakes ─────────────────────────
const proposals = [];
for (const lesson of lessons) {
  const match = playbookMistakes.find(m => lesson.toLowerCase().includes(m.mistake.toLowerCase().slice(0, 15)));
  if (match) {
    proposals.push({ type: "reinforce", existing: match.mistake, newCount: match.count + 1, lesson });
  } else {
    proposals.push({ type: "new", lesson, suggestion: `Add to Playbook as new recurring mistake: "${lesson}"` });
  }
}

// ── Build YAML metadata for journal ──────────────────────────────────
const yamlMeta = {
  date: DATE,
  pair: PAIR,
  direction: tradeInfo.direction,
  model: tradeInfo.model,
  session: tradeInfo.session,
  coherence: tradeInfo.coherence,
  lessons: lessons.length,
  actions: actions.length,
  proposals: proposals.filter(p => p.type === "new").length,
};

// ── Output ────────────────────────────────────────────────────────────
const outDir = path.join(journalDir);
const metaFile = path.join(outDir, `${PAIR.toLowerCase()}_meta.json`);
fs.writeFileSync(metaFile, JSON.stringify(yamlMeta, null, 2), "utf8");

const lessonsMd = `# Extracted Lessons — ${PAIR} — ${DATE}

## Trade Summary
- Direction: ${tradeInfo.direction} | Model: ${tradeInfo.model} | Session: ${tradeInfo.session}
- 1W: ${tradeInfo.bias1w} | 1D: ${tradeInfo.bias1d} | Coherence: ${tradeInfo.coherence}/5

## Lessons Identified
${lessons.map((l, i) => `${i + 1}. ${l}`).join("\n") || "No explicit lessons found."}

## Proposed Playbook Updates
${proposals.map(p => p.type === "reinforce"
  ? `- **REINFORCE**: "${p.existing}" — now ${p.newCount} occurrences. Keep the counter: "${p.counter}"`
  : `- **NEW**: "${p.lesson}" → ${p.suggestion}`
).join("\n") || "No Playbook updates needed."}

## Pending Actions
${actions.map((a, i) => `${i + 1}. ${a}`).join("\n") || "No pending actions."}

---
*Review and approve Playbook updates. Run /playbook to see current state.*
`;

fs.writeFileSync(path.join(outDir, `${PAIR.toLowerCase()}_lessons.md`), lessonsMd, "utf8");

console.log(JSON.stringify({
  pair: PAIR,
  lessons: lessons.length,
  actions: actions.length,
  newProposals: proposals.filter(p => p.type === "new").length,
  reinforcedProposals: proposals.filter(p => p.type === "reinforce").length,
  playbookUpdate: proposals.length > 0 ? "Review proposals in lessons output" : "No updates needed",
  yamlMeta,
}, null, 2));
