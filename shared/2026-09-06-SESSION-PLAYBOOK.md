---
name: weekly-session-playbook-sep-7-12
description: Session-by-session trading plan from Sunday Asian KZ through Friday NY PM for the week of Sep 7-12, 2026
metadata:
  type: reference
  tags: [trading-plan, weekly, playbook, ict, killzone]
  week: september-7-12-2026
  profile: IV (bullish, thu extreme)
---

# Weekly Session Playbook — Sep 7-12, 2026

## Week Overview

| Day | ICT Phase | Events | Size | Best Window |
|-----|-----------|--------|------|-------------|
| **Sun** | Closed | Bank holidays | — | Refresh data 21:00 NY |
| **Mon** | Accumulation | German Ind Prod (LOW) | 0.5× | 08:30–11:00 NY |
| **Tue** | Manipulation | NFIB (LOW) | 0.5× | 02:00–05:00 + 08:30–11:00 |
| **Wed** | Reversal Gate ★ | ADP (LOW) | 0.5× | 08:30–11:00 + gate check |
| **Thu** | Expansion ★★ | ECB Rate + PPI + Claims | 1.0× | 14:15–15:00 NY |
| **Fri** | Distribution/TGIF ★★★ | UK GDP + Core/Headline CPI | Scalp only | 08:30–11:00 + 14:00–15:00 |

**Weekly Profile:** IV (Bullish, Thursday Extreme) — 35%
**Combined Bullish Probability:** ~80%
**Biggest Risk:** CPI hot → DXY surge → forced long liquidations

---

## SUNDAY SEP 6 — PREP DAY (NO TRADING)

### Morning (09:00–11:00 NY)
```
✅ session_start.cjs          ← refresh data from TV
✅ run_pair.cjs XAUUSD        ← priority #1  
✅ run_pair.cjs NAS100        ← priority #2
✅ morning_briefing.cjs       ← cross-pair ranking
✅ pd_array_matrix.cjs --all  ← 20-day confluence
✅ time_price_grid.cjs        ← suspension blocks + Chain of Custody
✅ mmxm_engine.cjs            ← SMR status check
✅ liquidity_marker.cjs       ← PDH/PDL + draw targets
```

### Afternoon (11:00–18:00 NY)
```
✅ Draw all pairs on TV chart — draw_all_pairs_v6.cjs
✅ Build weekly profile probability map
✅ Save economic calendar to shared/2026-09-07_week_events.json
✅ Run ict_continuous_learn.cjs --run   ← extract lessons from recent trades
✅ Run trade_graph.cjs --rebuild        ← refresh memory graph
```

### Evening (18:00–22:00 NY)
```
✅ Set watchlist alerts:
   - XAUUSD: $4,417 (SSL) and $4,463 (BSL)
   - NAS100: $29,530 (breakout) and $29,436 (support)
   - DXY: 99.109 (spring bottom) and 99.197 (spring top)
   - GBPUSD: $1.3550 (BSL) and $1.3481 (SSL)
   - EURUSD: 1.1627 (BSL) and 1.1587 (SSL)

✅ Final check:
   - Is TV CDP running on port 9222?
   - Are all engine scripts running without errors?
   - Discord bot active?
   - Auto-scheduler started? (node tools/auto_scheduler.cjs &)
```

---

## MONDAY SEP 7 — ACCUMULATION

**Phase:** Range building. CAD & USD Bank Holidays = thin volume.
**Size:** 0.5× normal.
**Goal:** Mark Monday range high/low. These become Tuesday reference levels.

### 00:00–02:00 NY — Pre-London
- Check DXY overnight drift
- If DXY broke below 99.109 overnight → early green light
- If DXY broke above 99.197 overnight → red flag, reduce size
- **Action:** Monitor only. No entries.

### 02:00–05:00 NY — London Killzone ★
- London session opens, first real volume of the week
- Expected: Range establishment, testing Sunday closes
- **Liquidity marker check:** Mark London high/low once established
- **Watch for:** First sweep of Sunday range extreme
- **Inducement gate:** Will be CLOSED (no prior sweep) — do NOT enter
- **Action:** Watch. Note which side gets tested first.

### 05:00–07:00 NY — London Late
- Range should be forming. Volume picks up slightly.
- **Check:** Is Monday range wider than typical (80+ pips)?
  - Wide range = institutionally active = good for trend days
  - Narrow range (<50 pips) = chop, avoid
- **Action:** Update Monday range levels on chart.

### 07:00–08:30 NY — Pre-NY Formation
- London range established. NY participants positioning.
- **Watch DXY:** Direction during this window often sets NY tone
- **Action:** Do nothing. Wait for 08:30 NY open.

