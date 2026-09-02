# Session Journal — July 29, 2026 (Afternoon)

## TL;DR

Spent 3+ hours debugging why TV paper trading orders weren't filling. Root cause: intel_monitor.cjs constantly switching charts + SL/TP fields swapped in order form. Fixed 7 bugs. Built 10+ CDP automation scripts. Ended with 4 live positions, +$343 P&L.

## Active Positions at Session End

| Pair | Dir | Entry | SL | TP | Qty | P&L |
|------|-----|-------|-----|------|-----|-----|
| NAS100 | SHORT | 27,583 | 27,720 | 27,100 | 1 | +$80 |
| XAUUSD | LONG | 4,038.18 | 4,018 | 4,045 | 100 | +$264 |
| GBPUSD | SHORT | 1.32992 | 1.33050 | 1.32750 | 5,000 | -$1 |
| EURUSD | SHORT | 1.13930 | 1.13950 | 1.13750 | 10,000 | +$0 |

## Bugs Found & Fixed

1. **Monitors fight for chart** — intel_monitor.cjs switches pairs constantly, closing tickets mid-fill
2. **SL/TP fields swapped** — TP at y=399, SL at y=483; were filling backwards
3. **setSymbol vs keyboard** — keyboard only switches chart; setSymbol() API syncs both chart + panel
4. **Stale SL levels** — SL calculated 20 min ago invalid when market moves
5. **Panel collapses** — bottom panel height < 100px prevents ticket from opening
6. **Pending orders block** — old failed orders prevent new positions on same pair
7. **Drawings pollute** — GBPUSD lines at 1.32xxx on NAS100 chart at 27,000+ make candles invisible

## Scripts Created

All in `tools/tv-mcp/`:
- `market_order.cjs` — Main placement script (setSymbol + fill + place, CLI args)
- `execute.cjs` — Full end-to-end with keyboard switch + label mapping
- `quick_trade.cjs` — Fast one-shot without symbol switch
- `check_orders.cjs` — Verify positions + orders tables
- `clean_slate.cjs` — Clear drawings + cancel all orders
- `scan_ticket.cjs` — Deep scan order form structure
- `find_selector.cjs` — Find panel symbol selector
- `diagnose.cjs` — Symbol resolution + orders dump
- `modify_sl.cjs` — Calculate structural SL from swing levels
- `scan_all_pairs.cjs` — Live scan all 5 pairs for setups
- `switch_panel.cjs` — Switch panel symbol via dropdown
- `place_all.cjs` — Batch place all pairs
- `place_order.cjs` — Limit order with SL/TP
- `debug_order.cjs` — Step-by-step with screenshots
- `sync_trade.cjs` — Keyboard sync approach
- `click_test.cjs` — Test different click methods
- `click_place.cjs` — Just click Place button
- `eurusd_scan.cjs` — Quick pair data fetch
- `verify_xau.cjs` — Verify positions without switching

## Session Timeline

- 12:13 NY — Session check: NY Lunch, not tradeable
- 12:18 NY — First GBPUSD scalp attempt (tight 3-pip SL)
- 12:20 NY — GBPUSD tight SL hit at 1.32876 (-$6.30)
- 12:25-13:30 NY — Debugging: discovered monitors interfering, SL/TP field swap, panel symbol independence
- 13:30 NY — Killed all monitors (taskkill /F /IM node.exe)
- 13:35 NY — NAS100 SELL placed successfully (first working order)
- 13:37 NY — XAUUSD BUY placed (manual panel switch)
- 13:40 NY — Fixed field mapping in market_order.cjs
- 13:42 NY — EURUSD SELL placed
- 13:45 NY — GBPUSD SELL placed (needed different quantity to bypass pending order block)
- 13:49 NY — All 4 positions confirmed live, +$343 P&L

## Key Takeaways

1. **Always kill monitors before trading.** The intel_monitor and discord_bot auto-restart and will fight for chart control.
2. **Use setSymbol() API, not keyboard.** Keyboard symbol search only switches the chart, not the trading panel.
3. **TP field is FIRST (y=399), SL field is SECOND (y=483).** Don't swap them.
4. **Validate SL against LIVE price before placing.** Market moves during debugging sessions.
5. **One script, one flow.** Multiple diagnostic scripts dirty the state. Use `market_order.cjs` end-to-end.
6. **Paper trading panel has its own symbol.** It doesn't auto-follow the chart.

## Graph State

- 10 trades indexed
- 15 lessons extracted
- 93 edges in trade graph
- 2 unresolved knowledge gaps
- Performance: 80% win rate (5 trades)

## Post-Fed Update (18:08 UTC)

See `TRADE_OUTCOMES.md` for full analysis. Summary:
- **XAUUSD LONG TP hit @ 4,067.60: +$2,554** 🎯
- EURUSD/GBPUSD stopped out by Fed dollar spike: -$23
- NAS100 LONG still running: +$156
- **Net realized: +$2,610.80 (Profit factor 113:1)**
- Key lesson: Block entries ±10min around high-impact news
