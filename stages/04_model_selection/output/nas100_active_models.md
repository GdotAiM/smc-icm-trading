# Model Selection — NAS100 — 2026-08-10

## Market Context
- Bias: **BEARISH** (1D/4H)
- Session: NY PM (ACTIVE)
- **Cycle Phase**: DISTRIBUTION | **MMXM Step**: undefined/4
- Levels: 0 OBs | 2 FVGs | 6 pools
- Sweeps: Yes — liquidity sweep detected

## WP-8 Decision — Model Registry (eligibility + sequence, no rank)


### Verdict: **NO TRADE** — 3 complete setup(s)
- **Primary model**: NONE — NO TRADE
- **Rules**: exactly one complete sequence → SETUP COMPLETE; zero or several → NO TRADE (ties by tier, never multiplication).

| Model | Window | Direction | Purge | Sequence gates | Verdict |
|-------|--------|-----------|-------|----------------|---------|
| MMXM Sell Model | ✅ | ✅ | ✅ | sweep:✓, ob:✗, mss:✓, smt:✓ | — |
| MMXM Buy Model | ✅ | ❌ | ✅ | sweep:✓, ob:✗, mss:✓, smt:✓ | — |
| Silver Bullet | ✅ | ✅ | ✅ | sweep:✓, reversal:✓, mss:✓, fvg:✓, tethered_array:✓ | ✅ COMPLETE |
| OTE + Institutional OB | ✅ | ✅ | ✅ | ob:✗, ote:✗, array_mitigated:✗ | — |
| Turtle Soup | ✅ | ✅ | ✅ | htf_ranging:✓, sweep:✓, reversal:✓, mss:✓, displacement:✓ | ✅ COMPLETE |
| Unicorn (OTE+FVG) | ✅ | ✅ | ✅ | ob:✗, fvg:✓, ote:✗ | — |
| Breaker Block | ✅ | ✅ | ✅ | ob:✗, reversal:✓, mss:✓ | — |
| SCOB | ✅ | ✅ | ✅ | ob:✗, fvg:✓, displacement:✓ | — |
| 2FVG Entry | ✅ | ✅ | ✅ | fvg:✓, sweep:✓ | ✅ COMPLETE |
| Judas Swing | ❌ | ✅ | ✅ | sweep:✓, mss:✓ | — |
| Asian Range Breakout | ❌ | ✅ | ✅ | sweep:✓, ob:✗ | — |
| NWOG/NDOG | ✅ | ✅ | ✅ | ob:✗ | — |
| Mitigation Block | ✅ | ✅ | ✅ | ob:✗, array_mitigated:✗ | — |
| Rejection Block | ✅ | ✅ | ✅ | ob:✗, reversal:✓ | — |
| London Hunt + IFVG | ❌ | ✅ | ✅ | lecture2_hunt_swept:✗, lecture2_mss:✗, lecture2_ready:✗ | — |
| NDOG/NWOG News Model | ❌ | ✅ | ✅ | lecture4_gap_draw:✗, sweep:✓, lecture4_mss:✗, lecture4_ready:✗, tethered_array:✓ | — |
| 08:30 Liquidity Raid Model | ❌ | ✅ | ✅ | lecture1_formation:✗, lecture1_raid:✗, lecture1_mss:✗, lecture1_ready:✗, tethered_array:✓ | — |
| NY Lunch Reversal (Short) | ✅ | ✅ | ✅ | prev_day_lunch_sweep:✗, prev_day_bisi:✗, price_enters_lunch_inefficiency:✗, mss:✓ | — |
| NY Lunch Reversal (Long) | ✅ | ❌ | ✅ | prev_day_lunch_sweep:✗, prev_day_sibi:✗, price_enters_lunch_inefficiency:✗, mss:✓ | — |


