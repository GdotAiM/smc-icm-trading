# Model Selection — EURUSD — 2026-08-10

## Market Context
- Bias: **BEARISH** (1D/4H)
- Session: NY PM (ACTIVE)
- **Cycle Phase**: DISTRIBUTION | **MMXM Step**: undefined/4
- Levels: 0 OBs | 3 FVGs | 6 pools
- Sweeps: Yes — liquidity sweep detected

## WP-8 Decision — Model Registry (eligibility + sequence, no rank)


### Verdict: **SETUP COMPLETE** — 1 complete setup(s)
- **Primary model**: **2FVG Entry** (tier 2)
- **Rules**: exactly one complete sequence → SETUP COMPLETE; zero or several → NO TRADE (ties by tier, never multiplication).

| Model | Window | Direction | Purge | Sequence gates | Verdict |
|-------|--------|-----------|-------|----------------|---------|
| MMXM Sell Model | ✅ | ✅ | ✅ | sweep:✓, ob:✗, mss:✗, smt:✓ | — |
| MMXM Buy Model | ✅ | ❌ | ✅ | sweep:✓, ob:✗, mss:✗, smt:✓ | — |
| Silver Bullet | ✅ | ✅ | ✅ | sweep:✓, reversal:✓, mss:✗, fvg:✓, tethered_array:✗ | — |
| OTE + Institutional OB | ✅ | ✅ | ✅ | ob:✗, ote:✗, array_mitigated:✓ | — |
| Turtle Soup | ✅ | ✅ | ✅ | htf_ranging:✓, sweep:✓, reversal:✓, mss:✗, displacement:✓ | — |
| Unicorn (OTE+FVG) | ✅ | ✅ | ✅ | ob:✗, fvg:✓, ote:✗ | — |
| Breaker Block | ✅ | ✅ | ✅ | ob:✗, reversal:✓, mss:✗ | — |
| IFVG Scale-In | ✅ | ✅ | ✅ | sweep:✓, reversal:✓, mss:✗, ifvg_present:✗ | — |
| SCOB | ✅ | ✅ | ✅ | ob:✗, fvg:✓, displacement:✓ | — |
| 2FVG Entry | ✅ | ✅ | ✅ | fvg:✓, sweep:✓ | ✅ COMPLETE |
| Judas Swing | ❌ | ✅ | ✅ | sweep:✓, mss:✗ | — |
| Asian Range Breakout | ❌ | ✅ | ✅ | sweep:✓, ob:✗ | — |
| NWOG/NDOG | ✅ | ✅ | ✅ | ob:✗ | — |
| Mitigation Block | ✅ | ✅ | ✅ | ob:✗, array_mitigated:✓ | — |
| Rejection Block | ✅ | ✅ | ✅ | ob:✗, reversal:✓ | — |
| London Hunt + IFVG | ❌ | ✅ | ✅ | lecture2_hunt_swept:✗, lecture2_mss:✗, lecture2_ready:✗ | — |
| NDOG/NWOG News Model | ❌ | ✅ | ✅ | lecture4_gap_draw:✗, sweep:✓, lecture4_mss:✗, lecture4_ready:✗, tethered_array:✗ | — |
| 08:30 Liquidity Raid Model | ❌ | ✅ | ✅ | lecture1_formation:✗, lecture1_raid:✗, lecture1_mss:✗, lecture1_ready:✗, tethered_array:✗ | — |
| NY Lunch Reversal (Short) | ✅ | ✅ | ✅ | prev_day_lunch_sweep:✗, prev_day_bisi:✗, price_enters_lunch_inefficiency:✗, mss:✗ | — |
| NY Lunch Reversal (Long) | ✅ | ❌ | ✅ | prev_day_lunch_sweep:✗, prev_day_sibi:✗, price_enters_lunch_inefficiency:✗, mss:✗ | — |


