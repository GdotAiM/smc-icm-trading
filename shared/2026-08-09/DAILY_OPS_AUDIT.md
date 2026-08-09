# DAILY OPERATIONS AUDIT — ICM/SMC Trading System (v2, Post WP-8)

**Audited:** 2026-08-09 (Sunday, NY hour 6 — market closed; audit reflects the Mon–Fri operating loop)
**Decision architecture:** the model **registry** now decides; legacy ranked scoring is a read-only shadow reporter.

---

## 1. The First-Principles Frame — What This System Actually Is

ICT's SMC thesis in one sentence: *price is delivered by institutional order flow through engineered liquidity pools, on a time-based schedule, and you enter only when the manipulation leg completes at a fresh PD array in the killzone.* Everything in this codebase is an implementation of that sentence. The v2 upgrade made the architecture honest about it:

**Old v1:** 17 models scored numerically, multiplied by cycle/perf/session weights, then the highest number won. A model could "half-qualify" and still be primary. (The shadow table still shows this: `MMXM Buy Model 11.20 ★ PRIMARY`.)

**New v2 (post flip, commit `8d091ab`):** a model is a **recipe** — every step in its confirmation matrix is a boolean gate (`tools/models/registry.cjs`). A model is either **COMPLETE** or it is **nothing**. Exactly one complete → that model is primary. Zero **or several** → **NO TRADE** (ties resolve by tier, then draw proximity — never by multiplying confidences).

This is the single most important thing to internalize as a daily user: **the registry is the gate.** If you see `NO TRADE — registry` in the entry plan, the pipeline is telling you the conditions are not clean enough to trade. That is the feature, not a bug.

---

## 2. The Authority Chain (How a Decision Is Actually Made)

Reading `tools/run_pair.cjs` top to bottom, the decision cascade for one pair is:

```
TIME       → ny_time.cjs (DST-aware NY). Killzone? SB window? Session multiplier.
PRICE      → Dominance-chain bias (WP-4): 1W → 1D → 4H, NOT a vote. Line 442.
FACTS      → WP-12 objective facts computed once: killzoneFor, detectRejection,
             previousSessionHL, nextDraw, findRelativeEqualLevels. Line 1263.
INDUCEMENT → sweep/MSS/reversal facts (structure TF first, 1m composite fallback). Line 1258.
REGISTRY   → runRegistry(registryCtx) — the DECISION. Line 1329.
              primary = registryDecision.primary ONLY if verdict == "SETUP COMPLETE".
              else primary = null. If runRegistry throws → primary = null (fail-closed).
GATE       → WP-8 REGISTRY GATE: if !primary → force NO TRADE, zero SL/TP. Line 1758.
ENTRY      → direction from governingBias, entry price from FRESHNESS GUARD,
             SL at structural invalidation + real ATR-14, TPs at liquidity draws (WP-7).
OVERRIDES  → only when primary IS the lecture model (SB/Lecture 1/2/4). Guarded by primary?.name.
RISK       → risk_tracker.cjs daily/weekly limits, 1% risk, size multiplier.
EVALUATE   → run_evaluation.cjs quality gates (BLOCKED/CAUTION/CLEAR).
```

**For the intraday user, the practical meaning:** direction comes from HTF dominance; *whether you trade at all* comes from the registry; *where* you enter comes from OTE/draw/lecture mechanics; *how much* comes from the risk tracker.

---

## 3. Your Daily Operating Loop (Intraday Trader)

### 3.1 Pre-Market (any time before 03:00 NY / London SB)

**Command:** `node tools/session_start.cjs` (~3–4 min)

This is the one command that matters in the morning. It:
1. Verifies/launches TradingView Desktop with CDP debug port (127.0.0.1:9222)
2. Pulls live candles from **TradingView only** for all 5 primary pairs × 7 timeframes (1w/1d/4h/1h/15m/5m/1m) — never Yahoo/Binance
3. Runs the SMC engine on every pair × TF (including 1m — MSS/entry timing requires it)
4. Generates Kronos/Chronos/forecast files

