// setup_auditor.cjs — Audit-only LLM second-opinion layer for pipeline decisions
//
// PHILOSOPHY
//   The deterministic gate is the authority. This agent NEVER gates, never
//   places orders, never blocks, and never modifies the decision. It runs
//   AFTER decision emission, reads the emitted decision + stage outputs +
//   trade-graph memory + ICT knowledge base, reasons out loud
//   (HYPOTHESIS → EVIDENCE → COUNTER-EVIDENCE → VERDICT), and writes an
//   optional second opinion to shared/<date>/<PAIR>/setup_audit.{json,md}.
//
//   Any LLM failure degrades gracefully to a recorded "unavailable" report —
//   the pipeline outcome is byte-for-byte identical either way.
//
// ARCHITECTURE
//   - ReAct agent loop from llm_client.agentLoop()
//   - Tools: read_file (sandboxed), query_trade_graph, query_ict_knowledge
//   - Injectable `client` for tests; `--dry-run` builds context + prints tools
//     without calling the LLM.
//
// Usage:
//   node tools/llm/setup_auditor.cjs EURUSD              # today (or decision date)
//   node tools/llm/setup_auditor.cjs EURUSD --date 2026-08-11 --provider cerebras
//   node tools/llm/setup_auditor.cjs EURUSD --dry-run    # no LLM call
//   node tools/llm/setup_auditor.cjs EURUSD --max-iterations 6

const path = require("path");
const fs = require("fs");
const { agentLoop, safeJsonParse } = require("./llm_client.cjs");
const { loadActiveLessons, formatMemoryMarkdown } = require("./memory_lessons.cjs");
const { COT_CHAIN } = require("./llm_prompts.cjs");
const { loadProjectEnv } = require("./load_env.cjs");

loadProjectEnv();

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..", "..");

const ALLOWED_BASES = ["stages", "_config", "shared", path.join("tools", "llm")];

// Stage outputs that feed a decision, in priority order. Each is prefixed with
// a short label so evidence citations can name the file. "{pair}" is substituted
// with the actual pair symbol.
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

const PER_FILE_CAP = 2500;
const TOTAL_STAGE_CAP = 15000;
const DECISION_CAP = 4000;

// ── Context assembly ───────────────────────────────────────────────────────────

function decisionDate(pair, date, root = ROOT) {
  if (date) return date;
  const P = String(pair || "").toUpperCase();
  const ny = require("../ny_time.cjs");
  for (let i = 0; i < 7; i++) {
    const d = ny.getNYDateFor(Date.now() - i * 86400000);
    if (fs.existsSync(path.join(root, "shared", d, P, "decision.json"))) return d;
  }
  return ny.getNYDate();
}

// Compact a decision object: strip bulky fields, keep the reasoning-relevant ones.
function compactDecision(decision) {
  if (!decision) return null;
  const out = {};
  for (const [k, v] of Object.entries(decision)) {
    if (["candles", "engine", "registryTraces", "raw"].includes(k)) continue;
    if (Array.isArray(v) && v.length > 40) out[k] = v.slice(0, 40) + `… (+${v.length - 40})`;
    else out[k] = v;
  }
  const text = JSON.stringify(out, null, 2);
  return text.length > DECISION_CAP ? text.slice(0, DECISION_CAP) + "\n…[truncated]" : text;
}

