# Self-Validation — NAS100 — 2026-08-12

> Mechanical, pre-LLM stage-claim verification. Verdict: **CONFLICT** (1 FAIL / 1 WARN / 7 PASS).

| Check | Level | Source | Detail |
|-------|-------|--------|--------|
| direction_vs_bias | **PASS** | 01_htf_bias/output/bias.md | Decision SHORT aligns with HTF bias BEARISH. |
| trigger_text_direction | **PASS** | 05_entry_refinement/output/entry_plan.md | Trigger text is direction-consistent (- **Trigger**: MSS downside + bearish FVG fill on 5m). |
| micro_trigger_direction | **FAIL** | 05b_micro_confirmation/output/trigger_check.md | Decision SHORT but the trigger checklist runs a LONG setup (Direction: LONG). |
| guard_vs_gates | **PASS** | 05b_micro_confirmation/output/guard.md | Guard blocks entry and decision gates reflect it (fail-closed working as intended). |
| sl_tp_geometry | **PASS** | decision.json | SHORT: SL 29755.10846 > entry 29601.60000; TP1 29433.25000 < entry. |
| sweep_claim | **PASS** | engine_5m.json | 6 pool(s), 3 swept. |
| sweep_claim | **PASS** | engine_15m.json | 6 pool(s), 2 swept. |
| fvg_claim | **WARN** | engine_5m.json | Decision trades on 2FVG Entry but engine 5m reports 0 FVGs — an FVG-dependent setup with no unmitigated FVG on the entry TF. |
| fvg_claim | **PASS** | engine_15m.json | 1 unmitigated FVG(s) on 15m. |
