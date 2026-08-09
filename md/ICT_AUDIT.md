# ICT AUDIT — SMC-ICM TRADING SYSTEM

## A first-principles critique, written as Michael J. Huddleston (ICT) would deliver it

> This is not a code review. This is a methodology audit. I am going to hold your system up against the
> three truths I teach, and I am going to be direct about where it is structurally wrong, why each thing
> is wrong, and what it would take to fix it. I will also credit what you got right, because you got some
> things genuinely right. But first: the hard part.

---

## 0. THE CORE MISCONCEPTION

**What you built is not ICT. It is a scoring engine wearing ICT's clothes.**

My methodology is a *discretionary, time-and-price context system*. Every concept I teach — the order
block, the FVG, the killzone, the MMXM, the Silver Bullet — has meaning **only within a chain of context**:

1. the weekly and daily narrative (bias),
2. the operative dealing range and its equilibrium,
3. the specific time window you are in,
4. the *intent* of the algorithm on that particular day,
5. and above all, **screen time** — the feel of price that no indicator gives you.

When you reduce that to "score 17 models, multiply by weights, take the highest score," you have not
automated my method. You have built a heuristic that *resembles* it. That is the difference between a
chess engine that understands positional chess and a program that memorized the opening moves — it will
win the first ten moves and lose the game.

**Why I'm pointing this out:** every single defect in this audit traces back to this one substitution.
Scores, multipliers, and "gates" as quantitative barriers do not exist in my teaching. My concepts are
*qualitative relationships* — "price delivered into the discount and swept the sell-side; now it is
loading at the equilibrium" — not numbers to be thresholded. The moment you threshold a relationship,
you replace judgment with arithmetic, and the arithmetic does not know what day it is.

**The solution:** restructure from "rank models" to "verify a single setup." Only evaluate the models
that are *time-eligible in the current window* (during the Silver Bullet hour you are NOT evaluating the
Asian Range Breakout), then run each eligible model through a **hard confluence checklist**. The output
is a boolean — "there is one valid setup, here is the price plan" — or "nothing." A leaderboard of 17
scores is the opposite of that discipline.

---

# SECTION 1 — FIRST PRINCIPLE #1: TIME RULES FIRST

*The algorithm operates on a schedule. If you are not in the right window, the setup is not valid — not
"less valid," not "scaled down" — not valid.*

## Gap 1.1 — The "London PM" window is a fake killzone

**What the system does:** `ny_time.cjs` treats **05:00–08:00 NY** as a full killzone called `londonPM`
at weight 1.0 and includes it in `isInKillzoneNY()`. Entries get a 1.0 session multiplier there.

**Why it's wrong:** My killzones are **London 02:00–05:00**, **NY AM 08:00–11:00**, and **NY PM
13:00–16:00**. The 05:00–08:00 block is the *overlap* between the London close and the NY pre-open — it
is the dead zone where I tell traders to *be careful*, not a green-lit window. By labeling it a killzone
at full weight, the engine will happily fire entries in exactly the hours I teach you to stand down.

**Solution:** Remove `londonPM` from `isInKillzoneNY()`. If it stays as informational context (it is
useful for Lecture 1 formation 08:00–08:30), give it zero scoring weight and block entries except when a
2024 lecture setup explicitly requires it.

## Gap 1.2 — PO3 / AMD cycle phase is derived from the DAY OF THE WEEK

**What the system does:** `ny_time.cjs` `getCycleEstimate()` hardcodes
Monday = ACCUMULATION, Tuesday/Wednesday = MANIPULATION, Thursday = DISTRIBUTION/EXPANSION,
Friday = EXPANSION/ACCUMULATION. `run_pair.cjs` uses this as the `effectivePhase` fallback, which then
drives the cycle multipliers (×0.3–×1.5) and the PO3 phase filter (wrong-phase models get a 70% score
cut).

**Why it's wrong:** PO3/AMD is a **price-and-time delivery cycle**, never a calendar artifact. A Monday
can be a full distribution day. A Thursday can accumulate all morning. Assigning the cycle to the
weekday is astrology wearing a trading jacket. This is the single most destructive error in the file
because it silently corrupts *every* downstream model weight on *every* day the structure detection
fails to agree. On a Tuesday that is actually accumulating, the system thinks it is manipulating — it
will suppress the right models and endorse the wrong ones.

