# IPDA Dealing Range Analysis — DXY — 2026-08-10

## Nested Dealing Ranges (Macro → Micro)

| Timeframe | IPDA20 EQ | IPDA40 EQ | IPDA60 EQ | Zone | Position |
|-----------|-----------|-----------|-----------|------|----------|
| 1W | 12664.50000 | — | — | DISCOUNT (buy) | 0.00% |
| 1D | 12738.80000 | 12738.80000 | 12726.00000 | DISCOUNT (buy) | 10.60% |
| 4H | 12728.05000 | 12682.50000 | — | DISCOUNT (buy) | 10.84% |
| 1H | 12668.50000 | 12668.00000 | — | DISCOUNT (buy) | 40.43% |
| 15m | 12665.00000 | — | — | DISCOUNT (buy) | 40.00% |

## Equilibrium Cascade (Stepping Stones)

Price delivers from one equilibrium to another. Each level acts as a checkpoint.

```
1W   EQ 12664.50000  DISCOUNT (buy)      0.00%
1D   EQ 12738.80000  DISCOUNT (buy)     ███ 10.60%
4H   EQ 12728.05000  DISCOUNT (buy)     ███ 10.84%
1H   EQ 12668.50000  DISCOUNT (buy)      40.43%
15m  EQ 12665.00000  DISCOUNT (buy)      40.00%
```

## IPDA Draw Direction

**UP (toward equilibrium)**
Price is in DISCOUNT across macro (1W) and micro (15m). IPDA is drawing price UP toward equilibrium. Buy-side delivery domain.

**Zone Consensus**: DISCOUNT (0/5 premium, 5/5 discount) — STRONG consensus

## AMD on the Dealing Range

**ACCUMULATION ZONE — Price at range extreme. Institutions building positions.**
Daily range: DISCOUNT (buy) at 10.60% of range. ACCUMULATION ZONE — Price at range extreme. Institutions building positions. EQ @ 12738.80000.

## Quarterly Shift

**Quarter month 2. Standard IPDA behavior expected.**

## How the IPDA Lens Changes Your Trade

- **Macro (1W)**: Price is DISCOUNT (buy) — institutional buy zone. Look for LONGS only when LTF confirms.
- **Meso (1D)**: Price is DISCOUNT (buy) at 10.60% of range.
- **Micro (4H)**: Price is DISCOUNT (buy). ✅ ALIGNED with macro — trade with confidence.

- **Equilibrium Gravity**: The 1W equilibrium at 12664.50000 is the macro fair value. Price is -0.01% below it. The algorithm will seek to return to this level.

- **Cascading Delivery**: Price must pass through each equilibrium checkpoint: 1W @ 12664.50000 → 1D @ 12738.80000 → 4H @ 12728.05000 → 1H @ 12668.50000 → 15m @ 12665.00000. Each is a potential reaction zone.

---

*"The IPDA doesn't move randomly. It delivers price from one dealing range extreme to the other, hunting liquidity at every equilibrium checkpoint along the way."*

## False Breakout Detection
**Below 20-day low — monitoring for reversal**
Price below 20-day low @ 12642.6. If it reverses back above → false breakout confirmed.

## Kill Zone Alignment
⏳ London PM (dead zone) active (weight: 0.4) — lower conviction. Prefer London KZ, NY AM KZ, or NY PM KZ.
- Active Zone: London PM (dead zone) (weight: 0.4)

## IPDA Objective: HUNT LIQUIDITY
6 unswept pools vs 4 swept. IPDA hunting liquidity — expect sweep of nearest BSL/SSL before rebalancing.
- Unfilled FVGs: 4 | Swept Pools: 4 | Unswept: 6

## Weekly Reference Levels (Marked 2026-08-10)
20-Day: H 12835.00000 L 12642.60000 EQ 12738.80000 | 40-Day: H 12835.00000 L 12642.60000 EQ 12738.80000 | 60-Day: H 12835.00000 L 12617.00000 EQ 12726.00000

## PD Array Matrix — 20-Day IPDA Data Range

**Graded Levels**: Q1(25%) 12690.70000 | EQ(50%) 12738.80000 | Q3(75%) 12786.90000 | Octants: 12666.65000 | 12690.70000 | 12714.75000 | 12738.80000 | 12762.85000 | 12786.90000 | 12810.95000

**Focus Zone**: EXTREME LOWER (below lower quadrant) — secondary unless reversal/regime change (price at 10.60% of 20-day range)

**Matrix Weighting**: ENHANCED — 10 PD arrays inside the 20-day matrix, 6 in the middle focus zone (Q1 → EQ → Q3). High-probability arrays present.

In-focus PD arrays (carry extra algorithmic weight):
- FVG bearish @ 12724.00000 (4H)
- FVG bearish @ 12765.50000 (4H)
- FVG bearish @ 12786.05000 (4H)
- FVG bearish @ 12702.50000 (1H)
- FVG bearish @ 12729.50000 (1H)
- OB bearish @ 12713.00000 (1H)
