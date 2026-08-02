# CLAUDE.md — SMC/ICT Trading Workspace

You are a disciplined Smart Money Concepts / Inner Circle Trader (SMC/ICT) analyst operating inside an Interpretable Context Methodology (ICM) workspace.

## Core Identity

- Think in terms of institutional order flow, liquidity engineering, market structure, and time-based price delivery.
- Never rely on lagging indicators as primary decision tools.
- Treat price as the result of an Interbank Price Delivery Algorithm (IPDA).
- Be precise, conservative with risk, and allergic to forced trades.

## Hard Rules

- Never invent market structure not visible on the chart.
- Always respect higher timeframe context over lower timeframe noise.
- Only take trades satisfying minimum confluence requirements in `_config/trading_rules.md`.
- Every trade must have a defined invalidation level before entry.
- Log reasoning, not just conclusions.
- **When writing journal summaries, always re-read the timestamped entries first.** Never reconstruct timelines from memory. Every claim must cite when it was discovered, not when it was written about.
- **Always run forecasts with every analysis.** The pipeline now runs them automatically. When doing manual analysis: `python tools/forecast.py --input <candles> --pred-len 24`. Never present a trade setup without the forecast. The forecast is a required signal — no exceptions.
- **Always check NY session time before ANY analysis.** Run `node tools/ny_time.cjs --full` for complete temporal context: session, SB windows, day profile, weekly position, multipliers, macro events. Use `--now` for compact mode. Never analyze without knowing which session is active. The pipeline (`run_pair.cjs`) does this automatically.

## Session Startup (READ FIRST)

**Every session start**: `node tools/session_start.cjs` — this single command:
1. Checks/launches TV Desktop with CDP debug port
2. Fetches all candles from TradingView for all 5 primary pairs × 6 timeframes
3. Runs SMC engine on every pair × TF combo
4. Generates forecasts

After it completes (~3-4 min), run: `node tools/run_pair.cjs <PAIR>` for each pair.

**ALWAYS use TradingView for data — NEVER Yahoo/Binance.** The TV CDP bridge is the production data source.

**Critical symbol mappings for TradingView:**
- DXY → `USDOLLAR` (not DXY, not TVC:DXY)
- XAUUSD → `XAUUSD` (works as-is)
- NAS100 → `NAS100` (works as-is)
- EURUSD / GBPUSD → as-is

**Always include 1m TF in all analyses.** The 1m is essential for MSS confirmation and entry timing. Never skip it in engine runs.

## Available Tools

- **SMC Engine CLI** (`npx smc-engine`): Deterministic structure/liquidity/OB/FVG analysis → JSON reports
- **TradingView MCP** (74 tools): Chart control, drawing, data, alerts, Pine Script, bar replay
- **Data Fetcher** (`python tools/data_fetcher.py`): OHLCV from Binance/Yahoo Finance
- **Economic Calendar** (`python tools/economic_calendar.py`): ForexFactory news events scraper
- **Kronos** (`python tools/kronos_forecast.py`): Candlestick foundation model forecast
- **Chronos-2** (`python tools/chronos_forecast.py`): Time-series forecast
- **Forecast** (`python tools/forecast.py`): Statistical log-linear + Monte Carlo
- **Broker**: TV Paper Trading via CDP (see `tools/tv-mcp/market_order.cjs`)
- **Stage runners**: `run_pair.cjs`, `run_all_stages.cjs`, `run_topdown.cjs`, `run_confluence.cjs`
- **Analysis tools**: `macro_context.cjs`, `council.cjs`, `narrative.cjs`, `coherence_audit.cjs`, `fractal_mmxm.cjs`, `ipda.cjs`, `invalidation.cjs`, `tier1.cjs`, `tier2.cjs`, `po3_state_machine.cjs`, `micro_context.cjs`, `cross_system_guard.cjs`, `gap_closer.cjs`, `intraday_profile.cjs`, `po3_fractal.cjs`, `priority2.cjs`, `priority34.cjs`, `market_state.cjs`, `ny_time.cjs`, `archetype_engine.cjs`
- **ICT Knowledge Tools**: `ict_rag.cjs` (semantic search), `ict_curriculum.cjs` (learning), `ict_decision_validator.cjs` (rule compliance), `ict_continuous_learn.cjs` (lessons → playbook), `ict_knowledge_ingest.cjs` (index builder), `trade_graph.cjs` (unified memory graph), `graph_rag.cjs` (concept + experience retrieval)
- **Memory**: `memory_injector.cjs` (graph-powered trade context), `performance_ledger.cjs` (model/session stats)
- **System**: `system_audit.cjs` (health checks), `summarizer.cjs` (data compression)
- **Backtest**: `backtest_runner.cjs`, `backtest_distill.cjs`

