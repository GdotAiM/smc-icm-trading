// LLM-as-Judge — Scores trading analysis quality using the rubric
// Usage: node evaluation/judge/llm_judge.cjs [PAIR] [DATE]
// Uses: any available LLM (Claude API, Ollama, or rule-based fallback)

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const PAIR = process.argv[2] || "XAUUSD";
const DATE = process.argv[3] || require("../../tools/ny_time.cjs").getNYDate();

// ═══ LOAD RUBRIC ═══
const RUBRIC_PATH = path.join(__dirname, "rubric.md");
const rubric = fs.existsSync(RUBRIC_PATH) ? fs.readFileSync(RUBRIC_PATH, "utf8") : "";

// ═══ COLLECT ANALYSIS OUTPUTS ═══
function collectAnalysis() {
  const pairLabel = PAIR.toLowerCase();
  const files = [];

  const stagePatterns = [
    { stage: "00_macro_context", files: ["day_context.md", `${pairLabel}_ipda.md`, `${pairLabel}_weekly_profile.md`, `${pairLabel}_one_trade_setup.md`, `${pairLabel}_mmxm.md`] },
    { stage: "01_htf_bias", files: [`${pairLabel}_bias.md`] },
    { stage: "02_key_levels", files: [`${pairLabel}_levels.md`, `${pairLabel}_liquidity.md`, `${pairLabel}_irl_erl.md`] },
    { stage: "03_session_time", files: [`${pairLabel}_session.md`, `${pairLabel}_opening_range.md`] },
    { stage: "04_model_selection", files: [`${pairLabel}_active_models.md`] },
    { stage: "05_entry_refinement", files: [`${pairLabel}_entry_plan.md`] },
    { stage: "05b_micro_confirmation", files: [`${pairLabel}_coherence.md`, `${pairLabel}_inducement.md`, `${pairLabel}_invalidation.md`] },
    { stage: "06_risk_management", files: [`${pairLabel}_risk_plan.md`] },
  ];

  const collected = [];
  for (const { stage, files: fnames } of stagePatterns) {
    for (const f of fnames) {
      const fullPath = path.join(ROOT, "stages", stage, "output", f);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, "utf8");
        if (content.trim().length > 10) {
          collected.push({ stage, file: f, content: content.slice(0, 2000) }); // Truncate for token efficiency
        }
      }
    }
  }
  return collected;
}

