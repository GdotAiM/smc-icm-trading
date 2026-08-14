// tools/llm/extract_features.cjs — WP-16: LLM as structured feature source
// =============================================================================
// Instead of writing audit markdown that nobody reads, the LLM emits structured
// features that feed directly into the ML classifier. These features capture
// patterns the boolean engine can't see: narrative consistency, intermarket
// alignment confidence, pattern similarity to historical winners/losers.
//
// Usage:
//   node tools/llm/extract_features.cjs EURUSD           → extract features
//   node tools/llm/extract_features.cjs EURUSD --dry-run → print prompt, no API
//   node tools/llm/extract_features.cjs --batch           → all 4 pairs
//
// Output: shared/<DATE>/<PAIR>/llm_features.json
// =============================================================================

const fs = require("fs");
const path = require("path");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "../..");
// Load project .env so LLM_PROVIDER / API keys are set even when this script
// runs standalone or detached (spawned from run_pair.cjs). Without it the
// client would default to "gemini" with no key and always fall back to rules.
require("./load_env.cjs").loadProjectEnv();
const DATE = require("../ny_time.cjs").getNYDate();

// ── Collect stage output text ──────────────────────────────────────────
function collectStageOutput(pair) {
  const pairLabel = pair.toLowerCase();
  const stages = [
    { name: "macro_context", files: ["day_context.md", `${pairLabel}_weekly_profile.md`, `${pairLabel}_one_trade_setup.md`, `${pairLabel}_mmxm.md`] },
    { name: "htf_bias", files: [`${pairLabel}_bias.md`] },
    { name: "key_levels", files: [`${pairLabel}_levels.md`, `${pairLabel}_liquidity.md`, `${pairLabel}_irl_erl.md`] },
    { name: "session_time", files: [`${pairLabel}_session.md`] },
    { name: "model_selection", files: [`${pairLabel}_active_models.md`] },
    { name: "micro_confirmation", files: [`${pairLabel}_coherence.md`, `${pairLabel}_invalidation.md`] },
  ];

  const texts = [];
  for (const stage of stages) {
    for (const f of stage.files) {
      const fp = path.join(ROOT, "stages", `0${stages.indexOf(stage)}_${stage.name}`, "output", f);
      // Map stage name to directory
      const stageDirMap = {
        macro_context: "00_macro_context", htf_bias: "01_htf_bias", key_levels: "02_key_levels",
        session_time: "03_session_time", model_selection: "04_model_selection",
        micro_confirmation: "05b_micro_confirmation",
      };
      const dirName = stageDirMap[stage.name] || `0${stages.indexOf(stage)}_${stage.name}`;
      const filePath = path.join(ROOT, "stages", dirName, "output", f);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf8");
        if (content.trim().length > 20) {
          texts.push({ stage: stage.name, file: f, content: content.slice(0, 1500) });
        }
      }
    }
  }
  return texts;
}

// ── Also collect structured data for context ───────────────────────────
function collectStructuredContext(pair) {
  const pairDir = pair === "XAUUSD" ? "XAUUSD" : pair;
  const ctx = {};

  // Engine data
  try {
    const eng1h = JSON.parse(fs.readFileSync(path.join(ROOT, "shared", DATE, pairDir, "engine_1h.json"), "utf8"));
    ctx.engine_1h = {
      bias: eng1h.structure?.bias, event: eng1h.structure?.lastEvent,
      swept_bsl: (eng1h.liquidity || []).filter(p => p.swept && p.type === "BSL").length,
      swept_ssl: (eng1h.liquidity || []).filter(p => p.swept && p.type === "SSL").length,
      fvg_count: (eng1h.fvgs || []).length, displacement: eng1h.volumeDisplacement?.label,
    };
  } catch {}

  // DXY context
  try {
    const dxy = JSON.parse(fs.readFileSync(path.join(ROOT, "shared", DATE, "DXY", "engine_1h.json"), "utf8"));
    ctx.dxy = { bias: dxy.structure?.bias, event: dxy.structure?.lastEvent };
  } catch {}

  // Decision
  try {
    const dec = JSON.parse(fs.readFileSync(path.join(ROOT, "shared", DATE, pairDir, "decision.json"), "utf8"));
    ctx.decision = {
      verdict: dec.registry?.verdict, primary: dec.registry?.primary,
      direction: dec.entry?.type, entry: dec.entry?.price,
      invalidation: dec.invalidation?.status, guard: dec.guard?.verdict,
    };
    // Structural advisory — the fractal/time-price story the AI must weigh.
    // Surfaced, never a gate: a bearish custody chain, weak fractal coherence,
    // or absent 1m/5m MSS degrade conviction scores even when the verdict holds.
    if (dec.structural) {
      ctx.structural = {
        chain: dec.structural.chain ? {
          linkCount: dec.structural.chain.linkCount,
          dominantHalf: dec.structural.chain.dominantHalf,
          opposesDirection: dec.structural.chain.opposesDirection,
          handoffSequence: dec.structural.chain.handoffSequence,
        } : null,
        fractal: dec.structural.fractal ? {
          score: dec.structural.fractal.score,
          max: dec.structural.fractal.max,
          weak: dec.structural.fractal.weak,
          inversionDetected: dec.structural.fractal.inversionDetected,
          confirmationsPassed: dec.structural.fractal.confirmationsPassed,
        } : null,
        entryMss: dec.structural.entryMss,
      };
    }
  } catch {}

  return ctx;
}

