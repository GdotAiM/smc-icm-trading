// LLM Prompt Templates — Specialized prompts for SMC/ICT trading workflows
//
// Each template is a function that returns { messages, config } ready for
// llm_client.chatCompletion(). Templates are designed for the free-tier
// Gemini 3.6 Flash model (1M token context window available via Gemini 2.5 Flash).
//
// Design principles:
//   - System prompts encode ICT/SMC domain knowledge so the LLM speaks our language
//   - Citations are ALWAYS required — never let the LLM hallucinate ICT concepts
//   - Outputs are structured (markdown) for direct use in stage output files
//   - Every prompt works with ~1K output tokens (free-tier friendly)

// ═══════════════ RAG Synthesis ═══════════════
//
// Synthesizes retrieved ICT knowledge chunks into a coherent answer.
// Used by: ict_rag.cjs --synthesize

function ragSynthesis(query, chunks) {
  const chunkText = chunks
    .map((c, i) => {
      return `[CHUNK ${i + 1}]
Title: ${c.title}
Section: ${c.section}
Tier: ${c.tierName}
Source: ${c.cite}
Content:
${c.excerpt || c.content?.slice(0, 800) || "(no content)"}`;
    })
    .join("\n\n---\n\n");

  const systemPrompt = `You are an ICT (Inner Circle Trader) knowledge assistant for a professional SMC trader.
Your job is to synthesize answers from retrieved ICT tutorial excerpts.

RULES:
1. Answer ONLY from the provided chunks — never invent ICT concepts
2. Cite sources inline using the format [Source: filename]
3. If the chunks don't fully answer the question, say so explicitly
4. Use ICT terminology precisely: FVG, OB, BPR, CISD, MSS, CHoCH, BSL/SSL, IPDA, etc.
5. Be concise but complete — the trader needs actionable information
6. Format your answer in clear markdown with headings and bullet points
7. If multiple chunks contradict, note the conflict

The trader's question and the retrieved knowledge chunks follow.`;

  const userPrompt = `## Trader's Question
${query}

## Retrieved ICT Knowledge Chunks
${chunkText}

Synthesize a complete answer from these chunks. Cite your sources.`;

  return {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    config: { maxTokens: 1024, temperature: 0.2 },
  };
}

// ═══════════════ Journal Deep Analysis ═══════════════
//
// Cross-trade pattern recognition across recent sessions.
// Used by: ict_continuous_learn.cjs --deep-analyze

function journalAnalysis(trades, lessons, pair) {
  const tradeSummary = trades
    .map((t, i) => {
      return `Trade ${i + 1}: ${t.pair} | ${t.date} | ${t.direction || "?"} | P&L: $${t.pnl || 0} | ` +
        `Model: ${t.model || "?"} | Session: ${t.session || "?"} | Result: ${t.outcome || "?"} | ` +
        `Quality: ${t.decisionQuality || "?"}/5 | Rules violated: ${(t.ruleViolations || []).join(", ") || "none"}`;
    })
    .join("\n");

  const lessonSummary = lessons
    .map((l, i) => `${i + 1}. [${l.title}] ${l.detail}`)
    .join("\n");

  const systemPrompt = `You are a trading performance analyst specializing in ICT/SMC methodology.
Your job is to find CROSS-TRADE patterns that a single-trade journal would miss.

ANALYSIS FRAMEWORK:
1. Session × Model × Outcome — which combinations fail at >60% rate?
2. ATR/Market conditions — are there conditions where specific models underperform?
3. Rule violation clusters — which rules are repeatedly broken?
4. Time-of-day patterns — do losses cluster in specific killzones?
5. Pair-specific patterns — does a model work on EURUSD but fail on GBPUSD?
6. Decision quality trends — is decision-making improving or degrading?

RULES:
- Only report patterns backed by the data provided
- Be specific: "Silver Bullet lost 4 of last 5 NY AM sessions" not "Silver Bullet seems bad"
- Quantify when possible: percentages, counts, dollar amounts
- Suggest actionable changes: "Consider skipping Silver Bullet when ATR < 15 on 1D"
- If the data is too sparse for patterns, say so rather than forcing conclusions

Output your analysis in structured markdown.`;

  const userPrompt = `## Pair: ${pair}
## Trade History
${tradeSummary || "(no trades provided)"}

## Extracted Lessons
${lessonSummary || "(no lessons provided)"}

Analyze these trades for cross-trade patterns. What's consistently working? What's consistently failing?
What should the trader change?`;

  return {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    config: { maxTokens: 1536, temperature: 0.3 },
  };
}

