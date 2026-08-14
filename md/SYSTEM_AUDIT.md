# SMC-ICM Trading System — Full System Audit

> Audit date: 2026-08-11 · Workspace: `C:\Users\cash\smc-icm-trading`
> Scope: architecture, data flow, time model, scheduling, execution, memory, learning, evaluation, and LLM layer — grounded in code inspection, not just docs.

---

## 1. Executive Summary

`smc-icm-trading` is an automated **Smart Money Concepts / Inner Circle Trader (SMC/ICT)** analysis-and-execution platform that treats price as the output of an institutional order-flow algorithm (IPDA). It runs a deterministic multi-stage pipeline against live TradingView candles, emits a structured decision, gates that decision through layered safety checks, and (only when explicitly enabled) places paper trades on TradingView via browser automation.

The system is built around a strict design principle: **the deterministic engine is the authority; everything else is advisory.** The LLM layer added on 2026-08-11 reinforces that boundary — it audits reasoning after the fact and never gates a trade.

### Key architectural facts
- **Decision authority:** the WP-8 **Model Registry** (`tools/models/registry.cjs`) — 17 models, each a time-windowed, direction-gated, confirmation-sequence state machine. One and only one complete model = `SETUP COMPLETE`; otherwise `NO TRADE` (fail-closed).
- **Hard gates:** registry completeness, cross-system guard (time/inversion blocks), invalidation (7 dimensions), price freshness, daily/weekly risk limits, minimum R:R, and evaluation resilience. Any gate failing stops execution.
- **Analysis and execution are decoupled.** `run_pair.cjs` never places an order; it writes `shared/<DATE>/<PAIR>/decision.json`, and gated auto-traders (`tools/auto_decision.cjs` + `tools/auto_scheduler.cjs` / autonomous drivers) decide whether to place.
- **Execution transport:** TradingView Desktop paper trading driven over CDP (Chrome DevTools Protocol, port 9222) — no broker API. An optional MT5 bridge (`tools/mt5/`) exists for live demo accounts.
- **Memory:** a typed knowledge graph (`shared/trade_graph.json`, 1,308 edges today) linking trades, models, sessions, lessons, gaps, concepts, and playbook rules.
- **Data source mandate:** TradingView only (Yahoo/Binance explicitly disallowed). DXY must use `USDOLLAR`.

---

## 2. What — System Identity & Scope

| Dimension | Detail |
|---|---|
| **Mission** | Detect institutional manipulation → delivery cycles (PO3/AMD) and time-based SMC setups, then trade them with discipline |
| **Pairs** | Primary: EURUSD, GBPUSD, XAUUSD, NAS100, DXY (`_config/preferred_pairs.md`); `GOLD` is an alias for XAUUSD |
| **Timeframes** | 1m, 5m, 15m, 1h, 4h, 1d, 1w (7 TF data + engine reports per pair) |
| **Models** | 17 registry models (Silver Bullet, Turtle Soup, MMXM, London Hunt + IFVG, 08:30 Liquidity Raid, NDOG/NWOG news, Breaker Block, Judas Swing, IOFED, IFVG Scale-In, etc.) |
| **Sessions tracked** | Asia, London KZ, London PM, NY AM KZ, NY Lunch, NY PM, NY Close, off-hours |
| **Execution** | TradingView paper trading (CDP DOM automation) + optional MT5 live-demo bridge |
| **Account model** | $10,000 paper; 1% / trade, 3% / day, 5% / week; max 2 positions |
| **Stage pipeline** | 10 stage directories (`stages/00…07`) fed by ~60 analysis tool modules |
| **Knowledge base** | 138 ICT concepts, 1,621 RAG chunks, 5 playbook rules |

---

## 3. Why — Objectives & Design Philosophy

1. **Price is engineered, not random.** The system models price as the Interbank Price Delivery Algorithm moving price between liquidity pools (BSL/SSL) during specific windows. Lagging indicators are not primary decision tools.

2. **Time and price are the only authorities.** The authority chain is:
   ```
   TIME  → killzone/session multiplier (silver bullet ×1.5, killzone ×1.3, lunch ×0.4, off-hours ×0.3)
   PRICE → weighted bias (6 sources, timeframe-weighted vote)
   GATE  → inducement swept? no → suppress models
   MODEL → one complete registry model (not a scoring leaderboard)
   COHERENCE → single unified score, worst dimension wins
   EXECUTION → all gates clear only
   ```

