# Setup Audit — XAUUSD (2026-08-13)

- **Verdict:** CHALLENGED (confidence 88/100)
- **Status:** ok
- **Iterations:** 13

## Evidence
- stages/01_htf_bias/output/xauusd_bias.md — BULLISH 1.00, 1D+4H aligned
- stages/05b_micro_confirmation/output/xauusd_coherence.md — 10/10 GO, NY AM killzone ×1.4
- stages/05b_micro_confirmation/output/xauusd_trigger_check.md — 4/5 triggers, 5m FVG + SSL sweeps
- stages/00_macro_context/output/xauusd_weekly_profile.md — Consolidation Thu Bullish Rev, weekly anchor BUY ×1.4
- stages/04_model_selection/output/xauusd_active_models.md — 6 complete BUY models listed

## Counter-Evidence
- decision.json resolved.tie=true cites WP-17 locked-pool rule while poolContext.locked=false and 'No session raid + MSS confirmed yet' — rule precondition unmet
- stages/05b_micro_confirmation/output/xauusd_invalidation.md — TRADE INVALID, 2 MODEL dimensions failed (SB window, no unmitigated OB for MMXM)
- stages/05b_micro_confirmation/output/xauusd_guard.md — DO NOT ENTER, JUDAS_SWING + INVERSION_MISSING blocked, entry allowed ❌
- stages/05b_micro_confirmation/output/xauusd_inducement.md — GATE CLOSED, insufficient data
- stages/00_macro_context/output/xauusd_mmxm.md — SMR not detected, PRE-SMR entry phase (contradicts 'sequence complete')
- stages/00_council_vote/output/xauusd_narrative.md — MMXM NOT APPLICABLE, missing HTF POI
- stages/05_entry_refinement/output/xauusd_entry_plan.md — R:R 0.77:1 ✗, 8:00 reversal window active 'Do NOT enter against the reversal', data age 68m
- stages/00_macro_context/output/xauusd_ipda.md — PREMIUM all TFs, IPDA draw DOWN, buying into sell zone
- stages/00_council_vote/output/xauusd_coherence_audit.md — 50/100 POOR coherence, lens + temporal divergence
- stages/03_session_time/output/xauusd_bread_and_butter.md — active SELL setup (offset-distribution, fake breakout)
- stages/02_key_levels/output/xauusd_irl_erl.md — NEUTRAL bias, WAIT guidance
- stages/00_macro_context/output/xauusd_high_precision.md — stale, dated 2026-08-10; intraday profile DEGRADED/INVALID

## Recommendations
- Do not treat the registry 'SETUP COMPLETE' as an executable signal until the invalidation, guard, and inducement gates all return VALID/OPEN — they currently block entry.
- Re-resolve the BUY/SELL tie only when a pool is actually locked (raid + MSS confirmed); WP-17 must not fire on an unlocked pool — add a hard guard that skips tie resolution when poolLocked=false.
- Reconcile the MMXM gate: 'sequence complete' contradicts SMR-not-detected / PRE-SMR / missing HTF POI. Require the MMXM-specific POI (unmitigated OB) to be at/near entry price, not 50-75 pts below.
- Fix cross-file MMXM step inconsistency (3/5 vs 0/4 vs 0) and cycle phase (DISTRIBUTION vs UNKNOWN) before relying on model completeness.
- Refresh data (68m stale, high_precision dated 2026-08-10) and re-run micro confirmation before any entry decision.
- Do not enter against the active 8:00-8:30 reversal window and Judas Swing; wait for 1m sweep + CHoCH inversion and R:R ≥ 1:1.

## Reasoning
HYPOTHESIS: the decision asserts SETUP COMPLETE (6 complete BUY models, MMXM primary, conf 0.69) with a tie resolved by WP-17's locked-pool rule. EVIDENCE: HTF 1D/4H bullish, NY AM killzone active, 15m/5m bullish CHoCH with 5m FVG and SSL sweeps, weekly profile bullish-reversal, and a 10/10 micro coherence score genuinely support a bullish lean. COUNTER-EVIDENCE: the tie was resolved via a locked-pool rule while poolContext explicitly reports no locked pool and no raid+MSS confirmed (PM raid validRaid=false, MSS bearish); the invalidation, guard, and inducement gates all independently say TRADE INVALID / DO NOT ENTER / GATE CLOSED; MMXM 'sequence complete' is contradicted by SMR-not-detected, PRE-SMR, and 'MMXM NOT APPLICABLE — missing HTF POI'; R:R is below 1:1; IPDA, IRL/ERL, council coherence (50/100), and the bread-and-butter SELL setup all oppose the long; and inputs are stale/degraded. VERDICT: CHALLENGED — the decision's core premises are materially contradicted by its own stage outputs, so the SETUP COMPLETE verdict is not well supported.
