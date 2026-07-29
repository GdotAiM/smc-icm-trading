# Top-Down Analysis — EURUSD — 2026-07-26

## Bias Cascade (1W → 1m)

```
1W  ■■■ BULLISH  conf 1.00
1D  ■■■ BEARISH  conf 1.00
4H  ■■■ BEARISH  conf 1.00
1H  ■■ BEARISH  conf 1.00
15m ■ BEARISH  conf 1.00
5m  · bearish  conf 1.00
1m  ↓ bullish  conf 1.00
```

## Cascade Summary

| Metric | Value |
|--------|-------|
| **Dominant Bias** | **BULLISH** |
| **Anchor TF** | 1W (BULLISH) |
| **Aligned TFs** | 2 / 7 |
| **HTF Event** | BOS @ 1.18080 on 1W |
| **LTF OBs** | 2 across 1H→1m |
| **LTF FVGs** | 5 across 1H→1m |
| **Strongest Displacement** | 15m — weak (0.72x ATR) |

## Per-Timeframe Breakdown

| TF | Bias | Last Event | Price | Confidence | Pools | OBs | FVGs | Displacement |
|----|------|------------|-------|------------|-------|-----|------|-------------|
| 1W | **BULLISH** | BOS | 1.18080 | 1.00 | 6 | 1 | 1 | weak |
| 1D | **BEARISH** | BOS | 1.13775 | 1.00 | 6 | 2 | 0 | weak |
| 4H | **BEARISH** | BOS | 1.13974 | 1.00 | 6 | 1 | 1 | weak |
| 1H | **BEARISH** | CHoCH | 1.13765 | 1.00 | 6 | 1 | 1 | weak |
| 15m | **BEARISH** | CHoCH | 1.13814 | 1.00 | 4 | 0 | 0 | weak |
| 5m | **BEARISH** | CHoCH | 1.13681 | 1.00 | 2 | 0 | 2 | weak |
| 1m | **BULLISH** | CHoCH | 1.13709 | 1.00 | 2 | 1 | 2 | weak |

## Structure Map

### Higher Timeframes (1W / 1D / 4H)
- **1W**: BULLISH | BOS | Swings: H 1.20831 / L 1.13246 | HH+HL sequence — bullish structure intact
- **1D**: BEARISH | BOS | Swings: H 1.16221 / L 1.13775 | LH+LL sequence — bearish structure intact
- **4H**: BEARISH | BOS | Swings: H 1.14012 / L 1.13638 | LH+LL sequence — bearish structure intact

### Lower Timeframes (1H / 15m / 5m / 1m)
- **1H**: ⚠️ BEARISH | CHoCH | OBs: 1 | FVGs: 1 | Disp: weak
- **15m**: ⚠️ BEARISH | CHoCH | OBs: 0 | FVGs: 0 | Disp: weak
- **5m**: ⚠️ BEARISH | CHoCH | OBs: 0 | FVGs: 2 | Disp: weak
- **1m**: ✅ BULLISH | CHoCH | OBs: 1 | FVGs: 2 | Disp: weak

## Liquidity Map (Key Pools)

| TF | Type | Price | Strength | Score | Distance | Swept |
|----|------|-------|----------|-------|----------|-------|
| 1D | BSL | 1.16271 | 3 | 2.82 | 2.26% |  |
| 1D | BSL | 1.14777 | 2 | 1.57 | 0.94% |  |
| 1D | BSL | 1.16727 | 3 | 2.22 | 2.66% | ⚡ |
| 4H | BSL | 1.14362 | 7 | 11.43 | 0.58% |  |
| 4H | BSL | 1.14550 | 7 | 10.47 | 0.74% |  |
| 4H | SSL | 1.13677 | 3 | 3.03 | 0.03% | ⚡ |
| 1H | BSL | 1.14451 | 12 | 17.65 | 0.66% |  |
| 1H | BSL | 1.13890 | 4 | 4.77 | 0.16% |  |
| 1H | BSL | 1.14227 | 6 | 5.82 | 0.46% | ⚡ |

## Trade Bias Decision

**BULLISH** — 2 of 7 timeframes aligned.

Mixed signals across timeframes. WAIT for alignment or skip.

### HTF Draw Targets
- **Primary**: DOWN @ 1.13677 — SSL pool Â· 3 touches (score: 0.92)
- **Alternate**: UP @ 1.14362 — BSL pool Â· 7 touches (score: 0.71)

## Entry Refinement (LTF)

| TF | Bias | Entry Signal | OBs in Play | FVGs in Play |
|----|------|-------------|-------------|-------------|
| 1H | BEARISH | ⚠️ CHoCH — potential reversal | 1 | 1 |
| 15m | BEARISH | ⚠️ CHoCH — potential reversal | 0 | 0 |
| 5m | BEARISH | ⚠️ CHoCH — potential reversal | 0 | 2 |
| 1m | BULLISH | ⚠️ CHoCH — potential reversal | 1 | 2 |

---

*Generated: 2026-07-26T13:37:38.966Z | Data source: TradingView Desktop (live)*
*Engine: SMC Pulse @ C:\Users\cash\smc-icm-trading*
