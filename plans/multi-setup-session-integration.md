# Integration Plan — "How to Find Multiple Setups in one Trading Session"

Source: https://youtu.be/RkIfbhTamrQ — The Algo BD (ICT Gems)
Tutorial: `C:\Users\cash\Desktop\ICT Knowledge Centre\01 - ICT Trading Tutorials\multiple-setups-one-session.md`
Ingested 2026-08-13: 141 concepts / 1636 RAG sections / 1728 graph edges.

## What the lesson teaches (extractable knowledge)

1. **Swing target model**: narrative is anchored on the daily chart. After a midnight-open rally into premium, the
   sequence of draws is: break of the prior low → relative equal lows (sell-side liquidity) → the daily bullish
   order block (opening price of a down-close candle, extended in time).
2. **Body-anchored Fibonacci projection**: anchor the fib to the HIGHEST body (open or close — wicks are
   distractions) of the swing up and the LOWEST body of the swing low. The broken swing point is the *fulcrum*;
   project the same measured distance below it (-0.5 / -1.25 / -1.5 style targets).
3. **The precision element only works with the narrative**: REL highs on the daily, a created swing high,
   aggressive break lower, a full imbalance rebalance, roll-over, acceleration. No standalone fib lines.
4. **Qualification checklist** (raises probability): displacement + swing low broken + trade up into the FVG +
   trade above/below the opening price. "How many boxes did we just check off?" → 4/4 = probabilities through
   the roof.
5. **Multiple setups in one session**: the morning (9:30 NY open) typically yields 2-3 setups — each is a
   short-term low taken → fresh FVG → retest of that FVG → entry; TP1 = the fulcrum (short-term low, the
   liquidity), TP2 = the daily OB / deeper target. The 15m FVG is the framework; the 1m shows the micro
   imbalance that is the actual entry.
6. **Cadence**: "no more than four trades — two in the morning, two in the afternoon." Setups repeat like buses on
   a schedule; a missed setup recurs — never force one.
7. **Lunch rule**: no new entries noon-1:00 NY, but partials / a pre-placed limit fill at the OB are fine (the
   position is already funded).
8. **Management**: multi-contract partials — take one off at TP1, move SL to BE, let the runner hunt the daily
   range. Don't move the stop; let a quarter-point scare resolve.

## Integration into the operator

### Phase 1 — Perception + prompt + gate model ✅ BUILT (2026-08-13)

1. **Shared deterministic map** `tools/llm/swing_target.cjs` (single source of truth for brief + gate):
   `computeSwingTarget(pair, date, root)` → `{ bias, draw, dailyOB (open of last down/up-close daily candle),
   dayOpen (midnight NY open, first 1h candle), openingSide, rel highs/lows (liquidity_marker.relEquals),
   fifteen {bias, fvg, ob}, oneMin {fvg, ob, inversionFvgs}, qualification {4 boxes, qualified = boxes>=3},
   setups {morning, afternoon, total} }`. `countModelPasses(pair, model, date, root)` reads the operator ledger.
   The 4 boxes: displacement, swing break (MSS/CHoCH), FVG retest, opening-price side (bearish setup needs
   price ABOVE the midnight open, bullish BELOW).
2. **Brief section `## 6. SWING TARGET MAP`** (`market_brief.cjs` → `swingTargetSection`, exported). Renders the
   TF ladder line, daily OB target, midnight open + side, REL levels, qualification N/4 + floor verdict, and
   today's setup count. Sections renumbered 7-11.
3. **Prompt block** (`operator_loop.cjs`): the TF ladder verbatim (DAILY = bias/draw; 15m = framework, judge
   here not on the 5m; 5m never looks clean; hourly = where the daily OB/projections show up in time;
   1m = precision entry), the entry sequence (displacement + broken short-term low → fresh 1m FVG retest;
   TP1 = fulcrum/liquidity, TP2 = daily OB), qualification ≥3/4, and the cadence (2-3 morning setups at the
   9:30 NY open, max 2 morning + 2 afternoon, setups repeat like buses — never force, no lunch entries).
4. **Gate model `Swing Target (Multi-Setup)`** (`operator_loop.cjs`, `SWING_TARGET_MODEL`):
   - **Qualification floor**: BLOCKED unless the brief's map shows ≥3/4 boxes — "precision is only beneficial
     with the narrative" as a hard gate.
   - **Cadence cap**: at most 2 PASSed evaluations before 12:00 NY and 2 after (from the ledger via
     `countModelPasses`) — the "no more than four trades, two morning two afternoon" rule.
   - Conf floor 55. Normal killzone path; lunch no-entry already enforced.
5. **Tests** `tests/swing_target.test.cjs` (5): map build + 4/4 vs 2/4, section render, gate floor, cadence cap.
   Suite: 171 total, 165 pass, 6 pre-existing failures. Live render verified on real data (GBPUSD: BULLISH,
   draw UP → 1.35886, qualification 3/4 QUALIFIED, midnight open 1.33805).

### Phase 2 — Deterministic helper `tools/tv-mcp/swing_target_map.cjs`

Reuses the shared lecture2 helpers (`findSwings`, `calcATR`, ...). Computes:
- body-anchored fib projections (-0.5 / -1.25 / -1.5) from the identified swing bodies;
- fulcrum point; qualification boxes as a strict boolean set;
- daily OB level.
The brief's SWING TARGET MAP section consumes this file when present (like the lecture detectors), so the LLM
gets real projected levels instead of asking it to invent fib measurements. Verified with a unit test mirroring
the video's worked example (broken low → projection ≈ the actual low).

### Phase 3 — Scale-out execution (optional)

The video's management is multi-contract partials (TP1 + BE + runner). Today `market_order.cjs` places a single
exit. Optional enhancement: TP1 partial + SL→BE runner via two orders, kept OFF by default until the ledger
shows the base model profitable.

## Measurement

Journal `Swing Target (Multi-Setup)` per trade → `trade_graph` / `performance_ledger`; compute expectancy by
day-part (morning vs afternoon) and by qualification box count (3/4 vs 4/4) to validate the "precision only with
the narrative" claim weekly.

## Files touched (Phase 1)

- `tools/llm/market_brief.cjs` — `swingTargetSection` + renumber
- `tools/llm/operator_loop.cjs` — prompt block + gate model + daily-cap counter
- `tests/` — `swing_target.test.cjs` (section render + gate cap/floor)
- `tools/tv-mcp/swing_target_map.cjs` (Phase 2)