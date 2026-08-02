/**
 * Coherence Calculator & Weighted Bias Module
 * Handles multi-timeframe bias aggregation, worst-dimension-wins coherence evaluation,
 * and stacked multiplier boosts across weekly profiles, killzones, and models.
 */

const LENS_WEIGHTS = {
  "1W": 3.0,
  "1D": 2.5,
  "4H": 2.0,
  "WeeklyProfile": 1.5,
  "OneTradeSetup": 1.0,
  "1H": 0.5
};

/**
 * Compute weighted direction and confidence across timeframe readings
 */
function calculateWeightedBias(readings = {}) {
  let bullishWeight = 0;
  let bearishWeight = 0;
  let totalWeight = 0;

  for (const [key, weight] of Object.entries(LENS_WEIGHTS)) {
    const rawVal = (readings[key] || "neutral").toLowerCase();
    totalWeight += weight;
    if (rawVal.includes("bull")) {
      bullishWeight += weight;
    } else if (rawVal.includes("bear")) {
      bearishWeight += weight;
    }
  }

  let direction = "NEUTRAL";
  let winningWeight = 0;
  if (bullishWeight > bearishWeight) {
    direction = "BULLISH";
    winningWeight = bullishWeight;
  } else if (bearishWeight > bullishWeight) {
    direction = "BEARISH";
    winningWeight = bearishWeight;
  } else {
    winningWeight = Math.max(bullishWeight, bearishWeight);
  }

  const confidence = totalWeight > 0 ? Number((winningWeight / totalWeight).toFixed(2)) : 0;

  return {
    direction,
    confidence,
    bullishWeight,
    bearishWeight,
    totalWeight
  };
}

/**
 * Single Unified Coherence Calculation (Worst Dimension Wins rule)
 */
function calculateCoherence(dimensions = []) {
  if (!dimensions || dimensions.length === 0) {
    return { score: 0, status: "INVALIDATED", minDimension: "NONE" };
  }

  let minScore = 1.0;
  let minDim = dimensions[0].name;

  for (const dim of dimensions) {
    const val = Number(dim.score) || 0;
    if (val < minScore) {
      minScore = val;
      minDim = dim.name;
    }
  }

  let status = "COHERENT";
  if (minScore === 0) {
    status = "INVALIDATED";
  } else if (minScore < 0.5) {
    status = "WEAK";
  } else if (minScore < 0.75) {
    status = "MODERATE";
  }

  return {
    score: Number(minScore.toFixed(2)),
    status,
    minDimension: minDim
  };
}

module.exports = {
  LENS_WEIGHTS,
  calculateWeightedBias,
  calculateCoherence
};
