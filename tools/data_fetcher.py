#!/usr/bin/env python3
"""OHLCV data fetcher for SMC/ICT trading workspace.
Fetches candlestick data from Binance (crypto) and Yahoo Finance (forex).

Usage:
  python tools/data_fetcher.py --pair EURUSD --tf 1d --lookback 400
  python tools/data_fetcher.py --pair BTCUSDT --tf 4h --output candles.json
"""

import argparse
import json
import ssl
import sys
import time
from datetime import datetime, timedelta
from typing import Optional
from urllib.request import urlopen, Request
from urllib.error import URLError

# Windows SSL workaround — system cert store may not be available
_SSL_CONTEXT = ssl.create_default_context()
_SSL_CONTEXT.check_hostname = False
_SSL_CONTEXT.verify_mode = ssl.CERT_NONE


FOREX_SYMBOLS = {
    "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD",
    "EURGBP", "EURJPY", "GBPJPY", "XAUUSD", "XAGUSD",
}
CRYPTO_SYMBOLS = {
    "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT",
    "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "LINKUSDT",
}

BINANCE_INTERVAL_MAP = {
    "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1h", "4h": "4h",
    "1d": "1d", "1w": "1w",
}
YAHOO_INTERVAL_MAP = {
    "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1h", "4h": "1h",
    "1d": "1d", "1w": "1wk",
}
YAHOO_PERIOD_MAP = {"1m": "7d", "5m": "60d", "15m": "60d", "1h": "730d", "4h": "730d", "1d": "730d", "1w": "1825d"}


def fetch_binance(symbol: str, interval: str, limit: int = 400) -> list[dict]:
    """Fetch OHLCV from Binance public API. No key required."""
    binance_interval = BINANCE_INTERVAL_MAP.get(interval, "1h")
    url = (
        f"https://api.binance.com/api/v3/klines"
        f"?symbol={symbol}&interval={binance_interval}&limit={limit}"
    )
    req = Request(url, headers={"User-Agent": "smc-icm/1.0"})
    with urlopen(req, timeout=15, context=_SSL_CONTEXT) as resp:
        data = json.loads(resp.read())

    candles = []
    for k in data:
        candles.append({
            "time": int(k[0]),
            "open": float(k[1]),
            "high": float(k[2]),
            "low": float(k[3]),
            "close": float(k[4]),
            "volume": float(k[5]),
        })
    return candles


def fetch_yahoo(symbol: str, interval: str, lookback: int = 400) -> list[dict]:
    """Fetch OHLCV from Yahoo Finance public API. No key required."""
    # Symbol mapping: forex pairs get =X suffix; commodities/indices use futures
    _SYMBOL_MAP = {
        "XAUUSD": "GC=F", "XAGUSD": "SI=F",
        "NAS100": "^NDX", "DXY": "DX-Y.NYB",
    }
    y_symbol = _SYMBOL_MAP.get(symbol, f"{symbol}=X")
    y_interval = YAHOO_INTERVAL_MAP.get(interval, "1d")
    y_period = YAHOO_PERIOD_MAP.get(interval, "730d")

    url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/{y_symbol}"
        f"?interval={y_interval}&range={y_period}"
    )
    req = Request(url, headers={"User-Agent": "smc-icm/1.0"})
    with urlopen(req, timeout=15, context=_SSL_CONTEXT) as resp:
        data = json.loads(resp.read())

    result = data["chart"]["result"][0]
    timestamps = result["timestamp"]
    quote = result["indicators"]["quote"][0]
    opens = quote["open"]
    highs = quote["high"]
    lows = quote["low"]
    closes = quote["close"]
    volumes = quote.get("volume", [0] * len(timestamps))

    candles = []
    for i in range(len(timestamps)):
        if opens[i] is not None and closes[i] is not None:
            candles.append({
                "time": int(timestamps[i]) * 1000,  # to milliseconds
                "open": float(opens[i]),
                "high": float(highs[i]) if highs[i] is not None else float(opens[i]),
                "low": float(lows[i]) if lows[i] is not None else float(opens[i]),
                "close": float(closes[i]),
                "volume": float(volumes[i]) if volumes[i] is not None else 0,
            })

    # 4h aggregation: bin 4 consecutive 1h candles
    if interval == "4h":
        candles = aggregate_4h(candles)

    return candles[-lookback:]


def aggregate_4h(candles: list[dict]) -> list[dict]:
    """Aggregate 1h candles into 4h candles."""
    if len(candles) < 4:
        return candles
    result = []
    for i in range(0, len(candles) - 3, 4):
        chunk = candles[i:i + 4]
        result.append({
            "time": chunk[0]["time"],
            "open": chunk[0]["open"],
            "high": max(c["high"] for c in chunk),
            "low": min(c["low"] for c in chunk),
            "close": chunk[-1]["close"],
            "volume": sum(c["volume"] for c in chunk),
        })
    return result


def main():
    parser = argparse.ArgumentParser(description="Fetch OHLCV candle data")
    parser.add_argument("--pair", required=True, help="Trading pair (e.g., EURUSD, BTCUSDT)")
    parser.add_argument("--tf", default="4h", help="Timeframe (1m, 5m, 15m, 1h, 4h, 1d, 1w)")
    parser.add_argument("--lookback", type=int, default=400, help="Number of candles to fetch")
    parser.add_argument("--output", help="Output JSON file path (default: stdout)")
    args = parser.parse_args()

    pair = args.pair.upper()

    try:
        if pair in CRYPTO_SYMBOLS:
            candles = fetch_binance(pair, args.tf, args.lookback)
        else:
            candles = fetch_yahoo(pair, args.tf, args.lookback)
    except Exception as e:
        print(f"Error fetching data: {e}", file=sys.stderr)
        sys.exit(1)

    output = json.dumps(candles, indent=2)
    if args.output:
        with open(args.output, "w") as f:
            f.write(output)
        print(f"Saved {len(candles)} candles to {args.output}", file=sys.stderr)
    else:
        print(output)


if __name__ == "__main__":
    main()