3. **Determinism over intelligence.** Every decision must be traceable to chart data (windows, sweeps, MSS, arrays). The registry is a hard boolean state machine — a model is complete or it isn't. The legacy 17-model numeric scoring still runs but only as a read-only shadow reporter.

4. **Fail closed.** No registry result → no trade. No ATR → no SL → blocked. Missing engine files → hard exit. The LLM is audit-only and can never place, modify, or unblock a trade.

5. **Everything is logged and learnable.** Reasoning is written to stage markdown; trades/lessons flow into the graph; lessons become playbook rules; each decision is re-analyzed by evaluation and the LLM auditor.

---

## 4. Where — Directory Map & Data Layout

### 4.1 Repo map
```
smc-icm-trading/
├── tools/
│   ├── run_pair.cjs            # Central pipeline (2,637 lines) — the primary runner
│   ├── session_start.cjs       # One-command startup (TV CDP → candles → engines → forecasts)
│   ├── auto_decision.cjs       # The single execution choke point (gates decision.json)
│   ├── auto_scheduler.cjs      # Day-long self-scheduling driver (15 events)
│   ├── start_auto.cjs          # Logon autostart orchestrator (spawns scheduler/monitor/discord)
│   ├── scheduler_guard.cjs     # Single-driver lock (shared/<DATE>/scheduler_state.json)
│   ├── ny_time.cjs             # DST-aware New York time engine (killzones, SB, multipliers)
│   ├── models/registry.cjs     # WP-8: 17-model registry (decision authority)
│   ├── models/steps.cjs        # Confirmation-step vocab (sweep, mss, fvg, ob, ote, cisd, …)
│   ├── trade_graph.cjs         # Unified memory graph (1,230 lines)
│   ├── memory_injector.cjs     # Graph → stages/00_macro_context/output/{pair}_memory.md
│   ├── ict_rag.cjs             # TF-IDF semantic search over 138 concepts (1,621 chunks)
│   ├── ict_continuous_learn.cjs# Lessons → playbook + graph sync (Phase 5)
│   ├── ict_decision_validator.cjs # Deterministic rule audit + --edge LLM self-consistency
│   ├── macro_context.cjs, council.cjs, ipda.cjs, invalidation.cjs, inducement_engine.cjs,
│   │   cross_system_guard.cjs, coherence_audit.cjs, fractal_mmxm.cjs, micro_context.cjs,
│   │   opening_range.cjs, time_price_grid.cjs, high_precision_secrets.cjs, weekly_profile_engine.cjs,
│   │   one_trade_setup.cjs, bread_and_butter.cjs, po3_state_machine.cjs, irl_erl_engine.cjs,
│   │   liquidity_marker.cjs, order_flow.cjs, ob_grading.cjs, risk_tracker.cjs, narrative.cjs,
│   │   soft_open.cjs, pd_array_matrix.cjs, mmxm_engine.cjs, missed_entry.cjs, … (~60 modules)
│   ├── llm/                     # LLM layer (added 2026-08-11)
│   │   ├── llm_client.cjs       # 7-provider chat client + ReAct agentLoop + selfConsistent
│   │   ├── llm_prompts.cjs      # 6 templates, all with COT_CHAIN (Hyp→Ev→Counter→Verdict)
│   │   ├── setup_auditor.cjs    # Audit-only ReAct reviewer → setup_audit.{json,md}
│   │   ├── memory_lessons.cjs   # Graph lessons/gaps for prompt injection
│   │   └── load_env.cjs         # Idempotent .env loader
│   ├── tv-mcp/                  # TradingView CDP automation
│   │   ├── market_order.cjs     # Production order placer (DOM automation + verification)
│   │   ├── check_orders.cjs, positions_json.cjs, check_positions.cjs
│   │   ├── modify_sl.cjs, live_levels.cjs, check_sl.cjs, order_history.cjs
│   │   ├── intel_monitor.cjs    # Live structure/setup monitor (Tier 1+2)
│   │   ├── session_monitor.cjs  # Position/SL/TP state monitor
│   │   ├── session_prep.cjs, news_trade.cjs, clean_slate.cjs, quick_trade.cjs
│   │   ├── ny_am_autonomous.cjs # NY AM SB phase driver
│   │   ├── autonomous_session.cjs # London KZ phase driver
│   │   ├── lecture1_setup.cjs / lecture2_setup.cjs / lecture4_setup.cjs
│   │   ├── cdp_client.cjs (CWD-independent), atomic_write.cjs, logger.cjs, decision_log.cjs
│   ├── mt5/                      # MT5 bridge (mt5_bridge.py, mt5_executor.cjs, run_bridge.cjs)
│   ├── backtest_runner.cjs, backtest_distill.cjs
│   ├── forecast.py, kronos_forecast.py, chronos_forecast.py, data_fetcher.py
│   └── smc-engine/               # npx smc-engine CLI (deterministic structure/liquidity/OB/FVG)
├── stages/
│   ├── 00_council_vote/ 00_macro_context/ 01_htf_bias/ 02_key_levels/
│   ├── 03_session_time/ 04_model_selection/ 05b_micro_confirmation/
│   └── 05_entry_refinement/ 06_risk_management/ 07_journal_review/
│   └── (each: CONTEXT.md + output/{pair}_*.md)
├── evaluation/
│   ├── run_evaluation.cjs       # Master runner (resilience → quality → judge → bias → trace)
│   ├── resilience/corrupt_detector.cjs
│   ├── metrics/output_quality.cjs      # ~29 expected files per pair
│   ├── judge/llm_judge.cjs            # 5-dimension rubric (rule-based fallback)
│   ├── benchmarks/bias_accuracy/scorer.cjs
│   ├── traces/session_tracer.cjs
│   └── regression/suite.cjs + evaluation/*_ledger.jsonl
├── references/
│   ├── ict_knowledge/taxonomy.json    # 138 concepts (t0:45, t1:26, t2:18, t3:49)
│   ├── ict_knowledge/rag/             # rag_index.json + chunks.json (1,621 chunks)
│   ├── playbook/current.md            # 5 rule blocks
│   └── (source: C:\Users\cash\Desktop\ICT Knowledge Centre)
├── _config/
│   ├── trading_rules.md, risk_parameters.md, model_priority.md, preferred_pairs.md
│   ├── session_preferences.md, micro_params.md, ict_calendar.md, nfp_strategy.md
│   ├── mt5_symbols.json, archetypes/{council,position,swing,day,scalp}.json
└── shared/                            # All runtime data (below)
```

