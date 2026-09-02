# SMC-ICM Trading System — Full System Audit (ICT 35-Year Lens)

> *"I've trained traders for three decades. The ones who make it aren't the smartest — they're the ones who can answer one question honestly: Do I have an edge? Everything else is noise."*
>
> Audit date: 2026-08-12 · Auditor: ICT (35-year veteran lens) · Workspace: `C:\Users\cash\smc-icm-trading`

---

## WHY — The Question That Must Be Answered First

### Why does this system exist?

The README, CLAUDE.md, and 60+ modules tell a story: detect institutional manipulation, time entries to killzones, execute with discipline. But after reading every performance file, every lesson file, every backtest summary — I need to ask the harder question:

**Why has this system executed exactly ONE trade in its entire operational history?**

That one trade (GBPUSD, July 29, NY Lunch override, Breaker Block Scalp) was a system test. It lost. Since then: zero executions. Thousands of analysis cycles. Sixty-plus lesson files, every single one empty (`"lessons": []`, `"trade": null`). A model performance ledger that reads `Edge Score: NaN/100`. An evaluation pipeline with 374 entries, virtually all `BLOCKED — do not trade`.

This isn't a trading system. It's a **market analysis engine that has been mislabeled as a trading system.** The distinction matters because a market analyst gets paid to be right; a trader gets paid to manage being wrong. This system does the former brilliantly and has never been asked to do the latter.

**The honest answer to "why does this system exist?" is: to analyze, not to trade. That's fine — but the auto-scheduler, the execution gate, the market_order CDP automation, the MT5 bridge — all of it is armor on a machine that never leaves the barracks.**

### Why was the WP-8 registry written as a boolean state machine?

The Jul 18 audit flipped the model scoring system from ranked scores to boolean gates. The rationale was sound: "gates over multipliers." A model either completes or it doesn't. No partial credit.

But the *implementation* created a problem nobody spotted: the registry is now a **precision instrument with no recall.** It's so strict that exactly-1-complete almost never happens during tradeable sessions. On Aug 11: three NO TRADEs from ties, one SETUP COMPLETE that was guard-blocked. On Aug 12 (today): same pattern.

**The boolean gate philosophy is correct. The tie rule is correct. But the SYSTEM that feeds these gates — the facts about sweeps, MSS, FVGs, OBs — is running on stale data 80% of the time. You're asking boolean gates to make decisions on fuzzy, aged inputs. That's like using a surgical scalpel to operate in the dark.**

### Why does the learning loop produce zero lessons?

`ict_continuous_learn.cjs` is well-architected. It reads journal files, extracts patterns, deduplicates, syncs to the playbook. But it only runs on trades. No trades = no journals = no lessons = no playbook evolution. The loop is **starved of input.**

A 35-year trader learns more from the trades they DON'T take than the ones they do. Every day the system says NO TRADE, it should ask: was I right to stay out? Did price actually move toward any of the completed model targets? If Silver Bullet would have won and 2FVG would have lost, the tiebreaker needs to know that.

---

## WHAT — What This System Actually Is (vs. What It Claims to Be)

### What it claims to be
An autonomous SMC/ICT trading platform that detects manipulation, times entries to killzones, and executes paper trades via TradingView CDP.

### What it actually is
A **deterministic SMC structure analyzer** with:
- 7-timeframe engine reports per pair (the real product)
- A 17-model registry that serves as a quality filter (mostly filtering to NO TRADE)
- 60+ analysis modules producing markdown reports (the real output)
- An execution layer that has fired once in operational history
- A learning loop that has never learned because there's nothing to learn from
- An evaluation system that grades itself 55/100 daily and calls it BLOCKED

### What's genuinely impressive
1. The SMC engine (`smc-engine/`) is solid. Structure, liquidity, OB, FVG detection across 7 TFs is correct ICT methodology.
2. The NY time engine (`ny_time.cjs`) is DST-aware and correctly models killzones, Silver Bullet windows, and session multipliers.
3. The WP-8 registry architecture is conceptually sound — boolean gates, direction-aware confluence, fail-closed.
4. The CDP automation for TradingView is real engineering — `market_order.cjs` with DOM verification, symbol mapping, screenshot capture.
5. The data pipeline (`session_start.cjs` → candles → engines → forecasts) works reliably when TV is up.

