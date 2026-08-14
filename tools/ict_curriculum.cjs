// ICT Curriculum — Phase 3: Progressive Agent Learning System
// Runs structured sessions, generates quizzes, builds condensed knowledge prompt

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const KB = path.join(ROOT, "references", "ict_knowledge");
const LEARNED = path.join(KB, "learned");
const ICT_ROOT = "C:\\Users\\cash\\Desktop\\ICT Knowledge Centre";

fs.mkdirSync(LEARNED, { recursive: true });

const taxonomy = JSON.parse(fs.readFileSync(path.join(KB, "taxonomy.json"), "utf8"));
const curriculum = JSON.parse(fs.readFileSync(path.join(KB, "curriculum.json"), "utf8"));

// ═══════════════ SESSION RUNNER ═══════════════
function runSession(tierNum) {
  const tier = curriculum.find(t => t.tier === tierNum);
  if (!tier) { console.log(`Tier ${tierNum} not found`); return null; }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  LEARNING SESSION — Tier ${tierNum}: ${tier.name}`);
  console.log(`${"=".repeat(60)}`);
  console.log(`  Concepts: ${tier.conceptCount} | Est. time: ${tier.estimatedStudyTime} min\n`);

  const sessionNotes = [];
  const learnedConcepts = [];

  for (const c of tier.concepts) {
    const concept = taxonomy[c.id];
    if (!concept) continue;

    const filepath = path.join(ICT_ROOT, concept.file);
    if (!fs.existsSync(filepath)) {
      console.log(`  ⚠️  ${c.title} — file not found, skipping`);
      continue;
    }

    const content = fs.readFileSync(filepath, "utf8");
    const frontMatch = content.match(/^---\n[\s\S]*?\n---\n?/);
    const body = frontMatch ? content.slice(frontMatch[0].length) : content;

    // Extract learning summary
    const summary = extractLearningSummary(body, concept);
    learnedConcepts.push({
      id: concept.id,
      title: concept.title,
      tier: concept.tier,
      tierName: concept.tierName,
      summary: summary.oneLiner,
      rules: summary.rules,
      whenToUse: summary.whenToUse,
      whenNotToUse: summary.whenNotToUse,
      relatedConcepts: concept.prerequisites,
      file: concept.file,
      source: concept.source,
    });

    sessionNotes.push(`### ${c.title}\n${summary.oneLiner}\n`);
    console.log(`  ✓ ${c.title}`);
  }

  // Generate session markdown
  const sessionMd = generateSessionMarkdown(tier, learnedConcepts);
  const sessionFile = path.join(LEARNED, `session-${String(tierNum).padStart(2,"0")}-${tier.name.toLowerCase().replace(/[\s\/]+/g, "-")}.md`);
  fs.writeFileSync(sessionFile, sessionMd);
  console.log(`\n  📄 Session notes: ${sessionFile}`);

  // Generate quiz
  const quiz = generateQuiz(learnedConcepts, 10);
  const quizFile = path.join(LEARNED, `quiz-tier-${tierNum}.json`);
  fs.writeFileSync(quizFile, JSON.stringify(quiz, null, 2));
  console.log(`  📝 Quiz: ${quizFile} (${quiz.length} questions)`);

  return { tier: tierNum, concepts: learnedConcepts, sessionFile, quizFile };
}

