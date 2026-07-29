---
id: "unicorn-ote-fvg"
name: "Unicorn (OTE + FVG)"
ontology: EXECUTION_MODEL
priority: PRIMARY
timeframe: 4h
tags: [ict, smc, unicorn, fvg, breaker-block, ote, confluence]
---

# Unicorn (OTE + FVG)

## Description

The ICT Unicorn Model is the area of overlap between an ICT Fair Value Gap and an ICT Breaker Block. By stacking two independent PD Arrays at the same price level, the Unicorn produces a uniquely reliable trade-entry signal that neither tool delivers alone.

The sequence:
1. A swing high or low is broken (market structure shift)
2. A Breaker Block forms at the broken swing
3. A Fair Value Gap overlaps that Breaker Block
4. Entry is taken at the overlap zone

This model is called "Unicorn" because the FVG + Breaker overlap is rare — when it appears, it's a high-probability signal.

## Prerequisites

- Clear HTF bias on 1D/4H
- Recent MSS (market structure shift) breaking a swing point
- Breaker Block formed at the broken swing level
- FVG that overlaps the Breaker Block zone
- Price retraces into the overlap zone

## Rule Tree

| Logic | Predicate | Timeframe | Args | Notes |
|-------|-----------|-----------|------|-------|
| AND   | hasBias | 1d | [] | HTF bias must be clear |
| AND   | hasMSS | 4h | [] | Recent market structure shift |
| AND   | hasBreakerBlock | 4h | [] | Breaker at broken swing |
| AND   | hasFVG | 4h | [] | FVG overlapping breaker |
| AND   | killzoneActive | — | [] | Entry during active session |

## Entry

- Entry at the FVG + Breaker overlap zone
- SL beyond the Breaker Block extreme
- TP1 at the next opposing liquidity pool or 1:1 measured move
- TP2 at the full FVG target or -1.5 Fib extension

## Invalidation

- FVG fills completely without reaction (the inefficiency was weak)
- Breaker Block is violated (price closes through it)
- HTF bias flips before entry triggers

## Confusion Guards

- NOT the same as regular FVG entry — requires Breaker Block overlap
- NOT the same as OTE+OB — Unicorn uses FVG+Breaker, not Fibonacci+OB
- The rarest of the confluence setups — don't force it if the overlap isn't clean
