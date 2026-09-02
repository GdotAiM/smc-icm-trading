# Model Selection — XAUUSD — 2026-09-01

## Market Context
- Bias: **BULLISH** (1D/4H)
- Session: NY PM (ACTIVE)
- **Cycle Phase**: DISTRIBUTION | **MMXM Step**: 3/5 — DISTRIBUTION ✅
- Levels: 0 OBs | 5 FVGs | 6 pools
- Sweeps: Yes — liquidity sweep detected

## WP-8 Decision — Model Registry (eligibility + sequence, no rank)


### Verdict: **SETUP COMPLETE** — 1 complete setup(s)
- **Primary model**: **2FVG Entry** (tier 2)
- **Rules**: exactly one complete sequence → SETUP COMPLETE; zero or several → NO TRADE (ties by tier, never multiplication).

| Model | Window | Direction | Purge | Sequence gates | Verdict |
|-------|--------|-----------|-------|----------------|---------|
| MMXM Sell Model | ✅ | ❌ | ✅ | killzone:✓, sweep:✓, ob:✗, mss:✗, smt:✓ | — |
| MMXM Buy Model | ✅ | ✅ | ✅ | killzone:✓, sweep:✓, ob:✗, mss:✗, smt:✓ | — |
| Silver Bullet | ❌ | ✅ | ✅ | sweep:✓, reversal:✓, mss:✗, fvg:✓, tethered_array:✓ | — |
| OTE + Institutional OB | ✅ | ✅ | ✅ | killzone:✓, ob:✗, ote:✗, array_mitigated:✓ | — |
| Turtle Soup | ✅ | ❌ | ✅ | killzone:✓, htf_ranging:✗, sweep:✓, reversal:✓, mss:✗, displacement:✓ | — |
| Unicorn (OTE+FVG) | ✅ | ✅ | ✅ | killzone:✓, ob:✗, fvg:✓, ote:✗ | — |
| Breaker Block | ✅ | ✅ | ✅ | killzone:✓, ob:✗, reversal:✓, mss:✗ | — |
| IFVG Scale-In | ✅ | ✅ | ✅ | killzone:✓, sweep:✓, reversal:✓, mss:✗, ifvg_present:✗ | — |
| SCOB | ✅ | ✅ | ✅ | killzone:✓, ob:✗, fvg:✓, displacement:✓ | — |
| 2FVG Entry | ✅ | ✅ | ✅ | killzone:✓, fvg:✓, sweep:✓ | ✅ COMPLETE |
| Judas Swing | ❌ | ❌ | ✅ | sweep:✓, mss:✗ | — |
| Asian Range Breakout | ❌ | ✅ | ✅ | sweep:✓, ob:✗ | — |
| NWOG/NDOG | ✅ | ✅ | ✅ | killzone:✓, ob:✗ | — |
| Mitigation Block | ✅ | ✅ | ✅ | killzone:✓, ob:✗, array_mitigated:✓ | — |
| Rejection Block | ✅ | ❌ | ✅ | killzone:✓, ob:✗, reversal:✓ | — |
| London Hunt + IFVG | ❌ | ✅ | ✅ | lecture2_hunt_swept:✗, lecture2_mss:✗, lecture2_ready:✗ | — |
| NDOG/NWOG News Model | ❌ | ✅ | ✅ | lecture4_gap_draw:✗, sweep:✓, lecture4_mss:✗, lecture4_ready:✗, tethered_array:✓ | — |
| 08:30 Liquidity Raid Model | ❌ | ✅ | ✅ | lecture1_formation:✗, lecture1_raid:✗, lecture1_mss:✗, lecture1_ready:✗, tethered_array:✓ | — |
| NY Lunch Reversal (Short) | ✅ | ❌ | ✅ | prev_day_lunch_sweep:✗, prev_day_bisi:✗, price_enters_lunch_inefficiency:✗, mss:✗ | — |
| NY Lunch Reversal (Long) | ✅ | ✅ | ✅ | prev_day_lunch_sweep:✗, prev_day_sibi:✗, price_enters_lunch_inefficiency:✗, mss:✗ | — |


