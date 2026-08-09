# Entry Plan — GBPUSD — 2026-08-07

## Data Freshness: 9/10 — FRESH
- **Price source**: 1H @ 1.34554
- **1H close**: 1.34554 | **1m close**: 1.34559
- **Data age**: 5m since last candle
- ✅ Data is tradeable

## Model: **MMXM Sell Model** (0/9)

## Setup
- **Direction**: **NO TRADE** | **Entry TF**: 15m/5m
- **Trigger**: MSS downside + bearish FVG fill on 5m


## 3rd Daily Candle OTE (Priority 0 — Simple Scalping Strategy)
| Level | Price | Notes |
|-------|-------|-------|
| 3rd Candle High | 1.34862 | 3-candle range: 0.00666 |
| 62% Retrace | 1.34449 | OTE zone entry |
| 79% Retrace | 1.34336 | OTE zone boundary |
| Current Price | 1.34554 | ⏳ Outside zone |

## Fibonacci OTE Zone (Priority 1)
| Level | Price | Notes |
|-------|-------|-------|
| 62% Retracement | 1.34559 | OTE zone entry |
| **70.5% (Ideal)** | **1.34612** | ICT ideal entry |
| 79% Retracement | 1.34664 | OTE zone boundary |
| Current Price | 1.34554 | ⚠️ 6 pips from ideal |

## Parameters (ICT-Correct)
| | Price | Distance | Reasoning |
|---|-------|----------|-----------|
| Entry | 1.34554 | — | Current 1H price |
| SL | 0.00000 | 13455 pips | 🛑 Inducement not swept — entry gate closed at pre-check |
| TP1 | 0.00000 | 13455 pips |  |
| TP2 | 0.00000 | 13455 pips |  |

## Risk-Reward
- **R:R TP1**: 1.00:1 ✅

## IOFED Pyramid Entry (bullish FVG)
| Level | Price | Size | Risk | R:R | Notes |
|-------|-------|------|------|-----|-------|
| 🥇 Starter | 1.33093 | 40% | 13309 pips | 1.00:1 | IOFED (FVG edge) |
| 🥈 Add #1 | 1.33287 | 35% | 13329 pips | 1.00:1 | CE 50% |
| 🥉 Add #2 | 1.33530 | 25% | 13353 pips | 1.00:1 | Far edge (full mitigation) |

- **R:R TP2**: 1.00:1
- **Risk**: 13455 pips

## Checklist
- [ ] SL at structural invalidation: ✓
- [ ] HTF bias aligned: ✓
- [ ] Killzone active: ✓
- [ ] R:R ≥ 1:1: ✓
