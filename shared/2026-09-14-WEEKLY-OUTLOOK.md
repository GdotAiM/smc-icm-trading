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

| Day | ICT Phase | Events | Size | Best Window |
|-----|-----------|--------|------|-------------|
| **Sun** | Closed | Bank holidays | — | Refresh data 21:00 NY |
| **Mon** | Accumulation | UK Srv PMI, US Chi PMI (LOW) | 0.5× | 08:30–11:00 NY |
| **Tue** | Manipulation | US HBCHA Mkt Bas (LOW) | 0.5× | 02:00–05:00 + 08:30–11:00 |
| **Wed** | Reversal Gate ★ | US New House Sales, Unclms (MED) | 0.5× | 08:30–11:00 + gate check |
| **Thu** | Expansion ★★ | US Core PCE (HIGH), Philly Fed (MED) | 0.75× | 08:30–10:00 NY |
| **Fri** | Distribution ★★★ | US Leading Ind, API Crude (MED) | Scalp only | 08:30–10:00 |

**Last Week Recap (Sep 7–12):** Risk-off week. ECB hike priced in, CPI came hot → DXY surged, gold sold hard.
**Weekly Range Position:** EUR/GBP/XAU/NAS all near weekly LOWS. DXY near midpoint. Expect mean-reversion bias early in the week.

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

**Theme:** Testing new weekly range. London session sets tone.
**Size:** 0.5× (early week caution)

### Key Levels
Same as Monday + watch for new extreme formation.

### Trade Plan
- If Monday established a range high/low → Tuesday tests the opposite side.
- **Failure pattern:** If price breaks Monday's high AND reclaims it → accumulation complete, trend resumes.
- **Failure pattern:** If price breaks Monday's low AND holds below → distribution accelerating.
- Focus on 4H structure shifts over 15m noise.

---

## WEDNESDAY SEP 16 — REVERSAL GATE ★

**Theme:** "Wednesday close is the gate." ICT rule — if no extreme formed by Wed close, discard original weekly profile read.
**Events:** US New House Sales, Weekly Unemployment Claims (MED)

### Trade Plan
- **Assess:** Has an extreme formed by Wed NY close?
  - YES → Accumulation complete. Thursday = continuation day.
  - NO → Discard original plan. Switch to Plan B (mean reversion into Friday).
- **Unemployment Claims** at 08:30 ET → watch DXY reaction immediately.
- If claims < 205K (bearish USD) → gold/index longs get green light.
- If claims > 220K (bullish USD) → fade risk-on, stick with shorts.

---

## THURSDAY SEP 17 — EXPANSION ★★

**Theme:** First high-impact day of the week. Core PCE is the Fed's preferred inflation gauge.
**Events:** US Core PCE m/m (exp 0.2%), Philly Fed Manufacturing (MED)

| Pair | Priority | Rationale |
|------|----------|-----------|
| XAUUSD | HIGH | Core PCE directly impacts gold. Hot print = gold selloff. Cool print = bounce. |
| NAS100 | HIGH | Rate-sensitive. PCE drives Fed expectations. |
| EURUSD | MED | ECB hike already done. EUR needs USD weakness to move. |
| DXY | HIGH | PCE = direct USD catalyst. |

### Trade Plan
- **Pre-PCE (08:00–08:25 ET):** Have entries ready but DO NOT front-run.
- **Post-PCE (08:35+ ET):** Wait 5 min for direction. Then run `run_pair.cjs` fresh.
- **Core PCE > 0.3%:** Hot inflation → DXY surges → fade longs on XAU/NAS.
- **Core PCE ≤ 0.2%:** Cool inflation → DXY drops → chase longs on XAU/NAS/EUR.
- **Philadelphia Fed:** Secondary confirmation. If PCE is cool AND Philly Fed > 0 → strong risk-on.

---

## FRIDAY SEP 18 — DISTRIBUTION / TGIF ★★★

**Theme:** Position squaring. No major US data, but European session carry-over.
**Events:** US Leading Index, API Crude Inventories (MED)

### Trade Plan
- **Size:** Scalp only. Max 1% per trade, 2% daily max.
- **Friday Rule:** ALL positions MUST close by 16:00 NY.
- **Leading Index:** 10:00 ET. Weak reading = recession fear = risk-off Friday.
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

# Monday–Wednesday (daily)
node tools/session_start.cjs
node tools/morning_briefing.cjs
node tools/run_pair.cjs <PAIR>
node tools/ny_time.cjs --full
node tools/macro_feedback.cjs --now
node tools/cross_system_guard.cjs

# Thursday (Core PCE day)
node tools/session_start.cjs
node tools/ny_time.cjs --full
node tools/macro_feedback.cjs --watch 600  # watch during PCE
# Post-PCE (5 min after 08:30 ET): run run_pair.cjs for updated analysis

# Friday (TGIF)
node tools/session_start.cjs
node tools/ny_time.cjs --full
# CLOSE ALL BY 16:00 NY
```

---

## EXIT RULES (Non-Negotiable)

1. **Never hold over the weekend** without explicit reason + risk reduction
2. **Thursday PCE:** Do not open NEW positions within 15 min of release
3. **Friday hard stop at 16:00 NY** — manual intervention if needed
4. **If DXY breaks 99.60** — flatten ALL longs immediately, reassess regime
5. **If XAU breaks $4,300** weekly low — abort mean-reversion thesis, switch to trend-following short
6. **Daily loss limit:** $300 max. Hit it and walk away.

---

## WEEKLY QUOTE TO REMEMBER

> *"The more time you spend consolidating in macro time, the less likely continuation."*
> — ICT Weekly Market Outlook, Aug 31, 2026

This week's consolidation across all risk assets (tight ranges, low volume) suggests accumulation is happening. The break direction will be determined by PCE data on Thursday. Until then: watch, don't force.