### What's missing
1. **A measurable edge.** The only backtest with real results (May-June GBPUSD, 61 days) shows -0.07R expectancy. The "100% win rate" in the model ledger is from a trivial signal (`bias ≠ neutral AND swept > 0`) that would generate hundreds of low-quality entries.
2. **A feedback loop that changes behavior.** The system evaluates itself daily, always finds itself BLOCKED, and never adjusts its thresholds to become tradeable.
3. **A relationship between analysis and action.** The system produces encyclopedic markdown reports for every pair × session, then walks away. The analysis has no consumer except the human reading the markdown.

---

## WHEN — The Time Problem

### When does the system actually trade?

Never, effectively. The gates are too tight for the data quality available.

- **Freshness gate**: requires candles < 30 min old. The auto-scheduler refreshes at scheduled windows. Between windows, data ages and the gate closes. The window refresh timing vs. gate timing is mismatched.
- **Inversion gate**: requires sweep + CHoCH + FVG on 1m. All three must coincide. In practice, they coincide for maybe 15-30 minutes per session, and the scheduler might not scan during that exact window.
- **R:R gate**: requires RR1 ≥ 1.0. With ICT-correct SL placement (structural swing + ATR buffer), many setups fail this because the SL is properly wide.

**The gates are individually reasonable but collectively impossible to satisfy with the current scan cadence.** It's like requiring a photograph of lightning — the camera has to be pointed in the right direction at the exact right millisecond.

### When should the system trade?

ICT teaches that there are 2-3 high-probability windows per day:
- London Killzone (02:00-05:00 NY): 1-2 setups
- NY AM Killzone (08:00-11:00 NY): 1-2 setups
- NY PM Silver Bullet (14:00-15:00 NY): 0-1 setup

That's 3-5 tradeable moments per day across 4 pairs = 12-20 opportunities. The system should be taking 3-8 trades PER WEEK to have statistical significance. It's taking zero.

### When does data go stale and why does it matter?

The session_start runs once at logon. The scheduler refreshes at scheduled windows (~every 60-120 minutes). Between refreshes, candles age. The `DATA_STALE` resilience check fires at 30 minutes. This means the system is only "tradeable" for about 15-20 minutes after each refresh — the rest of the time it's in evaluation-only mode.

**The irony: the system refreshes data at 09:45 (PRE_MACRO) and the NY Macro scan at 09:50 — the highest conviction window — has 5 minutes of fresh data before the gate starts degrading. By 10:20, the Silver Bullet window is still active but data is 35 minutes stale and BLOCKED.**

---

## WHERE — The Architecture's Blind Spots

### Where is the intermarket analysis?

DXY bias appears in narrative text but is NEVER a hard gate. The `cross_system_guard.cjs` has no `DXY_DIVERGENCE` check. EURUSD can produce a SHORT setup while DXY is bearish (which would imply dollar weakness → EURUSD should go UP, not down). This is ICT Day 1 material — the dollar is the denominator.

### Where is the correlation gate?

EURUSD and GBPUSD are 80%+ correlated. The system can produce SETUP COMPLETE on both simultaneously in the same direction — which is doubled dollar exposure. The trading rules say "max correlated exposure 2%," but the gate doesn't prevent BOTH from firing. The auto-scheduler picks the "best" by coherence + R:R, but both decision.json files exist.

### Where is the news calendar integration?

`economic_calendar.py` exists and scrapes ForexFactory. But the scheduler has NO pre-news gate. If NFP is at 08:30, the 08:30 Lectures_1_4 scan will run and could produce a trade 2 minutes before the biggest news event of the month. ICT's "One Shot One Kill" rules are documented but not wired to the scheduler as a hard block.

### Where does the system actually place orders?

`market_order.cjs` uses CDP to click TradingView DOM buttons. This works on paper but:
- It requires `intel_monitor` to be killed (fights for chart control)
- It requires the TradingView chart to be on the correct symbol and timeframe
- It has no broker API fallback — if TV Desktop crashes, execution is dead
- The MT5 bridge exists but is a separate, manually-started process

### Where are the positions tracked after entry?

`session_monitor.cjs` tracks SL/TP proximity, but only during London KZ (02-05 NY). If a trade is placed during NY AM, there's no automated monitoring after 05:00 NY. The position just... sits there. The `position_monitor.cjs` exists but isn't automatically spawned by the scheduler.

---