### 4.2 `shared/` runtime data
```
shared/
├── <YYYY-MM-DD>/                      # 15 date dirs (2026-07-26 → 2026-08-11)
│   ├── <PAIR>/
│   │   ├── candles_{1m,5m,15m,1h,4h,1d,1w}.json   # live TV OHLCV
│   │   ├── engine_{1m,5m,15m,1h,4h,1d,1w}.json    # smc-engine reports
│   │   ├── decision.json               # the primary structured artifact
│   │   ├── forecast_{5m,1m}.json       # stat + MC forecasts (pred 24/48)
│   │   ├── irl_erl.json, liquidity_marker.json, one_trade_setup.json,
│   │   │   prev_lunch_inefficiency.json, missed_entry_state.json
│   │   ├── setup_audit.{json,md}       # LLM auditor output
│   │   └── traces/<PAIR>_trace.jsonl   # session traces
│   ├── session_state.json, scheduler_state.json, auto_scheduler_log.jsonl,
│   │   monitor_log.jsonl, error_log.jsonl, qa_log.md, decision_journal.md,
│   │   start_auto.log, mt5_*.jsonl, discord_alerts.jsonl, today_events.json
│   └── pyramid_state.json, ny_am_*_log.jsonl, autonomous_log.jsonl
├── trade_graph.json            # memory graph (296 KB, 1,308 edges today)
├── trade_log.json              # flat trade log (1 entry)
├── performance/                # lessons_{pair}_{date}.json (52), report_*, *_stats.md
├── backtest/                   # batch/ (8 runs), meta/, replay/
├── monitor/                    # setups.jsonl (score ≥7 setups → Discord)
├── screenshots/                # post-placement screenshots
└── AUDIT_*.md, ICT_CONCEPT_AUDIT.md   # historical audits
```

