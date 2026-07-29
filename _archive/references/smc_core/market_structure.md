# Market Structure

## What ICT Teaches

Price moves in a fractal series of higher highs / higher lows (uptrend) or
lower highs / lower lows (downtrend). Institutional order flow creates
predictable structural patterns:

- **Break of Structure (BOS)**: Price breaks a prior swing point in the
  direction of the trend. Confirms continuation.
- **Change of Character (CHoCH) / Market Structure Shift (MSS)**: Price
  breaks a prior swing point AGAINST the trend. First signal of potential
  reversal.

Key principle: Structure is fractal. A CHoCH on a lower timeframe may only
be a pullback on a higher timeframe. Higher timeframe structure always
dominates.

## How the SMC Engine Detects It

1. **Swing Pivot Detection**: Uses a 3-bar fractal lookback. A candle is a
   swing high if its high exceeds the 3 candles on either side (7-bar window).
   ATR filtering removes insignificant pivots.

2. **Structure State Machine**: Walks pivots chronologically. Tracks the
   current structural state (bullish/bearish/neutral) and detects breaks.
   BOS: break of prior HH (bullish) or LL (bearish). CHoCH: break of prior
   LH (bearish → bullish) or HL (bullish → bearish).

3. **Close Confirmation**: Breaks are confirmed on candle close, not wick.
   This prevents false signals from liquidity sweeps that immediately reverse.

4. **Bias Scoring**: Weighted by recency (newer = higher weight), magnitude
   (larger break = stronger), and volume (spike = institutional).

## How to Read It in the Cockpit

- **Bullish Structure**: HH + HL sequence. Price making progress higher.
  Buy-side setups only.
- **Bearish Structure**: LH + LL sequence. Price making progress lower.
  Sell-side setups only.
- **Neutral Structure**: No clear HH/HL or LH/LL sequence. Wait for clarity.
- **CHoCH/MSS**: Critical alert. Potential trend change. Re-evaluate all
  open positions.
