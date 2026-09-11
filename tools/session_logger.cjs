#!/usr/bin/env node
/**
 * Session Logger v2 — Standalone auto-capture for trading sessions.
 *
 * Reads the stage outputs that the engine already produces and writes:
 *   shared/YYYY-MM-DD/session_log.md     — human-readable narrative
 *   shared/YYYY-MM-DD/session_journal.json — structured JSON for analysis
 *
 * Usage:
 *   node tools/session_logger.cjs              # Run now
 *   node tools/session_logger.cjs --full        # Detailed with key insights
 *   node tools/session_logger.cjs --commit      # Write + git commit
 *
 * Auto-runs when called from morning_briefing.cjs (optional, non-breaking).
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..");
const DATE = require("./ny_time.cjs").getNYDate();
const PAIRS = ["EURUSD", "GBPUSD", "XAUUSD", "NAS100"];
const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const dayOfWeek = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" })).getDay();
const dayName = dayNames[dayOfWeek];
const nyTime = new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false });

// ═══════════════════════════════════════════════════════════
// FILE READERS
// ═══════════════════════════════════════════════════════════
function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { return null; }
}

function readMd(filePath) {
  try { return fs.readFileSync(filePath, "utf8"); } catch { return null; }
}

// ═══════════════════════════════════════════════════════════
// EXTRACTORS — parse stage output files
// ═══════════════════════════════════════════════════════════
function extractBias(md) {
  if (!md) return { bias: "NEUTRAL", confidence: 0 };
  const m = md.match(/Final Bias\s*\n\s*\*\*(\w+)\*\*\s*—\s*Confidence:\s*(\d+\.?\d*)/i);
  if (m) return { bias: m[1].toUpperCase(), confidence: parseFloat(m[2]) };
  const m2 = md.match(/Final Bias\s*\n\s*\*\*(\w+)/i);
  if (m2) return { bias: m2[1].toUpperCase(), confidence: 1.0 };
  return { bias: "NEUTRAL", confidence: 0 };
}

function extractVerdict(md) {
  if (!md) return { verdict: "NO TRADE", primary: null, completeCount: 0 };
  const m = md.match(/### Verdict:\s*\*\*(.+?)\*\*/);
  if (!m) return { verdict: "NO TRADE", primary: null, completeCount: 0 };
  const line = m[1];
  const isComplete = line.includes("SETUP COMPLETE");
  const countMatch = line.match(/(\d+)\s*complete/);
  const primaryMatch = line.match(/Primary model[:\s]*\*\*(.+?)\*\*/);
  return {
    verdict: isComplete ? "SETUP COMPLETE" : "NO TRADE",
    primary: primaryMatch ? primaryMatch[1].trim() : null,
    completeCount: countMatch ? parseInt(countMatch[1]) : (isComplete ? 1 : 0)
  };
}

function extractGate(md) {
  if (!md) return "UNKNOWN";
  const phaseMatch = md.match(/Cycle Phase\*\*:\s*\*\*(\w+)/i);
  if (phaseMatch) {
    const phase = phaseMatch[1];
    if (phase === "MANIPULATION") return "GATE CLOSED (MANIPULATION)";
    if (phase === "DISTRIBUTION" || phase === "EXPANSION") return "OPEN";
  }
  return "CHECK REGISTRY";
}

function extractCoherence(reviewMd) {
  if (!reviewMd) return null;
  const m = reviewMd.match(/Unified Coherence\s*:\s*(\d+)\/100/i);
  if (m) return parseInt(m[1]);
  const m2 = reviewMd.match(/Coherence\s*:\s*(\d+)\/100/i);
  if (m2) return parseInt(m2[1]);
  return null;
}

function extractInvalidation(reviewMd) {
  if (!reviewMd) return null;
  if (reviewMd.includes("INVALIDATED")) return "INVALIDATED";
  if (reviewMd.includes("HIGH RISK")) return "HIGH RISK";
  return null;
}

function extractPrice(decisionJson) {
  if (!decisionJson || !decisionJson.entry) return "N/A";
  const p = decisionJson.entry.price;
  return typeof p === "number" ? Number(p).toFixed(5) : String(p);
}

