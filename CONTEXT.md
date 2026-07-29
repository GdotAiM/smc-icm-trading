# CONTEXT.md — Daily Trading Workspace Router

This is the top-level controller for the SMC/ICT trading workspace.

## Daily Workflow Overview

Follow this sequence unless the user explicitly requests a different path:

0. **00_macro_context**
   Cycle phase, Po3 state, IPDA dealing range, intraday profile, day context.
   Output: `stages/00_macro_context/output/`

0b. **00_council_vote**
   4-archetype council (Position/Swing/Day/Scalp) voting + narrative + coherence.
   Output: `stages/00_council_vote/output/`

1. **01_htf_bias**
   Establish higher timeframe market structure and directional bias.
   Run both Kronos and Chronos-2 forecasts.
   Output: `stages/01_htf_bias/output/bias.md`

2. **02_key_levels**
   Identify and mark institutional reference points (Order Blocks, FVGs,
   Liquidity pools, Breakers, etc.). Use TradingView MCP to draw them.
   Output: `stages/02_key_levels/output/levels.md`

3. **03_session_time**
   Evaluate current session and relevant time-based models (Silver Bullet,
   Judas Swing, PO3, Killzones, etc.).
   Output: `stages/03_session_time/output/session.md`

4. **04_model_selection**
   Decide which ICT/SMC model(s) from the taxonomy are currently valid.
   Reference the full model library in `references/models/`.
   Output: `stages/04_model_selection/output/active_models.md`

5. **05_entry_refinement**
   Wait for or define precise entry conditions (OTE, Unicorn, SCOB, 2FVG, etc.).
   Draw entry zone + invalidation on TradingView.
   Output: `stages/05_entry_refinement/output/entry_plan.md`

5b. **05b_micro_confirmation**
   LTF coherence check, fractal MMXM, 1m inversion, CISD, BPR, guard validation.
   Output: `stages/05b_micro_confirmation/output/`

6. **06_risk_management**
   Calculate position size, confirm risk-reward, and finalize trade parameters.
   Output: `stages/06_risk_management/output/risk_plan.md`

7. **07_journal_review**
   After the session or trade: review actual outcome vs forecasts and model
   expectations.
   Output: `stages/07_journal_review/output/review.md`

## Important Principles

- Complete one stage fully before moving to the next (unless the user jumps stages).
- Always write intermediate conclusions into the stage's `output/` folder.
- Prefer quality of confluence over quantity of trades.
- If conditions are unclear or conflicting, explicitly say "No Trade" rather than
  forcing a setup.

## Quick Commands the User Might Use

- "Run full daily analysis on EURUSD"
- "Only do HTF bias + key levels"
- "Update the chart with current levels"
- "Compare Kronos vs Chronos on this pair"
- "Journal today's trades"
- "Show me the dashboard"

## Stage Selection

If the user asks to jump to a specific stage, read that stage's `CONTEXT.md`
and all previous stage outputs first. Never operate without the full context
chain.

Begin by confirming the instrument and timeframes the user wants to analyze,
then proceed to Stage 01.