It writes everything to `shared/<DATE>/<PAIR>/`. **Do not proceed without it** — `run_pair.cjs` reads these files and the freshness guard will flag missing/stale data.

**While that runs**, check the day's context:
```
node tools/ny_time.cjs --full      # session, SB windows, day profile, multipliers
python tools/economic_calendar.py  # today's news events (Red-folder awareness)
node tools/trade_graph.cjs --query XAUUSD   # failure patterns for the pair
```

### 3.2 Market Open — First Analysis of Each Pair

**Command:** `node tools/run_pair.cjs XAUUSD` (repeat for each pair you trade)

This single command runs **all 7 stages + Stage 05b + narrative + evaluation** for that pair. It is your per-pair daily analysis. What it emits, and what you should read:

| Output file (`stages/*/output/<pair>_*.md`) | What it tells you |
|---|---|
| `00_macro_context/...` | Cycle phase (AMD), MMXM step, day context, intraday profile |
| `01_htf_bias/bias.md` | **Dominance bias** 1W→1D→4H + confidence % — your directional anchor |
| `02_key_levels/levels.md` | OBs, FVGs, liquidity pools, IRL/ERL, liquidity markers |
| `03_session_time/session.md` | Current session, killzone status, time gates |
| `04_model_selection/active_models.md` | **THE DECISION.** WP-8 registry verdict + gate table + `## Primary:` line |
| `05_entry_refinement/entry_plan.md` | Entry price source + freshness, model, OTE zones, SL/TP with reasoning |
| `06_risk_management/risk_plan.md` | Position size in lots, $ risk, trade ticket |
| `07_journal_review/review.md` | Setup summary, multi-TF alignment, decision quality |

**The two lines that matter most in the console:**

```
WP-8 REGISTRY GATE — verdict SETUP COMPLETE (1 complete setups)   → trade path open
Model: SCOB (SETUP COMPLETE) — 1 complete of 17 registry models   → this is your model
```
or
```
WP-8 REGISTRY GATE — verdict NO TRADE (5 complete setups)  → STAND DOWN (ties are NO TRADE)
```
or
```
Model: NO TRADE (registry unavailable) — fail-closed → STAND DOWN
```

### 3.3 The Freshness Guard — Read This Before ANY Entry

The entry plan header (`05_entry_refinement`) scores data quality `/10`:

- **8–10 FRESH** — tradeable
- **5–7 ACCEPTABLE** — tradeable, but verify live price on chart
- **3–4 STALE — CAUTION** — do not enter without live confirmation
- **0–2 DANGER — DO NOT TRADE** — refresh with `session_start.cjs`

It cross-checks 1H close vs 1m close vs live CDP price and auto-selects the freshest source. **If it says "⛔ DO NOT TRADE — refresh data first", trust it.** This guard exists because the 7 most expensive failures in this workspace's history were stale-data entries.

### 3.4 Pre-Trade Validation (the discipline layer)

Before pulling the trigger on a *live* setup, run:
```
node tools/ict_decision_validator.cjs --validate XAUUSD   # full ICT rule audit
node tools/council.cjs XAUUSD                             # 4-archetype vote
node tools/risk_tracker.cjs --summary                     # daily/weekly P&L state
```

---

## 4. What the Registry Decides vs What It Doesn't (Critical Distinction)

The registry is the **model gate**, not the whole decision:

- ✅ Decides: *which model's mechanics are live* (or that none are clean enough → NO TRADE)
- ❌ Does NOT decide: entry price, SL, TP, direction

**Direction** is the dominance-chain bias (`governingBias`, WP-4). The registry picks, e.g., `SCOB` as complete, but SCOB's *direction* follows the HTF bias. This is intentional and ICT-correct: *bias is a hierarchy (1W→1D→4H), not a model-name vote.* You trade in the direction of the 1D/4H dominance; the model only refines *how* you enter.

**Consequence for the scalper:** don't fight the registry. If the registry says NO TRADE on your pair, a "good chart" is not a trade. The gate fired for a structural reason (missing MSS, no purge, tie, stale data). Move to the next pair or wait for the setup to complete.

