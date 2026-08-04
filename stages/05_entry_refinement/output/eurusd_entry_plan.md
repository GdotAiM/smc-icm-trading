# Entry Plan — EURUSD — 2026-08-04

## Data Freshness: 5/10 — ACCEPTABLE
- **Price source**: 1H @ 1.15327
- **1H close**: 1.15327 | **1m close**: 1.15328
- **Data age**: 53m since last candle
- ✅ Data is tradeable

## Model: **MMXM Sell Model** (0/12.6)

## Setup
- **Direction**: **NO TRADE** | **Entry TF**: 15m/5m
- **Trigger**: MSS downside + bearish FVG fill on 5m


## 3rd Daily Candle OTE (Priority 0 — Simple Scalping Strategy)
| Level | Price | Notes |
|-------|-------|-------|
| 3rd Candle High | 1.15590 | 3-candle range: 0.01246 |
| 62% Retrace | 1.14817 | OTE zone entry |
| 79% Retrace | 1.14606 | OTE zone boundary |
| Current Price | 1.15327 | ⏳ Outside zone |

## Fibonacci OTE Zone (Priority 1)
| Level | Price | Notes |
|-------|-------|-------|
| 62% Retracement | 1.15231 | OTE zone entry |
| **70.5% (Ideal)** | **1.15262** | ICT ideal entry |
| 79% Retracement | 1.15293 | OTE zone boundary |
| Current Price | 1.15327 | ⚠️ 6 pips from ideal |

## Parameters (ICT-Correct)
| | Price | Distance | Reasoning |
|---|-------|----------|-----------|
| Entry | 1.15327 | — | Current 1H price |
| SL | 0.00000 | 11533 pips | 🛑 Inducement not swept — entry gate closed at pre-check |
| TP1 | 0.00000 | 11533 pips |  |
| TP2 | 0.00000 | 11533 pips |  |

## Risk-Reward
- **R:R TP1**: 1.00:1 ✅

## IOFED Pyramid Entry (bullish FVG)
| Level | Price | Size | Risk | R:R | Notes |
|-------|-------|------|------|-----|-------|
| 🥇 Starter | 1.14028 | 40% | 11403 pips | 1.00:1 | IOFED (FVG edge) |
| 🥈 Add #1 | 1.14261 | 35% | 11426 pips | 1.00:1 | CE 50% |
| 🥉 Add #2 | 1.14552 | 25% | 11455 pips | 1.00:1 | Far edge (full mitigation) |

- **R:R TP2**: 1.00:1
- **Risk**: 11533 pips

## Checklist
- [ ] SL at structural invalidation: ✓
- [ ] HTF bias aligned: ✓
- [ ] Killzone active: ✓
- [ ] R:R ≥ 1:1: ✓