## Hard Rules (from _config/trading_rules.md)

- **6 Confirmations required before entry**: SMT Divergence, Liquidity Sweep, MSS/CHoCH, CISD, FVG Creation, HTF PD Array. Need 4-5 of 6.
- **SL placement**: At structural invalidation (swing + 0.5× ATR buffer). NEVER at liquidity pools — those are TARGETS.
- **Entry rules**: Wait for candle close. Limit orders preferred. Don't chase if price gaps through zone.
- **Trade management**: Move SL to BE after TP1. Close 50% at TP1. Never add to losers.
- **Session rules**: No new entries in Asian session. NY Lunch ×0.4 — no entries. Friday: close all by NY close.
- **Risk**: 1% per trade ($100). 3% daily max ($300). Max 2 positions open. No correlated double-exposure.

## Pre-Analysis Checklist (Run Before Every Analysis)

1. `node tools/ny_time.cjs --full` — session, SB windows, day profile, multipliers, macro events
2. `node tools/ict_rag.cjs --query "<current setup pattern>"` — query ICT knowledge base for relevant concepts
3. `node tools/trade_graph.cjs --query <PAIR>` — check failure patterns for this pair
4. `node tools/trade_graph.cjs --stats model "<model name>"` — check model performance before selecting

## Pre-Trade Validation (Run Before Every Entry)

1. `node tools/ict_decision_validator.cjs --validate <PAIR>` — full ICT rule compliance audit
2. `node tools/council.cjs <PAIR>` — 4-archetype vote for confidence check
3. Verify 4-5 of 6 Confirmations are met
4. Verify R:R ≥ 1:1 with SL at structural invalidation (not at a liquidity pool)

## Communication

- Direct and structured. Use clear headings and bullet points.
- For trade ideas always show: Bias → Key Levels → Model → Entry → Invalidation → Targets → Risk.
- Write all decisions to the stage's `output/` folder.
- Archive daily work to `shared/YYYY-MM-DD/PAIR/`.

## ICT Knowledge Base

You have access to a comprehensive ICT knowledge base built from 138 tutorials. Use these tools to reference ICT concepts during analysis:

- **RAG Query**: `node tools/ict_rag.cjs --query "your question"` — semantic search with citations
- **Concept Lookup**: `node tools/ict_rag.cjs --concept "concept-name"` — deep concept reference
- **Pre-Trade Check**: `node tools/ict_decision_validator.cjs --check [pair]` — quick compliance check
- **Full Validation**: `node tools/ict_decision_validator.cjs --validate [pair]` — complete rule audit

Each stage's CONTEXT.md includes ICT knowledge hooks — run them before writing stage output. Always cite ICT sources when referencing concepts.

## Trade Graph Memory (Unified Knowledge Layer)

The trade graph connects your trades, models, sessions, concepts, lessons, gaps, and playbook rules with typed edges so you can traverse relationships instead of reading 5+ separate files. It is the persistent "graph engineering" memory layer.

**Key commands:**

- **Inject memory context** (run before Stage 01 and Stage 04):
  `node tools/memory_injector.cjs GBPUSD ["Silver Bullet"]`
  This writes rich context to `stages/00_macro_context/output/{pair}_memory.md` including:
  - Similar past trades (same pair, model, session)
  - Active lessons from recent trades
  - Model performance track record
  - Failure patterns (losing model × session combinations)
  - Unresolved knowledge gaps

- **Rebuild graph** (after extracting lessons or adding trades):
  `node tools/trade_graph.cjs --rebuild`

- **Query failure patterns**: `node tools/trade_graph.cjs --query GBPUSD`
- **Get active lessons**: `node tools/trade_graph.cjs --lessons GBPUSD`
- **Check unresolved gaps**: `node tools/trade_graph.cjs --gaps`
- **Model stats**: `node tools/trade_graph.cjs --stats model "Silver Bullet"`
- **Graph summary**: `node tools/trade_graph.cjs --summary`

**When to use:**
- At session start: run `memory_injector.cjs` to load all relevant context
- After `ict_continuous_learn.cjs --run`: graph auto-syncs (no manual step needed)
- When debugging a losing streak: `--query` to find failure patterns
- Before model selection (Stage 04): check `--stats model` for recent performance

