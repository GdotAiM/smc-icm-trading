---
id: "2022-model"
name: "2022 Model (MMXM)"
ontology: EXECUTION_MODEL
priority: PRIMARY
timeframe: 4h
tags: [ict, smc, mmxm, market-maker]
---

# 2022 Model (Market Maker Model)

## Description
The ICT 2022 Model is a complete market maker framework. It identifies
institutional accumulation/distribution phases and entries at the point
where the market maker is ready to expand price. The model uses HTF
point of interest (POI) → inducement → LTF entry structure.

## Prerequisites
- Clear HTF bias established (Daily or 4H)
- HTF Point of Interest (unmitigated OB or FVG)
- Inducement (liquidity sweep in the direction of bias)
- LTF entry at OTE zone (62-79% retracement)

## Rule Tree

| Logic | Predicate | Timeframe | Args | Notes |
|-------|-----------|-----------|------|-------|
| AND   | hasBias | 4h | ["bullish","bearish"] | Must have directional bias |
| AND   | hasOrderBlock | 4h | [] | Unmitigated HTF OB |
| AND   | hasDisplacement | 4h | [] | Displacement from OB |
| AND   | hasLiquiditySweep | 4h | [] | Inducement sweep |
| AND   | priceNearOBProximal | 15m | [] | Price retracing to OB |
| AND   | hasFVG | 15m | [] | LTF entry FVG |

## Invalidation
- Price closes beyond OB distal
- Opposite CHoCH forms on 4H
- OB becomes mitigated without displacement

## Confusion Guards
- Not to be confused with Breaker Block model (OB already mitigated)
- Not the same as Unicorn (which requires specific FVG + OTE confluence)
- MMXM Sell Model uses same structure reversed