## Legacy Shadow Scores (read-only — NOT the decision)
| Silver Bullet | 8/10 | ×1.10 | ✅ | **14.90** | ★ legacy primary |
| MMXM Sell Model | 6/13 | ×1.40 | ✅ | **13.80** | Alternative |
| 2FVG Entry | 6/7 | ×1.10 | ✅ | **10.80** | Alternative |
| Unicorn (OTE+FVG) | 4/11 | ×1.40 | ✅ | **9.10** | Alternative |
| MMXM Buy Model | 3/13 | ×1.40 | ✅ | **6.90** | Alternative |
| OTE + Institutional OB | 3/11 | ×1.40 | ✅ | **6.90** | Alternative |
| SCOB | 2/10 | ×1.40 | ✅ | **4.60** | Alternative |
| Mitigation Block | 10/4 | ×0.50 | ⚠️ BLOCKED | **2.40** | Rejected |
| Breaker Block | 2/7 | ×0.50 | ✅ | **1.60** | Rejected |
| London Hunt + IFVG | 1/10 | ×1.00 | ✅ | **1.60** | Rejected |
| Rejection Block | 1/4 | ×0.80 | ✅ | **1.30** | Rejected |
| Turtle Soup | 7/9 | ×0.30 | ⚠️ BLOCKED | **0.90** | Rejected |
| Judas Swing | 5/8 | ×0.30 | ⚠️ BLOCKED | **0.80** | Rejected |
| NWOG/NDOG | 3/4 | ×0.30 | ⚠️ BLOCKED | **0.50** | Rejected |
| Asian Range Breakout | 2/6 | ×0.30 | ⚠️ BLOCKED | **0.40** | Rejected |
| NDOG/NWOG News Model | 0/15 | ×1.50 | ✅ | **0.00** | Rejected |
| 08:30 Liquidity Raid Model | 0/13 | ×1.30 | ✅ | **0.00** | Rejected |

⚠️ **Mitigation Block**: Mitigation Block requires ACCUMULATION/MANIPULATION phase, but we are in DISTRIBUTION

⚠️ **Turtle Soup**: Turtle Soup requires MANIPULATION phase, but we are in DISTRIBUTION

⚠️ **Judas Swing**: Judas Swing requires MANIPULATION phase, but we are in DISTRIBUTION

⚠️ **NWOG/NDOG**: NWOG/NDOG requires ACCUMULATION phase, but we are in DISTRIBUTION

⚠️ **Asian Range Breakout**: Asian Range Breakout requires ACCUMULATION/MANIPULATION phase, but we are in DISTRIBUTION

## High Precision Secrets — 7-9AM Tethering
**Framework ACTIVE** (post-9:01 lock) — 0 tethered PD array(s), tether boost ×0.90 applied to legacy shadow scores. Registry gate: NY-AM models require a tethered array.
- **Silver Bullet**: 0 tethered array(s) → ×0.90 (untethered penalty)
- **MMXM Sell Model**: 0 tethered array(s) → ×0.90 (untethered penalty)
- **2FVG Entry**: 0 tethered array(s) → ×0.90 (untethered penalty)
- **Unicorn (OTE+FVG)**: 0 tethered array(s) → ×0.90 (untethered penalty)
- **MMXM Buy Model**: 0 tethered array(s) → ×0.90 (untethered penalty)
- **OTE + Institutional OB**: 0 tethered array(s) → ×0.90 (untethered penalty)
- **SCOB**: 0 tethered array(s) → ×0.90 (untethered penalty)
- **Mitigation Block**: 0 tethered array(s) → ×0.90 (untethered penalty)
- **Breaker Block**: 0 tethered array(s) → ×0.90 (untethered penalty)
- **London Hunt + IFVG**: 0 tethered array(s) → ×0.90 (untethered penalty)
- **Rejection Block**: 0 tethered array(s) → ×0.90 (untethered penalty)
- **Turtle Soup**: 0 tethered array(s) → ×0.90 (untethered penalty)
- **Judas Swing**: 0 tethered array(s) → ×0.90 (untethered penalty)
- **NWOG/NDOG**: 0 tethered array(s) → ×0.90 (untethered penalty)
- **Asian Range Breakout**: 0 tethered array(s) → ×0.90 (untethered penalty)
- **NDOG/NWOG News Model**: 0 tethered array(s) → ×0.90 (untethered penalty)
- **08:30 Liquidity Raid Model**: 0 tethered array(s) → ×0.90 (untethered penalty)

## Soft-Open Bias Guard
No soft open — 1-day rally + today not soft (not inside) — reversal risk N/A

## Smooth Magnets (unfinished business)
No smooth-magnet levels (bumped equal highs/lows left unfinished).

## Primary: 2FVG Entry
**SMT**: ✅ Indirect SMT: 7 sweeps across 1H/4H suggest manipulation

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
