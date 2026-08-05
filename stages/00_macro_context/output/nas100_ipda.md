# IPDA Dealing Range Analysis — NAS100 — 2026-08-05

## Nested Dealing Ranges (Macro → Micro)

| Timeframe | IPDA20 EQ | IPDA40 EQ | IPDA60 EQ | Zone | Position |
|-----------|-----------|-----------|-----------|------|----------|
| 1W | 29870.50000 | — | — | PREMIUM (sell) | 55.82% |
| 1D | 28465.90000 | 28816.40000 | 28869.45000 | PREMIUM (sell) | 97.60% |
| 4H | 28953.75000 | 28465.90000 | — | PREMIUM (sell) | 96.15% |
| 1H | 29794.70000 | 29332.85000 | — | PREMIUM (sell) | 75.46% |
| 15m | 29821.90000 | — | — | PREMIUM (sell) | 70.26% |

## Equilibrium Cascade (Stepping Stones)

Price delivers from one equilibrium to another. Each level acts as a checkpoint.

```
1W   EQ 29870.50000  PREMIUM (sell)      55.82%
1D   EQ 28465.90000  PREMIUM (sell)     ██████████ 97.60%
4H   EQ 28953.75000  PREMIUM (sell)     ██████████ 96.15%
1H   EQ 29794.70000  PREMIUM (sell)     █ 75.46%
15m  EQ 29821.90000  PREMIUM (sell)     █ 70.26%
```

## IPDA Draw Direction

**DOWN (toward equilibrium)**
Price is in PREMIUM across macro (1W) and micro (15m). IPDA is drawing price DOWN toward equilibrium. Sell-side delivery domain.

**Zone Consensus**: PREMIUM (5/5 premium, 0/5 discount) — STRONG consensus

## AMD on the Dealing Range

**ACCUMULATION ZONE — Price at range extreme. Institutions building positions.**
Daily range: PREMIUM (sell) at 78.97% of range. ACCUMULATION ZONE — Price at range extreme. Institutions building positions. EQ @ 28816.40000.

## Quarterly Shift

**Quarter month 2. Standard IPDA behavior expected.**

## How the IPDA Lens Changes Your Trade

- **Macro (1W)**: Price is PREMIUM (sell) — institutional sell zone. Look for SHORTS only when LTF confirms.
- **Meso (1D)**: Price is PREMIUM (sell) at 97.60% of range.
- **Micro (4H)**: Price is PREMIUM (sell). ✅ ALIGNED with macro — trade with confidence.

- **Equilibrium Gravity**: The 1W equilibrium at 29870.50000 is the macro fair value. Price is 0.03% above it. The algorithm will seek to return to this level.

- **Cascading Delivery**: Price must pass through each equilibrium checkpoint: 1W @ 29870.50000 → 1D @ 28465.90000 → 4H @ 28953.75000 → 1H @ 29794.70000 → 15m @ 29821.90000. Each is a potential reaction zone.

---

*"The IPDA doesn't move randomly. It delivers price from one dealing range extreme to the other, hunting liquidity at every equilibrium checkpoint along the way."*

## False Breakout Detection
**BULL TRAP (20-day HIGH swept → reversal DOWN)**
⚠️ FALSE BREAKOUT: 20-day high @ 29951.2 swept, price reversed back inside. IPDA stop-hunt before bearish reversal. Target: 40-day low @ 26980.6 / 60-day low @ 26980.6.
- Direction: BEARISH
- Target: 40-day @ 26980.60000 / 60-day @ 26980.60000

## Kill Zone Alignment
⏳ NY PM active (weight: 1) — lower conviction. Prefer London KZ, NY AM KZ, or NY PM KZ.
- Active Zone: NY PM (weight: 1)

## IPDA Objective: HUNT LIQUIDITY
8 unswept pools vs 4 swept. IPDA hunting liquidity — expect sweep of nearest BSL/SSL before rebalancing.
- Unfilled FVGs: 2 | Swept Pools: 4 | Unswept: 8

## Weekly Reference Levels (Marked 2026-08-05)
20-Day: H 29951.20000 L 26980.60000 EQ 28465.90000 | 40-Day: H 30652.20000 L 26980.60000 EQ 28816.40000 | 60-Day: H 30758.30000 L 26980.60000 EQ 28869.45000

## PD Array Matrix — 20-Day IPDA Data Range

**Graded Levels**: Q1(25%) 27723.25000 | EQ(50%) 28465.90000 | Q3(75%) 29208.55000 | Octants: 27351.92500 | 27723.25000 | 28094.57500 | 28465.90000 | 28837.22500 | 29208.55000 | 29579.87500

**Focus Zone**: EXTREME UPPER (above upper quadrant) — secondary unless reversal/regime change (price at 97.60% of 20-day range)

**Matrix Weighting**: ENHANCED — 7 PD arrays inside the 20-day matrix, 6 in the middle focus zone (Q1 → EQ → Q3). High-probability arrays present.

In-focus PD arrays (carry extra algorithmic weight):
- FVG bullish @ 28551.30000 (1H)
- OB bullish @ 29094.75000 (1H)
- FVG bullish @ 28806.00000 (15m)
- FVG bullish @ 28770.80000 (15m)
- OB bullish @ 28737.25000 (15m)
- OB bullish @ 28838.30000 (15m)