**Solution:** The cycle must be **inferred from price structure only** — the `po3_state_machine.cjs`
transitions (sweep → BOS+displacement → exhaustion) have the right *shape*. Delete `getCycleEstimate()`.
If structure data is missing or ambiguous, default the phase to `UNKNOWN` and *reduce system
confidence* — never fabricate a phase from the calendar.

## Gap 1.3 — "Time stop after 2× entry-TF candles" is generic, not temporal discipline

**What the system does:** `risk_parameters.md` says "close if not at TP1 within 2× the entry timeframe
candles."

**Why it's wrong:** My time invalidation is tied to the *window*, not a candle count. A Silver Bullet
trade that hasn't worked by 11:00 is dead because **the window closed** — the candle count is irrelevant.
A candle-count stop books losers during a healthy retracement and holds losers through a dead window.

**Solution:** Invalidate on **window close** (killzone / Silver Bullet end) and on the **next opposing
liquidity raid**, not on candle counts.

## Gap 1.4 — Silver Bullet is force-boosted instead of recognized

**What the system does:** the Silver Bullet gets a structural score, and during SB windows if it scores
≥ 5 it is artificially set to `max(score, topModel + 0.5)` so it "wins."

**Why it's wrong:** My Silver Bullet is a **precise entry sequence** inside the 10:00–11:00 (and
14:00–15:00) NY window — displacement into liquidity, a specific retracement, entry when the 1m
"sentences" the trade. It is not a *candidate*. When the hour is open, you either *have* the setup or
you don't. Artificially boosting it to the top manufactures a trade that may not exist. That is
fabricating signals to feed a leaderboard.

**Solution:** Make the SB window a **setup-recognition gate**: has the displacement → FVG → MSS sequence
completed in-window? If yes, there is a Silver Bullet trade. If no, there is no Silver Bullet trade —
and no boost can create one.

---

# SECTION 2 — FIRST PRINCIPLE #2: LIQUIDITY IS THE FUEL

*Price is drawn to stop clusters. Everything — structure, entries, targets — is subordinate to the draw
on liquidity. If you don't know where the fuel is, you don't have a trade.*

## Gap 2.1 — IRL is restricted to FVGs only

**What the system does:** `irl_erl_engine.cjs` defines **Internal Range Liquidity as FVGs strictly
inside the dealing range**.

**Why it's wrong:** Internal range liquidity is *any resting liquidity inside the range* — the equal
highs/lows, the internal highs and lows that will be raided. FVGs are one *subclass* of it. By excluding
equal highs/lows you cannot read the two-sided internal liquidity that determines whether the range will
expand or deliver. You are flying with one instrument.

**Solution:** Add swept/unswept **equal highs & lows inside the range** to the IRL set, and rank by
"closest unmitigated internal liquidity" in the draw-on-liquidity sequence — exactly how I teach the
internal-to-external handoff.

## Gap 2.2 — The dealing range is built from "last swing high/low," not sweep-to-sweep extremes

**What the system does:** `irl_erl_engine.cjs` takes `structure.lastSwingHigh/lastSwingLow` and then
checks that both sides swept liquidity.

**Why it's wrong:** A dealing range is defined by the two points where the algorithm **swept external
liquidity** — a high that raided prior highs and a low that raided prior lows. The "last swing high/low"
is frequently just the latest *internal* swing, not the operative range. You end up with false ranges,
and every premium/discount and equilibrium read downstream of the range is then false.

**Solution:** Build the dealing range from **liquidity-swept extremes** (scan back to the last external
liquidity sweep on each side), and only then compute the equilibrium and premium/discount.

## Gap 2.3 — Premium/Discount is computed against a fixed 20-bar average in several places

**What the system does:** `one_trade_setup.cjs` uses "price above the daily midpoint = PREMIUM";
`time_price_grid.cjs` uses a 20-day equilibrium; `ipda.cjs` uses the IPDA20 equilibrium.

**Why it's wrong:** Premium/discount is read relative to the **operative dealing range's equilibrium**,
established by the sweep structure — not a fixed 20-bar average. These definitions disagree with each
other constantly, so the system will label a level *premium* that I would call *discount*, and the
opposing guard modules will cancel each other out.

