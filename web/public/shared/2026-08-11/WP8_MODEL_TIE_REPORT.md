# WP-8 Model Registry — Tie Mechanism Report

**Date**: 2026-08-11  
**Session**: London Killzone (4 AM NY)  
**Pairs analyzed**: XAUUSD (5-way tie), GBPUSD (8-way tie), NAS100 (was 2-way, now resolved), EURUSD (1 complete — no tie)

---

## 1. What — The WP-8 Registry Evaluator

The system has **17 ICT/SMC entry models** registered in `tools/models/registry.cjs`. Each model is treated as a **recipe, not a ranked dish**. A model is either **COMPLETE** (all gates pass) or it is nothing. There are no partial scores, no multipliers, no weighted confidence — only boolean gates.

The **tie rule** (line 218 of `registry.cjs`):

```js
verdict: complete.length === 1 ? "SETUP COMPLETE" : "NO TRADE"
```

- **0 complete** → NO TRADE (nothing to trade)
- **1 complete** → SETUP COMPLETE (trade that model)
- **2+ complete** → NO TRADE (tie — the market is too noisy to pick)

---

## 2. Where — File Map

| File | Role |
|------|------|
| `tools/models/registry.cjs` | 17 model definitions, `evaluateModel()`, `runRegistry()`, `tieBreak()` |
| `tools/models/steps.cjs` | 26 boolean step gates (`sweep`, `mss`, `fvg`, `ob`, `ote`, `smt`, etc.) |
| `tools/run_pair.cjs` (lines 1326–1492) | Assembles `registryCtx` from all stage outputs, calls `runRegistry()`, logs the verdict |
| `tools/auto_decision.cjs` | Consumes `decision.json` — checks `notGuardBlocked`, `rrOk`, `notInvalidated` |
| `tools/auto_scheduler.cjs` | Calls `run_pair.cjs` at each scheduled window; passes decisions to `auto_decision.cjs` gate |

---

## 3. When — Execution Timeline

The registry runs **every time** `run_pair.cjs` executes, which happens:

1. **Manually**: `node tools/run_pair.cjs XAUUSD`
2. **Automatically**: `auto_scheduler.cjs --execute` scans at each window in `SCHEDULE` (lines 40–55 of `auto_scheduler.cjs`):
   - 01:55 NY — Pre-London briefing
   - 02:00 NY — London Killzone scan
   - 03:00 NY — London Silver Bullet scan
   - 06:55 NY — Pre-Lecture 2 refresh
   - 07:00 NY — Lecture 2 scan
   - 08:30 NY — Lectures 1+4 scan
   - 09:50 NY — NY-AM Macro scan (highest conviction)
   - 10:00 NY — Silver Bullet scalp
   - 13:30 NY — PM session
   - 15:50 NY — Pre-close

The registry result is **ephemeral at each scan** — price moves, facts change, models complete or drop out. A tie at 3 AM can resolve to 1 complete at 4:46 AM (as NAS100 did today).

---

## 4. How — The Three-Layer Gate Architecture

### Layer 1: Eligibility (3 universal gates)

Every model, before any model-specific checks, must pass:

```
Window ✅/❌  — Is this model's time window open right now?
Direction ✅/❌ — Does the model's intrinsic direction match the HTF bias?
Purge ✅/❌    — If the model requires a liquidity sweep, was one detected?
```

If any of the 3 fails → model is ineligible, skipped entirely.

**Window logic** (`inModelWindow`, line 122): Each model declares its `timeWindows` as `[{start, end}]` in NY hours. Models with `timeWindows: null` are always-on. For example:
- Silver Bullet: `[{start:3, end:4}, {start:10, end:11}, {start:14, end:15}]` — only in SB windows
- Judas Swing: `[{start:2, end:3}, {start:8, end:9}]` — only at session opens
- MMXM / Breaker / 2FVG: `null` — always eligible (any hour)

**Direction logic** (`directionAligned`, line 138): Each model declares an `intrinsicDirection`:
- `"narrative"` — follows HTF bias (most models)
- `"BUY"` / `"SELL"` — fixed direction, must match
- `"counter-sweep"` / `"fade-first-move"` — fades the sweep direction, must align with bias
- `"breakout"` — follows the breakout direction

**Purge logic** (line 162): `purgeRequired: true` means the model demands a liquidity sweep before it can fire. Models like MMXM, Silver Bullet, Turtle Soup, Judas Swing all require purge. Models like Breaker Block, 2FVG, NWOG/NDOG do not.

### Layer 2: Sequence (model-specific boolean chain)

Each model defines a `sequence` array of step names. **Every step must pass** — if any single step fails, the model is incomplete. Steps are defined in `tools/models/steps.cjs` and consume facts from the `registryCtx`.

