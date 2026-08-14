# MT5 Execution Integration Plan

**Status**: Approved (shadow mode) | **Owner**: smc-icm-trading | **Date**: 2026-08-10

Add MetaTrader 5 as a live-execution path alongside TradingView paper trading
(which remains the **shadow** reference). All existing gates and risk rules stay
intact — MT5 is a new *executor*, not a new *decision maker*.

---

## 1. Goal & scope

Let the existing decision pipeline place orders through MetaTrader 5 **in
parallel with** TradingView paper trading (shadow mode):

- TV paper trading keeps running as the shadow/verification record.
- MT5 is the production executor (demo → live).
- Execution-only for now. MT5 as a candle-data fallback is Phase 6 (optional).

## 2. Integration approach (recommended)

MT5 has no public REST API. Three options:

| Option | Description | Verdict |
|---|---|---|
| **A. Python `MetaTrader5` package + bridge service** (chosen) | Official package (`pip install MetaTrader5`), Windows-only, talks to a running MT5 terminal via IPC. A persistent Python service bridges Node ↔ MT5. | Lowest risk, no MT5-side code, system already uses Python (forecast, data_fetcher) |
| B. MQL5 EA + socket | Custom EA listens for orders over TCP/named pipes | More control but requires MQL5 dev + keeps a terminal running |
| C. Third-party REST (BrokerAPI.io etc.) | SaaS bridging MT5/MT4 to REST | Fast but adds a middleman, cost, and outside dependency |

**Chosen: Option A.**

## 3. Target architecture

```
run_pair.cjs ──> decision.json
                      │
              auto_decision.gate()   ← single entry gate (UNCHANGED)
                      │ allowed
              mt5_executor.cjs (Node)   ──  NEW  (runs ALONGSIDE market_order.cjs / TV shadow)
                      │ JSON-RPC over stdio or localhost:HTTP
              mt5_bridge.py (persistent) ── NEW  (auto-restarted like session_monitor)
                      │ MetaTrader5 IPC
              MT5 Terminal (demo → live)

              TradingView paper (CDP)  ──  stays running as SHADOW
```

All management (BE after TP1, partial close at TP1, close-by-21:00, Friday
close, news freeze, daily-loss cap) rides on the existing monitor layer, with
`positions_json.cjs` now fed from MT5 positions (TV shadow stays separate).

## 4. Components

