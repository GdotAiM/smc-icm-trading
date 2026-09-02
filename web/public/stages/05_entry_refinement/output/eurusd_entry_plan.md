# Entry Plan — EURUSD — 2026-09-02

## Data Freshness: 10/10 — FRESH
- **Price source**: 1H @ 1.15746
- **1H close**: 1.15746 | **1m close**: N/A
- **Data age**: 2m since last candle
- ✅ Data is tradeable

## Model: **NO TRADE — registry** (no single complete model)

## Setup
- **Direction**: **NO TRADE** | **Entry TF**: 15m/5m
- **Trigger**: MSS upside + bullish FVG fill on 5m


## 3rd Daily Candle OTE (Priority 0 — Simple Scalping Strategy)
| Level | Price | Notes |
|-------|-------|-------|
| 3rd Candle High | 1.16596 | 3-candle range: 0.00818 |
| 62% Retrace | 1.16285 | OTE zone entry |
| 79% Retrace | 1.16424 | OTE zone boundary |
| Current Price | 1.15746 | ⏳ Outside zone |

## Fibonacci OTE Zone (Priority 1)
| Level | Price | Notes |
|-------|-------|-------|
| 62% Retracement | 1.15956 | OTE zone entry |
| **70.5% (Ideal)** | **1.15916** | ICT ideal entry |
| 79% Retracement | 1.15876 | OTE zone boundary |
| Current Price | 1.15746 | ⚠️ 17 pips from ideal |

## Parameters (ICT-Correct)
| | Price | Distance | Reasoning |
|---|-------|----------|-----------|
| Entry | 1.15746 | — | Current 1H price |
| SL | 0.00000 | 11575 pips |  |
| TP1 | 0.00000 | 11575 pips |  |
| TP2 | — (single draw — manage runner) | — |

## Risk-Reward
- **R:R TP1**: 1.00:1 ✅

## IOFED Pyramid Entry (bullish FVG)
| Level | Price | Size | Risk | R:R | Notes |
|-------|-------|------|------|-----|-------|
| 🥇 Starter | 1.14028 | 40% | 11403 pips | 1.00:1 | IOFED (FVG edge) |
| 🥈 Add #1 | 1.14261 | 35% | 11426 pips | 1.00:1 | CE 50% |
| 🥉 Add #2 | 1.14552 | 25% | 11455 pips | 1.00:1 | Far edge (full mitigation) |

- **R:R TP2**: 0.00:1
- **Risk**: 11575 pips

## Checklist
- [ ] SL at structural invalidation: ✓
- [ ] HTF bias aligned: ✓
- [ ] Killzone active: ✗
- [ ] R:R ≥ 1:1: ✓
