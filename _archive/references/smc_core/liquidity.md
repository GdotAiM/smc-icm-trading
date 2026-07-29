# Liquidity Pools

## What ICT Teaches

Liquidity pools are price levels where clusters of stop-loss orders and
pending orders accumulate. Institutions seek out these pools to fill large
orders without moving the market against themselves.

- **Buy-Side Liquidity (BSL)**: Clusters of buy-stop orders above swing highs.
  Price is drawn to these levels to trigger stops and fuel a downside move.
- **Sell-Side Liquidity (SSL)**: Clusters of sell-stop orders below swing lows.
  Price is drawn to these levels to trigger stops and fuel an upside move.

## Key Properties

- **Equal Highs (EQH)**: Multiple swing highs at nearly the same price level.
  Engineered liquidity — traders place stops just above.
- **Equal Lows (EQL)**: Multiple swing lows at nearly the same price level.
  Engineered liquidity — traders place stops just below.
- **Sweep**: Price briefly pierces a pool (taking stops) then immediately
  reverses. The true move begins after the sweep.

## How the SMC Engine Detects It

1. **Local High/Low Discovery**: Scans all swing pivots for price clusters.
2. **EQH/EQL Grouping**: Proximity clustering — pivots within X pips are
   grouped as engineered liquidity.
3. **Sweep Detection**: Price wick pierces the pool level, then candle
   closes back on the original side (rejection). Close-based, not wick-based.
4. **Pool Scoring**: Weighted by number of touches, recency, session
   alignment, and displacement context.

## How to Read It in the Cockpit

- **Unfilled BSL above current price**: Upside magnet. Price likely to
  run those stops before any significant downside.
- **Swept pool**: The liquidity was taken. Price should now move in the
  opposite direction of the sweep.
- **Double sweep**: Price sweeps both BSL and SSL before establishing
  direction. Classic manipulation pattern.
