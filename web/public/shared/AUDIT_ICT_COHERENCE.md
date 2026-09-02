# ICT Coherence Audit — Top-to-Bottom System Review
## July 31, 2026 — 2:30 PM NY

---

## Principle: Time and Price Are The Only Truth

ICT's core premise: the chart tells the story. Time (session, killzone, macro window) and price (structure, liquidity, delivery) are the ultimate arbiters. Everything else — model names, phase labels, confidence scores — is derivative. The system should ground every decision in time+price, not in abstractions.

---

## GAP 1 — DAILY BIAS: Three Competing Authorities, No Arbiter

**ICT says**: "The daily bias determines everything. Without it, you cannot distinguish manipulation from distribution."

**Our system**: Three different bias calculations that produce different answers:

| Source | Method | EURUSD today |
|--------|--------|-------------|
| Weekly Profile | 1W→1D→4H→15m alignment | BULLISH (75%) |
| One Trade Setup | 1W→1D→4H→15m alignment | NEUTRAL |
| HTF Bias (engine) | 1D structure | BEARISH |

Three answers: BULLISH, NEUTRAL, BEARISH. When they disagree, the model scoring picks whatever the Stage 05 code uses (`bias1d`), ignoring the weekly profile's anchor. There's no mechanism for time+price to resolve the conflict.

**The ICT answer**: The daily chart is the parent. Weekly provides context, 4H provides refinement, but the daily bias is the anchor. If 1D says BEARISH, the system should trade BEARISH. The weekly profile provides the *target zone* (premium/discount), not a conflicting direction.

**Fix**: Make 1D structure the single source of truth for directional bias. Weekly Profile sets the *target* (which zone price is drawing toward), not a competing direction. Daily bias flows from 1D → confirmed/refined by 4H → executed on LTF.

---

## GAP 2 — TIME GATES: Lectures Fire Outside Their Windows

**ICT says**: "The 07:00 AM model fires at 07:00 AM. The 08:30 model fires at 08:30 AM."

**Our system**: Lecture 2 (07:00 AM) ran at 2:00 PM and showed READY. The lecture modules have no time-of-day self-suppression.

| Lecture | Window | Currently gates itself? |
|---------|--------|------------------------|
| Lecture 2 | 07:00-07:40 NY | ❌ Runs 24/7 |
| Lecture 1 | 08:00-10:00 NY | ❌ Runs 24/7 |
| Lecture 4 | 08:30-10:00 NY | ❌ Runs 24/7 |

**Fix**: Each lecture module should check NY time and return `setupReady: false` outside its window. A 07:00 AM setup detected at 2:00 PM is structurally interesting but not actionable — the time has passed.

---

## GAP 3 — HIGHER TIMEFRAME AUTHORITY: Weekly Should Suppress, Not Just Boost

**ICT says**: "Always respect the higher timeframe. Counter-trend trades have a much lower hit rate."

**Our system**: Weekly Profile gives ×1.4 to agreeing models and ×0.7 to opposing — a boost/reduce, not a suppress. A SELL model on a BUY week still scores and can still win.

**Fix**: When the weekly anchor is clear (confidence ≥ 60%), models opposing it should be reduced more aggressively (×0.3-0.4) or flagged with a warning that requires manual override. The weekly timeframe is the parent — it should have veto power.

---

## GAP 4 — INDUCEMENT: Gate Is After Model Selection, Not Before

**ICT says**: "Do not enter until inducement is swept. Period."

**Our system**: Models score and compete in Stage 04, then the inducement gate blocks entry in Stage 05b. The models don't know the gate is closed. A model can score #1, win the selection, then get blocked — wasting the scoring computation and creating a false "setup ready" expectation.

**Fix**: Move the inducement check BEFORE model scoring. If the gate is closed, all models get scored at 0 or the scoring is skipped entirely. "No inducement = no trade" should be the first check, not the last.

---

## GAP 5 — COHERENCE: Multiple Competing Scores

**ICT says**: Price structure across timeframes should agree.

**Our system**: We compute coherence from 4 different modules:

| Module | Scale | EURUSD today |
|--------|-------|-------------|
| `micro_context.cjs` | 0-10 | 10/10 — PERFECT |
| `coherence_audit.cjs` | 0-100 | 60/100 — C ADEQUATE |
| `fractal_mmxm.cjs` | 0-20 | Varies |
| `invalidation.cjs` | Valid/Invalid | INVALIDATED |

"PERFECT 10/10" alongside "INVALIDATED" is a contradiction. One says textbook setup, the other says structurally broken. The trader (or autonomous system) doesn't know which to trust.

**Fix**: Single coherence score from a unified module. If different dimensions disagree, the lowest score wins (most conservative). "10/10 micro but INVALIDATED structure" = the trade is invalid.

---

## GAP 6 — KILLZONE AUTHORITY: Pipeline Runs 24/7 With Same Weight

**ICT says**: "Setups outside killzones have a much lower hit rate."

**Our system**: The pipeline runs identically at 2:00 AM London KZ and 2:00 PM NY lunch. Session is noted but doesn't gate anything except Silver Bullet (which self-gates to its window).

