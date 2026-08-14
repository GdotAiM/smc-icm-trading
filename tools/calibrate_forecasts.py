#!/usr/bin/env python3
"""WP-16: Forecast calibration and ensemble weighting.

Tracks accuracy of each forecast model (Statistical, Kronos, Chronos-2) against
actual price outcomes, computes recency-weighted ensemble weights, and computes
P(reach TP | current price) from the full forecast distributions.

Usage:
  python tools/calibrate_forecasts.py                        → calibrate all
  python tools/calibrate_forecasts.py --pair EURUSD          → single pair
  python tools/calibrate_forecasts.py --stats                → print calibration

Output: shared/training/forecast_calibration.json
"""

import json
import math
import os
import sys
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(os.environ.get("WORKSPACE_ROOT", Path(__file__).resolve().parent.parent))
SHARED = ROOT / "shared"
TRAINING = SHARED / "training"
OUTPUT_PATH = TRAINING / "forecast_calibration.json"

PAIRS = ["EURUSD", "GBPUSD", "XAUUSD", "NAS100"]
PAIR_DIRS = {"XAUUSD": ["XAUUSD", "GOLD"]}


def find_pair_dir(date_dir, pair):
    """Find the correct pair subdirectory."""
    for d in PAIR_DIRS.get(pair, [pair]):
        p = SHARED / date_dir / d
        if p.exists():
            return p
    p = SHARED / date_dir / pair
    return p if p.exists() else None


def load_forecast(pair_dir, tf):
    """Load a forecast file."""
    path = pair_dir / f"forecast_{tf}.json"
    if not path.exists():
        return None
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return None


def load_candles(pair_dir, tf):
    """Load candles for actual outcome comparison."""
    path = pair_dir / f"candles_{tf}.json"
    if not path.exists():
        return None
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return None


def forecast_direction_accuracy(forecast, candles, horizon_bars=24):
    """Check if forecast direction matched actual movement."""
    if not forecast or not candles or len(candles) < 2:
        return None

    current = forecast.get("current_price", 0)
    if current <= 0:
        return None

    # Use the median path's terminal value vs current
    median_path = forecast.get("median_path", [])
    if not median_path:
        return None

    pred_terminal = median_path[min(len(median_path) - 1, horizon_bars - 1)]
    pred_direction = "bullish" if pred_terminal > current else "bearish"

    # Actual: look ahead horizon_bars candles
    actual_idx = min(len(candles) - 1, horizon_bars)
    actual_close = candles[actual_idx].get("close", candles[actual_idx].get("c", current))
    actual_direction = "bullish" if actual_close > current else "bearish"

    correct = pred_direction == actual_direction
    return {
        "pred_direction": pred_direction,
        "actual_direction": actual_direction,
        "correct": correct,
        "pred_move_pct": round((pred_terminal - current) / current * 100, 4),
        "actual_move_pct": round((actual_close - current) / current * 100, 4),
    }


def compute_preach_tp(forecast, entry_price, tp_price, direction):
    """Compute P(reach TP | current price) from forecast distribution.

    Uses sample paths: what fraction reached TP before hitting SL?
    Simplified: what fraction of terminal values exceed TP distance?
    """
    if not forecast or entry_price <= 0 or tp_price <= 0:
        return None

    sample_paths = forecast.get("sample_paths", [])
    if not sample_paths:
        return None

    tp_dist = abs(tp_price - entry_price)
    if tp_dist <= 0:
        return None

    reached = 0
    total = len(sample_paths)
    for path in sample_paths:
        for price in path:
            if direction == "LONG" and price >= tp_price:
                reached += 1
                break
            elif direction == "SHORT" and price <= tp_price:
                reached += 1
                break

    return {
        "p_reach_tp": round(reached / total, 4) if total > 0 else 0.5,
        "samples": total,
        "tp_distance": round(tp_dist, 5),
        "method": "sample_path_traversal",
    }


