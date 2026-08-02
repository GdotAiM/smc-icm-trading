# SMC-ICM Daily Trading Plan — Week of August 3-7, 2026

## System Architecture (How Everything Fits)

```
SUNDAY EVENING — Weekly Prep
    │
    ├── PD Array Matrix: 20-day ranges graded, quadrants marked, confluence scored
    ├── Weekly Profile: 12-profile classification → predicts which day extreme forms
    ├── Time & Price Grid: Suspension blocks, daily wick grading, Chain of Custody
    └── DXY Context: Risk-on/off barometer for the week

MONDAY 02:00 AM — London KZ Opens
    │
    ├── data_refresh: session_start.cjs fetches fresh candles
    ├── pipeline: All 4 pairs scored
    ├── Weekly Profile narrows candidates based on Monday's open
    ├── One Trade Setup: PM session raid check (from Friday)
    └── autonomous_session.cjs: 3-hour autonomous London KZ

MONDAY 07:00 AM — Lecture 2 Window (London Hunt + IFVG)
    │
    ├── lecture2_setup.cjs: Relative equal levels post-07:00, hunt detection
    ├── MSS confirmation, IFVG CE entry, breaker fallback
    └── Inducement Gate: Must be swept before entry

MONDAY 08:00-10:00 AM — Lectures 1+4 Windows
    │
    ├── lecture1_setup.cjs: Pre-08:30 formation, post-08:30 raid, 3 PD arrays
    ├── lecture4_setup.cjs: NDOG/NWOG gap clusters, quarters, gap draw
    ├── opening_range.cjs: NYKZ (7:00-7:30) + AMOR (9:30-10:00)
    └── Silver Bullet: 10:00-11:00 scalp window

MONDAY 10:00 AM - 4:00 PM — NY Session
    │
    ├── Silver Bullet: 10:00-11:00 AM (SB window boost)
    ├── London Close: 10:30 AM-1:00 PM (counter-trend retracement)
    ├── PM Session: 1:30-4:00 PM (Bread & Butter scalp)
    └── All models scored with stacked boosts

EVERY EVENING — Journal & Learn
    │
    ├── ict_continuous_learn.cjs: Extract lessons from trades
    ├── trade_graph.cjs: Rebuild memory graph
    ├── performance_ledger.cjs: Update model weights
    └── decision_journal: Log every decision with reasoning
```

---

# MONDAY — Range-Setting Day

**ICT Profile**: Accumulation. "Weekly range being set. Institutions accumulating positions."

## Sunday Evening Prep (7:00-9:00 PM NY)

### ONE COMMAND:
```bash
node tools/morning_briefing.cjs
```
This replaces ALL of the below. It auto-refreshes data, runs all 4 pairs, ranks them, and shows the best candidate with trade command.

### Or for full autonomous mode:
```bash
# Monitor only (reports setups, no execution):
node tools/auto_scheduler.cjs

# Autonomous (executes best setup automatically):
node tools/auto_scheduler.cjs --execute
```
The auto scheduler runs 24/7, waking at each session window to refresh data, scan pairs, and optionally execute.

### What to read from the output:

**PD Array Matrix** (`pd_array_matrix.cjs`):
- Look at the 20-day range for each pair. Where is current price? (Premium/Discount?)
- Which quadrant has HIGH confluence? That's where the algorithm is likely to deliver.
- DXY context: Bullish = RISK-OFF (favor shorts in indices). Bearish = RISK-ON (favor longs).

**Weekly Profile** (`weekly_profile_engine.cjs`):
- Which profile is most likely? (I through XII)
- This tells you which DAY the weekly high or low should form.
- Example: "Profile III — Wednesday Low" means expect a low Wednesday, buy Tuesday/Wednesday.
- The weekly anchor sets direction for the ENTIRE week. ×1.4 for aligned models.

**Time & Price Grid** (`time_price_grid.cjs`):
- Daily Wick Grading: Which wicks are graded? CE/Q25/Q75 levels are your precision targets.
- Chain of Custody: The sequential handoff tells you the narrative arc.
- Suspension blocks: These are the controlling inefficiencies.

**MMXM Engine** (`mmxm_engine.cjs`):
- Has SMR fired? If yes → which side of the curve? Trade that direction all week.
- On Sunday, it'll likely show "SMR forming" — that's normal. Watch for it Monday.
- Symmetry target: The measured objective for the week.

**High Precision Secrets** (`high_precision_secrets.cjs`):
- 7-9AM range: Will populate Monday morning. Until then, reference ORG.
- Tethering: Are PD arrays anchored to graded levels? Untethered = lower weight.
- Gap classification: Any inversion or breakaway gaps from Friday?