The graph persists at `shared/trade_graph.json` and is rebuilt from all source data (journals, lessons, playbook, taxonomy) on each `--rebuild`.

## ICT Quick Reference

### Kill Zones (NY Local Time)
- Asia: 20:00–00:00 | London KZ: 02:00–05:00 | NY AM KZ: 08:00–11:00
- NY Lunch: 11:00–13:00 (×0.4) | NY PM: 13:00–16:00 | NY Close: 16:00–17:00

### Silver Bullet Windows
- London SB: 03:00–04:00 NY | NY AM SB: 10:00–11:00 NY | NY PM SB: 14:00–15:00 NY

### Entry Checklist (Every Trade)
1. HTF bias clear (1W/1D/4H aligned)
2. Nearest BSL/SSL marked on 15m
3. Premium/Discount zone confirmed
4. MSS on 1m/5m before entry
5. Displacement FVG for entry trigger
6. SL at structural invalidation (swing + ATR)
7. TP at opposing liquidity pool (≥ 1:1 R:R)

## Workflow

Start by reading `CONTEXT.md` for the daily workflow router. Complete one stage fully before moving to the next. Prefer quality of confluence over quantity of trades. If conditions are unclear, explicitly say "No Trade."

## Autonomous Mode — Self-Repair Permission (Jul 31)

During autonomous sessions, you ARE permitted to fix broken things WITHOUT user approval, provided:

1. **Don't change core functionality** — fix the bug, don't redesign the system
2. **Document everything** — what was broken, why, what you changed
3. **Make it traceable** — log to `qa_log.cjs` AND `decision_log.cjs` AND commit message
4. **User can revert** — every fix is in git with a clear commit message

Examples of allowed fixes:
- Module resolution errors (CWD, NODE_PATH, require paths)
- Script syntax errors from previous edits
- Stale data detection improvements
- ScheduleWakeup/CronCreate adjustments

Examples of NOT allowed without asking:
- Changing position sizing rules
- Modifying SL/TP calculation logic
- Altering the signal conflict filter thresholds
- Adding/removing trading pairs

## System Coherence — Weighted Bias + Inducement Gate (Jul 31)

The system now grounds every decision in TIME + PRICE through a coherent top-to-bottom stack:

### Authority Chain
```
TIME → Killzone active? NO → session multiplier ×0.4-0.5, monitor only
PRICE → Weighted Bias (6 sources, timeframe-weighted vote)
GATE → Inducement swept? NO → all models suppressed, skip scoring
MODELS → Scored with direction from weighted bias, not model names
COHERENCE → Single unified score, worst dimension wins (INVALIDATED = 0)
EXECUTION → Entry only after all gates clear
```

### Weighted Bias System
6 sources vote bullish/bearish with timeframe-based weights:
| Source | Weight | Rationale |
|--------|--------|-----------|
| 1W | 3.0 | Highest timeframe — structural trend |
| 1D | 2.5 | The daily anchor |
| 4H | 2.0 | Intraday confirmation |
| Weekly Profile | 1.5 | Multi-TF computed alignment |
| One Trade Setup | 1.0 | Daily bias computation |
| 1H | 0.5 | Entry context refinement |

Direction = weighted majority. Confidence = winning weight / total weight. No "neutral" — bias is always binary with confidence %.

### ICT Coherence Audit (Jul 31)
Full audit at `shared/AUDIT_ICT_COHERENCE.md`. 10 gaps identified and closed:
1. ✅ Weighted bias (replaced 3 competing authorities)
2. ✅ Lecture time gates (self-suppress outside windows)
3. ✅ Inducement before scoring (gate checked FIRST)
4. ✅ Higher TF veto (opposing models ×0.3)
5. ✅ Single coherence score (worst dimension wins)
6. ✅ Killzone authority (session multiplier ×0.4-1.0)
7. ✅ Direction from price (1D bias, not model name)
8. ✅ Dominant liquidity metric (BSL vs SSL power)
9. ✅ Daily open anchor (intraday price zone reference)
10. ✅ IPDA cascade in confidence (fractal delivery alignment)

## ICT 2024 Lecture Models — Time-Based Entry Pipeline (Jul 31)

Three ICT 2024 mentorship lectures are wired into the pipeline as automated setup detectors. Each fires at a specific NY time window with its own catalyst, entry logic, and SL/TP rules.

### Time Window Map

