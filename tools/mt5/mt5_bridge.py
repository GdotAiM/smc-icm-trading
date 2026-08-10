#!/usr/bin/env python3
"""MetaTrader 5 bridge service for the SMC/ICT trading workspace.

Persistent Python service that bridges the Node pipeline to a running MT5
terminal via the official ``MetaTrader5`` package. Speaks newline-delimited
JSON over stdio (stdin = requests, stdout = responses, stderr = logs).

Request:  {"id": <int|str>, "cmd": "market_order", "args": {...}}
Response: {"id": <int|str>, "ok": true,  "result": {...}}
          {"id": <int|str>, "ok": false, "error": "..."}

Commands
--------
ping                 -> terminal health
account_info         -> account snapshot (masked login)
symbol_info          -> {symbol} spec after symbol_select()
tick                 -> {symbol} bid/ask/last
market_order         -> place market order (buy/sell, volume, sl, tp, deviation,
                        request_id for idempotency; comment = SMC.<SYMBOL>.<request_id>)
modify_sl_tp         -> {position, sl?, tp?}
partial_close        -> {position, volume, deviation?}
close_position       -> {position, deviation?}
close_all            -> {symbol?} close all bridge-managed positions
positions            -> open bridge-managed positions with pnl
history              -> today's realized + open P&L (3% daily cap input)
shutdown             -> exit the loop

Safety (enforced before any market_order)
------------------------------------------
- Hard kill switch: `_config/mt5.kill` present -> refuses all orders
- 3% daily loss cap: realized + open P&L below -3% of balance -> refuses
- Max 2 concurrent positions; max 1 per symbol; no correlated double exposure
  (EURUSD<->GBPUSD group) at the broker edge
- magic per pair so the bridge only manages its own trades
"""

import json
import os
import sys
import time
import zlib
from datetime import datetime, time as dtime
from typing import Any, Optional

# Make stdout line-buffered and UTF-8 safe regardless of console codepage
sys.stdout.reconfigure(encoding="utf-8", newline="\n", line_buffering=True)
sys.stderr.reconfigure(encoding="utf-8")

import MetaTrader5 as mt5

WORKSPACE_ROOT = os.environ.get(
    "WORKSPACE_ROOT",
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
)

MAGIC_BASE = 51231000
DAILY_LOSS_CAP = 0.03  # 3% of balance
MAX_POSITIONS = 2
# Correlated pairs that must not both be open at the broker edge
CORRELATION_GROUPS = {
    "EURUSD": {"EURUSD", "GBPUSD"},
    "GBPUSD": {"EURUSD", "GBPUSD"},
}
KNOWN_SYMBOLS = ["GBPUSD", "EURUSD", "XAUUSD", "USTEC", "US100", "NAS100"]
DEFAULT_DEVIATION = 20

ERROR_LOG_PATH = os.path.join(WORKSPACE_ROOT, "shared")


def _now_day_start() -> datetime:
    return datetime.combine(datetime.now().date(), dtime.min)


def _magic_for(symbol: str) -> int:
    if symbol in KNOWN_SYMBOLS:
        return MAGIC_BASE + KNOWN_SYMBOLS.index(symbol) + 1
    return MAGIC_BASE + (zlib.crc32(symbol.encode("utf-8")) % 1000)


def _log_error(line: dict) -> None:
    try:
        today_dir = os.path.join(ERROR_LOG_PATH, datetime.now().strftime("%Y-%m-%d"))
        os.makedirs(today_dir, exist_ok=True)
        with open(os.path.join(today_dir, "error_log.jsonl"), "a", encoding="utf-8") as f:
            f.write(json.dumps({"source": "mt5_bridge", "ts": datetime.now().isoformat(), **line}) + "\n")
    except Exception:
        pass
    print(json.dumps(line), file=sys.stderr)


def _mask_login(login: int) -> str:
    s = str(login)
    if len(s) <= 2:
        return "**"
    return s[:2] + "*" * max(1, len(s) - 4) + s[-2:]