// ═══════════════ LEARNING SUMMARY EXTRACTION ═══════════════
function extractLearningSummary(body, concept) {
  const lines = body.split("\n");
  let oneLiner = "";
  const rules = [];
  let whenToUse = [];
  let whenNotToUse = [];

  // Find the "What is" section for one-liner
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^#{2,4}\s+(what\s+is|what\s+are)/i.test(line)) {
      // Collect next 2-3 sentences after heading
      let text = "";
      for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
        const l = lines[j].trim();
        if (l.startsWith("#") || l.startsWith("![") || l.startsWith("Table of Contents")) break;
        if (l.length > 30) text += " " + l;
      }
      if (text.length > 20 && !oneLiner) {
        oneLiner = text.replace(/\s+/g, " ").trim().slice(0, 300);
      }
      break;
    }
  }

  if (!oneLiner) {
    // Fallback: first substantial paragraph
    for (const line of lines) {
      const t = line.trim();
      if (t.length > 60 && !t.startsWith("#") && !t.startsWith("!") && !t.startsWith("**Source")) {
        oneLiner = t.slice(0, 300);
        break;
      }
    }
  }

  // Extract numbered rules
  for (const line of lines) {
    const t = line.trim();
    const ruleMatch = t.match(/^\d+\.\s+\*?\*?(.{15,150}?)\*?\*?\.?\s*$/);
    if (ruleMatch) {
      rules.push(ruleMatch[1].replace(/\*\*/g, "").trim());
    }
  }

  // Extract "When to use" / "When not to use"
  let inWhenSection = false;
  let inWhenNotSection = false;
  for (const line of lines) {
    const t = line.trim().toLowerCase();
    if (/when\s+(to\s+)?use|when\s+(is\s+)?it\s+(valid|appropriate)/.test(t)) {
      inWhenSection = true; inWhenNotSection = false; continue;
    }
    if (/when\s+not\s+to|avoid|common\s+mistake|do\s+not/.test(t)) {
      inWhenNotSection = true; inWhenSection = false; continue;
    }
    if (t.startsWith("#") || t.startsWith("##")) {
      inWhenSection = false; inWhenNotSection = false; continue;
    }
    if (inWhenSection && t.length > 30) whenToUse.push(t.slice(0, 200));
    if (inWhenNotSection && t.length > 30) whenNotToUse.push(t.slice(0, 200));
  }

  return {
    oneLiner: oneLiner || concept.excerpt || concept.title,
    rules: rules.slice(0, 7),
    whenToUse: whenToUse.slice(0, 3),
    whenNotToUse: whenNotToUse.slice(0, 3),
  };
}

// ═══════════════ SESSION MARKDOWN GENERATOR ═══════════════
function generateSessionMarkdown(tier, concepts) {
  let md = `# ICT Learning Session — Tier ${tier.tier}: ${tier.name}

**Date**: ${require("./ny_time.cjs").getNYDate()}
**Concepts Learned**: ${concepts.length}
**Est. Study Time**: ~${tier.estimatedStudyTime} minutes

---

## Concept Summaries

`;

  for (const c of concepts) {
    md += `### ${c.title}\n\n`;
    md += `${c.summary}\n\n`;
    if (c.rules.length > 0) {
      md += `**Key Rules:**\n`;
      for (const r of c.rules) md += `${c.rules.indexOf(r) + 1}. ${r}\n`;
      md += `\n`;
    }
    if (c.whenToUse.length > 0) {
      md += `**When to Use:**\n`;
      for (const w of c.whenToUse) md += `- ${w}\n`;
      md += `\n`;
    }
    if (c.whenNotToUse.length > 0) {
      md += `**When NOT to Use / Avoid:**\n`;
      for (const w of c.whenNotToUse) md += `- ${w}\n`;
      md += `\n`;
    }
    md += `**Source**: \`${c.file}\`\n`;
    if (c.source) md += `**URL**: ${c.source}\n`;
    md += `\n---\n\n`;
  }

  md += `\n## Prerequisite Map\n\n`;
  const allPrereqs = new Set();
  for (const c of concepts) {
    for (const p of c.relatedConcepts) allPrereqs.add(p);
  }
  md += `Concepts from previous tiers referenced by this session:\n\n`;
  for (const p of [...allPrereqs].sort()) {
    md += `- \`${p}\`\n`;
  }

  return md;
}

// ═══════════════ QUIZ GENERATOR ═══════════════
function generateQuiz(concepts, numQuestions) {
  const questions = [];
  const pool = concepts.filter(c => c.rules.length > 0 || c.summary.length > 50);

  for (let i = 0; i < Math.min(numQuestions, pool.length * 2); i++) {
    const c = pool[i % pool.length];
    const qType = i % 3;

    if (qType === 0 && c.rules.length > 0) {
      // Rule recall question
      const rule = c.rules[i % c.rules.length];
      const words = rule.split(" ");
      const blankIdx = Math.floor(Math.random() * words.length);
      words[blankIdx] = "________";
      questions.push({
        type: "fill_in_blank",
        concept: c.title,
        question: `Complete the rule from "${c.title}": ${words.join(" ")}`,
        answer: rule.split(" ")[blankIdx],
        context: rule,
        tier: c.tier,
      });
    } else if (qType === 1) {
      // Concept identification
      questions.push({
        type: "concept_id",
        concept: c.title,
        question: `What concept is described by: "${c.summary.slice(0, 150)}..."?`,
        answer: c.title,
        tier: c.tier,
      });
    } else {
      // When to use / not use
      const useCase = c.whenToUse[0] || c.whenNotToUse[0];
      if (useCase) {
        questions.push({
          type: "scenario",
          concept: c.title,
          question: useCase.includes("not") || useCase.includes("avoid")
            ? `When should you AVOID using ${c.title}?`
            : `When is ${c.title} most appropriate to use?`,
          answer: useCase,
          tier: c.tier,
        });
      }
    }
  }

  return questions;
}

