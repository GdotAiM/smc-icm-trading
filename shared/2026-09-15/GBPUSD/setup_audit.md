# Setup Audit — GBPUSD (2026-09-15)

- **Verdict:** ALIGNED (confidence 53/100)
- **Status:** ok
- **Iterations:** 0

## Evidence
- engine_1h: GBPUSD structure bias=bearish
- one_trade_setup: tradeable=true
- daily_bias: bearish (0.75%)
- firstOpp LOCKED: direction=SELL boost=1.3x
- firstOpp detail: 🔒 FIRST OPPORTUNITY LOCKED: PM session raided + MSS confirmed → SELL bias locked. TP: Prev Day AM LOW @ 1.34640. Agreeing models ×1.3, disagreeing ×0.7.
- pdZone: DISCOUNT
- 2 session(s) LOCKED with MSS

## Counter-Evidence
- low coherence despite lock - size reduced accordingly
- coherence_audit BROKEN (<40/100) - structural contradictions detected
- MMXM step 2/5 GATE CLOSED - cannot enter until DISTRIBUTION
- registry NO TRADE - no single complete model sequence
- invalidation: TRADE INVALID - at least one dimension failed

## Recommendations
- Reduced position size recommended due to structural contradictions
- Entry viable per: P1 PM Session (prev day 1:30-4:00 PM): ✅ LOCKED — ✅ RAIDED + MSS CONFIRMED: Buy-side above swept, MS

## Reasoning
HYPOTHESIS: Evaluating whether GBPUSD has a tradeable setup today. EVIDENCE: tradeable=true, bias=bearish, locked=true, engineBias=bearish, MMXM step=2/5, coherence_broken=true. COUNTER-EVIDENCE: low coherence despite lock - size reduced accordingly; coherence_audit BROKEN (<40/100) - structural contradictions detected; MMXM step 2/5 GATE CLOSED - cannot enter until DISTRIBUTION; registry NO TRADE - no single complete model sequence; invalidation: TRADE INVALID - at least one dimension failed. VERDICT: ALIGNED.