## Legacy Shadow Scores (read-only — NOT the decision)
| MMXM Buy Model | 6/13 | ×1.40 | ✅ | **3.30** | ★ legacy primary |
| 2FVG Entry | 6/7 | ×1.10 | ✅ | **2.60** | Rejected |
| Silver Bullet | 5/10 | ×1.10 | ✅ | **2.20** | Rejected |
| Unicorn (OTE+FVG) | 4/11 | ×1.40 | ✅ | **2.20** | Rejected |
| MMXM Sell Model | 3/13 | ×1.40 | ✅ | **1.70** | Rejected |
| OTE + Institutional OB | 3/11 | ×1.40 | ✅ | **1.70** | Rejected |
| Breaker Block | 8/7 | ×0.50 | ✅ | **1.60** | Rejected |
| SCOB | 2/10 | ×1.40 | ✅ | **1.00** | Rejected |
| London Hunt + IFVG | 1/10 | ×1.00 | ✅ | **0.40** | Rejected |
| Rejection Block | 1/4 | ×0.80 | ✅ | **0.30** | Rejected |
| Turtle Soup | 5/9 | ×0.30 | ⚠️ BLOCKED | **0.00** | Rejected |
| Judas Swing | 5/8 | ×0.30 | ⚠️ BLOCKED | **0.00** | Rejected |
| Asian Range Breakout | 2/6 | ×0.30 | ⚠️ BLOCKED | **0.00** | Rejected |
| NWOG/NDOG | 3/4 | ×0.30 | ⚠️ BLOCKED | **0.00** | Rejected |
| Mitigation Block | 1/4 | ×0.50 | ⚠️ BLOCKED | **0.00** | Rejected |
| NDOG/NWOG News Model | 0/15 | ×1.50 | ✅ | **0.00** | Rejected |
| 08:30 Liquidity Raid Model | 0/13 | ×1.30 | ✅ | **0.00** | Rejected |

⚠️ **Turtle Soup**: Turtle Soup requires MANIPULATION phase, but we are in DISTRIBUTION

⚠️ **Judas Swing**: Judas Swing requires MANIPULATION phase, but we are in DISTRIBUTION

⚠️ **Asian Range Breakout**: Asian Range Breakout requires ACCUMULATION/MANIPULATION phase, but we are in DISTRIBUTION

⚠️ **NWOG/NDOG**: NWOG/NDOG requires ACCUMULATION phase, but we are in DISTRIBUTION

⚠️ **Mitigation Block**: Mitigation Block requires ACCUMULATION/MANIPULATION phase, but we are in DISTRIBUTION

## High Precision Secrets — 7-9AM Tethering
**Framework ACTIVE** (post-9:01 lock) — 6 tethered PD array(s) (4 to daily/weekly levels), tether boost ×1.30 applied to legacy shadow scores. Registry gate: NY-AM models require a tethered array.
- **MMXM Buy Model**: 6 tethered array(s) → ×1.30 (7-9AM tether)
- **2FVG Entry**: 6 tethered array(s) → ×1.30 (7-9AM tether)
- **Silver Bullet**: 6 tethered array(s) → ×1.30 (7-9AM tether)
- **Unicorn (OTE+FVG)**: 6 tethered array(s) → ×1.30 (7-9AM tether)
- **MMXM Sell Model**: 6 tethered array(s) → ×1.30 (7-9AM tether)
- **OTE + Institutional OB**: 6 tethered array(s) → ×1.30 (7-9AM tether)
- **Breaker Block**: 6 tethered array(s) → ×1.30 (7-9AM tether)
- **SCOB**: 6 tethered array(s) → ×1.30 (7-9AM tether)
- **London Hunt + IFVG**: 6 tethered array(s) → ×1.30 (7-9AM tether)
- **Rejection Block**: 6 tethered array(s) → ×1.30 (7-9AM tether)
- **Turtle Soup**: 6 tethered array(s) → ×1.30 (7-9AM tether)
- **Judas Swing**: 6 tethered array(s) → ×1.30 (7-9AM tether)
- **Asian Range Breakout**: 6 tethered array(s) → ×1.30 (7-9AM tether)
- **NWOG/NDOG**: 6 tethered array(s) → ×1.30 (7-9AM tether)
- **Mitigation Block**: 6 tethered array(s) → ×1.30 (7-9AM tether)
- **NDOG/NWOG News Model**: 6 tethered array(s) → ×1.30 (7-9AM tether)
- **08:30 Liquidity Raid Model**: 6 tethered array(s) → ×1.30 (7-9AM tether)

## Soft-Open Bias Guard
No soft open — 2-day decline + today not soft (range 129.32% of avg) — reversal risk NORMAL

## Smooth Magnets (unfinished business)
No smooth-magnet levels (bumped equal highs/lows left unfinished).

## Primary: 2FVG Entry
**SMT**: ✅ Indirect SMT: 6 sweeps across 1H/4H suggest manipulation

## Conflict Check (legacy shadow, read-only)
✅ **NO CONFLICTS** — All top models are compatible.



## Confluence
| Factor | Status | Weight |
|--------|--------|--------|
| HTF Bias | ✓ | 3 |
| Key Levels | ✓ | 2 |
| Session | ✓ | 1 |
| Sweep | ✓ | 2 |
| **Registry verdict** | **SETUP COMPLETE** | |
