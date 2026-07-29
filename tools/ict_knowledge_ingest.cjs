// ICT Knowledge Centre — Phase 1: Ingestion & Indexing Pipeline
// Parses all 139 markdown files, builds taxonomy, dependency graph, master index

const fs = require("fs");
const path = require("path");

const ICT_ROOT = "C:\\Users\\cash\\Desktop\\ICT Knowledge Centre";
const OUTPUT_DIR = path.join(__dirname, "..", "references", "ict_knowledge");
fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.mkdirSync(path.join(OUTPUT_DIR, "curriculum"), { recursive: true });

// ── YAML Frontmatter Parser ──────────────────────────────────
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { raw: {}, body: content };
  const raw = {};
  const lines = match[1].split("\n");
  let currentKey = null;
  for (const line of lines) {
    const keyVal = line.match(/^(\w[\w\s]*?):\s*(.*)/);
    if (keyVal) {
      currentKey = keyVal[1].trim();
      let val = keyVal[2].trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      if (val.startsWith("[") && !val.endsWith("]")) {
        raw[currentKey] = [];
        if (val !== "[") raw[currentKey].push(val.replace(/^\["?\s*"?/, "").replace(/"$/, ""));
      } else if (val.startsWith("[") && val.endsWith("]")) {
        raw[currentKey] = val.slice(1, -1).split(",").map(s => s.trim().replace(/"/g, ""));
      } else if (val === "|") {
        raw[currentKey] = "";
      } else {
        raw[currentKey] = val;
      }
    } else if (currentKey && line.trim().startsWith("-")) {
      const item = line.trim().replace(/^-\s*"?/, "").replace(/"$/, "");
      if (!Array.isArray(raw[currentKey])) raw[currentKey] = [];
      if (item) raw[currentKey].push(item);
    }
  }
  const body = content.slice((match[0] || "").length).trim();
  return { raw, body };
}

// ── Tier Classification Rules ──────────────────────────────────
const TIER_RULES = [
  { tier: 0, keywords: ["market structure", "bos", "choch", "mss", "swing high", "swing low",
    "liquidity pool", "liquidity sweep", "bsl", "ssl", "internal liquidity", "external liquidity",
    "pd array", "premium", "discount", "kill zone", "killzone", "session time",
    "foundations", "faq", "beginner", "abbreviations", "glossary"] },
  { tier: 1, keywords: ["order block", "mitigation block", "breaker block", "rejection block",
    "propulsion block", "suspension block", "reclaimed order block",
    "fair value gap", "fvg", "inversion fvg", "ifvg", "displacement",
    "power of 3", "power of three", "po3", "amd", "accumulation manipulation",
    "smt divergence", "smart money technique", "consequent encroachment",
    "candle range theory", "crt", "balanced price range", "bpr"] },
  { tier: 2, keywords: ["silver bullet", "2022 model", "mmxm", "market maker buy", "market maker sell",
    "judas swing", "turtle soup", "ote", "optimal trade entry",
    "unicorn", "scob", "2fvg", "bread and butter",
    "one shot one kill", "institutional order flow entry",
    "tgif", "seek and destroy", "reaper", "enigma",
    "macro time", "intraday trading strategy", "top down analysis"] },
  { tier: 3, keywords: ["intraday profile", "daily profile", "cbdr", "central bank dealers range",
    "asian range", "ndog", "nwog", "new day opening", "new week opening",
    "cisd", "mss", "hrlr", "lrlr", "stl", "itl", "ltl",
    "ipda", "interbank price delivery", "daily bias", "consolidation",
    "fibonacci", "elliot wave", "rsi divergence"] },
  { tier: 4, keywords: ["2024 mentorship", "lecture", "mentorship 2024",
    "tools", "market hours", "forex market hours",
    "ebook", "pdf", "about", "contact", "privacy", "disclaimer",
    "affiliate", "editorial", "review", "crypto trading strategies 2026",
    "forex trading quotes", "hidden infrastructure"] },
];

function classifyTier(filename, title, body, tags, categories) {
  const searchText = `${filename} ${title} ${(tags||[]).join(" ")} ${(categories||[]).join(" ")} ${body.slice(0, 300)}`.toLowerCase();
  for (const rule of TIER_RULES) {
    for (const kw of rule.keywords) {
      if (searchText.includes(kw.toLowerCase())) return rule.tier;
    }
  }
  return 2; // default to strategies tier
}

// ── Cross-Reference Detection ─────────────────────────────────
const CONCEPT_ALIASES = {
  "silver bullet": "silver-bullet",
  "market structure": "market-structure",
  "order block": "order-block",
  "fair value gap": "fair-value-gap",
  "fvg": "fair-value-gap",
  "liquidity": "liquidity",
  "power of 3": "power-of-3",
  "power of three": "power-of-3",
  "po3": "power-of-3",
  "mmxm": "2022-model",
  "2022 model": "2022-model",
  "judas swing": "judas-swing",
  "turtle soup": "turtle-soup",
  "smt": "smt-divergence",
  "bos": "break-of-structure",
  "choch": "change-of-character",
  "mss": "market-structure-shift",
  "ipda": "ipda",
  "intraday profile": "intraday-profiles",
  "cbdr": "central-bank-dealers-range",
  "ndog": "new-day-opening-gap",
  "nwog": "new-week-opening-gap",
  "ote": "optimal-trade-entry",
  "kill zone": "kill-zones",
  "asian range": "asian-range",
};

function extractCrossReferences(body, allConcepts) {
  const refs = new Set();
  const lowerBody = body.toLowerCase();
  for (const [alias, conceptId] of Object.entries(CONCEPT_ALIASES)) {
    if (lowerBody.includes(alias)) {
      refs.add(conceptId);
    }
  }
  // Also check for markdown links to other tutorials
  const mdLinks = body.matchAll(/\[([^\]]+)\]\([^)]*tutorials\/([^)/]+)/gi);
  for (const link of mdLinks) {
    const slug = link[2].replace(/^ict-/, "").replace(/-trading-strategy$/, "").replace(/-explained$/, "").replace(/-complete-guide$/, "");
    refs.add(slug);
  }
  return [...refs];
}

// ── Concept ID Generation ─────────────────────────────────────
function conceptId(filename) {
  return filename
    .replace(/\.md$/, "")
    .replace(/^ict-/, "")
    .replace(/-trading-strategy$/, "")
    .replace(/-explained$/, "")
    .replace(/-complete-guide$/, "")
    .replace(/-trading$/, "")
    .replace(/-strategy$/, "")
    .replace(/-in-trading$/, "")
    .replace(/^forex-/, "")
    .replace(/^master-/, "")
    .replace(/^complete-/, "")
    .replace(/^how-to-/, "");
}

// ── Tier Names ─────────────────────────────────────────────────
const TIER_NAMES = {
  0: "Foundations",
  1: "Core Mechanics",
  2: "Strategies",
  3: "Advanced Concepts",
  4: "Meta / Reference",
};

// ═══════════════ MAIN INGESTION ════════════════════════════════
console.log("╔═══════════════════════════════════════════╗");
console.log("║  ICT Knowledge Centre — Phase 1 Ingest   ║");
console.log("╚═══════════════════════════════════════════╝\n");

// Walk all directories
const allFiles = [];
function walkDir(dir, category) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory()) {
      walkDir(path.join(dir, e.name), e.name);
    } else if (e.name.endsWith(".md")) {
      allFiles.push({ filepath: path.join(dir, e.name), category: category || path.basename(dir) });
    }
  }
}
for (const d of fs.readdirSync(ICT_ROOT, { withFileTypes: true })) {
  if (d.isDirectory()) walkDir(path.join(ICT_ROOT, d.name), d.name);
}