## Legacy Shadow Scores (read-only — NOT the decision)
| Silver Bullet | 8/10 | ×1.10 | ✅ | **18.10** | ★ legacy primary |
| MMXM Sell Model | 6/13 | ×1.40 | ✅ | **16.80** | Alternative |
| 2FVG Entry | 6/7 | ×1.10 | ✅ | **13.20** | Alternative |
| Unicorn (OTE+FVG) | 4/11 | ×1.40 | ✅ | **11.10** | Alternative |
| MMXM Buy Model | 3/13 | ×1.40 | ✅ | **8.50** | Alternative |
| OTE + Institutional OB | 3/11 | ×1.40 | ✅ | **8.50** | Alternative |
| SCOB | 2/10 | ×1.40 | ✅ | **5.60** | Alternative |
| Mitigation Block | 7/4 | ×0.50 | ⚠️ BLOCKED | **2.20** | Rejected |
| Breaker Block | 2/7 | ×0.50 | ✅ | **2.00** | Rejected |
| London Hunt + IFVG | 1/10 | ×1.00 | ✅ | **2.00** | Rejected |
| Turtle Soup | 9/9 | ×0.30 | ⚠️ BLOCKED | **1.50** | Rejected |
| Rejection Block | 1/4 | ×0.80 | ✅ | **1.50** | Rejected |
| Judas Swing | 5/8 | ×0.30 | ⚠️ BLOCKED | **1.00** | Rejected |
| NWOG/NDOG | 3/4 | ×0.30 | ⚠️ BLOCKED | **0.60** | Rejected |
| Asian Range Breakout | 2/6 | ×0.30 | ⚠️ BLOCKED | **0.40** | Rejected |
| NDOG/NWOG News Model | 0/15 | ×1.50 | ✅ | **0.00** | Rejected |
| 08:30 Liquidity Raid Model | 0/13 | ×1.30 | ✅ | **0.00** | Rejected |

⚠️ **Mitigation Block**: Mitigation Block requires ACCUMULATION/MANIPULATION phase, but we are in DISTRIBUTION

⚠️ **Turtle Soup**: Turtle Soup requires MANIPULATION phase, but we are in DISTRIBUTION

⚠️ **Judas Swing**: Judas Swing requires MANIPULATION phase, but we are in DISTRIBUTION

⚠️ **NWOG/NDOG**: NWOG/NDOG requires ACCUMULATION phase, but we are in DISTRIBUTION

⚠️ **Asian Range Breakout**: Asian Range Breakout requires ACCUMULATION/MANIPULATION phase, but we are in DISTRIBUTION

## High Precision Secrets — 7-9AM Tethering
**Framework ACTIVE** (post-9:01 lock) — 1 tethered PD array(s) (1 to daily/weekly levels), tether boost ×1.10 applied to legacy shadow scores. Registry gate: NY-AM models require a tethered array.
- **Silver Bullet**: 1 tethered array(s) → ×1.10 (7-9AM tether)
- **MMXM Sell Model**: 1 tethered array(s) → ×1.10 (7-9AM tether)
- **2FVG Entry**: 1 tethered array(s) → ×1.10 (7-9AM tether)
- **Unicorn (OTE+FVG)**: 1 tethered array(s) → ×1.10 (7-9AM tether)
- **MMXM Buy Model**: 1 tethered array(s) → ×1.10 (7-9AM tether)
- **OTE + Institutional OB**: 1 tethered array(s) → ×1.10 (7-9AM tether)
- **SCOB**: 1 tethered array(s) → ×1.10 (7-9AM tether)
- **Mitigation Block**: 1 tethered array(s) → ×1.10 (7-9AM tether)
- **Breaker Block**: 1 tethered array(s) → ×1.10 (7-9AM tether)
- **London Hunt + IFVG**: 1 tethered array(s) → ×1.10 (7-9AM tether)
- **Turtle Soup**: 1 tethered array(s) → ×1.10 (7-9AM tether)
- **Rejection Block**: 1 tethered array(s) → ×1.10 (7-9AM tether)
- **Judas Swing**: 1 tethered array(s) → ×1.10 (7-9AM tether)
- **NWOG/NDOG**: 1 tethered array(s) → ×1.10 (7-9AM tether)
- **Asian Range Breakout**: 1 tethered array(s) → ×1.10 (7-9AM tether)
- **NDOG/NWOG News Model**: 1 tethered array(s) → ×1.10 (7-9AM tether)
- **08:30 Liquidity Raid Model**: 1 tethered array(s) → ×1.10 (7-9AM tether)

## Soft-Open Bias Guard
No soft open — 1-day rally + today not soft (range 41.91% of avg) — reversal risk N/A

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
| Session | ✓ | 1 |
| Sweep | ✓ | 2 |
| **Registry verdict** | **NO TRADE** | |