### How to use this on Sunday:
1. Write down the weekly anchor direction for each pair
2. Mark the 20-day range equilibrium and quadrants on your mental map
3. Note which day the weekly profile predicts the extreme
4. Set alerts at the daily wick CE levels (these are precision reaction points)
5. Check DXY — it sets the risk tone for the whole week

---

## Monday 02:00-05:00 AM — London Killzone

### What fires:
- `autonomous_session.cjs` (if running): 3-hour autonomous session
- `opening_range.cjs`: MOR (12:00-12:30 AM) and LOR (1:30-2:00 AM) windows
- `one_trade_setup.cjs`: London session raid check
- `bread_and_butter.cjs`: London Open setup (Judas Swing → discount/premium PD array)

### What you're looking for:
- **London session range** forms between 2:00-5:00 AM. This becomes the reference for the day.
- **PM session raid** (from Friday): Did Friday's PM high/low get swept overnight? If yes + MSS = first opportunity locked.
- **Accumulation**: Monday is range-setting. Don't expect clean trends. The first sweep is often inducement.

### Entry approach (Monday London):
- **WAIT** for the first hour. Let the range establish.
- After 3:00 AM: If London range is set, look for a sweep of its extreme.
- If sweep occurs + MSS confirms → lecture2_setup.cjs logic applies (even though it's technically early for Lecture 2's 07:00 window — the same relative equal level + MSS mechanics work).
- Position size: 0.5× normal (Monday = accumulation, lower conviction).

### Key modules in play:
| Module | What it tells you |
|--------|-------------------|
| `one_trade_setup.cjs` | Did PM session get raided? Is London range set? |
| `opening_range.cjs` | MOR + LOR levels marked with SD projections |
| `bread_and_butter.cjs` | Offset vs Re-accumulation engine for London |
| `inducement_engine.cjs` | THE GATE — nothing trades until inducement swept |
| `liquidity_marker.cjs` | PDH/PDL from Friday, draw targets for Monday |

---

## Monday 07:00-08:00 AM — Lecture 2: London Hunt + IFVG

### What fires:
- `lecture2_setup.cjs`: Full detection sequence
- Time gate: ONLY active 07:00-08:00 NY

### The sequence:
1. Mark London high/low (from the 02:00-05:00 session)
2. Find relative equal highs/lows forming AFTER 07:00 AM on 5m/1m
3. Wait for sweep of those levels
4. Mandatory MSS: close beyond prior swing
5. First FVG before the hunt → IFVG, entry at CE (50% midpoint)
6. Breaker block as backup if no IFVG

### How to use it:
- At 07:00, run `node tools/tv-mcp/lecture2_setup.cjs EURUSD`
- It returns: London range, hunt status, MSS, IFVG found?, entry price, SL reference
- `setupReady: true` → entry is valid. Cross-check with weekly anchor and inducement gate.
- If the weekly profile says BULLISH and Lecture 2 says BUY → aligned, higher confidence.
- If they conflict → reduce size or stand aside.