### A. Python bridge (`tools/mt5/mt5_bridge.py`)
- `mt5.initialize()`, reconnect/health loop, single process
- Commands (JSON request/response, `magic`-tagged):
  - `ping`, `account_info`, `symbol_info`, `tick`
  - `market_order` (buy/sell, volume, sl, tp, deviation, magic, comment)
  - `modify_sl_tp` (position ticket), `partial_close`, `close_position`, `close_all`
  - `positions` (open positions with pnl), `history` (today's realized pnl for the 3% daily cap)
- Every response `{ok, result | error}`; idempotency via `request_id` + comment (retry never double-places)
- Writes state atomically; errors to `error_log.jsonl`; background process, same restart pattern as `session_monitor.cjs`

### B. Node executor (`tools/mt5/mt5_executor.cjs`) + adapter
- Implements the existing `BrokerAdapter` surface (`executeOrder`/`getBalance`/`getOpenOrders`/`closeOrder`/`getOrderStatus`) in CJS so `ExecutionManager` or the auto-traders can drive it interchangeably with `market_order.cjs`
- `mode: "REVIEW"` = log intent only; `"LIVE"` = place for real
- Reuses `auto_decision.gate()` output including the missed-entry second-chance `operative` levels and `sizeMultiplier` (auto_decision.cjs:53-72)

### C. Symbol mapping (`_config/mt5_symbols.json`)
| Pipeline | MT5 (broker-dependent) | Notes |
|---|---|---|
| GBPUSD | `GBPUSD` | 1 lot = 100k units, ~$10/pip |
| EURUSD | `EURUSD` | |
| XAUUSD | `XAUUSD` | 1 lot = 100 oz, $1 move = $100; **must `symbol_select()` — not visible until added to Market Watch** |
| NAS100 | **`USTEC`** on MetaQuotes-Demo | contract 1.0, tick 0.01, 2 digits; `US100`/`NAS100` do NOT exist on this server |
| DXY | n/a | context-only — never traded; skip |

> **P0 verified (2026-08-10)**: `MetaQuotes-Demo` account (masked 50***97), $100k USD, 1:100.
> `vol_min`/`vol_step` return null until `symbol_select()` — lot-size calc must select the symbol first.

### D. Lot-size calculator (`tools/mt5/lot_size.cjs`)
Derives volume from `_config/trading_rules.md`: risk$ = min(1% balance, remaining
daily budget) → `volume = risk$ / (stopDistancePips × pipValuePerLot)`.
`pipValuePerLot` from `symbol_info` (`trade_tick_value`/`trade_tick_size`/
`trade_contract_size`), rounded down to `trade_volume_step`, clamped to
`trade_min/max_volume`.

### E. Safety layer (enforced in the bridge before any order)
- **Hard kill switch**: file flag (e.g. `_config/mt5.kill`) — bridge refuses all orders when present
- **3% daily loss cap**: realized + open P&L from `history`+`positions`; hard-stops placing
- **Max 2 concurrent positions**, **no correlated double exposure** (existing rules, enforced at the broker edge)
- **REVIEW → MT5 demo → small live** gate, mirroring the existing `mode` toggle
- MT5 `magic` per pair so the bridge only manages its own trades
- Credentials via env vars (never committed)

## 5. Phased rollout

| Phase | Deliverable | Acceptance |
|---|---|---|
| **P0** | MT5 terminal + demo account installed; `pip install MetaTrader5`; `initialize()` + `account_info()` verified | ✅ **DONE** — terminal up, pkg 5.0.6090, MetaQuotes-Demo connected, symbols mapped (`USTEC` = NAS100) |
| **P1** | Python bridge service with all commands, auto-restart, atomic state, error logging | ✅ **DONE** — `mt5_bridge.py` (495 lines, 12 commands), `bridge_smoke_test.cjs` (122 lines, 8 categories), `run_bridge.cjs` (supervisor + HTTP proxy on :5111, auto-restart, health checks). **Smoke test passed Aug 10** — 26/26 ALL PASS. Fixed: AutoTrading enabled in terminal config, volume_step-compatible partial close, request_id dedup proven, server-time-aware date ranges. |
| **P2** | Node client + adapter + symbol map + lot-size calc | ✅ **DONE (re-verified Aug 11)** — `run_bridge.cjs` rewritten: **HTTP proxy restored** (stdio-only version was a regression; all Node consumers require `:5111`). Verified end-to-end over the live proxy: `mt5_executor.cjs --account/--positions/--gate/--ping` (LIVE mode reads real demo $99,999.71), `lot_size.cjs`, `mt5_positions.cjs --json` ([]), `mt5_monitor.cjs --once` (REVIEW NO_POSITIONS), `mt5_auto_trade.cjs GBPUSD` (REVIEW mode gate-blocks correctly — no valid setup). Graceful `/shutdown` verified. **XAUUSD pip-value flag RESOLVED**: added bridge `order_calc_profit` command (authoritative MT5 profit calc); `lot_size.cjs` now derives pip value from it (`specSource: bridge_calc`) — XAUUSD true pip = $1.00/lot (broker `trade_tick_value` of 0.1 was wrong), USTEC $0.01/lot, GBPUSD $10/lot. Defaults corrected to match. |
| **P3** | Wire behind `auto_decision.gate()`; `positions_json` fed from MT5; REVIEW mode logs would-be orders | ✅ **DONE** — `mt5_auto_trade.cjs` (gate→sizing→execution pipeline, --all mode for all pairs, REVIEW/LIVE switch), `mt5_positions.cjs` (TV-compatible array format + --json/--summary/--watch modes, enriched with live ticks). Full end-to-end tested: all 4 pairs gated correctly, execution logs written to `mt5_execution.json` per pair + unified `mt5_execution_log.jsonl`. |
| **P4** | Enable LIVE on MT5 **demo** for ≥1 trading week; verify BE/partial/close-by-time/daily-cap against TV paper shadow | ✅ **INFRA READY (Aug 11)** — `mt5_monitor.cjs` (BE/partial/close-by-time/daily-cap management, 60s loop, REVIEW/LIVE modes), **`mt5_entry_loop.cjs` (NEW — scheduled gate-driven entry driver, 300s default, kill-switch + daily-cap + max-2-positions preflight, verified REVIEW sweep: 4 pairs gated, 0 executed)**, `p4_startup.cjs` (one-command launcher now starts bridge + entry loop (LIVE) + monitor; status dashboard). Smoke test 28/28 all pass. **Trading week begins when user starts `node tools/mt5/p4_startup.cjs --live`.** |
| **P5** | Go-live on small **live** account + Discord notifications + kill-switch + daily reconciliation | 1-week live parity + monitoring |
| **P6** (optional) | MT5 as candle data fallback; retire CDP dependency | `run_pair.cjs` can run without TV |

## 5b. MT5 Backtest Runner (`tools/mt5/backtest_mt5.cjs`) — Aug 11

Tests the system's SMC/ICT strategies against MT5 historical data. MT5 is the
**data source** (bridge `copy_rates` command); the real SMC engine + decision
modules do the analysis. Three user-selectable modes:

| Mode | What it tests | Output |
|---|---|---|
| `signal` | Engine scan: bias / sweeps / PD arrays per day | Signal dates only, no P&L |
| `core` | + core decision logic: bias alignment, R:R≥1 draw (real `drawTargets`), SL at swing+ATR | Simulated trades with P&L |
| `pipeline` | + killzone gate on the **signal event time** (real `lib/killzone.cjs` + `ny_time.cjs`) | Strictest subset of trades |

```
node tools/mt5/backtest_mt5.cjs --pair GBPUSD --start 2026-05-01 --end 2026-06-30 --mode core [--risk 100]
```

- Writes `shared/backtest/batch/<start>_to_<end>/<PAIR>/` in the **same format
  `backtest_runner.cjs` uses** (journals/, daily_summaries/, engine_reports/,
  trades/, performance_summary.md) so `backtest_distill.cjs` and
  `trade_graph.cjs` consume it unchanged.
- Symbol map: `_config/mt5_symbols.json` (pipeline name → MT5 symbol).
- Correctness notes: no lookahead (SL/ATR/swing computed on the sliced array
  ending at the day boundary); weekend/holiday days skipped (no bar within 48h);
  invalid SL side rejected; `copy_rates` returns engine-compatible `Candle[]`.
- Verified (GBPUSD 2026-05-01→06-30): signal 40 signals; core 9 trades / 44.4%
  win / +0.47R; pipeline 5 trades / 40% win (killzone-gated, as intended).

## 6. Risks & mitigations
- **Terminal must stay logged in** → health-check loop + restart + alert
- **Broker symbol/contract variance** → lot-size verified per broker in P0/P2; NAS100 name confirmed before P4
- **Slippage on news** → existing news-freeze rules remain upstream of the gate
- **Server time ≠ NY** → session logic stays on `ny_time.cjs`; bridge timestamps are server-only
- **Double-order on retry** → idempotent `request_id`/comment dedup
- **Python pkg vs MT5 build compat** → pin version, verify in P0

## 7. Decisions (locked)
1. **Demo first** through P4; small live only at P5.
2. MT5 **alongside** TV paper as shadow — TV stays running, MT5 is the executor.
3. Pairs: GBPUSD / EURUSD / XAUUSD / NAS100 (DXY context-only, never traded).
4. Bridge protocol: **stdio** (zero-port, simplest) unless HTTP is needed for debugging.
   → **Implemented as HTTP proxy** — `run_bridge.cjs` spawns the stdio bridge and exposes `localhost:5111` for interop with Node tools.

## 8. Open questions (need answers before P1/P4)
- Which broker/account for MT5 (fixes symbol names + pip values)?
- MT5 demo or broker demo (e.g., IC Markets / FXCM / OANDA MT5)?

## 9. P1-P2 File Manifest

| File | Phase | Purpose | Status |
|------|-------|---------|--------|
| `tools/mt5/mt5_bridge.py` | P1 | Python stdio JSON-RPC service (13 commands + safety layer; `order_calc_profit` added Aug 11) | ✅ Done |
| `tools/mt5/bridge_smoke_test.cjs` | P1 | Node driver + assertions (ping/account/symbols/market/modify/partial/close/positions/history) | ✅ Done |
| `tools/mt5/run_bridge.cjs` | P1 | Auto-restart supervisor + HTTP proxy on `:5111` | ✅ Done — proxy rewritten Aug 11, all Node consumers verified |
| `tools/mt5/mt5_executor.cjs` | P2 | Node executor with BrokerAdapter surface, REVIEW/LIVE modes, gate-driven execution | ✅ Done |
| `tools/mt5/lot_size.cjs` | P2 | Risk$ → volume calculator (bridge + hardcoded defaults dual-source) | ✅ Done |
| `_config/mt5_symbols.json` | P2 | Symbol mapping (pipeline → MT5), specs, correlation groups | ✅ Done |
| `_config/mt5.kill` | Safety | Hard kill switch — bridge refuses ALL orders when present | Manual (touch to create) |
| `tools/mt5/mt5_auto_trade.cjs` | P3 | Gate→sizing→execution pipeline (--pair/--all, REVIEW/LIVE) | ✅ Done |
| `tools/mt5/mt5_positions.cjs` | P3 | MT5 position feed (TV-compatible array + --json/--summary/--watch) | ✅ Done |
| `tools/mt5/mt5_monitor.cjs` | P4 | Position management monitor — BE/partial/close-by-time/daily-cap, 60s loop | ✅ Done |
| `tools/mt5/mt5_entry_loop.cjs` | P4 | Gate-driven entry loop — polls pipeline gate, opens orders when allowed (kill-switch + daily-cap + max-2-positions preflight) | ✅ Done (Aug 11) |
| `tools/mt5/p4_startup.cjs` | P4 | One-command P4 stack launcher (bridge + entry loop + monitor) + status dashboard | ✅ Done |

### P4 Quick Start

```bash
# One command to start everything:
node tools/mt5/p4_startup.cjs --live

# Or check status first:
node tools/mt5/p4_startup.cjs --status

# Start in REVIEW mode (log only, no real management):
node tools/mt5/p4_startup.cjs
```

### P4 Management Rules (enforced by monitor)

| Rule | Trigger | Action |
|------|---------|--------|
| SL → BE | Price passes TP1 midpoint | Move SL to entry price |
| Partial close | TP1 hit | Close 50% of position |
| NY close | 17:00 NY | Close all positions |
| Friday close | 16:00 NY Friday | Close all positions |
| Daily loss cap | -3% of balance | Close all, refuse new orders |
| Lunch multiplier | 11:00-13:00 NY | ×0.4 session weight (informational) |

### Startup sequence

```bash
# 1. Start MT5 terminal (login to MetaQuotes-Demo)
# 2. Start the bridge supervisor:
node tools/mt5/run_bridge.cjs
# 3. Verify:
node tools/mt5/mt5_executor.cjs --ping
node tools/mt5/mt5_executor.cjs --account
# 4. REVIEW mode test:
set MT5_MODE=REVIEW
node tools/mt5/mt5_executor.cjs --gate GBPUSD
# 5. LIVE mode (after verification):
set MT5_MODE=LIVE
node tools/mt5/mt5_executor.cjs --pair GBPUSD --side BUY --sl 1.2650 --tp 1.2720 --qty 0.01
```

### Commands quick reference

| Tool | Command |
|------|---------|
| Run bridge | `node tools/mt5/run_bridge.cjs` |
| Account snapshot | `node tools/mt5/mt5_executor.cjs --account` |
| Open positions | `node tools/mt5/mt5_executor.cjs --positions` |
| Today P&L | `node tools/mt5/mt5_executor.cjs --history` |
| Bridge health | `node tools/mt5/mt5_executor.cjs --ping` |
| Gate-driven trade | `node tools/mt5/mt5_executor.cjs --gate XAUUSD` |
| Direct trade | `node tools/mt5/mt5_executor.cjs --pair GBPUSD --side BUY --sl 1.2650 --tp 1.2720 --qty 0.01` |
| Lot calc | `node tools/mt5/lot_size.cjs GBPUSD 0.0030` |
| Smoke test | `node tools/mt5/bridge_smoke_test.cjs` |
