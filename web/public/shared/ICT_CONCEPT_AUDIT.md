# ICT Concept Awareness Audit — July 29, 2026

## What the Agent Knows vs What the System Knows

### 1. Knowledge Base (138 ICT Tutorials)

| Resource | Size | Agent Access | Gap |
|----------|------|-------------|-----|
| `references/ict_knowledge/curriculum/tier-00` | 420 lines — Foundations | ❌ Never loaded | SMC origins, IPDA, liquidity concepts, time theory |
| `references/ict_knowledge/curriculum/tier-01` | 277 lines — Core Mechanics | ❌ Never loaded | Order blocks, FVGs, breaker blocks, mitigation |
| `references/ict_knowledge/curriculum/tier-02` | 196 lines — Strategies | ❌ Never loaded | Silver Bullet, MMXM, Turtle Soup, OTE details |
| `references/ict_knowledge/curriculum/tier-03` | 417 lines — Advanced | ❌ Never loaded | Quarterly shifts, macro analysis, weekly profiles |
| `references/ict_knowledge/rag/rag_index.json` | Semantic search index | ❌ Not used during analysis | 138 tutorials searchable by concept |
| `tools/ict_rag.cjs` | Semantic search + citations | ❌ Agent knows about it but never calls it | `--query` and `--concept` modes available |

### 2. Model Taxonomy (Full vs What Agent Uses)

**What the system knows** (from `_config/model_priority.md`):

| Tier | Models | Agent Status |
|------|--------|-------------|
| Tier 0 (Foundation) | PO3/AMD — THE cycle framework | ⚠️ Pipeline checks Po3 state but agent doesn't treat it as foundation |
| Tier 1 (Primary) | MMXM Buy/Sell, Silver Bullet, OTE + Institutional OB | ✅ Pipeline scores these |
| Tier 2 (Strong) | Turtle Soup, Breaker Block, SCOB, Judas Swing, Unicorn | ⚠️ Pipeline scores but agent never independently evaluates |
| Tier 3 (Situational) | 2FVG Entry, Asian Range Breakout, NWOG/NDOG, Mitigation Block, Rejection Block | ❌ Not in pipeline, agent unaware |

**The 6 Confirmations** (from `model_priority.md`) — Agent NEVER checks these:
1. **SMT Divergence** — Correlated pair diverges
2. **Liquidity Sweep** — Stop hunt at PD Array
3. **MSS/CHoCH** — Market Structure Shift on entry TF
4. **CISD** — Change in State of Delivery (engulfing candle)
5. **FVG Creation** — Displacement creates entry inefficiency
6. **HTF PD Array** — Price at premium/discount zone

### 3. Trading Rules (from `_config/trading_rules.md`)

