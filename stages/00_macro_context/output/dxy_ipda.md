# IPDA Dealing Range Analysis — DXY — 2026-08-07

## Nested Dealing Ranges (Macro → Micro)

| Timeframe | IPDA20 EQ | IPDA40 EQ | IPDA60 EQ | Zone | Position |
|-----------|-----------|-----------|-----------|------|----------|
| 1W | 12685.50000 | — | — | DISCOUNT (buy) | 33.33% |
| 1D | 12726.85000 | 12738.80000 | 12726.00000 | DISCOUNT (buy) | 25.16% |
| 4H | 12678.50000 | 12725.05000 | — | PREMIUM (sell) | 66.67% |
| 1H | 12681.50000 | 12676.00000 | — | PREMIUM (sell) | 66.67% |
| 15m | 12687.00000 | — | — | DISCOUNT (buy) | 16.67% |

## Equilibrium Cascade (Stepping Stones)

Price delivers from one equilibrium to another. Each level acts as a checkpoint.

```
1W   EQ 12685.50000  DISCOUNT (buy)      33.33%
1D   EQ 12726.85000  DISCOUNT (buy)     ██ 25.16%
4H   EQ 12678.50000  PREMIUM (sell)      66.67%
1H   EQ 12681.50000  PREMIUM (sell)      66.67%
15m  EQ 12687.00000  DISCOUNT (buy)      16.67%
```

## IPDA Draw Direction

**UP (toward equilibrium)**
Price is in DISCOUNT across macro (1W) and micro (15m). IPDA is drawing price UP toward equilibrium. Buy-side delivery domain.

**Zone Consensus**: DISCOUNT (2/5 premium, 3/5 discount) — MODERATE consensus

## AMD on the Dealing Range

**ACCUMULATION ZONE — Price at range extreme. Institutions building positions.**
Daily range: DISCOUNT (buy) at 22.04% of range. ACCUMULATION ZONE — Price at range extreme. Institutions building positions. EQ @ 12738.80000.

## Quarterly Shift

**Quarter month 2. Standard IPDA behavior expected.**

## How the IPDA Lens Changes Your Trade

- **Macro (1W)**: Price is DISCOUNT (buy) — institutional buy zone. Look for LONGS only when LTF confirms.
- **Meso (1D)**: Price is DISCOUNT (buy) at 25.16% of range.
- **Micro (4H)**: Price is PREMIUM (sell). ⚠️ DIVERGENT from macro — this is a counter-trend move within the larger range.

- **Equilibrium Gravity**: The 1W equilibrium at 12685.50000 is the macro fair value. Price is -0.00% below it. The algorithm will seek to return to this level.

- **Cascading Delivery**: Price must pass through each equilibrium checkpoint: 1W @ 12685.50000 → 1D @ 12726.85000 → 4H @ 12678.50000 → 1H @ 12681.50000 → 15m @ 12687.00000. Each is a potential reaction zone.

---

*"The IPDA doesn't move randomly. It delivers price from one dealing range extreme to the other, hunting liquidity at every equilibrium checkpoint along the way."*

## False Breakout Detection
**BULL TRAP (20-day HIGH swept → reversal DOWN)**
⚠️ FALSE BREAKOUT: 20-day high @ 12811.1 swept, price reversed back inside. IPDA stop-hunt before bearish reversal. Target: 40-day low @ 12642.6 / 60-day low @ 12617.
- Direction: BEARISH
- Target: 40-day @ 12642.60000 / 60-day @ 12617.00000

## Kill Zone Alignment
✅ London KZ active (weight: 1.2) — HIGH conviction for IPDA reversals.
- Active Zone: London KZ (weight: 1.2)

## IPDA Objective: REBALANCE (post-hunt)
Liquidity swept (7 pools). 3 unfilled FVGs remain — IPDA now rebalancing imbalances. Price drawing toward unfilled FVGs.
- Unfilled FVGs: 3 | Swept Pools: 7 | Unswept: 5

## Weekly Reference Levels (Marked 2026-08-07)
20-Day: H 12811.10000 L 12642.60000 EQ 12726.85000 | 40-Day: H 12835.00000 L 12642.60000 EQ 12738.80000 | 60-Day: H 12835.00000 L 12617.00000 EQ 12726.00000

## PD Array Matrix — 20-Day IPDA Data Range

**Graded Levels**: Q1(25%) 12684.72500 | EQ(50%) 12726.85000 | Q3(75%) 12768.97500 | Octants: 12663.66250 | 12684.72500 | 12705.78750 | 12726.85000 | 12747.91250 | 12768.97500 | 12790.03750

**Focus Zone**: IN FOCUS (lower quadrant → equilibrium → upper quadrant) (price at 25.16% of 20-day range)

**Matrix Weighting**: ENHANCED — 11 PD arrays inside the 20-day matrix, 6 in the middle focus zone (Q1 → EQ → Q3). High-probability arrays present.

In-focus PD arrays (carry extra algorithmic weight):
- FVG bearish @ 12724.00000 (4H)
- FVG bearish @ 12765.50000 (4H)
- FVG bearish @ 12702.50000 (1H)
- FVG bearish @ 12729.50000 (1H)
- OB bearish @ 12713.00000 (1H)
- OB bearish @ 12689.50000 (15m)