// ═══ RULE-BASED SCORING (Fallback when no LLM available) ═══
function ruleBasedScore(analysis) {
  let directionalCorrectness = 0;
  let ictRuleAdherence = 0;
  let reasoningQuality = 0;
  let actionability = 0;
  let completeness = 0;
  const criticalIssues = [];
  const warnings = [];
  let autoFail = null;

  const allText = analysis.map(a => a.content).join("\n\n");

  // 1. Directional Correctness
  const biasMatch = allText.match(/Bias[:\s]*(BULLISH|BEARISH)/i);
  const tfMatches = allText.match(/1W[:\s]*(bullish|bearish).*?1D[:\s]*(bullish|bearish).*?4H[:\s]*(bullish|bearish)/is);
  const cascadeMatch = allText.match(/Multi-TF Cascade/i);

  if (biasMatch && cascadeMatch) directionalCorrectness = 25;
  else if (biasMatch) directionalCorrectness = 15;
  else { directionalCorrectness = 0; autoFail = "NO_BIAS"; }

  // 2. ICT Rule Adherence
  const ictConcepts = allText.match(/IPDA|MMXM|MSS|CHoCH|BOS|FVG|OB|OTE|SMT|CISD|BPR|PO3|Silver Bullet|Killzone|inducement/gi);
  const ruleViolations = [];

  if (allText.match(/NY Lunch/i) && allText.match(/ENTRY|BUY|SELL/i)) {
    ruleViolations.push("Entry during NY Lunch");
  }
  if (allText.match(/EURUSD.*ENTRY|GBPUSD.*ENTRY/gi)?.length >= 2) {
    ruleViolations.push("Correlated dollar pair entry");
  }
  if (allText.match(/Asian session.*ENTRY/i)) {
    ruleViolations.push("Entry during Asian session");
  }

  if (ictConcepts && ictConcepts.length >= 5 && ruleViolations.length === 0) ictRuleAdherence = 22;
  else if (ictConcepts && ictConcepts.length >= 3) ictRuleAdherence = 15;
  else if (ruleViolations.length > 0) ictRuleAdherence = 5;
  else ictRuleAdherence = 10;

  // 3. Reasoning Quality
  const hasChain = allText.includes("→") || allText.includes("because") || allText.includes("therefore");
  const contradictions = [];
  if (allText.match(/BULLISH.*bias/i) && allText.match(/SELL.*entry/i)) {
    contradictions.push("Bullish bias with sell entry");
  }
  if (allText.match(/NO TRADE/i) && allText.match(/Entry[:\s]*[@\d]/)) {
    contradictions.push("No trade + entry plan present");
  }

  if (hasChain && contradictions.length === 0) reasoningQuality = 18;
  else if (hasChain) reasoningQuality = 10;
  else reasoningQuality = 5;

  // 4. Actionability
  const hasNoTrade = allText.match(/NO TRADE|⏳ NOT READY|🛑|WAIT/i);
  const hasEntry = allText.match(/Entry[:\s]*[@]?\s*[\d.]+/);
  const hasSLTP = allText.match(/SL[:\s]*[@]?\s*[\d.]+/) && allText.match(/TP\d?[:\s]*[@]?\s*[\d.]+/);

  if (hasNoTrade && !hasEntry) actionability = 15; // Clear no-trade is good
  else if (hasEntry && hasSLTP) actionability = 12;
  else if (hasEntry) actionability = 7;
  else actionability = 3;

  // 5. Completeness
  const stageCount = new Set(analysis.map(a => a.stage)).size;
  if (stageCount >= 6) completeness = 10;
  else if (stageCount >= 4) completeness = 6;
  else completeness = 3;

  // Check auto-fail conditions
  for (const a of analysis) {
    const c = a.content;
    // Price corruption check
    if (c.includes("29446") || c.includes("12536.0")) {
      autoFail = "PRICE_CORRUPTION";
      criticalIssues.push("Impossible price value detected in analysis output");
    }
    // Inverted SL/TP check
    const slMatch = c.match(/SL[:\s]*[@]?\s*([\d.]+)/);
    const entryMatch = c.match(/Entry[:\s]*[@]?\s*([\d.]+)/);
    const dirMatch = c.match(/(?:BUY|LONG)/i);
    if (dirMatch && slMatch && entryMatch && parseFloat(slMatch[1]) >= parseFloat(entryMatch[1])) {
      autoFail = "INVERTED_SL";
      criticalIssues.push(`SL (${slMatch[1]}) >= entry (${entryMatch[1]}) for LONG — inverted`);
    }
  }

  // Add rule violations to critical/warnings
  ruleViolations.forEach(r => {
    if (r.includes("Lunch") || r.includes("correlated")) criticalIssues.push(r);
    else warnings.push(r);
  });

  const totalScore = directionalCorrectness + ictRuleAdherence + reasoningQuality + actionability + completeness;
  const grade = totalScore >= 85 ? "A" : totalScore >= 70 ? "B" : totalScore >= 55 ? "C" : totalScore >= 40 ? "D" : "F";

  return {
    directionalCorrectness,
    ictRuleAdherence,
    reasoningQuality,
    actionability,
    completeness,
    totalScore: autoFail ? 0 : totalScore,
    grade: autoFail ? "F" : grade,
    autoFail,
    summary: autoFail
      ? `AUTO-FAIL: ${autoFail}. Analysis cannot be trusted for trading decisions.`
      : `Grade ${grade} (${totalScore}/100). ${criticalIssues.length} critical issues, ${warnings.length} warnings.`,
    criticalIssues,
    warnings,
    timestamp: new Date().toISOString(),
  };
}

// ═══ MAIN ═══
const analysis = collectAnalysis();

if (analysis.length === 0) {
  console.log(JSON.stringify({
    error: "NO_ANALYSIS",
    message: `No stage outputs found for ${PAIR} on ${DATE}`,
    totalScore: 0,
    grade: "F",
  }, null, 2));
  process.exit(1);
}

// ═══ WP-15: Attempt LLM-based scoring, fall back to rule-based ═══
let result = null;

// Check for available LLM keys
function findLLMKey() {
  try {
    const envPath = path.join(ROOT, ".env");
    if (!fs.existsSync(envPath)) return null;
    const env = fs.readFileSync(envPath, "utf8");
    const providers = [
      { key: "ANTHROPIC_API_KEY", name: "claude" },
      { key: "GEMINI_API_KEY", name: "gemini" },
      { key: "OPENAI_API_KEY", name: "openai" },
      { key: "GROQ_API_KEY", name: "groq" },
    ];
    for (const p of providers) {
      const match = env.match(new RegExp(`${p.key}=(.+?)($|\\s|\\n)`));
      if (match && match[1].trim().length > 10) return p;
    }
  } catch { return null; }
  return null;
}

const llmProvider = findLLMKey();
let llmResult = null;

