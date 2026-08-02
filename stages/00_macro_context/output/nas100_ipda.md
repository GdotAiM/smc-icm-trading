# IPDA Dealing Range Analysis — NAS100 — 2026-08-02

## Nested Dealing Ranges (Macro → Micro)

| Timeframe | IPDA20 EQ | IPDA40 EQ | IPDA60 EQ | Zone | Position |
|-----------|-----------|-----------|-----------|------|----------|
| 1W | 28207.70000 | — | — | DISCOUNT (buy) | 16.51% |
| 1D | 28421.00000 | 28816.40000 | 28869.45000 | DISCOUNT (buy) | 41.15% |
| 4H | 27791.15000 | 27998.15000 | — | PREMIUM (sell) | 73.13% |
| 1H | 28279.00000 | 27898.40000 | — | DISCOUNT (buy) | 32.51% |
| 15m | 28257.50000 | — | — | DISCOUNT (buy) | 17.45% |

## Equilibrium Cascade (Stepping Stones)

Price delivers from one equilibrium to another. Each level acts as a checkpoint.

```
1W   EQ 28207.70000  DISCOUNT (buy)     █ 16.51%
1D   EQ 28421.00000  DISCOUNT (buy)     █████ 41.15%
4H   EQ 27791.15000  PREMIUM (sell)     ███████ 73.13%
1H   EQ 28279.00000  DISCOUNT (buy)     ██ 32.51%
15m  EQ 28257.50000  DISCOUNT (buy)     ██ 17.45%
```

## IPDA Draw Direction

**UP (toward equilibrium)**
Price is in DISCOUNT across macro (1W) and micro (15m). IPDA is drawing price UP toward equilibrium. Buy-side delivery domain.

**Zone Consensus**: DISCOUNT (1/5 premium, 4/5 discount) — STRONG consensus

## AMD on the Dealing Range

**DISTRIBUTION ZONE — Price expanding from equilibrium toward extreme.**
Daily range: DISCOUNT (buy) at 32.29% of range. DISTRIBUTION ZONE — Price expanding from equilibrium toward extreme. EQ @ 28816.40000.

## Quarterly Shift

**Quarter month 2. Standard IPDA behavior expected.**

## How the IPDA Lens Changes Your Trade

- **Macro (1W)**: Price is DISCOUNT (buy) — institutional buy zone. Look for LONGS only when LTF confirms.
- **Meso (1D)**: Price is DISCOUNT (buy) at 41.15% of range.
- **Micro (4H)**: Price is PREMIUM (sell). ⚠️ DIVERGENT from macro — this is a counter-trend move within the larger range.

- **Equilibrium Gravity**: The 1W equilibrium at 28207.70000 is the macro fair value. Price is -0.15% below it. The algorithm will seek to return to this level.

- **Cascading Delivery**: Price must pass through each equilibrium checkpoint: 1W @ 28207.70000 → 1D @ 28421.00000 → 4H @ 27791.15000 → 1H @ 28279.00000 → 15m @ 28257.50000. Each is a potential reaction zone.

---

*"The IPDA doesn't move randomly. It delivers price from one dealing range extreme to the other, hunting liquidity at every equilibrium checkpoint along the way."*

## False Breakout Detection
**Below 20-day low — monitoring for reversal**
Price below 20-day low @ 26980.6. If it reverses back above → false breakout confirmed.

## Kill Zone Alignment
⏳ NY Lunch active (weight: 0.4) — lower conviction. Prefer London KZ, NY AM KZ, or NY PM KZ.
- Active Zone: NY Lunch (weight: 0.4)

## IPDA Objective: POST-HUNT TRANSITION
All FVGs filled, 8 pools swept. IPDA in transition — awaiting next objective.
- Unfilled FVGs: 0 | Swept Pools: 8 | Unswept: 4

## Weekly Reference Levels (Marked 2026-08-02)
20-Day: H 29861.40000 L 26980.60000 EQ 28421.00000 | 40-Day: H 30652.20000 L 26980.60000 EQ 28816.40000 | 60-Day: H 30758.30000 L 26980.60000 EQ 28869.45000

## PD Array Matrix — 20-Day IPDA Data Range

**Graded Levels**: Q1(25%) 27700.80000 | EQ(50%) 28421.00000 | Q3(75%) 29141.20000 | Octants: 27340.70000 | 27700.80000 | 28060.90000 | 28421.00000 | 28781.10000 | 29141.20000 | 29501.30000

**Focus Zone**: IN FOCUS (lower quadrant → equilibrium → upper quadrant) (price at 41.15% of 20-day range)

**Matrix Weighting**: NEUTRAL — 1 PD arrays inside the 20-day matrix, 0 in the middle focus zone (Q1 → EQ → Q3). No high-probability arrays in the focus zone yet — wait for one to form inside it.
