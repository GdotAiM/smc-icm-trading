# IPDA Dealing Range Analysis — GBPUSD — 2026-08-10

## Nested Dealing Ranges (Macro → Micro)

| Timeframe | IPDA20 EQ | IPDA40 EQ | IPDA60 EQ | Zone | Position |
|-----------|-----------|-----------|-----------|------|----------|
| 1W | 1.35173 | — | — | DISCOUNT (buy) | 15.05% |
| 1D | 1.33492 | 1.33492 | 1.33492 | PREMIUM (sell) | 88.44% |
| 4H | 1.34022 | 1.34655 | — | PREMIUM (sell) | 91.88% |
| 1H | 1.34826 | 1.34826 | — | PREMIUM (sell) | 78.32% |
| 15m | 1.35106 | — | — | DISCOUNT (buy) | 48.27% |

## Equilibrium Cascade (Stepping Stones)

Price delivers from one equilibrium to another. Each level acts as a checkpoint.

```
1W   EQ 1.35173      DISCOUNT (buy)      15.05%
1D   EQ 1.33492      PREMIUM (sell)     ██████ 88.44%
4H   EQ 1.34022      PREMIUM (sell)     ████ 91.88%
1H   EQ 1.34826      PREMIUM (sell)     █ 78.32%
15m  EQ 1.35106      DISCOUNT (buy)      48.27%
```

## IPDA Draw Direction

**UP (toward equilibrium)**
Price is in DISCOUNT across macro (1W) and micro (15m). IPDA is drawing price UP toward equilibrium. Buy-side delivery domain.

**Zone Consensus**: PREMIUM (3/5 premium, 2/5 discount) — MODERATE consensus

## AMD on the Dealing Range

**ACCUMULATION ZONE — Price at range extreme. Institutions building positions.**
Daily range: PREMIUM (sell) at 88.44% of range. ACCUMULATION ZONE — Price at range extreme. Institutions building positions. EQ @ 1.33492.

## Quarterly Shift

**Quarter month 2. Standard IPDA behavior expected.**

## How the IPDA Lens Changes Your Trade

- **Macro (1W)**: Price is DISCOUNT (buy) — institutional buy zone. Look for LONGS only when LTF confirms.
- **Meso (1D)**: Price is PREMIUM (sell) at 88.44% of range.
- **Micro (4H)**: Price is PREMIUM (sell). ⚠️ DIVERGENT from macro — this is a counter-trend move within the larger range.

- **Equilibrium Gravity**: The 1W equilibrium at 1.35173 is the macro fair value. Price is -0.05% below it. The algorithm will seek to return to this level.

- **Cascading Delivery**: Price must pass through each equilibrium checkpoint: 1W @ 1.35173 → 1D @ 1.33492 → 4H @ 1.34022 → 1H @ 1.34826 → 15m @ 1.35106. Each is a potential reaction zone.

---

*"The IPDA doesn't move randomly. It delivers price from one dealing range extreme to the other, hunting liquidity at every equilibrium checkpoint along the way."*

## False Breakout Detection
**Below 20-day low — monitoring for reversal**
Price below 20-day low @ 1.31402. If it reverses back above → false breakout confirmed.

## Kill Zone Alignment
⏳ NY PM active (weight: 1) — lower conviction. Prefer London KZ, NY AM KZ, or NY PM KZ.
- Active Zone: NY PM (weight: 1)

## IPDA Objective: HUNT LIQUIDITY
7 unswept pools vs 5 swept. IPDA hunting liquidity — expect sweep of nearest BSL/SSL before rebalancing.
- Unfilled FVGs: 2 | Swept Pools: 5 | Unswept: 7

## Weekly Reference Levels (Marked 2026-08-10)
20-Day: H 1.35582 L 1.31402 EQ 1.33492 | 40-Day: H 1.35582 L 1.31402 EQ 1.33492 | 60-Day: H 1.35582 L 1.31402 EQ 1.33492

## PD Array Matrix — 20-Day IPDA Data Range

**Graded Levels**: Q1(25%) 1.32447 | EQ(50%) 1.33492 | Q3(75%) 1.34537 | Octants: 1.31925 | 1.32447 | 1.32970 | 1.33492 | 1.34014 | 1.34537 | 1.35059

**Focus Zone**: EXTREME UPPER (above upper quadrant) — secondary unless reversal/regime change (price at 88.44% of 20-day range)

**Matrix Weighting**: ENHANCED — 7 PD arrays inside the 20-day matrix, 5 in the middle focus zone (Q1 → EQ → Q3). High-probability arrays present.

In-focus PD arrays (carry extra algorithmic weight):
- FVG bullish @ 1.33287 (4H)
- FVG bullish @ 1.32630 (4H)
- OB bullish @ 1.33921 (4H)
- FVG bullish @ 1.33265 (1H)
- OB bullish @ 1.34168 (1H)