class Bridge:
    def __init__(self) -> None:
        self.last_error: tuple = (0, "")

    # -- terminal lifecycle -------------------------------------------------
    def ensure_ready(self) -> Optional[str]:
        """Return None if connected+initialized, else an error description."""
        if not mt5.initialize():
            self.last_error = mt5.last_error()
            return f"initialize failed: {self.last_error}"
        info = mt5.terminal_info()
        if info is None:
            return f"terminal_info failed: {mt5.last_error()}"
        return None

    def _refresh(self, symbol: str) -> Optional[str]:
        if not mt5.symbol_select(symbol, True):
            return f"symbol_select({symbol}) failed: {mt5.last_error()}"
        if not mt5.symbol_info_tick(symbol):
            return f"no tick for {symbol}"
        return None

    # -- safety gates -------------------------------------------------------
    def _kill_switch(self) -> Optional[str]:
        flag = os.path.join(WORKSPACE_ROOT, "_config", "mt5.kill")
        if os.path.exists(flag):
            return "KILL SWITCH active: remove _config/mt5.kill to re-enable orders"
        return None

    def _daily_cap(self) -> Optional[str]:
        balance = float(mt5.account_info().balance)
        realized = 0.0
        deals = mt5.history_deals_get(_now_day_start(), datetime.now()) or []
        for d in deals:
            if d.comment and d.comment.startswith("SMC."):
                realized += float(d.profit)
        open_pnl = sum(float(p.profit) for p in (mt5.positions_get() or []))
        total = realized + open_pnl
        if total <= -DAILY_LOSS_CAP * balance:
            return (
                f"daily loss cap hit: realized+open {total:+.2f} {mt5.account_info().currency} "
                f"(cap {DAILY_LOSS_CAP * balance:.2f})"
            )
        return None

    def _position_gate(self, symbol: str) -> Optional[str]:
        positions = mt5.positions_get() or []
        mine = [p for p in positions if _magic_for(p.symbol) == p.magic or p.magic >= MAGIC_BASE]
        if len(mine) >= MAX_POSITIONS:
            return f"max {MAX_POSITIONS} concurrent positions already open"
        group = CORRELATION_GROUPS.get(symbol, {symbol})
        for p in mine:
            if p.symbol in group:
                return f"correlated exposure: {symbol} vs open {p.symbol}"
        return None

    def _pre_order_checks(self, symbol: str) -> Optional[str]:
        err = self._kill_switch()
        if err:
            return err
        err = self._daily_cap()
        if err:
            return err
        return self._position_gate(symbol)

    # -- commands -----------------------------------------------------------
    def ping(self) -> dict:
        err = self.ensure_ready()
        if err:
            return {"pong": False, "error": err}
        info = mt5.terminal_info()
        return {
            "pong": True,
            "terminal": info.name,
            "connected": info.connected,
            "trade_allowed": info.trade_allowed,
        }

    def account_info(self) -> dict:
        err = self.ensure_ready()
        if err:
            raise RuntimeError(err)
        acc = mt5.account_info()
        if acc is None:
            raise RuntimeError(f"account_info failed: {mt5.last_error()}")
        return {
            "login": _mask_login(acc.login),
            "server": acc.server,
            "name": acc.name,
            "balance": acc.balance,
            "equity": acc.equity,
            "currency": acc.currency,
            "leverage": acc.leverage,
            "profit": acc.profit,
            "margin": acc.margin,
            "trade_allowed": acc.trade_allowed,
        }

    def symbol_info(self, symbol: str) -> dict:
        err = self.ensure_ready()
        if err:
            raise RuntimeError(err)
        if not mt5.symbol_select(symbol, True):
            raise RuntimeError(f"symbol_select({symbol}) failed: {mt5.last_error()}")
        s = mt5.symbol_info(symbol)
        if s is None:
            raise RuntimeError(f"symbol_info({symbol}) failed: {mt5.last_error()}")
        tick = mt5.symbol_info_tick(symbol)
        return {
            "symbol": s.name,
            "visible": s.visible,
            "trade_mode": s.trade_mode,
            "digits": s.digits,
            "point": s.point,
            "spread": s.spread,
            "bid": tick.bid if tick else None,
            "ask": tick.ask if tick else None,
            "volume_min": s.volume_min,
            "volume_max": s.volume_max,
            "volume_step": s.volume_step,
            "tick_value": s.trade_tick_value,
            "tick_size": s.trade_tick_size,
            "contract_size": s.trade_contract_size,
            "margin_currency": s.currency_margin,
            "filling_mode": s.filling_mode,
            "expiration_mode": s.expiration_mode,
        }

    def tick(self, symbol: str) -> dict:
        err = self.ensure_ready()
        if err:
            raise RuntimeError(err)
        err = self._refresh(symbol)
        if err:
            raise RuntimeError(err)
        tick = mt5.symbol_info_tick(symbol)
        return {
            "symbol": symbol,
            "bid": tick.bid,
            "ask": tick.ask,
            "last": tick.last,
            "time": tick.time,
        }

    def _round_vol(self, symbol: str, volume: float) -> float:
        s = mt5.symbol_info(symbol)
        step = float(s.volume_step) if s and s.volume_step else 0.01
        return round(round(volume / step) * step, 6)

    def _filling(self, symbol: str, request: dict) -> dict:
        """Try order_send with a sensible filling mode, retrying on filling errors."""
        for filling in (mt5.ORDER_FILLING_IOC, mt5.ORDER_FILLING_FOK, mt5.ORDER_FILLING_RETURN):
            request["type_filling"] = filling
            res = mt5.order_send(request)
            if res and res.retcode not in (10016, 10030):
                return res
            self.last_error = mt5.last_error()
        return res

    def market_order(self, args: dict) -> dict:
        symbol = str(args["symbol"]).upper()
        side = str(args["side"]).upper()
        volume = float(args["volume"])
        request_id = str(args.get("request_id") or "")
        err = self.ensure_ready()
        if err:
            raise RuntimeError(err)
        err = self._refresh(symbol)
        if err:
            raise RuntimeError(err)
        err = self._pre_order_checks(symbol)
        if err:
            raise RuntimeError(err)

        comment = f"SMC.{symbol}.{request_id}" if request_id else f"SMC.{symbol}"
        if request_id:
            dup = self._find_deal_by_comment(comment)
            if dup:
                return {"duplicate": True, "deal": dup, "comment": comment}

        volume = self._round_vol(symbol, volume)
        tick = mt5.symbol_info_tick(symbol)
        if side in ("BUY", "LONG"):
            order_type = mt5.ORDER_TYPE_BUY
            price = tick.ask
        elif side in ("SELL", "SHORT"):
            order_type = mt5.ORDER_TYPE_SELL
            price = tick.bid
        else:
            raise RuntimeError(f"bad side: {side}")

        request = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": symbol,
            "volume": volume,
            "type": order_type,
            "price": price,
            "sl": float(args["sl"]) if args.get("sl") else 0.0,
            "tp": float(args["tp"]) if args.get("tp") else 0.0,
            "deviation": int(args.get("deviation") or DEFAULT_DEVIATION),
            "magic": _magic_for(symbol),
            "comment": comment,
            "type_time": mt5.ORDER_TIME_GTC,
        }
        res = self._filling(symbol, request)
        if res is None:
            raise RuntimeError(f"order_send returned None: {mt5.last_error()}")
        if res.retcode != mt5.TRADE_RETCODE_DONE:
            raise RuntimeError(f"order rejected retcode={res.retcode} ({res.comment}) {res.request}")
        return {
            "ticket": res.order,
            "deal": res.deal,
            "price": res.price,
            "volume": volume,
            "magic": _magic_for(symbol),
            "comment": comment,
        }

    def _find_deal_by_comment(self, comment: str) -> Optional[dict]:
        deals = mt5.history_deals_get(_now_day_start(), datetime.now()) or []
        for d in deals:
            if d.comment == comment:
                return {"ticket": d.position_id, "deal": d.ticket, "symbol": d.symbol, "price": d.price}
        return None

    def _position(self, ticket: int) -> dict:
        positions = mt5.positions_get(ticket=ticket) or []
        if not positions:
            raise RuntimeError(f"position {ticket} not found")
        p = positions[0]
        return {"ticket": p.ticket, "symbol": p.symbol, "side": "BUY" if p.type == mt5.POSITION_TYPE_BUY else "SELL",
                "volume": p.volume, "price_open": p.price_open, "sl": p.sl, "tp": p.tp,
                "profit": p.profit, "magic": p.magic, "comment": p.comment, "time": p.time}

    def modify_sl_tp(self, args: dict) -> dict:
        err = self.ensure_ready()
        if err:
            raise RuntimeError(err)
        ticket = int(args["position"])
        p = self._position(ticket)
        req = {
            "action": mt5.TRADE_ACTION_SLTP,
            "position": ticket,
            "symbol": p["symbol"],
            "sl": float(args["sl"]) if args.get("sl") else p["sl"],
            "tp": float(args["tp"]) if args.get("tp") else p["tp"],
        }
        res = mt5.order_send(req)
        if res is None or res.retcode != mt5.TRADE_RETCODE_DONE:
            raise RuntimeError(f"modify rejected retcode={res.retcode if res else 'None'} ({res.comment if res else mt5.last_error()})")
        return {"ticket": ticket, "sl": req["sl"], "tp": req["tp"]}

    def _close_deal(self, ticket: int, volume: float, deviation: int) -> dict:
        p = self._position(ticket)
        close_type = mt5.ORDER_TYPE_SELL if p["side"] == "BUY" else mt5.ORDER_TYPE_BUY
        tick = mt5.symbol_info_tick(p["symbol"])
        price = tick.bid if close_type == mt5.ORDER_TYPE_SELL else tick.ask
        volume = self._round_vol(p["symbol"], volume)
        req = {
            "action": mt5.TRADE_ACTION_DEAL,
            "symbol": p["symbol"],
            "volume": volume,
            "type": close_type,
            "position": ticket,
            "price": price,
            "deviation": deviation,
            "magic": p["magic"],
            "comment": f"SMC.CLOSE.{ticket}",
            "type_time": mt5.ORDER_TIME_GTC,
        }
        res = self._filling(p["symbol"], req)
        if res is None or res.retcode not in (mt5.TRADE_RETCODE_DONE, mt5.TRADE_RETCODE_DONE_PARTIAL):
            raise RuntimeError(f"close rejected retcode={res.retcode if res else 'None'} ({res.comment if res else mt5.last_error()})")
        return {"ticket": ticket, "deal": res.deal, "volume_closed": volume, "price": res.price}

    def partial_close(self, args: dict) -> dict:
        err = self.ensure_ready()
        if err:
            raise RuntimeError(err)
        return self._close_deal(int(args["position"]), float(args["volume"]),
                                int(args.get("deviation") or DEFAULT_DEVIATION))

    def close_position(self, args: dict) -> dict:
        err = self.ensure_ready()
        if err:
            raise RuntimeError(err)
        ticket = int(args["position"])
        return self._close_deal(ticket, self._position(ticket)["volume"],
                                int(args.get("deviation") or DEFAULT_DEVIATION))

    def close_all(self, args: dict) -> dict:
        err = self.ensure_ready()
        if err:
            raise RuntimeError(err)
        symbol = str(args.get("symbol") or "").upper()
        closed = []
        for p in mt5.positions_get() or []:
            if p.magic < MAGIC_BASE:
                continue
            if symbol and p.symbol != symbol:
                continue
            closed.append(self._close_deal(p.ticket, p.volume, int(args.get("deviation") or DEFAULT_DEVIATION)))
        return {"closed": closed}

    def positions(self) -> dict:
        err = self.ensure_ready()
        if err:
            raise RuntimeError(err)
        rows = []
        for p in mt5.positions_get() or []:
            if p.magic < MAGIC_BASE:
                continue
            rows.append({"ticket": p.ticket, "symbol": p.symbol,
                         "side": "BUY" if p.type == mt5.POSITION_TYPE_BUY else "SELL",
                         "volume": p.volume, "price_open": p.price_open, "sl": p.sl, "tp": p.tp,
                         "profit": p.profit, "magic": p.magic, "comment": p.comment, "time": p.time})
        return {"count": len(rows), "positions": rows}

    def history(self) -> dict:
        err = self.ensure_ready()
        if err:
            raise RuntimeError(err)
        deals = mt5.history_deals_get(_now_day_start(), datetime.now()) or []
        mine = [d for d in deals if d.comment and d.comment.startswith("SMC.")]
        realized = sum(float(d.profit) for d in mine)
        open_pnl = sum(float(p.profit) for p in (mt5.positions_get() or []))
        return {
            "realized": realized,
            "open": open_pnl,
            "total": realized + open_pnl,
            "deal_count": len(mine),
            "all_deals": len(deals),
        }

    # -- dispatch -----------------------------------------------------------
    def handle(self, cmd: str, args: dict) -> Any:
        args = args or {}
        if cmd == "ping":
            return self.ping()
        if cmd == "account_info":
            return self.account_info()
        if cmd == "symbol_info":
            return self.symbol_info(str(args["symbol"]).upper())
        if cmd == "tick":
            return self.tick(str(args["symbol"]).upper())
        if cmd == "market_order":
            return self.market_order(args)
        if cmd == "modify_sl_tp":
            return self.modify_sl_tp(args)
        if cmd == "partial_close":
            return self.partial_close(args)
        if cmd == "close_position":
            return self.close_position(args)
        if cmd == "close_all":
            return self.close_all(args)
        if cmd == "positions":
            return self.positions()
        if cmd == "history":
            return self.history()
        if cmd == "shutdown":
            return {"bye": True}
        raise RuntimeError(f"unknown command: {cmd}")


def main() -> int:
    bridge = Bridge()
    print(json.dumps({"type": "hello", "pid": os.getpid(), "workspace": WORKSPACE_ROOT}), file=sys.stderr)
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            rid = req.get("id")
            cmd = req.get("cmd", "")
            args = req.get("args") or {}
            if cmd == "shutdown":
                print(json.dumps({"id": rid, "ok": True, "result": {"bye": True}}))
                break
            result = bridge.handle(cmd, args)
            print(json.dumps({"id": rid, "ok": True, "result": result}, ensure_ascii=False))
        except Exception as exc:  # noqa: BLE001 — every request must get an answer
            rid = None
            try:
                rid = json.loads(line).get("id") if line else None
            except Exception:
                pass
            err = str(exc)
            print(json.dumps({"id": rid, "ok": False, "error": err}, ensure_ascii=False))
            _log_error({"cmd": cmd if 'cmd' in locals() else "?", "error": err})
        sys.stdout.flush()
    mt5.shutdown()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