if (llmProvider) {
  try {
    // Re-read env to get the actual key value
    let apiKey = process.env[llmProvider.key];
    if (!apiKey) {
      try {
        const envContent = fs.readFileSync(path.join(ROOT, ".env"), "utf8");
        const keyMatch = envContent.match(new RegExp(`${llmProvider.key}=(.+?)(\\s|\\n|$)`));
        if (keyMatch) apiKey = keyMatch[1].trim();
      } catch {}
    }
    if (!apiKey) throw new Error("No API key found");

    // Build a compact prompt for the LLM
    const allText = analysis.map(a => `[${a.stage}/${a.file}]\n${a.content}`).join("\n\n---\n\n");
    const prompt = `You are an ICT trading quality auditor. Score this SMC analysis on 5 dimensions (each 0-25, total 100):

1. DIRECTIONAL CORRECTNESS (0-25): Is the bias clearly stated with multi-TF cascade? Is it consistent throughout?
2. ICT RULE ADHERENCE (0-22): Are ICT concepts (IPDA, MMXM, MSS, FVG, OB, SMT, CISD, PO3, Silver Bullet) correctly applied? Any rule violations (NY Lunch entry, Asian entry, correlated pairs)?
3. REASONING QUALITY (0-18): Is there a logical chain from HTF context → LTF entry? Counter-evidence considered? Narrative consistency?
4. ACTIONABILITY (0-15): Is there a specific entry, SL, TP? Is the plan executable? Or is NO TRADE correctly justified?
5. COMPLETENESS (0-10): Are all stages present? Any placeholder or empty sections?

Analysis to score:
${allText.slice(0, 8000)}

Respond with ONLY valid JSON: {"scores":{"directional":N,"ict":N,"reasoning":N,"actionable":N,"completeness":N},"totalScore":N,"grade":"A/B/C/D/F","criticalIssues":["..."],"warnings":["..."],"verdict":"PASSED/CAUTION/BLOCKED","narrative":"one sentence summary"}`;
    if (apiKey) {
      let response;
      if (llmProvider.name === "gemini") {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
        response = await fetch(geminiUrl, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 1024 } }),
          signal: AbortSignal.timeout(15000),
        });
      } else if (llmProvider.name === "groq") {
        response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST", headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: [{ role: "user", content: prompt }], temperature: 0.3, max_tokens: 1024 }),
          signal: AbortSignal.timeout(15000),
        });
      } else {
        // Generic OpenAI-compatible
        const baseUrl = llmProvider.name === "openai" ? "https://api.openai.com/v1" : "https://api.anthropic.com/v1";
        response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST", headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: llmProvider.name === "openai" ? "gpt-4o-mini" : "claude-haiku-4-5-20251001", messages: [{ role: "user", content: prompt }], temperature: 0.3, max_tokens: 1024 }),
          signal: AbortSignal.timeout(15000),
        });
      }
      if (response?.ok) {
        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
          || data?.choices?.[0]?.message?.content
          || data?.content?.[0]?.text
          || "";
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          llmResult = JSON.parse(jsonMatch[0]);
          llmResult.mode = `llm-${llmProvider.name}`;
        }
      }
    }
  } catch (e) {
    // LLM call failed — fall through to rule-based
    llmResult = null;
  }
}

// Use LLM result if available, otherwise fall back to rule-based
if (llmResult?.totalScore != null) {
  result = {
    pair: PAIR, date: DATE,
    ...llmResult.scores,
    totalScore: llmResult.totalScore,
    grade: llmResult.grade || "B",
    criticalIssues: llmResult.criticalIssues || [],
    warnings: llmResult.warnings || [],
    verdict: llmResult.verdict || "CAUTION",
    narrative: llmResult.narrative || "",
    mode: llmResult.mode || "llm",
    stagesPresent: analysis.map(a => a.stage).filter((v, i, s) => s.indexOf(v) === i),
    totalStages: analysis.map(a => a.stage).filter((v, i, s) => s.indexOf(v) === i).length,
  };
} else {
  // Rule-based fallback — honestly labeled
  result = ruleBasedScore(analysis);
  result.pair = PAIR;
  result.date = DATE;
  result.stagesPresent = analysis.map(a => a.stage).filter((v, i, s) => s.indexOf(v) === i);
  result.totalStages = result.stagesPresent.length;
  result.mode = llmProvider ? `rule-based-fallback(${llmProvider.name}-failed)` : "rule-based(no-llm-key)";
}

// Save score to judge ledger
const JUDGE_LEDGER = path.join(ROOT, "evaluation", "judge", "judge_ledger.jsonl");
fs.appendFileSync(JUDGE_LEDGER, JSON.stringify(result) + "\n");

console.log(JSON.stringify(result, null, 2));
process.exit(result.grade === "F" ? 1 : 0);