def calibrate_all():
    """Iterate all historical data and calibrate forecast accuracy."""
    date_dirs = sorted(
        [d for d in os.listdir(SHARED) if (SHARED / d).is_dir() and d[:4].isdigit()],
        reverse=True,
    )

    # Accumulators
    model_accuracy = defaultdict(lambda: {"correct": 0, "total": 0, "recent_correct": 0, "recent_total": 0})
    p_reach_tp_samples = []

    for date_dir in date_dirs:
        for pair in PAIRS:
            pair_dir = find_pair_dir(date_dir, pair)
            if not pair_dir:
                continue

            # Load forecasts
            f5m = load_forecast(pair_dir, "5m")
            f1m = load_forecast(pair_dir, "1m")
            candles_5m = load_candles(pair_dir, "5m")
            candles_1m = load_candles(pair_dir, "1m")

            # Check 5m forecast accuracy
            if f5m and candles_5m:
                # Determine which model produced this forecast
                model_name = f5m.get("model", "Unknown")
                if "Kronos" in model_name:
                    model_key = "kronos"
                elif "Chronos" in model_name:
                    model_key = "chronos"
                else:
                    model_key = "statistical"

                acc = forecast_direction_accuracy(f5m, candles_5m, horizon_bars=24)
                if acc:
                    model_accuracy[model_key]["total"] += 1
                    if acc["correct"]:
                        model_accuracy[model_key]["correct"] += 1

                    # Recent = last 5 trading days
                    date_obj = datetime.strptime(date_dir, "%Y-%m-%d")
                    days_ago = (datetime.now() - date_obj).days
                    if days_ago <= 5:
                        model_accuracy[model_key]["recent_total"] += 1
                        if acc["correct"]:
                            model_accuracy[model_key]["recent_correct"] += 1

            # Compute P(reach TP) for 1m forecast
            if f1m and candles_1m:
                # Load decision to get entry/SL/TP
                decision_path = pair_dir / "decision.json"
                if decision_path.exists():
                    try:
                        with open(decision_path, encoding="utf-8") as f:
                            decision = json.load(f)
                        entry = decision.get("entry", {})
                        if entry.get("price") and entry.get("tp1"):
                            p_tp = compute_preach_tp(
                                f1m, entry["price"], entry["tp1"], entry.get("type", "LONG")
                            )
                            if p_tp:
                                p_reach_tp_samples.append({
                                    "date": date_dir, "pair": pair,
                                    "p_reach_tp": p_tp["p_reach_tp"],
                                    "tp_distance": p_tp["tp_distance"],
                                })
                    except (json.JSONDecodeError, OSError):
                        pass

    # Compute ensemble weights (recency-weighted)
    ensemble = {}
    total_weight = 0
    for model_key in ["statistical", "kronos", "chronos"]:
        stats = model_accuracy[model_key]
        overall_acc = stats["correct"] / stats["total"] if stats["total"] > 0 else 0.5
        recent_acc = stats["recent_correct"] / stats["recent_total"] if stats["recent_total"] > 0 else overall_acc
        # 70% recent + 30% overall
        blended_acc = recent_acc * 0.7 + overall_acc * 0.3 if stats["recent_total"] >= 3 else overall_acc
        ensemble[model_key] = {
            "total_samples": stats["total"],
            "overall_accuracy": round(overall_acc, 4),
            "recent_accuracy": round(recent_acc, 4) if stats["recent_total"] > 0 else None,
            "blended_accuracy": round(blended_acc, 4),
            "ensemble_weight": 0,  # filled below
        }
        if stats["total"] >= 3:
            total_weight += blended_acc

    # Normalize ensemble weights
    if total_weight > 0:
        for model_key in ensemble:
            if ensemble[model_key]["total_samples"] >= 3:
                ensemble[model_key]["ensemble_weight"] = round(
                    ensemble[model_key]["blended_accuracy"] / total_weight, 4
                )

    # Aggregate P(reach TP) stats
    avg_p_reach = 0.5
    if p_reach_tp_samples:
        avg_p_reach = round(
            sum(s["p_reach_tp"] for s in p_reach_tp_samples) / len(p_reach_tp_samples), 4
        )

    calibration = {
        "generated": datetime.now().isoformat(),
        "methodology": "Recency-weighted ensemble: 70% recent(5d) + 30% overall accuracy. "
                       "P(reach TP) from sample path traversal over forecast distribution.",
        "forecast_models": ensemble,
        "p_reach_tp": {
            "average": avg_p_reach,
            "samples": len(p_reach_tp_samples),
            "interpretation": f"On average, {avg_p_reach*100:.1f}% of forecast sample paths reach TP1",
        },
        "recommendation": _make_recommendation(ensemble),
    }

    os.makedirs(OUTPUT_PATH.parent, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(calibration, f, indent=2)

    return calibration


def _make_recommendation(ensemble):
    """Generate ensemble recommendation."""
    weights = {k: v["ensemble_weight"] for k, v in ensemble.items() if v.get("ensemble_weight", 0) > 0}
    if not weights:
        return "Insufficient data — use statistical forecast as default"
    primary = max(weights, key=weights.get)
    return f"Primary: {primary} (weight={weights[primary]:.2f}). Ensemble all available models weighted by recency-adjusted accuracy."


def print_stats():
    """Print current calibration stats."""
    if not OUTPUT_PATH.exists():
        print("No calibration data. Run without --stats first.")
        return
    with open(OUTPUT_PATH) as f:
        cal = json.load(f)
    print(json.dumps(cal, indent=2))


if __name__ == "__main__":
    if "--stats" in sys.argv:
        print_stats()
        sys.exit(0)

    print("=== WP-16: Forecast Calibration ===")
    result = calibrate_all()
    print(f"\nForecast models calibrated:")
    for model, stats in result["forecast_models"].items():
        print(f"  {model}: acc={stats['overall_accuracy']:.3f} ({stats['total_samples']} samples) | "
              f"weight={stats['ensemble_weight']:.3f}")
    print(f"\nP(reach TP1): {result['p_reach_tp']['average']:.3f} ({result['p_reach_tp']['samples']} samples)")
    print(f"Recommendation: {result['recommendation']}")
    print(f"\nWritten: {OUTPUT_PATH}")
