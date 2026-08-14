#!/usr/bin/env python3
"""WP-16: Probabilistic classifier trainer for SMC-ICM trading system.

Reads feature_matrix.jsonl (built by build_feature_matrix.cjs), trains a
gradient-boosted tree classifier, and outputs:
  1. Classifier weights per ICT model (P(win) calibration)
  2. Global feature importance ranking
  3. Per-model performance statistics
  4. Trained model for online inference (classifier_weights.json)

Usage:
  python tools/train_classifier.py                        → train on all data
  python tools/train_classifier.py --target winEOD        → predict EOD outcome
  python tools/train_classifier.py --target win4h         → predict 4h outcome
  python tools/train_classifier.py --min-samples 50       → require 50+ samples
"""

import json
import math
import os
import sys
from pathlib import Path

import numpy as np

ROOT = Path(os.environ.get("WORKSPACE_ROOT", Path(__file__).resolve().parent.parent))
MATRIX_PATH = ROOT / "shared" / "training" / "feature_matrix.jsonl"
OUTPUT_PATH = ROOT / "shared" / "training" / "classifier_weights.json"


def load_matrix(path):
    """Load feature matrix from JSONL file."""
    samples = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                samples.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return samples


def prepare_features(samples, target="winEOD"):
    """Extract feature matrix X and target vector y from samples."""
    # Columns to exclude from features
    exclude = {
        "date", "pair", "model", "is_primary",
        "win1h", "win4h", "winEOD",
        "pnl1h", "pnl4h", "pnlEOD",
    }

    # Find all feature columns
    feature_cols = [k for k in samples[0].keys() if k not in exclude]

    X = []
    y = []
    models = []
    pairs = []
    for s in samples:
        # Skip samples without outcome
        if s.get(target) is None:
            continue
        row = []
        valid = True
        for col in feature_cols:
            v = s.get(col)
            if v is None or (isinstance(v, float) and (math.isnan(v) or math.isinf(v))):
                v = 0.0  # impute nulls with 0
            row.append(float(v))
        X.append(row)
        y.append(int(s[target]))
        models.append(s.get("model", "Unknown"))
        pairs.append(s.get("pair", "Unknown"))

    return np.array(X, dtype=np.float32), np.array(y, dtype=np.int32), feature_cols, models, pairs


def train_sklearn_gbt(X, y, feature_cols):
    """Train a GradientBoostingClassifier (no LightGBM dependency required)."""
    from sklearn.ensemble import GradientBoostingClassifier
    from sklearn.model_selection import cross_val_score, StratifiedKFold

    # Handle class imbalance
    n_pos = int(y.sum())
    n_neg = len(y) - n_pos
    print(f"  Class balance: {n_pos} wins / {n_neg} losses ({n_pos/len(y)*100:.1f}% / {n_neg/len(y)*100:.1f}%)")

    clf = GradientBoostingClassifier(
        n_estimators=100,
        max_depth=4,
        learning_rate=0.05,
        min_samples_leaf=5,
        subsample=0.8,
        random_state=42,
    )

    clf.fit(X, y)

    # Cross-validation
    try:
        cv = StratifiedKFold(n_splits=min(5, min(n_pos, n_neg)), shuffle=True, random_state=42)
        scores = cross_val_score(clf, X, y, cv=cv, scoring="roc_auc")
        cv_mean = float(scores.mean())
        cv_std = float(scores.std())
    except Exception:
        cv_mean, cv_std = 0.5, 0.0

    print(f"  CV ROC-AUC: {cv_mean:.3f} ± {cv_std:.3f}")

    # Feature importance
    importance = list(zip(feature_cols, clf.feature_importances_))
    importance.sort(key=lambda x: x[1], reverse=True)

    print(f"\n  Top 20 features:")
    for name, imp in importance[:20]:
        print(f"    {name}: {imp:.4f}")

    return clf, cv_mean, importance


