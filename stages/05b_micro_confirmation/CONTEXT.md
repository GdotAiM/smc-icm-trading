# Stage 05b — Micro Confirmation (LTF Analysis)

## Purpose
Before finalizing the entry plan from Stage 05, confirm that the LTF picture
(15m, 5m, 1m) COHERES with the HTF thesis. ICT teaches that LTF must confirm
HTF — never trade against the higher timeframe, even if LTF looks perfect.

This stage produces:
1. LTF cycle phase per timeframe
2. Entry trigger checklist (ICT-correct)
3. Macro-Micro coherence score (0-10)
4. Go/No-Go decision

## Inputs

| Source | Location | What to load |
|--------|----------|--------------|
| Stage 00 | `../../00_macro_context/output/` | Macro cycle phase, MMXM step |
| Stage 01 | `../01_htf_bias/output/bias.md` | HTF directional bias |
| Stage 04 | `../04_model_selection/output/active_models.md` | Selected model |
| Config | `../../_config/micro_params.md` | LTF-specific engine thresholds for coherence scoring |
| Engine | `../../shared/<DATE>/<PAIR>/engine_15m.json` | 15m structure |
| Engine | `../../shared/<DATE>/<PAIR>/engine_5m.json` | 5m structure |
| Engine | `../../shared/<DATE>/<PAIR>/engine_1m.json` | 1m structure |
| Reference | `../../references/cycles/macro_micro_coherence.md` | Coherence rules |

## Process

### 1. Detect LTF Cycles
For each LTF (15m, 5m, 1m), determine:
- Current bias (bullish/bearish/neutral)
- Last structure event (BOS/CHoCH/none) and direction
- Active displacement? (moderate or strong?)
- Recent liquidity sweep?

### 2. Compare Against HTF
- Does 15m bias match HTF bias? (Macro direction)
- Does 5m bias match HTF bias? (Entry TF)
- Does 1m show displacement in HTF direction?

### 3. Score Coherence (0-10)
Using the rubric from `references/cycles/macro_micro_coherence.md`:
- LTF bias alignment (0-3)
- LTF structure (0-2)
- LTF displacement (0-2)
- LTF manipulation (0-2)
- Trigger readiness (0-1)

### 4. Check Entry Triggers
For the HTF direction, verify LTF trigger conditions:

**SHORT entry triggers:**
- [ ] 15m bias = BEARISH or NEUTRAL (not opposing)
- [ ] 5m bearish CHoCH or BOS in last 10 bars
- [ ] 5m bearish FVG present and unfilled
- [ ] 1m displacement bearish (body > 0.7× ATR)
- [ ] BSL sweep on 5m or 15m within last 15 bars (manipulation)

**LONG entry triggers:**
- [ ] 15m bias = BULLISH or NEUTRAL (not opposing)
- [ ] 5m bullish CHoCH or BOS in last 10 bars
- [ ] 5m bullish FVG present and unfilled
- [ ] 1m displacement bullish (body > 0.7× ATR)
- [ ] SSL sweep on 5m or 15m within last 15 bars (manipulation)

### 5. Make Go/No-Go Decision

```
Coherence ≥ 7 + All 5 triggers met → ✅ GO — Enter on 5m FVG fill
Coherence ≥ 7 + 3-4 triggers met → ⏳ NEARLY — Wait 1-2 5m candles
Coherence 4-6 → ⏳ WAIT — Let LTF develop further
Coherence < 4 → ❌ NO TRADE — LTF contradicts HTF
```

## Output Requirements

### `output/micro_cycle.md`
LTF cycle phase for each of 15m, 5m, 1m.

### `output/trigger_check.md`
The 5-point trigger checklist with pass/fail and notes.

### `output/coherence.md`
Macro-Micro coherence score with breakdown and Go/No-Go decision.

These outputs are read by Stage 05 (Entry Refinement) before finalizing the trade ticket.

## ICT Knowledge Reference

Before writing this stage, query the ICT knowledge base:

```bash
node tools/ict_rag.cjs --query "ICT CISD change in state of delivery MSS confirmation"
```

```bash
node tools/ict_rag.cjs --query "ICT 1-minute entry trigger fractal MMXM nesting"
```

```bash
node tools/ict_rag.cjs --query "ICT SMT divergence correlated pair confirmation"
```

Cite ICT sources in your output with the format: `[ICT: concept-name.md]`