**Solution:** Standardize on the sweep-defined dealing range (Gap 2.2) as the **single source** for
equilibrium/premium/discount. Delete the 20-day-mean variants.

## Gap 2.4 — Liquidity marking misses the relative-equal formation

**What the system does:** `liquidity_marker.cjs` marks PDH/PDL/PWH/PWL plus engine BSL/SSL pools with a
0.002 *price-relative* tolerance.

**Why it's wrong:** PDH/PDL/PWH/PWL are fine as *references*, but I mark liquidity from **where the stop
clusters actually rest** — the equal highs/lows formed by structure. The system's equal-high/low pass is
a filter over engine pools with a fixed price tolerance; it misses the relative-equal formation entirely.
The *right* primitive already exists in `lecture2_setup.cjs`: `abs(p1 - p2) / ATR < 0.15` — tolerance
must be **ATR-relative**, not price-relative, because what makes two highs "equal" is ATR-relative on
that timeframe.

**Solution:** Promote the ATR-relative equal-high/low detector to be **the** liquidity-marking primitive
across all timeframes. Stop resting stops are the fuel; mark them precisely.

## Gap 2.5 — TP targets are arbitrary measured moves (1:1, 2:1), not draws on liquidity

**What the system does:** default TP1 = "nearest SSL pool ≥ SL distance away" or a 1:1 measured-move
fallback; TP2 = fixed 2× TP1 distance.

**Why it's wrong:** My TP discipline is to target the **next external liquidity** — the draw on
liquidity — and to take 50% off at the first external pool, managing the rest. Fixed 1:1/2:1 ratios are
retail thinking. They book profit *before* the draw completes, or hold *through* a raid into the level
that was the actual target.

**Solution:** TP1 = the nearest **unmitigated external liquidity pool (ERL)** in trade direction;
TP2 = the next pool or the daily/weekly extreme. **If no definable external pool exists, there is no
trade.** The *absence of a draw is a filter*, not a fallback to 1:1.

**Status:** ✅ Resolved — **WP-7** (`tools/lib/draw.cjs` + `run_pair.cjs`). `drawTargets()` sets TP1 to the
nearest unmitigated external pool in trade direction (BSL above / SSL below), TP2 to the next pool or the
daily/weekly extreme, and returns `null` when no draw exists → the setup is NO TRADE. The 1:1 measured-move
and 2×-TP1 fallbacks were deleted from `run_pair.cjs` (default, Silver Bullet, and Lecture 1/2/4 paths).
`hasDraw` feeds the confidence formula from the same engine.

---

# SECTION 3 — FIRST PRINCIPLE #3: THE HTF NARRATIVE CONSTRAINS EVERYTHING

*Bias flows from the top down. The weekly governs, the daily executes within it, the intraday confirms.
Lower timeframes do not "vote" against higher ones — they pull back.*

## Gap 3.1 — Bias is a weighted vote among six sources

**What the system does:** `run_pair.cjs` weights 1W ×3.0, 1D ×2.5, 4H ×2.0, Weekly Profile ×1.5,
One Trade ×1.0, 1H ×0.5, then derives a "confidence %" from the vote margin.

**Why it's wrong:** Bias in my method is a **hierarchy of dominance, not a democracy**. The weekly bias
governs; the daily bias operates within it; the 4H gives you the operative structure and the *newest PD
array*. You do not average them, because each timeframe has a *different meaning* — a 1H pullback
against a 1D bias is **normal**, not a "0.5-weight dissenting vote." And the confidence % you compute is
numerology: it measures *how many timeframes agree*, which is not the same as *confluence quality*. A
1W+1D+4H unanimous-but-stale read scores 94% and looks authoritative while the market is already
delivering to the opposite draw.

**Solution:** Replace the vote with a **dominance chain**: resolve 1W → 1D → 4H in order. A lower
timeframe opposing the higher is a *pullback*, not a counter-vote. Confidence comes from (a) the time
window, (b) an unmitigated PD array near price, (c) a clear external draw — **not** vote margin.

## Gap 3.2 — All 17 models are forced to trade the 1D bias, THEN lecture models override the direction

**What the system does:** scoring forces `modelDirection = weightedBias`, but the Lecture 2/1/4
overrides then set `entryType = lecture.direction`, *replacing* the bias direction.