// ═══════════════ CONDENSED KNOWLEDGE PROMPT ═══════════════
function buildCondensedPrompt(allSessions) {
  let prompt = `# CLAUDE_ICT_KNOWLEDGE.md — Condensed ICT Knowledge Reference

> Auto-generated from ICT Knowledge Centre via Phase 3 Curriculum
> ${new Date().toISOString()}
> Covers ${allSessions.reduce((s, sess) => s + sess.concepts.length, 0)} concepts across ${allSessions.length} tiers

---

`;

  for (const session of allSessions) {
    prompt += `## Tier ${session.tier}: ${curriculum.find(t => t.tier === session.tier)?.name || ""}\n\n`;

    for (const c of session.concepts) {
      prompt += `### ${c.title}\n`;
      prompt += `${c.summary.slice(0, 250)}\n\n`;
      if (c.rules.length > 0) {
        prompt += `**Rules:** `;
        prompt += c.rules.slice(0, 3).map((r, i) => `${i + 1}. ${r}`).join(" ");
        prompt += `\n\n`;
      }
      if (c.whenToUse.length > 0) {
        prompt += `**Use when:** ${c.whenToUse[0].slice(0, 150)}\n\n`;
      }
    }
    prompt += `---\n\n`;
  }

  prompt += `## Quick Reference

### Kill Zones (NY Local Time)
- **Asia**: 20:00–00:00 (previous day)
- **London Killzone**: 02:00–05:00
- **NY AM Killzone**: 08:00–11:00
- **NY Lunch**: 11:00–13:00
- **NY PM**: 13:00–16:00
- **NY Close**: 16:00–17:00

### Silver Bullet Windows (NY Local Time)
- **London SB**: 03:00–04:00
- **NY AM SB**: 10:00–11:00
- **NY PM SB**: 14:00–15:00

### Key Concepts for Trade Entry
1. **HTF Bias**: 1W → 1D → 4H alignment
2. **Liquidity**: Mark nearest BSL/SSL pools
3. **PD Array**: Premium/Discount zones
4. **FVG**: Entry on displacement FVG fill during killzone
5. **MSS**: Market Structure Shift confirmation on 1m/5m
6. **SL at structural invalidation**: Swing high/low + ATR buffer
7. **TP at opposing liquidity pool** or 1:1 measured move (minimum)

### Concept Hierarchy
- Query the RAG for detailed rules: \`node tools/ict_rag.cjs --query "..."\`
- Look up specific concepts: \`node tools/ict_rag.cjs --concept "..."\`
`;

  return prompt;
}