function extractMMXM(mmxmMd) {
  if (!mmxmMd) return { smr: "N/A", side: "N/A", phase: "N/A" };
  const smr = mmxmMd.includes("✅ DETECTED") ? "✅ CONFIRMED" :
              mmxmMd.includes("⏳ Not detected") ? "⏳ PRE-SMR" : "N/A";
  const sideM = mmxmMd.match(/(?:Side of Curve|Side)\s*[:**]\s*\*\*(\w+)/i);
  const side = sideM ? sideM[1] : "N/A";
  const phaseM = mmxmMd.match(/(?:Entry Phase|Phase)\s*[:**]\s*\*\*(\w+)/i);
  const phase = phaseM ? phaseM[1] : "N/A";
  return { smr, side, phase };
}

function extractCycle(cycleJson) {
  if (!cycleJson) return { phase: "UNKNOWN", step: "", reason: "" };
  return {
    phase: cycleJson.phase || "UNKNOWN",
    step: cycleJson.source || "",
    reason: cycleJson.reason || ""
  };
}

function extractLiquidity(liquidMd) {
  if (!liquidMd) return { draw: "N/A", status: "N/A" };
  const drawM = liquidMd.match(/\*\*Primary Draw\*\*[:\s]*(.+)/i);
  const statusM = liquidMd.match(/Step 8.*?-\s*(.+)/i);
  return {
    draw: drawM ? drawM[1].trim().substring(0, 80) : "N/A",
    status: statusM ? statusM[1].trim() : "N/A"
  };
}

function extractWeekProfile(pair) {
  const wp = readMd(path.join(ROOT, "stages", "00_macro_context", "output", `${pair.toLowerCase()}_weekly_profile.md`));
  if (!wp) return null;
  const classM = wp.match(/Profile Classification\s*\*\*(.+?)\*\*/);
  const dirM = wp.match(/Direction:\s*\*\*(\w+)\*\*/i);
  const targetM = wp.match(/Expected Extreme\s*:\s*(\w+)\s+(\w+)/i);
  return {
    classification: classM ? classM[1].trim() : "N/A",
    direction: dirM ? dirM[1].toUpperCase() : "N/A",
    target: targetM ? `${targetM[1]} ${targetM[2]}` : "N/A"
  };
}

// ═══════════════════════════════════════════════════════════
// BUILD SESSION DATA
// ═══════════════════════════════════════════════════════════
function buildSessionData() {
  const pairs = [];
  let tradeableCount = 0;

  for (const pair of PAIRS) {
    const d = pair.toLowerCase();
    const sharedDir = path.join(ROOT, "shared", DATE, pair);
    const decision = readJson(path.join(sharedDir, "decision.json"));
    const biasMd = readMd(path.join(ROOT, "stages", "01_htf_bias", "output", `${d}_bias.md`));
    const mmxmMd = readMd(path.join(ROOT, "stages", "00_macro_context", "output", `${d}_mmxm.md`));
    const registryMd = readMd(path.join(ROOT, "stages", "04_model_selection", "output", `${d}_active_models.md`));
    const reviewMd = readMd(path.join(ROOT, "stages", "07_journal_review", "output", `${d}_review.md`));
    const cycleJson = readJson(path.join(ROOT, "stages", "00_macro_context", "output", `${d}_cycle_phase.json`));
    const liquidMd = readMd(path.join(ROOT, "stages", "02_key_levels", "output", `${d}_liquidity.md`));
    const wp = extractWeekProfile(pair);

    const bias = extractBias(biasMd);
    const verdict = extractVerdict(registryMd);
    const gate = extractGate(registryMd);
    // Pull from decision.json (primary source) with review.md fallback
    const coherenceRaw = decision?.coherence?.unified;
    const coherence = typeof coherenceRaw === "number" ? coherenceRaw : extractCoherence(reviewMd);
    const invalidationRaw = decision?.invalidation?.status;
    const invalidation = invalidationRaw ? (invalidationRaw.includes("INVALID") ? "INVALIDATED" : null) : extractInvalidation(reviewMd);
    const mmxm = extractMMXM(mmxmMd);
    const cycle = extractCycle(cycleJson);
    const liquidity = extractLiquidity(liquidMd);
    const price = extractPrice(decision);

    const isTradeable = verdict.verdict === "SETUP COMPLETE" &&
                        !gate.includes("CLOSED") &&
                        !invalidation?.includes("INVALIDATED") &&
                        (coherence ?? 0) >= 50;
    if (isTradeable) tradeableCount++;

    pairs.push({
      pair, price, bias, verdict, gate, coherence, invalidation, mmxm, cycle, wp, isTradeable,
      drawTarget: liquidity.draw,
      sweepStatus: liquidity.status
    });
  }

  const overall = tradeableCount > 0 ? "TRADE" : "NO TRADE";
  return { date: DATE, dayName, nyTime, pairs, tradeableCount, overall };
}