---

## 5. The Scalper's Playbook — Time-Window Map (NY local)

The system's best material for scalpers is the **time-based** models, which are gated by `timeWindows` in the registry:

| NY window | Model | Registry sequence | How to trade it |
|---|---|---|---|
| **03:00–04:00** | **Silver Bullet (London)** | sweep→reversal→mss→fvg | THE scalp. In SB window, SB primary triggers the **SB Scalp Override** (`primary?.name === "Silver Bullet"`) → tight SL from 15m/1H swing + real ATR ×0.25 |
| **07:00–07:40** | **London Hunt + IFVG** | lecture2_hunt_swept→mss→ready | Hunt of rel-equal highs/lows → reversal → IFVG CE entry. `lecture2_setup.cjs` |
| **08:00–08:30** | Lecture 1 formation | lecture1_formation | *Formation window* — levels must FORM here. Monitor only until raid |
| **08:30–10:00** | **08:30 Liquidity Raid** | lecture1_formation→raid→mss→ready | Post-08:30 raid of pre-open equal levels → PD array entry. `lecture1_setup.cjs` |
| **08:30–10:00** | **NDOG/NWOG News Model** | lecture4_gap_draw→sweep→mss→ready | News gap draw → MSS at gap cluster → breaker/CE entry. `lecture4_setup.cjs`. Note: the **sweep step means the gap must be swept before it's a draw** (WP-12 purge gate) |
| **10:00–11:00** | **Silver Bullet (NY AM)** | sweep→reversal→mss→fvg | The highest-probability SB. All USD majors + XAUUSD |
| **11:00–13:00** | **NY Lunch** | — | ×0.4 multiplier. **No new entries.** The pipeline self-suppresses |
| **14:00–15:00** | **Silver Bullet (NY PM)** | sweep→reversal→mss→fvg | USDJPY, USDCAD secondary window |
| **Session opens** | **Judas Swing** | sweep→mss | Fade the first move of the session (London 07:00 / NY 08:00 NY start) |

**Lecture overrides:** when the registry primary *is* a lecture model, Stage 05 auto-overrides entry/SL/TP with that lecture's mechanics (IFVG CE entry, post-08:30 range SL, gap-based TP, etc.). If the lecture is active but **not** complete, the entry plan shows a `⏳ Monitoring` block instead — this is your live "wait for MSS / wait for raid" checklist. **The override now only fires when the registry actually chose that model** (guarded by `primary?.name`), so no override can hijack a decision the registry rejected.

**IOFED pyramid:** when an FVG is available in bias direction, Stage 05 computes a 3-level scale-in (starter 40% @ FVG edge → add 35% @ CE 50% → add 25% @ far edge). This is ICT's "enter at the edge, add at mitigation" drill — made for the scalper who scalps a single displacement leg.

---

## 6. SL/TP Mechanics — ICT-Correct, Every Time

- **SL = structural invalidation, never a pool.** Long: last HTF swing low − 0.5×ATR. Short: last HTF swing high + 0.5×ATR. Real ATR-14 measured from 4H candles (WP-1) — no more "15% of swing range" guesses.
- **TP = liquidity draws (WP-7), never measured moves.** The draw map fuses engine pools + previous NY-AM H/L + London H/L + 1D/1W/20-day extremes. No draw ≥ SL distance in the bias direction → **NO TRADE** (`noDrawDir` set).
- **R:R:** TP1 ≥ 1:1 hard minimum. The risk plan literally prints `Meets 1:1 ✓ / Below minimum ✗`.
- **Trade management defaults:** 50% at TP1 → SL to breakeven → 50% runner → trail behind nearest swing; time stop at 2× entry-TF candles.

---

## 7. Risk Management — The Daily Kill-Switch

`tools/risk_tracker.cjs` enforces `_config/risk_parameters.md`:

