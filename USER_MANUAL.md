# SMC-ICM Trading Workspace — User Manual

## What This Is

A disciplined ICT/SMC trading workspace that combines deterministic engine analysis, AI-powered reasoning, TradingView CDP automation, and ICT knowledge-base integration. All time-based logic uses **New York local time** (ICT standard).

## Quick Start

### First Session
```bash
# 1. Open TradingView Desktop (with CDP debug port 9222)
# 2. Start the session — fetches all data, runs engines, generates forecasts
node tools/session_start.cjs

# 3. Run full analysis on each pair
node tools/run_pair.cjs EURUSD
node tools/run_pair.cjs GBPUSD
node tools/run_pair.cjs XAUUSD
node tools/run_pair.cjs NAS100
```

### Placing Paper Trades

```bash
# Kill any background monitors first — they fight for chart control
taskkill /F /IM node.exe

# Get live levels for all pairs
node tools/tv-mcp/live_levels.cjs

# Place a trade (pair, side, sl, tp, qty)
node tools/tv-mcp/market_order.cjs EURUSD SELL 1.13950 1.13750 10000

# Verify positions
node tools/tv-mcp/check_orders.cjs
```

### News Trading (ICT One Shot One Kill)

```bash
# Trade a high-impact news event
node tools/tv-mcp/news_trade.cjs --event "FOMC" --time "14:00"

# Only specific pairs
node tools/tv-mcp/news_trade.cjs --event "NFP" --time "08:30" --pairs XAUUSD,NAS100

# Auto-detect next event from calendar
python tools/economic_calendar.py --today-only --output shared/today_events.json
node tools/tv-mcp/news_trade.cjs
```

## Daily Workflow

The system follows a 9-stage pipeline. Run `node tools/run_pair.cjs <PAIR>` to execute all stages automatically, or step through manually:

| Stage | Name | What It Does |
|-------|------|-------------|
| 00 | Macro Context | Cycle phase, Po3 state, IPDA dealing range, day profile |
| 00b | Council Vote | 4-archetype vote (Position/Swing/Day/Scalp) on direction |
| 01 | HTF Bias | 1W/1D/4H structure and directional bias |
| 02 | Key Levels | OB, FVG, liquidity pools, breakers |
| 03 | Session Time | Killzone, Silver Bullet, Judas Swing windows |
| 04 | Model Selection | Best ICT model for current conditions (14 models) |
| 05 | Entry Refinement | Precise entry zone, OTE, invalidation |
| 05b | Micro Confirmation | LTF coherence, fractal MMXM, 1m inversion, 6 confirmations |
| 06 | Risk Management | Position size, R:R, risk plan |
| 07 | Journal Review | Post-session review, lessons, graph update |

## ICT Knowledge Base

138 tutorials indexed with semantic search:

```bash
# Search for concepts
node tools/ict_rag.cjs --query "one shot one kill news trading"

# Deep dive on a specific concept
node tools/ict_rag.cjs --concept "ict-one-shot-one-kill"

# Pre-trade compliance check
node tools/ict_decision_validator.cjs --validate EURUSD
```

## TradingView CDP Automation

The system controls TradingView Desktop via Chrome DevTools Protocol on port 9222. Key scripts in `tools/tv-mcp/`:

| Script | Purpose |
|--------|---------|
| `market_order.cjs` | Place market order with SL/TP (one command) |
| `news_trade.cjs` | ICT news event trading system |

| `check_orders.cjs` | Verify open positions and orders |
| `live_levels.cjs` | Scan all pairs for live prices + SL/TP |
| `scan_all_pairs.cjs` | Deep scan all pairs for trade setups |
| `modify_sl.cjs` | Calculate structural SL from swing levels |

### Critical: Before Trading

```bash
taskkill /F /IM node.exe  # Kill monitors or they'll fight you
```

The monitors (`intel_monitor.cjs`, `discord_bot.cjs`) auto-switch charts and will hijack your order placement.

## Configuration

Edit these files to customize system behavior:

| File | Controls |
|------|----------|
| `_config/trading_rules.md` | Entry rules, 6 confirmations, SL policy, session restrictions |
| `_config/risk_parameters.md` | Account size, risk per trade (1%), daily max (3%) |
| `_config/model_priority.md` | Model selection hierarchy and weighting |
| `_config/preferred_pairs.md` | Primary and secondary trading pairs |
| `_config/session_preferences.md` | Killzone times, SB windows, Judas Swing |
| `_config/ict_calendar.md` | Day profiles, monthly events, multipliers |
| `_config/micro_params.md` | LTF thresholds and parameters |

## Key Commands

```bash
# Session
npm run session          # Full startup (data + engines + forecasts)
npm run analyze EURUSD   # Full pair analysis

# Trading
npm run levels           # Get live SL/TP for all pairs
npm run trade EURUSD SELL 1.13950 1.13750 10000
npm run positions        # Check open positions

# News
npm run calendar         # Fetch today's economic events
npm run news             # Trade next high-impact event

# Journal & Learning
npm run journal          # Extract lessons from today's trades
npm run graph            # Rebuild trade graph

# ICT Knowledge
node tools/ict_rag.cjs --query "your question"
node tools/ict_decision_validator.cjs --check EURUSD
```

## Symbol Mappings

When using `setSymbol()`, the system auto-resolves:

| Input | Resolves To |
|-------|------------|
| GBPUSD | OANDA:GBPUSD |
| EURUSD | OANDA:EURUSD |
| XAUUSD | OANDA:XAUUSD |
| NAS100 | CAPITALCOM:NAS100 |
| USDOLLAR | FX:USDOLLAR |

## Risk Management

- **Per trade**: 1% of account ($100 on $10K)
- **Daily max**: 3% ($300)
- **Max positions**: 2 open simultaneously
- **No correlated double exposure** (don't short both EURUSD and GBPUSD on same dollar move)
- **SL placement**: At structural invalidation (swing + ATR buffer), never at liquidity pools
- **News events**: 2.5× normal SL, 3.5× normal TP

## ICT Session Times (NY Local)

| Session | NY Time | Reliability |
|---------|---------|-------------|
| Asia | 20:00-00:00 | Low |
| London KZ | 02:00-05:00 | High |
| NY AM KZ | 08:00-11:00 | High |
| NY Lunch | 11:00-13:00 | ×0.4 (avoid) |
| NY PM | 13:00-16:00 | Medium |
| Silver Bullet (London) | 03:00-04:00 | High |
| Silver Bullet (NY AM) | 10:00-11:00 | High |
| Silver Bullet (NY PM) | 14:00-15:00 | High |

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Orders not filling | Kill monitors: `taskkill /F /IM node.exe` |
| "Take profit must be above/below entry" | SL/TP values swapped in wrong fields |
| Chart shows wrong pair | Use `setSymbol()` API, not keyboard |
| Ticket won't open | Click "Paper Trading" to expand panel |
| Position doesn't appear | Stale pending orders blocking — use different quantity |
| Drawings on wrong chart | Clear with `removeAllShapes()` before switching |

## License

MIT
