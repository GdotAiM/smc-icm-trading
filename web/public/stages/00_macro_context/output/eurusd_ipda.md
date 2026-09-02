# IPDA Dealing Range Analysis — EURUSD — 2026-09-02

## Nested Dealing Ranges (Macro → Micro)

| Timeframe | IPDA20 EQ | IPDA40 EQ | IPDA60 EQ | Zone | Position |
|-----------|-----------|-----------|-----------|------|----------|
| 1W | 1.15758 | — | — | DISCOUNT (buy) | 43.78% |
| 1D | 1.15324 | 1.15324 | 1.15181 | PREMIUM (sell) | 61.72% |
| 4H | 1.16390 | 1.16231 | — | DISCOUNT (buy) | 5.58% |
| 1H | 1.15956 | 1.15956 | — | DISCOUNT (buy) | 13.94% |
| 15m | 1.15758 | — | — | DISCOUNT (buy) | 44.86% |

## Equilibrium Cascade (Stepping Stones)

Price delivers from one equilibrium to another. Each level acts as a checkpoint.

```
1W   EQ 1.15758      DISCOUNT (buy)      43.78%
1D   EQ 1.15324      PREMIUM (sell)     ██ 61.72%
4H   EQ 1.16390      DISCOUNT (buy)     ███ 5.58%
1H   EQ 1.15956      DISCOUNT (buy)     █ 13.94%
15m  EQ 1.15758      DISCOUNT (buy)      44.86%
```

## IPDA Draw Direction

**UP (toward equilibrium)**
Price is in DISCOUNT across macro (1W) and micro (15m). IPDA is drawing price UP toward equilibrium. Buy-side delivery domain.

**Zone Consensus**: DISCOUNT (1/5 premium, 4/5 discount) — STRONG consensus

## AMD on the Dealing Range

**DISTRIBUTION ZONE — Price expanding from equilibrium toward extreme.**
Daily range: PREMIUM (sell) at 61.72% of range. DISTRIBUTION ZONE — Price expanding from equilibrium toward extreme. EQ @ 1.15324.

## Quarterly Shift

**Quarter month 3. Standard IPDA behavior expected.**

## How the IPDA Lens Changes Your Trade

- **Macro (1W)**: Price is DISCOUNT (buy) — institutional buy zone. Look for LONGS only when LTF confirms.
- **Meso (1D)**: Price is PREMIUM (sell) at 61.72% of range.
- **Micro (4H)**: Price is DISCOUNT (buy). ✅ ALIGNED with macro — trade with confidence.

- **Equilibrium Gravity**: The 1W equilibrium at 1.15758 is the macro fair value. Price is -0.01% below it. The algorithm will seek to return to this level.

- **Cascading Delivery**: Price must pass through each equilibrium checkpoint: 1W @ 1.15758 → 1D @ 1.15324 → 4H @ 1.16390 → 1H @ 1.15956 → 15m @ 1.15758. Each is a potential reaction zone.

---

*"The IPDA doesn't move randomly. It delivers price from one dealing range extreme to the other, hunting liquidity at every equilibrium checkpoint along the way."*

## False Breakout Detection
**BULL TRAP (20-day HIGH swept → reversal DOWN)**
⚠️ FALSE BREAKOUT: 20-day high @ 1.17116 swept, price reversed back inside. IPDA stop-hunt before bearish reversal. Target: 40-day low @ 1.13532 / 60-day low @ 1.13246.
- Direction: BEARISH
- Target: 40-day @ 1.13532 / 60-day @ 1.13246

## Kill Zone Alignment
⏳ London PM (dead zone) active (weight: 0.4) — lower conviction. Prefer London KZ, NY AM KZ, or NY PM KZ.
- Active Zone: London PM (dead zone) (weight: 0.4)

## IPDA Objective: HUNT LIQUIDITY
7 unswept pools vs 5 swept. IPDA hunting liquidity — expect sweep of nearest BSL/SSL before rebalancing.
- Unfilled FVGs: 1 | Swept Pools: 5 | Unswept: 7

## Weekly Reference Levels (Marked 2026-09-02)
20-Day: H 1.17116 L 1.13532 EQ 1.15324 | 40-Day: H 1.17116 L 1.13532 EQ 1.15324 | 60-Day: H 1.17116 L 1.13246 EQ 1.15181

## PD Array Matrix — 20-Day IPDA Data Range

**Graded Levels**: Q1(25%) 1.14428 | EQ(50%) 1.15324 | Q3(75%) 1.16220 | Octants: 1.13980 | 1.14428 | 1.14876 | 1.15324 | 1.15772 | 1.16220 | 1.16668

**Focus Zone**: IN FOCUS (lower quadrant → equilibrium → upper quadrant) (price at 61.72% of 20-day range)

**Matrix Weighting**: ENHANCED — 11 PD arrays inside the 20-day matrix, 5 in the middle focus zone (Q1 → EQ → Q3). High-probability arrays present.

In-focus PD arrays (carry extra algorithmic weight):
- OB bearish @ 1.16040 (1H)
- FVG bearish @ 1.15851 (15m)
- FVG bearish @ 1.16166 (15m)
- FVG bearish @ 1.16200 (15m)
- OB bearish @ 1.15873 (15m)