### 4.3 Configuration & env inventory
- **`_config/trading_rules.md`** — 6 confirmations (need 4–5/6), SL at structural invalidation (never at liquidity pools), entry/trade-management rules.
- **`_config/risk_parameters.md`** — $10K paper; 1%/$100 per trade, 3%/$300 day, 5%/$500 week; max 2 positions; 50% close at TP1; −50% size after 3 losses.
- **`_config/model_priority.md`** — tiered model ranking + tiebreakers + inducement as the 0th confirmation.
- **`_config/micro_params.md`** — LTF/HTF thresholds (min swing 0.5×ATR, FVG displacement 0.7×ATR, coherence ENTER ≥7/10).
- **`_config/ict_calendar.md` / `nfp_strategy.md`** — day profiles, monthly events, NFP playbook (XAUUSD, 2.5×/3.5× ATR).
- **Env (`.env`):** `LLM_PROVIDER` (default `gemini`), `LLM_MODEL`, `LLM_API_KEY`, `LLM_BASE_URL`, `GEMINI_API_KEY`, `CEREBRAS_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `FIREWORKS_API_KEY`, `OPENAI_API_KEY`, `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, `DISCORD_ALERT_CHANNEL`.

---

## 5. When — Time Model & Scheduling

### 5.1 The NY-time engine (`tools/ny_time.cjs`)
- Real US **DST-aware** clock (America/New_York): EDT −4 / EST −5, resolved per-timestamp (history uses the offset in effect at that time).
- **Killzones (NY local):** Asia 20–24 · Asia-late 0–2 · **London 02–05** · LondonPM 05–08 (not a killzone) · **NY AM 08–11** · NY Lunch 11–13 · **NY PM 13–16** · NY Close 16–17 · Off-hours 17–20.
- **Silver Bullet:** London 03–04, NY AM 10–11, NY PM 14–15. **Judas Swing:** London open 02–03, NY open 08–09.
- **Multipliers (WP-12):** SB 1.5, killzone 1.3, lunch 0.4, off-hours 0.3, else 1.0.
- Also tracks ICT day profiles, weekly position, macro events (NFP week, options expiry 3rd Friday, CPI window, month/quarter end), next-SB countdown.

### 5.2 The scheduler (`tools/auto_scheduler.cjs`) — 15 events
```
01:55 PRE-LONDON · 02:00 LONDON_KZ · 03:00 LONDON_SB · 06:55 PRE_LECTURE2 · 07:00 LECTURE2
07:55 PRE_LECTURE1 · 08:30 LECTURES_1_4 · 09:30 AMOR · 09:45 PRE_MACRO · 09:50 NY_MACRO
10:00 SILVER_BULLET · 13:25 PRE_PM · 13:30 PMOR · 15:50 PRE_CLOSE
```
- Re-scan cadence: **10 min** inside killzones, **15 min** pre-market, **30 min** off-hours/weekend.
- Each cycle: refresh data on briefing events (±3 min) → run `run_pair.cjs` per pair → gate every result through `auto_decision.gate()` → rank by `coherence + R:R×10` → (only with `--execute`) place via `market_order.cjs` after price-range sanity checks → track pyramids (add at 25%/50%/75% of range) → **Friday: close all by 15:50**.
- Heartbeat: `scheduler_guard.markActive()` → `shared/<DATE>/scheduler_state.json` (10-min lock expiry).

### 5.3 Autostart & drivers
- **Logon:** `%APPDATA%\...\Startup\SMC-AutoMode.cmd` → `node tools/start_auto.cjs --refresh` → spawns `auto_scheduler --execute`, `session_monitor`, and `discord_bot` (detached, guarded against duplicates).
- **Phase drivers (manual):** `ny_am_autonomous.cjs` (NY AM → SB), `autonomous_session.cjs` (London KZ). Both self-exit if the scheduler holds the EXECUTE lock.
- **No OS-level Task Scheduler entry exists** — the Startup-folder `.cmd` is the only autostart. Historically (Claude REPL), `ScheduleWakeup`/`CronCreate` were used as REPL-level schedulers.

### 5.4 Lifecycle (typical day)
```
Logon → start_auto → scheduler + monitor + discord
00–02 Asia monitor-only (×0.8)
02–05 London KZ (×1.3) + SB 03–04 (×1.5) → pipeline scans every 10 min
05–08 pre-market, 15-min scans
08–11 NY AM KZ (×1.3) + SB 10–11 → lecture 1/2/4 windows (07:00, 08:30)
11–13 NY Lunch (×0.4) — no new entries
13–16 NY PM KZ (×1.3) + SB 14–15
15:50 Friday: close everything
16–17 NY Close, then off-hours monitor
```

