#!/usr/bin/env python3
"""Chronos-2 time-series forecasting wrapper.
Uses Amazon's Chronos-2 model for probabilistic forecasting.
Requires: pip install chronos

Usage:
  python tools/chronos_forecast.py --input candles.json --pred-len 48
  python tools/chronos_forecast.py --input candles.json --pred-len 48 --output forecast.json
"""

import argparse
import json
import sys

try:
    import pandas as pd
except ImportError:
    print("Error: pandas required. Run: pip install pandas", file=sys.stderr)
    sys.exit(1)


def forecast(ohlcv_df: "pd.DataFrame", pred_len: int = 48) -> dict:
    """Run Chronos-2 forecast. Returns dict with quantile predictions."""
    try:
        from chronos import Chronos2Pipeline

        pipeline = Chronos2Pipeline.from_pretrained(
            "amazon/chronos-2", device_map="cpu"
        )

        context = ohlcv_df[["close"]].reset_index()
        context.columns = ["timestamp", "target"]

        pred = pipeline.predict_df(
            context,
            prediction_length=pred_len,
            quantile_levels=[0.1, 0.5, 0.9],
        )

        return {
            "model": "Chronos-2",
            "pred_len": pred_len,
            "median_path": pred["0.5"].tolist() if "0.5" in pred.columns else None,
            "lower_10": pred["0.1"].tolist() if "0.1" in pred.columns else None,
            "upper_90": pred["0.9"].tolist() if "0.9" in pred.columns else None,
            "full": pred.to_dict(orient="records"),
        }
    except ImportError:
        print(
            "Chronos not installed. Run: pip install chronos",
            file=sys.stderr,
        )
        return {"error": "Chronos not installed", "model": "Chronos-2"}
    except Exception as e:
        return {"error": str(e), "model": "Chronos-2"}


def main():
    parser = argparse.ArgumentParser(description="Chronos-2 time-series forecast")
    parser.add_argument("--input", required=True, help="JSON file with OHLCV candles")
    parser.add_argument("--pred-len", type=int, default=48, help="Periods to forecast")
    parser.add_argument("--output", help="Output JSON file (default: stdout)")
    args = parser.parse_args()

    with open(args.input) as f:
        candles = json.load(f)

    df = pd.DataFrame(candles)
    if "time" in df.columns:
        df["time"] = pd.to_datetime(df["time"], unit="ms")
        df = df.set_index("time")

    result = forecast(df, args.pred_len)

    output = json.dumps(result, indent=2, default=str)
    if args.output:
        with open(args.output, "w") as f:
            f.write(output)
        print(f"Forecast saved to {args.output}", file=sys.stderr)
    else:
        print(output)


if __name__ == "__main__":
    main()
