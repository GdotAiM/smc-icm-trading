---
id: "turtle-soup"
name: "Turtle Soup"
ontology: EXECUTION_MODEL
priority: PRIMARY
timeframe: 15m
tags: [ict, smc, turtle-soup, liquidity, sweep, reversal, manipulation]
---

# Turtle Soup

## Description

The ICT Turtle Soup pattern is built on hunting the stop orders sitting above a key resistance level or below a key support level. The setup is most effective in ranging markets, where price oscillates between an established high and low.

The pattern works as follows:
1. Price approaches a key level (old high/low, swing point)
2. Price breaks the level, triggering retail stops and breakout entries
3. Price quickly reverses — the breakout was FALSE
4. Entry is taken in the opposite direction of the false breakout

Turtle Soup is a pure manipulation entry. It fades the sweep: the breakout is assumed to be the trap, and price will reverse.

## Prerequisites

- Clear key level (swing high/low, previous day high/low, or liquidity pool)
- Price sweeps the level (breaks through, triggers stops)
- Price reverses within 3-5 candles
- Market Structure Shift confirms the reversal on LTF
- Best in MANIPULATION phase (Po3) or ranging markets

## Rule Tree

| Logic | Predicate | Timeframe | Args | Notes |
|-------|-----------|-----------|------|-------|
| AND   | hasKeyLevel | 15m | [] | Clear swing or pool |
| AND   | hasLiquiditySweep | 15m | [] | Price swept the level |
| AND   | hasMSS | 5m | [] | Structure shift confirms reversal |
| AND   | inPhase | — | ["MANIPULATION"] | Best in manipulation |
| NOT   | inPhase | — | ["DISTRIBUTION"] | Avoid during trend |

## Entry

- Drop to 1m or 3m for execution
- Enter on MSS confirmation after the sweep reversal
- Entry at the displacement FVG or OB created by the reversal candle
- SL beyond the swept extreme (the false breakout high/low)

## Invalidation

- Price continues beyond the swept level (the breakout was real, not false)
- MSS does not form within 5 candles of the sweep
- HTF structure contradicts the reversal direction

## Confusion Guards

- NOT a trend-following entry — works best in ranges and manipulation
- NOT the same as Breaker Block (Breaker requires a failed OB; Turtle Soup requires a failed breakout of a key level)
- NOT valid during strong distribution/expansion phases
