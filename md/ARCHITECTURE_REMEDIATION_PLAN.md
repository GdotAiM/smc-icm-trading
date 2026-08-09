# ARCHITECTURE REMEDIATION PLAN — SMC-ICM TRADING

## From a scoring leaderboard to a decision pipeline
### An engineering implementation plan, written for a student new to systems thinking

> This document takes the ICT audit (`md/ICT_AUDIT.md`) and turns every identified gap into a concrete
> engineering work package. For each package you will get: the problem, the architectural principle,
> the design, the tests, and — most importantly — **why**, explained in plain language so a student can
> understand the reasoning behind every decision.

---

# PART A — THE MENTAL MODEL

## A1. The core problem in one sentence

**Today the system asks "which of 17 models scores highest?" — a marketplace.
It must instead ask "is there exactly one setup whose full sequence has completed in its valid window?" — a filter.**

This is the single biggest architectural change. Everything below serves it.

## A2. Why the current design is structurally weak (student lens)

Imagine a restaurant. The current system is a restaurant where 17 chefs all cook at once, every dish gets
a "tastiness score" multiplied by how much the customer likes the cuisine that day, and the dish with the
highest number is forced onto the customer.

Problems with that model:

1. **The 17 chefs cook regardless of the time of day.** Lunch dishes get served at midnight and just get a
   "×0.4 penalty." But a dish served at the wrong hour is *not food* — it's a mistake.
2. **The customer's mood is "weighted" into the score.** "He's 60% hungry for soup, multiply every soup by
   1.3." That's not a decision, that's arithmetic pretending to be one.
3. **Nobody knows why one dish beat another.** The final number hides every ingredient.

The fix is to think like an **assembly line** (a *pipeline*), not a marketplace:

```
Raw material → Sorting → Inspection (several quality gates) → Assembly → Packing → Shipping
```

If ANY inspection step fails, the item is rejected. There is no "the item scored 8/10 so ship it anyway."
An item is either fit for purpose or it isn't. Trading decisions are exactly the same: a setup is either
*complete and in-window* or it is *nothing*.

## A3. The five architectural principles we will apply

These are the engineering rules that close the gaps. A student should memorize these — they apply to
every system you will ever build.

### Principle 1 — Single Source of Truth (SSOT)
**Rule:** Each fact about the world is computed in exactly ONE place, and every other module imports it.
**Why:** If three modules each compute "what time is it in New York" with slightly different tables, they
will disagree and you cannot tell which is right. If one module is the authority, disagreements are
impossible by construction. This closes audit Gap 6.2 (conflicting session times), Gap 4.1 (fake ATR),
Bug 6.4 (three cycle sources).

### Principle 2 — Separate Facts from Judgment
**Rule:** The system has a *context layer* that computes objective facts (where is the liquidity, what
broke structure, what time is it) and a *policy layer* that decides (should we trade). Facts never make
decisions; decisions never fabricate facts.
**Why:** Today the system *fabricates* facts — e.g., it invents a PO3 cycle from the day of the week
(Gap 1.2) because the fact-layer was missing. When you separate the two, every decision can be traced to
a real, verifiable fact.

### Principle 3 — Gates over Multipliers
**Rule:** A decision element is either a **boolean gate** (pass/fail) or it is not a decision element at
all. Never multiply confidence numbers together.
**Why:** Multiplying scores (structural × cycle × perf × session …) is numerology — the factors are
correlated, the cycle factor can be fabricated, and nothing validates the final number (audit Section 7).
A gate is binary: the window is open or it isn't; the sequence completed or it didn't. Binary decisions
are testable, explainable, and safe.

### Principle 4 — Config over Code for all numbers
**Rule:** Every tolerance, window, buffer multiple, and threshold lives in a validated configuration
file — never buried in a function.
**Why:** When numbers are hardcoded in 15 places, fixing a bug means finding 15 copies (see fake ATR).
When they live in one config file that is validated at startup, a change is one edit + one test.

### Principle 5 — Explainability by Construction
**Rule:** Every decision (yes OR no) must be able to print the exact chain of gates that produced it.
**Why:** A discretionary methodology is useless if you cannot audit *why* a trade was taken or refused.
This is how a human supervisor (you) can trust and correct the system. It is also the foundation of the
learning loop: you cannot improve what you cannot inspect.

---

# PART B — TARGET ARCHITECTURE

## B1. The new pipeline

