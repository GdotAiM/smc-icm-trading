# Setup Audit — GBPUSD (2026-08-13)

- **Verdict:** CHALLENGED (confidence 72/100)
- **Status:** ok
- **Iterations:** 16

## Evidence
- stages/04_model_selection/output/GBPUSD_active_models.md — Verdict NO TRADE, 0 complete setup(s), MMXM Step 2/5 MANIPULATION gate closed; distribution/expansion models blocked
- stages/05_entry_refinement/output/GBPUSD_entry_plan.md — Model NO TRADE — registry; no single complete model; Lecture 1 raid/MSS incomplete
- stages/05b_micro_confirmation/output/GBPUSD_inducement.md — GATE CLOSED — insufficient data
- stages/05b_micro_confirmation/output/GBPUSD_invalidation.md — TRADE INVALID — exit or do not enter; SB model invalidated
- stages/00_council_vote/output/GBPUSD_coherence_audit.md — 70/100 adequate coherence; lens divergence and structure/discount contradiction
- stages/02_key_levels/output/GBPUSD_irl_erl.md — NEUTRAL bias, WAIT

## Counter-Evidence
- stages/05b_micro_confirmation/output/GBPUSD_coherence.md — GO, 10/10 session-adjusted, all conditions met; directly opposes NO TRADE
- decision.json internal inconsistency — PM trigger raided=true/mssConfirmed=true but detail says 'AWAITING MSS: 1 pool(s) raided, none confirmed'; poolContext says 'No session raid + MSS confirmed yet'
- stages/01_htf_bias/output/GBPUSD_bias.md — BULLISH confidence 1.00 and session aligned, while decision relies on 4H bearish manipulation; no explicit resolution of HTF vs MMXM step
- stages/05b_micro_confirmation/output/GBPUSD_coherence.md says Macro MMXM Step 0 while decision says Step 2/5 — phase inconsistency

## Recommendations
- Resolve the mssConfirmed/validRaid contradiction in decision.json before relying on the MMXM gate as the sole reason; if PM MSS is confirmed, state why validRaid=false and sweptSide=null
- Reconcile macro-micro coherence GO with model registry NO TRADE; document whether GO is overridden by MMXM step gate or by inducement/invalidation
- Align MMXM step references across stages (coherence says Step 0, decision says Step 2/5) to avoid conflicting audit trails
- Add explicit tie-break note: even if a legacy shadow model scores high, zero complete sequences in registry means NO TRADE

## Reasoning
HYPOTHESIS — The decision is NO TRADE because the MMXM step gate is closed at MANIPULATION (step 2/5) and zero complete model sequences exist. EVIDENCE — The model registry explicitly reports NO TRADE with 0 complete setups and blocks distribution/expansion models during MANIPULATION; the entry plan repeats NO TRADE; the inducement gate is closed; the invalidation file says TRADE INVALID; the IRL/ERL file says WAIT; the council audit shows only adequate coherence with lens divergence. COUNTER-EVIDENCE — The strongest case against the decision is the macro-micro coherence file scoring GO at 10/10 session-adjusted, directly contradicting NO TRADE; decision.json itself is internally inconsistent because the PM trigger is marked raided=true and mssConfirmed=true while the detail says no MSS is confirmed; the HTF bias file is BULLISH at 1.00 confidence while the decision leans on 4H bearish manipulation; and the MMXM step is reported as Step 0 in one stage and Step 2/5 in the decision. VERDICT — The NO TRADE outcome is probably correct, but the reasoning trail contains material contradictions and unresolved phase/MSS inconsistencies, so the decision is CHALLENGED rather than fully ALIGNED.
