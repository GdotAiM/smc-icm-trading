---
id: "ote-institutional-ob"
name: "OTE + Institutional OB"
ontology: EXECUTION_MODEL
priority: PRIMARY
timeframe: 4h
tags: [ict, smc, ote, order-block, fibonacci, retracement]
---

# OTE + Institutional OB

## Description

The Optimal Trade Entry (OTE) + Institutional Order Block model combines Fibonacci retracement logic with institutional order block levels. Entry is taken when price retraces into the 62%-79% OTE zone AND touches an unmitigated institutional order block.

This is a high-confluence entry model that stacks two independent PD Arrays at the same level:
1. **OTE Zone** (62-79% Fibonacci retracement of the dealing range)
2. **Institutional OB** (bullish/bearish order block within that zone)

## Prerequisites

- Clear HTF bias on 1D/4H
- Established dealing range with a clear swing high and swing low
- Unmitigated order block from the HTF within the OTE zone
- Price has retraced into the OTE zone (62-79%)
- Killzone active (London or NY AM preferred)

## Rule Tree

| Logic | Predicate | Timeframe | Args | Notes |
|-------|-----------|-----------|------|-------|
| AND   | hasBias | 1d | [] | HTF bias must be clear |
| AND   | hasDealingRange | 4h | [] | Clear swing high/low |
| AND   | inOTEZone | 4h | [62, 79] | Price in OTE retracement |
| AND   | hasOrderBlock | 4h | [] | Unmitigated OB in zone |
| AND   | killzoneActive | — | [] | London or NY AM |

## Entry

- Entry at the order block proximal level within the OTE zone
- SL beyond the OB distal + ATR buffer
- TP1 at opposing liquidity pool or 1:1 measured move
- TP2 at -1.5 Fibonacci extension or next liquidity pool

## Invalidation

- Price closes beyond the 79% OTE level (too deep — the trend may be reversing)
- OB is mitigated (price trades through the entire OB)
- HTF bias flips before entry triggers

## Confusion Guards

- NOT the same as Silver Bullet (SB is time-gated to 1-hour windows; OTE+OB works any time during killzone)
- NOT the same as Unicorn (Unicorn requires FVG+Breaker overlap; OTE+OB requires OB+Fibonacci)