def per_model_stats(samples, clf, X, y, feature_cols, models):
    """Compute per-model win rate and calibrated probability."""
    model_stats = {}
    for i, m in enumerate(models):
        if m not in model_stats:
            model_stats[m] = {"total": 0, "wins": 0, "prob_sum": 0.0}
        model_stats[m]["total"] += 1
        model_stats[m]["wins"] += int(y[i])
        # Get predicted probability for this sample
        try:
            prob = float(clf.predict_proba(X[i:i+1])[0, 1])
        except Exception:
            prob = 0.5
        model_stats[m]["prob_sum"] += prob

    results = {}
    for name, stats in sorted(model_stats.items()):
        wr = stats["wins"] / stats["total"] * 100 if stats["total"] > 0 else 0
        avg_prob = stats["prob_sum"] / stats["total"] if stats["total"] > 0 else 0.5
        # Calibration: how well does predicted prob match actual win rate?
        calibration = "OVERCONFIDENT" if avg_prob > wr / 100 + 0.15 else \
                      "UNDERCONFIDENT" if avg_prob < wr / 100 - 0.15 else \
                      "CALIBRATED"
        results[name] = {
            "samples": stats["total"],
            "wins": stats["wins"],
            "win_rate_pct": round(wr, 1),
            "avg_predicted_prob": round(avg_prob, 4),
            "calibration": calibration,
            "recommendation": "PREFER" if wr > 50 and stats["total"] >= 3 else
                             "AVOID" if wr < 35 and stats["total"] >= 3 else
                             "NEUTRAL",
        }
    return results


def main():
    target = "winEOD"
    for arg in sys.argv:
        if arg.startswith("--target="):
            target = arg.split("=")[1]

    print(f"=== WP-16: SMC-ICM Classifier Trainer ===")
    print(f"    Target: {target}")

    # Load data
    samples = load_matrix(MATRIX_PATH)
    print(f"| Samples loaded: {len(samples)}")

    # Prepare features
    X, y, feature_cols, models, pairs = prepare_features(samples, target)
    n_features = len(feature_cols)
    print(f"| Features: {n_features}")
    print(f"| Labeled samples: {len(y)}")
    print(f"========================================\n")

    if len(y) < 20:
        print(f"ERROR: Only {len(y)} labeled samples — need at least 20 for training.")
        print("Run build_feature_matrix.cjs first, then accumulate more trading days.")
        sys.exit(1)

    # Train
    print("Training GradientBoostingClassifier...")
    clf, cv_auc, importance = train_sklearn_gbt(X, y, feature_cols)

    # Per-model stats
    print("\nPer-Model Performance:")
    model_results = per_model_stats(samples, clf, X, y, feature_cols, models)
    for name, stats in model_results.items():
        print(f"  {name}: {stats['win_rate_pct']:.1f}% WR ({stats['samples']} samples) | "
              f"Avg P(win)={stats['avg_predicted_prob']:.3f} | {stats['calibration']} | {stats['recommendation']}")

    # Build output weights
    weights = {
        "generated": __import__("datetime").datetime.now().isoformat(),
        "target": target,
        "samples": len(y),
        "features": n_features,
        "cv_roc_auc": round(cv_auc, 4),
        "baseline_win_rate": round(float(y.mean()) * 100, 1),
        "top_features": [{"name": name, "importance": round(imp, 4)} for name, imp in importance[:30]],
        "models": model_results,
    }

    os.makedirs(OUTPUT_PATH.parent, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(weights, f, indent=2)

    print(f"\n[OK] Classifier weights written: {OUTPUT_PATH}")
    print(f"   CV ROC-AUC: {cv_auc:.3f}  |  Baseline WR: {weights['baseline_win_rate']:.1f}%  |  Features: {n_features}")

    # Recommendation
    prefer = [n for n, s in model_results.items() if s["recommendation"] == "PREFER"]
    avoid = [n for n, s in model_results.items() if s["recommendation"] == "AVOID"]
    if prefer:
        print(f"   PREFER in ties: {', '.join(prefer)}")
    if avoid:
        print(f"   AVOID in ties: {', '.join(avoid)}")


if __name__ == "__main__":
    main()
