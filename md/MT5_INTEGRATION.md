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
| **P1** | Python bridge service with all commands, auto-restart, atomic state, error logging | CLI smoke tests pass (place a manual 0.01 demo order, modify, close) |
| **P2** | Node client + adapter + symbol map + lot-size calc | `mt5_executor.cjs` REVIEW mode produces correct intent payloads |
| **P3** | Wire behind `auto_decision.gate()`; `positions_json` fed from MT5; REVIEW mode logs would-be orders | A gated decision is "executed" in logs only, end-to-end |
| **P4** | Enable LIVE on MT5 **demo** for ≥1 trading week; verify BE/partial/close-by-time/daily-cap against TV paper shadow | Demo results ≈ TV paper; no double orders, no missed closes |
| **P5** | Go-live on small **live** account + Discord notifications + kill-switch + daily reconciliation | 1-week live parity + monitoring |
| **P6** (optional) | MT5 as candle data fallback; retire CDP dependency | `run_pair.cjs` can run without TV |

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

## 8. Open questions (need answers before P1/P4)
- Which broker/account for MT5 (fixes symbol names + pip values)?
- MT5 demo or broker demo (e.g., IC Markets / FXCM / OANDA MT5)?
