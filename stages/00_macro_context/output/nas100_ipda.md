# IPDA Dealing Range Analysis — NAS100 — 2026-08-04

## Nested Dealing Ranges (Macro → Micro)

| Timeframe | IPDA20 EQ | IPDA40 EQ | IPDA60 EQ | Zone | Position |
|-----------|-----------|-----------|-----------|------|----------|
| 1W | 29756.45000 | — | — | PREMIUM (sell) | 97.01% |
| 1D | 28421.00000 | 28816.40000 | 28869.45000 | PREMIUM (sell) | 97.74% |
| 4H | 28723.95000 | 28388.60000 | — | PREMIUM (sell) | 99.99% |
| 1H | 29255.55000 | 28994.30000 | — | PREMIUM (sell) | 99.84% |
| 15m | 29579.70000 | — | — | PREMIUM (sell) | 99.61% |

## Equilibrium Cascade (Stepping Stones)

Price delivers from one equilibrium to another. Each level acts as a checkpoint.

```
1W   EQ 29756.45000  PREMIUM (sell)     █ 97.01%
1D   EQ 28421.00000  PREMIUM (sell)     ██████████ 97.74%
4H   EQ 28723.95000  PREMIUM (sell)     ██████████ 99.99%
1H   EQ 29255.55000  PREMIUM (sell)     █████████ 99.84%
15m  EQ 29579.70000  PREMIUM (sell)     ████ 99.61%
```

## IPDA Draw Direction

**DOWN (toward equilibrium)**
Price is in PREMIUM across macro (1W) and micro (15m). IPDA is drawing price DOWN toward equilibrium. Sell-side delivery domain.

**Zone Consensus**: PREMIUM (5/5 premium, 0/5 discount) — STRONG consensus

## AMD on the Dealing Range

**ACCUMULATION ZONE — Price at range extreme. Institutions building positions.**
Daily range: PREMIUM (sell) at 76.69% of range. ACCUMULATION ZONE — Price at range extreme. Institutions building positions. EQ @ 28816.40000.

## Quarterly Shift

**Quarter month 2. Standard IPDA behavior expected.**

## How the IPDA Lens Changes Your Trade

- **Macro (1W)**: Price is PREMIUM (sell) — institutional sell zone. Look for SHORTS only when LTF confirms.
- **Meso (1D)**: Price is PREMIUM (sell) at 97.74% of range.
- **Micro (4H)**: Price is PREMIUM (sell). ✅ ALIGNED with macro — trade with confidence.

- **Equilibrium Gravity**: The 1W equilibrium at 29756.45000 is the macro fair value. Price is 0.12% above it. The algorithm will seek to return to this level.

- **Cascading Delivery**: Price must pass through each equilibrium checkpoint: 1W @ 29756.45000 → 1D @ 28421.00000 → 4H @ 28723.95000 → 1H @ 29255.55000 → 15m @ 29579.70000. Each is a potential reaction zone.

---

*"The IPDA doesn't move randomly. It delivers price from one dealing range extreme to the other, hunting liquidity at every equilibrium checkpoint along the way."*

## False Breakout Detection
**Below 20-day low — monitoring for reversal**
Price below 20-day low @ 26980.6. If it reverses back above → false breakout confirmed.

## Kill Zone Alignment
⏳ NY PM active (weight: 1) — lower conviction. Prefer London KZ, NY AM KZ, or NY PM KZ.
- Active Zone: NY PM (weight: 1)

## IPDA Objective: HUNT LIQUIDITY
8 unswept pools vs 4 swept. IPDA hunting liquidity — expect sweep of nearest BSL/SSL before rebalancing.
- Unfilled FVGs: 2 | Swept Pools: 4 | Unswept: 8

## Weekly Reference Levels (Marked 2026-08-04)
20-Day: H 29861.40000 L 26980.60000 EQ 28421.00000 | 40-Day: H 30652.20000 L 26980.60000 EQ 28816.40000 | 60-Day: H 30758.30000 L 26980.60000 EQ 28869.45000

## PD Array Matrix — 20-Day IPDA Data Range

**Graded Levels**: Q1(25%) 27700.80000 | EQ(50%) 28421.00000 | Q3(75%) 29141.20000 | Octants: 27340.70000 | 27700.80000 | 28060.90000 | 28421.00000 | 28781.10000 | 29141.20000 | 29501.30000

**Focus Zone**: EXTREME UPPER (above upper quadrant) — secondary unless reversal/regime change (price at 97.74% of 20-day range)

**Matrix Weighting**: ENHANCED — 7 PD arrays inside the 20-day matrix, 6 in the middle focus zone (Q1 → EQ → Q3). High-probability arrays present.

In-focus PD arrays (carry extra algorithmic weight):
- FVG bullish @ 28551.30000 (1H)
- OB bullish @ 29094.75000 (1H)
- FVG bullish @ 28806.00000 (15m)
- FVG bullish @ 28770.80000 (15m)
- OB bullish @ 28737.25000 (15m)
- OB bullish @ 28838.30000 (15m)