### 08:30–11:00 NY — NY AM Killzone ★
- First real trading action of the week
- **08:30–09:00:** Watch for NY opening range formation
- **09:00–09:30:** Check if DXY respects 99.109/99.197 spring
- **09:30–10:00:** AMOR (AM Session Opening Range) — mark levels
- **10:00–11:00:** Silver Bullet window — best scalp opportunity
  - If DXY holding below 99.159 → LONG bias in indices/gold
  - If DXY breaking above 99.197 → SHORT bias, fade longs
- **Entry criteria (if any):**
  - Inducement must be SWEEPED (gate must be OPEN)
  - Must have 1m/5m MSS in direction
  - R:R must be ≥ 1.5:1
  - Size: 0.5× only

### 11:00–13:00 NY — NY Lunch (×0.4 multiplier)
- **No new entries.** Monitor existing positions only.
- If in a trade: watch for lunch reversal (common on thin days).

### 13:00–16:00 NY — NY PM Session
- Volume picks back up. Afternoon continuation or reversal.
- **Watch:** Does price respect or reject the morning range?
- **Action:** Trail stops on any open positions. Tighten risk.

### 16:00–17:00 NY — NY Close
- **Close all positions.** No holds over Monday night.
- Daily journal: How did Monday range form? Was it wide or narrow?
- Update trade_graph with Monday observations.

---

## TUESDAY SEP 8 — MANIPULATION

**Phase:** Testing Monday's range extremes. Setup for Wednesday gate.
**Size:** 0.5× normal.
**Events:** NFIB Small Business (LOW impact)

### 00:00–02:00 NY — Pre-London
- Review Monday's range high/low from chart annotations
- Identify which side of Monday's range is closer to key levels
  - E.g., is Monday high near XAUUSD BSL at $4,463?
- **Action:** Prepare for London session test of Monday range.

### 02:00–05:00 NY — London Killzone ★
- Expected: London tests one side of Monday's range
- Common pattern: London sweeps Monday's high OR low, then reverses
- **Watch for:** London manipulation sweep + MSS reversal
- **If sweep + MSS:** Potential Tuesday entry (0.5× size)
- **Gate check:** Is inducement from Monday's sweep already done? YES = gate open.
- **Action:** Light sizing. Look for London-induced reversal entries.

### 05:00–08:30 NY — London Late / Pre-NY
- London session winding down.NY participants entering.
- **Check:** Did London establish a clear direction?
  - If yes → NY will likely continue it
  - If no (choppy) → expect NY to pick a side aggressively
- **Action:** Prepare NY AM setup. Have levels ready.

### 08:30–11:00 NY — NY AM Killzone ★
- **08:30–09:30:** Watch for NY opening range. Mark NYKZ (Killzone) levels.
- **09:30–10:00:** AMOR formation. This is crucial for indices (NAS100).
- **10:00–11:00:** Silver Bullet window
  - If DXY < 99.159 → LONG bias, look for pullback entries
  - If DXY > 99.197 → SHORT bias, fade any long rallies
- **Entry criteria:** Same as Monday but with Tuesday context:
  - Tuesday manipulation often creates "fake" breakouts
  - Wait for the REAL reversal after the manipulation sweep
  - Best entries: After London sweep is confirmed (not pre-sweep)

### 11:00–13:00 NY — NY Lunch (×0.4)
- **No entries.** Watch for position squaring.
- If you have a Tuesday morning entry: consider taking partial profits.

### 13:00–16:00 NY — NY PM Session
- **PMOR formation** (1:30–2:00 PM). Sets afternoon framework.
- If AM reached targets → PM consolidates
- If AM failed → PM is the second attempt
- **Action:** Watch for PM session raid on London/NY AM extremes.

### 16:00–17:00 NY — NY Close
- **Close all positions.** No Tuesday night holds.
- **Tuesday journal:** How many ranges formed? Which side got swept more?
- **Wednesday prep:** Note if Wednesday gate looks likely to trigger.

---

## WEDNESDAY SEP 9 — REVERSAL GATE ★

**Phase:** THE decision day. Wednesday close determines if the weekly plan stands.
**Size:** 0.5× until gate resolves, then scale up if aligned.
**Events:** ADP Weekly Employment (LOW impact)

### 00:00–02:00 NY — Pre-London
- Review Tuesday's range. Which side was stronger?
- Check: Has a weekly high OR low started to form?
  - If yes by Wed open → proceed with Plan A
  - If no → prepare Plan B (skip Wed, go straight to Thu/Fri)
- **Action:** Mental note: "What would invalidate my weekly bias?"

