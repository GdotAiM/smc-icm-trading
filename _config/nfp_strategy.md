# NFP Trading Strategy — SMC/ICT Approach

*Built from: ICT One Shot One Kill, Seek and Destroy Friday, Vacuum Block. Battle-tested: August 7, 2026.*

## NFP Quick Reference

| Attribute | Value |
|-----------|-------|
| **Day** | First Friday of every month |
| **Time** | 08:30 AM NY |
| **Impact** | EXTREME — biggest monthly volatility event |
| **ICT Rule** | No positions 30 min before/after (can override with wide stops) |
| **Best Instrument** | 🥇 XAUUSD (proven edge — 4/4 wins in live testing) |
| **Secondary** | EURUSD (if dollar trend is clear) |
| **Avoid** | GBPUSD + EURUSD together (correlated dollar risk) |

## The Pattern

NFP creates a massive liquidity sweep. ICT teaches that the initial spike hunts both BSL and SSL before establishing the real direction. The key is to be positioned WITH the dominant trend BEFORE the release, using wide stops to survive the whipsaw.

```
Pre-NFP (Mon-Thu):     Sideways/consolidation → Seek & Destroy condition
NFP Morning (Fri AM):  Trend alignment check (15m/5m/1m must agree)
08:30 NY:              Spike hunts liquidity both sides
Post-Spike:            Real direction emerges → trend continuation
10:00 NY:              Silver Bullet re-entry opportunity
```

## Phase 1: Pre-NFP Preparation (Day Before or Early Morning)

### Checklist

```
[ ] Verify NFP date on economic calendar
[ ] Run: node tools/session_start.cjs — must succeed
[ ] Run: node tools/run_pair.cjs XAUUSD — full analysis
[ ] Verify: 15m/5m/1m ALL aligned (same direction)
[ ] Pre-calculate SL/TP levels (2.5× / 3.5× normal)
[ ] Fix any tool bugs BEFORE NFP morning
[ ] Disable autonomous trading on NFP morning
[ ] Ensure monitor/position tracking is running
```

### Trend Alignment Requirement

Only trade pairs where ALL 3 timeframes agree:

| TF | Check | Weight |
|----|-------|--------|
| 15m | Dominant intraday trend | Must match |
| 5m | Entry confirmation | Must match |
| 1m | Micro structure | Must match |

If ANY pair shows MIXED trends → **SKIP IT.** NFP will punish uncertainty.

## Phase 2: NFP Morning (~7:00-8:15 AM NY)

### Fresh Data is Critical

Data must be ≤30 min old at NFP release time. If session_start was run earlier, **re-run it.**

```bash
# 1. Fresh session startup
node tools/session_start.cjs

# 2. Verify trend alignment from engine data
node -e "
const fs = require('fs');
['XAUUSD','EURUSD','NAS100'].forEach(p => {
  const dir = p === 'XAUUSD' ? 'GOLD' : p;
  const e15 = JSON.parse(fs.readFileSync('shared/' + new Date().toISOString().split('T')[0] + '/' + dir + '/engine_15m.json'));
  const e5 = JSON.parse(fs.readFileSync('shared/' + new Date().toISOString().split('T')[0] + '/' + dir + '/engine_5m.json'));
  const e1 = JSON.parse(fs.readFileSync('shared/' + new Date().toISOString().split('T')[0] + '/' + dir + '/engine_1m.json'));
  const aligned = e15.structure.bias === e5.structure.bias && e5.structure.bias === e1.structure.bias;
  console.log(p + ': 15m=' + e15.structure.bias + ' 5m=' + e5.structure.bias + ' 1m=' + e1.structure.bias + ' → ' + (aligned ? '✅ TRADE' : '❌ SKIP'));
});
"
```

### Calculate NFP Trade Levels

Use the NFP multipliers: **SL = 2.5× normal, TP = 3.5× normal**

| Pair | Type | Normal SL | Normal TP | NFP SL | NFP TP |
|------|------|-----------|-----------|--------|--------|
| XAUUSD | Metal | 15 pts | 25 pts | 38 pts | 88 pts |
| EURUSD | Forex | 8 pips | 15 pips | 20 pips | 53 pips |
| NAS100 | Index | 150 pts | 400 pts | 375 pts | 1400 pts |

### Position Sizing for NFP

| Profile | Risk | Max Positions | Friday? |
|---------|------|---------------|---------|
| Aggressive | 1% ($100) per pair | 3 | ×0.7 size |
| Standard | 0.7% ($70) per pair | 2 | ×0.7 size |
| Conservative | 0.5% ($50) | 1 (XAUUSD only) | ×0.7 size |

## Phase 3: Execution (08:15-08:30 AM NY)

### Primary Path: market_order.cjs (Most Reliable)

The news_trade.cjs tool has CDP scanning issues. Use market_order.cjs directly with pre-calculated levels:

```bash
# XAUUSD BUY (example — adjust direction and levels based on analysis)
node tools/tv-mcp/market_order.cjs XAUUSD BUY 4286.27 4411.27 100

# EURUSD BUY
node tools/tv-mcp/market_order.cjs EURUSD BUY 1.15086 1.15811 10000
```