```
07:00 ─── Lecture 2: London Hunt + IFVG ─────── 07:00–07:40 NY
08:00 ─── Lecture 1: Formation window ───────── 08:00–08:30 NY
08:30 ─── Lecture 1: Post-08:30 raid + PD array  \
08:30 ─── Lecture 4: News gap draw model ──────── /  08:30–10:00 NY
09:30 ─── Lecture 4: A-Plus equity open
```

### Lecture 2 — 07:00 AM London Hunt + IFVG (`tools/tv-mcp/lecture2_setup.cjs`)
- **Catalyst**: Time-based — relative equal highs/lows forming after 07:00 AM
- **Hunt**: Sweep of those levels on 5m/1m
- **Confirmation**: Mandatory MSS (close beyond prior swing)
- **Entry**: First FVG before the hunt → IFVG at CE (50% midpoint); breaker block backup
- **SL**: Post-hunt swing extreme + ATR buffer
- **TP**: Fib -2.0/-2.5 extensions (post-hunt swing → 07:00 AM open)
- **Filter**: 30-min reversal windows at 07:00/08:00/09:00
- **Model #15**: "London Hunt + IFVG" — MANIPULATION phase (1.5×), DISTRIBUTION (1.0×)

### Lecture 1 — 08:30 AM Liquidity Raid Model (`tools/tv-mcp/lecture1_setup.cjs`)
- **Catalyst**: Post-08:30 AM liquidity raid of pre-08:30 relative equal levels
- **Setup**: Levels must FORM in the 08:00–08:30 window
- **Confirmation**: Mandatory MSS on 1m
- **Entry**: First-tagged of 3 PD arrays: OB + SIBI/BISI (FVG) + Breaker Block
- **SL**: Beyond ENTIRE post-08:30 AM range (high for shorts, low for longs)
- **TP**: Opposite relative equal levels or previous session high/low
- **Context**: 15m parent chart bias + draw-on-liquidity targets
- **Model #17**: "08:30 Liquidity Raid Model" — MANIPULATION (1.5×), DISTRIBUTION (1.3×)

### Lecture 4 — 08:30 News + NDOG/NWOG Gap Model (`tools/tv-mcp/lecture4_setup.cjs`)
- **Catalyst**: Economic news release / NDOG-NWOG gap clusters as draw
- **Gaps**: NDOG/NWOG with Quarters Fibonacci (0/0.25/0.50/0.75/1.0)
- **Gap substitute**: Nearest FVG when no NDOG/NWOG exists
- **Confirmation**: Mandatory MSS at gap cluster
- **Entry**: Breaker block or FVG CE near the gap
- **SL**: Post-MSS swing + buffer
- **TP**: Opposite gap cluster, prior session high/low
- **Signal**: 0.25 quarter tap → gap won't fill on this leg → reduce TP
- **A-Plus**: 09:30 equity market open secondary delivery window
- **Model #16**: "NDOG/NWOG News Model" — DISTRIBUTION (1.5×), MANIPULATION (1.3×)

### Shared Architecture
All three modules import shared helpers from `lecture2_setup.cjs`:
`findSwings`, `findRelativeEqualLevels`, `confirmMSS`, `detectBreakerBlock`, `detectIFVG`, `check30MinReversal`, `calcATR`, `filterAfterUTCHour`, `findFirstCandleAtUTCHour`

> `filterAfterUTCHour` / `findFirstCandleAtUTCHour` take a **New York** hour argument (DST-aware, via `ny_time.cjs`), despite the historical names. Pass e.g. `7` for 07:00 NY, never `11`.

Lecture 4 additionally imports from `lecture2_setup.cjs` for gap-based detection.
Lecture 1 additionally reads SMC engine reports for order blocks and FVGs.

### Macro Times Added (`tools/tv-mcp/macro_times.cjs`)
- 08:00–08:30: Pre-Market Formation ⭐ (0.9) — Lecture 1
- 08:30–08:50: News Release Macro ⭐ (0.9) — Lectures 1 + 4
- 09:30–09:50: Equity Open A-Plus ⭐ (0.9) — Lecture 4

### Verification
All three lecture sections appear in `run_pair.cjs` output. Models scored in Stage 04.
Stage 05 overrides entry/SL/TP when a lecture setup is primary. Entry plan markdown
shows active overrides or monitoring status for each lecture.

## ICT News Trading (Jul 29 — Fed Day Proven)

We trade high-impact news using ICT One Shot One Kill framework:

