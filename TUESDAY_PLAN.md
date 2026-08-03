# Tuesday August 4, 2026 — Autonomous Trading Plan

## Monday Close — Position Status

| Pair | Direction | Entry | Current | SL | TP | P&L | Pyramid |
|------|-----------|-------|---------|-----|-----|-----|---------|
| NAS100 | LONG | 28,642 | 28,830 | 28,169 | 28,990 | +$188 | All 3 crossed |

## Weekly Context (from Monday classification)

- **Weekly Profile**: III — Wednesday LOW expected (BULLISH anchor ×1.4)
- **Tuesday role**: Accumulation→Manipulation. "Range extends or reverses. Turnaround Tuesday."
- **DXY**: BEARISH → RISK-ON (supports longs)
- **MMXM**: SMR forming — watch for SMR to fire Tuesday/Wednesday

## Tuesday Schedule (All times NY)

```
01:50 AM — START AUTO SCHEDULER (launch TV + node tools/auto_scheduler.cjs --execute)
02:00 AM — London KZ opens — turn on scanning
03:00 AM — London Silver Bullet window
07:00 AM — Lecture 2: London Hunt + IFVG
08:00 AM — Lecture 1: Pre-08:30 formation
08:30 AM — Lecture 4: NDOG/NWOG gap model
09:30 AM — AMOR: AM Session Opening Range
09:50 AM — ⭐⭐ NY-AM Macro (highest conviction)
10:00 AM — Silver Bullet: scalp window
10:30 AM — London Close: counter-trend retracement
1:30 PM  — PMOR: PM Session Opening Range
3:50 PM  — Pre-close check
4:00 PM  — NY Close
```

## What the Scheduler Will Do

1. **Every 10 minutes**: Scan all 4 pairs, check for tradeable setups
2. **Every scan**: Check open positions for pyramid levels
3. **At every scheduled event**: Full data refresh + briefing
4. **On trade execution**: Auto-journal to decision_journal.md
5. **On pyramid add**: Auto-journal + persist state

## NAS100 Position — Tuesday Management

```
If price continues up:
  → Pyramid adds already triggered (all 3 levels crossed Monday)
  → New pyramid target: CE of the expansion leg
  → Move SL to breakeven immediately on restart

If price consolidates:
  → Hold position, wait for Wednesday low (weekly profile target)
  → SL at 28,169 gives 660pt buffer

If price reverses hard:
  → SL at 28,169 — accept loss of ~$473
  → Re-enter on Wednesday low per weekly profile

TP at 28,990 — if hit, close and journal
```

## What to Watch Tuesday

1. **Turnaround Tuesday**: If Monday's range was tight, Tuesday expands. If Monday trended, Tuesday may reverse.
2. **SMR**: Watch for Smart Money Reversal to fire — this confirms the directional program
3. **Weekly Profile narrowing**: By Tuesday close, the profile should narrow to 1-2 candidates
4. **Inducement sweeps**: On all pairs, the gate is currently closed. Tuesday's moves may open gates
5. **NAS100 pyramid**: All 3 levels crossed — the scheduler will add automatically on restart

## Commands for Tuesday Morning

```bash
# 1. Launch TV (if not running)
Start-Process "shell:AppsFolder\TradingView.Desktop_n534cwy3pjxzj!TradingView.Desktop" -ArgumentList "--remote-debugging-port=9222"

# 2. Start full auto mode
cd C:\Users\cash\smc-icm-trading
node tools/auto_scheduler.cjs --execute

# 3. Check status anytime
node tools/position_monitor.cjs          # Live P&L + pyramid levels
node tools/trade_ready.cjs               # Is anything tradeable?
node tools/morning_briefing.cjs          # Full cross-pair picture

# 4. End of day
node tools/ict_continuous_learn.cjs --run  # Extract lessons
node tools/trade_graph.cjs --rebuild       # Update memory graph
```

## Monday's Fixes Now Active

| Fix | Effect |
|-----|--------|
| Pyramid auto-add | Scheduler adds at IOFED levels without manual intervention |
| Live position monitor | Real CDP prices, not stale engine files |
| Watchdog + heartbeat | Know immediately if scheduler dies |
| Auto-journal | Every trade and pyramid add logged |
| Position persistence | Survives scheduler restarts via pyramid_state.json |
| Contract sizing | Indices use 1 contract, forex uses 5000 units |
