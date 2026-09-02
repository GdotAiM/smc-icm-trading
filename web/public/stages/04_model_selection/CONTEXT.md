# Stage 04 — Model Selection & Confluence Scoring

## Purpose
Evaluate which ICT/SMC model(s) from the full taxonomy are currently valid
given the market conditions established in Stages 01-03. Score and rank
them by confluence strength.

## Inputs

| Source | Location | What to load |
|--------|----------|--------------|
| Previous Stages | `../01_htf_bias/output/bias.md` | Directional bias |
| Previous Stages | `../02_key_levels/output/levels.md` | Key PD arrays |
| Previous Stages | `../03_session_time/output/session.md` | Session + time gates |
| Engine | `npx smc-engine --mode strategies` | Strategy detection via predicates |
| References | `../../references/models/` | Full strategy taxonomy |
| Config | `../../_config/model_priority.md` | Your model preference ranking |

## Process

### 1. Run Strategy Detection
Call the strategy evaluator:
```
npx smc-engine --pair <PAIR> --mode strategies --output shared/<DATE>/<PAIR>/strategy_detection.json
```

The engine runs the 21 predicates against all 59 strategy templates and
returns ranked matches with scores.

### 2. Apply Time-Based Filters
From Stage 03, eliminate models that:
- Require a specific session window that's not active
- Are time-gated and the window has passed
- Conflict with the current session's typical behavior

### 3. Apply Bias Alignment
From Stage 01, eliminate models whose expected direction:
- Directly conflicts with the HTF bias
- Requires a trend that doesn't exist

### 4. Score Confluence
For each surviving model, count confluent factors:
- HTF bias aligned: +2
- Key levels present (OB/FVG at expected zone): +2
- Session-killzone active: +1
- Displacement confirmed: +2
- Liquidity sweep prior to setup: +1
- SMT divergence confirming: +1

### 5. Select Primary + Alternatives
- **Primary**: Highest confluence score, highest `_config/model_priority.md` rank
- **Alternative 1-2**: Next highest scores, different model families
- **Rejected**: List models considered and why they failed

### 6. Apply Model-Specific Prerequisites
Read each candidate model's markdown from `references/models/` and verify:
- All required predicates matched
- No invalidation conditions present
- No confusion guard violations (e.g., don't use MMXM if structure is unclear)

## Output Requirements

Create `output/active_models.md`:

```markdown
# Model Selection — [PAIR] — [DATE]

## Market Context Summary
- Bias: [from Stage 01]
- Session: [from Stage 03]
- Key Level Proximity: [from Stage 02]

## Strategy Detection Results
Engine evaluated 59 models. [N] passed initial predicate filters.

## Primary Model
### [Model Name] — Score: [X/10]
- **Ontology**: [EXECUTION_MODEL / TEMPORAL_MODEL / MARKET_CYCLE]
- **Priority**: [PRIMARY / ALTERNATIVE]
- **Matched Predicates**: [list with evidence]
- **Entry Conditions**: [from model definition]
- **Invalidation**: [from model definition]

## Alternative Models
| Model | Score | Why Considered |
|-------|-------|----------------|
| [Name] | [X/10] | [Reason] |

## Confluence Breakdown
| Factor | Status | Weight |
|--------|--------|--------|
| HTF Bias Aligned | ✓/✗ | 2 |
| Key Levels Present | ✓/✗ | 2 |
| Session Active | ✓/✗ | 1 |
| Displacement Confirmed | ✓/✗ | 2 |
| Liquidity Sweep | ✓/✗ | 1 |
| SMT Confirmation | ✓/✗ | 1 |
| **Total** | | **X/9** |

## Rejected Models
| Model | Reason |
|-------|--------|
| [Name] | [Why it failed] |

## Notes for Entry Refinement
- Primary entry timeframe: [from model]
- Expected entry zone: [price range]
- Wait for: [confirmation signal]

## ICT Knowledge Reference

Before writing this stage, query the ICT knowledge base:

```bash
node tools/ict_rag.cjs --query "ICT Silver Bullet vs 2022 model vs Turtle Soup when to use each"
```

```bash
node tools/ict_rag.cjs --query "ICT MMXM market maker buy model sell model conditions"
```

```bash
node tools/ict_rag.cjs --query "ICT model selection criteria cycle phase alignment"
```

Cite ICT sources in your output with the format: `[ICT: concept-name.md]`