### What makes this better than Friday:
- **Inducement gate**: Entry blocked if inducement not swept (this would have prevented Friday's Silver Bullet loss)
- **Weighted bias**: 6 sources agree/disagree → you know the confidence level
- **Weekly anchor**: ×1.4 for aligned, ×0.3 for opposing → the math keeps you on the right side

---

## Monday 08:00-10:00 AM — Lectures 1+4: NY AM Complex

### What fires:
- `lecture1_setup.cjs`: 08:00-08:30 formation, post-08:30 raid (time gate: 08:00-10:00)
- `lecture4_setup.cjs`: 08:30-10:00 NDOG/NWOG gap model (time gate: 08:30-10:00)
- `opening_range.cjs`: NYKZ (7:00-7:30) + AMOR (9:30-10:00)
- `high_precision_secrets.cjs`: 7-9AM range fully formed by 9:00 AM

### Lecture 1 sequence (08:30 Liquidity Raid):
1. 08:00-08:30: Relative equal levels form (pre-08:30 window)
2. Post-08:30: Price raids those levels
3. MSS mandatory
4. 3 PD arrays discovered: OB + SIBI/BISI (FVG) + Breaker
5. First-tagged PD array = entry

### Lecture 4 sequence (NDOG/NWOG News Model):
1. Annotate NDOGs/NWOGs on daily
2. Apply Quarters Fibonacci (0/0.25/0.50/0.75/1.0) to each gap
3. After 08:30: Price draws toward bias-aligned gap cluster
4. 1m MSS at gap cluster → breaker or FVG CE entry
5. 0.25 quarter tap = gap won't fill → reduce TP

### 09:30 AM — AMOR (Most important for indices):
- NAS100: This is THE window. AM Session Opening Range forms.
- SD projections from AMOR range → daily targets
- Silver Bullet at 10:00-11:00 → scalp entries from AMOR levels

### How to use the overlap:
Lectures 1 and 4 both fire at 08:30. They look at DIFFERENT things:
- Lecture 1: Relative equal levels (liquidity)
- Lecture 4: NDOG/NWOG gaps (inefficiency)
Both can produce valid setups simultaneously. The model scoring handles the competition.

---

## Monday 10:00 AM - 1:00 PM — Silver Bullet + London Close

### Silver Bullet (10:00-11:00 AM):
- SB window boost: Silver Bullet model jumps to primary
- Scalp SL/TP: Uses 15m/1H levels (not 4H swing) — tight 15-25 pip SL
- `iofed_pyramid`: If FVG entry, 3-level pyramid (IOFED edge → CE 50% → far edge)
- `bread_and_butter.cjs`: NY Open setup (CME open Judas Swing fade)

### London Close (10:30 AM-1:00 PM):
- Counter-trend retracement setup
- STRICT prerequisites: London + NY must have moved together + HTF array reached
- If conditions met: 10-pip SL, target 20-30% of daily range

---

## Monday 1:30-4:00 PM — PM Session

### What fires:
- `opening_range.cjs`: PMOR (1:30-2:00 PM)
- `bread_and_butter.cjs`: NY PM session scalp
- PMOR sets the closing framework. Watch 2:50-3:10 PM and 3:15-3:45 PM macros.

### PM approach:
- If AM reached its SD target → PM often consolidates
- If AM failed → PM is the second attempt
- AM↔PM connection: PMOR levels become the closing reference

---

## Monday Evening — Journal & Learning

```bash
# Extract lessons from today's trades
node tools/ict_continuous_learn.cjs --run

# Rebuild memory graph
node tools/trade_graph.cjs --rebuild

# Update performance metrics
node tools/performance_ledger.cjs
```

### What to journal:
1. Did the Weekly Profile's prediction hold? (Did price reach the expected extreme?)
2. Did SMR confirm? Which side of the curve are we on now?
3. Which lecture model fired? Was it aligned with the weekly anchor?
4. Inducement gate: Was it open when you entered?
5. Wick grading: Did price react at the projected CE/Q25/Q75 levels?
6. Update the Chain of Custody: What new links formed today?

---

# TUESDAY — Continuation or Turnaround

**ICT Profile**: "Accumulation → Manipulation. Range extends or reverses. Turnaround Tuesday."

### Tuesday differences from Monday:
- **Weekly Profile narrows**: If Monday didn't reach the expected array, Tuesday profiles (I/II) become more likely
- **SMR may fire**: Monday's consolidation sets up Tuesday's reversal
- **PD Array Matrix**: Focus on the quadrant that showed HIGH confluence on Sunday
- **Wick grading**: Monday's new daily wicks get graded, adding precision levels

### Tuesday approach:
- If Monday was range-bound (typical for accumulation), Tuesday is the expansion day
- Enter on break of Monday's range + MSS confirmation
- The 20-day range equilibrium is the magnet — whichever direction price needs to go to reach it
- **Turnaround Tuesday**: Watch for CHoCH on 4H — this is the classic Tuesday reversal signal

---

# WEDNESDAY — Reversal Day

**ICT Profile**: "Manipulation → Distribution. Highest probability reversal of the week."

### Wednesday is THE day:
- **Weekly Profile**: Profiles III/IV/XI/XII all target Wednesday as the extreme day
- **MMXM**: If SMR hasn't fired yet, Wednesday is the most likely day
- **PD Array Matrix**: Price should be at or near the 20-day range extreme by Wednesday close

### Wednesday approach:
- Morning: Look for the liquidity raid (sell-side for bullish, buy-side for bearish)
- The raid is the manipulation — don't enter with it
- Wait for MSS after the raid → this is the reversal
- Enter on retracement into the post-MSS PD array
- Target: The opposite side of the 20-day range
- **Wednesday close is THE invalidation gate**: If the expected extreme hasn't formed by Wednesday close, the initial weekly profile read is DISCARDED. Reclassify.

---

# THURSDAY — Expansion Day

**ICT Profile**: "Distribution → Expansion. Strongest trending day."

### Thursday approach:
- If Wednesday reversal confirmed → Thursday expands in that direction
- **MMXM**: Symmetry target projects the terminus
- **Chain of Custody**: The chain should be 4-5 links by now, showing clear handoff
- **Thursday 2:00 PM NY**: Pivot time for Consolidation Thursday Reversals (Profiles V/VI)
- Position size: Full. This is the best trend day of the week.

### Thursday models:
- MMXM Buy/Sell: Primary (the model is in full expansion)
- Unicorn (OTE+FVG): Distribution phase entries
- SCOB: Clean OB with displacement
- OTE + Institutional OB: Retracement entries in the trend direction

---

# FRIDAY — Position Squaring

**ICT Profile**: "Close-out / Squaring. Profit-taking dominates."

### Friday approach:
- **TGIF rules**: No new swing trades. Scalps only (Silver Bullet, lecture setups).
- **Size**: 0.5× normal (Friday guard)
- **Close all by NY close (4:00 PM)**: No positions held over the weekend
- **Weekly profile**: If the expected extreme already formed (Wed/Thu), Friday is profit-taking
- **Seek & Destroy risk**: If it's NFP Friday or summer (Jul/Aug), IX/X risk elevated

### Friday execution:
- London: Watch the sweep but don't commit heavy size
- NY AM: Scalp only. Silver Bullet at 10:00-11:00.
- NY PM: Late bounce possible. Close everything by 4:00 PM.
- **The morning session is the only high-probability window on Friday**

---

# EFFICIENCY COMMANDS — The New Way

| Instead of... | Use... |
|---------------|--------|
| 5 commands (session_start + 4 pair analyses) | `node tools/morning_briefing.cjs` — 1 command |
| Manually checking "is anything ready?" | `node tools/trade_ready.cjs` — 10 seconds |
| Remembering session times | `node tools/auto_scheduler.cjs` — runs 24/7 |
| Manual trade execution decision | `node tools/auto_scheduler.cjs --execute` — autonomous |

# HOW EACH MODULE IS USED — Quick Reference

| Module | When to Run | What It Answers |
|--------|------------|-----------------|
| `session_start.cjs` | Every session start, every 30 min during active trading | "Is my data fresh?" |
| `run_pair.cjs` | Before every trade decision | "What does the full system say?" |
| `weekly_profile_engine.cjs` | Sunday evening, Monday AM | "Which day will the extreme form? Bullish or bearish week?" |
| `pd_array_matrix.cjs` | Sunday evening, daily | "Where is price in the 20-day range? Which quadrant has confluence?" |
| `mmxm_engine.cjs` | Daily, before entries | "Has SMR fired? Which side of the curve?" |
| `time_price_grid.cjs` | Sunday evening, daily | "What are the suspension blocks? Wick CE levels? Chain of Custody?" |
| `high_precision_secrets.cjs` | After 9:00 AM daily | "7-9AM range graded? ORG filled? Gaps classified?" |
| `opening_range.cjs` | At each OR window | "MOR/LOR/NYKZ/AMOR/PMOR levels + SD projections" |
| `one_trade_setup.cjs` | Every session | "Which session is active? First opportunity locked?" |
| `inducement_engine.cjs` | Before EVERY entry | "GATE OPEN OR CLOSED?" |
| `liquidity_marker.cjs` | Daily | "PDH/PDL, PWH/PWL, draw targets, HRLR/LRLR, sweep/run" |
| `irl_erl_engine.cjs` | Daily | "Dealing range valid? IRL targets? ERL dominant side?" |
| `order_flow.cjs` | Daily | "1st/2nd/3rd OF pullback zones for re-entry" |
| `po3_state_machine.cjs` | Daily | "Accumulation/Manipulation/Distribution/Expansion?" |
| `ipda.cjs` | Daily | "Equilibrium cascade, false breakout, objective?" |
| `bread_and_butter.cjs` | Every session | "Offset or Re-accumulation? Scalp parameters?" |
| `lecture1/2/4_setup.cjs` | During their time windows | "Setup ready? Entry/SL/TP?" |
| `ny_time.cjs` | Before anything | "What NY time is it? Which session?" |
| `ict_continuous_learn.cjs` | End of day | "What did we learn today?" |

---

# THE GOLDEN RULES (Never Break These)

1. **Time before price**: Always check NY time first. Wrong timezone = wrong everything.
2. **Inducement is the gate**: No inducement sweep = no entry. Period.
3. **Higher timeframe wins**: Weekly anchor ×1.4. Opposing it ×0.3. The math keeps you honest.
4. **Wick probes, bodies confirm**: A wick through CE is not the same as a body closing through it.
5. **First opportunity**: Once a valid session raid + MSS fires, that's your direction for the day.
6. **Wednesday close is the gate**: If the weekly extreme hasn't formed by Wednesday close, discard the original plan.
7. **Friday = scalp only**: No swing trades. Close everything by 4:00 PM.
8. **Journal everything**: The system gets better the more you feed it.
