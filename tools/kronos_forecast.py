#!/usr/bin/env python3
"""Kronos candlestick forecasting wrapper.
Uses the Kronos foundation model (Tsinghua) to generate probabilistic
candlestick path forecasts. Requires: pip install kronos

Usage:
  python tools/kronos_forecast.py --input candles.json --pred-len 48
  python tools/kronos_forecast.py --input candles.json --pred-len 48 --samples 10 --output forecast.json
"""

import argparse
import json
import sys

try:
    import pandas as pd
except ImportError:
    print("Error: pandas required. Run: pip install pandas", file=sys.stderr)
    sys.exit(1)


def forecast(ohlcv_df: "pd.DataFrame", pred_len: int = 48, samples: int = 5,
             temperature: float = 0.75, device: str = "cpu") -> dict:
    """Run Kronos forecast. Returns dict with sample paths."""
    try:
        from model import Kronos, KronosTokenizer, KronosPredictor

        tokenizer = KronosTokenizer.from_pretrained("NeoQuasar/Kronos-Tokenizer-base")
        model = Kronos.from_pretrained("NeoQuasar/Kronos-base")
        predictor = KronosPredictor(model, tokenizer, max_context=512, device=device)

        # Generate future timestamps
        freq = pd.infer_freq(ohlcv_df.index) or "1H"
        last_time = ohlcv_df.index[-1]
        future_times = pd.date_range(
            start=last_time + pd.tseries.frequencies.to_offset(freq),
            periods=pred_len,
            freq=freq,
        )

        pred = predictor.predict(
            df=ohlcv_df[["open", "high", "low", "close"]],
            x_timestamp=ohlcv_df.index,
            y_timestamp=future_times,
            pred_len=pred_len,
            T=temperature,
            top_p=0.9,
            sample_count=samples,
        )

        return {
            "model": "Kronos-base",
            "pred_len": pred_len,
            "samples": samples,
            "temperature": temperature,
            "median_path": pred["close"].median() if "close" in pred.columns else None,
            "paths": pred.to_dict(orient="records"),
        }
    except ImportError:
        print(
            "Kronos not installed. Clone from github.com/NeoQuasar/Kronos and install.",
            file=sys.stderr,
        )
        return {"error": "Kronos not installed", "model": "Kronos-base"}
    except Exception as e:
        return {"error": str(e), "model": "Kronos-base"}


def main():
    parser = argparse.ArgumentParser(description="Kronos candlestick forecast")
    parser.add_argument("--input", required=True, help="JSON file with OHLCV candles")
    parser.add_argument("--pred-len", type=int, default=48, help="Candles to forecast")
    parser.add_argument("--samples", type=int, default=5, help="Number of sample paths")
    parser.add_argument("--temperature", type=float, default=0.75, help="Sampling temperature (lower = more deterministic)")
    parser.add_argument("--device", default="cpu", help="Device: cuda or cpu")
    parser.add_argument("--output", help="Output JSON file (default: stdout)")
    args = parser.parse_args()

    with open(args.input) as f:
        candles = json.load(f)

    df = pd.DataFrame(candles)
    if "time" in df.columns:
        df["time"] = pd.to_datetime(df["time"], unit="ms")
        df = df.set_index("time")

    result = forecast(df, args.pred_len, args.samples, args.temperature, args.device)

    output = json.dumps(result, indent=2, default=str)
    if args.output:
        with open(args.output, "w") as f:
            f.write(output)
        print(f"Forecast saved to {args.output}", file=sys.stderr)
    else:
        print(output)


if __name__ == "__main__":
    main()