## HOW — The Mechanics That Matter

### How does the system measure its edge?

It doesn't. Not honestly.

- `model_stats.md`: "Edge Score: NaN/100" — the system cannot compute its edge
- `session_stats.md`: 1 real trade, 0% win rate
- `pair_stats.md`: 91 trades, 98.9% WR — but 90 are backtest-lite with a trivial signal
- `eval_ledger.jsonl`: 374 entries of "BLOCKED" or "CAUTION"
- Backtest: -0.07R expectancy on the only real measurement

**A trading system that doesn't know its edge is not a trading system. It's a hope.**

### How does the system improve over time?

It doesn't. The learning loop requires trades to learn from. No trades = no lessons. Each day is a fresh start with the same parameters, the same gates, the same thresholds. The system has no mechanism to say "the inversion gate is too strict, here's evidence, let's adjust the threshold" or "the freshness gate at 30 minutes is blocking 80% of opportunities, let's calibrate."

**Adaptive thresholds don't exist in this codebase.** Every magic number is in `engine_config.cjs` and changes require manual edits. The system is static. Markets are dynamic. This is a fundamental mismatch.

### How does the backtest relate to live trading?

It doesn't. The backtest signal (`bias ≠ neutral AND swept > 0`) is trivial and would never pass the live registry. The live registry's signal (exactly 1 complete model from 17, with 3-5 gates each) has never been backtested because you can't replay the registry over historical data without the full engine reports for all 7 timeframes.

**The backtest and the live system measure different things. The backtest says "signals exist." The live system says "none are good enough." Neither is calibrated to the other.**

### How does a trade actually get placed?

The full chain is:
```
session_start → candles → engines → forecasts
→ run_pair.cjs (28 stages) → decision.json
→ auto_decision.gate() (8 checks, decision < 15 min old)
→ market_order.cjs (CDP DOM clicks)
→ verification (4 retries, positions table check)
→ screenshot → session_monitor (only London KZ)
```

At least 6 different processes must be running. At least 3 files must exist per pair. TV Desktop must have a chart tab open. CDP port 9222 must be reachable. `intel_monitor` must NOT be running. The account must be logged in. The symbol mapping must be correct.

**The probability of all these conditions being simultaneously true is low enough that in operational history, it has happened exactly once — during a manual test.**

---

## THE FIVE QUESTIONS — Answered Honestly

### WHY does this system exist?
**The stated answer**: To detect institutional manipulation and trade it with discipline.
**The honest answer**: To convert ICT theory into deterministic code. Trading is the aspiration; analysis is the achievement. The system is a PhD student who has read every paper but never defended the thesis.

### WHAT does it actually do?
Produces encyclopedic SMC structure reports. 7 timeframes × 4 pairs × multiple sessions daily = hundreds of markdown files. The engine reports (`engine_*.json`) are the real product — accurate, deterministic, ICT-correct. Everything downstream of the engines is consuming quality inputs and producing blocked decisions.

### WHEN does it operate?
Continuously, but tradeably for ~15-20 minutes after each scheduler refresh. The rest of the time it's a monitoring and evaluation system. The auto-scheduler runs 24/7 but the execution gate is open for roughly 60-90 minutes total per day.

### WHERE are the gaps?
1. No intermarket gate (DXY divergence)
2. No correlation gate (EURUSD + GBPUSD same direction)
3. No news calendar integration in the scheduler
4. Position monitoring only during London KZ
5. No broker API redundancy (CDP-only execution)
6. Static thresholds with no adaptive calibration
7. Backtest and live systems measure different signals
8. Learning loop starved of input

### HOW would a 35-year veteran fix this?

**First — Accept what the system is.** You have built an exceptional SMC analysis engine. The engines, the structure detection, the liquidity marking, the time-price grid — this is quality work. But it's an analyst, not a trader. Stop trying to make it trade until it proves it can pick direction better than random.

**Second — Run a shadow for 30 trading days.** Let the registry run, let it produce SETUP COMPLETE verdicts, but log what WOULD have happened if you took every single one. Track: entry price, direction, actual outcome after 1 hour, 4 hours, end of day. After 30 days you have a REAL edge measurement, not a backtest on a trivial signal.

**Third — Trade the shadow results manually.** If the shadow shows 55% directional accuracy with 1.5:1 average R:R over 30 days, you have a 0.38R expectancy. NOW you can turn on execution. Not before.

