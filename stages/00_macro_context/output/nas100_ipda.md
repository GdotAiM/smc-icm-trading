# IPDA Dealing Range Analysis — NAS100 — 2026-08-10

## Nested Dealing Ranges (Macro → Micro)

| Timeframe | IPDA20 EQ | IPDA40 EQ | IPDA60 EQ | Zone | Position |
|-----------|-----------|-----------|-----------|------|----------|
| 1W | 29683.50000 | — | — | DISCOUNT (buy) | 10.54% |
| 1D | 28465.90000 | 28816.40000 | 28869.45000 | PREMIUM (sell) | 90.55% |
| 4H | 28465.90000 | 28953.75000 | — | PREMIUM (sell) | 90.66% |
| 1H | 29495.65000 | 29607.30000 | — | PREMIUM (sell) | 73.65% |
| 15m | 29739.50000 | — | — | DISCOUNT (buy) | 25.26% |

## Equilibrium Cascade (Stepping Stones)

Price delivers from one equilibrium to another. Each level acts as a checkpoint.

```
1W   EQ 29683.50000  DISCOUNT (buy)      10.54%
1D   EQ 28465.90000  PREMIUM (sell)     ██████████ 90.55%
4H   EQ 28465.90000  PREMIUM (sell)     ██████████ 90.66%
1H   EQ 29495.65000  PREMIUM (sell)     ███ 73.65%
15m  EQ 29739.50000  DISCOUNT (buy)     █ 25.26%
```

## IPDA Draw Direction

**UP (toward equilibrium)**
Price is in DISCOUNT across macro (1W) and micro (15m). IPDA is drawing price UP toward equilibrium. Buy-side delivery domain.

**Zone Consensus**: PREMIUM (3/5 premium, 2/5 discount) — MODERATE consensus

## AMD on the Dealing Range

**DISTRIBUTION ZONE — Price expanding from equilibrium toward extreme.**
Daily range: PREMIUM (sell) at 73.26% of range. DISTRIBUTION ZONE — Price expanding from equilibrium toward extreme. EQ @ 28816.40000.

## Quarterly Shift

**Quarter month 2. Standard IPDA behavior expected.**

## How the IPDA Lens Changes Your Trade

- **Macro (1W)**: Price is DISCOUNT (buy) — institutional buy zone. Look for LONGS only when LTF confirms.
- **Meso (1D)**: Price is PREMIUM (sell) at 90.55% of range.
- **Micro (4H)**: Price is PREMIUM (sell). ⚠️ DIVERGENT from macro — this is a counter-trend move within the larger range.

- **Equilibrium Gravity**: The 1W equilibrium at 29683.50000 is the macro fair value. Price is -0.04% below it. The algorithm will seek to return to this level.

- **Cascading Delivery**: Price must pass through each equilibrium checkpoint: 1W @ 29683.50000 → 1D @ 28465.90000 → 4H @ 28465.90000 → 1H @ 29495.65000 → 15m @ 29739.50000. Each is a potential reaction zone.

---

*"The IPDA doesn't move randomly. It delivers price from one dealing range extreme to the other, hunting liquidity at every equilibrium checkpoint along the way."*

## False Breakout Detection
**Below 20-day low — monitoring for reversal**
Price below 20-day low @ 26980.6. If it reverses back above → false breakout confirmed.

## Kill Zone Alignment
⏳ NY PM active (weight: 1) — lower conviction. Prefer London KZ, NY AM KZ, or NY PM KZ.
- Active Zone: NY PM (weight: 1)

## IPDA Objective: HUNT LIQUIDITY
7 unswept pools vs 5 swept. IPDA hunting liquidity — expect sweep of nearest BSL/SSL before rebalancing.
- Unfilled FVGs: 2 | Swept Pools: 5 | Unswept: 7

## Weekly Reference Levels (Marked 2026-08-10)
20-Day: H 29951.20000 L 26980.60000 EQ 28465.90000 | 40-Day: H 30652.20000 L 26980.60000 EQ 28816.40000 | 60-Day: H 30758.30000 L 26980.60000 EQ 28869.45000

## PD Array Matrix — 20-Day IPDA Data Range

**Graded Levels**: Q1(25%) 27723.25000 | EQ(50%) 28465.90000 | Q3(75%) 29208.55000 | Octants: 27351.92500 | 27723.25000 | 28094.57500 | 28465.90000 | 28837.22500 | 29208.55000 | 29579.87500

**Focus Zone**: EXTREME UPPER (above upper quadrant) — secondary unless reversal/regime change (price at 90.55% of 20-day range)

**Matrix Weighting**: ENHANCED — 5 PD arrays inside the 20-day matrix, 3 in the middle focus zone (Q1 → EQ → Q3). High-probability arrays present.

In-focus PD arrays (carry extra algorithmic weight):
- FVG bullish @ 28551.30000 (1H)
- FVG bullish @ 28388.15000 (1H)
- OB bullish @ 29094.75000 (1H)
