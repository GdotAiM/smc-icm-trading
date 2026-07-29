# SMC Engine CLI Guide

The SMC engine is a deterministic TypeScript CLI that analyzes OHLCV candle
data using ICT/SMC algorithms. No AI/LLM involved — pure structural computation.

## Installation

```bash
cd tools/smc-engine
npm install
npm run build
```

## Usage

### Basic Analysis
```bash
# Full report for a single timeframe
npx smc-engine --pair EURUSD --tf 4h

# Multi-timeframe analysis
npx smc-engine --pair EURUSD --tf 1d,4h,1h

# Save output to file
npx smc-engine --pair EURUSD --tf 1d --output shared/2026-07-26/EURUSD/engine_daily.json
```

### Analysis Modes
```bash
# Structure only (fast)
npx smc-engine --pair EURUSD --tf 4h --mode structure

# Key levels only
npx smc-engine --pair EURUSD --tf 1d,4h,1h --mode levels

# Strategy detection (runs all 21 predicates against 59 models)
npx smc-engine --pair EURUSD --mode strategies

# Entry refinement (LTF detail)
npx smc-engine --pair EURUSD --tf 15m --mode entry

# Risk parameters (ATR-based SL distance)
npx smc-engine --pair EURUSD --tf 15m --mode risk
```

### Input Options
```bash
# From JSON file (instead of fetching live data)
npx smc-engine --input candles.json --tf 4h

# From stdin (pipe data in)
cat candles.json | npx smc-engine --stdin --tf 4h
```

## Output Format

The engine outputs a JSON `SmcReport` with these sections:

```json
{
  "symbol": "EURUSD",
  "market": "forex",
  "timeframe": "4h",
  "currentPrice": 1.0850,
  "generatedAt": 1752019200000,
  "candles": [...],
  "structure": {
    "trend": "bullish",
    "bias": "bullish",
    "confidence": 0.72,
    "pivots": [...],
    "breaks": [...],
    "phase": "expansion",
    "narrative": "Bullish structure with recent CHoCH..."
  },
  "liquidity": {
    "pools": [...],
    "nearestBSL": { "price": 1.0980, "distance": 130 },
    "nearestSSL": { "price": 1.0780, "distance": 70 }
  },
  "orderBlocks": [...],
  "fvg": [...],
  "pdArray": {
    "currentBias": "discount",
    "zones": [...]
  },
  "dailyBias": {
    "bias": "bullish",
    "strength": 0.65
  },
  "smt": { "detected": false },
  "draw": [
    { "price": 1.0920, "type": "bullish", "score": 0.85, "direction": "long" }
  ]
}
```

## Configuration

Tune detector thresholds in `tools/smc-engine/src/config.ts`:
- Pivot lookback (default: 3)
- ATR period (default: 14)
- FVG minimum gap (default: 0.2 × ATR)
- OB displacement threshold (default: 1.5 × ATR)
- Liquidity pool proximity (default: 10 pips)
- EQH/EQL cluster tolerance (default: 5 pips)