| Model | Tier | Gates | Sequence Steps |
|-------|------|-------|---------------|
| MMXM Buy/Sell | 1 | 4 | `sweep` → `ob` → `mss` → `smt` |
| Silver Bullet | 1 | 5 | `sweep` → `reversal` → `mss` → `fvg` → `tethered_array` |
| OTE + Institutional OB | 1 | 3 | `ob` → `ote` → `array_mitigated` |
| Turtle Soup | 1 | 5 | `htf_ranging` → `sweep` → `reversal` → `mss` → `displacement` |
| Unicorn (OTE+FVG) | 1 | 3 | `ob` → `fvg` → `ote` |
| Breaker Block | 1 | 3 | `ob` → `reversal` → `mss` |
| IFVG Scale-In | 2 | 4 | `sweep` → `reversal` → `mss` → `ifvg_present` |
| SCOB | 2 | 3 | `ob` → `fvg` → `displacement` |
| **2FVG Entry** | 2 | **2** | `fvg` → `sweep` |
| Judas Swing | 2 | 2 | `sweep` → `mss` |
| Asian Range Breakout | 2 | 2 | `sweep` → `ob` |
| **NWOG/NDOG** | 2 | **1** | `ob` |
| **Mitigation Block** | 3 | **2** | `ob` → `array_mitigated` |
| **Rejection Block** | 3 | **2** | `ob` → `reversal` |
| London Hunt + IFVG | 3 | 3 | `lecture2_hunt_swept` → `lecture2_mss` → `lecture2_ready` |
| NDOG/NWOG News | 3 | 5 | `lecture4_gap_draw` → `sweep` → `lecture4_mss` → `lecture4_ready` → `tethered_array` |
| 08:30 Liquidity Raid | 3 | 5 | `lecture1_formation` → `lecture1_raid` → `lecture1_mss` → `lecture1_ready` → `tethered_array` |
| NY Lunch Reversal (Short) | 3 | 4 | `prev_day_lunch_sweep` → `prev_day_bisi` → `price_enters_lunch_inefficiency` → `mss` |
| NY Lunch Reversal (Long) | 3 | 4 | `prev_day_lunch_sweep` → `prev_day_sibi` → `price_enters_lunch_inefficiency` → `mss` |

Notice the models in **bold** — these have only 1–2 gates and are the primary tie offenders.

### Layer 3: Tie-Breaking (only for reporting, not for execution)

When 2+ models complete, `tieBreak()` (line 199) sorts them but the **verdict remains NO TRADE**. The sort is informational only:

```js
function tieBreak(a, b, ctx) {
  if (a.tier !== b.tier) return a.tier - b.tier;  // lower tier number = higher priority
  const aDraw = ctx.hasDraw, bDraw = ctx.hasDraw;
  if (aDraw !== bDraw) return aDraw ? -1 : 1;     // nearer a liquidity draw wins
  return 0;
}
```

The tie-breaker selects a `primary` for logging purposes, but `complete.length > 1` still produces `NO TRADE`. The registry does **not** downgrade to the best model — it refuses to pick.

---

## 5. Why — Design Philosophy

### Principle 1: A model is a recipe, not a score

The old system (legacy shadow) ranked models 0–100 with multipliers and cycle boosts. The WP-8 rewrite (Jul 18 audit) flipped this: **gates over multipliers**. A model either satisfies every gate in its sequence or it doesn't. No 70%-confidence model ever fires — it must be 100% of its gates.

### Principle 2: The tie rule protects against noise

When the market satisfies 6, 8, or 9 models simultaneously, it means:
- Liquidity is being swept everywhere (purge gate passes for all)
- FVGs and OBs are abundant (low-gate models fire)
- MSS/reversal signals are mixed (some models pass, others fail on specific steps)
- The market is in **distribution** — price is doing everything, going nowhere cleanly

The tie rule says: **if the market is ambiguous enough to trigger half the playbook, don't guess — wait.** Today's GBPUSD (8 complete) is the perfect example: bullish HTF alignment, London KZ active, sweeps present — beautiful context, but too many recipes claim to fit because the ingredients are universal.

### Principle 3: The tie resolves itself with time

A tie is not permanent. As new candles print:
- Some models fall out of their time window
- Displacement clarifies, eliminating/failing specific gates
- The inducement check on 15m/1m tightens
- The count drops from 6 → 5 → 3 → 1

Today NAS100 went from **2-way tie at 3 AM → SETUP COMPLETE at 4:46 AM**. The system self-resolves.

### Principle 4: EURUSD proves the rule works

EURUSD today had **exactly 1 complete** — 2FVG Entry. Why?

- Silver Bullet: **failed** on `sweep`/`reversal`/`mss` — the sweep was detected but the reversal back inside never confirmed
- MMXM Buy: **failed** on `smt` — no SMT divergence between EURUSD and GBPUSD
- Turtle Soup: **failed** on direction — intrinsic counter-sweep didn't align
- Breaker Block: **failed** on `reversal` — OB present but no reversal confirmation
- SCOB: **failed** on `displacement`
- 2FVG Entry: **passed** — FVGs stacked ✓, sweep detected ✓

