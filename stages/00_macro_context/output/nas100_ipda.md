# IPDA Dealing Range Analysis — NAS100 — 2026-08-03

## Nested Dealing Ranges (Macro → Micro)

| Timeframe | IPDA20 EQ | IPDA40 EQ | IPDA60 EQ | Zone | Position |
|-----------|-----------|-----------|-----------|------|----------|
| 1W | 28708.95000 | — | — | DISCOUNT (buy) | 43.85% |
| 1D | 28421.00000 | 28816.40000 | 28869.45000 | PREMIUM (sell) | 59.83% |
| 4H | 27852.60000 | 27852.60000 | — | PREMIUM (sell) | 98.87% |
| 1H | 28435.10000 | 28340.45000 | — | PREMIUM (sell) | 96.60% |
| 15m | 28458.30000 | — | — | PREMIUM (sell) | 96.85% |

## Equilibrium Cascade (Stepping Stones)

Price delivers from one equilibrium to another. Each level acts as a checkpoint.

```
1W   EQ 28708.95000  DISCOUNT (buy)      43.85%
1D   EQ 28421.00000  PREMIUM (sell)     █████ 59.83%
4H   EQ 27852.60000  PREMIUM (sell)     ██████████ 98.87%
1H   EQ 28435.10000  PREMIUM (sell)     █████ 96.60%
15m  EQ 28458.30000  PREMIUM (sell)     ████ 96.85%
```

## IPDA Draw Direction

**TRANSITION (micro overbought within macro discount)**
Macro (1W) is in DISCOUNT but micro (15m) is in PREMIUM. Micro may be overbought within the larger discount context.

**Zone Consensus**: PREMIUM (4/5 premium, 1/5 discount) — STRONG consensus

## AMD on the Dealing Range

**MANIPULATION ZONE — Price near equilibrium. Sweeps likely. The trap zone.**
Daily range: DISCOUNT (buy) at 46.94% of range. MANIPULATION ZONE — Price near equilibrium. Sweeps likely. The trap zone. EQ @ 28816.40000.

## Quarterly Shift

**Quarter month 2. Standard IPDA behavior expected.**

## How the IPDA Lens Changes Your Trade

- **Macro (1W)**: Price is DISCOUNT (buy) — institutional buy zone. Look for LONGS only when LTF confirms.
- **Meso (1D)**: Price is PREMIUM (sell) at 59.83% of range.
- **Micro (4H)**: Price is PREMIUM (sell). ⚠️ DIVERGENT from macro — this is a counter-trend move within the larger range.

- **Equilibrium Gravity**: The 1W equilibrium at 28708.95000 is the macro fair value. Price is -0.01% below it. The algorithm will seek to return to this level.

- **Cascading Delivery**: Price must pass through each equilibrium checkpoint: 1W @ 28708.95000 → 1D @ 28421.00000 → 4H @ 27852.60000 → 1H @ 28435.10000 → 15m @ 28458.30000. Each is a potential reaction zone.

---

*"The IPDA doesn't move randomly. It delivers price from one dealing range extreme to the other, hunting liquidity at every equilibrium checkpoint along the way."*

## False Breakout Detection
**Below 20-day low — monitoring for reversal**
Price below 20-day low @ 26980.6. If it reverses back above → false breakout confirmed.

## Kill Zone Alignment
⏳ NY PM active (weight: 1) — lower conviction. Prefer London KZ, NY AM KZ, or NY PM KZ.
- Active Zone: NY PM (weight: 1)

## IPDA Objective: REBALANCE (post-hunt)
Liquidity swept (7 pools). 1 unfilled FVGs remain — IPDA now rebalancing imbalances. Price drawing toward unfilled FVGs.
- Unfilled FVGs: 1 | Swept Pools: 7 | Unswept: 5

## Weekly Reference Levels (Marked 2026-08-03)
20-Day: H 29861.40000 L 26980.60000 EQ 28421.00000 | 40-Day: H 30652.20000 L 26980.60000 EQ 28816.40000 | 60-Day: H 30758.30000 L 26980.60000 EQ 28869.45000

## PD Array Matrix — 20-Day IPDA Data Range

**Graded Levels**: Q1(25%) 27700.80000 | EQ(50%) 28421.00000 | Q3(75%) 29141.20000 | Octants: 27340.70000 | 27700.80000 | 28060.90000 | 28421.00000 | 28781.10000 | 29141.20000 | 29501.30000

**Focus Zone**: IN FOCUS (lower quadrant → equilibrium → upper quadrant) (price at 59.83% of 20-day range)

**Matrix Weighting**: ENHANCED — 2 PD arrays inside the 20-day matrix, 1 in the middle focus zone (Q1 → EQ → Q3). High-probability arrays present.

In-focus PD arrays (carry extra algorithmic weight):
- FVG bullish @ 28551.30000 (1H)