### Secondary Path: news_trade.cjs (If Fixed)

Only use if the following bugs have been fixed:
1. `trend1m: trend1m` → `trend1m: trend1` (line 158)
2. Timezone: pass NY time converted to local system time
3. CDP candle scanning resilience

```bash
# Calculate local time for 08:30 NY:
# NY is UTC-4 (EDT). Convert: 08:30 NY = 12:30 UTC.
# System local = UTC + offset. Pass local time.
node tools/tv-mcp/news_trade.cjs --event "NFP" --time "14:30" --pairs XAUUSD
```

### Fallback: Manual TV Entry

If both tools fail: place manually on TradingView with SL/TP from the pre-calculated levels.

## Phase 4: Post-NFP (After 08:30 AM NY)

### The First 30 Minutes (08:30-09:00 AM)

```
🚫 DO NOT CHASE THE SPIKE
⏳ Wait for spike to settle
👀 Observe direction — spike confirms or reverses the pre-NFP trend
📝 Log what happened vs prediction
```

### The Retracement Entry (09:00-10:00 AM)

If the spike went in the predicted direction (bullish):

1. Wait for spike to find a high
2. Wait for retracement to begin
3. Calculate OTE zone: 62-79% of spike range
4. Wait for MSS on 1m confirming reversal back up
5. Enter long at OTE with normal stops (not news-sized)

### Silver Bullet Re-Entry (10:00-11:00 AM NY)

The NY AM SB is the best post-NFP re-entry window:
- First 15 min: wait for liquidity sweep
- Entry on FVG in spike direction
- SB-sized stops (2× ATR)
- Target: opposing liquidity pool from the spike

## NFP Trade Plan Template

```markdown
## NFP Trade Plan — [DATE]

### Pre-NFP Trend
| Pair | 15m | 5m | 1m | Aligned? |
|------|-----|----|-----|----------|
| XAUUSD | | | | |
| EURUSD | | | | |
| NAS100 | | | | |

### Executed Trades
| # | Pair | Dir | Entry | SL | TP | Qty | R:R | Status |
|---|------|-----|-------|-----|------|-----|-----|--------|
| 1 | | | | | | | | |

### NFP Spike
| Pair | Pre | Post | Δ | Direction Correct? |
|------|-----|------|---|--------------------|

### Post-NFP OTE Entry
| Pair | Spike Range | OTE Zone | MSS? | Entry |
|------|-------------|----------|------|-------|

### P&L
| Trade | P&L | Notes |
|-------|-----|-------|
```

## Known Failure Modes (Aug 7, 2026)

| Failure | Impact | Fix |
|---------|--------|-----|
| FRIDAY_PLAN.md missing NFP flag | No awareness NFP was coming | Add calendar check to session_start |
| Session startup failed at 2 AM | No fresh data for 5 hours | Auto-retry with backoff |
| Autonomous system placed corrupt trades | EURUSD @ 29446, 4 positions, all unverified | NFP morning: disable autonomous mode |
| Monitor died at 4:23 AM | No position tracking for 4+ hours | Watchdog with auto-restart |
| news_trade.cjs: trend1m bug | ReferenceError crashes tool | Fixed (line 158) |
| news_trade.cjs: timezone bug | -313 min, thinks event passed | Pass local-converted time |
| news_trade.cjs: CDP scanning fails | Empty results, no trades placed | Add market_order.cjs fallback |
| No fallback execution path | news_trade fails → nothing placed | Pre-calculate levels, use market_order directly |

## Pre-NFP Checklist (Reusable)

```bash
#!/bin/bash
# NFP Morning Checklist — run ~7:00 AM NY

echo "=== NFP CHECKLIST ==="

# 1. Verify today is NFP Friday
node tools/ny_time.cjs --now | grep -q "Friday" && echo "✅ Friday" || echo "⚠️ Not Friday"
python tools/economic_calendar.py 2>/dev/null | grep -i "non-farm\|nfp" && echo "✅ NFP on calendar" || echo "⚠️ Check calendar manually"

# 2. Kill autonomous mode
echo "⚠️ DISABLE autonomous trading for NFP morning"

# 3. Fresh session startup
node tools/session_start.cjs

# 4. Run analysis on all pairs
for pair in XAUUSD EURUSD NAS100; do
  echo "=== $pair ==="
  node tools/run_pair.cjs $pair 2>&1 | tail -5
done

# 5. Calculate NFP levels
echo "Run: node tools/get_live_price.cjs XAUUSD"
echo "Then place via: node tools/tv-mcp/market_order.cjs"

echo "=== READY FOR NFP ==="
```

## References

- ICT One Shot One Kill — enter during killzone after high-impact event sweep
- ICT Seek and Destroy Friday — Mon-Thu sideways, Friday NFP, trade AFTER release
- ICT Vacuum Block — catalyst creates gap, trade the retest
- July 29 FOMC trade: XAUUSD +$2,554 in 90 seconds (SL 15 pts, TP 25 pts)
- July 30 Retrospective: Gold 4/4 wins, +$17,156 — dollar pairs net negative
- Today's journal: `shared/2026-08-07/NFP_SESSION_JOURNAL.md`