**Why it's wrong:** This is a **self-contradiction baked into the engine**. Either direction comes from
the HTF narrative (my rule) or from the specific model's mechanics (my other rule). Some of my models are
*inherently* directional: a **Turtle Soup is a fade** of a false breakout; the **Judas Swing fades the
first move**; the **London Hunt can be counter-daily-bias**. Forcing everything one-way, then
special-casing three lecture models with a carve-out, produces direction whiplash and hides the real
logic from the auditor.

**Solution:** Give each model its **intrinsic directional definition** (Turtle Soup = fade the sweep at
the array; MMXM = trade premium→discount after purge; etc.). A model is *eligible* when its mechanics
align with the higher-timeframe intent and *ineligible* when they fight it. Delete the blanket "all
models trade bias" rule **and** the lecture-override carve-out — one consistent rule, applied everywhere.

## Gap 3.3 — A "performance multiplier" from the trade graph weights live model scores

**What the system does:** `performance_ledger.cjs` assigns each model a `perfMultiplier` from historical
win rate, and `run_pair.cjs` multiplies it into the final score.

**Why it's wrong:** This is the single most anti-ICT idea in the codebase. The validity of a setup
today is determined by **today's** time-and-price conditions, not by how often that model "won" on other
days with different structure. My method is explicitly not backtest-friendly — every day is a unique
delivery context. Baking in historical win rates lets the engine **over-trade a previously-hot model
into today's wrong context** and starve a cold model on its perfect day.

**Solution:** Remove `perfMultiplier` from live scoring entirely. Keep the ledger for *auditing the
operator's* decision quality and for detecting systematic mistakes ("every time we entered at London
close on a Monday we lost") — but never as a live weight on a model's validity.

## Gap 3.4 — The universal "6 confirmations, need 4 of 6" and "1D bias must be non-neutral" gates

**What the system does:** `trading_rules.md` requires 4–5 of 6 confirmations (SMT, sweep, MSS, CISD,
FVG, HTF array) and a clearly established non-neutral HTF bias before entry.

**Why it's wrong:** This checklist conflates **model-specific** requirements into a generic pass-bar.
SMT divergence matters for correlated-pair models, not all; CISD is one entry type, not a universal
confirmation. Worse, I trade **counter-bias manipulations routinely** at the right time — e.g., a
bearish raid into buy-side above a daily high is a valid bearish *trap* even when the 1D bias is
bullish. Forcing "non-neutral 1D bias" as a hard requirement systematically kills the best manipulation
trades of the week.

**Solution:** Replace the universal checklist with **per-model confirmation matrices**: each model
lists its own required elements from its definition, and a model fires only when its own list is
complete. SMT, CISD, BPR become model-specific — not global.

---

# SECTION 4 — CONCEPT-LEVEL IMPLEMENTATION ERRORS

## Gap 4.1 — Fake ATR everywhere

**What the system does:** `run_pair.cjs`, `tier1.cjs`, and `invalidation.cjs` all compute
`atrValue = |swHi4h - swLo4h| × 0.15` and call it "ATR." A real period-14 ATR is only computed inside the
lecture helpers.

**Why it's wrong:** That is not ATR. It is "15% of the last 4H swing range." On a ranging market it
inflates the stop; on a trend day it is tiny. Every SL buffer built on it is mispriced — producing
stops that get *hunted* (too tight) or stops so wide the R:R is *destroyed* (too wide). This one bug
silently degrades nearly every trade the system produces.

**Solution:** Use a real period-14 ATR on the operative timeframe, buffered by a defined multiple
(0.25–0.5×) *beyond* the structural level. Correcting this one thing repairs most mispriced SL/TP in the
engine.

## Gap 4.2 — "Rejection block" = "wick > 2× body"

**What the system does:** `priority34.cjs` detects rejection blocks by wick-to-body ratio only.

**Why it's wrong:** A rejection block in my teaching is a candle that **rejected a level and whose range
is the imbalance left behind**. The wick/body geometry is a *symptom*, not the definition. The definition
is: rejection at a specific PD array or equal-high/low after a sweep, leaving a tradable imbalance in the
direction of the reversal. Wick-ratio alone fires on noise.