// ── Build prompt ───────────────────────────────────────────────────────
function buildPrompt(pair, texts, ctx) {
  const analysisText = texts.map(t => `[${t.stage}/${t.file}]\n${t.content}`).join("\n\n---\n\n");

  return `You are an institutional SMC/ICT pattern recognition system. Analyze this trading analysis and extract structured quantitative features. Do NOT write commentary — only return JSON.

Analysis for ${pair}:
${analysisText.slice(0, 6000)}

Structured Context:
${JSON.stringify(ctx, null, 2)}

Extract these features (each 0.0-1.0):
1. narrative_coherence: How consistent is the bias across timeframes and stages? (1.0 = perfectly consistent, 0.0 = contradictory)
2. dxy_alignment_confidence: If DXY data exists, how well does this pair's direction align with dollar strength/weakness? (1.0 = perfect alignment, 0.5 = DXY neutral/unavailable, 0.0 = clear divergence)
3. pattern_similarity_score: Does this setup resemble classic ICT patterns (Silver Bullet clean sweep+MSS, Turtle Soup failed breakout, Judas Swing fakeout)? (1.0 = textbook pattern, 0.0 = no clear pattern)
4. macro_context_strength: How strong is the higher-timeframe context supporting this trade? (1.0 = all HTFs aligned with strong displacement, 0.0 = weak/absent context)
5. decision_confidence: Based on the coherence, invalidation status, guard verdict, and entry plan — what is the overall confidence in this decision? (1.0 = high conviction, 0.0 = should not trade)

Return ONLY this exact JSON structure:
{"narrative_coherence":0.X,"dxy_alignment_confidence":0.X,"pattern_similarity_score":0.X,"macro_context_strength":0.X,"decision_confidence":0.X}`;
}

// ── Call LLM ───────────────────────────────────────────────────────────
// The default model (deepseek-v4-flash-free via the Zen gateway) is a
// reasoning model: it emits a long `reasoning_content` BEFORE the final answer.
// With max_tokens alone the reasoning can exhaust the budget and leave the
// answer empty (finish_reason "length") — intermittently. max_completion_tokens
// lets the backend budget reasoning separately so the JSON answer is always
// produced. A small retry (max_tokens fallback) covers any gateway quirks.
async function callLLM(prompt) {
  try {
    const { chatCompletion } = require("./llm_client.cjs");
    const messages = [{ role: "user", content: prompt }];

    let result = await chatCompletion(messages, {
      temperature: 0.1, maxCompletionTokens: 4000, maxTokens: 8000, timeout: 180000,
    });
    let text = typeof result === "string" ? result : (result?.text || "");
    if (!text && !text.startsWith("[LLM")) {
      // Empty content (reasoning truncation) — retry once with a plain larger
      // max_tokens; the model re-reasons from scratch so a fresh budget helps.
      result = await chatCompletion(messages, {
        temperature: 0.1, maxTokens: 8000, timeout: 180000,
      });
      text = typeof result === "string" ? result : (result?.text || "");
    }

    if (!text || text.startsWith("[LLM")) {
      // LLM unavailable/errored — signal the rule-based fallback
      return null;
    }
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      // Validate all expected keys
      const expected = ["narrative_coherence", "dxy_alignment_confidence", "pattern_similarity_score", "macro_context_strength", "decision_confidence"];
      const valid = expected.every(k => typeof parsed[k] === "number" && parsed[k] >= 0 && parsed[k] <= 1);
      if (valid) return parsed;
    }
    return null;
  } catch (e) {
    return null;
  }
}