```
┌─────────────────────────────────────────────────────────────────────────┐
│  DATA LAYER          (facts: no opinions)                                │
│  ─ candles → lib/metrics.cjs (real ATR) → lib/time.cjs (ONE clock)       │
│  ─ engine reports → lib/structure.cjs (BOS/CHoCH, quality, OBs graded)   │
│  ─ lib/liquidity.cjs (equal highs/lows, clusters, swept/unswept)         │
│  ─ lib/dealing_range.cjs (sweep-to-sweep range + equilibrium)            │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────────┐
│  NARRATIVE LAYER     (one bias, dominance chain)                         │
│  resolveBias(1W → 1D → 4H) → { direction, governingTF }                  │
│  confidence := windowQuality + arrayProximity + externalDraw              │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────────┐
│  ELIGIBILITY LAYER   (time gates — booleans)                             │
│  for each model in registry:                                             │
│     inWindow(model.timeWindows) ?            — else SKIP (not scored)    │
│     intrinsicDirection vs narrative ?         — else SKIP                 │
│     purge prerequisite (if model requires)   — else SKIP                 │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────────┐
│  SEQUENCE LAYER      (per-model confirmation matrices — booleans)        │
│     each step: sweep? reversed? MSS on the STRUCTURE TF? array mitigated?│
│     complete = ALL steps pass                                             │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────────┐
│  PRICE PLAN LAYER    (only for a COMPLETE setup)                         │
│     entry = PD array / IFVG CE / breaker                                 │
│     SL = structural invalidation + real ATR buffer                        │
│     TP1/TP2 = next external liquidity draws (draw engine)                 │
│     no draw  →  NO TRADE                                                 │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
┌─────────────────────────────────────────────────────────────────────────┐
│  RISK + EXECUTION LAYER                                                  │
│  position size from SL distance · risk gates · paper order               │
│  EXPLAINABILITY: every step logs "gate → passed/failed → why"            │
└─────────────────────────────────────────────────────────────────────────┘
```

## B2. What disappears from the old design

| Old element | Why it disappears |
|---|---|
| `score = structural × cycle × perf × session × PO3 × weekly-profile` | Multiplicative numerology (A3, Principle 3) |
| 6-source weighted vote | Democracy replaces dominance (audit Gap 3.1) |
| Day-of-week cycle phase | Fabricated fact (audit Gap 1.2) |
| Performance multiplier from history | Anti-ICT (audit Gap 3.3) |
| `\|4H swing\| × 0.15` as "ATR" | It isn't ATR (audit Gap 4.1) |
| Per-module time tables | Conflicts by construction (audit Bug 6.2) |

## B3. What stays (it was correct)

- Sweep → reversal → MSS-with-close engine
- Silver Bullet windows, lecture models L1/L2/L4 mechanics
- SL at structural invalidation, never at a pool
- Worst-dimension-wins (formalized as AND-gates)
- Lunch-window blocking

---

# PART C — WORK PACKAGES (each closes specific audit gaps)

> For each package: **Gap** → **Design** → **Why (student lens)** → **Tests / Definition of Done**.

---

## WP-1 · Real ATR as a shared utility
**Closes:** audit Gap 4.1 (fake ATR), Bug 6.1 (~15 call sites)

**Design**
- New file `tools/lib/metrics.cjs` — the ONLY place ATR is computed.
  - `calcATR(candles, period = 14)` — true range = `max(high−low, |high−prevClose|, |low−prevClose|)`, then average.
  - `structureSL({ direction, swingLevel, atr, bufferMult = 0.4 })` — SL = swingLevel ± buffer, computed from real ATR.
- Delete every `|swHi − swLo| * 0.15` occurrence in `run_pair.cjs`, `tier1.cjs`, `invalidation.cjs`, `cross_system_guard.cjs`.
- Buffer multiple becomes config (`_config/micro_params.md` or a new `engine_config.json`).

**Why (student lens)**
ATR answers "how much does price typically move in one candle?" If you pretend 15% of a swing range *is*
that, you're guessing the market's heartbeat from its footsteps. Every stop-loss in the engine is built
on that guess. Fix the measurement once, in one place, and every downstream calculation becomes honest.
This is Principle 1 in action — the smallest fix with the largest ripple.

**Definition of Done**
- ATR computed from true ranges on any candle series (no NaN, correct on known test series).
- Zero occurrences of the old formula anywhere in `tools/`.
- All SL/TP output values change in the expected direction on a known dataset.

---

## WP-2 · One clock: the shared session/time module
**Closes:** audit Bug 6.2 (conflicting windows), Gap 1.1 (London PM fake killzone), Gap 1.4 (SB gate)

**Design**
- `tools/lib/time.cjs` becomes the **only** time authority. It exports:
  - `getNYSession()` → `{ name, inKillzone }` using the TRUE killzone set: London 02–05, NY AM 08–11, NY PM 13–16. **No `londonPM` killzone.**
  - `getSBWindows()`, `getJudasWindows()`, `getSessionQuality()`.
- `ny_time.cjs`, `bread_and_butter.cjs`, `high_precision_secrets.cjs` are refactored to import from it; their internal hour tables are deleted.
- Session multiplier concept **removed** from scoring (see WP-8 — windows become gates, not weights).

**Why (student lens)**
Imagine three employees each keep their own calendar, and they disagree about whether it's lunchtime.
Which calendar is right? Nobody can tell. That's your system today. One shared clock means the question
"is this a valid window?" has exactly one answer in the entire codebase. And by removing the fake
"London PM" killzone we stop treating a dead hour as trading hours — you can't trade a window that
doesn't exist.

**Definition of Done**
- `grep` for hour-range tables across `tools/` returns only `lib/time.cjs`.
- Golden tests: known NY times across a DST transition resolve identically in every importing module.
- `isKillzone()` excludes 05–08 NY everywhere.

---

## WP-3 · Cycle phase from structure only (no calendar)
**Closes:** audit Gap 1.2 (day-of-week cycle), Bug 6.4 (three competing sources)

