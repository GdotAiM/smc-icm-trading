---
name: weekly-session-playbook-sep-14-19
description: Session-by-session trading plan from Sunday Asian KZ through Friday NY PM for the week of Sep 14-19, 2026
metadata:
  type: reference
  tags: [trading-plan, weekly, playbook, ict, killzone]
  week: september-14-19-2026
---

# Weekly Session Playbook — Sep 14–19, 2026

## Week Overview

| Day | ICT Phase | Key Events | Size | Best Window |
|-----|-----------|-----------|------|-------------|
| **Sun** | Closed | Bank holidays | — | Refresh data 21:00 NY |
| **Mon** | Accumulation | Canada CPI (12:30 PM), China data, RBA Hunter Speech | 0.5× | 08:30–11:00 NY |
| **Tue** | Manipulation | UK Jobs (6:00 AM), ADP + Empire State (12:15–12:30 PM) | 0.5× | 02:00–05:00 + 08:30–11:00 |
| **Wed** | **CLIMAX ★★** | **FED RATE DECISION + Projections + Press Conf (6:00 PM ET)** + UK Inflation | 1.0× | 18:00–19:30 NY |
| **Thu** | **CLIMAX ★★** | **BOE RATE DECISION (11:00 AM ET)** + US Jobless Claims + Housing Starts | 1.0× | 11:00–14:00 NY |
| **Fri** | Distribution ★★★ | **BOJ RATE DECISION (3:00 AM ET)** + US Industrial Production + Germany PPI | Scalp only | 08:30–10:00 |

**Last Week Recap (Sep 7–12):** Risk-off week. ECB hike priced in, CPI came hot → DXY surged, gold sold hard.
**Weekly Range Position:** EUR/GBP/XAU/NAS all near weekly LOWS. DXY near midpoint. Three central bank decisions this week will SET the trend for Q4.

---

## Sunday SEP 13 — PREP DAY (NO TRADING)

### Morning (09:00–12:00 NY)
```
✅ session_start.cjs          ← refresh data from TV
✅ run_pair.cjs XAUUSD        ← priority #1 (most oversold)
✅ run_pair.cjs NAS100        ← priority #2 (clean recovery signal)
✅ morning_briefing.cjs       ← cross-pair ranking
✅ pd_array_matrix.cjs --all  ← 20-day confluence
✅ time_price_grid.cjs        ← suspension blocks + Chain of Custody
✅ mmxm_engine.cjs            ← SMR status check
✅ liquidity_marker.cjs       ← PDH/PDL + draw targets
```

### Afternoon (12:00–18:00 NY)
```
✅ Draw all pairs on TV chart — draw_all_pairs_v6.cjs
✅ Build weekly profile probability map
✅ Run ict_continuous_learn.cjs --run   ← extract lessons from last week
✅ Run trade_graph.cjs --rebuild        ← refresh memory graph
```

### Evening (18:00–22:00 NY)
```
✅ Set watchlist alerts:
   - XAUUSD: $4,313 (SSL) / $4,359 (BSL) / $4,300 (wkL)
   - NAS100: $29,412 (BSL) / $29,280 (SSL) / $29,013 (wkL)
   - EURUSD: 1.1616 (BSL) / 1.1578 (SSL) / 1.1584 (wkL)
   - GBPUSD: 1.3521 (BSL) / 1.3500 (SSL) / 1.3480 (wkL)
   - DXY: 99.186 (BSL) / 99.009 (SSL) / 99.20 (wkH)
```

---

## HIGH-IMPACT DAYS THIS WEEK

This is a **three-bank decision week** — Fed, BoE, and BoJ all meeting. Each will set the directional tone for the following days.

### Wednesday Sep 16 — FOMC DAY (CRITICAL)
| Time ET | Event | Impact |
|---------|-------|--------|
| 6:00 PM | **Fed Interest Rate Decision** | 🔴 CRITICAL |
| 6:00 PM | **FOMC Economic Projections (dot plot)** | 🔴 CRITICAL |
| 6:30 PM | **Fed Press Conference (Powell)** | 🔴 CRITICAL |
| 12:30 PM | US Retail Sales MoM (pre-market lead) | 🟡 HIGH |
| 6:00 AM | UK Core/Headline Inflation | 🟡 HIGH |

