// ICT Decision Validator — Phase 4: Rule Compliance Checker
// Validates agent trade decisions against ICT knowledge base rules

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const STAGES = path.join(ROOT, "stages");

// ═══════════════ ICT RULEBOOK ═══════════════
// Hard rules extracted from the knowledge base that must be validated
const ICT_RULES = {
  // Silver Bullet
  "silver-bullet": {
    windows: [
      { name: "London SB", start: "03:00", end: "04:00", tz: "NY" },
      { name: "NY AM SB", start: "10:00", end: "11:00", tz: "NY" },
      { name: "NY PM SB", start: "14:00", end: "15:00", tz: "NY" },
    ],
    rules: [
      { id: "SB-01", rule: "Entry ONLY during the 1-hour SB window", severity: "critical",
        check: (trade) => trade.sbWindowActive === true },
      { id: "SB-02", rule: "MSS (Market Structure Shift) required on 1m or 3m before entry", severity: "critical",
        check: (trade) => trade.mssConfirmed === true },
      { id: "SB-03", rule: "Displacement FVG must be present — entry on FVG retracement fill", severity: "critical",
        check: (trade) => trade.fvgEntry === true },
      { id: "SB-04", rule: "Entry in premium (shorts) or discount (longs) zone relative to dealing range", severity: "warning",
        check: (trade) => trade.pdZoneValid !== false },
      { id: "SB-05", rule: "Stop loss at structural invalidation — swing high/low + ATR buffer", severity: "critical",
        check: (trade) => trade.slStructural === true },
      { id: "SB-06", rule: "Take profit at opposing liquidity pool or minimum 1:1 R:R", severity: "warning",
        check: (trade) => (trade.rr >= 1.0) },
    ],
  },
  // Market Structure
  "market-structure": {
    rules: [
      { id: "MS-01", rule: "HTF bias (1W/1D/4H) must be clear — not neutral", severity: "critical",
        check: (trade) => trade.htfBias !== "neutral" },
      { id: "MS-02", rule: "1D and 4H must agree on direction", severity: "critical",
        check: (trade) => trade.bias1d === trade.bias4h },
      { id: "MS-03", rule: "Never trade against HTF bias without a higher-TF PD Array reason", severity: "critical",
        check: (trade) => trade.counterTrendOk === true || trade.alignedWithHTF === true },
      { id: "MS-04", rule: "Mark inducement inside the leg — wait for the sweep before entering", severity: "warning",
        check: (trade) => trade.inducementSwept !== false },
    ],
  },
  // Liquidity
  "liquidity": {
    rules: [
      { id: "LQ-01", rule: "Nearest BSL and SSL must be marked on 15m before entry", severity: "warning",
        check: (trade) => trade.liquidityMarked === true },
      { id: "LQ-02", rule: "Entry must target a draw on liquidity (opposing pool)", severity: "warning",
        check: (trade) => trade.liquidityTarget !== false },
      { id: "LQ-03", rule: "If a sweep just occurred, price will draw to the opposite side", severity: "info",
        check: (trade) => true }, // always informational
    ],
  },
  // Session / Time
  "session": {
    rules: [
      { id: "SS-01", rule: "No new entries during NY Lunch (11:00-13:00 NY) unless Lunch Reversal carry-forward model is active", severity: "warning",
        check: (trade) => trade.lunchEntry !== true || trade.model === "ny_lunch_reversal_short" || trade.model === "ny_lunch_reversal_long" },
      { id: "SS-02", rule: "Killzone must be active for trade entry (Asia, London, NY AM, NY PM)", severity: "warning",
        check: (trade) => trade.killzoneActive === true },
      { id: "SS-03", rule: "Monday — weekly range not established; reduce size", severity: "info",
        check: (trade) => true },
      { id: "SS-04", rule: "Friday — close all positions by NY close; no weekend holds", severity: "warning",
        check: (trade) => trade.fridayHold !== true },
    ],
  },
  // Risk Management
  "risk": {
    rules: [
      { id: "RK-01", rule: "Risk per trade must not exceed 1-2% of account", severity: "critical",
        check: (trade) => trade.riskPct <= 2 },
      { id: "RK-02", rule: "R:R must be ≥ 1:1 minimum", severity: "critical",
        check: (trade) => trade.rr >= 1.0 },
      { id: "RK-03", rule: "SL at structural invalidation — NOT at liquidity pools", severity: "critical",
        check: (trade) => trade.slStructural === true },
      { id: "RK-04", rule: "Daily loss limit enforced — stop trading after hitting limit", severity: "critical",
        check: (trade) => trade.dailyLossLimitHit !== true },
    ],
  },
  // Power of 3 / AMD
  "power-of-3": {
    rules: [
      { id: "P3-01", rule: "AMD model only works with clear daily bias", severity: "warning",
        check: (trade) => trade.htfBias !== "neutral" },
      { id: "P3-02", rule: "Do not enter during accumulation phase — wait for manipulation sweep", severity: "warning",
        check: (trade) => trade.po3Phase !== "accumulation" || trade.po3Validated === true },
      { id: "P3-03", rule: "Distribution is the only phase that pays — prioritize distribution entries", severity: "info",
        check: (trade) => true },
    ],
  },
  // Intraday Profiles
  "intraday-profiles": {
    rules: [
      { id: "IP-01", rule: "CBDR must be less than 40 pips for valid intraday profile", severity: "warning",
        check: (trade) => trade.cbdrValid !== false },
      { id: "IP-02", rule: "Asian range must be 20-30 pips for valid profile", severity: "info",
        check: (trade) => trade.asianRangeValid !== false },
      { id: "IP-03", rule: "Degraded profile (CBDR > 40) → reduce size by 50% or skip", severity: "warning",
        check: (trade) => trade.cbdrDegraded === true ? (trade.sizeMultiplier <= 0.5) : true },
    ],
  },
};