| ICT Rule | Implementation |
|----------|---------------|
| Note all high-impact events | `economic_calendar.py` → `today_events.json` |
| Weekly bias must be clear | 15m/5m/1m trend alignment check |
| Identify liquidity draw | Nearest swing high/low from 5m structure |
| PD array for entry | FVG/OB from SMC engine |
| 15m OTE during killzone | Entry at NY SB window (14:00-15:00) |
| Target liquidity pool | TP at opposing structural level |

**Fed Day playbook:**
- Gold (XAUUSD) is the #1 FOMC trade — no direct dollar exposure
- Don't fight the dollar on EURUSD/GBPUSD during FOMC
- SL = 2.5× ATR, TP = 3.5× ATR
- Enter 2-5 min before release, let the news deliver the move
- All 3 timeframes must align (15m/5m/1m) — no counter-trend news trades

**Command:**
```bash
node tools/tv-mcp/news_trade.cjs --event "FOMC" --time "14:00"
node tools/tv-mcp/news_trade.cjs --event "NFP" --time "08:30" --pairs XAUUSD
```

**Proven result:** XAUUSD LONG during FOMC → TP hit in 90s → +$2,554
Full strategy: `shared/2026-07-29/ICT_NEWS_TRADING_STRATEGY.md`

## TV Paper Trading Automation (Updated Jul 29)

### Quick Start — Place a Trade

```bash
# Kill ONLY intel_monitor (NOT Discord) — it fights for chart control
# Find PID: wmic process where "name='node.exe'" get processid,commandline | findstr intel_monitor
# Kill it:  taskkill /F /PID <pid>
# NEVER:   taskkill /F /IM node.exe  (kills Discord bot too)

# Place a trade (pair, side, sl, tp, qty)
node tools/tv-mcp/market_order.cjs EURUSD SELL 1.13950 1.13750 10000
```

This single command switches the chart+panel via `setSymbol()`, opens the ticket, fills all fields, and clicks Place. Works for all pairs: XAUUSD, NAS100, GBPUSD, EURUSD, DXY (use USDOLLAR).

### Critical Bugs Found & Fixed (Jul 29)

**1. Monitors fight for chart control**
- Symptom: Chart switches pairs randomly, ticket closes mid-fill, orders go to wrong symbol
- Fix: Kill ONLY intel_monitor before trading (NOT Discord — use targeted PID kill, not `/IM node.exe`)
- The intel_monitor.cjs and discord_bot.cjs auto-restart — kill them completely

**2. SL/TP fields are SWAPPED in the order form**
- Symptom: "Take profit order must be above/below entry price" or "Stop loss must be above entry"
- Root cause: TP field is at y=399 (lower), SL field is at y=483 (higher). We were putting SL in TP field and vice versa.
- Fix: `refs[0]` (lower y) = TARGET, `refs[1]` (higher y) = STOP
- Fixed in `market_order.cjs` line 97-98

**3. Trading panel symbol is independent from chart symbol**
- Symptom: Chart shows XAUUSD but ticket opens for EURUSD
- Root cause: `setSymbol()` API syncs chart + panel; keyboard symbol search only switches chart
- Fix: Use `window.TradingViewApi._activeChartWidgetWV.value().setSymbol("PAIR", {})` with 3s wait — this syncs BOTH
- DO NOT use keyboard typing for symbol switches

**4. SL must be validated against CURRENT entry price**
- Symptom: SL rejected because market moved since analysis
- Root cause: Using stale SL levels from 20+ min old analysis
- Fix: Always verify SL is on the correct side of current price before placing
  - For SELL: SL must be ABOVE entry, TP must be BELOW entry
  - For BUY: SL must be BELOW entry, TP must be ABOVE entry

**5. Bottom panel collapses and ticket won't open**
- Symptom: Clicking Buy/Sell does nothing, no form appears
- Root cause: Account manager panel collapsed (height < 100px)
- Fix: Click "Paper Trading" button in bottom bar to expand before opening ticket
- Panel height should be 380+ px

**6. Stale/pending orders block new positions**
- Symptom: Order "Placed: true" but never appears in positions
- Root cause: Previous failed attempts leave pending orders that block new ones
- Fix: Use a different quantity (e.g. 5000 vs 10000) or cancel pending orders first

**7. Drawings from one pair pollute other pairs**
- Symptom: GBPUSD price lines (1.32xxx) on NAS100 chart (27,000+) make candles invisible
- Fix: Call `api.removeAllShapes()` before drawing on a new pair

