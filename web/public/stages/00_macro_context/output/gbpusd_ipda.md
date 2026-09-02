# IPDA Dealing Range Analysis — GBPUSD — 2026-09-02

## Nested Dealing Ranges (Macro → Micro)

| Timeframe | IPDA20 EQ | IPDA40 EQ | IPDA60 EQ | Zone | Position |
|-----------|-----------|-----------|-----------|------|----------|
| 1W | 1.35059 | — | — | DISCOUNT (buy) | 14.29% |
| 1D | 1.34080 | 1.34747 | 1.34080 | PREMIUM (sell) | 67.25% |
| 4H | 1.35827 | 1.35723 | — | DISCOUNT (buy) | 5.80% |
| 1H | 1.35275 | 1.35247 | — | DISCOUNT (buy) | 13.46% |
| 15m | 1.35022 | — | — | DISCOUNT (buy) | 40.48% |

## Equilibrium Cascade (Stepping Stones)

Price delivers from one equilibrium to another. Each level acts as a checkpoint.

```
1W   EQ 1.35059      DISCOUNT (buy)      14.29%
1D   EQ 1.34080      PREMIUM (sell)     ███ 67.25%
4H   EQ 1.35827      DISCOUNT (buy)     ███ 5.80%
1H   EQ 1.35275      DISCOUNT (buy)     █ 13.46%
15m  EQ 1.35022      DISCOUNT (buy)      40.48%
```

## IPDA Draw Direction

**UP (toward equilibrium)**
Price is in DISCOUNT across macro (1W) and micro (15m). IPDA is drawing price UP toward equilibrium. Buy-side delivery domain.

**Zone Consensus**: DISCOUNT (1/5 premium, 4/5 discount) — STRONG consensus

## AMD on the Dealing Range

**MANIPULATION ZONE — Price near equilibrium. Sweeps likely. The trap zone.**
Daily range: PREMIUM (sell) at 56.40% of range. MANIPULATION ZONE — Price near equilibrium. Sweeps likely. The trap zone. EQ @ 1.34747.

## Quarterly Shift

**Quarter month 3. Standard IPDA behavior expected.**

## How the IPDA Lens Changes Your Trade

- **Macro (1W)**: Price is DISCOUNT (buy) — institutional buy zone. Look for LONGS only when LTF confirms.
- **Meso (1D)**: Price is PREMIUM (sell) at 67.25% of range.
- **Micro (4H)**: Price is DISCOUNT (buy). ✅ ALIGNED with macro — trade with confidence.

- **Equilibrium Gravity**: The 1W equilibrium at 1.35059 is the macro fair value. Price is -0.04% below it. The algorithm will seek to return to this level.

- **Cascading Delivery**: Price must pass through each equilibrium checkpoint: 1W @ 1.35059 → 1D @ 1.34080 → 4H @ 1.35827 → 1H @ 1.35275 → 15m @ 1.35022. Each is a potential reaction zone.

---

*"The IPDA doesn't move randomly. It delivers price from one dealing range extreme to the other, hunting liquidity at every equilibrium checkpoint along the way."*

## False Breakout Detection
**Below 20-day low — monitoring for reversal**
Price below 20-day low @ 1.31402. If it reverses back above → false breakout confirmed.

## Kill Zone Alignment
⏳ London PM (dead zone) active (weight: 0.4) — lower conviction. Prefer London KZ, NY AM KZ, or NY PM KZ.
- Active Zone: London PM (dead zone) (weight: 0.4)

## IPDA Objective: HUNT LIQUIDITY
9 unswept pools vs 3 swept. IPDA hunting liquidity — expect sweep of nearest BSL/SSL before rebalancing.
- Unfilled FVGs: 2 | Swept Pools: 3 | Unswept: 9

## Weekly Reference Levels (Marked 2026-09-02)
20-Day: H 1.36758 L 1.31402 EQ 1.34080 | 40-Day: H 1.36758 L 1.32735 EQ 1.34747 | 60-Day: H 1.36758 L 1.31402 EQ 1.34080

## PD Array Matrix — 20-Day IPDA Data Range

**Graded Levels**: Q1(25%) 1.32741 | EQ(50%) 1.34080 | Q3(75%) 1.35419 | Octants: 1.32071 | 1.32741 | 1.33411 | 1.34080 | 1.34749 | 1.35419 | 1.36089

**Focus Zone**: IN FOCUS (lower quadrant → equilibrium → upper quadrant) (price at 67.25% of 20-day range)

**Matrix Weighting**: ENHANCED — 7 PD arrays inside the 20-day matrix, 3 in the middle focus zone (Q1 → EQ → Q3). High-probability arrays present.

In-focus PD arrays (carry extra algorithmic weight):
- FVG bullish @ 1.33287 (4H)
- OB bullish @ 1.33921 (4H)
- OB bullish @ 1.35106 (15m)