---

## 6. How — End-to-End Flow

### 6.1 Session startup (`tools/session_start.cjs`, 352 lines)
1. Create `shared/<DATE>/<PAIR>/` for the 5 pairs.
2. Verify TV Desktop CDP on `http://127.0.0.1:9222`; relaunch TV with `--remote-debugging-port=9222` if down; require an open chart tab (hard exit otherwise).
3. For each pair × 7 TFs: switch symbol via `TradingViewApi…setSymbol` (verifies/retries), pull last 400 bars → `candles_<tf>.json`.
4. Run the SMC engine per pair×TF: `npx tsx tools/smc-engine/src/cli.ts … --mode full` → `engine_<tf>.json`.
5. NY-lunch carry-forward → `prev_lunch_inefficiency.json`.
6. Forecasts: `python tools/forecast.py` for 5m (pred 24) + 1m (pred 48).
7. Mirror XAUUSD data into `shared/<DATE>/GOLD/` (pipeline reads GOLD/).
8. Print a ready-state summary with per-step failure counts.

### 6.2 The pipeline (`tools/run_pair.cjs`) — stage order & inputs/outputs
```
0  Session tracer start            → shared/<DATE>/traces/<PAIR>_trace.jsonl
1  Graph memory (trade_graph)      → stages/00_macro_context/output/{pair}_memory.md
2  Weekly profile engine           (weeklyAnchor)
3  One Trade Setup                 (firstOpp.directionBoost)
4  Bread & Butter                  (bnb)
5  Time & Price Grid               (chain of custody facts)
6  High Precision Secrets          (tethering, post-9:01 lock)
7  Soft-Open guard                 (softOpenFact)
8  PD Array Matrix                 (pda)
9  MMXM engine                     (mmxm)
10 STAGE 00 macro_context.cjs       → cycle_phase.md, day_context.md, model_filter.md
11 Load engine_{1w..1m}.json        (hard exit if 1d/4h/1h missing)
12 Cycle weights                    (phase → per-model multiplier)
13 Live structure check (4h/1h)     advisory
14 SL monitor check (check_sl.cjs)  advisory
15 Forecasts (forecast.py)          → forecast_{5m,1m}.json
16 STAGE 01 HTF bias                → 01_htf_bias/output/{pair}_bias.md (resolveBias + nextDraw)
17 STAGE 02 Key levels (ob_grading, irl_erl, liquidity_marker, IFVG) → 02/output/{pair}_levels.md
18 STAGE 03 Session (opening_range, order_flow, ny_time gate) → 03/output/{pair}_session.md
19 Lecture setups (lecture2/1/4)    in-memory (time-window detectors)
20 Inducement check (15m)           per-model gate
21 STAGE 04 Model selection
     - legacy 17-model scoring (shadow only)
     - cycle/PO3/weekly/one-trade/high-precision/body-defense multipliers
     - WP-8 registry: runRegistry(registryCtx)  ← DECISION AUTHORITY
     → 04/output/{pair}_active_models.md
22 STAGE 05b Micro confirmation (micro_context, fractal_mmxm, priority2,
     invalidation, coherence_audit) → 05b/output/{pair}_{coherence,micro_cycle,
     trigger_check,invalidation,guard,fractal_mmxm}.md
23 PRICE FRESHNESS GUARD            freshnessScore (0–10), label "DANGER" < 3
24 STAGE 05 Entry refinement
     - real ATR-14, 3rd-candle OTE, fib OTE
     - cascadingEntry(): SL cascade 15m→1H→4H→1D + draw targets (no-draw → NO TRADE)
     - WP-8 registry gate: no complete model → zeroed plan
     - SB scalp override, lecture 2/1/4 overrides, HP TP2 extension
     - IOFED pyramid, IFVG pyramid
     → 05/output/{pair}_entry_plan.md
25 STAGE 06 Risk (risk_tracker --check, 1% sizing) → 06/output/{pair}_risk_plan.md
26 STAGE 07 Journal summary          → 07/output/{pair}_review.md
27 Narrative (unified coherence; invalidation zeroes it)
28 Graph sync (ict_continuous_learn --extract + trade_graph rebuild)
29 EVALUATION (run_evaluation.cjs)   → verdict (PASSED/CAUTION/DEGRADED/BLOCKED)
30 DECISION EMIT
     - build decision object + missed_entry assessment
     - atomic write → shared/<DATE>/<PAIR>/decision.json
     - spawn detached LLM setup_auditor (audit-only, never gates)
```

