# Model Selection — EURUSD — 2026-09-02

## Market Context
- Bias: **BULLISH** (1D/4H)
- Session: London PM (NO TRADE)
- **Cycle Phase**: DISTRIBUTION | **MMXM Step**: 3/5 — DISTRIBUTION ✅
- Levels: 2 OBs | 2 FVGs | 6 pools
- Sweeps: Yes — liquidity sweep detected

## WP-8 Decision — Model Registry (eligibility + sequence, no rank)


### Verdict: **NO TRADE** — 0 complete setup(s)
- **Primary model**: NONE — NO TRADE
- **Rules**: exactly one complete sequence → SETUP COMPLETE; zero or several → NO TRADE (ties by tier, never multiplication).

| Model | Window | Direction | Purge | Sequence gates | Verdict |
|-------|--------|-----------|-------|----------------|---------|
| MMXM Sell Model | ✅ | ❌ | ✅ | killzone:✗, sweep:✓, ob:✓, mss:✗, smt:✓ | — |
| MMXM Buy Model | ✅ | ✅ | ✅ | killzone:✗, sweep:✓, ob:✓, mss:✗, smt:✓ | — |
| Silver Bullet | ❌ | ✅ | ✅ | sweep:✓, reversal:✓, mss:✗, fvg:✓, tethered_array:✓ | — |
| OTE + Institutional OB | ✅ | ✅ | ✅ | killzone:✗, ob:✓, ote:✗, array_mitigated:✓ | — |
| Turtle Soup | ✅ | ❌ | ✅ | killzone:✗, htf_ranging:✓, sweep:✓, reversal:✓, mss:✗, displacement:✗ | — |
| Unicorn (OTE+FVG) | ✅ | ✅ | ✅ | killzone:✗, ob:✓, fvg:✓, ote:✗ | — |
| Breaker Block | ✅ | ✅ | ✅ | killzone:✗, ob:✓, reversal:✓, mss:✗ | — |
| IFVG Scale-In | ✅ | ✅ | ✅ | killzone:✗, sweep:✓, reversal:✓, mss:✗, ifvg_present:✗ | — |
| SCOB | ✅ | ✅ | ✅ | killzone:✗, ob:✓, fvg:✓, displacement:✗ | — |
| 2FVG Entry | ✅ | ✅ | ✅ | killzone:✗, fvg:✓, sweep:✓ | — |
| Judas Swing | ❌ | ❌ | ✅ | sweep:✓, mss:✗ | — |
| Asian Range Breakout | ❌ | ✅ | ✅ | sweep:✓, ob:✓ | — |
| NWOG/NDOG | ✅ | ✅ | ✅ | killzone:✗, ob:✓ | — |
| Mitigation Block | ✅ | ✅ | ✅ | killzone:✗, ob:✓, array_mitigated:✓ | — |
| Rejection Block | ✅ | ❌ | ✅ | killzone:✗, ob:✓, reversal:✓ | — |
| London Hunt + IFVG | ❌ | ✅ | ✅ | lecture2_hunt_swept:✗, lecture2_mss:✗, lecture2_ready:✗ | — |
| NDOG/NWOG News Model | ❌ | ✅ | ✅ | lecture4_gap_draw:✗, sweep:✓, lecture4_mss:✗, lecture4_ready:✗, tethered_array:✓ | — |
| 08:30 Liquidity Raid Model | ❌ | ✅ | ✅ | lecture1_formation:✗, lecture1_raid:✗, lecture1_mss:✗, lecture1_ready:✗, tethered_array:✓ | — |
| NY Lunch Reversal (Short) | ❌ | ❌ | ✅ | prev_day_lunch_sweep:✗, prev_day_bisi:✗, price_enters_lunch_inefficiency:✗, mss:✗ | — |
| NY Lunch Reversal (Long) | ❌ | ✅ | ✅ | prev_day_lunch_sweep:✗, prev_day_sibi:✗, price_enters_lunch_inefficiency:✗, mss:✗ | — |


## Legacy Shadow Scores (read-only — NOT the decision)
| MMXM Buy Model | 8/13 | ×1.40 | ✅ | **2.40** | ★ legacy primary |
| OTE + Institutional OB | 6/11 | ×1.40 | ✅ | **1.80** | Rejected |
| Unicorn (OTE+FVG) | 6/11 | ×1.40 | ✅ | **1.80** | Rejected |
| MMXM Sell Model | 5/13 | ×1.40 | ✅ | **1.50** | Rejected |
| SCOB | 5/10 | ×1.40 | ✅ | **1.50** | Rejected |
| 2FVG Entry | 6/7 | ×1.10 | ✅ | **1.40** | Rejected |
| Silver Bullet | 3/10 | ×1.10 | ✅ | **0.70** | Rejected |
| Breaker Block | 5/7 | ×0.50 | ✅ | **0.60** | Rejected |
| Rejection Block | 3/4 | ×0.80 | ✅ | **0.50** | Rejected |
| London Hunt + IFVG | 1/10 | ×1.00 | ✅ | **0.20** | Rejected |
| Turtle Soup | 5/9 | ×0.30 | ⚠️ BLOCKED | **0.00** | Rejected |
| Judas Swing | 5/8 | ×0.30 | ⚠️ BLOCKED | **0.00** | Rejected |
| Asian Range Breakout | 3/6 | ×0.30 | ⚠️ BLOCKED | **0.00** | Rejected |
| NWOG/NDOG | 4/4 | ×0.30 | ⚠️ BLOCKED | **0.00** | Rejected |
| Mitigation Block | 10/4 | ×0.50 | ⚠️ BLOCKED | **0.00** | Rejected |
| NDOG/NWOG News Model | 0/15 | ×1.50 | ✅ | **0.00** | Rejected |
| 08:30 Liquidity Raid Model | 0/13 | ×1.30 | ✅ | **0.00** | Rejected |

⚠️ **Turtle Soup**: Turtle Soup requires MANIPULATION phase, but we are in DISTRIBUTION

⚠️ **Judas Swing**: Judas Swing requires MANIPULATION phase, but we are in DISTRIBUTION

⚠️ **Asian Range Breakout**: Asian Range Breakout requires ACCUMULATION/MANIPULATION phase, but we are in DISTRIBUTION

⚠️ **NWOG/NDOG**: NWOG/NDOG requires ACCUMULATION phase, but we are in DISTRIBUTION

⚠️ **Mitigation Block**: Mitigation Block requires ACCUMULATION/MANIPULATION phase, but we are in DISTRIBUTION

## High Precision Secrets — 7-9AM Tethering
Framework **inactive** (pre-9:01 or no 7-9AM range) — tethering not applied.


## Soft-Open Bias Guard
No soft open — 1-day decline + today not soft (range 66.74% of avg) — reversal risk N/A

## Smooth Magnets (unfinished business)
No smooth-magnet levels (bumped equal highs/lows left unfinished).

## Primary: NO TRADE — no single complete model
**SMT**: ✅ Indirect SMT: 5 sweeps across 1H/4H suggest manipulation

## Conflict Check (legacy shadow, read-only)
✅ **NO CONFLICTS** — All top models are compatible.



## Confluence
| Factor | Status | Weight |
|--------|--------|--------|
| HTF Bias | ✓ | 3 |
| Key Levels | ✓ | 2 |
| Session | ✗ | 1 |
| Sweep | ✓ | 2 |
| **Registry verdict** | **NO TRADE** | |