// ── Rule-based fallback (when LLM unavailable) ─────────────────────────
function ruleBasedFeatures(texts, ctx) {
  const allText = texts.map(t => t.content).join("\n").toLowerCase();

  // Narrative coherence: check for consistent bias mentions
  const biasMentions = (allText.match(/bullish/g) || []).length;
  const bearishMentions = (allText.match(/bearish/g) || []).length;
  const totalBias = biasMentions + bearishMentions;
  const coherence = totalBias > 0 ? Math.max(biasMentions, bearishMentions) / totalBias : 0.5;

  // DXY alignment: check for DXY bias alignment in text
  const dxyBullish = (allText.match(/dxy.*bullish|dollar.*strength/g) || []).length;
  const dxyBearish = (allText.match(/dxy.*bearish|dollar.*weakness/g) || []).length;
  const alignment = ctx.dxy ? 0.8 : 0.5; // simplified

  // Pattern similarity: check for ICT pattern keywords
  const patternKeywords = ["silver bullet", "turtle soup", "judas swing", "breaker", "mmxm", "fvg entry", "ote"];
  const patternHits = patternKeywords.filter(k => allText.includes(k)).length;
  const patternScore = Math.min(1.0, patternHits / 4);

  // Macro context strength: check HTF alignment
  const htfAligned = (allText.match(/aligned|alignment/g) || []).length > 0;
  const macroScore = htfAligned ? 0.7 : 0.3;

  // Decision confidence: based on guard and invalidation
  const isBlocked = ctx.decision?.guard === "DO NOT ENTER" || ctx.decision?.invalidation === "INVALIDATED";
  let confidence = isBlocked ? 0.2 : 0.6;

  // Structural advisory — surfaced, never a gate. The rule-based fallback weighs
  // the same facts the LLM prompt sees: an opposing custody chain, a weak fractal,
  // or an absent 1m/5m MSS shave conviction even when the verdict stands.
  const s = ctx.structural;
  if (s) {
    let penalty = 0;
    if (s.chain?.opposesDirection) penalty += 0.15;
    if (s.fractal?.weak) penalty += 0.1;
    if (s.entryMss && s.entryMss.present === false) penalty += 0.05;
    confidence = Math.max(0.05, confidence - penalty);
  }

  return {
    narrative_coherence: Math.round(coherence * 100) / 100,
    dxy_alignment_confidence: alignment,
    pattern_similarity_score: patternScore,
    macro_context_strength: macroScore,
    decision_confidence: Math.round(confidence * 100) / 100,
    structural_applied: s ? (s.chain?.opposesDirection || s.fractal?.weak || (s.entryMss && s.entryMss.present === false)) : false,
    mode: "rule-based-fallback",
  };
}

// ═══ MAIN ═══
async function main() {
  const args = process.argv.slice(2);
  const BATCH = args.includes("--batch");
  const DRY_RUN = args.includes("--dry-run");
  const pairs = BATCH ? ["EURUSD", "GBPUSD", "XAUUSD", "NAS100"] : [args.find(a => !a.startsWith("--")) || "EURUSD"];

  for (const pair of pairs) {
    console.log(`\n=== LLM Features: ${pair} ===`);

    const texts = collectStageOutput(pair);
    const ctx = collectStructuredContext(pair);

    if (texts.length === 0) {
      console.log(`  No stage output found — skipping`);
      continue;
    }

    const prompt = buildPrompt(pair, texts, ctx);

    if (DRY_RUN) {
      console.log(`  Prompt: ${prompt.length} chars`);
      console.log(`  Stages collected: ${texts.map(t => t.stage).join(", ")}`);
      console.log(`  (Dry run — no API call)`);
      continue;
    }

    // Try LLM first, fall back to rule-based
    let features = null;
    try {
      features = await callLLM(prompt);
      if (features) features.mode = "llm";
    } catch {}

    if (!features) {
      features = ruleBasedFeatures(texts, ctx);
      console.log(`  LLM unavailable — using rule-based fallback`);
    } else {
      console.log(`  LLM features extracted successfully`);
    }

    // Write features
    const pairDir = pair === "XAUUSD" ? "XAUUSD" : pair;
    const outDir = path.join(ROOT, "shared", DATE, pairDir);
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, "llm_features.json");
    features.generated = new Date().toISOString();
    features.pair = pair;
    fs.writeFileSync(outPath, JSON.stringify(features, null, 2), "utf8");

    console.log(`  Features: ${JSON.stringify(features)}`);
    console.log(`  Written: ${outPath}`);
  }
}

main().catch(e => {
  console.error("LLM feature extraction failed:", e.message);
  process.exit(1);
});