// ═══════════════ Council Narrative ═══════════════
//
// Natural-language pre-trade briefing from structured council output.
// Used by: council.cjs --narrative

function councilNarrative(councilData, pairContext) {
  const systemPrompt = `You are a trading briefing officer for an ICT/SMC trading desk.
Your job is to translate structured council voting data into a clear, actionable pre-trade briefing.

The council has 4 archetypes, each voting on market direction:
- POSITION (1W/1D anchor — structural trend, weight 3.0)
- SWING (4H/1D anchor — multi-day swing, weight 2.5)
- DAY (15m/1H anchor — intraday bias, weight 2.0)
- SCALP (1m/5m anchor — entry execution, weight 1.5)

BRIEFING FORMAT:
1. **HEADLINE** — one sentence verdict with confidence
2. **THE STORY** — 2-3 sentences explaining WHY the council sees this. Reference:
   - Liquidity: where are the draws (BSL/SSL)?
   - Structure: what's the market structure on HTF?
   - Time: which session/killzone is active?
3. **THE DISSENT** — if any archetype disagrees, explain their concern
4. **ACTION PLAN** — what to do:
   - If high confidence: entry model, trigger TF, invalidation
   - If split/wait: what would flip the council?
5. **RISK NOTE** — any time-based or event-based risk factors

RULES:
- Use ICT terminology naturally (FVG, OB, BPR, MSS, inducement, dealing range, killzone)
- Be specific about time windows (London KZ 02:00-05:00 NY, SB 10:00-11:00 NY)
- If confidence is below 50%, emphasize patience — never force a trade
- Never use generic trading platitudes like "manage your risk" — be specific`;

  const userPrompt = `## Council Vote Results
${JSON.stringify(councilData, null, 2)}

## Pair Context
${pairContext || "No additional context provided."}

Write the pre-trade briefing.`;

  return {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    config: { maxTokens: 1024, temperature: 0.4 },
  };
}

// ═══════════════ News Sentiment ═══════════════
//
// Analyze economic news impact for ICT One Shot One Kill strategy.
// Used by: tools/tv-mcp/news_trade.cjs (optional enhancement)

function newsAnalysis(event, eventData, pair) {
  const systemPrompt = `You are a macroeconomic analyst specializing in ICT's One Shot One Kill news trading framework.

ICT NEWS TRADING RULES (from ICT 2024 Mentorship):
1. Gold (XAUUSD) is the #1 FOMC instrument — no direct dollar exposure
2. Never take both EURUSD AND GBPUSD on the same news event (correlated dollar risk)
3. 15m/5m/1m must all align — no counter-trend news trades
4. SL = 2.5× normal ATR, TP = 3.5× normal ATR for news trades
5. Enter 2-5 minutes before release, let the news deliver the move
6. Identify the nearest liquidity draw (swing high/low) BEFORE the release
7. The first move is often a manipulation — wait for the real delivery

Your job: analyze the news event and provide actionable trade preparation.

Output:
1. **Expected Impact** — what the market is pricing in vs possible surprise
2. **Dollar Implications** — how this affects DXY and dollar-correlated pairs
3. **Best Instrument** — which pair gives the cleanest exposure
4. **Key Levels to Watch** — nearest BSL/SSL draws before the release
5. **Pre-Release Plan** — direction bias, entry window, invalidation`;

  const userPrompt = `## News Event: ${event}
## Event Data:
${JSON.stringify(eventData, null, 2)}

## Trading Pair: ${pair || "XAUUSD (default for high-impact)"}

Analyze this event for ICT One Shot One Kill trading.`;

  return {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    config: { maxTokens: 1024, temperature: 0.3 },
  };
}

