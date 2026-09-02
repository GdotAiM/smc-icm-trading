# ICT News Trading Strategy — Automation Integration

*Built from ICT knowledge base: One Shot One Kill, Seek and Destroy Friday, Vacuum Block*

## ICT Principles for News Trading

### Source Concepts (from 138 ICT tutorials)

| Concept | Tier | Key Rule |
|---------|------|----------|
| **One Shot One Kill** | Strategies | Wait for high-impact event to sweep liquidity — grab that opportunity. 50-75 pips/week. |
| **Seek and Destroy Friday** | Strategies | NFP/FOMC weeks: Mon-Thu sideways, clear weekly bias, trade AFTER release |
| **Vacuum Block** | Advanced | Catalyst (FOMC/NFP/CPI) creates gap — assess longevity, trade the retest |
| **Macro Time-Based** | Strategies | Don't ignore news inside the window — it distorts price action |

### ICT One Shot One Kill — The Framework

```
1. Note all medium and high-impact economic events
2. Mark the 20-week IPDA dealing range
3. Identify the next draw on liquidity inside the dealing range
4. Identify the bias-aligned PD array (OB, FVG, Breaker)
5. Wait for the anchor point
6. Drop to 15-minute for OTE entry
7. Execute during London or New York killzone
```

### How We Apply This

Our automation implements One Shot One Kill as follows:

| ICT Step | Automation Implementation |
|----------|--------------------------|
| 1. Note events | `economic_calendar.py` → `today_events.json` → `news_trade.cjs` |
| 2. 20-week range | Near the weekly high/low from engine data |
| 3. Liquidity draw | Nearest swing high/low from 5m/15m structure scan |
| 4. PD array | FVG/OB from SMC engine reports |
| 5. Anchor point | 15m CHoCH/MSS confirmation |
| 6. 15m OTE | Entry at Market during killzone (SB window) |
| 7. Killzone execution | NY AM (8-11) or NY PM SB (14-15) |

## The Fed Day Playbook (Proven Jul 29)

### Pre-Event Checklist

```
[ ] Calendar shows High-impact event (FOMC, NFP, CPI)
[ ] Mon-Thu price action is sideways/irregular (Seek & Destroy condition)
[ ] Weekly bias is clear from 1W/1D structure
[ ] No counter-trend entries allowed during news window
[ ] SL must be 2-3× ATR to survive whipsaw
[ ] TP targets next liquidity pool at 3-5× ATR
```

### The Setup That Worked: XAUUSD LONG

```
Event:    FOMC 14:00 NY
Entry:    15:58 NY (2 min before)
Pair:     XAUUSD (OANDA)
Direction: LONG (all 3 TFs bullish)
Entry:    4,042.06
SL:       4,027.51 (15 pts, ~2.5× ATR of 6.2)
TP:       4,067.51 (25 pts, ~4× ATR)
Result:   TP HIT in 90 seconds → +$2,554
R:R:      1:1.7

Why it worked:
✅ Clear trend on 15m/5m/1m — all bullish
✅ SL below 5m swing low — structural, not arbitrary
✅ TP at logical resistance — achievable given ATR
✅ News catalyst provided the energy for the move
✅ Gold is the classic FOMC play — no dollar exposure
```

### The Setups That Failed

```
EURUSD LONG:  Counter-trend (15m bearish, went long on 5m bounce)
GBPUSD SHORT: Counter-trend to dollar (dollar rallied on hawkish tone)
Both stopped out within seconds of the release.
Lesson: During FOMC, dollar-pairs are a coin flip. Trade gold/indices.
```

## Automation Integration

### Command

```bash
# Standard news trade
node tools/tv-mcp/news_trade.cjs --event "FOMC" --time "14:00"

# Conservative (only highest-conviction pairs)
node tools/tv-mcp/news_trade.cjs --event "NFP" --time "08:30" --pairs XAUUSD

# Aggressive (all tradeable pairs)
node tools/tv-mcp/news_trade.cjs --event "CPI" --time "08:30"
```

### What the System Does

1. **Fetches economic calendar** → identifies next High-impact event
2. **Scans all pairs** for trend alignment (15m/5m/1m must agree)
3. **Scores setups** (3/3 = all aligned, 1/3 = partial)
4. **Calculates news levels**: SL = 2.5× normal, TP = 3.5× normal
5. **Places trades** 2-5 min before event via `market_order.cjs`
6. **Saves plan** to `shared/YYYY-MM-DD/news_trade_plan.json`
7. **Monitors outcomes** via `check_orders.cjs`
8. **Extracts lessons** via `ict_continuous_learn.cjs --run`

### Position Sizing for News

| Risk Profile | SL Multiplier | TP Multiplier | Max Positions |
|-------------|---------------|---------------|---------------|
| Conservative | 3× ATR | 5× ATR | 1-2 pairs |
| Standard | 2.5× ATR | 3.5× ATR | 3-4 pairs |
| Aggressive | 2× ATR | 3× ATR | All tradeable |

### Post-Event Workflow

```bash
# 1. Check outcomes
node tools/tv-mcp/check_orders.cjs

# 2. Journal the event
node tools/ict_continuous_learn.cjs --run

# 3. Rebuild graph
node tools/trade_graph.cjs --rebuild

# 4. Review lessons
node tools/trade_graph.cjs --lessons XAUUSD
```

## ICT Rules We Must Follow

From the knowledge base:

1. **Don't trade every news event.** Only when weekly bias is clear and Mon-Thu is consolidating (Seek & Destroy).
2. **Don't trade before the release.** Wait for the initial sweep, then enter on the retracement (One Shot One Kill).
3. **Assess catalyst longevity.** FOMC rate change > CPI print > routine data (Vacuum Block).
4. **Use the 15m OTE.** Don't chase the initial spike — wait for the 15m retracement to OTE levels.
5. **Target the next liquidity pool.** Not arbitrary R:R — actual institutional reference points.
6. **Only during killzones.** London KZ (02-05 NY) or NY KZ (08-11 NY) or Silver Bullet windows.

## Next Events to Trade

| Date | Event | Time (NY) | Best Pairs (historically) |
|------|-------|-----------|--------------------------|
| First Fri | NFP | 08:30 | XAUUSD, EURUSD |
| FOMC Wed | Rate Decision | 14:00 | XAUUSD, NAS100 |
| Monthly | CPI | 08:30 | XAUUSD, EURUSD, GBPUSD |
| Weekly | Unemployment Claims | 08:30 | EURUSD |

## References

- ICT One Shot One Kill: `references/01 - ICT Trading Tutorials/ict-one-shot-one-kill.md`
- ICT Seek and Destroy Friday: `references/01 - ICT Trading Tutorials/ict-seek-and-destroy-friday.md`
- ICT Vacuum Block: `references/01 - ICT Trading Tutorials/ict-vacuum-block-opening-gaps.md`
- Trade Outcomes: `shared/2026-07-29/TRADE_OUTCOMES.md`