function buildContext({ pair, date, root = ROOT }) {
  const P = pair.toUpperCase();
  const sharedDir = path.join(root, "shared", date, P);
  const decisionPath = path.join(sharedDir, "decision.json");

  let decision = null;
  if (fs.existsSync(decisionPath)) {
    try {
      decision = JSON.parse(fs.readFileSync(decisionPath, "utf8"));
    } catch (_) {
      decision = null;
    }
  }

  const sections = [];
  sections.push(`## Emitted Decision (${decisionPath})`);
  sections.push(decision ? compactDecision(decision) : "[no decision.json found — audit may still review stage outputs]");

  // Priority stage files, priority order, capped total.
  let stageUsed = 0;
  const stageFiles = [];
  for (const [stage, file, label] of PRIORITY_FILES) {
    if (stageUsed >= TOTAL_STAGE_CAP) break;
    const fileName = file.split("{pair}").join(P);
    const base = path.join(root, "stages", stage, "output", fileName);
    if (!fs.existsSync(base)) continue;
    let content = fs.readFileSync(base, "utf8");
    if (content.length > PER_FILE_CAP) content = content.slice(0, PER_FILE_CAP) + "\n…[truncated]";
    stageFiles.push(`stages/${stage}/output/${fileName}`);
    sections.push(`\n## Stage file: stages/${stage}/output/${fileName} (${label})`);
    sections.push(content);
    stageUsed += content.length;
  }

  // Index of ALL available stage outputs (for the read_file tool).
  const index = [];
  const stagesRoot = path.join(root, "stages");
  if (fs.existsSync(stagesRoot)) {
    for (const stage of fs.readdirSync(stagesRoot)) {
      const out = path.join(stagesRoot, stage, "output");
      if (!fs.existsSync(out)) continue;
      for (const f of fs.readdirSync(out)) {
        if (f.toLowerCase().startsWith(P.toLowerCase()) && f.endsWith(".md")) {
          const abs = path.join(out, f);
          index.push(`${path.relative(root, abs)} (${(fs.statSync(abs).size / 1024).toFixed(1)}K)`);
        }
      }
    }
  }
  sections.push(`\n## Available stage files for ${P} (read via tool)\n${index.slice(0, 60).join("\n") || "(none)"}`);

  const mem = loadActiveLessons({ pair: P, limit: 10 });
  const memText = formatMemoryMarkdown(mem);
  if (memText) sections.push(`\n## Live trade-graph memory\n${memText}`);
  if (mem && mem.error && !memText) sections.push(`\n## Trade-graph memory\n[${mem.error}]`);

  return { context: sections.join("\n\n").slice(0, 40000), decision, stageFiles };
}

// ── Knowledge tool ────────────────────────────────────────────────────────────

function searchKnowledge(query, limit = 5, root = ROOT) {
  const taxPath = path.join(root, "references", "ict_knowledge", "taxonomy.json");
  if (!fs.existsSync(taxPath)) return [];
  let tax;
  try {
    tax = JSON.parse(fs.readFileSync(taxPath, "utf8"));
  } catch (_) {
    return [];
  }
  const q = String(query || "").toLowerCase().trim();
  if (!q) return [];
  const terms = q.split(/\s+/).filter((t) => t.length > 2);
  const scored = [];
  for (const [id, c] of Object.entries(tax)) {
    const hay = [c.title, c.category, c.tierName, c.excerpt, (c.tags || []).join(" ")]
      .join(" ")
      .toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (hay.includes(t)) score += 1;
    }
    if (String(id).toLowerCase().includes(q)) score += 3;
    if (String(c.title || "").toLowerCase().includes(q)) score += 2;
    if (score > 0) {
      scored.push({
        id,
        title: c.title,
        tier: c.tierName || `T${c.tier ?? "?"}`,
        score,
        excerpt: (c.excerpt || "").replace(/\s+/g, " ").slice(0, 400),
      });
    }
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score, ...rest }) => rest);
}

// ── Tool definitions + dispatch ───────────────────────────────────────────────

const TOOL_DEFS = [
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "Read a text file from the workspace. Path is relative to repo root and must start with stages/, _config/, or shared/ (e.g. stages/01_htf_bias/output/eurusd_bias.md). Returns up to 6000 chars.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "repo-relative file path" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_trade_graph",
      description:
        "Load active lessons and unresolved knowledge gaps for a pair from the persistent trade graph.",
      parameters: {
        type: "object",
        properties: { pair: { type: "string", description: "e.g. EURUSD" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_ict_knowledge",
      description:
        "Keyword-search the 138-concept ICT knowledge base (taxonomy.json) for a concept.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "e.g. silver bullet inducement" } },
        required: ["query"],
      },
    },
  },
];