### 02:00–05:00 NY — London Killzone ★
- London typically sets the Wed direction
- **Watch:** London sweep of Tuesday's range extreme
- If London sweeps Tuesday high + MSS down → bearish Wed signal
- If London sweeps Tuesday low + MSS up → bullish Wed signal
- **Gate check:** After London settles, is there a candidate weekly extreme?
- **Action:** Note London direction. Prepare NY continuation or reversal.

### 05:00–08:30 NY — London Late / Pre-NY
- **Critical window:** This is where Wednesday gate begins forming
- Check: Is price approaching either Tuesday extreme?
  - Near Tuesday HIGH + bearish signs → weekly HIGH forming (bearish Wed)
  - Near Tuesday LOW + bullish signs → weekly LOW forming (bullish Wed)
  - Mid-range chop → gate NOT triggered, wait
- **Decision point:** By 08:30 NY, decide if Wed gate is open or closed
  - Gate OPEN → scale to 0.75× for NY session
  - Gate CLOSED → stay at 0.5×, monitor only

### 08:30–11:00 NY — NY AM Killzone ★ THE GATE CHECK
- **08:30–09:30:** NY opening range. Watch for directional conviction.
- **09:30–10:00:** AMOR. If AMOR breaks in line with Wed gate → confirmation.
- **10:00–11:00:** Silver Bullet window
  - If Wed gate is OPEN and aligned with weekly bias → best entry of the week
  - If Wed gate is CLOSED → skip, wait for Thursday

### 🔴 WEDNESDAY GATE CHECK (14:00–16:00 NY)
Run this checklist at 2:00 PM NY:

```
□ Has a clear weekly HIGH formed? (new high vs last 5 days)
□ Has a clear weekly LOW formed? (new low vs last 5 days)
□ Is the extreme in the expected direction? (BULLISH = LOW formed, BEARISH = HIGH formed)
□ Did induction get swept BEFORE the extreme? (mandatory)
□ Is the extreme supported by MMXM? (SMR firing = confirmation)
```

- **ALL TRUE:** Wednesday gate OPEN. Weekly profile valid. Scale up to 1.0× for Thursday.
- **ANY FALSE:** Wednesday gate CLOSED. Discard original profile. Switch to:
  - Profile V (Friday AM extreme) if Thu/Fri catalysts strong
  - Profile XI (neutral) if no clear direction emerging

