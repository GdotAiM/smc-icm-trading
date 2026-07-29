# Fair Value Gaps (FVG)

## What ICT Teaches

A Fair Value Gap is a 3-candle pattern where the wicks of candle 1 and
candle 3 do not overlap — there is a "gap" in price delivery. This represents
an inefficiency in the market that price is likely to return to and fill.

- **Bullish FVG**: Candle 3's low > Candle 1's high. Gap between C1 high and C3 low.
- **Bearish FVG**: Candle 3's high < Candle 1's low. Gap between C1 low and C3 high.

## Key Properties

- **Fill**: Price retraces into the FVG zone and closes within it.
- **Inversion FVG (IFVG)**: A filled FVG that price breaks through and flips.
  The gap now acts as support/resistance in the opposite direction.
- **Consecutive FVGs**: Multiple unfilled FVGs in the same direction indicate
  strong institutional interest.

## How the SMC Engine Detects It

1. **3-Candle Scan**: Scans every 3-candle window for gap conditions.
2. **Displacement Filter**: Requires the middle candle to have a body ≥ ATR
   threshold. Prevents flagging tiny gaps.
3. **Volume Spike Filter**: The displacement candle should have elevated volume.
4. **Fill Fraction**: Tracks how much of the gap has been filled (0.0 to 1.0).
   Partially filled FVGs are still tradeable but with reduced confidence.
5. **Inversion Detection**: Monitors filled FVGs for price breaking through
   and closing beyond them.

## How to Read It in the Cockpit

- **Unfilled FVG near current price**: Price is likely to retrace to fill it.
- **FVG + OB at same level**: Strongest confluence. High probability reaction.
- **Partially filled FVG (<50%)**: Still tradeable, but tighter SL needed.
- **Fully filled FVG**: No longer an active level (unless it becomes IFVG).