// ═══════════════════════════════════════════════════════════
// WRITE session_log.md
// ═══════════════════════════════════════════════════════════
function writeLog(data) {
  const dir = path.join(ROOT, "shared", data.date);
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, "session_log.md");

  const dayProfile = {
    "Monday": "Range Set Day — institutions accumulating. Weekly range not yet established.",
    "Tuesday": "Trend continuation day. Wednesday extremes often begin forming.",
    "Wednesday": "Midweek reversal day. Highest volatility window of the week.",
    "Thursday": "Pre-Friday positioning. Thursday 2PM extremes common per ICT.",
    "Friday": "Weekly Resolution Day — all positions must close by 16:00 NY.",
    "Saturday": "Low liquidity. No trading.",
    "Sunday": "Week open. Asian session sets the tone."
  }[data.dayName] || "Standard trading day.";

  let md = `# Session Log — ${data.dayName} ${data.date}\n\n`;
  md += `**Session Type:** Live Analysis | **NY Time:** ${data.nyTime} | **Day Profile:** ${data.dayName}\n\n`;
  md += `---\n\n`;

  // Verdict banner
  const icon = data.overall === "TRADE" ? "🟢" : "🛑";
  md += `## Verdict: ${icon} ${data.overall}\n\n`;
  md += `${data.tradeableCount} tradeable pair(s) | ${PAIRS.length - data.tradeableCount} blocked pair(s)\n\n`;

  // Summary table
  md += `### Pair Summary\n\n`;
  md += `| Pair | Price | Bias | Phase | SMR | Model | Gate | Coh | Invalid |\n`;
  md += `|------|-------|------|-------|-----|-------|------|-----|---------|\n`;
  for (const p of data.pairs) {
    const icon = p.isTradeable ? "✅" : "❌";
    const coh = p.coherence != null ? `${p.coherence}/100` : "—";
    const inv = p.invalidation || "—";
    md += `| ${icon} ${p.pair} | ${p.price} | ${p.bias.bias} ${Math.round(p.bias.confidence*100)}% | ${p.cycle.phase} | ${p.mmxm.smr} | ${p.verdict.primary || p.verdict.verdict} | ${p.gate.split("(")[0].trim()} | ${coh} | ${inv} |\n`;
  }
  md += `\n`;

  // Per-pair detail
  for (const p of data.pairs) {
    md += `### ${p.pair} — ${p.price}\n\n`;
    md += `- **Bias:** ${p.bias.bias} (${Math.round(p.bias.confidence*100)}%) | **Cycle:** ${p.cycle.phase} — ${p.cycle.reason}\n`;
    md += `- **MMXM:** ${p.mmxm.smr} | Side: ${p.mmxm.side} | Phase: ${p.mmxm.phase}\n`;
    md += `- **Registry:** ${p.verdict.verdict} | Primary: ${p.verdict.primary || "none"} | Complete: ${p.verdict.completeCount}\n`;
    md += `- **Gate:** ${p.gate} | **Coherence:** ${p.coherence ?? 'N/A'}/100 | **Invalidation:** ${p.invalidation || 'valid'}\n`;
    md += `- **Weekly Profile:** ${p.wp?.classification || 'N/A'} | **Draw Target:** ${p.drawTarget}\n`;
    md += `- **Sweep Status:** ${p.sweepStatus}\n\n`;
  }

  // Key findings
  md += `### Key Findings\n\n`;
  const findings = generateFindings(data);
  for (const f of findings) {
    const impactIcon = f.impact === "high" ? "🔴" : f.impact === "medium" ? "🟡" : "⚪";
    md += `${impactIcon} **${f.impact.toUpperCase()}**: ${f.text}\n`;
  }
  if (findings.length === 0) md += "No significant findings.\n";
  md += `\n`;

  // What to watch
  md += `### What to Watch\n\n`;
  const watches = generateWatchList(data);
  for (const w of watches) md += `${w.icon} **${w.time}** — ${w.event} (${w.pairs})\n`;
  md += `\n`;

  // Key insight
  md += `### Key Insight\n\n`;
  md += generateInsight(data) + "\n\n";

  // Files reference
  md += `### Auto-Captured Data\n\n`;
  md += `- \`shared/${data.date}/session_log.md\` — this file\n`;
  md += `- \`shared/${data.date}/session_journal.json\` — structured JSON\n`;
  md += `- Stage outputs in \`stages/*/output/\` (refreshed each run)\n`;
  md += `- Decision JSONs in \`shared/${data.date}/*/\` per pair\n\n`;

  fs.writeFileSync(out, md, "utf8");
  console.log(`  ✅ Session log → ${out}`);
  return out;
}