**Key questions:** Will the Fed hold, cut, or signal a shift? Dot plot direction matters more than the rate itself. Powell's tone on inflation vs growth tradeoff sets the quarter.

### Thursday Sep 17 — BOE DAY
| Time ET | Event | Impact |
|---------|-------|--------|
| 11:00 AM | **BoE Interest Rate Decision** | 🔴 CRITICAL |
| 11:00 AM | **BoE MPC Vote breakdown** | 🔴 CRITICAL |
| 12:30 PM | US Initial Jobless Claims | 🟡 HIGH |
| 12:30 PM | US Housing Starts + Building Permits | 🟡 HIGH |

**Key questions:** Hawkish hold or dovish pivot from BoE? Vote split (cut vs hike vs unchanged) drives GBP volatility.

### Friday Sep 18 — BOJ DAY
| Time ET | Event | Impact |
|---------|-------|--------|
| 3:00 AM | **BoJ Interest Rate Decision** | 🔴 CRITICAL |
| 6:00 AM | Germany PPI | 🟡 HIGH |
| 6:00 AM | UK Retail Sales | 🟡 HIGH |
| 1:15 PM | US Industrial Production | 🟡 HIGH |

**Key questions:** BOJ tightening or pause? Yen intervention risk if USD/JPY gaps.

---

## MONDAY SEP 14 — ACCUMULATION

**Theme:** Post-CPI stabilization. First look at new week direction.
**Best Models:** Range bound, watch for London Killzone sweeps.

### Key Levels
| Pair | Price ( Fri Close ) | Weekly Low | Weekly High | Mid-Range |
|------|---------------------|------------|-------------|-----------|
| XAUUSD | 4327.77 | 4300.80 | 4510.93 | 4405.86 |
| NAS100 | 29287.20 | 29013.10 | 29735.30 | 29374.20 |
| EURUSD | 1.15921 | 1.15835 | 1.16544 | 1.16190 |
| GBPUSD | 1.35088 | 1.34802 | 1.35680 | 1.35241 |
| DXY | 99.087 | 98.599 | 99.612 | 99.106 |

### Trade Plan
- **XAUUSD:** Price at 13% of weekly range from low. Double-tap on 4313 SSL would confirm distribution exhaustion. Watch for reversal off 4300 weekly low.
- **NAS100:** Clean BOS at 29246.9 on Thu/Fri. Recovery to 29412 BSL = first test of bullish restoration.
- **EURUSD:** Bearish BOS at 1.15997. 1.1578 SSL = last line of defense before weekly low 1.15835.
- **GBPUSD:** CHoCH at 1.35166. 1.3500 SSL is immediate support; 1.3480 weekly low is structural floor.
- **DXY:** 99.087 (48% of range). Neutral zone. Watch 99.009 SSL breakdown = risk-on confirmation.

### What to Watch
⭐ **09:50 NY** — NY AM Macro (UK Srv PMI at 03:00 ET / US Chi PMI at 08:30 ET)
⏳ **10:00–11:00 NY** — Silver Bullet window
🔴 **Friday hard stop does NOT apply Monday** — normal rules until Thursday

---

## TUESDAY SEP 15 — MANIPULATION

**Theme:** Pre-FOMC positioning. UK jobs data sets GBP tone.
**Size:** 0.5× (tight ranges ahead of Wednesday)

### Key Levels
Same as Monday + watch for new extreme formation.

### Trade Plan
- If Monday established a range high/low → Tuesday tests the opposite side.
- **UK Jobs (6:00 AM ET):** Strong payrolls = GBP bullish. Weak = fade into FOMC.
- **ADP + Empire State (12:15–12:30 PM ET):** Early Fed signal. Heat = hawkish lean.
- Focus on 4H structure shifts over 15m noise.

---

## WEDNESDAY SEP 16 — FOMC ★★

**Theme:** The most important day of the week. Fed sets the tone for Q4.
**Events:** Fed Rate Decision + Dot Plot + Press Conference @ 6:00 PM ET

### Pre-FOMC (Morning–Afternoon)
- Retail Sales at 12:30 PM ET is the last US data before the decision
- UK Inflation at 6:00 AM ET sets GBP context
- **Do not open new positions 30 min before FOMC** — spread widening

