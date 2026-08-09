# Entry Plan — DXY — 2026-08-07

## Data Freshness: 9/10 — FRESH
- **Price source**: 1H @ 12685.00
- **1H close**: 12685.00 | **1m close**: 12685.00
- **Data age**: 5m since last candle
- ✅ Data is tradeable

## Model: **MMXM Sell Model** (0/9)

## Setup
- **Direction**: **NO TRADE** | **Entry TF**: 15m/5m
- **Trigger**: MSS downside + bearish FVG fill on 5m


## 3rd Daily Candle OTE (Priority 0 — Simple Scalping Strategy)
| Level | Price | Notes |
|-------|-------|-------|
| 3rd Candle High | 12697.70 | 3-candle range: 38.90 |
| 62% Retrace | 12673.58 | OTE zone entry |
| 79% Retrace | 12666.97 | OTE zone boundary |
| Current Price | 12685.00 | ⏳ Outside zone |

## Fibonacci OTE Zone (Priority 1)
| Level | Price | Notes |
|-------|-------|-------|
| 62% Retracement | 12671.54 | OTE zone entry |
| **70.5% (Ideal)** | **12668.74** | ICT ideal entry |
| 79% Retracement | 12665.93 | OTE zone boundary |
| Current Price | 12685.00 | ⚠️ 1626 ticks from ideal |

## Parameters (ICT-Correct)
| | Price | Distance | Reasoning |
|---|-------|----------|-----------|
| Entry | 12685.00 | — | Current 1H price |
| SL | 0.00 | 1268500 ticks | 🛑 Inducement not swept — entry gate closed at pre-check |
| TP1 | 0.00 | 1268500 ticks |  |
| TP2 | 0.00 | 1268500 ticks |  |

## Risk-Reward
- **R:R TP1**: 1.00:1 ✅

## IOFED Pyramid Entry (bearish FVG)
| Level | Price | Size | Risk | R:R | Notes |
|-------|-------|------|------|-----|-------|
| 🥇 Starter | 12703.70 | 40% | 1270370 ticks | 1.00:1 | IOFED (FVG edge) |
| 🥈 Add #1 | 12702.50 | 35% | 1270250 ticks | 1.00:1 | CE 50% |
| 🥉 Add #2 | 12701.00 | 25% | 1270100 ticks | 1.00:1 | Far edge (full mitigation) |

- **R:R TP2**: 1.00:1
- **Risk**: 1268500 ticks

## Checklist
- [ ] SL at structural invalidation: ✓
- [ ] HTF bias aligned: ✓
- [ ] Killzone active: ✓
- [ ] R:R ≥ 1:1: ✓
