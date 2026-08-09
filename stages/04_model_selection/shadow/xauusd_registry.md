# WP-8 Registry Shadow — XAUUSD — 2026-08-09

Legacy pipeline ran in parallel; the decision path is NOT yet flipped (shadow mode, plan D2).

| Model | Eligible | Verdict | Sequence gates |
|-------|----------|---------|----------------|
| MMXM Sell Model | ✅ | — | sweep:✓, ob:✓, mss:✗, smt:✓ |
| MMXM Buy Model | ❌ | — | sweep:✓, ob:✓, mss:✗, smt:✓ |
| Silver Bullet | ❌ | — | sweep:✓, reversal:✓, mss:✗, fvg:✓ |
| OTE + Institutional OB | ✅ | — | ob:✓, ote:✗, array_mitigated:✓ |
| Turtle Soup | ✅ | — | htf_ranging:✓, sweep:✓, reversal:✓, mss:✗, displacement:✓ |
| Unicorn (OTE+FVG) | ✅ | — | ob:✓, fvg:✓, ote:✗ |
| Breaker Block | ✅ | — | ob:✓, reversal:✓, mss:✗ |
| SCOB | ✅ | ✅ COMPLETE | ob:✓, fvg:✓, displacement:✓ |
| 2FVG Entry | ✅ | ✅ COMPLETE | fvg:✓, sweep:✓ |
| Judas Swing | ❌ | — | sweep:✓, mss:✗ |
| Asian Range Breakout | ❌ | — | sweep:✓, ob:✓ |
| NWOG/NDOG | ✅ | ✅ COMPLETE | ob:✓ |
| Mitigation Block | ✅ | ✅ COMPLETE | ob:✓, array_mitigated:✓ |
| Rejection Block | ✅ | ✅ COMPLETE | ob:✓, reversal:✓ |
| London Hunt + IFVG | ❌ | — | lecture2_hunt_swept:✗, lecture2_mss:✗, lecture2_ready:✗ |
| NDOG/NWOG News Model | ❌ | — | lecture4_gap_draw:✗, lecture4_mss:✗, lecture4_ready:✗ |
| 08:30 Liquidity Raid Model | ❌ | — | lecture1_formation:✗, lecture1_raid:✗, lecture1_mss:✗, lecture1_ready:✗ |

## Verdict: NO TRADE
- **Complete setups**: 5
- **Registry primary**: SCOB
- **Legacy primary**: MMXM Buy Model
- **Agreement**: ⚠️ DISAGREE

> Next step (plan D2): review disagreements across live days, tune the sequence
> matrices, then flip the decision path to the registry (delete the legacy
> ranking block from `run_pair.cjs`).
