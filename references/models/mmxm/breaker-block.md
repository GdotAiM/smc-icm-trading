---
id: "breaker-block"
name: "Breaker Block"
ontology: EXECUTION_MODEL
priority: ALTERNATIVE
timeframe: 1h
tags: [ict, smc, breaker, ob-flip]
---

# Breaker Block

## Description
A Breaker Block forms when a previously mitigated Order Block is broken
through and flips polarity. The old bullish OB (demand) becomes bearish
resistance, or the old bearish OB (supply) becomes bullish support. The
breaker zone is the proximal-to-distal range of the original OB.

## Prerequisites
- Mitigated OB present (OB with prior tag)
- Price breaks through the mitigated OB
- Close confirmation beyond the OB
- FVG present at the breaker zone (increased confidence)

## Rule Tree

| Logic | Predicate | Timeframe | Args | Notes |
|-------|-----------|-----------|------|-------|
| AND   | hasBias | 4h | ["bullish","bearish"] | HTF direction |
| AND   | hasBreakerBlock | 1h | [] | Mitigated OB broken through |
| AND   | hasFVG | 1h | [] | FVG at breaker zone |
| OR    | hasDisplacement | 1h | [] | OR displacement from breaker |

## Invalidation
- Price closes back through the breaker zone in the original direction
- OB not properly mitigated before break
- No volume spike on the break

## Confusion Guards
- Different from Unmitigated OB (breaker has been tagged first)
- Different from Mitigation Block (which hasn't been broken through yet)
- Breaker polarity is opposite of the original OB type