// ═══════════════ VALIDATOR ENGINE ═══════════════
function validateTrade(trade, activeModels) {
  const findings = [];
  const violations = [];
  const warnings = [];
  const info = [];

  const modelsToCheck = activeModels || ["silver-bullet", "market-structure", "liquidity", "session", "risk"];

  for (const modelName of modelsToCheck) {
    const model = ICT_RULES[modelName];
    if (!model) continue;

    for (const rule of model.rules) {
      let passed = false;
      try {
        passed = rule.check(trade);
      } catch (e) {
        passed = null; // can't evaluate
      }

      const finding = {
        model: modelName,
        ruleId: rule.id,
        rule: rule.rule,
        severity: rule.severity,
        passed,
      };

      findings.push(finding);

      if (passed === false) {
        if (rule.severity === "critical") violations.push(finding);
        else if (rule.severity === "warning") warnings.push(finding);
        else info.push(finding);
      }
    }
  }

  const blocked = violations.length > 0;
  const caution = warnings.length > 0;

  return {
    blocked,
    caution,
    verdict: blocked ? "BLOCKED — Critical ICT rules violated" :
             caution ? "CAUTION — Warnings present. Trade with reduced confidence." :
             "VALID — All ICT rules satisfied",
    violations,
    warnings,
    info,
    totalRules: findings.length,
    passedRules: findings.filter(f => f.passed === true).length,
    failedRules: findings.filter(f => f.passed === false).length,
    uncheckedRules: findings.filter(f => f.passed === null).length,
    compliancePct: Math.round((findings.filter(f => f.passed !== false).length / findings.length) * 100),
  };
}

