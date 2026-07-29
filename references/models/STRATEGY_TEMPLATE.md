# Strategy Template Format

Each strategy model is defined as a markdown file with YAML frontmatter.
The StrategyEvaluator in `tools/smc-engine` reads these files at runtime.

## Frontmatter Fields

```yaml
---
id: "2022-model"           # Unique identifier
name: "2022 Model (MMXM)"  # Display name
ontology: EXECUTION_MODEL   # CONCEPT | STRUCTURAL_PATTERN | EXECUTION_MODEL | TEMPORAL_MODEL | MARKET_CYCLE | TRADING_HORIZON | CURRICULUM
priority: PRIMARY           # PRIMARY | ALTERNATIVE | INFORMATIONAL
timeframe: 4h               # Primary timeframe for evaluation
tags: [ict, smc, mmxm]      # Search/filter tags
---
```

## Body Format

The body describes the model and specifies the predicate rule tree:

```markdown
## Description
Brief description of the model and when it's applicable.

## Prerequisites
Bullet list of conditions that must be met for this model to be valid.

## Rule Tree
A table of predicates combined with AND/OR/NOT logic:

| Logic | Predicate | Timeframe | Args | Notes |
|-------|-----------|-----------|------|-------|
| AND   | hasBias | 4h | ["bullish"] | HTF must be bullish |
| AND   | hasOrderBlock | 4h | [] | Unmitigated OB present |
| AND   | hasFVG | 15m | [] | Entry FVG on LTF |
| OR    | hasLiquiditySweep | 4h | [] | OR a liquidity sweep |
| NOT   | hasHighImpactNewsWithin | — | [30] | No news within 30min |

## Invalidation
Bullet list of conditions that invalidate this model.

## Confusion Guards
Bullet list of models this should NOT be confused with.
```
