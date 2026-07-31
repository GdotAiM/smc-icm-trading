# SMC-ICM Trading Workspace

**Smart Money Concepts / Inner Circle Trader automated trading workspace with TradingView paper trading integration via CDP.**

## Overview

Full ICT/SMC pipeline with 6-layer coherence stack from weekly anchor down to per-pip entry drill:

```
TIME → Killzone authority (session multiplier)
PRICE → Weighted Bias (6 sources, timeframe-weighted vote)
GATE → Inducement check (must be swept before any entry)
MODELS → 17 models scored with stacked directional boosts
COHERENCE → Single unified score (worst dimension wins)
EXECUTION → IOFED pyramid entry + session-specific scalp parameters
```

14 ICT tutorials verified against official innercircletrader.net source.

## Quick Start

```bash
# 1. Session startup (fetch all data, run engines, generate forecasts)
node tools/session_start.cjs

# 2. Run full analysis on a pair (all 8 stages, 17 models, 3 lectures)
node tools/run_pair.cjs EURUSD

# 3. Autonomous session (full auto: scan → evaluate → execute → journal)
node tools/tv-mcp/ny_am_autonomous.cjs

# 4. Place a paper trade
node tools/tv-mcp/market_order.cjs EURUSD SELL 1.13950 1.13750 10000

# 5. Verify positions
node tools/tv-mcp/check_orders.cjs
```

## Architecture

```
smc-icm-trading/
├── tools/                    # Analysis + execution scripts
│   ├── run_pair.cjs          # Central pipeline (8 stages, 17 models, 6-layer coherence)
│   ├── session_start.cjs     # One-command startup (TV CDP → candles → engines → forecasts)
│   ├── ny_time.cjs           # NY session time + killzone checker
│   │
│   ├── Context Layer (★★★ Tier 0)
│   │   ├── weekly_profile_engine.cjs  # 12-profile weekly classification
│   │   ├── one_trade_setup.cjs        # 5-session daily routing framework
│   │   ├── po3_state_machine.cjs      # Power of 3: Accum→Manip→Dist→Expansion
│   │   └── ipda.cjs                   # IPDA: dealing ranges, equilibrium cascade, false breakout
│   │
│   ├── Liquidity Layer
│   │   ├── irl_erl_engine.cjs         # IRL (FVGs only) + ERL + cycle tracking
│   │   ├── liquidity_marker.cjs       # 8-step PDH/PDL/PWH/PWL + HRLR/LRLR + sweep/run
│   │   └── order_flow.cjs             # OF zone marking (pullbacks before BOS)
│   │
│   ├── Entry Gate
│   │   └── inducement_engine.cjs      # Inducement detection — hard gate before scoring
│   │
│   ├── Entry Models (17 scored)
│   │   ├── tv-mcp/lecture1_setup.cjs  # 08:30 Liquidity Raid + 3 PD Array Model
│   │   ├── tv-mcp/lecture2_setup.cjs  # 07:00 AM London Hunt + IFVG Model
│   │   ├── tv-mcp/lecture4_setup.cjs  # 08:30 News + NDOG/NWOG Gap Model
│   │   └── bread_and_butter.cjs       # 4-session intraday scalp framework (buy+sell)
│   │
│   ├── Execution Layer
│   │   ├── IOFED pyramid entry        # 3-level FVG entry drill (inline in run_pair.cjs)
│   │   └── 3rd Daily Candle OTE       # Simple Scalping Strategy (inline in run_pair.cjs)
│   │
│   ├── Journaling
│   │   ├── ict_continuous_learn.cjs   # Trade lesson extraction
│   │   ├── trade_graph.cjs            # Unified memory graph (16 trades, 25 lessons)
│   │   ├── performance_ledger.cjs     # Model/session/pair performance stats
│   │   └── risk_tracker.cjs           # Risk limit enforcement
│   │
│   ├── Autonomous
│   │   ├── tv-mcp/autonomous_session.cjs  # London KZ autonomous (3-hour)
│   │   ├── tv-mcp/ny_am_autonomous.cjs    # NY AM autonomous (09:50-SB window)
│   │   ├── tv-mcp/intel_monitor.cjs       # Structural event monitor (60s cycle)
│   │   └── refresh_data.cjs               # On-demand TV CDP data refresh
│   │
│   └── tv-mcp/                   # TradingView CDP automation (74 MCP tools + scripts)
│       ├── market_order.cjs      # Market order with SL/TP
│       ├── news_trade.cjs        # ICT One Shot One Kill news trading
│       ├── check_orders.cjs      # Position verification
│       └── cdp_client.cjs        # CDP module resolver (works regardless of CWD)
│
├── stages/              # Pipeline output per stage
│   ├── 00_macro_context/    # Weekly profile, One Trade Setup, PO3, intraday profile
│   ├── 01_htf_bias/         # Weighted bias, IPDA
│   ├── 02_key_levels/       # Engine OBs/FVGs, IRL/ERL, Order Flow, Liquidity Marker
│   ├── 03_session_time/     # Killzone, Silver Bullet, Bread and Butter
│   ├── 04_model_selection/  # 17 models with stacked boosts
│   ├── 05b_micro/           # Coherence, Fractal MMXM, Invalidation, Inducement
│   ├── 05_entry_refinement/ # SL/TP, IOFED pyramid, 3rd candle OTE, lecture overrides
│   ├── 06_risk_management/  # Position sizing, risk gates
│   └── 07_journal_review/   # Session review, decision quality scoring
│
├── _config/              # Trading rules, risk params, model priority (17 models)
├── shared/               # Daily data, trade graph, performance, audit reports
├── references/           # 138 ICT tutorials + knowledge base (RAG indexed)
└── web/                  # Frontend dashboard
```