### Post-FOMC (6:00–7:30 PM ET)
1. **Rate decision** → compare to consensus (hold vs cut vs hawkish hold)
2. **Dot plot** → median projection for year-end = bigger signal than the decision
3. **Powell presser** → listen for inflation vs employment language shift
4. Wait 5 min after presser for direction → run `run_pair.cjs` fresh
5. Enter on pullback to structural level, SL at swing invalidation

### Key Scenarios
- **Hawkish hold (no cut, dots show fewer cuts):** DXY surges → fade XAU/NAS longs
- **Cut signaled (dovish tilt):** DXY drops → chase XAU/NAS/EUR longs
- **Surprise cut:** Maximum volatility. Wait for Powell to finish speaking before entering.

---

## THURSDAY SEP 17 — BOE ★★

**Theme:** BoE decision sets GBP trend. US labor data confirms/contradicts Fed.
**Events:** BoE Rate Decision @ 11:00 AM ET + Jobless Claims @ 12:30 PM ET

| Pair | Priority | Rationale |
|------|----------|-----------|
| GBPUSD | HIGH | Direct impact from BoE decision |
| XAUUSD | HIGH | Post-FOMC continuation or reversal |
| DXY | HIGH | BoE tone affects USD cross-rates |
| NAS100 | MED | Risk-on/off shift from BoE |

### Trade Plan
- **Pre-BoE (before 11:00 AM):** Position for outcome. Watch GBPUSD structure from Monday/Tuesday.
- **Post-BoE (11:00–12:00 PM):** Enter on confirmed direction. SL at structural invalidation.
- **Jobless Claims (12:30 PM):** Secondary catalyst. If claims < 220K = USD weakness extends.
- **Failure pattern:** If BoE is dovish but claims are hawkish → chop, no clear direction.

---

## FRIDAY SEP 18 — BOJ + DISTRIBUTION ★★★

**Theme:** BOJ decision sets JPY tone. Position squaring across all pairs.
**Events:** BoJ Rate Decision @ 3:00 AM ET + US Industrial Production @ 1:15 PM ET

| Pair | Priority | Rationale |
|------|----------|-----------|
| DXY | HIGH | BOJ tightening = yen strength = DXY pressure |
| XAUUSD | HIGH | JPY carry unwinds affect gold funding |
| NAS100 | MED | Yen strength = risk-off headwind |
| EURUSD | MED | Cross-rate effects from BOJ |

### Trade Plan
- **Size:** Scalp only. Max 1% per trade, 2% daily max.
- **Friday Rule:** ALL positions MUST close by 16:00 NY.
- **BOJ (3:00 AM ET):** Small window but potentially massive for USD/JPY and carry trades.
  - Rate hike = yen strengthens = DXY down = risk-on
  - Hold = status quo = range continues
  - Hawkish surprise = massive USD sell-off
- **Industrial Production (1:15 PM ET):** Late-week momentum indicator
- **TGI Retracement Model:**
  1. Peak expansion expected during 09:30–10:10 ET macro window
  2. Watch if BSL is GUARDED (reversal) vs SWEPT (continuation)
  3. Target 25% retracement from week's range high
  4. Close all by 16:00 NY regardless

---

## WEEKLY PROFILE ANALYSIS

### Price Action Summary (Sep 7–12)
| Pair | Open | Close | Change | Wk Range | Position in Range |
|------|------|-------|--------|----------|-------------------|
| EURUSD | 1.16231 | 1.15921 | -0.27% | 1.158–1.165 | 12% from low (near floor) |
| GBPUSD | 1.35408 | 1.35088 | -0.24% | 1.348–1.357 | 33% from low (lower third) |
| XAUUSD | 4406.07 | 4327.77 | -1.78% | 4301–4511 | 13% from low (near floor) |
| NAS100 | 29559.4 | 29287.2 | -0.92% | 29013–29735 | 38% from low (lower third) |
| DXY | 98.903 | 99.087 | +0.19% | 98.60–99.61 | 48% (mid-range) |

### Weekly Structure
- **Pattern:** B (Sell off, recover to mid, sell again)
- **Wk High:** Mon 09/07 (EUR/GBP) / Tue 09/08 (XAU) / Mon 09/07 (NAS)
- **Wk Low:** Thu 09/10 for EUR/GBP/XAU / Wed 09/09 for NAS / Wed 09/09 for DXY
- **CPI Day (Fri 09/11):** Risk assets hit session lows, DXY consolidated