### 6.3 The decision object & hard gates
`decision.json` fields: `registry, entry{type,price,sl,tp1,tp2,noDrawDir,slReason}, rr, coherence, invalidation, guard, freshness, risk, evaluation, conflicts, sizing{qty}, gates, missedEntry`.

| Gate | Source | Blocks when |
|---|---|---|
| Registry | `models/registry.cjs` | 0 or ≥2 complete models → NO TRADE |
| Guard | `cross_system_guard.cjs` | `JUDAS_SWING`, `NY_CLOSE`, `OFF_HOURS`, `INVERSION_MISSING` (reducers: lunch ×0.5, Monday ×0.75, Friday ×0.5…) |
| Invalidation | `invalidation.cjs` | `overallStatus === INVALIDATED` (zeroes coherence) |
| Freshness | in-code | `freshnessScore < 5` (label DANGER < 3) |
| Risk | `risk_tracker.cjs --check` | day ≥ 3% or week ≥ 5% loss |
| No-draw | `cascadingEntry()` | no BSL/SSL draw meeting min R:R |
| R:R | computed | `rr1 < 1.0` (0.75 floor for intraday in auto mode) |
| Evaluation | `run_evaluation.cjs` | resilience critical failure / BLOCKED |

### 6.4 Execution choke point (`tools/auto_decision.cjs`)
Consumes `decision.json` and requires: verdict `SETUP COMPLETE`, a primary model, LONG/SHORT with positive price/SL/TP1, no `noDrawDir`, R:R ≥ minimum, guard not blocked, freshness ≥ 5, risk allowed, evaluation not blocked, and the decision is **< 15 minutes old**. This single gate sits in front of every execution path.

### 6.5 Order placement (`tools/tv-mcp/market_order.cjs`)
Pure CDP DOM automation against the TradingView chart page:
1. `setSymbol("OANDA:XAUUSD", {})` (syncs chart + trading panel; keyboard typing does not).
2. Click `buy/sell-order-button`; select Market; fill quantity by DOM label.
3. Fill SL/TP (fields are intentionally mapped — **TP at lower ref `refs[0]`, SL at higher `refs[1]`**; a documented bug fix).
4. Click `place-and-modify-button`, then **verify the order appears in the Positions table** (4 retries × 3 s).
5. Screenshot → `shared/screenshots/`; failures logged to `error_log.jsonl`. Exit: 0 verified · 1 fatal · 2 placed-but-unverified.

Symbol mapping: EURUSD→`OANDA:EURUSD`, GBPUSD→`OANDA:GBPUSD`, XAUUSD/GOLD→`OANDA:XAUUSD`, NAS100→`CAPITALCOM:NAS100`, DXY/USDOLLAR→`FX:USDOLLAR`.

**Operational note:** `intel_monitor` and `market_order` both drive the chart and fight for control — kill `intel_monitor` (targeted PID) before placing orders.

### 6.6 Monitoring & alerting
- **`intel_monitor.cjs`** — live structure monitor; self-rescheduling ~2 s/cycle, 4-pair rotation (~20–25 s). Detects CHoCH/BOS, liquidity sweeps, session windows, 5 model triggers, entry score /10 (🔥≥7, 👀≥4), forecast alignment, HTF divergence. Writes high-scoring setups to `shared/monitor/setups.jsonl`.
- **`session_monitor.cjs`** — every 60 s; alerts `TP_CLOSE` (<15% of risk to TP), `SL_WARNING` (<25% to SL), `TP_IMMINENT` (<5%); writes `session_state.json` + `monitor_log.jsonl`. **Caveat:** it only ticks during NY 02–05 (London KZ), despite "runs ALWAYS" comments.
- **`discord_bot.cjs`** — 23 slash commands; a 60 s scheduler fires window alerts (London KZ 02:00, NY AM 08:00, briefing 08:30, SB AM 10:00, lunch 11:00, SB PM 14:00, close 15:30); polls `setups.jsonl` for score ≥7; file-watch bridge via `discord_push.cjs`; webhook embeds from autonomous drivers.
- **Logs:** `error_log.jsonl` (logger.cjs), `decision_journal.md` (decision_log.cjs), `qa_log.md`, `auto_scheduler_log.jsonl`, `monitor_log.jsonl`, `start_auto.log`, session traces (`shared/<DATE>/traces/`).