## ICT Knowledge Base

138 tutorials indexed with semantic search:

```bash
node tools/ict_rag.cjs --query "turtle soup entry criteria"
node tools/ict_rag.cjs --concept "ict-power-of-3"
node tools/ict_decision_validator.cjs --validate EURUSD
```

## Entry Models (17 Total)

### Tier 0 — Foundation
| ★★★ | Weekly Range Profiles | 12-profile classification, weekly anchor |
| ★★ | One Trade Setup for Life | 5-session daily routing, first-opportunity lock |
| ★ | PO3 / AMD | Cycle phase engine |

### Tier 1 — Primary
| Model | Source |
|-------|--------|
| 08:30 Liquidity Raid Model | ICT 2024 Lecture 1 |
| London Hunt + IFVG | ICT 2024 Lecture 2 |
| Silver Bullet | Killzone scalping |
| NDOG/NWOG News Model | ICT 2024 Lecture 4 |
| MMXM Buy/Sell Models | Market Maker models |
| OTE + Institutional OB | Fibonacci retracement |

### Tier 2 — Strong
| Model | When |
|-------|------|
| Turtle Soup | Failed breakout fade |
| Breaker Block | OB polarity flip |
| SCOB | Clean OB with FVG |
| Judas Swing | Session-open manipulation |
| Unicorn | OTE + FVG confluence |

### Tier 3 — Situational
| Model | When |
|-------|------|
| 2FVG Entry | Expansion phase |
| Asian Range Breakout | With manipulation confirmation |
| NWOG/NDOG | Opening gap plays |
| Mitigation Block | OB tagged but not broken |
| Rejection Block | Long-wick institutional candle |

## Coherence System

### Weighted Bias
6 sources vote bullish/bearish with timeframe-based weights:
- 1W (3.0) + 1D (2.5) + 4H (2.0) + Weekly Profile (1.5) + One Trade Setup (1.0) + 1H (0.5)
- Direction = weighted majority. Confidence = winning weight / total weight.

### Inducement Gate
Binary: swept + reversed + MSS = OPEN. Otherwise all models zeroed.

### Unified Coherence
Single score where worst dimension wins. INVALIDATED = 0 regardless of other scores.

### Stacked Boosts
| Layer | Aligned | Opposing | Skip Week |
|-------|---------|----------|-----------|
| Weekly Profile | ×1.4 | ×0.3 | ×0.3 all |
| One Trade Setup | ×1.3 | ×0.7 | — |
| Killzone | ×1.0 (London/NY) | ×0.5 (Asia) | ×0.4 (Lunch) |

## Autonomous Trading

Two autonomous session runners:

```bash
# London Killzone (02:00-05:00 NY) — 3-hour session
node tools/tv-mcp/autonomous_session.cjs

# NY AM (09:50 Macro → Silver Bullet 10:00-11:00)
node tools/tv-mcp/ny_am_autonomous.cjs
```

Both handle: data refresh → pipeline → setup evaluation → trade execution → position monitoring → journaling.

## Key Documents

- `CLAUDE.md` — Full workspace reference for AI agents
- `CONTEXT.md` — Daily workflow router
- `USER_MANUAL.md` — Complete user guide
- `shared/AUDIT_ICT_COHERENCE.md` — 10-gap ICT coherence audit
- `_config/model_priority.md` — 17-model selection hierarchy
- `_config/trading_rules.md` — Entry rules, SL/TP, session restrictions

## Session Workflow

```bash
# Standard session
node tools/session_start.cjs                    # 1. Data + engines + forecasts
node tools/run_pair.cjs EURUSD                  # 2. Full analysis
node tools/tv-mcp/market_order.cjs ...          # 3. Execute (if setup valid)

# Autonomous session
node tools/tv-mcp/ny_am_autonomous.cjs          # Full auto from start to journal

# Post-session
node tools/ict_continuous_learn.cjs --run       # Extract lessons
node tools/trade_graph.cjs --rebuild            # Rebuild memory graph
```

## Requirements

- Node.js + npm
- Python 3 (forecasts, economic calendar)
- TradingView Desktop (CDP debug port 9222)
- Chrome/Edge

## License

MIT
