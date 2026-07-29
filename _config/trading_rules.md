# Trading Rules

Hard rules that the agent must follow. Violations = No Trade.

## Minimum Confluence Requirements

Before any trade entry, these must be met:

- [ ] HTF bias clearly established (not "neutral" or "unclear")
- [ ] At least 1 unmitigated PD array within 30 pips of entry
- [ ] Active killzone session (London or NY)
- [ ] Displacement confirmed on entry timeframe
- [ ] R:R ≥ 1.0:1 (TP distance ≥ SL distance)
- [ ] No high-impact news within 30 minutes (check economic calendar)

## Invalidation Policy

A trade is invalidated if:
- Price closes beyond the structural invalidation level (SL)
- Opposite CHoCH/MSS forms on the entry timeframe
- Bias changes on the HTF (e.g., 4H BOS flips from bullish to bearish)
- Killzone window closes without entry trigger → cancel pending orders

## Position Sizing Rules

- Max risk per trade: 1% of account
- Max daily loss: 3% of account
- Max positions open: 2
- Max correlated exposure: 2% (don't double up on same currency)
- No position sizing changes mid-trade

## SL Placement (ICT-Correct)

- **SL at structural invalidation, NOT at arbitrary levels**
- For shorts: SL = most recent HTF swing HIGH + 0.5× ATR buffer (prevents stop-hunting)
- For longs: SL = most recent HTF swing LOW − 0.5× ATR buffer
- If price reaches the structural swing, the bias thesis is invalidated — that's where SL belongs
- Never place SL at liquidity pools (BSL/SSL) — those are TARGETS, not risk levels
- SL distance determines position size, not the other way around

## Entry Rules

- Always wait for candle close to confirm (no entering mid-candle)
- Limit orders preferred over market orders (better R:R)
- If price gaps through entry zone, re-evaluate — do not chase
- Entry models require confirmation: FVG fill + displacement OR MSS + OB retest

## Trade Management

- Move SL to breakeven after TP1 is hit
- Close 50% at TP1
- Do not move SL further from entry (only closer or to BE)
- Do not add to losing positions
- Close all positions before major news events (Red folder on ForexFactory)

## Session Rules

- No new entries in Asian session (00:00-07:00 UTC) unless setup is exceptional
- Reduce position size by 50% in NY PM session
- Close all intraday positions by 21:00 UTC
- Friday: No new swing trades. Close all positions by NY close.