**Fix**: Outside London/NY killzones, apply a session multiplier to all model scores (×0.5 during Asia, ×0.4 during NY lunch). During off-hours, the system should run in "monitor only" mode — detect setups but flag them as low-confidence.

---

## GAP 7 — MODEL NAME vs PRICE DIRECTION

**ICT says**: The chart tells you the direction. Not the model name.

**Our system**: Models are classified as "buy model" or "sell model" based on their NAME (e.g., "MMXM Buy Model" = BUY). But the actual trade direction comes from the 1D bias, which can contradict the name. We partially fixed this with the lecture+weekly alignment boost, but the root issue remains: model direction should come from PRICE (bias), not from the model's name.

**Fix**: Remove the model name-to-direction mapping. Every model's direction is determined by the daily bias at execution time. "MMXM Buy Model" on a bearish day = NO TRADE (don't force a buy just because of the name). The model name describes the PATTERN it looks for, not the direction it trades.

---

## GAP 8 — LIQUIDITY CLUSTERING: Not Measured or Used

**ICT says**: "The larger ERL pool is the institutional magnet. The side with more equal highs/lows has more resting orders."

**Our system**: IRL/ERL engine identifies buy-side and sell-side pools but doesn't measure which side has MORE liquidity. The HRLR/LRLR module counts defenders but doesn't compare pool sizes to determine the dominant draw.

**Fix**: Add "dominant liquidity pool" metric — which side (BSL or SSL) has more resting orders based on equal level clustering. This directly tells you the institutional magnet direction, independent of bias models.

---

## GAP 9 — DAILY OPEN: Not Anchored as the Reference Point

**ICT says**: "Every session's accumulation begins at the daily open. That's your reference."

**Our system**: PO3 now has daily open detection. One Trade Setup marks session ranges. But the daily open isn't used as the anchor for determining premium/discount within the day. The IPDA module uses 20/40/60-day equilibrium but not the daily open as the intraday reference.

**Fix**: Use the daily open (midnight NY) as the intraday equilibrium reference. Price above open = intraday premium. Price below = intraday discount. This gives a time-grounded reference point that doesn't depend on computed ranges.

---

## GAP 10 — FRACTAL NESTING: IPDA Cascade Not Consumed by Models

**ICT says**: "Price delivers from one equilibrium to another. The IPDA operates fractally across all timeframes."

**Our system**: IPDA computes the equilibrium cascade (1W→1D→4H→1H→15m) but this isn't fed into model scoring. If all TFs are in discount and drawing UP, that should boost confidence. If the cascade is conflicted (1W premium, 1D discount), that should reduce it.

**Fix**: Feed the equilibrium cascade consensus into model confidence. All TFs aligned → +2 confidence. Split cascade → -1 confidence. The fractal nesting of IPDA delivery is one of ICT's most powerful concepts and we compute it but don't use it.

---

## Priority: What To Fix First

| # | Gap | Impact | Effort |
|---|-----|--------|--------|
| 1 | Single daily bias authority | High — resolves contradictory signals | Small |
| 2 | Lecture time gates | Medium — prevents false signals at wrong times | Small |
| 3 | Inducement before scoring | High — saves computation, prevents false readiness | Small |
| 4 | Higher TF veto power | High — respects ICT's core hierarchy | Small |
| 6 | Killzone authority | Medium — prevents low-probability session entries | Small |
| 5 | Single coherence score | Medium — removes contradictory signals | Medium |
| 7 | Model direction from price | High — fixes fundamental model name vs bias conflict | Medium |
| 8 | Dominant liquidity metric | Medium — adds institutional magnet detection | Medium |
| 9 | Daily open as anchor | Low — nice-to-have refinement | Small |
| 10 | IPDA cascade in confidence | Low — uses existing computation | Small |

---

## The Coherent System (Target State)

```
Ground Truth: TIME + PRICE
    │
    ├── TIME: Killzone active? Session window? Macro window?
    │         NO → Monitor only, all scores ×0.4-0.5
    │         YES → Proceed
    │
    ├── PRICE: 1D structure bias = THE directional anchor
    │         Weekly profile sets TARGET ZONE, not competing direction
    │         4H confirms/refines the 1D read
    │         LTF (15m/5m/1m) provides entry timing
    │
    ├── GATE: Inducement swept? ← FIRST CHECK before any model scores
    │         NO → All models suppressed, no trade
    │         YES → Proceed to model scoring
    │
    ├── MODELS: Scored with direction FROM PRICE (1D bias), not from name
    │         Weekly anchor: ×1.4 aligned, ×0.3 opposing (veto)
    │         Killzone: ×1.0, Off-hours: ×0.5
    │         Lecture ready + time-aligned: priority boost
    │         IPDA cascade aligned: +confidence
    │
    ├── COHERENCE: Single score from unified module
    │         If any dimension INVALIDATED → trade is INVALID
    │         Lowest score wins across all dimensions
    │
    └── EXECUTION: Entry at PD array after inducement + MSS
                  SL beyond swept extreme
                  TP at dominant liquidity pool
```