### 6.7 Memory & learning
- **Graph** (`tools/trade_graph.cjs`): typed nodes (`trade:`, `pair:`, `model:`, `session:`, `lesson:`, `gap:`, `concept:`, `playbook_rule:`) and edges (`ON_PAIR`, `USED_MODEL`, `IN_SESSION`, `GENERATED_LESSON`, `LESSON_RELATES_TO`, `USED_CONCEPT`, `HAS_GAP`, `GAP_BLOCKS_CONCEPT`, `SIMILAR_TO`). Rebuilt from taxonomy + journal meta + review files + performance lessons + trade_log + playbook. Current: 51 trades, 45 lessons, 2 gaps, 138 concepts, 1,308 edges.
- **Injection:** `memory_injector.cjs` → `{pair}_memory.md` (similar trades, active lessons, failure patterns, model stats). LLM side: `tools/llm/memory_lessons.cjs` loads the same data into prompts.
- **Learning loop:** `ict_continuous_learn.cjs --extract` reads journal files + forecast tracking → lessons → `shared/performance/lessons_{pair}_{date}.json` → deduped additions to `references/playbook/current.md` → `--run` rebuilds the graph. `--deep-analyze` runs the LLM `journalAnalysis` prompt (falls back to stats if LLM unavailable).
- **RAG:** `ict_rag.cjs --query` → TF-IDF + cosine (tier-boosted, exact-phrase bonus) over 1,621 chunks; `--synthesize` adds an LLM pass.

### 6.8 Evaluation
`evaluation/run_evaluation.cjs` runs 4 modules per pair and appends to `evaluation/eval_ledger.jsonl`:
1. **Resilience** (`corrupt_detector.cjs`) — price-range sanity, SL/TP inversion, data aging, session/lunch gates. Critical failures hard-block.
2. **Output Quality** (`output_quality.cjs`) — ~29 expected files per pair: existence, min bytes, placeholders.
3. **LLM Judge** (`llm_judge.cjs`) — 5-dimension rubric (directional 30, ICT adherence 25, reasoning 20, actionability 15, completeness 10); currently falls back to **rule-based** scoring.
4. **Bias Accuracy** (`bias_accuracy/scorer.cjs`) — directional calls vs actual 1m movement; appends rolling stats.
5. Session trace finish.

### 6.9 LLM audit layer (2026-08-11)
- `setup_auditor.cjs` — detached after decision emit; ReAct agent with 3 sandboxed tools (`read_file` restricted to `stages|_config|shared|tools/llm`, `query_trade_graph`, `query_ict_knowledge`); emits `ALIGNED / CHALLENGED / UNABLE` + confidence + evidence + counter-evidence + recommendations → `shared/<DATE>/<PAIR>/setup_audit.{json,md}`. **Never gates.**
- All 6 prompts embed the mandatory CoT chain (HYPOTHESIS → EVIDENCE → COUNTER-EVIDENCE → VERDICT).
- `ict_decision_validator.cjs --edge <PAIR>` — self-consistency voting (3 runs, temp 0.7) on grey-area rulings.
- Provider resilience: retries without tools if the provider rejects tool calls (Gemini thought-signature quirk), strict-JSON re-ask, graceful `llm_unavailable` records.

### 6.10 Backtest
- `backtest_runner.cjs` — offline batch replay over `shared/{date}/{pair}/engine_*` (signal = `bias ≠ neutral AND swept > 0`); writes `shared/backtest/batch/…` + `performance_summary.md`.
- `backtest_distill.cjs` — parses batch journals → signal rates, bias distribution → playbook candidates → `performance_ledger`.

---