function buildDispatch({ root }) {
  return {
    async read_file(args) {
      const rel = String(args.path || "");
      const norm = path.normalize(rel).replace(/^[\\/]+/, "");
      if (path.isAbsolute(norm)) return "[error: absolute paths are not allowed]";
      const base =
        norm.split(path.sep)[0] === "llm"
          ? "tools/llm"
          : norm.split(path.sep)[0] === "tools"
            ? "tools"
            : norm.split(path.sep)[0];
      if (!ALLOWED_BASES.includes(base)) {
        return `[error: path must start with ${ALLOWED_BASES.join(" or ")}]`;
      }
      const abs = path.join(root, norm);
      if (!fs.existsSync(abs)) return `[error: file not found: ${norm}]`;
      if (!fs.statSync(abs).isFile()) return `[error: not a file: ${norm}]`;
      let content;
      try {
        content = fs.readFileSync(abs, "utf8");
      } catch (e) {
        return `[error reading: ${e.message}]`;
      }
      return content.length > 6000 ? content.slice(0, 6000) + "\n…[truncated]" : content;
    },
    async query_trade_graph(args) {
      const mem = loadActiveLessons({ pair: String(args.pair || "").toUpperCase(), limit: 10 });
      return formatMemoryMarkdown(mem) || "[no active lessons or unresolved gaps for this pair in the trade graph]";
    },
    async query_ict_knowledge(args) {
      const hits = searchKnowledge(args.query, 5, root);
      if (!hits.length) return "[no knowledge-base matches]";
      return hits.map((h) => `- [${h.id}] (${h.tier}) ${h.title}\n  ${h.excerpt}`).join("\n");
    },
  };
}

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt() {
  return `You are the SETUP AUDITOR for an SMC/ICT trading desk — a rigorous second-opinion reviewer that runs AFTER the deterministic pipeline has emitted a decision.

ROLE & BOUNDARIES:
- You are AUDIT-ONLY. You never place orders, never change parameters, and never block the deterministic gate. Your output is advisory evidence + reasoning.
- The deterministic pipeline is the authority. Your job is to stress-test the REASONING QUALITY of its decision, not to re-decide it.
${COT_CHAIN}

FINAL OUTPUT — your last message MUST be a single valid JSON object (no markdown fences, no prose around it):
{
  "verdict": "ALIGNED" | "CHALLENGED" | "UNABLE",
  "confidence": <integer 0-100>,
  "evidence": ["<strings, citing specific stage files, graph lessons, or knowledge sources>"],
  "counterEvidence": ["<strings naming the strongest case AGAINST the decision>"],
  "recommendations": ["<specific, actionable strings>"],
  "reasoning": "<one concise paragraph running HYPOTHESIS → EVIDENCE → COUNTER-EVIDENCE → VERDICT>"
}

GROUND RULES:
- ALIGNED: the decision is well supported by the evidence you read.
- CHALLENGED: you found a material gap, contradiction, or insufficient evidence.
- UNABLE: you could not gather enough evidence — say exactly what was missing.
- Cite file names (e.g. "02_key_levels/eurusd_irl_erl.md") in evidence/counterEvidence.
- Do not force a verdict. If the data is absent, CHALLENGED or UNABLE are honest answers.
- No trade instructions, no entry/SL/TP advice beyond what the decision already states.`;
}

// ── Runner ────────────────────────────────────────────────────────────────────

/**
 * Run the setup audit for a pair.
 * @param {Object}   opts
 * @param {string}   opts.pair             - e.g. "EURUSD"
 * @param {string}   [opts.date]           - shared/<date> directory (default: decision's date or most recent)
 * @param {number}   [opts.maxIterations]  - default 6
 * @param {string}   [opts.provider]       - LLM provider override
 * @param {string}   [opts.model]          - LLM model override
 * @param {Function} [opts.client]         - injectable client for tests (default llm_client.chatCompletion)
 * @param {Function} [opts.log]            - optional logger
 * @returns {Promise<{pair,date,status,verdict,confidence,evidence,counterEvidence,recommendations,reasoning,iterations,trace,context,error?,sharedDir,file}>}
 */
