# Self-Validation — EURUSD — 2026-08-31

> Mechanical, pre-LLM stage-claim verification. Verdict: **CONFLICT** (1 FAIL / 1 WARN / 7 PASS).

| Check | Level | Source | Detail |
|-------|-------|--------|--------|
| direction_vs_bias | **PASS** | 01_htf_bias/output/bias.md | Decision LONG aligns with HTF bias BULLISH. |
| trigger_text_direction | **PASS** | 05_entry_refinement/output/entry_plan.md | Trigger text is direction-consistent (- **Trigger**: MSS upside + bullish FVG fill on 5m). |
| micro_trigger_direction | **FAIL** | 05b_micro_confirmation/output/trigger_check.md | Decision LONG but the trigger checklist runs a SHORT setup (Direction: SHORT). |
| guard_vs_gates | **WARN** | 05b_micro_confirmation/output/guard.md | Guard clear; decision gates consistent. |
| sl_tp_geometry | **PASS** | decision.json | LONG: SL 1.15734 < entry 1.15890; TP1 1.16596 > entry. |
| sweep_claim | **PASS** | engine_5m.json | 4 pool(s), 1 swept. |
| sweep_claim | **PASS** | engine_15m.json | 4 pool(s), 1 swept. |
| fvg_claim | **PASS** | engine_5m.json | 3 unmitigated FVG(s) on 5m. |
| fvg_claim | **PASS** | engine_15m.json | 3 unmitigated FVG(s) on 15m. |
