# Friday August 7, 2026 — Consolidation & Weekly Close

## ICT Context: The Friday Profile

> "Friday is consolidation. The week's move digests. Don't force — if nothing sets up, walk away flat. Close everything by 4PM." — ICT

> "If Monday-Wednesday accumulated and Thursday expanded, Friday consolidates the range. Look for the weekly high/low to be defended, not broken." — ICT Weekly Profiles

## Weekly State (Thursday Close)

| Metric | Value |
|--------|-------|
| Week P&L | +$489 (1 trade, 1 win, 0 losses) |
| Weekly Bias | BULLISH (from Mon-Thu structure) |
| Thursday | Expansion confirmed — XAUUSD +42 pt range, EURUSD +30 pip range |
| Weekly high | Likely formed Thursday — watch for defense |
| Friday role | Consolidation within Thursday's range |

## Friday Trading Rules (from _config/trading_rules.md)

| Rule | Detail |
|------|--------|
| **No new entries after 4PM NY** | Close ALL positions by NY close |
| **×0.7 position sizing** | Reduced risk on Friday |
| **No holding over weekend** | Everything flat by 4PM |
| **×0.8 model multipliers** | Lower confidence on all setups |
| **Max 1 trade** | Conservative day — don't force it |

## The Friday Setup

```
Mon-Thu: BULLISH trend established (+$489 realized)
    ↓
Thursday: Expansion — range expanded, weekly high formed
    ↓
Friday AM: Consolidation / profit-taking — dip toward weekly value
    ↓
Friday PM: Range-bound, close defense — institutions square positions
    ↓
NY Close: Everything flat. No weekend exposure.
```

## Key Windows (Friday)

```
02:00 AM — London KZ opens — scan only, low confidence
03:00 AM — London SB — ×0.8 multiplier (Friday discount)
07:00 AM — Lecture 2: London Hunt — if weekly high needs defending
08:30 AM — Lecture 1+4 complex
09:30 AM — AMOR / A-Plus equity open
10:00 AM — NY AM SB — best Friday window
11:00 AM — Start thinking about closing
13:00 PM — PM session — only if a clear setup
15:50 PM — PRE-CLOSE — close everything
16:00 PM — NY CLOSE — FLAT. Weekend.
```

## Pair Outlook

### 🥇 XAUUSD — The Mover
- Thursday swung 4,231–4,275 (44 pts). Friday should consolidate.
- Weekly high ~4,275 — watch for defense, not breakout
- If price drifts toward 4,240-4,250 discount, look for a scalp long
- **Don't chase a breakout on Friday** — it's likely a trap

### 🥈 EURUSD
- Thursday range approximately 1.1515–1.1545
- Weekly bullish structure intact
- Look for dip-buying at discount within Thursday range
- Low conviction — Friday EURUSD tends to be choppy

### 🥉 NAS100
- Thursday bullish continuation
- Tech/semiconductor weakness earlier in week — Friday may see relief
- Risk-on/risk-off from DXY will drive direction

## What to Actually Do

1. **Session start**: `node tools/session_start.cjs`
2. **AM scan only**: Run analysis but don't force entries
3. **One good trade, or none**: If XAUUSD dips to discount within Thursday range with MSS → scalp long with ×0.7 size
4. **Close by 3:50 PM**: Everything flat before the close
5. **Journal the week**: Full weekly review after close

## One Command

```bash
# Standard startup + monitoring (NO --execute on Friday — manual only)
node tools/session_start.cjs
# Then scan pairs and evaluate. Conservative day.
```

## Weekly P&L Target

| | |
|---|---|
| Current | +$489 |
| Friday target | +$0 to +$100 (conservative) |
| Week target | Maintain positive week |
| Risk | ×0.7 normal = $70 max |

**The #1 goal Friday: Don't give back the week's profit.**
