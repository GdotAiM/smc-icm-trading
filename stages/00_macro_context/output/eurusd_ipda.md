# IPDA Dealing Range Analysis — EURUSD — 2026-08-03

## Nested Dealing Ranges (Macro → Micro)

| Timeframe | IPDA20 EQ | IPDA40 EQ | IPDA60 EQ | Zone | Position |
|-----------|-----------|-----------|-----------|------|----------|
| 1W | 1.15067 | — | — | DISCOUNT (buy) | 35.56% |
| 1D | 1.14561 | 1.14733 | 1.15562 | PREMIUM (sell) | 74.25% |
| 4H | 1.14668 | 1.14561 | — | PREMIUM (sell) | 71.26% |
| 1H | 1.15297 | 1.15070 | — | DISCOUNT (buy) | 9.56% |
| 15m | 1.15178 | — | — | DISCOUNT (buy) | 16.09% |

## Equilibrium Cascade (Stepping Stones)

Price delivers from one equilibrium to another. Each level acts as a checkpoint.

```
1W   EQ 1.15067      DISCOUNT (buy)      35.56%
1D   EQ 1.14561      PREMIUM (sell)     ██ 74.25%
4H   EQ 1.14668      PREMIUM (sell)     ██ 71.26%
1H   EQ 1.15297      DISCOUNT (buy)     █ 9.56%
15m  EQ 1.15178      DISCOUNT (buy)     █ 16.09%
```

## IPDA Draw Direction

**UP (toward equilibrium)**
Price is in DISCOUNT across macro (1W) and micro (15m). IPDA is drawing price UP toward equilibrium. Buy-side delivery domain.

**Zone Consensus**: DISCOUNT (2/5 premium, 3/5 discount) — MODERATE consensus

## AMD on the Dealing Range

**DISTRIBUTION ZONE — Price expanding from equilibrium toward extreme.**
Daily range: PREMIUM (sell) at 60.97% of range. DISTRIBUTION ZONE — Price expanding from equilibrium toward extreme. EQ @ 1.14733.

## Quarterly Shift

**Quarter month 2. Standard IPDA behavior expected.**

## How the IPDA Lens Changes Your Trade

- **Macro (1W)**: Price is DISCOUNT (buy) — institutional buy zone. Look for LONGS only when LTF confirms.
- **Meso (1D)**: Price is PREMIUM (sell) at 74.25% of range.
- **Micro (4H)**: Price is PREMIUM (sell). ⚠️ DIVERGENT from macro — this is a counter-trend move within the larger range.

- **Equilibrium Gravity**: The 1W equilibrium at 1.15067 is the macro fair value. Price is -0.01% below it. The algorithm will seek to return to this level.

- **Cascading Delivery**: Price must pass through each equilibrium checkpoint: 1W @ 1.15067 → 1D @ 1.14561 → 4H @ 1.14668 → 1H @ 1.15297 → 15m @ 1.15178. Each is a potential reaction zone.

---

*"The IPDA doesn't move randomly. It delivers price from one dealing range extreme to the other, hunting liquidity at every equilibrium checkpoint along the way."*

## False Breakout Detection
**BULL TRAP (20-day HIGH swept → reversal DOWN)**
⚠️ FALSE BREAKOUT: 20-day high @ 1.1559 swept, price reversed back inside. IPDA stop-hunt before bearish reversal. Target: 40-day low @ 1.13246 / 60-day low @ 1.13246.
- Direction: BEARISH
- Target: 40-day @ 1.13246 / 60-day @ 1.13246

## Kill Zone Alignment
⏳ NY PM active (weight: 1) — lower conviction. Prefer London KZ, NY AM KZ, or NY PM KZ.
- Active Zone: NY PM (weight: 1)

## IPDA Objective: REBALANCE (post-hunt)
Liquidity swept (8 pools). 2 unfilled FVGs remain — IPDA now rebalancing imbalances. Price drawing toward unfilled FVGs.
- Unfilled FVGs: 2 | Swept Pools: 8 | Unswept: 4

## Weekly Reference Levels (Marked 2026-08-03)
20-Day: H 1.15590 L 1.13532 EQ 1.14561 | 40-Day: H 1.16221 L 1.13246 EQ 1.14733 | 60-Day: H 1.17878 L 1.13246 EQ 1.15562

## PD Array Matrix — 20-Day IPDA Data Range

**Graded Levels**: Q1(25%) 1.14047 | EQ(50%) 1.14561 | Q3(75%) 1.15075 | Octants: 1.13789 | 1.14047 | 1.14304 | 1.14561 | 1.14818 | 1.15075 | 1.15333

**Focus Zone**: IN FOCUS (lower quadrant → equilibrium → upper quadrant) (price at 74.25% of 20-day range)

**Matrix Weighting**: ENHANCED — 7 PD arrays inside the 20-day matrix, 5 in the middle focus zone (Q1 → EQ → Q3). High-probability arrays present.

In-focus PD arrays (carry extra algorithmic weight):
- FVG bullish @ 1.14261 (4H)
- FVG bullish @ 1.14199 (1H)
- FVG bullish @ 1.14948 (15m)
- FVG bullish @ 1.14423 (15m)
- FVG bullish @ 1.14318 (15m)
