# SMC-ICM Trading Workspace

**Smart Money Concepts / Inner Circle Trader automated trading workspace with TradingView paper trading integration via CDP.**

## Overview

Disciplined ICT/SMC analysis engine with full automation for:
- Multi-timeframe structure analysis (1m through 1W)
- Institutional order flow detection (OB, FVG, Breaker, liquidity pools)
- TradingView Desktop CDP integration (74 MCP tools + direct CDP)
- Paper trading order execution with SL/TP automation
- ICT knowledge base (138 tutorials, RAG-powered semantic search)
- News event trading (ICT One Shot One Kill framework)
- Trade journaling, continuous learning, and graph-based memory

## Quick Start

```bash
# 1. Session startup (fetch all data, run engines, generate forecasts)
node tools/session_start.cjs

# 2. Run full analysis on a pair
node tools/run_pair.cjs EURUSD

# 3. Place a paper trade
taskkill /F /IM node.exe  # Kill monitors first!
node tools/tv-mcp/market_order.cjs EURUSD SELL 1.13950 1.13750 10000

# 4. Trade a news event
node tools/tv-mcp/news_trade.cjs --event "FOMC" --time "14:00"

# 5. Verify positions
node tools/tv-mcp/check_orders.cjs
```

## Architecture

```
smc-icm-trading/
├── tools/               # Analysis + execution scripts
│   ├── run_pair.cjs           # Full ICM pipeline (14 models, 7 stages)
│   ├── session_start.cjs      # One-command startup (TV + data + engines)
│   ├── ny_time.cjs            # NY session time checker
│   ├── council.cjs            # 4-archetype council vote
│   ├── macro_context.cjs      # HTF cycle/AMD/IPDA analysis
│   ├── ict_rag.cjs            # ICT knowledge base semantic search
│   ├── ict_continuous_learn.cjs  # Trade lesson extraction
│   ├── trade_graph.cjs        # Unified memory graph
│   ├── risk_tracker.cjs       # Risk limit enforcement
│   ├── discord_bot.cjs        # Discord alerts + commands
│   └── tv-mcp/                # TradingView CDP automation
│       ├── market_order.cjs   # Market order with SL/TP
│       ├── news_trade.cjs     # ICT news event trading
│       ├── execute.cjs        # Full e2e trade execution
│       ├── check_orders.cjs   # Position verification
│       ├── scan_all_pairs.cjs # Live pair scanner
│       └── ...                # 15+ additional CDP scripts
├── stages/              # 7-stage ICM pipeline output
├── _config/             # Trading rules, risk params, model priority
├── shared/              # Daily data, trade graph, performance
├── references/          # ICT tutorials + knowledge base
└── web/                 # Frontend dashboard
```

## ICT Knowledge Base

138 tutorials indexed with semantic search:

```bash
node tools/ict_rag.cjs --query "one shot one kill news trading"
node tools/ict_rag.cjs --concept "ict-one-shot-one-kill"
node tools/ict_decision_validator.cjs --validate EURUSD
```

## TradingView CDP Automation

74 MCP tools for chart control + direct CDP scripts for order execution.

Key scripts in `tools/tv-mcp/`:

| Script | Purpose |
|--------|---------|
| `market_order.cjs` | Place market order with SL/TP (CLI args) |
| `news_trade.cjs` | ICT news event trading system |
| `execute.cjs` | Full e2e with keyboard switch + field mapping |
| `check_orders.cjs` | Verify positions + orders |
| `scan_all_pairs.cjs` | Live scan all pairs for setups |
| `modify_sl.cjs` | Calculate structural SL from swing levels |

### Critical: Kill Monitors Before Trading

The `intel_monitor.cjs` and `discord_bot.cjs` auto-switch charts and will fight your order placements:

```bash
taskkill /F /IM node.exe
```

## News Trading (ICT One Shot One Kill)

Proven on FOMC July 29: XAUUSD LONG +$2,554 in 90 seconds.

```bash
node tools/tv-mcp/news_trade.cjs --event "FOMC" --time "14:00"
node tools/tv-mcp/news_trade.cjs --event "NFP" --time "08:30" --pairs XAUUSD
```

See `shared/2026-07-29/ICT_NEWS_TRADING_STRATEGY.md` for the full strategy.

## Session Workflow

Read `CONTEXT.md` for the daily workflow router. Standard sequence:

1. **Session check**: `node tools/ny_time.cjs --full`
2. **Data fetch**: `node tools/session_start.cjs`
3. **Pair analysis**: `node tools/run_pair.cjs <PAIR>`
4. **Trade placement**: `node tools/tv-mcp/market_order.cjs <PAIR> <SIDE> <SL> <TP> <QTY>`
5. **Monitoring**: `intel_monitor.cjs` (background)
6. **Journaling**: `node tools/ict_continuous_learn.cjs --run`

## Configuration

- `_config/trading_rules.md` — Entry rules, SL/TP policy, session restrictions
- `_config/risk_parameters.md` — Risk limits, position sizing
- `_config/model_priority.md` — Model selection hierarchy
- `_config/preferred_pairs.md` — Primary trading pairs
- `.env` — API keys (Discord, etc.)

## Requirements

- Node.js + npm
- Python 3 (for forecasts, economic calendar)
- TradingView Desktop (for CDP automation)
- Chrome/Edge (CDP debug port 9222)

## Key Documents

- `CLAUDE.md` — Full workspace reference for AI agents
- `CONTEXT.md` — Daily workflow router
- `shared/2026-07-29/SESSION_JOURNAL.md` — Latest session journal
- `shared/2026-07-29/STRATEGY_COMPARISON.md` — Fed day trade analysis
- `shared/2026-07-29/ICT_NEWS_TRADING_STRATEGY.md` — ICT news trading strategy

## License

MIT