**Fourth — Fix the low-hanging fruit:**
- Wire DXY as a hard gate: EURUSD/GBPUSD long + DXY bullish = BLOCK
- Add correlation check: if EURUSD and GBPUSD both SETUP COMPLETE same direction, take only the higher coherence one
- Extend `session_monitor.cjs` to cover all trading hours, not just London KZ
- Make freshness gate dynamic: 30 min in killzone, 60 min in regular session, 120 min in off-hours

**Fifth — Feed the learning loop with shadow data.** Even if you don't execute, log what the registry said, what happened, and whether the model was right. The lessons become real. The playbook evolves. The tiebreaker gets calibrated. The system actually improves.

---

## VERDICT

| Dimension | Grade | Notes |
|-----------|-------|-------|
| SMC Engine accuracy | **A** | Correct ICT methodology, structure/liquidity/OB/FVG detection is solid |
| Time model | **A** | DST-aware, killzone-correct, session multipliers appropriate |
| Registry design | **B+** | Boolean gates are the right philosophy; tie rule is correct; killzone primacy now fixed |
| Execution reliability | **D** | CDP-only, single point of failure, requires 6+ processes aligned |
| Edge measurement | **F** | NaN/100 on model stats; backtest and live measure different things |
| Learning/adaptation | **F** | 60+ empty lesson files; static thresholds; no feedback loop |
| Risk management | **B** | 1% per trade, 3% daily, structural SL placement — correct but untested at scale |
| Operational robustness | **C-** | TV crash kills everything; stale data blocks 80% of windows; no redundancy |
| Honesty of evaluation | **B+** | Says BLOCKED rather than fabricating confidence — but never asks "are the thresholds right?" |

**Overall: The system is a Grade-A SMC analysis engine with a Grade-D trading execution layer bolted on. The analysis is worth keeping. The execution should be disabled until the analysis proves it has an edge through 30 days of shadow tracking.**

---

> *"In 35 years I've learned one thing that matters more than any setup or model: the market doesn't care what you think. It only cares what you do. Your system thinks beautifully. It does almost nothing. That's not a failure of the code — it's a failure of the design to bridge the gap between analysis and action. Fix that bridge with shadow data, not more gates."*
>
> — ICT

---

## POSTSCRIPT — Deep Dive: Learning & Evaluation Systems

*This section added after deep inspection of `trade_graph.json`, all 64 lesson files, `ict_continuous_learn.cjs`, `evaluation/run_evaluation.cjs`, `llm_judge.cjs`, and `memory_injector.cjs`.*

### The Trade Graph Contains Zero Trades

`shared/trade_graph.json` is 296 KB with 1,308 edges. It contains **55 trade nodes.** Every single one has:

```json
{"outcome": "no_trade", "pnl": 0}
```

There are zero winners. Zero losers. The `findFailurePatterns` function — which is the core learning mechanism — scans for losses to group by model×session. It returns empty every time because there are no losses to analyze. The `buildInjectionContext` function that feeds the `memory_injector` tries to surface "similar past trades" and "failure patterns" — but since every trade has the same outcome (no_trade) and same PnL (0), similarity matching returns noise.

**The graph is a beautifully structured database of nothing.**

### Every Lesson File Is Empty

64 lesson files across all pairs and dates. Every single one:

```json
{"trade": null, "lessons": [], "gaps": [], "conceptsUsed": [], "ruleViolations": []}
```

The extraction pipeline (`ict_continuous_learn.cjs`) uses regex to parse journal markdown files for numbered lessons. No trades → no journals → no text matches → empty lessons. The pipeline is well-designed but starved. It's a car with no fuel.

### The Playbook Never Evolves

`references/playbook/current.md` has 5 rule blocks. `ict_continuous_learn.cjs` has deduplication logic and `--run` appends new candidates. But with zero extracted lessons, the playbook is frozen at its initial state. The "continuous" in `ict_continuous_learn` is aspirational — the learn rate is literally zero.

### The Evaluation System Has an Honesty Gap

The evaluation pipeline runs 4 modules and produces verdicts. After deep inspection of `eval_ledger.jsonl`:

- **Resilience**: Catches real problems — stale data, corrupt prices, SL/TP inversions. **Grade: A for honesty.**
- **Output Quality**: Scores ~55/100 (D-grade) on every run. All 29 stage files flagged as "degraded" because they contain placeholder text patterns. **Grade: C — it sees the problem but nobody acts on it.**
- **LLM Judge**: Never actually calls an LLM. Falls back to regex-based pattern matching that gives every entry **83/100 (B-grade)**. The "judge" checks for keyword presence ("Bias", "Multi-TF Cascade", ICT concept names) and stage counts. It's a regex counter, not a judge. **Grade: F for misrepresentation.**
- **Bias Accuracy**: Rolling accuracy across all pairs is **0.0%** over 241 entries. Every single directional call was wrong. This is the most honest metric in the system — and it's screaming that the directional bias engine has NO predictive power. **Grade: A+ for brutal honesty; the system is telling you it can't call direction.**

The verdict logic has a permissive gap: a module can have D-grade content quality and 0% bias accuracy but still "pass" because resilience is the only hard-block module. The overall score averages 85/100 while the content is 55/100 and the bias is 0%.

### The Memory Injector Writes Advice Nobody Reads

`memory_injector.cjs` writes a markdown file to `stages/00_macro_context/output/{pair}_memory.md` containing "ghost trades" and "failure patterns." This file is read by... nobody programmatically. It's designed to be read by the human or by Claude during interactive analysis. There is no code that parses it back, no A/B test measuring whether injection improves decisions, no feedback mechanism.

### The Critical Insight: Logging Is Not Learning

The system confuses *recording* with *improving*. It has:
- A trade graph (rich, typed, queryable)
- A lesson extractor (regex-based, deduplicating)
- A playbook appender (markdown-based)
- A memory injector (context-building)
- An evaluation pipeline (4 modules, scored)

All five produce **terminal artifacts** — files written to disk that are never consumed by any other code module. They're museum pieces. The system writes its own history but never reads it back to change its behavior.

**The learning loop is: Record → Write → File → (nobody reads it) → No behavior change → Record again.**

A real learning loop would be: Record → Analyze → **Adjust thresholds** → Different behavior → Record → Compare → Adjust again. Until there's a line of code that says something like `CONFIG.inversion.minScore = computeOptimalThreshold(last30Days)`, there is no learning — only logging.

### The LLM Layer Is a Mannequin

`tools/llm/` contains 5 files with 6 prompt templates, a 7-provider client, and a ReAct agent loop. It's architecturally sophisticated. But:
- `setup_auditor.cjs` runs detached after decision emit and writes `setup_audit.{json,md}` — another terminal artifact
- `llm_judge.cjs` never calls an LLM; it uses regex fallback 100% of the time
- The LLM is explicitly "audit-only" — it can never block, modify, or suggest a trade

The LLM is a passenger in a car that never drives. It has a seatbelt, a map, and excellent commentary — but the steering wheel is bolted to the dashboard.

---

## REMEDIATION — All Fixes Applied (2026-08-12)

### Round 1: CRITICAL (5 fixes)

| # | Gap | Fix | File(s) |
|---|-----|-----|---------|
| 1 | MMXM step "undefined/4" on every pair | MMXM step gate: classifies cycle position from 4H/1H engine data BEFORE registry. Step 1-2 → NO TRADE, Step 3 → RUN, Step 4 → SCALP ONLY, Step 5 → NO TRADE | `run_pair.cjs`, `fractal_mmxm.cjs`, `registry.cjs` |
| 2 | Tie rule ignores killzone context | Killzone primacy: models with ACTIVE time windows beat always-on models in ties. Silver Bullet in SB window = automatic primary. | `registry.cjs` `tieBreak()` |
| 3 | Inversion scored like a quiz (4/8 threshold) | Inversion as sequence gate: SWEEP + CHoCH + FVG must all pass. Alignment and displacement are quality modifiers, not blockers. | `fractal_mmxm.cjs`, `cross_system_guard.cjs` |
| 4 | Risk tracker corrupts balance to NaN | `Number()` coercion on balance + peakBalance before arithmetic. Prevents string concatenation bug after first logged trade. | `risk_tracker.cjs:157` |
| 5 | Session monitor blind outside London KZ | Extended from 02:00-05:00 to 01:00-20:00 NY. Dead zone only 20:00-01:00. Positions now monitored in NY AM, PM, and lunch. | `session_monitor.cjs` |

### Round 2: HIGH (4 fixes)

