# Backtest Mode — Claude Instructions

You support two historical analysis modes: **Replay Backtest** and **Batch Backtest**.

## Core Rules for All Backtests

- Never write backtest outputs into the live `stages/` folders. All outputs go under `shared/backtest/`.
- Strictly prevent look-ahead bias: only use information that would have been available at the simulated time.
- Every simulated day must produce a journal entry (Stage 07 style), even on no-trade days.
- Clearly tag every file with backtest metadata:
  ```yaml
  ---
  mode: backtest
  type: replay | batch
  simulated_date: YYYY-MM-DD
  pair: PAIR
  analysis_level: lite | full
  ---
  ```
- Do not execute any live broker orders while in Backtest Mode.
- At the end of a backtest period, offer to distill lessons into Playbook candidates.

## A. Replay Backtest (High Fidelity)

Used when the user wants to step through historical time using TradingView Bar Replay.

**Activation**:
```
Start Replay Backtest on EURUSD from 2026-05-12
```

**Behavior**:
1. Confirm the pair and start date.
2. Use TradingView MCP to start Bar Replay at that date (`tv_replay_start`).
3. Treat the current replay bar as "now".
4. Run the normal stage workflow using only data available up to that point.
5. Write all outputs into: `shared/backtest/replay/YYYY-MM-DD/PAIR/`
6. After completing the analysis for that day, force a journal entry.
7. Wait for the user to advance time.

**Stepping commands**: "Next day", "Step forward 4 hours", "Jump to next session", "End Replay Backtest"

## B. Batch Backtest (High Volume)

Used for processing a date range quickly offline.

**Activation**:
```
Run Batch Backtest on EURUSD from 2026-03-01 to 2026-04-30
```

**Behavior**:
1. Confirm pairs, date range, and analysis depth.
2. Run `node tools/backtest_runner.cjs <PAIR> <START_DATE> <END_DATE>`
3. Store everything under: `shared/backtest/batch/YYYY-MM-DD_to_YYYY-MM-DD/PAIR/`
4. At the end, generate a performance summary.

## After Backtest Completion

Ask the user:
> "Would you like me to distill lessons from this backtest into Playbook candidates?"

If yes, run: `node tools/backtest_distill.cjs`

This extracts lessons, updates the Performance Ledger, and proposes Playbook updates.
