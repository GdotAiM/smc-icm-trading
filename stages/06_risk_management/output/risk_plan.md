# Risk Plan — EURUSD — 2026-07-26

## Account Summary
- **Balance**: $10 000
- **Risk Per Trade**: 1% = $100
- **Daily Loss Limit**: $300.00 (3% of account)

## Position Size Calculation
| Parameter | Value |
|-----------|-------|
| Entry Price | 1.13706 |
| Stop Loss | 1.14068 (structural invalidation) |
| Stop Distance | 36 pips |
| Risk Amount | $100 |
| Lot Type | standard |
| **Position Size** | **0.28 standard lots** |
| Notional Value | $31585.00 |

## Trade Ticket
```
PAIR:       EURUSD
DIRECTION:  SHORT
ENTRY:      1.13706 (limit order)
STOP LOSS:  1.14068 (36 pips risk)
TAKE PROFIT 1: 1.13344 (36 pips, close 50%)
TAKE PROFIT 2: 1.12982 (72 pips, close 50%)
POSITION:   0.28 standard lots
RISK:       $100.00 (1% of account)
MAX GAIN:   $300.00 (TP1: $100.00 + TP2: $200.00)
R:R (TP1):  1.00:1
```

## Trade Management
- [ ] Move SL to breakeven after TP1 hit
- [ ] Close 50% at TP1, trail remaining to TP2
- [ ] Trail SL after TP1: behind nearest 1H swing
- [ ] Time stop: close if not at TP1 within 2× entry TF candles

## Execution Mode
**PAPER**

## Pre-Execution Checklist
- [ ] R:R ≥ minimum (1.0:1): ✓
- [ ] Risk ≤ max risk per trade: ✓ ($100.00)
- [ ] SL at structural invalidation: ✓ (4H Swing High @ 1.14012 + 0.00056 ATR buffer)
- [ ] Daily loss not exceeded: ✓
- [ ] No correlated positions: ✓ (single pair)
- [ ] Alerts set in TradingView: pending
- [ ] Journal entry ready for Stage 07: ✓
