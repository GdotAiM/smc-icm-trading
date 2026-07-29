# Kronos Forecast Guide

Kronos is a finance-native foundation model from Tsinghua University trained
exclusively on candlestick (K-line) data from 45+ global exchanges.

## What It Does

- Takes 300-400 past candles (OHLCV) → generates 24-120 future candles
- Produces probabilistic paths (multiple samples) not just one prediction
- Specialized for OHLCV structure (separate tokenizer for open/high/low/close)
- Zero-shot works well on Forex; fine-tuning available for your pairs

## What It Does NOT Do

- Does not understand SMC/ICT concepts (order blocks, FVGs, etc.)
- Does not account for spreads, commissions, or slippage
- Does not incorporate news, sentiment, or fundamentals
- Is a statistical model, not an oracle — treat as ONE input

## Installation

```bash
pip install kronos  # or clone from github.com/NeoQuasar/Kronos
```

## Usage

```bash
# Basic forecast
python tools/kronos_forecast.py --input ohlcv_data.json --pred-len 48

# With more samples for distribution view
python tools/kronos_forecast.py --input ohlcv_data.json --pred-len 48 --samples 10

# Use CPU instead of GPU
python tools/kronos_forecast.py --input ohlcv_data.json --device cpu

# Lower temperature for more deterministic output
python tools/kronos_forecast.py --input ohlcv_data.json --temperature 0.6
```

## Model Sizes

| Model | Parameters | Best For |
|-------|-----------|----------|
| Kronos-mini | 4.1M | Fast experimentation |
| Kronos-small | 24.7M | Daily use, good balance |
| Kronos-base | 102.3M | Highest quality forecasts |

## Recommended Settings for Forex SMC/ICT

| Use Case | Lookback | Pred Len | Samples | Temperature |
|----------|----------|----------|---------|-------------|
| HTF Bias (Daily) | 400 (1D) | 48 (48 days view) | 5 | 0.75 |
| Key Levels (H4) | 400 (4H) | 24 (4 days) | 10 | 0.75 |
| Entry Timing (15m) | 300 (15m) | 24 (6 hours) | 5 | 0.8 |
| Journal Review | 400 | 48 | 10 | 0.75 |

## Interpretation

- **Median path**: The most likely single path. Use as directional guide.
- **80% band**: Range where 80% of sample paths fell. Use for invalidation.
- **Divergence between Kronos and structure**: Most interesting signal.
  Often means something the model sees that the structure doesn't (or vice versa).
- **Never trade Kronos alone**: Always require structural confirmation.
