---
id: "silver-bullet"
name: "Silver Bullet"
ontology: EXECUTION_MODEL
priority: PRIMARY
timeframe: 15m
tags: [ict, smc, silver-bullet, time-based, killzone]
---

# Silver Bullet

## Description
The ICT Silver Bullet is a time-based entry model that operates within
specific 2-hour windows during London, NY AM, and NY PM sessions. It
requires a clear HTF bias, displacement during the SB window, and an
FVG for entry.

## Prerequisites
- Clear HTF bias (Daily or 4H)
- Inside Silver Bullet time window
- Displacement during window
- FVG forms during displacement
- Entry on FVG fill

## Rule Tree

| Logic | Predicate | Timeframe | Args | Notes |
|-------|-----------|-----------|------|-------|
| AND   | hasBias | 4h | ["bullish","bearish"] | HTF bias |
| AND   | isWithinSession | — | ["London","NY AM","NY PM"] | SB session |
| AND   | hasSessionAlignment | — | [] | Bias aligned with session |
| AND   | hasDisplacement | 15m | [] | Displacement during window |
| AND   | hasFVG | 15m | [] | Entry FVG from displacement |

## Invalidation
- Killzone window closes without entry trigger
- Opposite CHoCH forms on 15m
- HTF bias changes during trade

## Confusion Guards
- Only valid during specific SB windows (08-10, 13-15, 17-19 UTC)
- Not a standalone model — requires HTF context
- Different from Judas Swing (which is session-open manipulation play)
