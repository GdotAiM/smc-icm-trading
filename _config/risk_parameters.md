# Risk Parameters

## Account
- **Balance**: $10,000 (paper trading — update when live)
- **Currency**: USD
- **Broker**: Alpaca Paper Trading / Manual

## Risk Limits
- **Max risk per trade**: 1% of account = $100
- **Max daily loss**: 3% of account = $300
- **Max weekly loss**: 5% of account = $500
- **Max positions open**: 2
- **Max correlated exposure**: 2% of account

## Position Sizing
- **Default lot type**: Mini lots (10,000 units) for forex
- **Max position size**: 1 standard lot (100,000 units)
- **Scaling**: Fixed fractional (same % risk per trade, size varies with SL distance)

## Trade Management Defaults
- **SL to breakeven**: After TP1 is hit
- **Partial TP**: 50% at TP1, 50% at TP2
- **Trailing stop**: After BE, trail by 20 pips or behind nearest swing
- **Time stop**: Close if not at TP1 within 2x the entry timeframe candles

## Drawdown Rules
- Stop trading for the day if daily loss limit hit
- Stop trading for the week if weekly loss limit hit
- Reduce position size by 50% after 3 consecutive losses
- Return to normal size after 2 consecutive wins
