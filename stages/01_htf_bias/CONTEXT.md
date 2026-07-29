# Stage 01 — Higher Timeframe Bias & Market Structure

## Purpose
Establish a clear, evidence-based directional bias using higher timeframe
market structure and institutional delivery logic. This bias becomes the
foundation for every subsequent decision.

## Inputs

| Source | Location | What to load |
|--------|----------|--------------|
| User | Conversation | Which pair(s) to analyze |
| Config | `../../_config/preferred_pairs.md` | Active instruments |
| Config | `../../_config/trading_rules.md` | Minimum structure requirements |
| Engine | `npx smc-engine` | Deterministic structure analysis |
| TV MCP | TradingView | Daily + H4 charts |
| Tool | `python tools/data_fetcher.py` | OHLCV data for Kronos/Chronos |
| Tool | `python tools/kronos_forecast.py` | Quantitative path forecast |
| Tool | `python tools/chronos_forecast.py` | Alternative forecast |

## Process

### 1. Load Charts
- Use TradingView MCP to open the primary pair on Daily and H4.
- Switch between timeframes as needed with `tv_chart_set_timeframe`.
- Take a screenshot of the clean chart with `tv_capture_screenshot`.

### 2. Run SMC Engine
- Call `npx smc-engine --pair <PAIR> --tf 1d --output shared/<DATE>/<PAIR>/engine_daily.json`
- Call `npx smc-engine --pair <PAIR> --tf 4h --output shared/<DATE>/<PAIR>/engine_4h.json`
- The engine returns: structure (BOS/CHoCH, pivots, bias, phase), liquidity pools,
  order blocks, FVGs, PD array zones, daily bias, SMT divergence, draw targets.

### 3. Map Market Structure
- Identify the most recent significant swing points from engine output.
- Determine whether the market is in a clear uptrend, downtrend, or ranging.
- Mark Break of Structure (BOS) and Change of Character (CHoCH / MSS) on TV.
- Use `tv_draw_shape` to draw trendlines at key structure breaks.
- Note any major displacement legs.

### 4. Run Quantitative Forecasts (Optional)
- Use `python tools/data_fetcher.py --pair <PAIR> --tf 1d --lookback 400`
  to get OHLCV data.
- Run Kronos: `python tools/kronos_forecast.py --input <data.json> --pred-len 48`
- Run Chronos-2: `python tools/chronos_forecast.py --input <data.json> --pred-len 48`
- Save both to `shared/<DATE>/<PAIR>/`

### 5. Synthesize Bias
- Primary weight: Pure SMC/ICT market structure (engine output).
- Secondary weight: Kronos forecast (finance-native).
- Tertiary weight: Chronos-2 (general confirmation / uncertainty).
- Final bias options: **Bullish / Bearish / Neutral / Conditional**.

## Output Requirements

Create `output/bias.md` with the following structure:

```markdown
# HTF Bias — [PAIR] — [DATE]

## Structural Bias
[Clear statement + key swing points from engine]

## Key Observations
- ...
- ...

## Engine Summary
- Structure: [bullish/bearish/neutral], confidence: [%]
- Daily Bias: [aligned/opposed/neutral]
- PD Array: [premium/discount/equilibrium]
- Phase: [expansion/continuation/accumulation/distribution]

## Quantitative Forecasts (if run)
- Kronos: [median path direction + key levels]
- Chronos-2: [median path + uncertainty band]

## Final Bias
**[Bullish / Bearish / Neutral]** — Confidence: **[High / Medium / Low]**

## Notes for Next Stages
[Anything the key levels or model selection stages should pay attention to]
```

## Rules

- Do not force a directional bias if structure is unclear.
- Higher timeframe always overrides lower timeframe noise.
- Explicitly state when structure and quantitative models disagree.
- If bias is Neutral, the remaining stages should still run but signal
  "No Trade" unless conditions change.

## ICT Knowledge Reference

Before writing this stage, query the ICT knowledge base:

```bash
node tools/ict_rag.cjs --query "ICT market structure break of structure BOS change of character CHOCH"
```

```bash
node tools/ict_rag.cjs --query "ICT top down analysis multi-timeframe approach"
```

```bash
node tools/ict_rag.cjs --query "ICT daily bias trick how to read daily chart"
```

Cite ICT sources in your output with the format: `[ICT: concept-name.md]`
