# Gold Decision Post-Mortem — July 31, 2026

## What We Did

```
02:29 NY — Entered XAUUSD LONG 50 @ 4,085.18
           SL: 4,071 | TP: 4,111
           Signal: 5m bullish (live_levels.cjs)
           Conviction: Gold 4/4 edge, Friday ×0.6 sizing
~03:30    — SL hit at 4,071 (-$71)
```

## What We Missed (Flying Blind)

| Layer | Supposed To Check | Actually Checked | Status |
|-------|------------------|-----------------|--------|
| 15m trend | Multi-TF alignment scan | **NEVER RAN** — inline eval broke silently | ❌ Blind |
| 1m trend | Multi-TF alignment scan | **NEVER RAN** — same bug | ❌ Blind |
| 5m trend | live_levels.cjs | ✅ Checked — said BULLISH | ✅ |
| Signal conflict | 1D/4H/forecast/alignment filter | **NOT RUN** — needs all TFs | ❌ Blind |
| Judas Swing risk | Check equal lows near SL | **NOT CHECKED** | ❌ Blind |
| SB window timing | Wait for 03:00 overlap | **ENTERED EARLY** at 02:29 | ❌ Wrong |

**We made a trading decision on 33% of the required data.** Only 5m was checked. 15m and 1m were dark.

## What ICT Teaches

### The Exact Rule We Broke

> *"Wait for the killzone to open. **Do not enter before the window.**"*
> — ICT Master Kill Zones

The London KZ runs 02:00-05:00. The Silver Bullet overlap is 03:00-04:00. ICT's trade flow is:
1. Set bias BEFORE the window
2. Mark liquidity draws
3. **Wait for window to open**
4. Let the initial sweep complete
5. Enter on the reversal

We did step 1 (set bias — bullish), skipped 2-4, and entered at step 5 before steps 2-4 happened.

### The Overlap Window

> *"The London Killzone runs from 02:00 to 05:00, and the London Silver Bullet runs from 03:00 to 04:00 — fully contained inside it. Overlap window: 03:00 to 04:00."*
> — ICT Killzone-Silver Bullet Overlap

The 02:00-03:00 period is the **manipulation hour**. This is when the Judas Swing happens — liquidity sweeps, stop hunts, fake-outs. The 03:00-04:00 overlap is the **real entry window** — post-sweep, higher probability.

We entered during the manipulation hour. Our SL sat right where the manipulation was heading.

## What The Data Now Shows (Post-Mortem)

After fixing the multi-TF scan, here's what XAUUSD actually was:

```
At entry (02:29):  5m BULLISH (the only TF we checked)
                   15m: UNKNOWN (scan was broken)
                   1m:  UNKNOWN (scan was broken)

Post-sweep (03:55): 15m BEARISH, 5m BEARISH, 1m BEARISH — 3/3 SHORT
                    Gold kept dropping past our SL
```

The 15m was likely already bearish or flipping at our entry time. If we had the full scan, the signal conflict filter would have caught it: 5m bullish vs 15m potentially bearish = mixed signal = skip or wait.

## Solutions

### 1. Mandatory Pre-Entry Checklist (Automated)

Before ANY trade, a script must confirm:

```
[ ] ny_time.cjs — are we in the SB overlap window? (03:00-04:00 for London)
[ ] scan_all_pairs.cjs — full 15m/5m/1m alignment for the pair
[ ] Signal conflict: all 3 TFs agree? (≥2/3 required)
[ ] Judas Swing: equal lows/highs within 1× ATR of SL?
[ ] Entry timing: are we PAST the first 15 min of the killzone?
```

This should be a single script: `pre_entry_check.cjs PAIR DIRECTION` that returns GO/NO-GO.

### 2. Killzone Entry Window Gate

```
London KZ (02:00-05:00):
  02:00-03:00: MANIPULATION HOUR — no new entries, watch for sweeps
  03:00-04:00: SB OVERLAP — ✅ ENTRY WINDOW
  04:00-05:00: POST-SB — entries only if strong continuation signal

NY AM KZ (08:00-11:00):
  08:00-09:00: MANIPULATION HOUR
  09:00-10:00: PRE-SB — cautious entries
  10:00-11:00: SB OVERLAP — ✅ ENTRY WINDOW
```

### 3. Scan Reliability Monitor

Before every autonomous check, verify the scan ran successfully:
- If `scan_all_pairs.cjs` returns error or empty → flag as BLIND, do not trade
- If any TF is missing → flag as PARTIAL, reduce confidence
- Only trade when ALL TFs return valid data

### 4. Immediate Code Change

Update the autonomous check flow from:
```
live_levels.cjs (5m only) → place trade
```
To:
```
scan_all_pairs.cjs (15m/5m/1m) → signal conflict filter → pre_entry_check → place trade
```

## Summary

| What Went Wrong | Root Cause | Fix |
|----------------|-----------|-----|
| Entered too early | No killzone timing gate | Mandatory window check before entry |
| Missing 15m/1m data | Inline eval broken | Use scan_all_pairs.cjs (already fixed) |
| SL in sweep zone | No Judas Swing check | Check equal lows within 1× ATR of SL |
| No signal conflict filter | Missing TFs | 3-TF alignment required before entry |
| Friday sizing was correct | — | 50% limited loss to -$71 |

The trade itself was a $71 lesson that exposed 4 system gaps. All fixable. All documented.