- **1% per trade** ($100 on $10k), **3% daily max** ($300), **5% weekly** ($500)
- **Max 2 positions, max 2% correlated** (no EURUSD+GBPUSD same direction)
- After **3 consecutive losses** → size ×0.5 until 2 wins
- The risk gate runs *inside* `run_pair.cjs` (Stage 06) — if `--check` says blocked, the risk plan prints `🛑 RISK GATE: BLOCKED` and you do not trade.

**Daily discipline:**
- `node tools/risk_tracker.cjs --summary` at start and end of day
- `node tools/risk_tracker.cjs --log '{"pair":"XAUUSD","dir":"SHORT","pnl":...}'` after each closed trade
- `node tools/risk_tracker.cjs --reset` at the start of a fresh week

**Hard session rules (from `_config/trading_rules.md`):** no entries in Asian session; NY Lunch ×0.4 no entries; close all intraday by NY close; Friday no new swing trades; no high-impact news within 30 min of entry (check `ict_calendar.md`).

---

## 8. Monitoring During the Session

- **`tools/tv-mcp/session_monitor.cjs`** — background every 60s, writes `session_state.json`. Watch SL/TP/positions.
- **`tools/tv-mcp/intel_monitor.cjs`** — kills/restarts itself; run one OR the other, never both (they fight for chart control).
- **`node tools/tv-mcp/check_orders.cjs`** — verify positions before trusting any "placed: true".
- **`node tools/tv-mcp/scan_all_pairs.cjs`** — live sweep of all 5 pairs for tradeable setups (uses CDP symbol switching).
- **`node tools/ny_time.cjs --full`** — anytime you need the temporal context (session, SB countdown, weekly position).

**⚠️ Chart-control warning (proven failure mode):** before placing any order, kill ONLY `intel_monitor` by PID (`wmic process where "name='node.exe'" get processid,commandline | findstr intel_monitor`), **never** `taskkill /F /IM node.exe` (that kills the Discord bot too).

---

## 9. The Quality / Evaluation Layer (Auto-Runs Every `run_pair`)

Every pair run ends with `evaluation/run_evaluation.cjs`:

| Check | Catches |
|---|---|
| Resilience (`corrupt_detector.cjs`) | Impossible prices (e.g. EURUSD 29446), inverted SL/TP, stale data, session violations |
| Output Quality (`output_quality.cjs`) | Missing stage outputs, placeholders — 29 checks/pair |
| LLM Judge (`llm_judge.cjs`) | 5-dim quality: direction (30), ICT adherence (25), reasoning (20), actionability (15), completeness (10) |
| Bias Accuracy (`scorer.cjs`) | Directional calls vs actual movement over time |

**Verdict:** `CLEAR` → `CAUTION` → `BLOCKED`. If it prints `⚠️ EVALUATION BLOCKED — review before trading`, stop and read the report. Manual rerun: `node evaluation/run_evaluation.cjs XAUUSD`.

---

## 10. The Shadow Layer — What Remains and What Was Archived

The legacy model-ranking system was **archived** (moved to `archive/`) on 2026-08-09. The legacy scoring block still computes in `run_pair.cjs` **as a read-only shadow reporter** — it is never consumed, but its comparison is visible:

- The legacy `## Legacy Shadow Scores (read-only)` table in `active_models.md` — **read-only, marked as NOT the decision**
- The console line `Legacy shadow: <model> — ✅ AGREE / ⚠️ DISAGREE (legacy is read-only now)`

**Archived to `archive/`:** `tools/run_all_stages.cjs`, `tools/shadow/*` (shadow_log, golden_master, verify_phase0), `tests/golden/primitives.json`, and the old `stages/04_model_selection/shadow/` report. The pipeline no longer writes `shadow/<pair>_registry.md` or `disagreements.jsonl`.

**As a user you can ignore the shadow numbers** — they are for comparison only. Judge the trade on the **registry** verdict only.

**Verification commands** (run them if you suspect something is broken):
```
node --test "tests/*.test.cjs"                # 119 unit tests
node evaluation/regression/suite.cjs          # 31 regression tests
```

---

## 11. News Trading (FOMC/NFP/CPI — One Shot One Kill)