async function runAudit({ pair, date, maxIterations = 6, provider, model, client, log = null }) {
  const P = String(pair || "").toUpperCase();
  if (!P) return { status: "no_pair" };

  const resolvedDate = decisionDate(P, date, ROOT);
  const { context, decision } = buildContext({ pair: P, date: resolvedDate, root: ROOT });
  const sharedDir = path.join(ROOT, "shared", resolvedDate, P);

  const clientFn = client || require("./llm_client.cjs").chatCompletion;
  const dispatch = buildDispatch({ root: ROOT });

  const llmOpts = { provider, model, maxTokens: 4000, temperature: 0.2, timeout: 240000 };
  if (provider) llmOpts.provider = provider;
  if (model) llmOpts.model = model;

    const initialMessages = [
    { role: "system", content: buildSystemPrompt() },
    {
      role: "user",
      content: `Audit the following decision for ${P} (date ${resolvedDate}). Use the tools to verify claims before finalizing your JSON verdict.\n\n${context}`,
    },
  ];

  let result = await agentLoop({
    messages: initialMessages,
    tools: TOOL_DEFS,
    toolDispatch: dispatch,
    llmOpts,
    maxIterations,
    client: clientFn,
    log,
  });

  // Provider resilience: some providers (e.g. Gemini thinking models) reject
  // tool calls with a 400. Retry ONCE without tools — the context above already
  // inlines the decision, 12 priority stage files, graph memory, and a file
  // index, so a verdict is still producible from context alone.
  let toolsUsed = true;
  if (result.status === "llm_unavailable" && /tool|function|400|400:|invalid/i.test(result.text)) {
    toolsUsed = false;
    if (log) log("setup_auditor: tool-calling unavailable — retrying without tools");
    result = await agentLoop({
      messages: [
        ...initialMessages,
        {
          role: "user",
          content:
            "NOTE: tool calling is unavailable on this provider. Produce your JSON verdict using ONLY the context provided above. If you would have read additional files, name them in counterEvidence but do not let that block a verdict.",
        },
      ],
      tools: [],
      toolDispatch: {},
      llmOpts,
      maxIterations: 1,
      client: clientFn,
      log,
    });
  }

  fs.mkdirSync(sharedDir, { recursive: true });

  let parsed = null;
  if (result.status === "complete" || result.status === "max_iterations") {
    parsed = safeJsonParse(result.text, null);
  }
  // A parsed block without a verdict field is NOT a valid audit (the model often
  // embeds an unrelated {...} brace block from prose examples) — treat it as a
  // parse failure so the strict re-ask fires.
  if (parsed && typeof parsed.verdict !== "string") {
    parsed = null;
  }

  // Strict JSON recovery: if the model produced prose instead of the schema,
  // re-ask for ONLY the JSON at temperature 0 (bounded to one extra call).
  if (!parsed && (result.status === "complete" || result.status === "max_iterations")) {
    if (log) log("setup_auditor: verdict not JSON — strict re-ask");
    const retryResp = await clientFn(
      [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: `Audit this decision for ${P} (${resolvedDate}).\n\n${context}` },
        {
          role: "user",
          content:
            'Return ONLY a single JSON object — no markdown fences, no prose, nothing else: {"verdict":"ALIGNED"|"CHALLENGED"|"UNABLE","confidence":0,"evidence":[""],"counterEvidence":[""],"recommendations":[""],"reasoning":""}',
        },
      ],
      { ...llmOpts, maxTokens: 4000, temperature: 0 },
    );
    parsed = safeJsonParse(retryResp.text, null);
    if (parsed) result.text = retryResp.text;
  }

  const audit = {
    pair: P,
    date: resolvedDate,
    emittedAt: new Date().toISOString(),
    provider: provider || "default",
    toolsUsed,
    status: parsed ? "ok" : result.status,
    iterations: result.trace.length ? Math.ceil(result.trace.length / 2) : 0,
    verdict: parsed?.verdict || null,
    confidence: typeof parsed?.confidence === "number" ? parsed.confidence : null,
    evidence: Array.isArray(parsed?.evidence) ? parsed.evidence : [],
    counterEvidence: Array.isArray(parsed?.counterEvidence) ? parsed.counterEvidence : [],
    recommendations: Array.isArray(parsed?.recommendations) ? parsed.recommendations : [],
    reasoning: typeof parsed?.reasoning === "string" ? parsed.reasoning : "",
    rawText: result.status === "llm_unavailable" ? result.text.slice(0, 200) : (result.text || "").slice(0, 2000),
    toolTrace: result.trace.map((t) =>
      t.tool ? { tool: t.tool, args: t.args } : { iteration: t.iteration, llm: true },
    ),
  };

  // Write artifacts.
  const jsonPath = path.join(sharedDir, "setup_audit.json");
  const mdPath = path.join(sharedDir, "setup_audit.md");
  try {
    fs.writeFileSync(jsonPath, JSON.stringify(audit, null, 2), "utf8");
    fs.writeFileSync(mdPath, formatMarkdown(audit), "utf8");
  } catch (e) {
    audit.writeError = e.message;
  }
  if (log) log(`setup_auditor: verdict=${audit.verdict || audit.status} → ${jsonPath}`);

  return { ...audit, sharedDir, file: jsonPath, context, decision };
}