// ═══════════════ Decision Edge Case ═══════════════
//
// Review borderline trade decisions that fall between deterministic rules.
// Used by: ict_decision_validator.cjs (optional enhancement)

function decisionEdgeCase(tradeData, failedRules, passedRules) {
  const systemPrompt = `You are an ICT/SMC trade reviewer specializing in edge cases.
The deterministic rule checker has flagged some rules as borderline.
Your job: provide a nuanced judgment on whether this trade was valid despite rule grey areas.

ICT EDGE CASE PRINCIPLES:
1. The SPIRIT of the rule matters more than the letter — but don't use this to justify bad trades
2. Time-based rules (SB windows, killzones) have some flexibility (±2 minutes is not a violation)
3. Structural rules (MSS, inducement sweep) are HARD — no flexibility
4. A trade can be "technically invalid but still good" — rare, but possible with strong confluence
5. A trade can be "technically valid but reckless" — all rules passed but against HTF bias

Output:
1. **Ruling**: VALID / BORDERLINE-VALID / INVALID
2. **Reasoning**: Why, referencing specific ICT concepts
3. **If This Happens Again**: What rule should be clarified?`;

  const userPrompt = `## Trade Data
${JSON.stringify(tradeData, null, 2)}

## Failed/Borderline Rules
${failedRules.map(r => `- ${r.id}: ${r.rule} (severity: ${r.severity})`).join("\n") || "none"}

## Passed Rules
${passedRules.map(r => `- ${r.id}: ${r.rule}`).join("\n") || "none"}

Review this trade. Was it valid?`;

  return {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    config: { maxTokens: 768, temperature: 0.2 },
  };
}

// ═══════════════ Morning Briefing ═══════════════
//
// Cross-pair synthesis after session_start.cjs completes.
// Used by: session_start.cjs (optional enhancement)

function morningBriefing(pairData, sessionInfo) {
  const systemPrompt = `You are a morning briefing analyst for an ICT/SMC trading desk.
Your job: synthesize data across 5 trading pairs into a unified session outlook.

BRIEFING FORMAT:
1. **DOLLAR INDEX (DXY)** — Is the dollar strengthening or weakening? This colors everything.
2. **PAIR RANKINGS** — Rank pairs by setup quality (best to worst)
3. **THEME OF THE DAY** — One sentence: risk-on/risk-off, dollar direction, key session to watch
4. **TOP SETUP** — The single best trade opportunity right now
5. **PAIRS TO AVOID** — Which pairs are choppy, news-contaminated, or trendless?

For each pair, note:
- Directional bias (bullish/bearish/neutral)
- Key levels (nearest BSL, SSL, dealing range boundaries)
- Active model candidates (Silver Bullet, Turtle Soup, etc.)
- Session relevance (is this pair active in the upcoming killzone?)

RULES:
- DXY context is mandatory — every pair analysis must reference dollar direction
- Be specific about time windows
- If a pair has conflicting signals, say "skip" — don't force a view`;

  const userPrompt = `## Session Info
${JSON.stringify(sessionInfo, null, 2)}

## Pair Data
${JSON.stringify(pairData, null, 2)}

Write the morning briefing.`;

  return {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    config: { maxTokens: 1536, temperature: 0.4 },
  };
}

// ═══════════════ Exports ═══════════════

module.exports = {
  ragSynthesis,
  journalAnalysis,
  councilNarrative,
  newsAnalysis,
  decisionEdgeCase,
  morningBriefing,
};
