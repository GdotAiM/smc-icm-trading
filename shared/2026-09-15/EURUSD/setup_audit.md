# Setup Audit — EURUSD (2026-09-15)

- **Verdict:** CHALLENGED (confidence 72/100)
- **Status:** ok
- **Iterations:** 0

## Evidence
- engine_1h: EURUSD structure bias=bearish
- one_trade_setup: tradeable=true
- daily_bias: bearish (1.00%)
- firstOpp detail: No session raid + MSS confirmed yet. Monitoring all sessions in priority order.
- pdZone: DISCOUNT

## Counter-Evidence
- MMXM step 2/5 GATE CLOSED - cannot enter until DISTRIBUTION
- registry NO TRADE - no single complete model sequence
- firstOpp UNLOCKED - no session raid + MSS confirmed yet
- invalidation: TRADE INVALID - at least one dimension failed

## Recommendations
- Wait for session raid lock + MSS before entering
- Monitor DXY as directional filter

## Reasoning
HYPOTHESIS: Evaluating whether EURUSD has a tradeable setup today. EVIDENCE: tradeable=true, bias=bearish, locked=false, engineBias=bearish, MMXM step=2/5, coherence_broken=false. COUNTER-EVIDENCE: MMXM step 2/5 GATE CLOSED - cannot enter until DISTRIBUTION; registry NO TRADE - no single complete model sequence; firstOpp UNLOCKED - no session raid + MSS confirmed yet; invalidation: TRADE INVALID - at least one dimension failed. VERDICT: CHALLENGED.