**Design**
- `po3_state_machine.cjs` transitions become the **sole** cycle source:
  - Accumulation → Manipulation (sweep + non-neutral bias)
  - Manipulation → Distribution (BOS + displacement > 0.8×)
  - Distribution → Expansion (ATR > 2.0× or 3+ FVGs)
  - Expansion → Accumulation (exhaustion CHoCH / 2+ sweeps)
- **Delete `getCycleEstimate()`** in `ny_time.cjs`.
- `run_pair.cjs` reads ONLY the structure-derived phase. If the state machine cannot decide → phase =
  `UNKNOWN`, system confidence reduced, **no fabricated phase**.
- The macro-context markdown parser (`/\*\*([A-Z]+)\*\*/`) is removed — cycle comes from a machine-readable
  JSON field, not regex over markdown.

**Why (student lens)**
A cycle is a *description of what price just did*, not a *prediction from the calendar*. Saying "it's
Tuesday so the market is manipulating" is like saying "it's the 3rd of the month so the tide is high."
The tide follows the moon (price structure), not the date. When you can't tell what the market is doing,
the honest answer is "I don't know" — and the system must be allowed to say that instead of inventing an
answer. This is Principle 2 (facts vs judgment): a cycle is a fact about structure; the calendar is not
a fact about the market.

**Definition of Done**
- No calendar-based phase exists in the codebase.
- Given synthetic engine reports (known events), the phase always matches the transition table.
- If structure data is missing, output contains `phase: UNKNOWN` and the decision is blocked with an
  explanation — never a default cycle.

---

## WP-4 · Dominance-chain bias (kill the vote)
**Closes:** audit Gap 3.1 (weighted vote), and removes the fake confidence % 

**Design**
- New `tools/lib/narrative.cjs` with `resolveBias({ bias1W, bias1D, bias4H })`:
  - Resolve **in order**: 1W governs → if neutral, 1D governs → if neutral, 4H governs.
  - A lower timeframe opposing a governing higher timeframe is labeled **pullback**, not a vote.
  - Returns `{ direction, governingTF, pullback? }`.
- Confidence is recomputed from **confluence quality**, not vote margin:
  - `+` if in a valid killzone window (from WP-2)
  - `+` if price is within a defined distance of an unmitigated PD array
  - `+` if a clear external liquidity draw exists (from WP-7)
- `run_pair.cjs`'s `votes` array is deleted.

**Why (student lens)**
A democracy works when everyone votes on the same question. Here each timeframe is answering a
*different* question: the weekly says "the month is bullish," the 1H says "there was a pullback this
hour." Averaging different questions gives a meaningless number. Dominance says: the big context wins,
and the small context tells you when to enter *within* it. This also kills the fake "94% confidence"
number — confidence should come from *what you can see* (window, array, draw), not from how many
timeframes happen to agree.

**Definition of Done**
- A table of test cases: {1W,1D,4H} combos → expected governing bias; opposing-1H case yields a
  pullback label, never a swing in confidence.
- `biasConfidence` in outputs is computed from window+array+draw, never from vote margin.

---

## WP-5 · Dealing range built from sweep-to-sweep extremes
**Closes:** audit Gap 2.2 (last-swing range), Gap 2.3 (three premium/discount definitions)

**Design**
- New `tools/lib/dealing_range.cjs`:
  - Scan back from current price for the **last external liquidity sweep above** (a high that raided
    prior highs) and **last external liquidity sweep below** (a low that raided prior lows).
  - The range = those two extremes. Equilibrium = midpoint. Premium = upper half, Discount = lower half.
  - **If no sweep exists on either side → no range** (return `null`) — do not fall back to last swings.
- Delete the 20-day-mean premium/discount definitions in `one_trade_setup.cjs` and `time_price_grid.cjs`;
  `ipda.cjs` reads equilibrium from this module.
- A `getPremiumDiscount(price)` helper is the single answer to "are we premium or discount?"

**Why (student lens)**
A dealing range is like a boxing ring: it's defined by the ropes the fighter has *hit*. If you draw the
ring from where the fighter last happened to stand, you get a ring that moves every step. The range must
be anchored to the *sweeps* (the ropes that were actually struck). And premium/discount is the answer to
"where in this ring are we?" — if three different modules answer that question three different ways, the
left hand doesn't know what the right hand is doing. One range, one equilibrium, one premium/discount.

**Definition of Done**
- Synthetic sweep data → correct range and equilibrium; missing sweeps → `null`, and the trade is
  blocked with "no operative dealing range."
- `grep` for 20-day-equilibrium premium/discount returns zero hits outside `lib/dealing_range.cjs`.

---

## WP-6 · Liquidity primitives: ATR-relative equal highs/lows
**Closes:** audit Gap 2.4 (price-relative tolerance), Gap 2.1 (IRL = FVGs only)

**Design**
- Promote the `lecture2_setup.cjs` helper into `tools/lib/liquidity.cjs`:
  - `findRelativeEqualLevels(candles, atr)` — tolerance `|p1 − p2| / ATR < 0.15`, **equal both
    directions** (remove the one-sided "right shoulder" constraint).
  - Mark a **cluster** (the zone between the two levels) as the liquidity object, with `swept` /
    `unswept` state.