console.log(`Found ${allFiles.length} markdown files across ${new Set(allFiles.map(f => f.category)).size} categories\n`);

// Parse all files
const concepts = {};
const byTier = { 0: [], 1: [], 2: [], 3: [], 4: [] };
let totalWords = 0;

for (const f of allFiles) {
  const content = fs.readFileSync(f.filepath, "utf8");
  const { raw, body } = parseFrontmatter(content);
  const id = conceptId(path.basename(f.filepath));
  const tier = classifyTier(path.basename(f.filepath), raw.title || "", body, raw.tags, raw.categories);
  const wordCount = body.split(/\s+/).length;
  totalWords += wordCount;

  concepts[id] = {
    id,
    title: raw.title || path.basename(f.filepath, ".md"),
    source: raw.source || "",
    type: raw.type || "tutorial",
    category: f.category,
    file: path.relative(ICT_ROOT, f.filepath),
    tier,
    tierName: TIER_NAMES[tier],
    date: raw.date || "",
    modified: raw.modified || "",
    tags: raw.tags || [],
    excerpt: raw.excerpt || body.slice(0, 200).replace(/\n/g, " "),
    wordCount,
    bodyPreview: body.slice(0, 500),
    // Key rules extraction (look for numbered lists, bullet points with bold)
    keySections: extractKeySections(body),
  };

  byTier[tier].push(id);
}

