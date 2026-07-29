# SMC-ICM Hybrid — System Manual

## Architecture Overview

This is a **filesystem-native AI trading workspace** that combines ICM (Interpretable Context Methodology), deterministic SMC/ICT engine analysis, TradingView visualization, and statistical forecasting — all orchestrated by Claude Code.

### The Five Layers

```
LAYER 0: Filesystem        Folders + Markdown = Workflow
LAYER 1: SMC Engine        Deterministic detection (pure TypeScript, no LLM)
LAYER 2: Claude Code       AI reasoning — walks stages, writes decisions
LAYER 3: TradingView CDP   Chart control, drawing, data extraction (74 tools)
LAYER 4: Web Dashboard     Read-only view of all stage outputs
```

### How It Works (Agent Perspective)

When you say "Run full analysis on EURUSD," Claude does this:

1. **Reads `CONTEXT.md`** to understand the 7-stage workflow
2. **Fetches live OHLCV from TradingView** via CDP (Chrome DevTools Protocol)
3. **Runs `npx smc-engine`** on each timeframe — pure TypeScript, no AI involved
4. **Reads each stage's `CONTEXT.md`** for specific instructions
5. **Writes markdown output** to `stages/0X_*/output/*.md`
6. **Draws levels on TradingView** via CDP for visual confirmation
7. **Generates statistical forecasts** and overlays them on the chart

The key insight: **Claude doesn't run the SMC calculations** — it reads the engine's JSON output and writes human-readable analysis. The engine is deterministic (same input → same output, every time). Claude adds interpretation, narrative, and cross-pair confluence analysis.

---

## Daily Workflow (User Perspective)

### Startup (Once Per Day)

```
1. Open TradingView Desktop
2. In Claude Code: "Start the dashboard"
3. In Claude Code: "Run top-down analysis on EURUSD"
```

This takes ~60 seconds and produces a full 7-timeframe cascade report.

### Full Session Analysis

```
"Run full analysis on EURUSD, GBPUSD, Gold, NAS100, and DXY"
```

This takes ~3 minutes and produces:
- 5 pair × 7 timeframe = 35 engine reports
- Multi-pair confluence dashboard
- Correlation checks (DXY inverse, Gold risk sentiment, equities)

### Entry Planning

```
"Build entry plan for GBPUSD"
```

Produces Stages 01-07 for the pair:
- HTF bias, key levels, session gating, model selection
- Entry price, SL at structural invalidation, TP1/TP2 at 1:1/2:1 R:R
- Position size calculation with account risk parameters

### Visualization

```
"Show GBPUSD on the chart with forecast"
```

- Switches TradingView to the pair/timeframe
- Draws horizontal lines for Entry, SL, TP1, TP2, Swing High
- Draws risk zone rectangle
- Overlays statistical forecast path with confidence bands

### Journal Review

```
"Journal today's trades"
```

Reads all stage outputs and writes a structured review with:
- Decision quality assessment (1-5 per category)
- Forecast vs reality comparison
- Lessons learned and improvement actions

---

## The 7-Stage ICM Workflow

Each stage is a folder with `CONTEXT.md` (agent instructions) and `output/` (results).

### Stage 01 — HTF Bias
**Question**: What direction is the market trending?
**Engine**: `npx smc-engine --tf 1W,1D,4H` → structure analysis
**Output**: `stages/01_htf_bias/output/bias.md`
**Key data**: Bias cascade (1W→1D→4H→1H), BOS/CHoCH events, swing levels, confidence scores

### Stage 02 — Key Levels
**Question**: Where are the institutional reference points?
**Engine**: `npx smc-engine --tf 1D,4H,1H --mode levels`
**Output**: `stages/02_key_levels/output/levels.md`
**Key data**: Liquidity pools (BSL/SSL), Order Blocks, Fair Value Gaps, draw targets

### Stage 03 — Session & Time
**Question**: Are we in a high-probability trading window?
**Logic**: UTC hour → session (Asia/London/NY AM/NY PM) → killzone check → Silver Bullet eligibility
**Output**: `stages/03_session_time/output/session.md`
**Key data**: Active session, gating decision (ACTIVE/MONITOR/NO TRADE)

### Stage 04 — Model Selection
**Question**: Which ICT model best fits current conditions?
**Engine**: Evaluates 6 core models against engine data → scored and ranked
**Output**: `stages/04_model_selection/output/active_models.md`
**Key data**: Model scores, primary model, confluence breakdown (0-9 points)

### Stage 05 — Entry Refinement
**Question**: Exactly where and how do we enter?
**Logic**: SL at structural invalidation (swing high/low + ATR buffer), TP1 at 1:1 minimum, TP2 at 2:1
**Output**: `stages/05_entry_refinement/output/entry_plan.md`
**Key data**: Entry/SL/TP1/TP2 prices, pip distances, R:R ratios, reasoning for each level

### Stage 06 — Risk Management
**Question**: How much do we risk?
**Logic**: Account balance × risk % / SL pips / pip value = position size
**Output**: `stages/06_risk_management/output/risk_plan.md`
**Key data**: Position size in lots, risk amount in dollars, trade ticket

### Stage 07 — Journal Review
**Question**: What did we learn?
**Logic**: Compare plan vs outcome, rate each decision independently of result
**Output**: `stages/07_journal_review/output/review.md`
**Key data**: Decision quality scores, forecast accuracy, lessons learned

---

## Tool Reference

### Data Pipeline

