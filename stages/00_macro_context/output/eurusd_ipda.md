# IPDA Dealing Range Analysis — EURUSD — 2026-08-10

## Nested Dealing Ranges (Macro → Micro)

| Timeframe | IPDA20 EQ | IPDA40 EQ | IPDA60 EQ | Zone | Position |
|-----------|-----------|-----------|-----------|------|----------|
| 1W | 1.15609 | — | — | DISCOUNT (buy) | 7.29% |
| 1D | 1.14670 | 1.14722 | 1.15053 | PREMIUM (sell) | 83.74% |
| 4H | 1.14670 | 1.15179 | — | PREMIUM (sell) | 83.74% |
| 1H | 1.15609 | 1.15492 | — | DISCOUNT (buy) | 7.04% |
| 15m | 1.15534 | — | — | DISCOUNT (buy) | 11.29% |

## Equilibrium Cascade (Stepping Stones)

Price delivers from one equilibrium to another. Each level acts as a checkpoint.

```
1W   EQ 1.15609      DISCOUNT (buy)     █ 7.29%
1D   EQ 1.14670      PREMIUM (sell)     ███ 83.74%
4H   EQ 1.14670      PREMIUM (sell)     ███ 83.74%
1H   EQ 1.15609      DISCOUNT (buy)     █ 7.04%
15m  EQ 1.15534      DISCOUNT (buy)      11.29%
```

## IPDA Draw Direction

**UP (toward equilibrium)**
Price is in DISCOUNT across macro (1W) and micro (15m). IPDA is drawing price UP toward equilibrium. Buy-side delivery domain.

**Zone Consensus**: DISCOUNT (2/5 premium, 3/5 discount) — MODERATE consensus

## AMD on the Dealing Range

**DISTRIBUTION ZONE — Price expanding from equilibrium toward extreme.**
Daily range: PREMIUM (sell) at 74.25% of range. DISTRIBUTION ZONE — Price expanding from equilibrium toward extreme. EQ @ 1.14722.

## Quarterly Shift

**Quarter month 2. Standard IPDA behavior expected.**

## How the IPDA Lens Changes Your Trade

- **Macro (1W)**: Price is DISCOUNT (buy) — institutional buy zone. Look for LONGS only when LTF confirms.
- **Meso (1D)**: Price is PREMIUM (sell) at 83.74% of range.
- **Micro (4H)**: Price is PREMIUM (sell). ⚠️ DIVERGENT from macro — this is a counter-trend move within the larger range.

- **Equilibrium Gravity**: The 1W equilibrium at 1.15609 is the macro fair value. Price is -0.15% below it. The algorithm will seek to return to this level.

- **Cascading Delivery**: Price must pass through each equilibrium checkpoint: 1W @ 1.15609 → 1D @ 1.14670 → 4H @ 1.14670 → 1H @ 1.15609 → 15m @ 1.15534. Each is a potential reaction zone.

---

*"The IPDA doesn't move randomly. It delivers price from one dealing range extreme to the other, hunting liquidity at every equilibrium checkpoint along the way."*

## False Breakout Detection
**BULL TRAP (20-day HIGH swept → reversal DOWN)**
⚠️ FALSE BREAKOUT: 20-day high @ 1.15808 swept, price reversed back inside. IPDA stop-hunt before bearish reversal. Target: 40-day low @ 1.13246 / 60-day low @ 1.13246.
- Direction: BEARISH
- Target: 40-day @ 1.13246 / 60-day @ 1.13246

## Kill Zone Alignment
⏳ NY PM active (weight: 1) — lower conviction. Prefer London KZ, NY AM KZ, or NY PM KZ.
- Active Zone: NY PM (weight: 1)

## IPDA Objective: REBALANCE (post-hunt)
Liquidity swept (7 pools). 1 unfilled FVGs remain — IPDA now rebalancing imbalances. Price drawing toward unfilled FVGs.
- Unfilled FVGs: 1 | Swept Pools: 7 | Unswept: 5

## Weekly Reference Levels (Marked 2026-08-10)
20-Day: H 1.15808 L 1.13532 EQ 1.14670 | 40-Day: H 1.16198 L 1.13246 EQ 1.14722 | 60-Day: H 1.16859 L 1.13246 EQ 1.15053

## PD Array Matrix — 20-Day IPDA Data Range

**Graded Levels**: Q1(25%) 1.14101 | EQ(50%) 1.14670 | Q3(75%) 1.15239 | Octants: 1.13817 | 1.14101 | 1.14386 | 1.14670 | 1.14955 | 1.15239 | 1.15524

**Focus Zone**: EXTREME UPPER (above upper quadrant) — secondary unless reversal/regime change (price at 83.74% of 20-day range)

**Matrix Weighting**: ENHANCED — 3 PD arrays inside the 20-day matrix, 2 in the middle focus zone (Q1 → EQ → Q3). High-probability arrays present.

In-focus PD arrays (carry extra algorithmic weight):
- FVG bullish @ 1.14261 (4H)
- FVG bullish @ 1.14199 (1H)
