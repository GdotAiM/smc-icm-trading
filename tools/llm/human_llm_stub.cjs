// human_llm_stub.cjs — Route LLM calls through Claude Code (this agent)
//
// USAGE:
//   node tools/llm/human_llm_stub.cjs <pair> [--date YYYY-MM-DD]
//
// This reads the same stage files that setup_auditor.cjs would assemble,
// runs the COT audit (HYPOTHESIS → EVIDENCE → COUNTER-EVIDENCE → VERDICT),
// and writes the result to shared/<date>/<PAIR>/setup_audit.json + .md
//
// The output format matches setup_auditor exactly so existing consumers work.

const fs = require("fs");
const path = require("path");

// ── Config ─────────────────────────────────────────────────────────────────────
const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..", "..");
const PER_FILE_CAP = 2500;
const DECISION_CAP = 4000;

const PRIORITY_FILES = [
  ["00_council_vote", "{pair}_coherence_audit.md", "council coherence audit"],
  ["00_macro_context", "{pair}_memory.md", "trade-graph memory snapshot"],
  ["01_htf_bias", "{pair}_bias.md", "HTF bias"],
  ["02_key_levels", "{pair}_levels.md", "key levels"],
  ["02_key_levels", "{pair}_irl_erl.md", "IRL/ERL liquidity"],
  ["03_session_time", "{pair}_session.md", "session time"],
  ["04_model_selection", "{pair}_active_models.md", "model selection"],
  ["05_entry_refinement", "{pair}_entry_plan.md", "entry plan"],
  ["05b_micro_confirmation", "{pair}_coherence.md", "coherence"],
  ["05b_micro_confirmation", "{pair}_inducement.md", "inducement gate"],
  ["05b_micro_confirmation", "{pair}_invalidation.md", "invalidation"],
  ["06_risk_management", "{pair}_risk_plan.md", "risk plan"],
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function compactDecision(decision) {
  if (!decision) return "[no decision.json found]";
  const out = {};
  for (const [k, v] of Object.entries(decision)) {
    if (["candles", "engine", "registryTraces", "raw"].includes(k)) continue;
    if (Array.isArray(v) && v.length > 40) out[k] = v.slice(0, 40) + `... (+${v.length - 40})`;
    else out[k] = v;
  }
  const text = JSON.stringify(out, null, 2);
  return text.length > DECISION_CAP ? text.slice(0, DECISION_CAP) + "\n...[truncated]" : text;
}

function readSafe(filepath) {
  try {
    if (!fs.existsSync(filepath)) return null;
    const content = fs.readFileSync(filepath, "utf8");
    return content.length > PER_FILE_CAP ? content.slice(0, PER_FILE_CAP) + "\n...[truncated]" : content;
  } catch (_) {
    return null;
  }
}

function readAllStageFiles(pair, date) {
  const sections = [];
  const P = pair.toUpperCase();
  let stageUsed = 0;

  sections.push(`## EMITTED DECISION`);
  const decisionPath = path.join(ROOT, "shared", date, P, "decision.json");
  let decision = null;
  if (fs.existsSync(decisionPath)) {
    try { decision = JSON.parse(fs.readFileSync(decisionPath, "utf8")); } catch (_) {}
  }
  sections.push(compactDecision(decision));

  for (const [stage, template, label] of PRIORITY_FILES) {
    if (stageUsed >= 15000) break;
    const filename = template.replace("{pair}", P.toLowerCase());
    const filepath = path.join(ROOT, "stages", stage, "output", filename);
    const content = readSafe(filepath);
    if (!content) continue;
    sections.push(`\n## STAGE: ${label}`);
    sections.push(content);
    stageUsed += content.length;
  }

  // Also pull engine reports for quick reference
  for (const tf of ["1h", "5m", "1m"]) {
    const ef = path.join(ROOT, "shared", date, P, `engine_${tf}.json`);
    if (fs.existsSync(ef)) {
      try {
        const d = JSON.parse(fs.readFileSync(ef, "utf8"));
        const st = d.structure || {};
        sections.push(`\n## ENGINE ${tf.toUpperCase()}: price=${d.price} bias=${st.bias} last=${st.lastEvent}@${st.lastEventPrice}`);
      } catch (_) {}
    }
  }

  // irl_erl summary
  const irlf = path.join(ROOT, "shared", date, P, "irl_erl.json");
  if (fs.existsSync(irlf)) {
    try {
      const d = JSON.parse(fs.readFileSync(irlf, "utf8"));
      const dr = d.dealingRange || {};
      sections.push(`\n## IRL/ERL: price=${d.currentPrice} zone=${dr.zone} posPct=${dr.positionPct}% midpoint=${dr.midpoint}`);
      // nearest SSL/BSL
      const liq = d.liquidity || [];
      for (const l of liq) {
        if (Math.abs(l.distance) < 2) {
          sections.push(`  ${l.type}: ${l.price.toFixed(4)} dist=${l.distance.toFixed(2)}% swept=${l.swept}`);
        }
      }
    } catch (_) {}
  }

  // one_trade_setup summary
  const otsf = path.join(ROOT, "shared", date, P, "one_trade_setup.json");
  if (fs.existsSync(otsf)) {
    try {
      const d = JSON.parse(fs.readFileSync(otsf, "utf8"));
      const db = d.dailyBias || {};
      const fo = d.firstOpp || {};
      sections.push(`\n## ONE TRADE SETUP: tradeable=${db.tradeable} bias=${db.bias} conf=${db.confidence}% zone=${db.pdZone} locked=${fo.locked} boost=${fo.directionBoost}x`);
      if (db.detail) sections.push(`  Detail: ${db.detail}`);
      if (fo.detail) sections.push(`  FirstOpp: ${fo.detail}`);
    } catch (_) {}
  }

  // setup_audit from previous run (if any)
  const prevAudit = path.join(ROOT, "shared", date, P, "setup_audit.json");
  if (fs.existsSync(prevAudit)) {
    try {
      const d = JSON.parse(fs.readFileSync(prevAudit, "utf8"));
      if (d.status !== "llm_unavailable") {
        sections.push(`\n## PREVIOUS AUDIT: verdict=${d.verdict} conf=${d.confidence} status=${d.status}`);
      }
    } catch (_) {}
  }

  return { sections: sections.join("\n\n"), decision };
}

// ── Audit runner (Claude-as-LLM) ───────────────────────────────────────────────

function runAudit(pair, date) {
  const P = pair.toUpperCase();
  console.error(`[human-llm] Running audit for ${P} on ${date}`);

  const { sections } = readAllStageFiles(P, date);
  const context = sections;

  // Build the system prompt (same as setup_auditor.buildSystemPrompt)
  const systemPrompt = `You are the SETUP AUDITOR for an SMC/ICT trading desk — a rigorous second-opinion reviewer that runs AFTER the deterministic pipeline has emitted a decision.

ROLE & BOUNDARIES:
- You are AUDIT-ONLY. You never place orders, never change parameters, and never block the deterministic gate. Your output is advisory evidence + reasoning.
- The deterministic pipeline is the authority. Your job is to stress-test the REASONING QUALITY of its decision, not to re-decide it.

REASONING CHAIN (MANDATORY): reason out loud, step by step, before any conclusion. Use exactly these four labelled stages:
1. HYPOTHESIS — state the claim, decision, or setup being evaluated, precisely and testably.
2. EVIDENCE — the specific data points, numbers, chunks, or stage outputs that support it. Cite them by name.
3. COUNTER-EVIDENCE — actively search for what contradicts or weakens it. Name the strongest counter-case explicitly. If there is genuinely none, write "none found".
4. VERDICT — your conclusion, in one sentence, clearly separated from the reasoning above.

A missing COUNTER-EVIDENCE scan is a failed answer — never skip stage 3.

FINAL OUTPUT — your last message MUST be a single valid JSON object (no markdown fences, no prose around it):
{
  "verdict": "ALIGNED" | "CHALLENGED" | "UNABLE",
  "confidence": <integer 0-100>,
  "evidence": ["<strings, citing specific stage files, graph lessons, or knowledge sources>"],
  "counterEvidence": ["<strings naming the strongest case AGAINST the decision>"],
  "recommendations": ["<specific, actionable strings>"],
  "reasoning": "<one concise paragraph running HYPOTHESIS -> EVIDENCE -> COUNTER-EVIDENCE -> VERDICT>"
}

GROUND RULES:
- ALIGNED: the decision is well supported by the evidence you read.
- CHALLENGED: you found a material gap, contradiction, or insufficient evidence.
- UNABLE: you could not gather enough evidence — say exactly what was missing.
- Cite file names (e.g. "02_key_levels/eurusd_irl_erl.md") in evidence/counterEvidence.
- Do not force a verdict. If the data is absent, CHALLENGED or UNABLE are honest answers.
- No trade instructions, no entry/SL/TP advice beyond what the decision already states.`;

  // Output the audit context so the calling agent can process it
  console.log("===AUDIT_CONTEXT_START===");
  console.log("SYSTEM:", systemPrompt);
  console.log("PAIR:", P);
  console.log("DATE:", date);
  console.log("CONTEXT:\n", context);
  console.log("===AUDIT_CONTEXT_END===");
}

// ── CLI ────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const pair = args[0]?.toUpperCase();
const dateIdx = args.indexOf("--date");
const date = dateIdx >= 0 ? args[dateIdx + 1] : new Date().toISOString().split("T")[0];

if (!pair) {
  console.error("Usage: node tools/llm/human_llm_stub.cjs <PAIR> [--date YYYY-MM-DD]");
  process.exit(1);
}

if (!/^[A-Z]{2,6}(USD|USDT)?$/i.test(pair)) {
  // Accept common symbols
  const normalized = pair.replace(/USD$/, "").replace(/USDT$/, "");
  if (!/^[A-Z0-9]{2,6}$/.test(normalized)) {
    console.error(`Unknown pair: ${pair}`);
    process.exit(1);
  }
}

runAudit(pair, date);