Deliberate news entries have their own playbook (`_config/nfp_strategy.md`, `ict_calendar.md`, `shared/2026-07-29/ICT_NEWS_TRADING_STRATEGY.md`):

- Weekly bias clear, Mon–Thu consolidation (Seek & Destroy), all 3 TFs aligned
- **SL = 2.5× normal, TP = 3.5× normal**; enter 2–5 min before release in killzone; skip the first 60s after release
- **XAUUSD is the #1 FOMC/NFP instrument**; never both EURUSD and GBPUSD
- Automated: `node tools/tv-mcp/news_trade.cjs --event FOMC --time 14:00 --pairs XAUUSD`

---

## 12. End of Day

1. `node tools/run_pair.cjs <PAIR>` once more (or run the summary) to capture the review
2. Journal actuals vs forecast/model expectation — write into `07_journal_review`
3. Log trade with `risk_tracker.cjs --log`
4. Archive: `shared/<DATE>/PAIR/` already holds the day's data; keep `session_state.json`
5. Run `node tools/trade_graph.cjs --rebuild` after any lessons (graph auto-syncs on `ict_continuous_learn.cjs --run`)

---

## 13. Quick-Reference Command Cheat Sheet

```
node tools/session_start.cjs                         # morning: TV + candles + engine + forecasts
node tools/run_pair.cjs XAUUSD                       # full 7-stage analysis + decision + eval
node tools/ny_time.cjs --full                        # temporal context anytime
python tools/economic_calendar.py                    # news events
node tools/council.cjs XAUUSD                        # 4-archetype confidence vote
node tools/ict_decision_validator.cjs --validate XAUUSD   # pre-trade ICT audit
node tools/risk_tracker.cjs --summary / --log '{}' / --reset
node tools/trade_graph.cjs --query XAUUSD            # memory: past failures for pair
node tools/tv-mcp/scan_all_pairs.cjs                 # live multi-pair scan
node tools/tv-mcp/check_orders.cjs                   # verify positions
node tools/tv-mcp/market_order.cjs XAUUSD SELL 1.13950 1.13750 10000   # manual order
node evaluation/run_evaluation.cjs XAUUSD            # quality gate rerun
```

---

## 14. Honest Limitations / What to Watch (as of this audit)

1. **Regression suite is 21/31** today — 10 failures are **missing `engine_1w.json`** (session_start doesn't pull 1w candles) and **no data for 2026-08-09** (Sunday, never ran). Not a v2 regression, but means 1w bias relies on fallbacks. If you trade, verify 1W context exists before trusting bias.
2. **XAUUSD MMXM Step shows `undefined/4`** in the last output — a macro-context field didn't populate. Cosmetic but worth checking in your morning run.
3. **The registry is intentionally strict.** Many days you will get NO TRADE. That is the design working (per the DoD: "ties never multiply"). Budget for more no-trade days, fewer, higher-quality entries.
4. **Tie rule nuance:** 5 complete setups today (pre-flip sample) → NO TRADE. If your intraday style needs constant action, you must trade **multiple pairs** (the 5 primaries) and pick the one with `SETUP COMPLETE`.
5. **The legacy runner is archived.** `run_all_stages.cjs` (which wrote `active_models.md` with old scoring) has been moved to `archive/`. `run_pair.cjs` is the **only** per-pair runner — no other file can clobber the registry decision output. The legacy scoring block inside `run_pair.cjs` remains as a read-only shadow reporter only.

---

## Bottom Line for an Intraday/Scalper User

1. Run `session_start.cjs` in the morning. Run `run_pair.cjs` on every pair you might trade.
2. Trade only the pair where the console shows **`SETUP COMPLETE` (1 complete)** with **FRESH** data and a **CLEAR** evaluation.
3. If it says **NO TRADE** — even with a good-looking chart — the registry found the confirmation matrix incomplete. Stand down or switch pairs.
4. Within an active SB/Lecture window, let the **override** set your tight scalp SL/TP and the **IOFED pyramid** set your scale-in ladder.
5. Respect the risk tracker's daily kill-switch. 1%/3%/5% is the difference between a process and a gamble.