## 7. Verified Live Example (2026-08-11, EURUSD)
- Registry verdict `SETUP COMPLETE`, primary `2FVG Entry`.
- SHORT @ 1.15416, SL 1.15599 (15m swing + ATR), TP1 1.150445, RR1 2.03.
- Freshness 5/10 (data age ~78 min — stale-ish), risk allowed, evaluation `PASSED`.
- **Guard blocked (1): `INVERSION_MISSING`; invalidation `INVALIDATED`** → gates `notGuardBlocked:false`, `notInvalidated:false`. The auto-trade gate would (correctly) refuse to execute this. This is the fail-closed design working as intended.

---

## 8. Known Issues, Risks & Caveats

1. **Pre-existing test failures:** `tests/models_registry.test.cjs` fails 3 assertions — registry now holds 20 models but the test expects 17; IFVG Scale-In lacks a DoD fail-case override. Unrelated to the LLM work. (`npm test` → 141 tests, 3 fail.)
2. **Date partition is UTC, not NY.** Scheduler/monitor state continues to be written under `shared/2026-08-10/` for events occurring on the 11th — the trading day lags the UTC date boundary. Risk of mismatched daily risk accounting at the NY day rollover.
3. **`session_monitor.cjs` only ticks during NY 02–05** despite its "runs ALWAYS" banner — London-KZ-only SL/TP alerts.
4. **`intel_monitor` vs order placement conflict** (both drive the same chart) — documented operational kill-order.
5. **Evaluation is advisory at decision level**, and recent grades are weak: output quality ~55/100 (most stage files flagged as placeholders because they are small), bias-accuracy rolling accuracy ~0% over 241 entries. The LLM judge is running rule-based, not model-based.
6. **Free-tier LLM limits:** Gemini free quota (429 during testing); Groq's 8K-token cap is too small for full prompts. Keys are present for gemini/cerebras/groq/openrouter in `.env`.
7. **No OS Task Scheduler entry** — only the Startup `.cmd`. A reboot with the script disabled = no scheduler.
8. **`session_start.cjs` hardcodes `ROOT`** (`C:\Users\cash\smc-icm-trading`) unlike the modules honoring `WORKSPACE_ROOT`.
9. **`auto_scheduler` executes trades only with `--execute`**; the default launcher passes `--refresh` then the scheduler mode decides. Verify desired mode at logon.
10. **Old date dirs accumulate** (15 so far, plus candles/engines per pair per day) — no retention policy observed.

---

## 9. Command Reference

```bash
# Startup + analysis
node tools/session_start.cjs                 # full data refresh (TV CDP → candles → engines → forecasts)
node tools/run_pair.cjs EURUSD               # full pipeline → decision.json
node tools/ny_time.cjs --full                # DST-aware NY session context

# Execution (all gated via auto_decision)
node tools/tv-mcp/market_order.cjs EURUSD SELL 1.13950 1.13750 10000
node tools/tv-mcp/check_orders.cjs           # verify positions/orders
node tools/tv-mcp/clean_slate.cjs            # clear drawings + cancel orders

# Autopilot
node tools/start_auto.cjs --refresh          # spawn scheduler + monitor + discord
node tools/auto_scheduler.cjs --execute      # day scheduler (place mode)
node tools/tv-mcp/ny_am_autonomous.cjs       # NY AM → SB phase driver

# Memory / learning
node tools/memory_injector.cjs GBPUSD        # graph context → {pair}_memory.md
node tools/trade_graph.cjs --rebuild         # rebuild graph from all sources
node tools/trade_graph.cjs --query GBPUSD    # failure patterns
node tools/ict_continuous_learn.cjs --run    # lessons → playbook → graph sync

# Knowledge
node tools/ict_rag.cjs --query "silver bullet inducement"

# Validation / audit
node tools/ict_decision_validator.cjs --validate EURUSD
node tools/ict_decision_validator.cjs --edge EURUSD
node tools/llm/setup_auditor.cjs EURUSD      # audit-only LLM second opinion
node tools/llm/setup_auditor.cjs EURUSD --dry-run

# Evaluation
node evaluation/run_evaluation.cjs XAUUSD
node evaluation/regression/suite.cjs
npm test                                     # node --test tests/*.test.cjs
```

---

## 10. Appendix — Authority Chain (one-line version)

> **TIME (killzone multiplier) → PRICE (weighted bias, 6 sources) → GATE (inducement swept) → MODEL (one complete registry model) → COHERENCE (worst dimension wins) → EXECUTION (all gates clear).** Deterministic engine decides; evaluation grades; the LLM audits. Nothing outside the deterministic gate may ever place an order.
