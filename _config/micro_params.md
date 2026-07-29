# Micro Layer Parameters — LTF-Specific Thresholds

LTF timeframes (15m, 5m, 1m) have higher noise and smaller moves than HTF.
These tighter thresholds compensate.

## Pivot Detection
| Parameter | HTF Default | LTF Default | Reason |
|-----------|------------|-------------|--------|
| `pivotLookback` | 3 | 2 | Fewer bars needed to confirm swing on LTF |

## Structure
| Parameter | HTF Default | LTF Default | Reason |
|-----------|------------|-------------|--------|
| `structureMinSwingAtr` | 0.8× | 0.5× | LTF swings are smaller relative to ATR |
| `structureRequireClose` | true | true | Close confirmation still required |

## Order Blocks
| Parameter | HTF Default | LTF Default | Reason |
|-----------|------------|-------------|--------|
| `obImpulseMinAtr` | 1.0× | 0.8× | Less displacement needed to qualify on LTF |
| `obRequireFvg` | true | true | FVG gating still active |

## Fair Value Gaps
| Parameter | HTF Default | LTF Default | Reason |
|-----------|------------|-------------|--------|
| `fvgMinGapAtr` | 0.25× | 0.15× | Smaller gaps count on LTF |
| `fvgMinDisplacementAtr` | 1.0× | 0.7× | Less displacement needed |

## Displacement Classification
| Parameter | HTF Default | LTF Default | Reason |
|-----------|------------|-------------|--------|
| `displacementStrong` | 1.5× | 1.2× | Lower bar for "strong" on LTF |
| `displacementModerate` | 0.8× | 0.5× | Moderate starts earlier |

## Liquidity
| Parameter | HTF Default | LTF Default | Reason |
|-----------|------------|-------------|--------|
| `liquidityTolerance` | 0.0015 | 0.0008 | Tighter clusters on LTF |
| `equalLevelTolerance` | 0.001 | 0.0005 | Closer EQH/EQL on LTF |

## Coherence Scoring
| Parameter | Value | Reason |
|-----------|-------|--------|
| Min aligned LTFs for entry | 2 of 3 (15m/5m/1m) | Don't need all 3, majority rules |
| Coherence ENTER threshold | ≥ 7/10 | High confidence |
| Coherence WAIT threshold | 4-6/10 | Partial alignment |
| Coherence NO TRADE threshold | < 4/10 | LTF contradicts HTF |