Only 2FVG passed because it only needs 2 gates and those specific facts were present, while the higher-gate models were blocked by missing facts that 2FVG doesn't care about. This is the narrow path through the registry.

(Note: the guard still blocked it due to `INVERSION_MISSING` on the 1m — a separate layer.)

---

## 6. The Tie Offenders — Why Low-Gate Models Dominate

The models that most frequently complete in distribution phases:

| Model | Gates | Why It Over-fires |
|-------|-------|-------------------|
| **NWOG/NDOG** | 1 (`ob`) | Any unmitigated OB anywhere makes it complete. Tier 2, but 1 gate. |
| **Mitigation Block** | 2 (`ob`, `array_mitigated`) | If price is at any fresh OB, it fires. Distribution = lots of OB tags. |
| **Rejection Block** | 2 (`ob`, `reversal`) | OB + any reversal = complete. Distribution whipsaws trigger this constantly. |
| **2FVG Entry** | 2 (`fvg`, `sweep`) | Two FVGs + a sweep. Distribution leaves FVGs everywhere. |
| **Breaker Block** | 3 (`ob`, `reversal`, `mss`) | A breaker just needs OB + reversal + MSS — distribution has all three on multiple TFs. |
| **SCOB** | 3 (`ob`, `fvg`, `displacement`) | OB + FVG + any displacement. Distribution is displacement-heavy. |

These 6 models account for most ties. They are **valid ICT concepts** but their gate counts make them too permissive in distribution. The fix, if desired, would be to add gates (e.g., require `cisd` or `smt` for Breaker Block, require `tethered_array` for NWOG/NDOG) or gate them by cycle phase (as the legacy shadow does — Turtle Soup, Judas Swing, NWOG/NDOG, Mitigation Block, Asian Range Breakout all get phase-blocked in the legacy shadow for requiring ACCUMULATION/MANIPULATION while in DISTRIBUTION).

The WP-8 registry does NOT apply phase gating at the purge level for these models — only `purgeRequired` (liquidity sweep). Phase gating exists in the legacy shadow but was deliberately removed from WP-8 to avoid "double-gating" — however, this means the registry sees these models as eligible when the legacy shadow would have blocked them.

---

## 7. The Full Decision Chain (Beyond the Registry)

The registry verdict is only step 1. Even if the registry says SETUP COMPLETE, three more gates must pass for auto-execution:

```
WP-8 Registry (SETUP COMPLETE)
    ↓
Cross-System Guard (notGuardBlocked)  ← EURUSD fails here (INVERSION_MISSING)
    ↓
Invalidation Check (notInvalidated)    ← NAS100 fails here (INVALIDATED)
    ↓
R:R Check (rrOk)                       ← NAS100 fails here (0.75:1)
    ↓
Auto-Decision Gate (allowed: true)
    ↓
market_order.cjs EXECUTES
```

These gates are stored in `decision.json` under `gates`:

```json
"gates": {
  "hasSetup": true,          // registry said SETUP COMPLETE
  "rrOk": false,             // R:R below 1:1 minimum
  "notInvalidated": false,   // invalidation detected
  "notGuardBlocked": true,   // cross-system guard passed
  "freshEnough": true,       // data not too stale
  "riskAllowed": true        // within daily loss limits
}
```

**All four must be `true` for execution.** Today, no pair had all four.

---

## 8. Summary

| Aspect | Detail |
|--------|--------|
| **What** | Registry of 17 ICT models, boolean-gated, exactly-1-complete rule |
| **Where** | `tools/models/registry.cjs` (models + evaluation), `tools/models/steps.cjs` (gates), `tools/run_pair.cjs:1326-1492` (call site) |
| **When** | Every `run_pair.cjs` run — manual or via auto_scheduler at each session window |
| **How** | 3 eligibility gates → model-specific sequence (1–5 boolean steps) → all must pass → count completes → verdict |
| **Why** | Gates over multipliers. A model is a recipe, not a score. The tie rule prevents guessing when the market triggers too many recipes at once. |
| **Today's ties** | XAUUSD 5-way, GBPUSD 8-way, NAS100 2-way (later resolved to 1), EURUSD 1-way (clean) |
| **Tie root cause** | Low-gate models (NWOG/NDOG, Mitigation Block, Rejection Block, 2FVG) complete trivially in distribution phases where sweeps, OBs, and FVGs are abundant |
| **Self-resolution** | Ties break as time passes — windows close, displacement clarifies, counts drop |
| **Safety net** | Even SETUP COMPLETE must pass guard, invalidation, R:R, and freshness gates before execution |
