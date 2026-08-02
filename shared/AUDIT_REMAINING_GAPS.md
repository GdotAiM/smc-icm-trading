# System Audit — Remaining Gaps
## August 2, 2026

### Coverage Summary

| Layer | Modules | Status |
|-------|---------|--------|
| Stage 00 — Pre-Session | 8 modules (Weekly Profile, Time/Price Grid, High Precision, Opening Ranges, One Trade Setup, Bread/Butter, PO3, IPDA) | ✅ Dense |
| Stage 01 — HTF Bias | Weighted Bias (6 sources) | ✅ Solid |
| Stage 02 — Key Levels | SMC Engine, IRL/ERL, Order Flow, Liquidity Marker | ✅ Solid |
| Stage 03 — Session Time | Killzone, Silver Bullet, Opening Ranges | ✅ Solid |
| Stage 04 — Model Selection | 17 models, stacked boosts | ✅ Solid |
| Stage 05b — Confirmation | Coherence, Fractal MMXM, Invalidation, Inducement Gate | ✅ Solid |
| Stage 05 — Entry | SL/TP, IOFED, 3rd Candle OTE, Lecture overrides | ✅ Solid |
| Stage 06-07 — Risk/Journal | Risk tracking, continuous learn, trade graph | ✅ Solid |

---

### GAP 1: 1st-Presented FVG of the Week Not Detected
**ICT says**: "The first-presented Fair Value Gap of the week is carried through the entire week."
**We have**: FVG detection per TF but no "first FVG of the week" identification or forward-carry mechanism.
**Impact**: Chain of Custody is missing a key link. The 1st PFVG is the entry trigger the chain hands off to.
**Effort**: Small — add to `time_price_grid.cjs` chain builder.

### GAP 2: Volume Imbalance Not Detected
**ICT says**: "Volume imbalances act as precise draws on liquidity" — a core link in the chain.
**We have**: Volume displacement (ATR ratio) in engine but no dedicated volume imbalance detection (which requires body/range ratio + context).
**Impact**: Chain of Custody mentions it but can't include it. One of the 5 core links is missing.
**Effort**: Medium — requires candle-level body/range analysis.

### GAP 3: Daily Range Projection Not Used as TP
**ICT says**: "-0.5 and -1 projections of the 7-9AM range or ORG become the daily high/low objective."
**We have**: Projections computed in `high_precision_secrets.cjs` and `time_price_grid.cjs` but NOT used as TP targets in Stage 05.
**Impact**: TP targets are generic (opposing liquidity, 1:1 measured move) instead of the specific projected levels ICT teaches.
**Effort**: Small — wire projections into Stage 05 TP when available.

### GAP 4: CE as Universal Dividing Line Not Enforced
**ICT says**: "Consequent Encroachment is the key dividing line. Bodies in upper half = bullish; lower half = bearish."
**We have**: CE used in IOFED entries and IFVG detection but not as a universal filter. Every PD array touch should be evaluated: did price close through CE or just wick it?
**Impact**: Wick-probes are treated the same as body-confirms in some detection paths.
**Effort**: Small — add CE half-check to PD array interaction evaluation.

### GAP 5: Killzone-Specific Entry Models Not Unified
**ICT says**: Different killzones have different optimal entry models (Silver Bullet at 10-11, Judas Swing at London open, etc.)
**We have**: Lectures 1/2/4 cover specific windows. Bread/Butter covers sessions broadly. One Trade Setup routes session raids. But no unified "which killzone → which model" router.
**Impact**: Models can fire in suboptimal session windows. Lecture time gates help but don't actively route.
**Effort**: Small — add killzone→model preference mapping to Stage 03.

### GAP 6: News Calendar Not in Confidence Pipeline
**ICT says**: "Red-folder news distorts price and routinely turns a clean read into a stop-out."
**We have**: NFP/FOMC detection in weekly profile. `news_trade.cjs` for specific events. But no "is there high-impact news in the next 2 hours?" check in the pipeline.
**Impact**: Clean technical setups can be destroyed by news events the system doesn't know about.
**Effort**: Medium — wire `economic_calendar.py` output into pipeline confidence adjustment.

### GAP 7: MMXM 5-Step Not Wired as Primary Entry Model
**ICT says**: The Market Maker model has 5 steps: Consolidation → Manipulation → Distribution → Re-accumulation → Completion.
**We have**: MMXM Buy/Sell in model scoring. `fractal_mmxm.cjs` classifies steps. But no dedicated entry logic for specific MMXM steps.
**Impact**: MMXM is a Tier 1 model but its entry mechanics are generic (uses HTF bias + sweep heuristic).
**Effort**: Medium — add MMXM-specific entry detection based on fractal step classification.

### GAP 8: Rejection Block + Mitigation Block — No Dedicated Detection
**ICT says**: Rejection Block = long-wick institutional candle at PD Array. Mitigation Block = OB tagged but not fully broken.
**We have**: Both in model priority list. Engine classifies OB kinds (OB/Breaker/Mitigation). But no standalone rejection block detection.
**Impact**: Two Tier 3 models are scored on rough heuristics without pattern confirmation.
**Effort**: Small — add wick/body ratio check to existing OB classification.

### GAP 9: Backtest Results Not Feeding Model Weights
**ICT says**: "Journal and back-test how highs and lows actually form."
**We have**: `backtest_runner.cjs` exists. `performance_ledger.cjs` tracks live results. But backtest results don't feed into model weights.
**Impact**: Model weights are static (cycle-based) rather than data-driven from actual performance.
**Effort**: Medium — wire backtest results into performance_ledger model weights.

### GAP 10: No Persistent Autonomous Service
**ICT says**: The algorithm delivers at specific times. You must be there.
**We have**: `autonomous_session.cjs` (London KZ, 3-hour). `ny_am_autonomous.cjs` (NY AM, 1-hour). Both are run-once scripts.
**Impact**: No 24/7 background service that auto-starts at session open, runs through killzones, and journals results.
**Effort**: Large — requires scheduler, process management, error recovery.

---

### Priority

| # | Gap | Impact | Effort |
|---|-----|--------|--------|
| 1 | 1st-Presented FVG of week | Chain link missing | Small |
| 3 | Daily range projection as TP | Better TP targets | Small |
| 4 | CE as universal dividing line | Better wick/body filtering | Small |
| 5 | Killzone→model routing | Session-appropriate models | Small |
| 2 | Volume imbalance detection | Chain link missing | Medium |
| 6 | News calendar in confidence | Avoid news stop-outs | Medium |
| 7 | MMXM 5-step entry | Tier 1 model properly wired | Medium |
| 8 | Rejection/Mitigation detection | Tier 3 models with real teeth | Small |
| 9 | Backtest → model weights | Data-driven scoring | Medium |
| 10 | Persistent autonomous service | 24/7 coverage | Large |

### Verdict

The system is **substantially complete** for intraday ICT analysis. All 17 models are scored. All 6 context layers feed directional boosts. The 10 remaining gaps are refinements, not missing foundations. Gaps 1-8 are ~2 hours of work total. Gaps 9-10 are infrastructure projects.