### 16:00–17:00 NY — NY Close
- **Gate verdict:** Record final decision. Update weekly profile if needed.
- **Journal:** What triggered (or didn't trigger) the gate?
- **Thursday prep:** If gate opened, prepare Thursday expansion entries.

---

## THURSDAY SEP 10 — EXPANSION ★★ BEST TRADING DAY

**Phase:** The main event. ECB Rate Decision drives the weekly direction.
**Size:** 1.0× (full size if gate opened Wed).
**Events:**
- ECB Interest Rate Decision @ 14:15 ET **[CRITICAL]**
- ECB Press Conference @ 14:45 ET **[HIGH]**
- US Core PPI @ 14:30 ET **[HIGH]**
- US PPI @ 14:30 ET **[HIGH]**
- Unemployment Claims @ 14:30 ET **[MED]**

### 00:00–02:00 NY — Pre-London
- Review Wed gate verdict. If OPEN → full size ready.
- Mark ECB decision time on chart: **14:15 ET = 20:15 NY**
- Prepare entries for BOTH scenarios:
  - Scenario A: ECB hikes 25bps as expected → EUR up, DXY down, risk-on ✓
  - Scenario B: ECB hikes 50bps or signals further hawkishness → EUR surges, DXY spikes short-term, then reverses
- **Key:** Have entry plans for both scenarios BEFORE the announcement.

### 02:00–05:00 NY — London Killzone ★
- London sets up for ECB. Watch for London positioning.
- **Watch:** Does London expand or compress ahead of ECB?
  - London expansion = institutions positioning for ECB result
  - London compression = waiting for ECB clarity
- **Action:** If compression → stand aside. If expansion → follow the direction.

### 05:00–08:30 NY — London Late / Pre-NY
- **Critical preparation window.** Finalize entry levels.
- **Pre-ECB checklist:**
  - [ ] Entry price calculated for both scenarios
  - [ ] SL placed at structural invalidation (not at liquidity)
  - [ ] TP1 at nearest liquidity pool (BSL/SSL)
  - [ ] Size set to 1.0× (or 0.75× if gate was marginal)
  - [ ] Macro feedback tool armed (macro_feedback.cjs --now)
- **Action:** Do NOT enter before 14:00 ET. ECB creates the volatility.

### 08:30–14:00 NY — NY AM / Waiting Period
- **08:30–10:00:** NY AM KZ — early positioning, usually quiet before ECB
- **10:00–11:00:** Silver Bullet window — may see pre-ECB scalps
- **11:00–13:00:** Lunch — thin volume, avoid
- **13:00–14:00:** Pre-ECB tension. Watch DXY closely.
  - If DXY dropping steadily → markets expect hawkish ECB (EUR up)
  - If DXY rising → markets expect dovish surprise (EUR down)

### 🚨 14:15 ET (20:15 NY) — ECB RATE DECISION 🚨
- **DO NOT trade the headline.** First 2 minutes are noise.
- Wait 3–5 minutes for the market to digest the number.
- Then read Lagarde's presser (14:45 ET / 20:45 NY) for direction.

### 14:45–15:30 ET (20:45–21:30 NY) — POST-ECB ENTRY WINDOW
This is YOUR entry window. Watch for:

**Scenario A: ECB Hike 25bps + Dovish Tilt (Most Likely)**
- DXY drops → Risk-on confirmed
- **Entry:** Long NAS100 / XAUUSD on pullback to Fib levels
- **TL:** DXY break below 99.109 = acceleration signal
- **TP:** NAS100 → $29,593 BSL | XAUUSD → $4,463 BSL
- **SL:** Below structural invalidation (1H swing low)

**Scenario B: ECB Hike 25bps + Hawkish Tilt (Neutral)**
- Mixed signals. DXY sideways or slight pop
- **Entry:** Wait for clarity. May be range-bound.
- **Action:** Reduce size to 0.5×. Scalp only.

**Scenario C: ECB Hike 50bps (Bearish Surprise)**
- DXY spikes → Risk-off
- **Entry:** Short NAS100 / XAUUSD on rejection
- **TL:** DXY break above 99.197 = danger signal
- **TP:** NAS100 → $29,436 | XAUUSD → $4,374
- **SL:** Above structural invalidation (1H swing high)

### 15:00–16:00 NY — Post-ECB Position Management
- **Adjust SL to breakeven** on any winners
- **Scale out 50%** at TP1, let rest run to TP2
- **Do NOT add to losers.** Ever.

### 16:00–17:00 NY — NY Close
- **Final check:** Is the weekly high being set today?
  - If yes → Thursday extreme (Profile IV) confirmed
  - If no → weekly high may come Friday (switch to Profile V)
- Journal: How did the market react to ECB? Did DXY respect the spring?

---

## FRIDAY SEP 11 — DISTRIBUTION / TGIF ★⭐⭐ CLOSE EVERYTHING

**Phase:** Profit-taking, unwinding, TGIF retracement.
**Size:** Scalp only (0.3–0.5×). Close all by 4:00 PM.
**Events:**
- UK GDP m/m @ 08:00 ET **[HIGH]**
- Core CPI m/m @ 14:30 ET **[CRITICAL]** — exp 2.4%, prev 2.5%
- Core CPI y/y @ 14:30 ET **[CRITICAL]** — exp 3.4%
- CPI m/m @ 14:30 ET **[CRITICAL]** — exp 0.4% (↑ from 0.1%) ⚠️
- Prelim UoM Sentiment @ 16:00 ET **[MED]**

### 00:00–02:00 NY — Pre-London
- Review Thursday's close. Where did price end relative to weekly range?
- If Thursday set weekly high → expect Friday retracement DOWN
- If Thursday did NOT set extreme → Friday may continue expansion
- **TGIF prep:** Measure Thursday's range. Calculate 20%/25%/30% retracement targets.

### 02:00–05:00 NY — London Killzone ★
- London opens Friday. Usually volatile.
- **UK GDP @ 08:00 ET (14:00 NY)** — London session will react
  - GBP strength → GBPUSD tests $1.3550 BSL
  - GBP weakness → GBPUSD retests $1.3481 SSL
- **Action:** Watch London reaction to UK data. Use as directional cue.

### 05:00–08:30 NY — London Late / Pre-NY
- **08:00–08:30:** UK GDP released. GBP direction established.
- **08:30–10:00:** NY AM KZ — Asian/London positions unwind
- **TGIF check:** Where is price relative to Thursday's range?
  - Above Thursday high → expect retracement target #1
  - Near Thursday high → guard watch (BSL may be defended)
  - Below Thursday low → expansion continues (less likely)

### ⭐ 09:30–10:10 ET (15:30–16:10 NY) — MACRO WINDOW ★ THE TGIF TRIGGER
This is ICT's "peak formation" window. Per the weekly cycle video:

**Step 1: Watch for the peak**
- Is price approaching Thursday's high? (distribution zone)
- Or is it pulling back already? (retracement in progress)

**Step 2: Guarded vs Swept check**
- **GUARDED:** Price approaches BSL, forms rejection block, bodies refuse to close above → SHORT signal
- **SWEPT:** Price breaks through BSL with displacement + MSS → LONG continuation signal

**Step 3: Enter**
- If GUARDED → SHORT at rejection, SL above block, TP at 25% retracement target
- If SWEPT → LONG on retest, SL below sweep low, TP at extension

### 🚨 14:30 ET (20:30 NY) — US CPI RELEASE 🚨
- **DO NOT front-run.** Let the initial spike settle (2–3 min).
- Read the components:
  - **Core CPI y/y:** If still at 2.4% → neutral, no panic
  - **Core CPI y/y > 2.5%** → hot inflation → DXY surge → fade longs
  - **Core CPI y/y < 2.3%** → cooling → DXY drops → chase longs
  - **CPI m/m at 0.4%+** (vs 0.1% prev) → acceleration signal → bearish for risk assets
  - **CPI m/m below 0.3%** → deceleration → bullish for risk assets

**Post-CPI action:**
1. Wait 5 minutes for direction to stabilize
2. Check DXY — which way did it go?
3. If DXY dropped → green light for longs, enter on pullback
4. If DXY spiked → red light, look for shorts on bounce
5. Apply TGIF 20–30% retracement targets from Friday's morning range

### 🛑 16:00–17:00 NY — HARD STOP ⏰
- **ALL positions MUST be closed by 4:00 PM NY.**
- No exceptions. No "just one more tick."
- Close partially if needed to manage last-minute volatility.
- **Friday journal:** 
  - Did the TGIF retracement hit target?
  - What was the actual CPI print vs forecast?
  - Did DXY respect the spring boundaries?
  - What did next week look like based on Friday close?

---

## QUICK REFERENCE — Killzone Times (NY Local)

| Killzone | Time | Reliability | Best Pairs |
|----------|------|-------------|------------|
| Asian KZ | 20:00–00:00 | ×0.8 | XAUUSD (Asian session gold) |
| London KZ | 02:00–05:00 | ×1.3 | EURUSD, GBPUSD |
| NY AM KZ | 08:30–11:00 | ×1.4 | NAS100, XAUUSD |
| NY Lunch | 11:00–13:00 | ×0.4 | AVOID (thin) |
| NY PM KZ | 13:00–16:00 | ×1.1 | All pairs (post-data) |
| NY Close | 16:00–17:00 | ×0.6 | Flat everything |

**Silver Bullet Windows (extra boost):**
- London SB: 03:00–04:00 NY
- NY AM SB: 10:00–11:00 NY
- NY PM SB: 14:00–15:00 NY

**Macro Windows (highest conviction):**
- 09:50–10:10 NY (NY AM peak)
- 14:00–14:20 NY (post-ECB/CPI digestion)

---

## EXIT RULES (Non-Negotiable)

1. **Never hold over the weekend** — especially this week with CPI risk
2. **Friday hard stop at 4:00 PM NY** — manual intervention if needed
3. **If DXY breaks 99.197** — flatten ALL longs immediately, reassess
4. **If Wednesday gate fails** — discard original plan, switch to Plan B
5. **If position hits 2R loss** — reduce size by half for next entry
6. **Daily loss limit:** $300 max. Hit it and walk away.

---

## COMMANDS BY DAY

```bash
# Sunday (prep)
node tools/session_start.cjs
node tools/morning_briefing.cjs
node tools/draw_all_pairs_v6.cjs          # redraw fresh levels
node tools/ict_continuous_learn.cjs --run
node tools/trade_graph.cjs --rebuild

# Monday–Friday (daily)
node tools/session_start.cjs              # refresh data
node tools/morning_briefing.cjs           # ranking + best candidate
node tools/run_pair.cjs <PAIR>           # deep dive on priority pair(s)
node tools/ny_time.cjs --full             # check session/killzone
node tools/macro_feedback.cjs --now       # check macro alignment
node tools/cross_system_guard.cjs         # gate check

# Thursday (ECB day)
node tools/session_start.cjs
node tools/ny_time.cjs --full             # confirm 20:15 NY timing
# Pre-ECB: have entries ready, don't chase headlines
# Post-ECB (15 min after): run run_pair.cjs for updated analysis

# Friday (CPI day)
node tools/session_start.cjs
node tools/ny_time.cjs --full
node tools/macro_feedback.cjs --watch 300  # watch mode during CPI
# CLOSE ALL BY 16:00 NY
```