- IRL in `irl_erl_engine.cjs` is expanded from FVGs-only to: equal highs/lows inside the range +
  FVGs, ranked by nearest unmitigated internal liquidity.
- This module becomes the **only** producer of liquidity objects; `liquidity_marker.cjs` imports it.

**Why (student lens)**
Two highs that look "equal" to a human are equal *because the market is trading in ATR-sized chunks* —
a 3-pip gap between highs means nothing on EURUSD, but the same 3 pips on a quiet morning is huge.
Tolerance must be relative to the noise (ATR), or your "equal" levels are arbitrary. Also: fuel is fuel —
a stop cluster is a stop cluster whether it sits at an FVG or at equal highs. Restricting the fuel to
FVGs (old Gap 2.1) is like a race car that only fills up from one brand of pump. It will run out.

**Definition of Done**
- Unit tests: known equal-high formations detected with ATR-relative tolerance; the one-sided constraint
  no longer drops clusters.
- IRL output contains equal-high/low objects, not only FVGs.

---

## WP-7 · Draw-on-liquidity target engine (TP = the draw)
**Closes:** audit Gap 2.5 (arbitrary 1:1/2:1 TP), Missing 5.5 (previous-session H/L draws)

**Design**
- New `tools/lib/draw.cjs`:
  - `nextDraw({ direction, liquidityMap, price })` → the nearest **external liquidity pool** in trade
    direction (BSL above / SSL below), with pool type and distance.
  - TP1 = first external pool; TP2 = next pool or daily/weekly extreme.
  - **If no external draw exists → returns `null`, and the setup is "no trade."** No 1:1 fallback.
- The default TP fallback `entry −/+ slDist` and `2× TP1` are deleted from `run_pair.cjs`.
- Previous-session highs/lows (London high/low, NY AM high/low) are added as draw references for the
  current window (from WP-2 session ranges).

**Why (student lens)**
You don't exit because "price moved twice my risk." You exit where the *algorithm is going* — the next
pile of resting stops. If you cannot name where price is being drawn, you do not understand the trade,
and guessing at 1:1 is just hoping. A race car doesn't turn because it has driven "two straightaway
lengths" — it turns where the track bends. The draw engine is the map of the track. No map → don't drive.

**Definition of Done**
- Synthetic liquidity maps produce the correct nearest-draw target.
- "No draw" case returns no-trade, and no 1:1/2:1 TP appears anywhere in outputs.

---

## WP-8 · Model registry + per-model confirmation matrices (the core rewrite)
**Closes:** audit Section 0 (core misconception), Gap 3.2 (direction contradiction), Gap 3.4 (universal
checklist), Gap 1.4 (SB force-boost), Gap 4.5 (CISD), and the whole scoring-stack problem (Section 7)

**Design**
- Create `tools/models/registry.cjs` containing all 17 models as data + a single evaluator. Each model:
  ```
  {
    id: "silver_bullet",
    timeWindows: [{ session: "nyAM", start: 10, end: 11 }],
    intrinsicDirection: "narrative",   // or "counter-sweep", "fade-first-move", etc.
    sequence: [                        // per-model confirmation matrix (ALL must pass)
      "sweep", "reversal", "mss_on_structure_tf", "array_mitigated", "1m_sentence"
    ],
    purgeRequired: true
  }
  ```
- The pipeline replaces scoring:
  1. **Eligibility:** in window? intrinsic direction consistent with narrative (WP-4)? purge present?
     → if no, SKIP (model never produces a score).
  2. **Sequence:** every step in the matrix passes (checked on the structure's own timeframe) → complete.
  3. **Output:** if exactly one model is complete → build price plan (WP-7 + WP-1). If none → NO TRADE.
- Mutual exclusivity is handled at eligibility (only time-eligible models are even evaluated), and if
  two complete, the tie is resolved by (a) higher tier, then (b) whichever is nearest a draw — never by
  composite multiplication.
- Delete: the scoring formulas in `run_pair.cjs` (lines ~1012–1206), `CYCLE_MODEL_WEIGHTS`,
  `PO3_MODEL_PHASE_MAP`, session multiplier, and the SB "force boost."

**Why (student lens)**
This is the heart of the fix. A model is not a "dish with a score" — it's a **recipe with a checklist**.
You only cook a recipe in its own window (you don't bake bread at 3 AM), only when it fits the day's
intent, and only when every step of the recipe actually happened (the dough rose, the oven was hot).
If one step failed, the bread is not "less good" — it's not bread. This is Principle 3 (gates over
multipliers): a checklist of booleans, not a multiplication of confidences. It also kills the
"all models trade the bias, except lecture models which override" contradiction — each model now has an
*intrinsic* direction and is only eligible when it agrees with the narrative.

**Definition of Done**
- A registry entry for all 17 models with explicit timeWindows, intrinsicDirection, and sequence.
- The word "score" no longer exists in the decision path (eligibility + sequence only).
- Every model's sequence matrix has at least one test with a known pass and a known fail case.
- The two models that cannot coexist in a window (e.g., Silver Bullet vs Asian Range Breakout) are
  provably never both evaluated.

**Status:** 🚧 **In progress — shadow mode (plan D2).** `tools/models/registry.cjs` + `tools/models/steps.cjs`
implement the 17-model registry, eligibility (window/direction/purge) and per-model sequence matrices;
`tests/models_registry.test.cjs` covers the DoD (79/79 suite green). `run_pair.cjs` runs the registry in
**shadow** alongside the legacy ranking (`stages/04_model_selection/shadow/<pair>_registry.md` +
console disagreement report). The legacy ranking block is NOT yet deleted — per D2, review shadow
disagreements across live days, tune sequences, then flip the decision path.

---

## WP-9 · Inducement per-model, on the structure's timeframe
**Closes:** audit Bug 6.6 (1m noise validating 15m thesis), Gap 1.x (universal binary inducement gate)

**Design**
- Inducement moves **into each model's sequence** (from WP-8). Models that require it list `"sweep"`,
  `"reversal"`, `"mss_on_structure_tf"` as their steps.
- The inducement engine is refactored: the structural event, the pullback, the sweep, and the MSS are
  all evaluated on the **same timeframe as the structure break** (15m event → 15m/5m confirmation, not
  1m). 1m is used only for the fine "sentence" where a model specifies it.
- `inducement_engine.cjs` becomes a library used by the registry, not a standalone pre-gate that zeros
  all models.

**Why (student lens)**
Don't use a microscope to verify a telescope. A structure break on the 15m chart is a *15m-sized* fact;
confirming it with 1m candles is reading a fingerprint to check a door was unlocked. Each concept must
be validated at the scale where it lives. This also stops one universal gate from killing valid setups
that don't require inducement (like the Silver Bullet's own sequence) — a recipe's steps are that
recipe's own, not the whole menu's.