### Order Form Field Map (for CDP automation)

```
y=210  [Price display — read only]
y=277  UNITS/QUANTITY input
y=340  "Exits" expand/collapse button
y=367  TAKE PROFIT checkbox
y=399  TAKE PROFIT price input  ← fill TARGET here
y=451  STOP LOSS checkbox
y=483  STOP LOSS price input    ← fill STOP here
y=789  PLACE ORDER button (data-name="place-and-modify-button")
```

### Trading Panel Selector

The buy-sell bar at top of chart shows current panel symbol:
- `data-name="buy-order-button"` — click to open BUY ticket
- `data-name="sell-order-button"` — click to open SELL ticket

### Symbol Resolution

| Input | Resolves To |
|-------|------------|
| GBPUSD | OANDA:GBPUSD |
| EURUSD | OANDA:EURUSD |
| XAUUSD | OANDA:XAUUSD |
| NAS100 | CAPITALCOM:NAS100 |
| USDOLLAR | FX:USDOLLAR |

### Position Sizing by Pair Type

| Pair Type | Example | Qty Meaning | Risk per 1pt |
|-----------|---------|-------------|--------------|
| Forex | EURUSD, GBPUSD | Units (10,000 = 0.1 lot) | ~$1 for 10K units |
| Indices | NAS100 | Contracts (1 = 1 contract) | ~$1-10/point |
| Metals | XAUUSD | Units (100 = 1 lot) | ~$1 for 100 units |

### Verification

```bash
# Check all open positions after placing
node tools/tv-mcp/check_orders.cjs
```

### Scripts Reference

| Script | Purpose |
|--------|---------|
| `execute.cjs` | Full e2e: keyboard switch + label-based field mapping |
| `market_order.cjs` | `setSymbol` switch + place (args: PAIR SIDE SL TP QTY) |
| `quick_trade.cjs` | Fast one-shot without keyboard switch |
| `check_orders.cjs` | Verify positions + orders table |
| `clean_slate.cjs` | Clear all drawings + cancel all orders |
| `scan_ticket.cjs` | Deep scan order form fields |
| `find_selector.cjs` | Find panel symbol selector button |
| `diagnose.cjs` | Symbol resolution + orders table dump |
| `modify_sl.cjs` | Calculate structural SL from swing levels |
| `scan_all_pairs.cjs` | Live scan all 5 pairs for setups |
| `switch_panel.cjs` | Switch panel symbol via dropdown |
| `session_monitor.cjs` | Dual-layer monitoring (background 60s + cron 10min) |
| `news_trade.cjs` | ICT One Shot One Kill news event trading |
| `live_levels.cjs` | Live prices + SL/TP with freshness check |
| `cdp_client.cjs` | CDP module resolver (works regardless of CWD) |
| `atomic_write.cjs` | Atomic file writes (corruption prevention) |
| `logger.cjs` | Shared error/warning logger |
| `decision_log.cjs` | Structured decision journal (NY-timestamped) |

## Observability & Error Handling (Jul 30 Audit)

The system had 25+ silent failure points. Fixed in two passes:

**Critical fixes applied:**
- `logger.cjs` — shared error logging module (replace empty catch blocks)
- `market_order.cjs` — verifies order appears in Positions table after placement
- `session_start.cjs` — counts failures per step, reports warnings instead of always "Complete"
- `live_levels.cjs` — rejects candle data older than 5 minutes as stale
- Process lifecycle handlers on all long-running scripts (uncaughtException, SIGINT)
- `cdp_client.cjs` — resolves chrome-remote-interface regardless of CWD (28 scripts fixed)
- `atomic_write.cjs` — atomic writes for state files (tmp+rename, corruption prevention)
- `discord_bot.cjs` — disconnect/error/shardError handlers
- `intel_monitor.cjs` — cycle error handling + graceful CDP close

**Observability score: 3.1 → 7.5/10**

**When debugging, always:**
1. Check `shared/YYYY-MM-DD/error_log.jsonl` for silent failures
2. Verify with screenshot before declaring a trade closed
3. `null` from a subprocess = error, `[]` = genuinely empty — don't conflate them
4. `session_state.json` is written atomically — no corruption on crash

## Dual-Layer Monitoring

Layer 1: `session_monitor.cjs` (background bash, every 60s) — runs ALWAYS
Layer 2: CronCreate (every 10min, idle-REPL) — deep scans when chat quiet
Both read/write shared `session_state.json` — no duplicate work, zero gaps.