**Solution:** Require (a) rejection at a defined PD array or equal-high/low, (b) a preceding sweep, and
(c) subsequent displacement away. Then trade the block as the imbalance.

## Gap 4.3 — Order blocks consumed raw from the SMC engine, no mitigated/unmitigated grading

**What the system does:** model scoring consumes engine OBs gated only by an ATR impulse threshold.

**Why it's wrong:** The popularized SMC order-block definition (last counter-trend candle before
expansion) is not my grading. I grade OBs by the **displacement of the leg that left them**, their
**proximity to the draw**, and whether they have been **mitigated or are still unmitigated**. The engine
treats a fully consumed block the same as a fresh one, so the matrix can recommend entries into
already-used blocks.

**Solution:** Add ICT OB grading: mark mitigated vs unmitigated, require displacement on the originating
leg, and disqualify fully consumed blocks from "unmitigated" scoring.

## Gap 4.4 — Equal-high/low detection has a backwards "right shoulder" constraint

**What the system does:** `lecture2_setup.cjs` `findRelativeEqualLevels` requires the right shoulder to
be *lower or equal* for highs (and the reverse for lows), with a 15%-of-ATR tolerance.

**Why it's wrong:** Relative equal highs are highs at **nearly the same level** — the point is that two
sets of stops rest at one price. Filtering out the left-shoulder-higher case removes exactly the
liquidity cluster I want. "Equal" means equal.

**Solution:** Relax to near-equality in *both* directions within the ATR tolerance, and mark the
**cluster** (both highs plus the resting stops between them) as the liquidity, not a single level.

## Gap 4.5 — CISD reduced to engulfing heuristics

**What the system does:** `priority2.cjs` / `fractal_mmxm.cjs` detect CISD via engulfing + body-ratio
thresholds (1.2×–1.5×).

**Why it's wrong:** CISD (Change In State of Delivery) is about the **character of the candle relative
to the delivery context** — a displacement candle that changes the *type* of range the market is
trading. Engulfing is a weak proxy that over-fires on noise.

**Solution:** Grade CISD by displacement magnitude vs. the prior delivery (ATR ratio + the shift from
controlled to efficient delivery). `time_price_grid.cjs`'s delivery-mode logic is actually *closer* to
this concept than the CISD detector is — reuse it.

## Gap 4.6 — Fixed weekday confidence multipliers (Mon ×0.8 … Thu ×1.3)

**What the system does:** `ict_calendar.md` assigns blanket confidence multipliers to calendar days.

**Why it's wrong:** My daily *profiles* describe the *structure* of typical days (Monday range-setting,
Wednesday reversal) — they are a prior, not a license. Applying a blanket ×1.3 to every Thursday is the
same calendar-determinism I reject in Gap 1.2. A reversal day does not make every reversal setup 1.2×
more valid.

**Solution:** Fold the daily-profile *type* (range-day / expansion-day / reversal-day) into the PO3 /
structure read as a *prior*, never as a multiplicative confidence boost.

---

# SECTION 5 — MISSING CONCEPTS

*These are things I teach that the system simply does not contain.*

**5.1 — The draw on liquidity as the organizing principle.** Nowhere is the full liquidity cascade
(external → internal → external, the two-sided raid logic) computed as the primary decision engine.
`ipda.cjs` has a partial equilibrium cascade, but the pipeline never asks the central question:
*"Where is the algorithm delivering price, and is the current level a draw or a delivery?"*

**5.2 — Mitigation as a directional trigger.** Entry into an OB/FVG is valid when the array is
**mitigated** (price returns to the origin of the displacement). The system has "Mitigation Block" as a
scored model but never implements *mitigation as the operative mechanism* for OB/FVG entry validation.

**5.3 — Break-of-structure quality.** A BOS that is **not preceded by a liquidity purge** is usually a
retail break — low quality. `priority34.cjs` distinguishes CHoCH vs MSS, but nothing requires the purge
prerequisite for a *high-quality* BOS.

**5.4 — Event-time quality.** A raid at 08:30 and a raid at 14:00 are *different events* with different
meaning. The engines use timestamps only for window filters; they never score **when** the sweep/reversal
happened relative to the killzone open.

