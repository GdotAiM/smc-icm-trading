# Entry Plan — GBPUSD — 2026-07-31

## Data Freshness: 5/10 — ACCEPTABLE
- **Price source**: 1H @ 1.34758
- **1H close**: 1.34758 | **1m close**: 1.34758
- **Data age**: 31m since last candle
- ✅ Data is tradeable

## Model: **MMXM Sell Model** (0/12.6)

## Setup
- **Direction**: **NO TRADE** | **Entry TF**: 15m/5m
- **Trigger**: MSS downside + bearish FVG fill on 5m


## 3rd Daily Candle OTE (Priority 0 — Simple Scalping Strategy)
| Level | Price | Notes |
|-------|-------|-------|
| 3rd Candle High | 1.34768 | 3-candle range: 0.02033 |
| 62% Retrace | 1.33508 | OTE zone entry |
| 79% Retrace | 1.33162 | OTE zone boundary |
| Current Price | 1.34758 | ⏳ Outside zone |

## Fibonacci OTE Zone (Priority 1)
| Level | Price | Notes |
|-------|-------|-------|
| 62% Retracement | 1.34016 | OTE zone entry |
| **70.5% (Ideal)** | **1.34184** | ICT ideal entry |
| 79% Retracement | 1.34352 | OTE zone boundary |
| Current Price | 1.34758 | ⚠️ 57 pips from ideal |

## Parameters (ICT-Correct)
| | Price | Distance | Reasoning |
|---|-------|----------|-----------|
| Entry | 1.34758 | — | Current 1H price |
| SL | 0.00000 | 13476 pips | 🛑 Inducement not swept — entry gate closed at pre-check |
| TP1 | 0.00000 | 13476 pips |  |
| TP2 | 0.00000 | 13476 pips |  |

## Risk-Reward
- **R:R TP1**: 1.00:1 ✅

## IOFED Pyramid Entry (bearish FVG)
| Level | Price | Size | Risk | R:R | Notes |
|-------|-------|------|------|-----|-------|
| 🥇 Starter | 1.34959 | 40% | 13496 pips | 1.00:1 | IOFED (FVG edge) |
| 🥈 Add #1 | 1.34939 | 35% | 13494 pips | 1.00:1 | CE 50% |
| 🥉 Add #2 | 1.34914 | 25% | 13491 pips | 1.00:1 | Far edge (full mitigation) |

- **R:R TP2**: 1.00:1
- **Risk**: 13476 pips

## Checklist
- [ ] SL at structural invalidation: ✓
- [ ] HTF bias aligned: ✓
- [ ] Killzone active: ✗
- [ ] R:R ≥ 1:1: ✓
