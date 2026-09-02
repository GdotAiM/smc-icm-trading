# Backtest Data Directory

This folder stores all historical analysis runs. Live analysis goes to `stages/` and `shared/YYYY-MM-DD/`. Backtests go here.

## Structure

```
backtest/
├── meta/                    # Master logs + aggregated stats
│   ├── backtest_log.md      # Every run recorded here
│   └── performance_summary.md
├── replay/                  # Bar Replay runs (high fidelity)
│   └── YYYY-MM-DD/
│       └── PAIR/
└── batch/                   # Bulk offline runs (high volume)
    └── YYYY-MM-DD_to_YYYY-MM-DD/
        └── PAIR/
            ├── daily_summaries/
            ├── journals/
            └── engine_reports/
```

## Rules

1. Never write backtest output into live `stages/` folders
2. Every simulated day must have a journal entry
3. All files tagged with YAML metadata
4. No live broker actions during backtest

## Feeding Memory

Run `node tools/backtest_distill.cjs` to extract lessons from backtest journals into the Playbook and Performance Ledger.
