# Stage 05 — Entry Refinement

## Purpose
Define the precise entry conditions, draw the entry zone on TradingView,
and wait for (or identify) the trigger for the model selected in Stage 04.

## Inputs

| Source | Location | What to load |
|--------|----------|--------------|
| Previous Stages | `../04_model_selection/output/active_models.md` | Selected model + entry conditions |
| Previous Stages | `../05b_micro_confirmation/output/` | Coherence score, fractal MMXM, 1m inversion, guard, trigger check |
| Previous Stages | `../01_htf_bias/output/bias.md` | Directional bias |
| Previous Stages | `../02_key_levels/output/levels.md` | Key PD arrays |
| Engine | `npx smc-engine --pair <PAIR> --tf 15m --mode entry` | LTF structure |
| TV MCP | TradingView | Entry timeframe chart |
| ICT KB | `node tools/ict_rag.cjs --query "..."` | ICT entry rules for selected model |

## Process

### 1. Set Up Entry Timeframe
- Use TV MCP to switch to the entry timeframe (typically 15m, 5m, or 1m):
  `tv_chart_set_timeframe` with the appropriate TF.
- The entry TF should be 2-4 levels below the bias TF from Stage 01.
- Example: Bias on 1D/4H → Entry on 15m/5m.

### 2. Identify Entry Model Pattern
Based on the primary model from Stage 04, look for the specific pattern:

| Entry Model | What to Look For |
|-------------|-----------------|
| **OTE** (Optimal Trade Entry) | Price retracing to 62-79% of the displacement leg |
| **Unicorn** | OTE + FVG confluence at a key OB |
| **SCOB** (SMC Order Block) | Price returning to an unmitigated OB with displacement confirmation |
| **2FVG** | Two consecutive FVGs in the direction of bias |
| **Breaker** | Price breaking through a mitigated OB and retesting it |
| **Silver Bullet** | Displacement during SB window with FVG for entry |
| **MMXM** | Market maker model with inducement → manipulation → distribution |

### 3. Define Entry Zone
- Use `tv_draw_shape` to draw a rectangle marking the entry zone.
- Label it with `tv_draw_shape` type `text`.
- The zone should be tight (5-15 pip range for forex).

### 4. Define Invalidation (Stop Loss)
- SL goes beyond the structure that would invalidate the setup.
- Typically: beyond the recent swing low/high, or beyond the OB/FVG.
- Draw SL line with `tv_draw_shape` type `horizontal_line` in red.

### 5. Define Targets (Take Profit)
- **TP1**: First liquidity pool or opposing OB/FVG in the direction of the trade.
- **TP2**: Next major liquidity pool or HTF PD array.
- Draw TP lines with `tv_draw_shape` type `horizontal_line` in green.

### 6. Calculate R:R
- Risk = |Entry - SL|
- Reward (TP1) = |TP1 - Entry|
- R:R must be ≥ 1.0:1 minimum (from `_config/trading_rules.md`).
- If R:R < minimum → NO TRADE.

### 7. Set Alerts
- Create price alerts at entry zone, SL, and TP1:
  `tv_alert_create` for each level.

### 8. Capture Setup
- `tv_capture_screenshot` → save to `../../shared/<DATE>/<PAIR>/screenshots/05_entry.png`

## Output Requirements

Create `output/entry_plan.md`:

```markdown
# Entry Plan — [PAIR] — [DATE]

## Model
**[Model Name]** from Stage 04

## Entry Setup
- **Entry TF**: [15m/5m/1m]
- **Entry Zone**: [price range]
- **Entry Pattern**: [OTE/Unicorn/SCOB/2FVG/Breaker/Silver Bullet/MMXM]
- **Trigger**: [what confirms entry — e.g., "MSS on 5m + FVG fill"]

## Risk Parameters
| Parameter | Price | Distance from Entry |
|-----------|-------|---------------------|
| Entry | [price] | — |
| Stop Loss | [price] | [X] pips |
| TP1 | [price] | [X] pips |
| TP2 | [price] | [X] pips |

## Risk-Reward
- **R:R (TP1)**: [X]:1
- **R:R (TP2)**: [X]:1
- **Position Size**: calculated in Stage 06

## Chart Reference
![Entry Setup](screenshots/05_entry.png)

## Checklist
- [ ] Entry zone aligns with HTF bias (Stage 01)
- [ ] Entry at a key PD array (Stage 02)
- [ ] Inside active killzone (Stage 03)
- [ ] Model prerequisites met (Stage 04)
- [ ] R:R ≥ 1.5:1
- [ ] No opposing news/events
- [ ] Invalidation clearly defined

## ICT Knowledge Reference

Before writing this stage, query the ICT knowledge base:

```bash
node tools/ict_rag.cjs --query "ICT Silver Bullet entry trigger checklist FVG fill MSS"
```

```bash
node tools/ict_rag.cjs --query "ICT optimal trade entry OTE Fibonacci retracement zone"
```

```bash
node tools/ict_rag.cjs --query "ICT displacement FVG entry on retracement"
```

Cite ICT sources in your output with the format: `[ICT: concept-name.md]`