// ═══════════════ TRADE EXTRACTION ═══════════════
function extractTradeFromStages(pair) {
  const pairLabel = pair.toLowerCase();
  const trade = {
    pair: pair.toUpperCase(),
    htfBias: null,
    bias1d: null,
    bias4h: null,
    alignedWithHTF: null,
    sbWindowActive: null,
    mssConfirmed: null,
    fvgEntry: null,
    pdZoneValid: null,
    slStructural: null,
    rr: 0,
    riskPct: 1,
    liquidityMarked: null,
    liquidityTarget: null,
    killzoneActive: null,
    lunchEntry: null,
    fridayHold: null,
    dailyLossLimitHit: null,
    cbdrValid: null,
    asianRangeValid: null,
    cbdrDegraded: null,
    sizeMultiplier: 1,
    inducementSwept: null,
    counterTrendOk: null,
    po3Phase: null,
    po3Validated: null,
    entryPrice: 0,
    slPrice: 0,
    tp1Price: 0,
    tp2Price: 0,
    model: null,
    modelScore: 0,
    session: null,
  };

  try {
    // Read bias
    const biasFile = path.join(STAGES, "01_htf_bias", "output", `${pairLabel}_bias.md`);
    if (fs.existsSync(biasFile)) {
      const md = fs.readFileSync(biasFile, "utf8");
      const biasMatch = md.match(/\*\*(BEARISH|BULLISH|NEUTRAL)\*\*/);
      if (biasMatch) trade.htfBias = biasMatch[1].toLowerCase();

      // Extract individual TF biases
      const tfMatches = md.matchAll(/\|\s*(\d\w)\s*\|\s*(bearish|bullish|neutral)/gi);
      for (const m of tfMatches) {
        if (m[1].toUpperCase() === "1D") trade.bias1d = m[2].toLowerCase();
        if (m[1].toUpperCase() === "4H") trade.bias4h = m[2].toLowerCase();
      }
      trade.alignedWithHTF = trade.bias1d === trade.bias4h;
    }

    // Read entry plan
    const entryFile = path.join(STAGES, "05_entry_refinement", "output", `${pairLabel}_entry_plan.md`);
    if (fs.existsSync(entryFile)) {
      const md = fs.readFileSync(entryFile, "utf8");

      const rrMatch = md.match(/R:R TP1.*?([\d.]+):1/);
      if (rrMatch) trade.rr = parseFloat(rrMatch[1]);

      const entryMatch = md.match(/Entry\s*\|\s*([\d.]+)/);
      if (entryMatch) trade.entryPrice = parseFloat(entryMatch[1]);

      const slMatch = md.match(/SL\s*\|\s*([\d.]+)/);
      if (slMatch) trade.slPrice = parseFloat(slMatch[1]);

      const tp1Match = md.match(/TP1\s*\|\s*([\d.]+)/);
      if (tp1Match) trade.tp1Price = parseFloat(tp1Match[1]);

      trade.fvgEntry = md.includes("FVG") || md.includes("Fair Value Gap");
      trade.mssConfirmed = md.includes("MSS") || md.includes("Market Structure Shift");

      // Structural SL check
      trade.slStructural = /structural|swing high|swing low|invalidation/i.test(md);

      const checklistSection = md.match(/## Checklist([\s\S]*)/);
      if (checklistSection) {
        trade.killzoneActive = checklistSection[1].includes("Killzone active: ✓");
        trade.pdZoneValid = checklistSection[1].includes("OTE") || checklistSection[1].includes("premium") || checklistSection[1].includes("discount");
      }
    }

    // Read risk plan
    const riskFile = path.join(STAGES, "06_risk_management", "output", `${pairLabel}_risk_plan.md`);
    if (fs.existsSync(riskFile)) {
      const md = fs.readFileSync(riskFile, "utf8");
      const riskMatch = md.match(/Risk:\s*(\d+)%/);
      if (riskMatch) trade.riskPct = parseInt(riskMatch[1]);
    }

    // Read session
    const sessionFile = path.join(STAGES, "03_session_time", "output", `${pairLabel}_session.md`);
    if (fs.existsSync(sessionFile)) {
      const md = fs.readFileSync(sessionFile, "utf8");
      trade.killzoneActive = trade.killzoneActive || md.includes("ACTIVE");
      trade.sbWindowActive = md.includes("Silver Bullet") && (md.includes("✅") || md.includes("ACTIVE"));
      trade.session = md.match(/Session:\s*(.+)/)?.[1] || null;
      const lunchMatch = md.match(/Lunch|11:00|×0\.4/);
      if (lunchMatch) trade.lunchEntry = md.includes("Lunch") && md.includes("ACTIVE");
    }

    // Read model selection
    const modelFile = path.join(STAGES, "04_model_selection", "output", `${pairLabel}_active_models.md`);
    if (fs.existsSync(modelFile)) {
      const md = fs.readFileSync(modelFile, "utf8");
      const primaryMatch = md.match(/Primary:\s*(.+?)\s*\(/);
      if (primaryMatch) trade.model = primaryMatch[1].trim();
      const scoreMatch = md.match(/Primary:.*?\(([\d.]+)/);
      if (scoreMatch) trade.modelScore = parseFloat(scoreMatch[1]);
    }

    // Read macro context for Po3
    const po3File = path.join(STAGES, "00_macro_context", "output", `${pairLabel}_po3_state.md`);
    if (fs.existsSync(po3File)) {
      const md = fs.readFileSync(po3File, "utf8");
      const phaseMatch = md.match(/phase.*?(ACCUMULATION|MANIPULATION|DISTRIBUTION|EXPANSION)/i);
      if (phaseMatch) trade.po3Phase = phaseMatch[1].toLowerCase();
    }

    // Read intraday profile
    const profileFile = path.join(STAGES, "00_macro_context", "output", `${pairLabel}_intraday_profile.md`);
    if (fs.existsSync(profileFile)) {
      const md = fs.readFileSync(profileFile, "utf8");
      trade.cbdrValid = !md.includes("INVALID") && !md.includes("DEGRADED");
      trade.cbdrDegraded = md.includes("DEGRADED");
      trade.asianRangeValid = md.includes("Asian") && !md.includes("✗");
    }

  } catch (e) {
    // Partial extraction is fine
  }

  return trade;
}

// ═══════════════ STAGE HOOK GENERATOR ═══════════════
function generateStageHook(stageName, queries) {
  let hook = `\n## ICT Knowledge Reference\n\n`;
  hook += `Before writing this stage, query the ICT knowledge base:\n\n`;
  for (const q of queries) {
    hook += `\`\`\`bash\nnode tools/ict_rag.cjs --query "${q}"\n\`\`\`\n\n`;
  }
  hook += `Cite ICT sources in your output with the format: \`[ICT: concept-name.md]\`\n`;
  return hook;
}

// Stage-specific knowledge hooks
const STAGE_HOOKS = {
  "00_macro_context": [
    "ICT Power of 3 accumulation manipulation distribution phases",
    "ICT intraday profiles CBDR Asian range conditions",
    "How to determine daily bias using ICT",
  ],
  "01_htf_bias": [
    "ICT market structure break of structure BOS change of character CHOCH",
    "ICT top down analysis multi-timeframe approach",
    "ICT daily bias trick how to read daily chart",
  ],
  "02_key_levels": [
    "ICT order block identification bullish bearish",
    "ICT fair value gap FVG how to identify valid FVG",
    "ICT liquidity pool BSL SSL sweep detection",
    "ICT PD array premium discount zone identification",
  ],
  "03_session_time": [
    "ICT kill zones times session windows NY local time",
    "ICT Silver Bullet strategy times windows entry rules",
    "ICT macro time-based strategy session models",
  ],
  "04_model_selection": [
    "ICT Silver Bullet vs 2022 model vs Turtle Soup when to use each",
    "ICT MMXM market maker buy model sell model conditions",
    "ICT model selection criteria cycle phase alignment",
  ],
  "05_entry_refinement": [
    "ICT Silver Bullet entry trigger checklist FVG fill MSS",
    "ICT optimal trade entry OTE Fibonacci retracement zone",
    "ICT displacement FVG entry on retracement",
  ],
  "05b_micro_confirmation": [
    "ICT CISD change in state of delivery MSS confirmation",
    "ICT 1-minute entry trigger fractal MMXM nesting",
    "ICT SMT divergence correlated pair confirmation",
  ],
  "06_risk_management": [
    "ICT stop loss placement structural invalidation",
    "ICT risk management position sizing rules",
  ],
  "07_journal_review": [
    "ICT common mistakes Silver Bullet entry rules",
    "ICT intraday profile review post-session analysis",
  ],
};

// ═══════════════ MAIN ═══════════════
function main() {
  const args = process.argv.slice(2);
  const mode = args[0];

  if (!mode || mode === "--help") {
    console.log(`
ICT Decision Validator — Phase 4: Pipeline Integration
Usage:
  node tools/ict_decision_validator.cjs --validate [pair]   Validate trade against ICT rules
  node tools/ict_decision_validator.cjs --hook [stage]       Generate RAG query hooks for a stage
  node tools/ict_decision_validator.cjs --wire                Wire ICT hooks into all stage CONTEXT.md files
  node tools/ict_decision_validator.cjs --check [pair]        Quick pre-trade ICT compliance check

Examples:
  node tools/ict_decision_validator.cjs --validate GBPUSD
  node tools/ict_decision_validator.cjs --hook 04_model_selection
  node tools/ict_decision_validator.cjs --wire
`);
    return;
  }

  // ── Validate Trade ────────────────────────────────────
  if (mode === "--validate") {
    const pair = args[1] || "GBPUSD";
    console.log(`\n🔍 ICT Rule Compliance Check — ${pair.toUpperCase()}\n`);
    console.log("═".repeat(60));

    const trade = extractTradeFromStages(pair);
    console.log(`\nExtracted Trade:`);
    console.log(`  Bias: ${trade.htfBias?.toUpperCase()} | 1D: ${trade.bias1d} | 4H: ${trade.bias4h}`);
    console.log(`  Model: ${trade.model} (${trade.modelScore})`);
    console.log(`  Session: ${trade.session} | Killzone: ${trade.killzoneActive ? 'YES' : 'NO'}`);
    console.log(`  Entry: ${trade.entryPrice} | SL: ${trade.slPrice} | TP1: ${trade.tp1Price}`);
    console.log(`  R:R: ${trade.rr}:1 | Risk: ${trade.riskPct}%`);

    const activeModels = trade.model?.toLowerCase().includes("silver") ? ["silver-bullet", "market-structure", "liquidity", "session", "risk", "power-of-3"] :
                         trade.model?.toLowerCase().includes("mmxm") || trade.model?.toLowerCase().includes("2022") ? ["market-structure", "liquidity", "session", "risk", "power-of-3"] :
                         ["market-structure", "liquidity", "session", "risk"];

    const result = validateTrade(trade, activeModels);

    console.log(`\n${"═".repeat(60)}`);
    console.log(`VERDICT: ${result.verdict}`);
    console.log(`Compliance: ${result.compliancePct}% (${result.passedRules}/${result.totalRules} rules passed)`);

    if (result.violations.length > 0) {
      console.log(`\n❌ CRITICAL VIOLATIONS (${result.violations.length}):`);
      for (const v of result.violations) {
        console.log(`  [${v.ruleId}] ${v.rule}`);
      }
    }

    if (result.warnings.length > 0) {
      console.log(`\n⚠️  WARNINGS (${result.warnings.length}):`);
      for (const w of result.warnings) {
        console.log(`  [${w.ruleId}] ${w.rule}`);
      }
    }

    console.log(`\n${"═".repeat(60)}`);
    console.log(result.blocked ? "🛑 DO NOT ENTER — Fix critical violations first" :
                result.caution ? "⚠️  ENTER WITH CAUTION — Address warnings" :
                "✅ CLEARED — All ICT rules satisfied");
    return;
  }

  // ── Generate Stage Hook ───────────────────────────────
  if (mode === "--hook") {
    const stage = args[1];
    if (!stage || !STAGE_HOOKS[stage]) {
      console.log(`Stage "${stage}" not found. Available: ${Object.keys(STAGE_HOOKS).join(", ")}`);
      return;
    }
    const hook = generateStageHook(stage, STAGE_HOOKS[stage]);
    console.log(hook);
    return;
  }

  // ── Wire All Stages ───────────────────────────────────
  if (mode === "--wire") {
    console.log("Wiring ICT knowledge hooks into stage CONTEXT.md files...\n");

    for (const [stage, queries] of Object.entries(STAGE_HOOKS)) {
      const contextFile = path.join(STAGES, stage, "CONTEXT.md");
      if (!fs.existsSync(contextFile)) {
        console.log(`  ⚠️  ${stage}/CONTEXT.md — not found, skipping`);
        continue;
      }

      let content = fs.readFileSync(contextFile, "utf8");

      // Check if already wired
      if (content.includes("## ICT Knowledge Reference")) {
        console.log(`  ✓ ${stage}/CONTEXT.md — already wired`);
        continue;
      }

      const hook = generateStageHook(stage, queries);
      content += hook;
      fs.writeFileSync(contextFile, content);
      console.log(`  ✓ ${stage}/CONTEXT.md — ${queries.length} RAG hooks added`);
    }

    console.log(`\nDone. All existing stage CONTEXT.md files now include ICT knowledge hooks.`);
    return;
  }

  // ── Quick Pre-Trade Check ─────────────────────────────
  if (mode === "--check") {
    const pair = args[1] || "GBPUSD";
    const trade = extractTradeFromStages(pair);

    console.log(`\n📋 ICT Pre-Trade Checklist — ${pair.toUpperCase()}\n`);
    console.log("═".repeat(50));

    const checks = [
      { label: "HTF Bias Clear", pass: trade.htfBias !== "neutral" && trade.htfBias !== null, critical: true },
      { label: "1D/4H Aligned", pass: trade.alignedWithHTF === true, critical: true },
      { label: "Killzone Active", pass: trade.killzoneActive === true, critical: false },
      { label: "SB Window Active", pass: trade.sbWindowActive === true, critical: false },
      { label: "MSS Confirmed", pass: trade.mssConfirmed === true, critical: true },
      { label: "FVG Entry", pass: trade.fvgEntry === true, critical: false },
      { label: "R:R >= 1:1", pass: trade.rr >= 1.0, critical: true },
      { label: "SL Structural", pass: trade.slStructural === true, critical: true },
      { label: "Risk <= 2%", pass: trade.riskPct <= 2, critical: true },
      { label: "Not Lunch Entry", pass: trade.lunchEntry !== true, critical: false },
    ];

    let passedAll = true;
    for (const c of checks) {
      const icon = c.pass ? "✅" : c.critical ? "❌" : "⚠️";
      if (!c.pass && c.critical) passedAll = false;
      console.log(`  ${icon} ${c.label}${c.critical ? ' *' : ''}`);
    }

    console.log(`\n${"═".repeat(50)}`);
    console.log(passedAll ? "✅ READY — All critical checks passed" : "❌ NOT READY — Critical checks failed");
    return;
  }

  console.log(`Unknown mode: ${mode}. Use --help.`);
}

main();