**Definition of Done**
- The inducement library validates on the structure TF; no 1m-only confirmation of a 15m/1H event.
- No global "zero all models" inducement block remains; each model's sequence decides.

**Status: ✅ COMPLETE (Aug 9)**
- `tools/inducement_engine.cjs` refactored into a structure-TF library. `findStructuralEvent`,
  `findFirstPullback`, `markInducement`, `checkInducementSweep`, and `getEntryGate` now run on the
  same timeframe as the structure break (default 15m). Default `confirmTF = structureTF`; 1m is used
  only when a model passes `confirmTF: "1m"` explicitly.
- `run_pair.cjs` no longer runs a hard pre-scoring gate. `runInducementCheck(PAIR, { structureTF: "15m",
  confirmTF: "15m" })` feeds structure-TF sweep/reversal/MSS facts into the WP-8 registry context
  (`hasSweep`, `hasReversal`, `mss`) instead of zeroing every model when the gate is closed.
- Removed the global `inducementBlocked` zero-all-models block and the NO-TRADE override it forced.
- Tests: `tests/inducement_engine.test.cjs` — 6 tests assert sweep + reversal + MSS confirm on 15m
  (bullish and bearish), gate closes when the level is never swept, and the default confirm TF is the
  structure TF (never 1m). Regression suite: `Load: tools/inducement_engine.cjs` passes.

---

## WP-10 · Memory becomes audit-only (no live weights)
**Closes:** audit Gap 3.3 (performance multiplier)

**Design**
- Remove `perfMultiplier` from every decision path.
- `performance_ledger.cjs` and `trade_graph.cjs` remain, but output **audit reports only**:
  - model win-rate by session, day-type, and conditions (for the *operator* to review)
  - systematic-mistake detection ("entries at London close on Mondays lose")
- These reports are surfaced in the dashboard, never fed back as a weight.

**Why (student lens)**
"Past performance is not a guarantee of future results" — literally every trading disclaimer says this,
and here it's doubly true because every day is a unique delivery context. Weighting today's validity by
yesterday's win rate is like choosing your next opponent by how you did against the *last* opponent.
History is for *learning*, not for *voting*. Keep the journal, use it to improve the operator's process —
but never let the market's memory pretend to predict the market.

**Definition of Done**
- `grep` for `perfMultiplier` in decision code → zero hits.
- Ledger output exists and is dashboard-visible; it is not referenced by the pipeline.

**Status: ✅ COMPLETE (Aug 9)**
- `tools/run_pair.cjs` no longer loads `perfWeights` from the ledger. The ledger still runs once per
  pair, but only for an audit line (`📊 Audit only: … not used as a weight — WP-10`); the historical
  model weights are never multiplied into `m.score` / `m.max`.
- Removed `m.perfMultiplier`; the Stage-04 report table now shows `Cycle ×` and `Session ×` only.
- The ledger still writes `shared/performance/model_stats.md`, `session_stats.md`, `pair_stats.md`
  (dashboard-visible audit reports). `modelWeights` remains in its JSON output for the operator to
  review, but no decision code consumes it.
- Guard tests: `tests/wp10_audit_only.test.cjs` greps the decision path for `perfMultiplier` /
  `perfWeights` / `perfWeight` (zero hits) and asserts the three audit reports exist. All 86 tests pass.

---

## WP-11 · Order-block grading (mitigated vs unmitigated)
**Closes:** audit Gap 4.3 (raw SMC OBs)

**Design**
- In `lib/structure.cjs` add OB grading:
  - `mitigated` — price has already returned into the block; `unmitigated` — still fresh.
  - Require displacement on the originating leg (ATR-based, from WP-1).
  - A block fully consumed (price through the entire block) is excluded from "unmitigated" sets.
