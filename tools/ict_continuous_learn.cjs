// ICT Continuous Learning — Phase 5: Knowledge Evolution Loop
// Extracts lessons, updates playbook, detects gaps, improves over time

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const STAGES = path.join(ROOT, "stages");
const SHARED = path.join(ROOT, "shared");
const KB = path.join(ROOT, "references", "ict_knowledge");
const PLAYBOOK = path.join(ROOT, "references", "playbook");

const taxonomy = JSON.parse(fs.readFileSync(path.join(KB, "taxonomy.json"), "utf8"));

// ═══════════════ LESSON EXTRACTION ═══════════════
function extractLessons(pair, date) {
  const pairLabel = pair.toLowerCase();
  const lessons = {
    pair: pair.toUpperCase(),
    date,
    extracted: new Date().toISOString(),
    trade: null,
    conceptsUsed: [],
    ruleViolations: [],
    rulesFollowed: [],
    forecastAccuracy: null,
    decisionQuality: null,
    lessons: [],
    gaps: [],
    playbookCandidates: [],
  };

  // Read journal
  const journalFile = path.join(STAGES, "07_journal_review", "output", `${pairLabel}_intraday.md`);
  if (fs.existsSync(journalFile)) {
    const md = fs.readFileSync(journalFile, "utf8");

    // Extract lessons (numbered list after "Lessons" or "Final Lessons")
    const lessonSection = md.match(/(?:Lessons.*?\n|Final Lessons.*?\n)([\s\S]*?)(?:\n##|\n---|\n*$)/i);
    if (lessonSection) {
      const lessonLines = lessonSection[1].match(/^\d+\.\s+\*\*(.+?)\*\*[:\s]*(.*)/gm);
      if (lessonLines) {
        for (const l of lessonLines) {
          const match = l.match(/^\d+\.\s+\*\*(.+?)\*\*[:\s]*(.*)/);
          if (match) {
            lessons.lessons.push({
              title: match[1].trim(),
              detail: match[2].trim(),
              source: "journal",
            });
          }
        }
      }
    }

    // Extract trade outcome
    const pnlMatch = md.match(/P&L.*?\$([\d.-]+)/i);
    const resultMatch = md.match(/(?:Result|OUTCOME)[:\s]*(.+)/i);

    lessons.trade = {
      pnl: pnlMatch ? parseFloat(pnlMatch[1]) : 0,
      outcome: resultMatch ? resultMatch[1].trim() : "unknown",
      entries: (md.match(/ENTER/g) || []).length,
      blocked: (md.match(/BLOCKED/g) || []).length,
    };
  }

  // Read journal review for decision quality
  const reviewFile = path.join(STAGES, "07_journal_review", "output", `${pairLabel}_review.md`);
  if (fs.existsSync(reviewFile)) {
    const md = fs.readFileSync(reviewFile, "utf8");
    const qualityMatch = md.match(/Overall.*?([\d.]+)\/5/);
    if (qualityMatch) lessons.decisionQuality = parseFloat(qualityMatch[1]);
  }

  // Read forecast track
  const forecastFile = path.join(SHARED, date, pair, "forecast_track.json");
  if (fs.existsSync(forecastFile)) {
    try {
      const fc = JSON.parse(fs.readFileSync(forecastFile, "utf8"));
      if (fc.evaluation) {
        const correct = Object.values(fc.evaluation).filter(v => String(v).includes("CORRECT")).length;
        const total = Object.values(fc.evaluation).length;
        lessons.forecastAccuracy = { correct, total, pct: Math.round((correct / total) * 100) };
      }
    } catch (e) {}
  }

  // Read trade log for rule violations/followed
  const tradeLogFile = path.join(SHARED, "trade_log.json");
  if (fs.existsSync(tradeLogFile)) {
    try {
      const tradeLog = JSON.parse(fs.readFileSync(tradeLogFile, "utf8"));
      const pairTrades = tradeLog.filter(t => t.pair === pair.toUpperCase() && t.date === date);
      for (const t of pairTrades) {
        if (t.guardCorrect !== undefined) {
          if (t.guardCorrect) {
            lessons.rulesFollowed.push({ rule: "Cross-System Guard", outcome: t.result, detail: t.guardAction });
          } else {
            lessons.ruleViolations.push({ rule: "Cross-System Guard", outcome: t.result, detail: t.guardAction });
          }
        }
      }
      // Concepts used (from model)
      for (const t of pairTrades) {
        if (t.model && !lessons.conceptsUsed.includes(t.model)) {
          lessons.conceptsUsed.push(t.model);
        }
      }
    } catch (e) {}
  }

  return lessons;
}

// ═══════════════ KNOWLEDGE GAP DETECTION ═══════════════
function detectGaps(lessons, allSessionLessons) {
  const gaps = [];

  // Gap 1: Decision quality below 3/5
  if (lessons.decisionQuality !== null && lessons.decisionQuality < 3) {
    gaps.push({
      type: "decision_quality",
      severity: "high",
      detail: `Decision quality rated ${lessons.decisionQuality}/5 — below minimum`,
      recommendation: "Review the stage outputs that scored lowest. Re-read the relevant ICT concept from the knowledge base.",
      conceptsToReview: ["ict-daily-bias", "ict-silver-bullet-strategy", "ict-top-down-analysis"],
    });
  }

  // Gap 2: Guard blocks with losses
  if (lessons.trade && lessons.trade.blocked > 0 && lessons.trade.pnl < 0) {
    gaps.push({
      type: "guard_timing",
      severity: "medium",
      detail: `${lessons.trade.blocked} entries blocked but still had negative P&L`,
      recommendation: "Guard blocks are working but entries are being forced. Review the entry trigger window and 1m confirmation rules.",
      conceptsToReview: ["ict-silver-bullet-strategy", "ict-cisd-and-ict-mss"],
    });
  }

  // Gap 3: Forecast divergence led to missed opportunity
  if (lessons.forecastAccuracy && lessons.forecastAccuracy.pct < 50) {
    gaps.push({
      type: "forecast_accuracy",
      severity: "medium",
      detail: `Forecast accuracy ${lessons.forecastAccuracy.pct}% — below 50%`,
      recommendation: "Forecast is currently unreliable for this pair/session. Reduce weight on forecast in confluence scoring.",
      conceptsToReview: ["ict-daily-bias-trick"],
    });
  }

  // Gap 4: No lessons extracted (shallow review)
  if (lessons.lessons.length === 0) {
    gaps.push({
      type: "shallow_review",
      severity: "low",
      detail: "No structured lessons extracted from journal",
      recommendation: "Run a deeper journal review. Ask: what ICT rule was followed? What was missed? What would you do differently?",
      conceptsToReview: [],
    });
  }

  // Gap 5: Counter-trend entries
  for (const v of lessons.ruleViolations) {
    if (v.rule?.includes("counter") || v.rule?.includes("HTF")) {
      gaps.push({
        type: "counter_trend",
        severity: "high",
        detail: "Counter-trend entry detected — trading against HTF bias",
        recommendation: "ICT Rule MS-03: Never trade against HTF bias without a higher-TF PD Array reason. Re-study the daily bias module.",
        conceptsToReview: ["ict-daily-bias-explained", "ict-market-structure-shift", "ict-top-down-analysis"],
      });
    }
  }

  return gaps;
}

// ═══════════════ PLAYBOOK UPDATER ═══════════════
function updatePlaybook(lessons) {
  const currentFile = path.join(PLAYBOOK, "current.md");
  const archiveDir = path.join(PLAYBOOK, "archive");
  fs.mkdirSync(archiveDir, { recursive: true });

  const candidates = [];

  for (const lesson of lessons.lessons) {
    // Only promote lessons that are actionable and specific
    if (lesson.detail.length > 20 && !lesson.detail.includes("?")) {
      candidates.push({
        title: lesson.title,
        rule: lesson.detail,
        source: `${lessons.date} — ${lessons.pair}`,
        type: classifyPlaybookType(lesson),
      });
    }
  }

  // Read existing playbook
  let existingPlaybook = "";
  if (fs.existsSync(currentFile)) {
    existingPlaybook = fs.readFileSync(currentFile, "utf8");
  }

  // Check for duplicates before adding
  const newEntries = candidates.filter(c => !existingPlaybook.includes(c.title));

  if (newEntries.length > 0) {
    const now = new Date().toISOString();
    const entry = `\n## ${lessons.date} — ${lessons.pair}\n\n` +
      newEntries.map(c =>
        `### ${c.title}\n` +
        `- **Type**: ${c.type}\n` +
        `- **Rule**: ${c.rule}\n` +
        `- **Source**: ${c.source}\n` +
        `- **Added**: ${now}\n`
      ).join("\n");

    // Append to current playbook
    fs.appendFileSync(currentFile, entry);
  }

  return { candidates, newCount: newEntries.length };
}

function classifyPlaybookType(lesson) {
  const t = (lesson.title + " " + lesson.detail).toLowerCase();
  if (/guard|block|invalidation|stop|exit/.test(t)) return "risk-management";
  if (/entry|trigger|fvg|mss|choch|pullback/.test(t)) return "entry-execution";
  if (/bias|structure|trend|htf|direction/.test(t)) return "directional-bias";
  if (/session|time|window|killzone|sb|lunch/.test(t)) return "session-timing";
  if (/forecast|predict|projection/.test(t)) return "forecast-usage";
  if (/psychology|patience|discipline|emotion/.test(t)) return "psychology";
  return "general";
}

// ═══════════════ CONCEPT USAGE TRACKER ═══════════════
function trackConceptUsage(lessons, allHistory) {
  const usage = {};

  // Count concept usage from today
  for (const concept of lessons.conceptsUsed) {
    usage[concept] = { usedToday: 1, totalUses: 1 };
  }

  // Aggregate from history
  if (allHistory && Array.isArray(allHistory)) {
    for (const hist of allHistory) {
      for (const concept of (hist.conceptsUsed || [])) {
        if (!usage[concept]) usage[concept] = { usedToday: 0, totalUses: 0 };
        usage[concept].totalUses++;
      }
    }
  }

  // Find concepts from taxonomy that are never used (potential blind spots)
  const neverUsed = [];
  for (const [id, concept] of Object.entries(taxonomy)) {
    if (!usage[id] && concept.tier <= 2) { // Only track tiers 0-2 (core)
      neverUsed.push({ id, title: concept.title, tier: concept.tierName });
    }
  }

  return { usage, neverUsed };
}

// ═══════════════ IMPROVEMENT REPORT ═══════════════
function generateImprovementReport(lessons, gaps, playbookResult, conceptTracking) {
  const report = {
    generated: new Date().toISOString(),
    pair: lessons.pair,
    date: lessons.date,
    summary: {
      tradePnl: lessons.trade?.pnl || 0,
      decisionQuality: lessons.decisionQuality,
      forecastAccuracy: lessons.forecastAccuracy,
      lessonsExtracted: lessons.lessons.length,
      gapsDetected: gaps.length,
      playbookEntries: playbookResult.newCount,
    },
    strengths: [],
    weaknesses: [],
    recommendations: [],
  };

  // Strengths
  if (lessons.decisionQuality && lessons.decisionQuality >= 4) {
    report.strengths.push("High decision quality — ICT framework being applied correctly");
  }
  if (lessons.trade && lessons.trade.blocked > 0 && lessons.trade.pnl >= 0) {
    report.strengths.push("Guard system working — blocked entries prevented losses");
  }
  if (lessons.forecastAccuracy && lessons.forecastAccuracy.pct >= 60) {
    report.strengths.push("Forecast accuracy above threshold — confluence tool is reliable");
  }
  if (lessons.rulesFollowed.length > lessons.ruleViolations.length) {
    report.strengths.push("More rules followed than violated — compliance trending positive");
  }

  // Weaknesses
  for (const gap of gaps) {
    report.weaknesses.push({ type: gap.type, detail: gap.detail, severity: gap.severity });
  }
  if (lessons.trade && lessons.trade.pnl < 0) {
    report.weaknesses.push({ type: "negative_pnl", detail: `Trade lost $${Math.abs(lessons.trade.pnl)}`, severity: "high" });
  }
  if (lessons.lessons.length < 3) {
    report.weaknesses.push({ type: "shallow_review", detail: "Fewer than 3 lessons extracted — deepen journal practice", severity: "low" });
  }

  // Recommendations
  for (const gap of gaps) {
    report.recommendations.push({
      action: gap.recommendation,
      concepts: gap.conceptsToReview,
      priority: gap.severity === "high" ? 1 : gap.severity === "medium" ? 2 : 3,
    });
  }

  // Concept blind spots
  if (conceptTracking.neverUsed.length > 5) {
    report.recommendations.push({
      action: `${conceptTracking.neverUsed.length} core ICT concepts never referenced — potential knowledge blind spots. Schedule a review session.`,
      concepts: conceptTracking.neverUsed.map(c => c.id).slice(0, 5),
      priority: 2,
    });
  }

  return report;
}

// ═══════════════ MAIN ═══════════════
async function main() {
  const args = process.argv.slice(2);
  const mode = args[0];

  if (!mode || mode === "--help") {
    console.log(`
ICT Continuous Learning — Phase 5: Knowledge Evolution (with LLM deep analysis)
Usage:
  node tools/ict_continuous_learn.cjs --extract [pair] [date]   Extract lessons from today's trade
  node tools/ict_continuous_learn.cjs --gaps [pair] [date]       Detect knowledge gaps
  node tools/ict_continuous_learn.cjs --playbook [pair] [date]    Update playbook from lessons
  node tools/ict_continuous_learn.cjs --report [pair] [date]      Full improvement report
  node tools/ict_continuous_learn.cjs --run [pair]                Run all (extract + gaps + playbook + report)
  node tools/ict_continuous_learn.cjs --deep-analyze [pair]       LLM cross-trade pattern recognition
  node tools/ict_continuous_learn.cjs --dashboard                 Learning dashboard
  node tools/ict_continuous_learn.cjs --sync-graph                Rebuild trade graph from all data

Examples:
  node tools/ict_continuous_learn.cjs --run GBPUSD
  node tools/ict_continuous_learn.cjs --deep-analyze GBPUSD
  node tools/ict_continuous_learn.cjs --report GBPUSD 2026-07-27
  node tools/ict_continuous_learn.cjs --dashboard
`);
    return;
  }

  const pair = args[1] || "GBPUSD";
  const date = args[2] || new Date().toISOString().split("T")[0];

  // ── Extract Lessons ──────────────────────────────────
  if (mode === "--extract" || mode === "--run") {
    const lessons = extractLessons(pair, date);

    console.log(`\n📝 Lessons Extracted — ${pair.toUpperCase()} ${date}`);
    console.log("═".repeat(55));
    console.log(`Trade P&L: $${lessons.trade?.pnl || 0}`);
    console.log(`Decision Quality: ${lessons.decisionQuality || "N/A"}/5`);
    console.log(`Forecast Accuracy: ${lessons.forecastAccuracy ? lessons.forecastAccuracy.pct + "%" : "N/A"}`);
    console.log(`Concepts Used: ${lessons.conceptsUsed.join(", ") || "none"}`);
    console.log(`Rules Followed: ${lessons.rulesFollowed.length} | Violated: ${lessons.ruleViolations.length}`);
    console.log(`\nLessons (${lessons.lessons.length}):`);
    for (const l of lessons.lessons) {
      console.log(`  • ${l.title}: ${l.detail.slice(0, 80)}...`);
    }

    // Save extracted lessons
    const lessonDir = path.join(SHARED, "performance");
    fs.mkdirSync(lessonDir, { recursive: true });
    const lessonFile = path.join(lessonDir, `lessons_${pair.toLowerCase()}_${date}.json`);
    fs.writeFileSync(lessonFile, JSON.stringify(lessons, null, 2));
    console.log(`\n  Saved: ${lessonFile}`);

    // ── Detect Gaps ──────────────────────────────────
    if (mode === "--run" || mode === "--gaps") {
      // Load history
      let allHistory = [];
      const histFiles = fs.readdirSync(lessonDir).filter(f => f.startsWith("lessons_")).sort();
      for (const hf of histFiles.slice(-30)) { // Last 30 sessions
        try {
          allHistory.push(JSON.parse(fs.readFileSync(path.join(lessonDir, hf), "utf8")));
        } catch (e) {}
      }

      const gaps = detectGaps(lessons, allHistory);
      lessons.gaps = gaps;

      if (gaps.length > 0) {
        console.log(`\n⚠️  Knowledge Gaps (${gaps.length}):`);
        for (const g of gaps) {
          const icon = g.severity === "high" ? "🔴" : g.severity === "medium" ? "🟡" : "🔵";
          console.log(`  ${icon} [${g.type}] ${g.detail.slice(0, 100)}`);
          if (g.conceptsToReview.length > 0) {
            console.log(`     Review: ${g.conceptsToReview.join(", ")}`);
          }
        }
      } else {
        console.log(`\n✅ No knowledge gaps detected`);
      }

      // Update saved file
      fs.writeFileSync(lessonFile, JSON.stringify(lessons, null, 2));
    }

    // ── Update Playbook ──────────────────────────────
    if (mode === "--run" || mode === "--playbook") {
      const playbookResult = updatePlaybook(lessons);
      if (playbookResult.newCount > 0) {
        console.log(`\n📘 Playbook Updated — ${playbookResult.newCount} new entries`);
        for (const c of playbookResult.candidates.slice(0, 3)) {
          console.log(`  + ${c.title} (${c.type})`);
        }
      } else {
        console.log(`\n📘 Playbook — no new entries (all duplicates or already captured)`);
      }
    }

    // ── Generate Report ──────────────────────────────
    if (mode === "--run" || mode === "--report") {
      const conceptTracking = trackConceptUsage(lessons, []);
      const report = generateImprovementReport(lessons, lessons.gaps || [], { newCount: 0 }, conceptTracking);

      console.log(`\n${"═".repeat(55)}`);
      console.log(`IMPROVEMENT REPORT — ${pair.toUpperCase()} ${date}`);
      console.log(`${"═".repeat(55)}`);

      if (report.strengths.length > 0) {
        console.log(`\n✅ Strengths:`);
        for (const s of report.strengths) console.log(`  • ${s}`);
      }
      if (report.weaknesses.length > 0) {
        console.log(`\n⚠️  Weaknesses:`);
        for (const w of report.weaknesses) console.log(`  • [${w.severity}] ${w.detail}`);
      }
      if (report.recommendations.length > 0) {
        console.log(`\n📋 Recommendations:`);
        for (const r of report.recommendations.slice(0, 5)) {
          console.log(`  ${r.priority}. ${r.action}`);
        }
      }

      const reportFile = path.join(lessonDir, `report_${pair.toLowerCase()}_${date}.json`);
      fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
      console.log(`\n  Report saved: ${reportFile}`);
    }

    // ── Sync Trade Graph ────────────────────────────────
    if (mode === "--run") {
      try {
        const tradeGraph = require("./trade_graph.cjs");
        const g = tradeGraph.buildGraph();
        tradeGraph.saveGraph(g);
        const tradeCount = Object.values(g.nodes).filter(n => n.type === "trade").length;
        const lessonCount = Object.values(g.nodes).filter(n => n.type === "lesson").length;
        const gapCount = Object.values(g.nodes).filter(n => n.type === "gap" && !n.resolved).length;
        console.log(`\n🧠 Trade Graph synced — ${tradeCount} trades, ${lessonCount} lessons, ${gapCount} unresolved gaps`);
      } catch (e) {
        console.log(`\n⚠️  Trade Graph sync skipped: ${e.message}`);
      }
    }

    return;
  }

  // ── Dashboard ───────────────────────────────────────
  if (mode === "--dashboard") {
    const lessonDir = path.join(SHARED, "performance");
    console.log(`\n📊 ICT Continuous Learning Dashboard\n`);
    console.log("═".repeat(55));

    if (!fs.existsSync(lessonDir)) {
      console.log("No performance data yet. Run --extract after a trade session.");
      return;
    }

    const files = fs.readdirSync(lessonDir).filter(f => f.startsWith("lessons_")).sort();
    if (files.length === 0) {
      console.log("No lessons extracted yet. Run --run after your next trade.");
      return;
    }

    const allLessons = [];
    for (const f of files) {
      try {
        allLessons.push(JSON.parse(fs.readFileSync(path.join(lessonDir, f), "utf8")));
      } catch (e) {}
    }

    // Aggregate stats
    const totalSessions = allLessons.length;
    const totalPnl = allLessons.reduce((s, l) => s + (l.trade?.pnl || 0), 0);
    const avgQuality = allLessons.reduce((s, l) => s + (l.decisionQuality || 0), 0) / totalSessions;
    const totalLessons = allLessons.reduce((s, l) => s + l.lessons.length, 0);
    const totalGaps = allLessons.reduce((s, l) => s + (l.gaps?.length || 0), 0);

    // Winning vs losing sessions
    const winningSessions = allLessons.filter(l => (l.trade?.pnl || 0) > 0).length;
    const losingSessions = allLessons.filter(l => (l.trade?.pnl || 0) < 0).length;
    const scratchSessions = allLessons.filter(l => (l.trade?.pnl || 0) === 0).length;

    console.log(`Sessions: ${totalSessions} | Win: ${winningSessions} | Loss: ${losingSessions} | Scratch: ${scratchSessions}`);
    console.log(`Win Rate: ${totalSessions > 0 ? Math.round((winningSessions / (winningSessions + losingSessions || 1)) * 100) : 0}%`);
    console.log(`Total P&L: $${totalPnl.toFixed(2)}`);
    console.log(`Avg Decision Quality: ${avgQuality.toFixed(1)}/5`);
    console.log(`Total Lessons Extracted: ${totalLessons}`);
    console.log(`Knowledge Gaps Detected: ${totalGaps}`);

    // Most used concepts
    const conceptCounts = {};
    for (const l of allLessons) {
      for (const c of (l.conceptsUsed || [])) {
        conceptCounts[c] = (conceptCounts[c] || 0) + 1;
      }
    }
    const topConcepts = Object.entries(conceptCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    if (topConcepts.length > 0) {
      console.log(`\nMost Used Models:`);
      for (const [concept, count] of topConcepts) {
        console.log(`  • ${concept}: ${count}x`);
      }
    }

    // Most common gap types
    const gapTypes = {};
    for (const l of allLessons) {
      for (const g of (l.gaps || [])) {
        gapTypes[g.type] = (gapTypes[g.type] || 0) + 1;
      }
    }
    const topGaps = Object.entries(gapTypes).sort((a, b) => b[1] - a[1]).slice(0, 5);

    if (topGaps.length > 0) {
      console.log(`\nMost Common Gap Types:`);
      for (const [type, count] of topGaps) {
        console.log(`  • ${type}: ${count}x`);
      }
    }

    // Playbook stats
    const playbookFile = path.join(PLAYBOOK, "current.md");
    if (fs.existsSync(playbookFile)) {
      const pbSize = fs.statSync(playbookFile).size;
      const pbEntries = (fs.readFileSync(playbookFile, "utf8").match(/^### /gm) || []).length;
      console.log(`\nPlaybook: ${pbEntries} entries (${(pbSize / 1024).toFixed(1)} KB)`);
    }

    // Recent sessions
    console.log(`\nRecent Sessions:`);
    for (const l of allLessons.slice(-5).reverse()) {
      const pnlStr = (l.trade?.pnl || 0) >= 0 ? `+$${l.trade?.pnl || 0}` : `-$${Math.abs(l.trade?.pnl || 0)}`;
      console.log(`  ${l.date} ${l.pair}: ${pnlStr} | Quality: ${l.decisionQuality || "?"}/5 | Lessons: ${l.lessons.length}`);
    }

    return;
  }

  // ── Deep Analyze (LLM cross-trade pattern recognition) ────
  if (mode === "--deep-analyze") {
    const lessonDir = path.join(SHARED, "performance");
    console.log(`\n🧠 Deep Analysis — Cross-Trade Pattern Recognition\n`);
    console.log("═".repeat(55));

    if (!fs.existsSync(lessonDir)) {
      console.log("No performance data yet. Run --extract after trades first.");
      return;
    }

    const files = fs.readdirSync(lessonDir).filter(f => f.startsWith("lessons_")).sort();
    if (files.length < 3) {
      console.log(`Need at least 3 trade sessions for pattern analysis. Found: ${files.length}`);
      return;
    }

    // Load all recent trades
    const allTrades = [];
    const allLessons = [];
    for (const f of files.slice(-50)) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(lessonDir, f), "utf8"));
        allTrades.push({
          pair: data.pair,
          date: data.date,
          direction: data.trade?.direction || "unknown",
          pnl: data.trade?.pnl || 0,
          model: data.conceptsUsed?.[0] || "unknown",
          session: data.session || "unknown",
          outcome: data.trade?.outcome || "unknown",
          decisionQuality: data.decisionQuality,
          ruleViolations: (data.ruleViolations || []).map(v => v.rule),
          rulesFollowed: (data.rulesFollowed || []).map(v => v.rule),
        });
        allLessons.push(...(data.lessons || []));
      } catch (e) {}
    }

    console.log(`Loaded ${allTrades.length} trades across ${new Set(allTrades.map(t => t.date)).size} sessions`);
    console.log(`Total P&L: $${allTrades.reduce((s, t) => s + t.pnl, 0).toFixed(2)}`);
    console.log(`Win rate: ${(allTrades.filter(t => t.pnl > 0).length / allTrades.filter(t => t.pnl !== 0).length * 100 || 0).toFixed(0)}%`);
    console.log(`\nAnalyzing with LLM...\n`);

    try {
      const { chatCompletion } = require("./llm/llm_client.cjs");
      const { journalAnalysis } = require("./llm/llm_prompts.cjs");
      const { messages, config } = journalAnalysis(allTrades, allLessons, pair);

      const response = await chatCompletion(messages, config);

      if (response.text.startsWith("[LLM")) {
        console.log(`⚠️  LLM unavailable: ${response.text}`);
        console.log(`(Set GEMINI_API_KEY in .env for cross-trade analysis)`);
        // Still output basic stats
        console.log(`\n── Basic Stats (no LLM) ──`);
        const modelStats = {};
        for (const t of allTrades) {
          const key = t.model || "unknown";
          if (!modelStats[key]) modelStats[key] = { wins: 0, losses: 0, pnl: 0 };
          modelStats[key][t.pnl > 0 ? "wins" : "losses"]++;
          modelStats[key].pnl += t.pnl;
        }
        console.log(`\nModel Performance:`);
        for (const [model, stats] of Object.entries(modelStats).sort((a, b) => b[1].pnl - a[1].pnl)) {
          const total = stats.wins + stats.losses;
          const wr = total > 0 ? Math.round(stats.wins / total * 100) : 0;
          console.log(`  ${model}: ${wr}% win (${stats.wins}W/${stats.losses}L) | P&L: $${stats.pnl.toFixed(0)}`);
        }
      } else {
        console.log(`📊 CROSS-TRADE PATTERN ANALYSIS (${response.provider}/${response.model}):\n`);
        console.log(response.text);
        console.log(`\n${"─".repeat(55)}`);
        console.log(`💡 Based on ${allTrades.length} trades across ${new Set(allTrades.map(t => t.date)).size} sessions`);
      }
    } catch (e) {
      console.log(`⚠️  Deep analysis skipped: ${e.message}`);
      console.log(`(Requires: llm/llm_client.cjs and llm/llm_prompts.cjs)`);
    }

    return;
  }

  // ── Single operations ────────────────────────────────
  if (mode === "--sync-graph") {
    try {
      const tradeGraph = require("./trade_graph.cjs");
      const g = tradeGraph.buildGraph();
      tradeGraph.saveGraph(g);
      const counts = {
        trades: Object.values(g.nodes).filter(n => n.type === "trade").length,
        models: Object.values(g.nodes).filter(n => n.type === "model").length,
        sessions: Object.values(g.nodes).filter(n => n.type === "session").length,
        lessons: Object.values(g.nodes).filter(n => n.type === "lesson").length,
        gaps: Object.values(g.nodes).filter(n => n.type === "gap" && !n.resolved).length,
        concepts: Object.values(g.nodes).filter(n => n.type === "concept").length,
        edges: g.edges.length,
      };
      console.log(JSON.stringify({ synced: g.built, ...counts }, null, 2));
    } catch (e) {
      console.log(JSON.stringify({ error: "Trade graph sync failed: " + e.message }));
    }
    return;
  }

  if (mode === "--gaps") {
    const lessons = extractLessons(pair, date);
    const gaps = detectGaps(lessons, []);
    console.log(JSON.stringify(gaps, null, 2));
    return;
  }

  if (mode === "--playbook") {
    const lessons = extractLessons(pair, date);
    const result = updatePlaybook(lessons);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (mode === "--report") {
    const lessons = extractLessons(pair, date);
    const report = generateImprovementReport(lessons, [], { newCount: 0 }, { neverUsed: [] });
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`Unknown mode: ${mode}. Use --help.`);
}

main();
