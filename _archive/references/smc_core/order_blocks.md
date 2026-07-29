# Order Blocks

## What ICT Teaches

An Order Block (OB) is the last opposing-color candle before a strong
displacement move. It represents a price level where institutions placed
large orders that caused the displacement. Price often returns to these
levels before continuing in the direction of the displacement.

- **Bullish OB**: Last bearish candle before a strong bullish displacement.
  Acts as support (demand).
- **Bearish OB**: Last bullish candle before a strong bearish displacement.
  Acts as resistance (supply).

## Key Properties

- **Proximal**: The end of the OB candle closest to current price (first touch).
- **Distal**: The end furthest from current price (deeper retracement).
- **Mitigation**: When price closes beyond the distal, the OB is "mitigated"
  — the orders were filled.
- **Breaker Block**: A mitigated OB that price breaks back through.
  The OB flips polarity (bullish OB becomes resistance, bearish becomes support).

## How the SMC Engine Detects It

1. **Displacement Detection**: Looks for a candle (or sequence) with body
   significantly larger than ATR. This is the "impulse."
2. **OB Identification**: Finds the last candle of opposite color before
   the impulse. Its high/low range becomes the OB zone.
3. **Filtering**: Only OBs with displacement magnitude ≥ ATR threshold and
   volume spike are kept. FVG co-occurrence increases confidence.
4. **Lifecycle Tracking**: OB → unmitigated → tested → mitigated → breaker.

## How to Read It in the Cockpit

- **Unmitigated OB near current price**: High-probability reaction zone.
- **OB + FVG confluence**: Strongest level. Both institutional order flow
  AND an inefficiency to fill.
- **Mitigated OB**: No longer a tradeable level (unless it becomes a breaker).
- **Breaker Block**: New level — use the opposite side.