// Cross-reference pass (after all concepts loaded)
for (const [id, concept] of Object.entries(concepts)) {
  const content = fs.readFileSync(path.join(ICT_ROOT, concept.file), "utf8");
  const { body } = parseFrontmatter(content);
  concept.crossRefs = extractCrossReferences(body, concepts);
  concept.prerequisites = concept.crossRefs.filter(ref => {
    const c = concepts[ref];
    return c && c.tier < concept.tier;
  });
  concept.extendsConcepts = concept.crossRefs.filter(ref => {
    const c = concepts[ref];
    return c && c.tier <= concept.tier;
  });
}

// ── Dependency Graph (who depends on who) ─────────────────────
const dependencyGraph = {};
for (const [id, concept] of Object.entries(concepts)) {
  dependencyGraph[id] = {
    dependsOn: concept.prerequisites,
    dependedOnBy: [],
    sameTierRefs: concept.extendsConcepts.filter(r => concepts[r] && concepts[r].tier === concept.tier),
  };
}
// Reverse pass
for (const [id, deps] of Object.entries(dependencyGraph)) {
  for (const dep of deps.dependsOn) {
    if (dependencyGraph[dep]) {
      dependencyGraph[dep].dependedOnBy.push(id);
    }
  }
}

// ── Extract key sections (rules, steps, checklists) ───────────
function extractKeySections(body) {
  const sections = [];
  const lines = body.split("\n");
  let inList = false;
  let currentList = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Headers with key words
    if (/^#{2,4}\s+(how|what|when|why|rule|step|checklist|entry|setup|trigger|mistake|example)/i.test(trimmed)) {
      sections.push({ type: "heading", text: trimmed.replace(/^#+\s*/, "") });
    }
    // Numbered steps
    if (/^\d+\.\s+\*\*/.test(trimmed)) {
      sections.push({ type: "rule", text: trimmed.replace(/^\d+\.\s*\*\*/, "").replace(/\*\*.*/, "").trim() });
    }
    // Bold key points
    const boldMatch = trimmed.match(/\*\*(.{10,100}?)\*\*/);
    if (boldMatch && !trimmed.startsWith("#")) {
      sections.push({ type: "keypoint", text: boldMatch[1] });
    }
  }
  return sections.slice(0, 15); // cap at 15 key points
}

// ── Build Curriculum ───────────────────────────────────────────
const curriculum = [];
for (let t = 0; t <= 4; t++) {
  const tierConcepts = byTier[t].map(id => concepts[id]);
  // Sort by: foundational concepts first, then alphabetical
  tierConcepts.sort((a, b) => {
    const aIsCore = a.tags.some(t => /foundation|beginner|core/i.test(t));
    const bIsCore = b.tags.some(t => /foundation|beginner|core/i.test(t));
    if (aIsCore && !bIsCore) return -1;
    if (!aIsCore && bIsCore) return 1;
    return a.title.localeCompare(b.title);
  });

  curriculum.push({
    tier: t,
    name: TIER_NAMES[t],
    conceptCount: tierConcepts.length,
    concepts: tierConcepts.map(c => ({
      id: c.id,
      title: c.title,
      file: c.file,
      wordCount: c.wordCount,
      prerequisites: c.prerequisites,
      keyRules: c.keySections.filter(s => s.type === "rule").map(s => s.text),
    })),
    estimatedStudyTime: Math.ceil(tierConcepts.reduce((sum, c) => sum + c.wordCount, 0) / 200), // ~200 wpm reading
  });
}

// ── Write Outputs ──────────────────────────────────────────────

// 1. Master Index
const index = {
  generated: new Date().toISOString(),
  source: ICT_ROOT,
  totalFiles: allFiles.length,
  totalConcepts: Object.keys(concepts).length,
  totalWords,
  tiers: {
    0: { name: "Foundations", count: byTier[0].length, concepts: byTier[0] },
    1: { name: "Core Mechanics", count: byTier[1].length, concepts: byTier[1] },
    2: { name: "Strategies", count: byTier[2].length, concepts: byTier[2] },
    3: { name: "Advanced Concepts", count: byTier[3].length, concepts: byTier[3] },
    4: { name: "Meta / Reference", count: byTier[4].length, concepts: byTier[4] },
  },
};

fs.writeFileSync(path.join(OUTPUT_DIR, "index.json"), JSON.stringify(index, null, 2));
console.log(`✓ index.json — ${Object.keys(concepts).length} concepts indexed`);

// 2. Taxonomy (full concept details)
fs.writeFileSync(path.join(OUTPUT_DIR, "taxonomy.json"), JSON.stringify(concepts, null, 2));
console.log(`✓ taxonomy.json — full concept details`);

// 3. Dependency Graph
fs.writeFileSync(path.join(OUTPUT_DIR, "dependencies.json"), JSON.stringify(dependencyGraph, null, 2));
console.log(`✓ dependencies.json — cross-reference graph`);

// 4. Curriculum (per tier, ordered)
fs.writeFileSync(path.join(OUTPUT_DIR, "curriculum.json"), JSON.stringify(curriculum, null, 2));
console.log(`✓ curriculum.json — progressive learning path`);

// 5. Curriculum markdown files (human-readable)
for (const tier of curriculum) {
  const md = `# ICT Curriculum — Tier ${tier.tier}: ${tier.name}

**Concepts**: ${tier.conceptCount} | **Est. Study Time**: ~${tier.estimatedStudyTime} minutes

## Concept List

${tier.concepts.map((c, i) => `
### ${i + 1}. ${c.title}
- **ID**: \`${c.id}\`
- **File**: \`${c.file}\`
- **Prerequisites**: ${c.prerequisites.length > 0 ? c.prerequisites.map(p => `\`${p}\``).join(", ") : "None — start here"}
- **Words**: ${c.wordCount}

${c.keyRules.length > 0 ? `**Key Rules:**\n${c.keyRules.map(r => `- ${r}`).join("\n")}` : ""}
`).join("\n")}

---
*Generated: ${new Date().toISOString()}*
`;
  const tierNum = tier.tier.toString().padStart(2, "0");
  const safeName = tier.name.toLowerCase().replace(/[\/\\]/g, "-").replace(/\s+/g, "-");
  fs.writeFileSync(path.join(OUTPUT_DIR, "curriculum", `tier-${tierNum}-${safeName}.md`), md);
}
console.log(`✓ curriculum/*.md — 5 tier study guides`);

// 6. Concept graph stats
const mostReferenced = Object.entries(dependencyGraph)
  .sort((a, b) => b[1].dependedOnBy.length - a[1].dependedOnBy.length)
  .slice(0, 10);

console.log(`\n╔═══════════════════════════════════════════╗`);
console.log(`║  INGESTION COMPLETE                       ║`);
console.log(`╚═══════════════════════════════════════════╝`);
console.log(`\nTier Distribution:`);
for (let t = 0; t <= 4; t++) {
  console.log(`  Tier ${t} — ${TIER_NAMES[t]}: ${byTier[t].length} concepts`);
}
console.log(`\nMost Referenced Concepts (by dependents):`);
for (const [id, deps] of mostReferenced) {
  console.log(`  ${id}: ${deps.dependedOnBy.length} concepts depend on this (${concepts[id]?.title || "?"})`);
}
console.log(`\nOutput: ${OUTPUT_DIR}`);
console.log(`  index.json          — master concept index`);
console.log(`  taxonomy.json       — full concept details`);
console.log(`  dependencies.json   — cross-reference graph`);
console.log(`  curriculum.json     — progressive learning path`);
console.log(`  curriculum/tier-*.md — human-readable study guides`);
