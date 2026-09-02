# Self-Validation — EURUSD — 2026-08-14

> Mechanical, pre-LLM stage-claim verification. Verdict: **CAUTION** (0 FAIL / 5 WARN / 4 PASS).

| Check | Level | Source | Detail |
|-------|-------|--------|--------|
| direction_vs_bias | **PASS** | 01_htf_bias/output/bias.md | Decision is NO TRADE — direction not applicable. |
| trigger_text_direction | **WARN** | 05_entry_refinement/output/entry_plan.md | No decision direction (NO TRADE) — trigger not checked. |
| micro_trigger_direction | **WARN** | 05b_micro_confirmation/output/trigger_check.md | NO TRADE decision — direction not applicable. |
| guard_vs_gates | **PASS** | 05b_micro_confirmation/output/guard.md | Guard blocks entry and decision gates reflect it (fail-closed working as intended). |
| sl_tp_geometry | **WARN** | decision.json | No entry/SL/TP (NO TRADE or incomplete) — geometry not checked. |
| sweep_claim | **PASS** | engine_5m.json | 2 pool(s), 0 swept. |
| sweep_claim | **PASS** | engine_15m.json | 4 pool(s), 0 swept. |
| fvg_claim | **WARN** | engine_5m.json | 0 unmitigated FVG(s) on 5m. |
| fvg_claim | **WARN** | engine_15m.json | 0 unmitigated FVG(s) on 15m. |