| Tool | Purpose | Command |
|------|---------|---------|
| `fetch_multi_tf.cjs` | Get all 7 TFs for one pair from TV | `node tools/tv-mcp/fetch_multi_tf.cjs` |
| `fetch_confluence.cjs` | Get all TFs for 5 pairs from TV | `node tools/tv-mcp/fetch_confluence.cjs` |
| `fetch_topdown.cjs` | Get all 7 TFs from TV | `node tools/tv-mcp/fetch_topdown.cjs` |
| `data_fetcher.py` | Get OHLCV from Binance/Yahoo | `python tools/data_fetcher.py --pair EURUSD --tf 1d` |

### SMC Engine

| Tool | Purpose | Command |
|------|---------|---------|
| `smc-engine` | Deterministic structure/liquidity/OB/FVG analysis | `npx smc-engine --pair EURUSD --tf 4h --input candles.json` |

**Modes**: `full` (complete report), `structure` (bias only), `levels` (pools+OBs+FVGs), `entry` (LTF refinement), `risk` (ATR-based SL)

**Output**: JSON SmcReport with structure, liquidity, orderBlocks, fvg, pdArray, dailyBias, smt, draw targets

### Forecasting

| Tool | Purpose | Command |
|------|---------|---------|
| `forecast.py` | Statistical log-linear + Monte Carlo | `python tools/forecast.py --input candles.json --pred-len 24` |
| `chronos_forecast.py` | Amazon Chronos-2 ML (needs weights) | `python tools/chronos_forecast.py --input candles.json` |
| `kronos_forecast.py` | Kronos candlestick model (needs clone) | `python tools/kronos_forecast.py --input candles.json` |

### TradingView Control

| Tool | Purpose | Command |
|------|---------|---------|
| `draw_all.cjs` | Draw levels + forecast on chart | `node tools/tv-mcp/draw_all.cjs` |
| `draw_15m.cjs` | Draw 15m setups for Gold + GBPUSD | `node tools/tv-mcp/draw_15m.cjs` |
| `clear_tv.cjs` | Clear all drawings from chart | `node tools/tv-mcp/clear_tv.cjs` |
| `check_tv.cjs` | Check chart state and drawings | `node tools/tv-mcp/check_tv.cjs` |

### Stage Runners

| Tool | Purpose | Command |
|------|---------|---------|
| `run_all_stages.cjs` | Run 7 stages for one pair | `node tools/run_all_stages.cjs` |
| `run_topdown.cjs` | Top-down cascade (7 TFs) | `node tools/run_topdown.cjs` |
| `run_confluence.cjs` | Multi-pair confluence dashboard | `node tools/run_confluence.cjs` |
| `run_pair.cjs` | Full 7-stage for any pair | `node tools/run_pair.cjs GOLD` |

---

## Configuration

Edit `_config/*.md` to customize:

| File | What You Set |
|------|-------------|
| `trading_rules.md` | Minimum confluence, R:R minimum, SL placement rules, session rules |
| `risk_parameters.md` | Account balance, risk %, daily loss limit, position sizing |
| `preferred_pairs.md` | Which pairs you trade, preferred sessions |
| `session_preferences.md` | Killzone times, Silver Bullet windows, session weights |
| `model_priority.md` | Your ranked preference of ICT models (tier 1-4) |

---

## Quick Commands Cheat Sheet

```
# Daily startup
"Launch TradingView with CDP"
"Start the dashboard"
"Run top-down analysis on EURUSD"

# Full market scan
"Run confluence — EURUSD, GBPUSD, Gold, NAS100, DXY"

# Entry on a specific pair
"Run all stages on GBPUSD"
"Show GBPUSD on the chart with forecast"

# Intraday refinement
"Analyze GBPUSD 15m with forecast"

# End of day
"Journal today's GBPUSD trade"

# Single operations
"Draw the levels for Gold"
"Clear the chart"
"Forecast GBPUSD next 24 bars"
"Show me the trade ticket for Gold"
```

---

## Prerequisites

### Always Required
- TradingView Desktop running with `--remote-debugging-port=9222`
- Node.js 22+ with `tsx` available
- Python 3.10+

### Optional
- Chronos-2: `pip install git+https://github.com/amazon-science/chronos-forecasting.git`
- Kronos: Clone from `github.com/NeoQuasar/Kronos` and install
- Web Dashboard: `cd web && npm run dev`

### Launch TradingView
The correct command for MSIX-installed TradingView Desktop:
```
Start-Process "shell:AppsFolder\TradingView.Desktop_n534cwy3pjxzj!TradingView.Desktop" -ArgumentList "--remote-debugging-port=9222"
```

---

## Architecture Principles

1. **Filesystem IS the database** — no PostgreSQL, no Docker. One folder per day per pair. Historical queries via `grep` or the web dashboard.

2. **Engine is deterministic** — same candles in = same SmcReport out. No AI involved in SMC detection. This means the engine's output is objective and auditable.

3. **Claude is the interpreter, not the calculator** — Claude reads engine JSON, writes markdown narratives, selects models, places SL/TP. It never computes structure/liquidity/OBs itself.

4. **SL at structural invalidation** — never at liquidity pools. For shorts: HTF swing HIGH + ATR buffer. For longs: HTF swing LOW − ATR buffer.

5. **TP must be ≥ SL distance** — minimum 1:1 R:R enforced. If no liquidity pool is far enough, use measured move at 1:1.

6. **Multi-pair confluence required** — never trade one pair in isolation. Check DXY inverse correlation, sister pairs, and risk sentiment (Gold, equities).

7. **Forecast is confluence, not signal** — the statistical/ML forecast is one input among many. When it agrees with SMC, confidence increases. When it diverges, dig deeper or wait.

8. **Human-in-the-loop by design** — every stage output is a plain markdown file. Read it. Edit it if you disagree. The agent continues from YOUR corrections, not its own assumptions.
