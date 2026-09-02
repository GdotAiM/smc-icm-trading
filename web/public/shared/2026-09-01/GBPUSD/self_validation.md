# Self-Validation — GBPUSD — 2026-09-01

> Mechanical, pre-LLM stage-claim verification. Verdict: **CONFLICT** (1 FAIL / 3 WARN / 5 PASS).

| Check | Level | Source | Detail |
|-------|-------|--------|--------|
| direction_vs_bias | **PASS** | 01_htf_bias/output/bias.md | Decision LONG aligns with HTF bias BULLISH. |
| trigger_text_direction | **PASS** | 05_entry_refinement/output/entry_plan.md | Trigger text is direction-consistent (- **Trigger**: MSS upside + bullish FVG fill on 5m). |
| micro_trigger_direction | **FAIL** | 05b_micro_confirmation/output/trigger_check.md | Decision LONG but the trigger checklist runs a SHORT setup (Direction: SHORT). |
| guard_vs_gates | **PASS** | 05b_micro_confirmation/output/guard.md | Guard blocks entry and decision gates reflect it (fail-closed working as intended). |
| sl_tp_geometry | **PASS** | decision.json | LONG: SL 1.35113 < entry 1.35474; TP1 1.36007 > entry. |
| sweep_claim | **WARN** | engine_5m.json | Decision trades but engine 5m reports 2 pool(s) (e.g. BSL) — none marked swept. Sweep-dependent models (purge-gated) would be contradicting the trade. |
| sweep_claim | **PASS** | engine_15m.json | 3 pool(s), 1 swept. |
| fvg_claim | **WARN** | engine_5m.json | Decision trades on SCOB but engine 5m reports 0 FVGs — an FVG-dependent setup with no unmitigated FVG on the entry TF. |
| fvg_claim | **WARN** | engine_15m.json | Decision trades on SCOB but engine 15m reports 0 FVGs — an FVG-dependent setup with no unmitigated FVG on the entry TF. |