- Registry sequences referencing "array" steps must use **unmitigated** arrays only.

**Why (student lens)**
An order block is like a spring that's been stepped on. Once price has already pushed back into it, the
spring has delivered its energy — it's a *used* spring. Trading a used spring as if it were fresh is
why entries fail. "Fresh vs used" (unmitigated vs mitigated) is a *fact about the block*, and it must be
computed once, in the fact layer (Principle 2).

**Definition of Done**
- OB objects carry `mitigated` / `unmitigated` and `consumed` flags, set by tests on known series.
- No model sequence can pass an "array" step against a consumed block.

**Status: ✅ COMPLETE (Aug 9)**
- New fact layer `tools/lib/ob_grading.cjs` grades every order block from the candles that follow
  the OB candle: `mitigated` (price returned into the block), `consumed` (close through the whole
  block), `unmitigated` = fresh **and** displacement-backed (ATR gate `minImpulseAtr = 1.0`,
  matching the engine's `obImpulseMinAtr`). Falls back to the engine's `kind` when candles are
  unavailable. Helpers: `unmitigatedOf` / `mitigatedOf` / `consumedOf` / `arrayInPlayFor`.
- `tools/run_pair.cjs` grades OBs per TF (1D/4H/1H) once at load. `hasOB` / `uniqueOBs` now mean
  **unmitigated** blocks only; the Stage-02 OB table shows the grade; the "Mitigation Block" legacy
  model uses `mitigatedOf` instead of a dead `mitigationFraction` filter; the registry context gets
  `mitigatedOBs`, `consumedOBs`, and `consumedAtPrice`.
- `tools/models/steps.cjs`: the `ob` step requires unmitigated blocks; `array_mitigated` fails
  defensively when the only array at price is consumed.
- Tests: `tests/ob_grading.test.cjs` (11 tests) — grades set on known bullish/bearish series
  (unmitigated / mitigated / consumed), displacement gate, `unmitigatedOf` set exclusion, `kind`
  fallback, and a registry model cannot pass an "array" step against a consumed block. All 97 tests
  pass; regression suite unchanged (10 pre-existing data-only failures).

---

## WP-12 · Add the missing concepts
**Closes:** audit Section 5 (5.1–5.8) and Gap 4.2 (rejection blocks), Gap 4.4 (equal-levels),
Gap 4.6 (weekday multipliers)

| Missing concept | Design | Why (student lens) |
|---|---|---|
| **5.1 Draw-on-liquidity as organizing question** | The pipeline's first question after narrative is `nextDraw()` (WP-7). All entry steps are read in the context of the draw. | If you don't know where price is being pulled, you can't judge whether a candle is a delivery or a fake. |
| **5.2 Mitigation as trigger** | "Array step" in a model's sequence = price returned to the *origin* of the displacement (mitigation), not merely "near the block." | An entry is valid when the imbalance is being *repaid* — that's the mechanism, not proximity. |
| **5.3 BOS quality / purge prerequisite** | A BOS without a prior liquidity purge is flagged low-quality; models that need a high-quality BOS require `purgeRequired: true` (registry). | A break without a purge is usually retail noise — the algorithm breaks structure only after it has *collected* the fuel. |
| **5.4 Event-time quality** | Each sweep/MSS is timestamped and graded: raid in the first 30 min of a killzone > mid-session raid. Used in eligibility, not multiplied. | A raid at 08:30 is the algorithm's scheduled delivery; a raid at 14:30 is filler. Timing is a *qualitative* quality, not a number to multiply. |
| **5.5 Previous-session H/L draws** | London/NY AM high-low added as active draws for the current window (with WP-2 sessions). | Today's intraday moves are drawn toward yesterday's extremes and this session's extremes — the most immediate fuel. |
| **5.6 OSOK as default** | A daily discipline gate: one setup, one trade, then done. Registry output enforces "single complete setup or nothing." | One full commitment beats five partial ones. The system must be *capable* of saying nothing — most days, that is the correct answer. |
| **5.7 Consistent wick vs close rule** | A single config value `LIQUIDITY_RAID_CONFIRMATION = "close" | "wick"` used by every sweep detector. | Pick one definition of "raided" and use it everywhere, or the left hand sees a raid the right hand doesn't. |
| **5.8 Rejection as leading signal** | Wire `detectRejection` (rewritten per Gap 4.2) as a *leading* flag before MSS completes; it raises "watch" status but cannot enter alone. | The first sign of a turn is often a long wick at the array. Watch it, confirm with MSS, then act. |
| **Gap 4.2 Rejection-block definition** | Rejection = at a PD array + preceded by sweep + followed by displacement; wick geometry is only a symptom. | A long wick in the middle of nowhere is noise; a long wick *at the array after a sweep* is intent. |
| **Gap 4.6 Weekday multipliers** | Delete fixed confidence multipliers; day *type* (range/expansion/reversal) is a prior folded into the PO3 read (WP-3). | A day's character is a tendency, not a license to boost every setup 1.3×. |

**Definition of Done**
- Each missing concept has a module or registry field and a unit test.
- No weekday confidence multiplier exists anywhere.

### WP-12 implementation status (high-value subset — Aug 9)
Unit tests: `tests/wp12_concepts.test.cjs` (15 tests). Full suite: 112 passing.

| Item | Status | Evidence |
|---|---|---|
| 5.1 Draw-on-liquidity (nearest first) | ✅ already present, now tested | `tools/lib/draw.cjs` `nextDraw` sorts by distance and filters `UNMITIGATED`; `poolTarget` fed to registry ctx |
| 5.2 Mitigation as trigger | ✅ done in WP-11 | `array_mitigated` requires fresh/unmitigated arrays (WP-11) |
| 5.3 BOS quality by purge | ✅ enforced + tested | every `purgeRequired` model now checks a sweep-bearing step; `ndog_nwog_news` sequence gained the `sweep` gate |
| 5.4 Event-time quality | ✅ new module + registry fields | `tools/lib/killzone.cjs` (`killzoneFor`) → `registryCtx.killzone` / `killzoneName` |
| 5.5 Previous-session H/L draws | ✅ new module + registry fields | `tools/lib/session_levels.cjs` (`previousSessionHL`) → `registryCtx.prevSessionHigh/Low` |
| 5.6 OSOK as default | ✅ verified present | `registryNoTrade` force-block in `run_pair.cjs` (OSOK override) |
| 5.7 Consistent wick vs close | ✅ new module + applied | `tools/lib/raid_config.cjs` (`LIQUIDITY_RAID_CONFIRMATION`, env-configurable, default `wick`) consumed by `inducement_engine.cjs` sweep check |
| 5.8 + Gap 4.2 Rejection as leading signal | ✅ new module + registry field | `tools/lib/rejection.cjs` (`detectRejection`, opposite-color candle at the extreme) → `registryCtx.rejection` / `rejectionCandle` |
| Gap 4.6 Weekday multipliers | ✅ removed + tested | `ny_time.cjs` `DAY_PROFILES` multipliers deleted (`open` flag only); `pre_entry_check.cjs` Friday `×dayMult` warning removed |
| Gap 4.4 Equal-levels | ✅ wired + tested | symmetric ATR-relative equal-high/low clusters already in `tools/lib/liquidity.cjs`; now fed to `registryCtx.equalHighs/equalLows` on the 1h structure TF; tests cover the higher-right-shoulder case the old one-sided constraint dropped |

---

## WP-13 · Align the 1m "sentence" gate and detector
**Closes:** audit Bug 6.5 (threshold disagreement)

**Design**
- A single config constant `INVERSION_MIN_SCORE` (and a shared `inversionRules` object) in the
  config file (Principle 4). Both `cross_system_guard.cjs` and `fractal_mmxm.cjs` import it.
- The gate's block condition and the detector's pass condition are derived from the same constant.

**Why (student lens)**
Two modules guarding the same door with two different locks, and neither knows the other's key. The
security guard blocks you, the detector says you're fine — or vice versa. When two checks share one
definition, they can't contradict each other. Config over code (Principle 4) makes the single source
obvious and auditable.

**Definition of Done**
- The gate and detector agree on a table of edge-case inputs.

---

## WP-14 · Rebrand + discipline: the system says "nothing" and means it
**Closes:** audit Section 0 (core misconception), Priority 4

**Design**
- Every output page header changes from model rankings to: `SETUP COMPLETE` / `NO TRADE — <gate that
  closed>`.
- A **daily discipline check** runs at the start of each session: "Is there exactly one complete setup
  in a valid window toward a clear draw? If yes, trade it once. If no, trade nothing."
- The dashboard shows the *gate trace* for every decision (Principle 5): which window, which narrative,
  which sequence steps passed/failed, which draw.

**Why (student lens)**
When you build a system that can say "I don't know / no setup today," you've built a *filter*. When it
can only rank things, you've built a *compulsion machine*. The discipline check is the guardrail that
keeps the filter honest. And gate traces are the report card that lets you (the operator) learn — you
can see exactly where the system misread the market, which is the only way to improve it. A system you
cannot audit is a system you cannot trust.

**Definition of Done**
- A day with zero complete setups produces "NO TRADE" with a full gate trace and no fallback trade.
- All outputs and dashboard panels show gate traces; no ranked leaderboard is rendered.

---

# PART D — IMPLEMENTATION ROADMAP

## D1. Dependency order (what must be built before what)

```
Phase 0 — Foundation (no behavior change, pure refactor)
   WP-1 real ATR → WP-2 one clock → WP-13 thresholds → WP-3 cycle-from-structure
   Rule: build the facts before you build the judgment.

Phase 1 — Narrative & objects (the meaning layer)
   WP-4 dominance bias → WP-5 sweep-to-sweep dealing range → WP-6 liquidity primitives → WP-7 draw engine
   Rule: you cannot judge setups until bias, range, liquidity, and draws are honest.

Phase 2 — The decision core
   WP-8 model registry (eligibility + sequences) → WP-9 per-model inducement → WP-11 OB grading → WP-12 missing concepts
   Rule: only now rewrite the decision path — it depends on every fact layer above.

Phase 3 — Learning & honesty
   WP-10 memory audit-only → WP-14 rebrand + discipline check
   Rule: finish the loop last; never let history influence live decisions.
```

## D2. De-risking: shadow mode

The single safest way to replace a decision engine is **shadow mode**:

1. Keep the old pipeline running (it still prints its outputs).
2. Build the new pipeline in parallel, writing its outputs to `stages/*/shadow/`.
3. For each trading day, record **disagreements**: where the old engine would have traded and the new
   one refused (or vice versa). Log the gate trace for each.
4. Tune until the disagreements are explained and the new pipeline's refusals match what a *human ICT
   practitioner* would have said (you can review the daily traces).
5. Only then flip the switch and make the new pipeline authoritative.

**Why (student lens):** you don't replace an aircraft engine mid-flight. Shadow mode is test-flying the
new engine on a runway next to the old one — same air, same data, no passengers at risk. Disagreement
reports are your checklist of which behavior changed and why. This is how professional teams migrate
critical systems with confidence.

## D3. Verification strategy

| Layer | How we verify |
|---|---|
| **Unit tests** | `tests/` — one test file per lib module: ATR, time, dealing range, liquidity, draw, registry sequences, OB grading. |
| **Golden-master snapshots** | Freeze today's outputs for a known date; after each WP, diff old vs new to see *exactly* what changed. |
| **Integration tests** | Synthetic engine reports through the full pipeline → expected decision + gate trace. |
| **Regression suite** | Keep `evaluation/regression/suite.cjs` green — extend it with the new gate contracts. |
| **Shadow-mode disagreement rate** | The metric that decides when to switch over. |
| **Calibration audit** | `evaluation/benchmarks/bias_accuracy` now also measures *gate-trace* quality, not just direction — did the gate that allowed a trade also tend to produce wins? (Audit, never a live weight — WP-10.) |

## D4. Definition of Done (the whole system)

- [ ] The word **score** does not appear in any decision path (eligibility + sequence only).
- [ ] Every decision prints a full **gate trace** (window → narrative → sequence → draw → plan).
- [ ] **One clock** module is the only time authority; no fake killzones.
- [ ] **Cycle phase** comes from structure only; `UNKNOWN` is a valid, blocking answer.
- [ ] **Bias** resolves by dominance (1W → 1D → 4H), confidence from confluence quality.
- [ ] **ATR** is real period-14, in exactly one place.
- [ ] **Dealing range** is sweep-to-sweep; premium/discount has one definition.
- [ ] **TP** always targets the next external draw; no draw → no trade.
- [ ] All 17 models have registry entries with intrinsic direction + sequence matrices.
- [ ] **No performance multiplier** affects any decision; the ledger is audit-only.
- [ ] Missing concepts (5.1–5.8) implemented and tested.
- [ ] Shadow-mode disagreement rate is explained; new pipeline is authoritative.
- [ ] "NO TRADE" is a common, explainable, and *correct* output.

---

# PART E — RISKS AND HOW WE DE-RISK

| Risk | Likelihood | Mitigation |
|---|---|---|
| Refactor breaks live data flow | High | Phase 0 is pure refactor; golden-master snapshots before every WP; tests first. |
| New pipeline becomes "too strict" (never trades) | Medium | Shadow-mode comparison against human review; tune the *sequence steps*, never by adding multipliers back. |
| Config drift (numbers change silently) | Medium | Startup validation of config; fail loudly on unknown keys; one config per concept. |
| Overfitting the registry to past days | Medium | Registry entries are definitions (from the ICT methodology), not fits to data; tests are synthetic, not historical. |
| Operator trust drops during transition | Medium | Gate traces make every refusal inspectable; dashboards show *why* before they show *what*. |
| Scope creep (rewriting everything) | Low | Strict phase order; each WP is independently shippable; shadow mode means old system still works. |

---

# PART F — GLOSSARY FOR THE NEW STUDENT

- **Layered architecture:** splitting a system into stacked groups where each group talks only to the
  group directly above/below it. Like a company: sales (top) → planning → factory floor → shipping.
- **Single Source of Truth (SSOT):** one authority for each fact, imported everywhere else.
- **Facts vs judgment:** objective measurements (price, time, sweeps) vs decisions (should we trade).
  Never let a decision invent a measurement.
- **Gate:** a pass/fail check. `AND`-gates = all must pass. No partial credit.
- **Multiplier vs gate:** multiplying confidences averages risk; gating is binary. Gates are honest.
- **Composite score:** one number built by multiplying many other numbers. Unsafe: hidden, correlated,
  unvalidated.
- **Shadow mode:** running new logic alongside old logic, comparing outputs, before switching over.
- **Golden-master test:** a saved "known-good" output you diff against after every change.
- **Gate trace:** the printed record of which checks passed/failed and why. Explainability.
- **Per-model confirmation matrix:** each model's own required checklist. A recipe's steps.
- **Intrinsic direction:** what a model *means* by its mechanics (fade the sweep, trade premium→discount),
  independent of the narrative vote.
- **Purge / raid / sweep:** the algorithm knocking through a stop cluster (taking the fuel).
- **Mitigation:** price returning to the origin of a displacement (repaying the imbalance).
- **Draw on liquidity:** the next external stop cluster the algorithm is delivering price toward.

---

*Authored as a systems-architecture remediation plan accompanying `md/ICT_AUDIT.md`.*
*Audit = why. This plan = how. Together they form the change control for the SMC-ICM trading system.*
