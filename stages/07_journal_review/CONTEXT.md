# Stage 07 — Journal Review & Continuous Improvement

## Purpose
After the session or trade concludes, systematically review actual outcomes
against forecasts, model expectations, and trade management rules. Extract
lessons and track patterns over time.

## Inputs

| Source | Location | What to load |
|--------|----------|--------------|
| All Previous Stages | `../0*_*/output/*.md` | Full analysis chain |
| Forecasts | `../../shared/<DATE>/<PAIR>/forecast_*.json` | Kronos + Chronos forecasts |
| Engine Reports | `../../shared/<DATE>/<PAIR>/engine_*.json` | SMC engine output |
| TV MCP | TradingView | Final chart state |
| Actual Outcome | User or broker | What happened |

## Process

### 1. Determine Review Type
- **Trade Taken**: Full trade review (entry → management → exit)
- **No Trade**: Why was no trade taken? Was it correct?
- **End of Day**: Overall market review even without trades
- **Weekly**: Aggregate weekly performance and patterns

### 2. Compare Forecast vs Reality
If Kronos/Chronos forecasts were generated:
- Load the forecast JSON files
- Load actual price data for the same period
- Compare: direction accuracy, level accuracy, timing accuracy
- Record which model was more accurate for this pair/timeframe

### 3. Evaluate Model Performance
- Did the selected model produce the expected outcome?
- Were the entry conditions met precisely?
- Did price reach TP1/TP2?
- Was SL threatened before TP was hit?
- Did the structure evolve as predicted?

### 4. Assess Decision Quality (not outcome quality)
Rate each decision independent of the result:
- **Bias assessment**: Was the HTF read correct? (even if trade lost)
- **Level identification**: Were the right levels marked?
- **Model selection**: Was the model appropriate for conditions?
- **Entry timing**: Was entry at the right moment?
- **Risk management**: Was position size appropriate?

### 5. Identify Improvement Actions
- What would you do differently next time?
- What pattern did you notice that wasn't in the model?
- What needs to be added to `_config/` rules?
- What reference material needs updating?

### 6. Archive Session
- Move all outputs to `../../shared/<DATE>/<PAIR>/`
- Include: all stage outputs, engine reports, screenshots, forecasts
- This becomes searchable history via `grep` or the web dashboard

## Output Requirements

Create `output/review.md`:

```markdown
# Session Review — [PAIR] — [DATE]

## Outcome Summary
- **Trade Taken**: [Yes/No]
- **Direction**: [Long/Short/N/A]
- **Result**: [Win/Loss/Breakeven/No Trade] — [+/-$X] ([X]R)
- **Model Used**: [Model Name]
- **Session**: [Asia/London/NY AM/NY PM]

## Forecast Accuracy
| Model | Direction Correct? | Level Accuracy | Notes |
|-------|-------------------|----------------|-------|
| Kronos | ✓/✗ | [Good/OK/Poor] | |
| Chronos-2 | ✓/✗ | [Good/OK/Poor] | |

## Trade Analysis (if trade taken)
| Parameter | Planned | Actual | Delta |
|-----------|---------|--------|-------|
| Entry | [price] | [price] | [pips] |
| SL | [price] | [price] | [pips] |
| TP1 | [price] | [hit/missed] | |
| TP2 | [price] | [hit/missed] | |
| Max Favorable | — | [price] | [pips] |
| Max Adverse | — | [price] | [pips] |

## Decision Quality Assessment
| Decision | Rating (1-5) | Notes |
|----------|-------------|-------|
| HTF Bias | [1-5] | |
| Level ID | [1-5] | |
| Model Selection | [1-5] | |
| Entry Timing | [1-5] | |
| Trade Management | [1-5] | |
| Risk Sizing | [1-5] | |
| **Overall** | **[X.X/5]** | |

## Lessons Learned
1. [Lesson 1]
2. [Lesson 2]

## Improvement Actions
- [ ] [Action item 1]
- [ ] [Action item 2]

## Chart Reference
![Final Chart](screenshots/07_review.png)

## ICT Knowledge Reference

Before writing this stage, query the ICT knowledge base:

```bash
node tools/ict_rag.cjs --query "ICT common mistakes Silver Bullet entry rules"
```

```bash
node tools/ict_rag.cjs --query "ICT intraday profile review post-session analysis"
```

Cite ICT sources in your output with the format: `[ICT: concept-name.md]`
