# Model Selection — NAS100 — 2026-07-31

## Market Context
- Bias: **BEARISH** (1D/4H)
- Session: NY PM (NO TRADE)
- **Cycle Phase**: DISTRIBUTION | **MMXM Step**: undefined/4
- Levels: 0 OBs | 1 FVGs | 6 pools
- Sweeps: Yes — liquidity sweep detected

## Model Scores (Cycle-Weighted)

| Model | Structural | Cycle × | Perf × | Po3 | Final | Status |
|-------|-----------|---------|-----|-------|--------|
| Silver Bullet | 6/10 | ×1.10 | ×1.00 | ✅ | **12.30** | ★ PRIMARY |
| MMXM Sell Model | 6/13 | ×1.40 | ×1.00 | ✅ | **11.80** | Alternative |
| London Hunt + IFVG | 5/10 | ×1.00 | ×1.00 | ✅ | **7.00** | Alternative |
| NDOG/NWOG News Model | 2/15 | ×1.50 | ×1.00 | ✅ | **4.20** | Alternative |
| Unicorn (OTE+FVG) | 4/11 | ×1.40 | ×1.00 | ✅ | **3.90** | Alternative |
| MMXM Buy Model | 3/13 | ×1.40 | ×1.00 | ✅ | **2.90** | Rejected |
| OTE + Institutional OB | 3/11 | ×1.40 | ×1.00 | ✅ | **2.90** | Rejected |
| 2FVG Entry | 3/7 | ×1.10 | ×1.00 | ✅ | **2.30** | Rejected |
| SCOB | 2/10 | ×1.40 | ×1.00 | ✅ | **2.00** | Rejected |
| Breaker Block | 2/7 | ×0.50 | ×1.00 | ✅ | **1.40** | Rejected |
| Rejection Block | 1/4 | ×0.80 | ×1.00 | ✅ | **1.10** | Rejected |
| Turtle Soup | 5/9 | ×0.30 | ×1.00 | ⚠️ BLOCKED | **0.70** | Rejected |
| Judas Swing | 5/8 | ×0.30 | ×1.00 | ⚠️ BLOCKED | **0.70** | Rejected |
| NWOG/NDOG | 3/4 | ×0.30 | ×1.00 | ⚠️ BLOCKED | **0.40** | Rejected |
| Asian Range Breakout | 2/6 | ×0.30 | ×1.00 | ⚠️ BLOCKED | **0.10** | Rejected |
| Mitigation Block | 1/4 | ×0.50 | ×1.00 | ⚠️ BLOCKED | **0.10** | Rejected |
| 08:30 Liquidity Raid Model | 0/13 | ×1.30 | ×1.00 | ✅ | **0.00** | Rejected |

⚠️ **Turtle Soup**: Turtle Soup requires MANIPULATION phase, but we are in DISTRIBUTION

⚠️ **Judas Swing**: Judas Swing requires MANIPULATION phase, but we are in DISTRIBUTION

⚠️ **NWOG/NDOG**: NWOG/NDOG requires ACCUMULATION phase, but we are in DISTRIBUTION

⚠️ **Asian Range Breakout**: Asian Range Breakout requires ACCUMULATION/MANIPULATION phase, but we are in DISTRIBUTION

⚠️ **Mitigation Block**: Mitigation Block requires ACCUMULATION/MANIPULATION phase, but we are in DISTRIBUTION

## Primary: Silver Bullet (12.30 — structural 6 × cycle 1.10 × perf 1.00)
**SMT**: ✅ Indirect SMT: 8 sweeps across 1H/4H suggest manipulation

## Conflict Check

⚠️ **MUTUAL EXCLUSIVITY**: **Silver Bullet** vs **London Hunt + IFVG** — London Hunt fires at 07:00-07:40 NY; Silver Bullet fires at 10:00-11:00 NY. Different time windows — mutually exclusive by session. → **Silver Bullet** takes priority (higher score).

⚠️ **MUTUAL EXCLUSIVITY**: **Silver Bullet** vs **NDOG/NWOG News Model** — News Model fires 08:30-10:00 NY; Silver Bullet fires 10:00-11:00 NY. Sequential — can both be valid but not simultaneously. → **Silver Bullet** takes priority (higher score).

⚠️ **MUTUAL EXCLUSIVITY**: **London Hunt + IFVG** vs **NDOG/NWOG News Model** — News Model fires 08:30-10:00; London Hunt fires 07:00-07:40. Sequential by time — not conflicting. → **London Hunt + IFVG** takes priority (higher score).


## Confluence
| Factor | Status | Weight |
|--------|--------|--------|
| HTF Bias | ✓ | 3 |
| Key Levels | ✓ | 2 |
| Session | ✗ | 1 |
| Sweep | ✓ | 2 |
| **Total** | **12.3/9.9** | |
