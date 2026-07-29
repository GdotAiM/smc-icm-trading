# Stage 00 — Macro Context & Cycle Intelligence

## Purpose
Before analyzing any specific pair, establish the TEMPORAL CONTEXT:
- What day is it? What are the day's ICT characteristics?
- Where are we in the weekly cycle?
- What market cycle phase are we in (accumulation/manipulation/distribution/expansion)?
- Which models are favored or disfavored today?
- Is there any monthly event impacting trading (NFP, FOMC, expiry)?

This stage runs ONCE at the start of the session and applies to all pairs.

## Inputs

| Source | Location | What to load |
|--------|----------|--------------|
| System Clock | `new Date()` | Current day, UTC hour, week of month |
| Config | `../../_config/ict_calendar.md` | Day-of-week rules, monthly events |
| References | `../../references/cycles/market_cycle.md` | Cycle phase definitions |
| References | `../../references/cycles/model_cycle_map.md` | Model-to-cycle mapping |
| References | `../../references/cycles/mmxm_in_cycle.md` | MMXM cycle integration |
| Engine Reports | `../../shared/<DATE>/EURUSD/engine_1w.json` | Weekly structure |
| Engine Reports | `../../shared/<DATE>/EURUSD/engine_1d.json` | Daily structure |

## Process

### 1. Determine Day Context
Read the system clock. Map to ICT day profile from `_config/ict_calendar.md`.

### 2. Detect Cycle Phase
Using the 1W and 1D engine reports:
- Compare 1W bias vs 1D bias
- Check for liquidity sweeps on daily
- Check displacement strength (ATR ratio)
- Classify into: ACCUMULATION / MANIPULATION / DISTRIBUTION / EXPANSION

### 3. Map Valid Models
Using the cycle phase → cross-reference with `references/cycles/model_cycle_map.md`
to produce a list of cycle-appropriate models with weights.

### 4. Check Monthly Events
Is it NFP week? FOMC week? Options expiry? Month-end?
Apply risk modifiers and session warnings.

### 5. Generate MMXM Assessment
Using `references/cycles/mmxm_in_cycle.md`:
- Is there a valid HTF POI?
- Has inducement occurred?
- What MMXM step are we on?

## Output Requirements

Create THREE files:

### `output/day_context.md`
```markdown
# Macro Context — <DATE> — <DAY>

## Today's Profile
- **Day**: <Monday-Friday> — "<ICT Day Name>"
- **Character**: <description>
- **Risk Level**: <Low/Medium/High>
- **Day Weight**: <×0.6 to ×1.3>
- **UTC Hour**: <current hour> — <session name>

## Weekly Position
- **Week Phase**: <early/mid/late week>
- **Expected Cycle**: <what typically happens today>
- **Caution**: <any day-specific warnings>
```

### `output/cycle_phase.md`
```markdown
# Cycle Phase — <DATE>

## Detected Phase: **<PHASE>**
- **1W Bias**: <bullish/bearish/neutral>
- **1D Bias**: <bullish/bearish/neutral>
- **Sweeps**: <yes/no — details>
- **Displacement**: <label> (<ATR ratio>x ATR)
- **Confidence**: <0-1>

## Phase Narrative
<1-2 sentence explanation of what this phase means for trading today>

## MMXM Step
- **Step**: <1/2/3/4>
- **HTF POI Present**: <yes/no — where>
- **Inducement Occurred**: <yes/no — details>
- **Action**: <what to do — wait/watch/enter/manage>
```

### `output/model_filter.md`
```markdown
# Cycle-Aware Model Filter — <DATE>

## Active Cycle: **<PHASE>** — Day: **<DAY>**

| Model | Structural | Cycle Fit | Day Fit | Combined | Recommended |
|-------|-----------|-----------|---------|----------|-------------|
| <model> | <score> | <PRIMARY/Secondary/Not recommended> | <day weight> | <combined score> | <Yes/If structure confirms/No> |

## Today's Best Models
1. **<Model>** — <why it fits today's cycle + day>
2. **<Model>** — <why>
3. **<Model>** — <why>

## Models to Avoid Today
- **<Model>** — <why it's disfavored today>
```

These outputs are read by Stage 01 (HTF Bias) for cycle context and
Stage 04 (Model Selection) for cycle-weighted scoring.

## ICT Knowledge Reference

Before writing this stage, query the ICT knowledge base:

```bash
node tools/ict_rag.cjs --query "ICT Power of 3 accumulation manipulation distribution phases"
```

```bash
node tools/ict_rag.cjs --query "ICT intraday profiles CBDR Asian range conditions"
```

```bash
node tools/ict_rag.cjs --query "How to determine daily bias using ICT"
```

Cite ICT sources in your output with the format: `[ICT: concept-name.md]`