**5.5 — Previous-session high/low as active draws.** The system has PDH/PDL, but the *previous session
high/low* (London high/low, NY AM high/low) as *active draw references for the current window* is
missing — this is core to intraday trading.
✅ **Resolved — WP-7:** the WP-7 draw map (`run_pair.cjs` `drawRefs`) fuses engine BSL/SSL pools with the
previous NY-AM high/low and London high/low as draw references for the operative window.

**5.6 — One-Shot-One-Kill as the operating default.** OSOK ("one setup, one trade, full commitment,
then done") only appears as a news routine. The daily pipeline never enforces it as the default
discipline, which is why the "17-model leaderboard" exists at all.

**5.7 — Wicks-through vs closes-through inconsistency.** Sweep detection in several engines triggers on
*any candle* breaking a level (wick), while validation elsewhere demands a *close*. Liquidity raids are
often wicks, but validation must be consistent — pick one rule and apply it uniformly.

**5.8 — Rejection as a leading signal.** The first sign of a reversal is often a rejection *wick* at the
array. There is no dedicated rejection detection wired as a leading signal before MSS completes.

---

# SECTION 6 — INTERNAL CONTRADICTIONS & ENGINEERING BUGS

**6.1 — Fake ATR is spread across ~15 call sites** (`run_pair.cjs`, `tier1.cjs`, `invalidation.cjs`,
`cross_system_guard.cjs`). One fix, one source of truth. (Gap 4.1.)

**6.2 — Time-window definitions disagree across modules.** `ny_time.cjs` (02–05 / 05–08 / 08–11 /
11–13 / 13–16 / 16–17), `bread_and_butter.cjs` (London open 00–05, retest 05–08, London close 10–13,
transition 16–19), `high_precision_secrets.cjs` (7–9 AM), and `session_preferences.md` (UTC-based Asia
00–07) will label the *same NY minute* a "killzone" in one module and "transition" in another. Session
resolution must be a **single shared module** that everything imports.

**6.3 — The direction override contradiction** (Gap 3.2): "all models trade the bias" then lecture
models override it. One of these is wrong; both being present is a bug.

**6.4 — Three competing cycle sources.** `run_pair.cjs` parses the macro-context markdown with
`/\*\*([A-Z]+)\*\*/` (grabbing the *first bold word* of the file — fragile), falls back to
`po3_state_machine.cjs`, and falls back again to the day-of-week estimate (Gap 1.2). One source of
truth, please.

**6.5 — The 1m "sentence" gate and detector disagree on thresholds.** `cross_system_guard.cjs` Gap 8
requires inversion score ≥ 4 and blocks if missing; `fractal_mmxm.cjs` needs 5 points and 1m CHoCH +
sweep + FVG. The gate can block a *passing* detection and pass a *failing* one. Align the thresholds.

**6.6 — Inducement validates a 15m/1H thesis on 1m noise.** `inducement_engine.cjs` finds the structural
event on 15m/1H but confirms the sweep + MSS on 1m. The inducement must be **defined on the same
timeframe as the structure break** you're validating, or you are confirming a 15m event with 1m noise.

---

# SECTION 7 — WHY THE SCORING STACK IS MATHEMATICALLY MEANINGLESS

Final score = **structural × cycle × performance × session × PO3-phase × weekly-profile**.

This is multiplicative numerology, and it fails on three independent grounds:

1. **The factors are not independent.** A weekly-profile ×1.4 and a session ×1.3 produce 1.82× — but
"weekly profile direction" and "session" already encode overlapping information (the weekly profile
*contains* the session character). Multiplying correlated factors is double-counting.

2. **The cycle factor currently rests on a false premise.** The cycle phase can come from the day of
the week (Gap 1.2). If the phase is wrong, every ×0.3 penalty and ×1.5 boost in the chain is wrong, and
the system has no way to know.

3. **The performance factor is anti-ICT** (Gap 3.3). Historical win rate cannot weight today's validity.

And the deepest problem: **the score is not calibrated to reality.** Nothing ever checks "when we scored
8+ and traded, how often were we right?" `bias_accuracy` tracks directional calls, not *model-score
calibration*. The system treats a threshold-crossing number as a trade signal without ever proving the
number means anything.

**The fix:** replace composite scoring with **eligibility filters + sequence completion**. Does the
setup's checklist complete? The output is a boolean and a price plan — not a number to beat a threshold.
When no checklist completes, the answer is "nothing," and that is the correct output more often than not.

---

# SECTION 8 — CREDIT: WHAT YOU GOT GENUINELY RIGHT

I'll say what's right, because you built more correctly than most systems I've seen:

1. **Sweep → reversal → MSS as the reversal engine, with MSS requiring a CLOSE beyond the prior swing.**
   That is the spine of my 2022 model. Correct.
2. **The Silver Bullet windows** (03:00–04:00, 10:00–11:00, 14:00–15:00 NY). Correct.
3. **The three 2024 lecture models** — Lecture 1 (08:30 raid), Lecture 2 (London hunt + IFVG), Lecture 4
   (news/gap). These are real concepts and the implementations track the mechanics well: IFVG CE entry,
   breaker fallback, gap quarters, post-window SL.
4. **SL at structural invalidation beyond the level, never at the liquidity pool.** Correct — pools are
   targets, not risk levels.
5. **Worst-dimension-wins** (one closed gate = no trade). This mirrors my discipline better than
   averaging. Keep it.
6. **Premium/discount, dealing ranges, equilibrium cascade, PD array matrix** — the concepts are present
   (execution needs Gap 2.2 / 2.3 fixes).
7. **Lunch window blocking (11–13 NY).** Correct — I would block it too.
8. **IPDA objective detection** (hunt vs rebalance) — a fair approximation of the algorithm's intent.

---

# SECTION 9 — REMEDIATION PATH

## Priority 1 — Correctness (fix the physics)

1. **Fix the fake ATR** everywhere → real period-14 ATR with a defined buffer multiple (Gap 4.1).
2. **Delete the day-of-week cycle fallback**; structure-only cycle, UNKNOWN default (Gap 1.2).
3. **Remove London PM from the killzones** (Gap 1.1).
4. **One shared session-time module** used by every tool (Bug 6.2).
5. **Replace the weighted vote with the dominance chain** 1W → 1D → 4H (Gap 3.1).

## Priority 2 — Methodology (fix the meaning)

6. **Make inducement a per-model element**, validated on the structure's own timeframe — not a universal
   binary gate on 1m noise (Gap 1.x / Bug 6.6).
7. **Give each model its intrinsic direction + confirmation matrix**; delete "all models trade bias" and
   the lecture override carve-out (Gap 3.2 / Gap 3.4).
8. **Remove the performance multiplier** from live scoring (Gap 3.3).
9. **TP = external liquidity draws; no-trade when no draw exists** (Gap 2.5). ✅ **Closed — WP-7**
   (`tools/lib/draw.cjs`; measured-move fallbacks deleted from `run_pair.cjs`).

## Priority 3 — Structure (fix the objects)

10. **Rebuild the dealing range from sweep-to-sweep extremes**; standardize premium/discount on it
    (Gap 2.2 / 2.3).
11. **Promote ATR-relative equal-high/low detection** as the liquidity primitive (Gap 2.4).
12. **Add mitigated/unmitigated OB grading** and grade BOS quality by prior purge (Gap 4.3 / Missing 5.3).
13. **Replace composite scores with eligibility filters + sequence completion** (Section 7).

## Priority 4 — Honesty

14. **Rebrand the output.** What you have built is a *systematic heuristic trading assistant inspired by
    ICT concepts* — it is not ICT, and it must never tell itself it is. Add a daily discipline check that
    asks: *"Is there ONE setup with a complete sequence in a valid window — or nothing?"* and prefer
    nothing, often. That "nothing" is the most ICT thing you can do.

---

# VERDICT

The system honors the **shape** of ICT — sweeps, MSS, killzones, PD arrays, the lecture models — but
violates the **physics**:

- it lets **time** be a *multiplier* instead of a *gate* (Section 1),
- it lets **liquidity** be one scored feature instead of the *fuel* of the whole engine (Section 2),
- it lets a **democratic vote and historical win rates** replace the *HTF dominance chain* (Section 3).

Fix the three first-principle violations first; everything else is polish. And above all — a system that
trades my methodology must learn to say **"nothing"** far more often than it currently does. The engine
that only trades when one full sequence completes, in one valid window, toward one clear draw, is the
engine that survives. Everything else is a slot machine with better labeling.

*— J. Huddleston (as imagined)*
