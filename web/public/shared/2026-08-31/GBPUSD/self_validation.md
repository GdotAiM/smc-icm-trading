# Self-Validation — GBPUSD — 2026-08-31

> Mechanical, pre-LLM stage-claim verification. Verdict: **CONFLICT** (1 FAIL / 3 WARN / 5 PASS).

| Check | Level | Source | Detail |
|-------|-------|--------|--------|
| direction_vs_bias | **PASS** | 01_htf_bias/output/bias.md | Decision LONG aligns with HTF bias BULLISH. |
| trigger_text_direction | **PASS** | 05_entry_refinement/output/entry_plan.md | Trigger text is direction-consistent (- **Trigger**: MSS upside + bullish FVG fill on 5m). |
| micro_trigger_direction | **FAIL** | 05b_micro_confirmation/output/trigger_check.md | Decision LONG but the trigger checklist runs a SHORT setup (Direction: SHORT). |
| guard_vs_gates | **PASS** | 05b_micro_confirmation/output/guard.md | Guard blocks entry and decision gates reflect it (fail-closed working as intended). |
| sl_tp_geometry | **PASS** | decision.json | LONG: SL 1.35195 < entry 1.35451; TP1 1.35990 > entry. |
| sweep_claim | **WARN** | engine_5m.json | Decision trades but engine 5m reports 3 pool(s) (e.g. SSL) — none marked swept. Sweep-dependent models (purge-gated) would be contradicting the trade. |
| sweep_claim | **WARN** | engine_15m.json | Decision trades but engine 15m reports 4 pool(s) (e.g. BSL) — none marked swept. Sweep-dependent models (purge-gated) would be contradicting the trade. |
| fvg_claim | **WARN** | engine_5m.json | Decision trades on OTE + Institutional OB but engine 5m reports 0 FVGs — an FVG-dependent setup with no unmitigated FVG on the entry TF. |
| fvg_claim | **PASS** | engine_15m.json | 2 unmitigated FVG(s) on 15m. |
