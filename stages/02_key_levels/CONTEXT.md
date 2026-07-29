# Stage 02 — Key Levels & Institutional Reference Points

## Purpose
Identify and clearly mark the highest-probability institutional reference
points (PD Arrays) that price is likely to react from, given the bias
established in Stage 01.

## Inputs

| Source | Location | What to load |
|--------|----------|--------------|
| Previous Stage | `../01_htf_bias/output/bias.md` | Current directional bias |
| Engine | `npx smc-engine --mode levels` | All PD array outputs |
| TV MCP | TradingView | Daily, H4, and H1 charts |
| References | `../../references/smc_core/` | OB, FVG, Breaker, Liquidity definitions |
| Config | `../../_config/trading_rules.md` | Level filtering rules |

## Process

### 1. Load Context
- Read the bias decision from `../01_htf_bias/output/bias.md`.
- Open the relevant timeframes on TradingView.

### 2. Identify High-Probability Levels
Prioritize in this order:
1. **Unmitigated Order Blocks** (especially with displacement)
2. **Fair Value Gaps** (particularly those linked to strong displacement)
3. **Liquidity pools** (equal highs/lows, session highs/lows)
4. **Breaker Blocks** (mitigated OBs that flipped)
5. **Mitigation Blocks / Rejection Blocks**
6. **NWOG / NDOG** (New Week/Day Opening Gaps) if relevant

### 3. Filter by Bias
- In a **bullish bias** → focus on demand-side PD arrays (discount zones).
- In a **bearish bias** → focus on supply-side PD arrays (premium zones).
- Mark opposing liquidity as targets.

### 4. Draw on Chart
Use TradingView MCP to cleanly draw the selected levels:
- `tv_draw_shape` with type `horizontal_line` for key levels
- `tv_draw_shape` with type `rectangle` for order blocks
- `tv_draw_shape` with type `rectangle` for FVGs
- `tv_draw_shape` with type `horizontal_line` for liquidity pools

Use consistent color coding:
- Bullish OB: blue
- Bearish OB: red
- Bullish FVG: green
- Bearish FVG: purple
- Liquidity pools: orange (BSL) / yellow (SSL)

### 5. Capture Chart
- `tv_capture_screenshot` → save to `../../shared/<DATE>/<PAIR>/screenshots/02_levels.png`

### 6. Optional Forecast Check
Run a shorter Kronos forecast to get probability of reaching key levels:
`python tools/kronos_forecast.py --input <data> --pred-len 24 --samples 10`

## Output Requirements

Create `output/levels.md`:

```markdown
# Key Levels — [PAIR] — [DATE]

## Bias Reminder
[From Stage 01: Bullish/Bearish/Neutral]

## Primary Levels (Highest Priority)
| Type | Price | Direction | Reason | Strength |
|------|-------|-----------|--------|----------|
| OB   | 1.0850 | Bullish   | Unmitigated H4 OB with displacement | High |

## Liquidity Targets
| Type | Price | Pool Size | Distance from Current |
|------|-------|-----------|----------------------|
| BSL  | 1.0980 | 45 pip cluster | +130 pips |

## Chart Reference
![Levels](screenshots/02_levels.png)

## Notes for Model Selection
- Key levels that align with session killzones
- Levels near round numbers or confluent zones

## ICT Knowledge Reference

Before writing this stage, query the ICT knowledge base:

```bash
node tools/ict_rag.cjs --query "ICT order block identification bullish bearish"
```

```bash
node tools/ict_rag.cjs --query "ICT fair value gap FVG how to identify valid FVG"
```

```bash
node tools/ict_rag.cjs --query "ICT liquidity pool BSL SSL sweep detection"
```

```bash
node tools/ict_rag.cjs --query "ICT PD array premium discount zone identification"
```

Cite ICT sources in your output with the format: `[ICT: concept-name.md]`