### Mean-Reversion Bias
All four risk assets (EUR, GBP, XAU, NAS) closed near their weekly lows. This creates a **technical overshoot signal** — expect mean-reversion bounce in the first 1–2 days of next week unless new catalyst overrides.

**BUT:** DXY is at 99.087 (mid-range), not extended. Dollar can still strengthen without hitting resistance. The mean-reversion thesis requires DXY to hold or weaken.

---

## INVALIDATION LEVELS

```
XAUUSD $4,300   →  weekly low. Break and hold = next target $4,260 (prev swing)
                →  Hold above $4,313 (double-tap SSL) = recovery confirmed

NAS100 $29,013  →  weekly low. Break below = panic selling resumes
                →  Reclaim $29,280 (swept SSL) = first bullish signal

EURUSD 1.1578   →  7-touch SSL. Break below = acceleration to 1.1550
                 →  Hold = consolidation or bounce

GBPUSD 1.3480   →  weekly low. Same story as EUR
                 →  Reclaim 1.3500 = short-term bullish shift

DXY 99.60       →  weekly high. Break above = dollar dominance resumes
                 →  Break below 99.00 = risk-on confirmed
```

---

## EXECUTION PRIORITY

1. **XAUUSD** — Most oversold (-1.78% weekly). Best R:R on mean-reversion bounce.
2. **NAS100** — Clean BOS structure, recovery in progress.
3. **DXY** — Watch first. Confirms direction for everything else.
4. **EURUSD** — Quiet range, wait for DXY direction.
5. **GBPUSD** — Similar to EUR but slightly more aligned.

---

## COMMANDS BY DAY

```bash
# Sunday (prep)
node tools/session_start.cjs
node tools/morning_briefing.cjs
node tools/draw_all_pairs_v6.cjs
node tools/ict_continuous_learn.cjs --run
node tools/trade_graph.cjs --rebuild

# Monday–Tuesday (daily)
node tools/session_start.cjs
node tools/morning_briefing.cjs
node tools/run_pair.cjs <PAIR>
node tools/ny_time.cjs --full
node tools/macro_feedback.cjs --now
node tools/cross_system_guard.cjs

# Wednesday (FOMC day)
node tools/session_start.cjs
node tools/ny_time.cjs --full
node tools/macro_feedback.cjs --watch 600  # watch during FOMC
# Post-FOMC (5 min after 6:30 PM ET presser): run run_pair.cjs for updated analysis

# Thursday (BoE day)
node tools/session_start.cjs
node tools/ny_time.cjs --full
# Post-BoE (15 min after 11:00 AM ET): run run_pair.cjs for updated analysis

# Friday (BOJ + TGIF)
node tools/session_start.cjs
node tools/ny_time.cjs --full
# BOJ at 3:00 AM ET — pre-position or stay flat
# CLOSE ALL BY 16:00 NY
```

---

## EXIT RULES (Non-Negotiable)

1. **Never hold over the weekend** without explicit reason + risk reduction
2. **FOMC (Wed 6:00 PM ET):** Do not open NEW positions within 30 min before/after
3. **BoE (Thu 11:00 AM ET):** Same rule — wait for initial spike to settle
4. **BoJ (Fri 3:00 AM ET):** Small window, consider staying flat unless setup is clear
5. **Friday hard stop at 16:00 NY** — manual intervention if needed
6. **If DXY breaks 99.60** — flatten ALL longs immediately, reassess regime
7. **If XAU breaks $4,300** weekly low — abort mean-reversion thesis, switch to trend-following short
8. **Daily loss limit:** $300 max. Hit it and walk away.

---

## WEEKLY QUOTE TO REMEMBER

> *"The more time you spend consolidating in macro time, the less likely continuation."*
> — ICT Weekly Market Outlook, Aug 31, 2026

This is NOT a quiet week. Three central bank decisions (Fed Wed, BoE Thu, BoJ Fri) will determine the trend for Q4. The mean-reversion thesis from last week's lows depends on the Fed being dovish. If the Fed stays hawkish, all risk assets could extend lower into next week.
