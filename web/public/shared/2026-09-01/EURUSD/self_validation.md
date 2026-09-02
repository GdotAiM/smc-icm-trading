# Self-Validation — EURUSD — 2026-09-01

> Mechanical, pre-LLM stage-claim verification. Verdict: **CONFLICT** (1 FAIL / 1 WARN / 7 PASS).

| Check | Level | Source | Detail |
|-------|-------|--------|--------|
| direction_vs_bias | **PASS** | 01_htf_bias/output/bias.md | Decision LONG aligns with HTF bias BULLISH. |
| trigger_text_direction | **PASS** | 05_entry_refinement/output/entry_plan.md | Trigger text is direction-consistent (- **Trigger**: MSS upside + bullish FVG fill on 5m). |
| micro_trigger_direction | **FAIL** | 05b_micro_confirmation/output/trigger_check.md | Decision LONG but the trigger checklist runs a SHORT setup (Direction: SHORT). |
| guard_vs_gates | **PASS** | 05b_micro_confirmation/output/guard.md | Guard blocks entry and decision gates reflect it (fail-closed working as intended). |
| sl_tp_geometry | **PASS** | decision.json | LONG: SL 1.15729 < entry 1.15992; TP1 1.16194 > entry. |
| sweep_claim | **PASS** | engine_5m.json | 3 pool(s), 1 swept. |
| sweep_claim | **PASS** | engine_15m.json | 5 pool(s), 2 swept. |
| fvg_claim | **WARN** | engine_5m.json | Decision trades on SCOB but engine 5m reports 0 FVGs — an FVG-dependent setup with no unmitigated FVG on the entry TF. |
| fvg_claim | **PASS** | engine_15m.json | 3 unmitigated FVG(s) on 15m. |