| Rule Category | Agent Status |
|--------------|-------------|
| Minimum confluence (HTF bias + PD array + KZ + displacement + R:R + no news) | ⚠️ Pipeline checks some but not all |
| Invalidation policy (close beyond SL, opposite CHoCH, bias flip, KZ expiry) | ❌ Not programmatically enforced |
| Position sizing (1% risk, 3% daily, max 2 positions, 2% correlated) | ⚠️ Pipeline calculates but agent doesn't verify |
| SL placement (structural invalidation, swing + 0.5× ATR, never at liquidity pools) | ✅ Pipeline does this |
| Entry rules (candle close confirm, limit orders preferred, don't chase) | ❌ Agent doesn't enforce these |
| Trade management (BE after TP1, 50% at TP1, don't add to losers) | ❌ Not in pipeline |
| Session rules (no Asian entries, reduce PM size, close by 21:00 UTC) | ⚠️ Partial — ny_time.cjs now covers session but entry rules not enforced |

### 4. Risk Parameters (from `_config/risk_parameters.md`)

| Parameter | Value | Agent Status |
|-----------|-------|-------------|
| Account balance | $10,000 | ✅ Hardcoded in pipeline |
| Max risk per trade | 1% ($100) | ✅ Pipeline calculates |
| Max daily loss | 3% ($300) | ❌ Not tracked |
| Max weekly loss | 5% ($500) | ❌ Not tracked |
| Max positions open | 2 | ❌ Not checked |
| Drawdown rules (50% size after 3 losses) | — | ❌ Not implemented |
| Return to normal after 2 wins | — | ❌ Not implemented |

### 5. Session/Micro Parameters

| Resource | Agent Status |
|----------|-------------|
| `session_preferences.md` — Killzone times, SB windows, session weighting | ⚠️ Now partially covered by ny_time.cjs |
| `micro_params.md` — LTF-specific thresholds (tighter pivots, smaller FVGs) | ❌ SMC engine has this in config.ts but agent unaware of LTF differences |

### 6. ICT-Specific Tools (Exist But Never Called During Analysis)

| Tool | Purpose | Agent Status |
|------|---------|-------------|
| `ict_rag.cjs --query` | Semantic search 138 tutorials with citations | ❌ Agent knows it exists but never calls it |
| `ict_rag.cjs --concept` | Deep concept lookup with source material | ❌ Never used |
| `ict_decision_validator.cjs --check` | Quick pre-trade compliance check | ❌ Never used |
| `ict_decision_validator.cjs --validate` | Full rule audit against ICT criteria | ❌ Never used |
| `ict_continuous_learn.cjs --extract` | Extract lessons from trades → playbook | ✅ Pipeline runs this |
| `ict_curriculum.cjs --run` | Progress through learning tiers | ❌ Not relevant to live analysis |
| `graph_rag.cjs` | Concept + experience retrieval from trade graph | ❌ Never used |
| `trade_graph.cjs --query` | Find failure patterns by pair/model/session | ❌ Agent knows about it but never queries during analysis |
| `trade_graph.cjs --stats` | Model performance stats | ❌ Never used before model selection |
| `memory_injector.cjs` | Graph-powered trade context injection | ✅ Pipeline runs this |
| `performance_ledger.cjs` | Model/session performance stats | ❌ Never used |

### 7. Reference Concepts (Exist But Agent Never References)

| File | Concepts | Agent Status |
|------|----------|-------------|
| `references/cycles/fractal_cycle.md` | Fractal nesting across timeframes | ❌ Never loaded |
| `references/cycles/market_cycle.md` | Accumulation→Markup→Distribution→Markdown | ❌ Never loaded |
| `references/cycles/mmxm_in_cycle.md` | MMXM steps mapped to cycle phases | ❌ Never loaded |
| `references/cycles/macro_micro_coherence.md` | HTF/LTF alignment rules | ❌ Never loaded |
| `references/cycles/model_cycle_map.md` | Which models work in which cycle phase | ❌ Never loaded |
| `references/models/STRATEGY_TEMPLATE.md` | Template for new model definitions | ❌ Never loaded |
| `_archive/references/smc_core/` | 5 files: FVG, liquidity, structure, OBs, sessions | ❌ Never loaded |

### 8. Council/Narrative System

| Tool | Purpose | Agent Status |
|------|---------|-------------|
| `council.cjs` | 4-archetype vote (Position/Swing/Day/Scalp) | ⚠️ Exists but agent doesn't run it before analysis |
| `narrative.cjs` | Causal chain market narrative | ❌ Agent unaware this tool exists |
| `coherence_audit.cjs` | Lens/temporal/archetype coherence | ⚠️ Pipeline uses it partially |
| `archetype_engine.cjs` | Per-archetype model scoring | ❌ Agent unaware |
| `invalidation.cjs` | 7-dimension invalidation check | ❌ Agent unaware |

---

## Summary: Top 10 Missing Concepts

| # | Concept | Impact | Fix |
|---|---------|--------|-----|
| 1 | **6 Confirmations** | Agent doesn't check SMT, CISD, PD Array positioning before entry | Add to CLAUDE.md + run pre-trade validator |
| 2 | **ICT RAG queries during analysis** | 138 tutorials available but never consulted | Rule: query RAG when pattern unclear |
| 3 | **Trade graph stats for model selection** | Model performance data exists but isn't consulted | Query trade_graph.cjs before Stage 04 |
| 4 | **Full model taxonomy (13 models)** | Only 7 scored in pipeline; 6 situational models ignored | Add missing models to run_pair.cjs scoring |
| 5 | **Cycle-model mapping** | `model_cycle_map.md` shows which models work in which phase | Load into agent context |
| 6 | **Trading rules enforcement** | SL at liquidity pools, no-chase rule, time stops not enforced | Add to CLAUDE.md as hard rules |
| 7 | **Risk tracking** | Daily/weekly loss limits, drawdown rules not implemented | Add to pipeline or memory system |
| 8 | **Council/narrative before analysis** | Multi-archetype vote provides confidence check | Run council.cjs before model selection |
| 9 | **Pre-trade validation** | ict_decision_validator.cjs exists but never called | Run before every entry |
| 10 | **Performance ledger** | Model win rates, session stats exist but not used | Query before model selection |