// ═══════════════ MAIN ═══════════════
function main() {
  const args = process.argv.slice(2);
  const mode = args[0];

  if (!mode || mode === "--help") {
    console.log(`
ICT Curriculum — Phase 3: Agent Learning System
Usage:
  node tools/ict_curriculum.cjs --run [tier]    Run learning session (0-4, or "all")
  node tools/ict_curriculum.cjs --quiz [tier]    Generate quiz for tier
  node tools/ict_curriculum.cjs --prompt          Build condensed CLAUDE_ICT_KNOWLEDGE.md
  node tools/ict_curriculum.cjs --status          Show learning progress

Examples:
  node tools/ict_curriculum.cjs --run 0     Learn Tier 0: Foundations
  node tools/ict_curriculum.cjs --run all    Learn all 5 tiers
  node tools/ict_curriculum.cjs --prompt     Generate knowledge prompt file
`);
    return;
  }

  // ── Run Session(s) ────────────────────────────────────
  if (mode === "--run") {
    const tierArg = args[1] || "all";
    const tiersToRun = tierArg === "all" ? [0, 1, 2, 3, 4] : [parseInt(tierArg)];
    const allSessions = [];

    for (const t of tiersToRun) {
      if (!curriculum[t]) { console.log(`Tier ${t} not found in curriculum`); continue; }
      if (curriculum[t].conceptCount === 0) { console.log(`Tier ${t} has no concepts — skipping`); continue; }
      const result = runSession(t);
      if (result) allSessions.push(result);
    }

    // Build condensed prompt
    if (allSessions.length > 0) {
      const prompt = buildCondensedPrompt(allSessions);
      const promptFile = path.join(ROOT, "CLAUDE_ICT_KNOWLEDGE.md");
      fs.writeFileSync(promptFile, prompt);
      console.log(`\n  📘 CLAUDE_ICT_KNOWLEDGE.md — built (${allSessions.reduce((s, sess) => s + sess.concepts.length, 0)} concepts)`);
    }
    return;
  }

  // ── Generate Quiz ─────────────────────────────────────
  if (mode === "--quiz") {
    const tier = parseInt(args[1]) || 0;
    const tierData = curriculum[tier];
    if (!tierData) { console.log(`Tier ${tier} not found`); return; }

    const concepts = tierData.concepts.map(c => {
      const concept = taxonomy[c.id];
      if (!concept) return null;
      const filepath = path.join(ICT_ROOT, concept.file);
      if (!fs.existsSync(filepath)) return null;
      const content = fs.readFileSync(filepath, "utf8");
      const frontMatch = content.match(/^---\n[\s\S]*?\n---\n?/);
      const body = frontMatch ? content.slice(frontMatch[0].length) : content;
      const summary = extractLearningSummary(body, concept);
      return {
        id: concept.id, title: concept.title, tier: concept.tier,
        summary: summary.oneLiner, rules: summary.rules,
        whenToUse: summary.whenToUse, whenNotToUse: summary.whenNotToUse,
      };
    }).filter(Boolean);

    const quiz = generateQuiz(concepts, 15);
    console.log(JSON.stringify(quiz, null, 2));
    return;
  }

  // ── Build Prompt ──────────────────────────────────────
  if (mode === "--prompt") {
    // Read all session files and rebuild prompt
    const sessionFiles = fs.readdirSync(LEARNED).filter(f => f.startsWith("session-")).sort();
    if (sessionFiles.length === 0) { console.log("No sessions found. Run --run first."); return; }

    const allSessions = [];
    for (const f of sessionFiles) {
      const tierMatch = f.match(/session-(\d+)/);
      if (!tierMatch) continue;
      const tierNum = parseInt(tierMatch[1]);
      const tierData = curriculum[tierNum];
      if (!tierData) continue;
      const concepts = tierData.concepts.map(c => {
        const concept = taxonomy[c.id];
        if (!concept) return null;
        return {
          id: concept.id, title: concept.title, tier: concept.tier,
          summary: concept.excerpt, rules: concept.keySections?.filter(s => s.type === "rule").map(s => s.text) || [],
          whenToUse: [], whenNotToUse: [],
        };
      }).filter(Boolean);
      allSessions.push({ tier: tierNum, concepts });
    }

    const prompt = buildCondensedPrompt(allSessions);
    const promptFile = path.join(ROOT, "CLAUDE_ICT_KNOWLEDGE.md");
    fs.writeFileSync(promptFile, prompt);
    console.log(`CLAUDE_ICT_KNOWLEDGE.md rebuilt from ${sessionFiles.length} sessions`);
    return;
  }

  // ── Status ─────────────────────────────────────────────
  if (mode === "--status") {
    console.log("\nICT Curriculum — Learning Progress\n");
    console.log("═".repeat(55));

    const sessionFiles = fs.readdirSync(LEARNED)
      .filter(f => f.startsWith("session-"))
      .sort();

    for (let t = 0; t <= 4; t++) {
      const tierData = curriculum[t];
      if (!tierData || tierData.conceptCount === 0) continue;
      const sessionFile = sessionFiles.find(f => f.includes(`session-${String(t).padStart(2,"0")}`));
      const status = sessionFile ? "✅ COMPLETED" : "⏳ NOT STARTED";
      const fileInfo = sessionFile ? ` (${sessionFile})` : "";
      console.log(`  Tier ${t} — ${tierData.name}: ${status}${fileInfo}`);
    }

    if (fs.existsSync(path.join(ROOT, "CLAUDE_ICT_KNOWLEDGE.md"))) {
      const stats = fs.statSync(path.join(ROOT, "CLAUDE_ICT_KNOWLEDGE.md"));
      console.log(`\n  📘 CLAUDE_ICT_KNOWLEDGE.md: ${(stats.size/1024).toFixed(1)} KB`);
    }

    const quizFiles = fs.readdirSync(LEARNED).filter(f => f.startsWith("quiz-"));
    console.log(`  📝 Quizzes generated: ${quizFiles.length}`);
    return;
  }

  console.log(`Unknown mode: ${mode}. Use --help.`);
}

main();