function formatMarkdown(a) {
  const lines = [];
  lines.push(`# Setup Audit — ${a.pair} (${a.date})`);
  lines.push("");
  lines.push(`- **Verdict:** ${a.verdict || "—"} ${a.verdict ? `(confidence ${a.confidence ?? "?"}/100)` : ""}`);
  lines.push(`- **Status:** ${a.status}`);
  lines.push(`- **Iterations:** ${a.iterations}`);
  lines.push("");
  if (a.evidence.length) {
    lines.push("## Evidence");
    a.evidence.forEach((e) => lines.push(`- ${e}`));
    lines.push("");
  }
  if (a.counterEvidence.length) {
    lines.push("## Counter-Evidence");
    a.counterEvidence.forEach((e) => lines.push(`- ${e}`));
    lines.push("");
  }
  if (a.recommendations.length) {
    lines.push("## Recommendations");
    a.recommendations.forEach((e) => lines.push(`- ${e}`));
    lines.push("");
  }
  if (a.reasoning) {
    lines.push("## Reasoning");
    lines.push(a.reasoning);
    lines.push("");
  }
  if (a.rawText && !a.verdict) {
    lines.push("## Raw response");
    lines.push("```");
    lines.push(a.rawText);
    lines.push("```");
  }
  return lines.join("\n");
}

// ── CLI ────────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const pair = (args.find((a) => !a.startsWith("-")) || "").toUpperCase();
  const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

  if (!pair || args.includes("--help")) {
    console.log(`Usage: node tools/llm/setup_auditor.cjs <PAIR> [options]
  --date <YYYY-MM-DD>    shared date dir (default: decision's date or most recent)
  --provider <name>      LLM provider (gemini|cerebras|groq|...)
  --model <name>         model override
  --max-iterations <n>   ReAct loop cap (default 6)
  --dry-run              build context + print tool defs, no LLM call`);
    return;
  }

  const dryRun = args.includes("--dry-run");
  const opts = {
    pair,
    date: flag("--date"),
    provider: flag("--provider"),
    model: flag("--model"),
    maxIterations: Number(flag("--max-iterations")) || 6,
  };

  if (dryRun) {
    const { context, stageFiles } = buildContext({ pair, date: opts.date, root: ROOT });
    console.log(`PAIR=${pair} DATE=${decisionDate(pair, opts.date)} CONTEXT_CHARS=${context.length}`);
    console.log(`STAGE_FILES_LOADED=${stageFiles.length}`);
    console.log("\n--- TOOLS ---");
    TOOL_DEFS.forEach((t) => console.log(`  ${t.function.name}`));
    console.log("\n--- CONTEXT (first 2000 chars) ---");
    console.log(context.slice(0, 2000));
    return;
  }

  runAudit(opts)
    .then((r) => {
      console.log(`\nSetup audit ${pair}: ${r.verdict || r.status} (confidence ${r.confidence ?? "n/a"})`);
      console.log(`→ ${r.file}`);
      if (r.counterEvidence.length) {
        console.log("\nCounter-evidence:");
        r.counterEvidence.forEach((c) => console.log(`  - ${c}`));
      }
      if (r.recommendations.length) {
        console.log("\nRecommendations:");
        r.recommendations.forEach((c) => console.log(`  - ${c}`));
      }
    })
    .catch((e) => {
      console.error("Setup auditor failed:", e.message);
      process.exit(1);
    });
}

// ── Exports ────────────────────────────────────────────────────────────────────

module.exports = {
  runAudit,
  buildContext,
  buildDispatch,
  searchKnowledge,
  compactDecision,
  decisionDate,
  TOOL_DEFS,
  buildSystemPrompt,
  ROOT,
};

if (require.main === module) {
  main();
}