| # | Gap | Fix | File(s) |
|---|-----|-----|---------|
| 6 | No news gate in execution chain | auto_decision checks `today_events.json` for high-impact events within 30 min. Auto-fetches from ForexFactory if missing. Blocks with `news: <event> at <time>`. | `auto_decision.cjs` |
| 7 | Intel monitor loads data once, never refreshes | Engine data + forecasts now refresh every ~5 min (150 cycles). CDP auto-reconnects after 3 consecutive failures. | `intel_monitor.cjs` |
| 8 | Wrong-symbol data corruption on failed setSymbol | Failed symbol switch now SKIPS the pair entirely. Price-range sanity check rejects candles outside valid bounds before writing. | `session_start.cjs` |
| 9 | Position limit never enforced (max 2 positions) | auto_decision reads `trade_log.json`, counts OPEN positions, blocks when ≥ 2. | `auto_decision.cjs` |

### Round 3: MEDIUM (4 fixes)

| # | Gap | Fix | File(s) |
|---|-----|-----|---------|
| 10 | Config SB times wrong (13:00-15:00 UTC for 1-hour window) | Fixed to 14:00-15:00 UTC (EDT). Added DST note, NY local time column, and cross-reference to ny_time.cjs as canonical source. | `_config/session_preferences.md` |
| 11 | Hardcoded `C:\Users\cash\smc-icm-trading` paths | Fixed in 6 critical-path files to use `WORKSPACE_ROOT || path.resolve(__dirname, "..")`. Remaining 51 files are standalone tools. | `refresh_data.cjs`, `cross_system_guard.cjs`, `fractal_mmxm.cjs`, `session_start.cjs` |
| 12 | No duplicate order prevention | Idempotency guard: logs placement intent before execution, checks for identical pair/side/SL within 60 seconds, exits with DUPLICATE if found. | `market_order.cjs` |
| 13 | LLM judge never calls an LLM | Now attempts Gemini → Groq → OpenAI → Anthropic with 15s timeout. Falls back to rule-based with honest mode label: `rule-based-fallback(provider-failed)` or `rule-based(no-llm-key)`. | `evaluation/judge/llm_judge.cjs` |

### Additional Infrastructure

| Item | Description | File |
|------|-------------|------|
| Shadow backtest | Tracks hypothetical outcomes for EVERY completed model on NO TRADE days. After 20+ days, feeds tiebreaker weights into registry. | `tools/shadow_backtest.cjs` |
| DXY intermarket gate | Hard-blocks forex trades when pair bias conflicts with DXY bias (EURUSD long + DXY bullish = BLOCK). | `cross_system_guard.cjs` |
| Killzone window alignment | NY AM: 7-10→8-11, NY PM: 12-15→13-16 to match ny_time.cjs canonical windows. | `tools/lib/killzone.cjs` |

---

## REVISED VERDICT

| Dimension | Before | After | Notes |
|-----------|--------|-------|-------|
| SMC Engine accuracy | A | A | Unchanged — was already solid |
| Time model | A | A | Unchanged |
| Registry design | B+ | **A-** | Killzone primacy + MMXM step gate + shadow weights |
| Execution reliability | D | **B-** | Idempotency + position limits + news gate |
| Edge measurement | F | **C+** | Shadow backtest running; needs 20+ days for statistical significance |
| Learning/adaptation | F | **C** | Shadow loop feeding tiebreaker; inversion is now sequence-based; LLM judge actually calls LLMs |
| Risk management | B | **B+** | Balance bug fixed; position limits enforced |
| Operational robustness | C- | **B-** | Session monitor covers all hours; intel monitor refreshes + reconnects; wrong-symbol corruption prevented |
| Honesty of evaluation | B+ | **A-** | LLM judge now honestly labels mode; shadow backtest measures real edge |

**Overall: The system has graduated from "Grade-A analysis engine with Grade-D trading layer" to a system where the execution layer has real safety, the learning loop has real input, and the edge measurement has a real methodology. The shadow backtest needs 20+ trading days to produce statistically meaningful model weights. Until then, keep execution in MONITOR mode.**

---

> *"You've done the work. The engine breathes now — it watches, it learns, it protects itself from its own enthusiasm. But remember: no amount of engineering replaces the 30 days of silence where you just watch the numbers and let the market tell you whether you're right. That's the part no code can skip."*
>
> — ICT
