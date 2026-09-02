# IPDA Dealing Range Analysis — NAS100 — 2026-09-01

## Nested Dealing Ranges (Macro → Micro)

| Timeframe | IPDA20 EQ | IPDA40 EQ | IPDA60 EQ | Zone | Position |
|-----------|-----------|-----------|-----------|------|----------|
| 1W | 29115.30000 | — | — | DISCOUNT (buy) | 10.34% |
| 1D | 28611.80000 | 28611.80000 | 28816.40000 | PREMIUM (sell) | 64.65% |
| 4H | 29371.05000 | 29313.55000 | — | DISCOUNT (buy) | 13.07% |
| 1H | 29252.70000 | 29252.70000 | — | DISCOUNT (buy) | 18.91% |
| 15m | 29127.40000 | — | — | DISCOUNT (buy) | 37.07% |

## Equilibrium Cascade (Stepping Stones)

Price delivers from one equilibrium to another. Each level acts as a checkpoint.

```
1W   EQ 29115.30000  DISCOUNT (buy)      10.34%
1D   EQ 28611.80000  PREMIUM (sell)     ████████ 64.65%
4H   EQ 29371.05000  DISCOUNT (buy)     █████ 13.07%
1H   EQ 29252.70000  DISCOUNT (buy)     ███ 18.91%
15m  EQ 29127.40000  DISCOUNT (buy)     █ 37.07%
```

## IPDA Draw Direction

**UP (toward equilibrium)**
Price is in DISCOUNT across macro (1W) and micro (15m). IPDA is drawing price UP toward equilibrium. Buy-side delivery domain.

**Zone Consensus**: DISCOUNT (1/5 premium, 4/5 discount) — STRONG consensus

## AMD on the Dealing Range

**DISTRIBUTION ZONE — Price expanding from equilibrium toward extreme.**
Daily range: PREMIUM (sell) at 64.65% of range. DISTRIBUTION ZONE — Price expanding from equilibrium toward extreme. EQ @ 28611.80000.

## Quarterly Shift

**Quarter month 3. Standard IPDA behavior expected.**

## How the IPDA Lens Changes Your Trade

- **Macro (1W)**: Price is DISCOUNT (buy) — institutional buy zone. Look for LONGS only when LTF confirms.
- **Meso (1D)**: Price is PREMIUM (sell) at 64.65% of range.
- **Micro (4H)**: Price is DISCOUNT (buy). ✅ ALIGNED with macro — trade with confidence.

- **Equilibrium Gravity**: The 1W equilibrium at 29115.30000 is the macro fair value. Price is -0.09% below it. The algorithm will seek to return to this level.

- **Cascading Delivery**: Price must pass through each equilibrium checkpoint: 1W @ 29115.30000 → 1D @ 28611.80000 → 4H @ 29371.05000 → 1H @ 29252.70000 → 15m @ 29127.40000. Each is a potential reaction zone.

---

*"The IPDA doesn't move randomly. It delivers price from one dealing range extreme to the other, hunting liquidity at every equilibrium checkpoint along the way."*

## False Breakout Detection
**Below 20-day low — monitoring for reversal**
Price below 20-day low @ 26980.6. If it reverses back above → false breakout confirmed.

## Kill Zone Alignment
⏳ NY PM active (weight: 1) — lower conviction. Prefer London KZ, NY AM KZ, or NY PM KZ.
- Active Zone: NY PM (weight: 1)

## IPDA Objective: REBALANCE (post-hunt)
Liquidity swept (9 pools). 1 unfilled FVGs remain — IPDA now rebalancing imbalances. Price drawing toward unfilled FVGs.
- Unfilled FVGs: 1 | Swept Pools: 9 | Unswept: 3

## Weekly Reference Levels (Marked 2026-09-01)
20-Day: H 30243.00000 L 26980.60000 EQ 28611.80000 | 40-Day: H 30243.00000 L 26980.60000 EQ 28611.80000 | 60-Day: H 30652.20000 L 26980.60000 EQ 28816.40000

## PD Array Matrix — 20-Day IPDA Data Range

**Graded Levels**: Q1(25%) 27796.20000 | EQ(50%) 28611.80000 | Q3(75%) 29427.40000 | Octants: 27388.40000 | 27796.20000 | 28204.00000 | 28611.80000 | 29019.60000 | 29427.40000 | 29835.20000

**Focus Zone**: IN FOCUS (lower quadrant → equilibrium → upper quadrant) (price at 64.65% of 20-day range)

**Matrix Weighting**: NEUTRAL — 1 PD arrays inside the 20-day matrix, 0 in the middle focus zone (Q1 → EQ → Q3). No high-probability arrays in the focus zone yet — wait for one to form inside it.