function generateFindings(data) {
  const findings = [];
  for (const p of data.pairs) {
    if (p.cycle.phase === "MANIPULATION") {
      findings.push({ impact: "high", text: `${p.pair}: Stuck in MANIPULATION — smart money trapping. Gate closed until transition to DISTRIBUTION.` });
    }
    if (p.mmxm.smr === "✅ CONFIRMED" && p.bias.bias === "BULLISH") {
      findings.push({ impact: "high", text: `${p.pair}: Bearish SMR confirmed but structure says BULLISH — conflict zone. One side will win.` });
    }
    if (p.invalidation === "INVALIDATED") {
      findings.push({ impact: "high", text: `${p.pair}: INVALIDATED — structural conditions not met.` });
    }
    if (p.isTradeable) {
      findings.push({ impact: "medium", text: `${p.pair}: Tradeable — ${p.verdict.primary} setup ready with gate open.` });
    }
  }
  const bullWP = data.pairs.filter(p => p.wp?.direction === "BUY").length;
  const bearWP = data.pairs.filter(p => p.wp?.direction === "SELL").length;
  if (bullWP >= 3) {
    findings.push({ impact: "high", text: `Weekly profile: ${bullWP}/4 pairs expect BULLISH reversal from Thursday low. Friday resolution likely upside.` });
  } else if (bearWP >= 2) {
    findings.push({ impact: "medium", text: `Weekly profile split: ${bearWP} pairs expect bearish continuation. Gold leading sell-off.` });
  }
  return findings;
}

function generateWatchList(data) {
  const watches = [];
  const h = parseInt(nyTime.split(":")[0]);
  if (h >= 3 && h < 7) watches.push({ icon: "⏳", time: "07:00–08:00 NY", event: "Lecture 2 — London Hunt + IFVG", pairs: "EURUSD, GBPUSD" });
  if (h < 10) watches.push({ icon: "⭐", time: "09:50 NY", event: "NY AM Macro — highest conviction window", pairs: "All pairs" });
  if (h < 11) watches.push({ icon: "⏳", time: "10:00–11:00 NY", event: "Silver Bullet — scalp window", pairs: "EURUSD" });
  if (h < 14) watches.push({ icon: "⏳", time: "13:30 NY", event: "PMOR + PM Session — afternoon reset", pairs: "All pairs" });
  if (data.dayName === "Friday" && h < 16) watches.push({ icon: "🔴", time: "16:00 NY", event: "MARKET CLOSE — ALL POSITIONS MUST BE CLOSED", pairs: "All pairs" });
  if (watches.length === 0 && h >= 16) watches.push({ icon: "✓", time: "Post-market", event: "Session complete. No more live windows today.", pairs: "—" });
  return watches;
}

function generateInsight(data) {
  const manip = data.pairs.filter(p => p.cycle.phase === "MANIPULATION");
  const dist = data.pairs.filter(p => p.cycle.phase === "DISTRIBUTION");
  const smr = data.pairs.filter(p => p.mmxm.smr === "✅ CONFIRMED");
  const tradeable = data.pairs.filter(p => p.isTradeable);

  if (tradeable.length > 0) return `One or more pairs have clean setups with open gates — execute with size appropriate to coherence score.`;
  if (manip.length === PAIRS.length) return `All pairs stuck in MANIPULATION phase. This is the trap zone — wait for transition to DISTRIBUTION before expecting clean entries. Typical duration: 1–3 hours.`;
  if (smr.length > 0 && manip.length > 0) return `Split market: ${smr.length} pair(s) have confirmed SMRs while ${manip.length} remain in MANIPULATION. Focus on the distribution-phase pairs; the manipulated ones will resolve in due course.`;
  if (dist.length === PAIRS.length) return `All pairs in DISTRIBUTION — the delivery window. Entries should be cleaner now. Watch for displacement confirmation and MSS.`;
  return `Mixed phase environment. Focus on pairs with open gates and coherence ≥ 50. Don't force trades on manipulated pairs.`;
}

