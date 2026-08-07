# LLM-as-Judge Rubric — SMC/ICT Analysis Quality Scoring

## Purpose

This rubric is used by the LLM judge (`llm_judge.cjs`) to score the quality of trading analysis output. Each stage output and narrative synthesis is scored across 5 dimensions.

## Scoring Dimensions

### 1. Directional Correctness (30 points)

Was the directional call consistent with the data presented?

| Score | Criteria |
|-------|----------|
| 30 | Bias clearly stated, all TFs listed, direction follows logically from multi-TF cascade |
| 20 | Bias stated but reasoning is incomplete or skips a key TF |
| 10 | Bias is ambiguous or contradicts some of the presented data |
| 0 | No bias stated, or bias directly contradicts the data shown |

### 2. ICT Rule Adherence (25 points)

Are all relevant ICT concepts correctly applied?

| Score | Criteria |
|-------|----------|
| 25 | All applicable ICT rules referenced correctly. Concepts used precisely. Citations where relevant. |
| 15 | Most rules followed. 1-2 ICT concepts misapplied or missing. |
| 5 | Major ICT rule violated (e.g., counter-trend entry without PD Array reason) |
| 0 | No ICT framework evident. Analysis reads like generic TA. |

### 3. Reasoning Quality (20 points)

Is the logic chain clear, complete, and free of contradictions?

| Score | Criteria |
|-------|----------|
| 20 | Clear causal chain: HTF context → LTF trigger → entry/exit logic. Each claim supported. |
| 12 | Generally logical but has gaps or leaps in reasoning. |
| 5 | Contradictions present (e.g., says bullish but lists bearish levels) |
| 0 | Incoherent — cannot follow the reasoning |

### 4. Actionability (15 points)

Does the analysis produce a clear, executable decision?

| Score | Criteria |
|-------|----------|
| 15 | Clear decision: TRADE with entry/SL/TP or NO TRADE with specific conditions to watch |
| 8 | Decision present but vague ("maybe enter if it looks good") |
| 3 | No clear decision — analysis ends without conclusion |
| 0 | Analysis recommends action that contradicts its own findings |

### 5. Completeness (10 points)

Are all required sections present and populated?

| Score | Criteria |
|-------|----------|
| 10 | All stage outputs complete. Key levels marked. SL/TP calculated. R:R stated. |
| 6 | Most sections present. 1-2 minor sections missing. |
| 3 | Major sections missing (no SL, no TP, no bias) |
| 0 | Skeleton output — placeholder text, empty sections |

## Auto-Fail Conditions

These trigger an automatic score of 0/100 regardless of other dimensions:

1. **Price corruption**: Price is outside physically possible range for the instrument
2. **Inverted SL/TP**: SL is on the wrong side of entry for the stated direction
3. **No bias stated**: Analysis lacks any directional conclusion
4. **Contradictory entry**: Analysis says "no trade" but produces entry plan, or vice versa
5. **Session violation**: Recommends entry during NY Lunch or Asian session without justification

## Overall Grade

| Score | Grade | Meaning |
|-------|-------|---------|
| 85-100 | A | Excellent — tradeable with high confidence |
| 70-84 | B | Good — minor issues, still tradeable |
| 55-69 | C | Adequate — proceed with caution, verify manually |
| 40-54 | D | Poor — significant issues, do not trade |
| 0-39 | F | Fail — auto-fail condition triggered or critically flawed |

## Judge Prompt Template

```
You are an SMC/ICT trading quality auditor. Score the following trading analysis
against the rubric below. Be strict — a bad trade costs real money.

RUBRIC:
{dimensions above}

ANALYSIS TO SCORE:
{analysis content}

Respond with JSON:
{
  "directionalCorrectness": <0-30>,
  "ictRuleAdherence": <0-25>,
  "reasoningQuality": <0-20>,
  "actionability": <0-15>,
  "completeness": <0-10>,
  "totalScore": <0-100>,
  "grade": "<A-F>",
  "autoFail": "<condition or null>",
  "summary": "<one paragraph explaining the score>",
  "criticalIssues": ["<list of deal-breaking problems>"],
  "warnings": ["<list of concerns>"]
}
```
