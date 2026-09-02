# Model Selection — DXY — 2026-08-10

## Market Context
- Bias: **BEARISH** (1D/4H)
- Session: London PM (NO TRADE)
- **Cycle Phase**: MANIPULATION | **MMXM Step**: undefined/4
- Levels: 1 OBs | 9 FVGs | 6 pools
- Sweeps: Yes — liquidity sweep detected

## WP-8 Decision — Model Registry (eligibility + sequence, no rank)


### Verdict: **NO TRADE** — 4 complete setup(s)
- **Primary model**: NONE — NO TRADE
- **Rules**: exactly one complete sequence → SETUP COMPLETE; zero or several → NO TRADE (ties by tier, never multiplication).

| Model | Window | Direction | Purge | Sequence gates | Verdict |
|-------|--------|-----------|-------|----------------|---------|
| MMXM Sell Model | ✅ | ❌ | ✅ | sweep:✓, ob:✓, mss:✗, smt:✓ | — |
| MMXM Buy Model | ✅ | ✅ | ✅ | sweep:✓, ob:✓, mss:✗, smt:✓ | — |
| Silver Bullet | ❌ | ✅ | ✅ | sweep:✓, reversal:✓, mss:✗, fvg:✓, tethered_array:✓ | — |
| OTE + Institutional OB | ✅ | ✅ | ✅ | ob:✓, ote:✗, array_mitigated:✓ | — |
| Turtle Soup | ✅ | ❌ | ✅ | htf_ranging:✓, sweep:✓, reversal:✓, mss:✗, displacement:✓ | — |
| Unicorn (OTE+FVG) | ✅ | ✅ | ✅ | ob:✓, fvg:✓, ote:✗ | — |
| Breaker Block | ✅ | ✅ | ✅ | ob:✓, reversal:✓, mss:✗ | — |
| SCOB | ✅ | ✅ | ✅ | ob:✓, fvg:✓, displacement:✓ | ✅ COMPLETE |
| 2FVG Entry | ✅ | ✅ | ✅ | fvg:✓, sweep:✓ | ✅ COMPLETE |
| Judas Swing | ❌ | ❌ | ✅ | sweep:✓, mss:✗ | — |
| Asian Range Breakout | ❌ | ✅ | ✅ | sweep:✓, ob:✓ | — |
| NWOG/NDOG | ✅ | ✅ | ✅ | ob:✓ | ✅ COMPLETE |
| Mitigation Block | ✅ | ✅ | ✅ | ob:✓, array_mitigated:✓ | ✅ COMPLETE |
| Rejection Block | ✅ | ❌ | ✅ | ob:✓, reversal:✓ | — |
| London Hunt + IFVG | ❌ | ✅ | ✅ | lecture2_hunt_swept:✗, lecture2_mss:✗, lecture2_ready:✗ | — |
| NDOG/NWOG News Model | ❌ | ✅ | ✅ | lecture4_gap_draw:✗, sweep:✓, lecture4_mss:✗, lecture4_ready:✗, tethered_array:✓ | — |
| 08:30 Liquidity Raid Model | ❌ | ✅ | ✅ | lecture1_formation:✗, lecture1_raid:✗, lecture1_mss:✗, lecture1_ready:✗, tethered_array:✓ | — |


## Legacy Shadow Scores (read-only — NOT the decision)
| Breaker Block | 8/9 | ×1.30 | ✅ | **2.20** | ★ legacy primary |
| Turtle Soup | 7/12 | ×1.30 | ✅ | **1.90** | Rejected |
| MMXM Sell Model | 8/9 | ×1.00 | ✅ | **1.70** | Rejected |
| Judas Swing | 5/10 | ×1.30 | ✅ | **1.40** | Rejected |
| MMXM Buy Model | 5/9 | ×1.00 | ✅ | **1.00** | Rejected |
| Silver Bullet | 3/12 | ×1.30 | ✅ | **0.80** | Rejected |
| Mitigation Block | 4/4 | ×1.00 | ✅ | **0.80** | Rejected |
| Rejection Block | 3/4 | ×1.00 | ✅ | **0.60** | Rejected |
| OTE + Institutional OB | 6/8 | ×1.00 | ⚠️ BLOCKED | **0.40** | Rejected |
| Asian Range Breakout | 3/6 | ×0.50 | ✅ | **0.40** | Rejected |
| London Hunt + IFVG | 1/15 | ×1.50 | ✅ | **0.40** | Rejected |
| Unicorn (OTE+FVG) | 6/8 | ×0.30 | ⚠️ BLOCKED | **0.10** | Rejected |
| SCOB | 5/7 | ×0.50 | ⚠️ BLOCKED | **0.10** | Rejected |
| 2FVG Entry | 6/6 | ×0.30 | ⚠️ BLOCKED | **0.10** | Rejected |
| NWOG/NDOG | 4/4 | ×0.30 | ⚠️ BLOCKED | **0.10** | Rejected |
| NDOG/NWOG News Model | 0/13 | ×1.30 | ✅ | **0.00** | Rejected |
| 08:30 Liquidity Raid Model | 0/15 | ×1.50 | ✅ | **0.00** | Rejected |

⚠️ **OTE + Institutional OB**: OTE + Institutional OB requires DISTRIBUTION/EXPANSION phase, but we are in MANIPULATION

⚠️ **Unicorn (OTE+FVG)**: Unicorn (OTE+FVG) requires DISTRIBUTION/EXPANSION phase, but we are in MANIPULATION

⚠️ **SCOB**: SCOB requires DISTRIBUTION/EXPANSION phase, but we are in MANIPULATION

⚠️ **2FVG Entry**: 2FVG Entry requires EXPANSION/DISTRIBUTION phase, but we are in MANIPULATION

⚠️ **NWOG/NDOG**: NWOG/NDOG requires ACCUMULATION phase, but we are in MANIPULATION

## High Precision Secrets — 7-9AM Tethering
Framework **inactive** (pre-9:01 or no 7-9AM range) — tethering not applied.


## Primary: NO TRADE — no single complete model
**SMT**: ✅ Indirect SMT: 4 sweeps across 1H/4H suggest manipulation

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