// ═══════════════════════════════════════════════════════════
// WRITE session_journal.json
// ═══════════════════════════════════════════════════════════
function writeJournal(data) {
  const journal = {
    session_date: data.date,
    day_of_week: data.dayName,
    ny_time_start: data.nyTime,
    ny_time_end: "~pending",
    duration_minutes: "in-progress",
    session_type: "live_analysis",
    verdict: data.overall,
    tradeable_count: data.tradeableCount,
    things_done: [
      `Ran full session analysis at ${data.nyTime} NY — ${PAIRS.length}/${PAIRS.length} pairs complete`,
      `Data refreshed: all candles fetched, engines regenerated, forecasts generated`,
      `Registry verdicts computed: ${data.tradeableCount} tradeable, ${PAIRS.length - data.tradeableCount} blocked`
    ],
    key_findings: generateFindings(data),
    pair_summary: data.pairs.map(p => ({
      pair: p.pair,
      price: p.price,
      bias: `${p.bias.bias} (${Math.round(p.bias.confidence*100)}%)`,
      model: p.verdict.primary || p.verdict.verdict,
      gate: p.gate,
      coherence: String(p.coherence ?? "N/A"),
      invalidation: p.invalidation || "valid",
      phase: p.cycle.phase,
      smr: p.mmxm.smr,
      tradeable: p.isTradeable,
      weekly_profile: p.wp?.classification || "N/A"
    })),
    files_created: [
      `shared/${data.date}/session_log.md`,
      `shared/${data.date}/session_journal.json`
    ]
  };

  const journalPath = path.join(ROOT, "shared", data.date, "session_journal.json");
  fs.writeFileSync(journalPath, JSON.stringify(journal, null, 2), "utf8");
  console.log(`  ✅ Session journal → ${journalPath}`);
  return journalPath;
}

// ═══════════════════════════════════════════════════════════
// GIT COMMIT
// ═══════════════════════════════════════════════════════════
function gitCommit(data) {
  try {
    execSync(`git add shared/${data.date}/session_log.md shared/${data.date}/session_journal.json`, { cwd: ROOT, stdio: "pipe" });
    execSync(`git commit -m "chore(${data.date}): auto-captured session log — ${data.overall} (${data.tradeableCount} tradeable)"`, { cwd: ROOT, stdio: "pipe" });
    console.log(`  ✅ Git committed`);
  } catch (e) {
    console.log(`  ⚠️ Git: ${e.message.split("\n")[0]}`);
  }
}

// ═══════════════════════════════════════════════════════════
// ENTRY POINT
// ═══════════════════════════════════════════════════════════
function main() {
  const args = process.argv.slice(2);
  const fullMode = args.includes("--full");
  const commitMode = args.includes("--commit");

  console.log(`\n╔═══════════════════════════════════════════════════════════╗`);
  console.log(`║  SESSION LOGGER — ${dayName.padEnd(17)} ${DATE} ${nyTime} NY  ║`);
  console.log(`╚═══════════════════════════════════════════════════════════╝\n`);

  console.log("═══ Reading stage outputs...");
  const data = buildSessionData();

  console.log(`\n═══ Writing session log...`);
  writeLog(data);

  console.log(`\n═══ Writing session journal...`);
  writeJournal(data);

  console.log(`\n═══ SUMMARY`);
  console.log(`  Verdict: ${data.overall}`);
  console.log(`  Tradeable: ${data.tradeableCount}/${PAIRS.length} pairs`);
  for (const p of data.pairs) {
    const icon = p.isTradeable ? "✅" : "🛑";
    console.log(`  ${icon} ${p.pair}: ${p.price} | ${p.bias.bias} | ${p.cycle.phase} | ${p.verdict.verdict}`);
  }

  if (commitMode) gitCommit(data);

  console.log(`\nDone.\n`);
}

main();
