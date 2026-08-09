# IPDA Dealing Range Analysis — EURUSD — 2026-08-07

## Nested Dealing Ranges (Macro → Micro)

| Timeframe | IPDA20 EQ | IPDA40 EQ | IPDA60 EQ | Zone | Position |
|-----------|-----------|-----------|-----------|------|----------|
| 1W | 1.15274 | — | — | PREMIUM (sell) | 91.43% |
| 1D | 1.14565 | 1.14733 | 1.15053 | PREMIUM (sell) | 85.04% |
| 4H | 1.15314 | 1.14970 | — | DISCOUNT (buy) | 45.31% |
| 1H | 1.15230 | 1.15372 | — | PREMIUM (sell) | 84.85% |
| 15m | 1.15244 | — | — | PREMIUM (sell) | 81.48% |

## Equilibrium Cascade (Stepping Stones)

Price delivers from one equilibrium to another. Each level acts as a checkpoint.

```
1W   EQ 1.15274      PREMIUM (sell)      91.43%
1D   EQ 1.14565      PREMIUM (sell)     ███ 85.04%
4H   EQ 1.15314      DISCOUNT (buy)      45.31%
1H   EQ 1.15230      PREMIUM (sell)      84.85%
15m  EQ 1.15244      PREMIUM (sell)      81.48%
```

## IPDA Draw Direction

**DOWN (toward equilibrium)**
Price is in PREMIUM across macro (1W) and micro (15m). IPDA is drawing price DOWN toward equilibrium. Sell-side delivery domain.

**Zone Consensus**: PREMIUM (4/5 premium, 1/5 discount) — STRONG consensus

## AMD on the Dealing Range

**DISTRIBUTION ZONE — Price expanding from equilibrium toward extreme.**
Daily range: PREMIUM (sell) at 68.64% of range. DISTRIBUTION ZONE — Price expanding from equilibrium toward extreme. EQ @ 1.14733.

## Quarterly Shift

**Quarter month 2. Standard IPDA behavior expected.**

## How the IPDA Lens Changes Your Trade

- **Macro (1W)**: Price is PREMIUM (sell) — institutional sell zone. Look for SHORTS only when LTF confirms.
- **Meso (1D)**: Price is PREMIUM (sell) at 85.04% of range.
- **Micro (4H)**: Price is DISCOUNT (buy). ⚠️ DIVERGENT from macro — this is a counter-trend move within the larger range.

- **Equilibrium Gravity**: The 1W equilibrium at 1.15274 is the macro fair value. Price is 0.01% above it. The algorithm will seek to return to this level.

- **Cascading Delivery**: Price must pass through each equilibrium checkpoint: 1W @ 1.15274 → 1D @ 1.14565 → 4H @ 1.15314 → 1H @ 1.15230 → 15m @ 1.15244. Each is a potential reaction zone.

---

*"The IPDA doesn't move randomly. It delivers price from one dealing range extreme to the other, hunting liquidity at every equilibrium checkpoint along the way."*

## False Breakout Detection
**BULL TRAP (20-day HIGH swept → reversal DOWN)**
⚠️ FALSE BREAKOUT: 20-day high @ 1.15597 swept, price reversed back inside. IPDA stop-hunt before bearish reversal. Target: 40-day low @ 1.13246 / 60-day low @ 1.13246.
- Direction: BEARISH
- Target: 40-day @ 1.13246 / 60-day @ 1.13246

## Kill Zone Alignment
⏳ London PM active (weight: 1) — lower conviction. Prefer London KZ, NY AM KZ, or NY PM KZ.
- Active Zone: London PM (weight: 1)

## IPDA Objective: REBALANCE (post-hunt)
Liquidity swept (7 pools). 1 unfilled FVGs remain — IPDA now rebalancing imbalances. Price drawing toward unfilled FVGs.
- Unfilled FVGs: 1 | Swept Pools: 7 | Unswept: 5

## Weekly Reference Levels (Marked 2026-08-07)
20-Day: H 1.15597 L 1.13532 EQ 1.14565 | 40-Day: H 1.16221 L 1.13246 EQ 1.14733 | 60-Day: H 1.16859 L 1.13246 EQ 1.15053

## PD Array Matrix — 20-Day IPDA Data Range

**Graded Levels**: Q1(25%) 1.14048 | EQ(50%) 1.14565 | Q3(75%) 1.15081 | Octants: 1.13790 | 1.14048 | 1.14306 | 1.14565 | 1.14823 | 1.15081 | 1.15339

**Focus Zone**: EXTREME UPPER (above upper quadrant) — secondary unless reversal/regime change (price at 85.04% of 20-day range)

**Matrix Weighting**: ENHANCED — 5 PD arrays inside the 20-day matrix, 3 in the middle focus zone (Q1 → EQ → Q3). High-probability arrays present.

In-focus PD arrays (carry extra algorithmic weight):
- FVG bullish @ 1.14261 (4H)
- FVG bullish @ 1.14199 (1H)
- OB bullish @ 1.15041 (15m)
