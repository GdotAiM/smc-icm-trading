#!/usr/bin/env python3
"""Statistical candlestick path forecast — no ML dependencies.
Uses linear regression on log prices + ATR-based volatility bands.
Transparent, fast, understandable.

Usage:
  python tools/forecast.py --input candles.json --pred-len 24 --output forecast.json
  python tools/forecast.py --input candles.json --pred-len 48 --samples 10
"""

import argparse
import json
import math
import sys
from datetime import datetime


def linear_regression(x, y):
    """Simple OLS: y = slope * x + intercept"""
    n = len(x)
    if n < 2:
        return 0, y[0] if n > 0 else 0
    sx = sum(x)
    sy = sum(y)
    sxy = sum(xi * yi for xi, yi in zip(x, y))
    sxx = sum(xi * xi for xi in x)
    slope = (n * sxy - sx * sy) / (n * sxx - sx * sx) if (n * sxx - sx * sx) != 0 else 0
    intercept = (sy - slope * sx) / n
    return slope, intercept


def atr(candles, period=14):
    """Average True Range"""
    if len(candles) < 2:
        return 0
    trs = []
    for i in range(1, len(candles)):
        c = candles[i]
        p = candles[i - 1]
        tr = max(
            c["high"] - c["low"],
            abs(c["high"] - p["close"]),
            abs(c["low"] - p["close"])
        )
        trs.append(tr)
    return sum(trs[-period:]) / min(period, len(trs)) if trs else 0


def forecast(candles, pred_len=24, lookback=100, samples=5):
    """Generate probabilistic candle path forecast."""
    if len(candles) < lookback:
        lookback = len(candles)

    recent = candles[-lookback:]

    # Use log prices for better scaling
    closes = [math.log(c["close"]) for c in recent]
    xs = list(range(len(closes)))

    # Fit regression to log closes
    slope, intercept = linear_regression(xs, closes)

    # ATR for volatility
    vol = atr(candles)
    last_close = recent[-1]["close"]

    # Calculate average bar interval (ms)
    if len(recent) >= 2:
        bar_interval = (recent[-1]["time"] - recent[0]["time"]) / len(recent)
    else:
        bar_interval = 3600000  # default 1h

    last_time = recent[-1]["time"]

    # Generate median path
    median_path = []
    for i in range(1, pred_len + 1):
        log_price = intercept + slope * (len(closes) + i)
        median_path.append(round(math.exp(log_price), 5))

    # Generate sample paths with noise
    paths = []
    import random
    random.seed(42)

    for s in range(samples):
        path = []
        current = math.log(last_close)
        for i in range(pred_len):
            # Random walk with drift
            drift = slope
            noise = random.gauss(0, vol / last_close)  # volatility-scaled noise
            current += drift + noise
            path.append(round(math.exp(current), 5))
        paths.append(path)

    # Confidence bands from sample paths
    upper_band = []
    lower_band = []
    for i in range(pred_len):
        vals = sorted([p[i] for p in paths])
        lower_band.append(vals[max(0, int(len(vals) * 0.1))])
        upper_band.append(vals[min(len(vals) - 1, int(len(vals) * 0.9))])

    # Direction assessment
    first_median = median_path[0]
    last_median = median_path[-1]
    direction = "bullish" if last_median > last_close else "bearish"
    strength = abs(last_median - last_close) / last_close / math.sqrt(pred_len)

    # Generate future timestamps
    future_times = [last_time + int(bar_interval * i) for i in range(1, pred_len + 1)]

    return {
        "model": "Statistical (Log-Linear + ATR Bands)",
        "pred_len": pred_len,
        "direction": direction,
        "strength": round(strength, 6),
        "volatility_atr": round(vol, 5),
        "current_price": last_close,
        "median_path": median_path,
        "upper_90": upper_band,
        "lower_10": lower_band,
        "sample_paths": paths,
        "future_times": future_times,
    }


def main():
    parser = argparse.ArgumentParser(description="Statistical candle forecast")
    parser.add_argument("--input", required=True, help="JSON file with OHLCV candles")
    parser.add_argument("--pred-len", type=int, default=24, help="Candles to forecast")
    parser.add_argument("--lookback", type=int, default=100, help="Candles for regression fit")
    parser.add_argument("--samples", type=int, default=10, help="Monte Carlo sample paths")
    parser.add_argument("--output", help="Output JSON file (default: stdout)")
    args = parser.parse_args()

    with open(args.input) as f:
        candles = json.load(f)

    if not isinstance(candles, list) or len(candles) == 0:
        print("Error: input must be a non-empty array of candles", file=sys.stderr)
        sys.exit(1)

    result = forecast(candles, args.pred_len, args.lookback, args.samples)

    output = json.dumps(result, indent=2)
    if args.output:
        with open(args.output, "w") as f:
            f.write(output)
        print(f"Forecast: {result['direction']} ({result['pred_len']} bars) → {args.output}", file=sys.stderr)
    else:
        print(output)


if __name__ == "__main__":
    main()
