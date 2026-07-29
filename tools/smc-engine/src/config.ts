// Centralised SMC magic numbers. Tune in one place.
// Adapted from smc-pulse-predict (cleaner flat structure)
export const SMC_CONFIG = {
  // ── Pivot detection ──────────────────────────────────────────────
  pivotLookback: 3,

  // ── Liquidity clustering ────────────────────────────────────────
  liquidityTolerance: 0.0015,
  equalLevelTolerance: 0.001,
  liquidityHalfLifeBars: 200,
  sessionWeight: { Asia: 1.3, London: 1.1, "NY AM": 1.0, "NY PM": 0.9, Off: 0.8 },

  // ── Order Blocks ────────────────────────────────────────────────
  obBodyToRangeRatio: 0.6,
  obImpulseMinAtr: 1.0,
  obRequireFvg: true,
  obMitigationFraction: 0.5,
  obBreakerCloseConfirms: true,

  // ── FVG ─────────────────────────────────────────────────────────
  fvgMinGapAtr: 0.25,
  fvgMinDisplacementAtr: 1.0,
  fvgMitigationFraction: 0.5,

  // ── Structure ───────────────────────────────────────────────────
  structureRequireClose: true,
  structureMinSwingAtr: 0.8,

  // ── Displacement ────────────────────────────────────────────────
  displacementStrong: 1.5,
  displacementModerate: 0.8,

  // ── Volume ──────────────────────────────────────────────────────
  volumeSmaPeriod: 20,
  volumeSpikeMin: 1.5,

  // ── Daily bias ─────────────────────────────────────────────────
  dailyBiasLookback: 30,
  dailyBiasSwingAtr: 0.6,

  // ── PD Array ────────────────────────────────────────────────────
  pdArrayBodyRatio: 0.5,
  pdArrayMaxZones: 3,

  // ── Inversion FVGs ─────────────────────────────────────────────
  ifvgConfirmationBars: 5,
  ifvgMinReversalAtr: 0.5,

  // ── SMT Divergence ─────────────────────────────────────────────
  smtLookbackBars: 30,
  smtDivergenceAtr: 0.5,

  // ── UI caps ─────────────────────────────────────────────────────
  maxLiquidityPools: 6,
  maxOrderBlocks: 4,
  maxFvgs: 4,

  // ── Draw scoring ───────────────────────────────────────────────
  drawWeights: { proximity: 0.4, strength: 0.3, bias: 0.3 },
  drawProximityRangePct: 5,
  drawStrengthCap: 4,
} as const;

export type SessionName = "Asia" | "London" | "NY AM" | "NY PM" | "Off";

export function sessionForTime(ts: number): SessionName {
  const h = new Date(ts).getUTCHours();
  if (h >= 0 && h < 7) return "Asia";
  if (h >= 7 && h < 12) return "London";
  if (h >= 12 && h < 16) return "NY AM";
  if (h >= 16 && h < 21) return "NY PM";
  return "Off";
}
