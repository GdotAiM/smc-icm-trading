// Centralised SMC magic numbers. Tune in one place.
// Adapted from smc-pulse-predict (cleaner flat structure)
export const SMC_CONFIG = {
  // ── Pivot detection ──────────────────────────────────────────────
  pivotLookback: 3,

  // ── Liquidity clustering ────────────────────────────────────────
  liquidityTolerance: 0.0015,
  equalLevelTolerance: 0.001,
  liquidityHalfLifeBars: 200,
  // ICT-correct session quality ordering: killzones (London / NY AM) = highest
  // liquidity/displacement; Asia = low liquidity. Inverted from the old UTC Asia=1.3.
  sessionWeight: { "NY AM": 1.3, London: 1.2, "NY PM": 1.0, Asia: 0.5, Off: 0.6 },

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

// NY offset from UTC: EST = -5, EDT = -4.
// US DST transitions at 02:00 NY local → 07:00 UTC (start, EDT) / 06:00 UTC (end, EST).
// 2nd Sunday March → 1st Sunday November.
function nyOffsetFor(ts: number): number {
  const d = new Date(ts);
  const year = d.getUTCFullYear();
  const mar1 = new Date(Date.UTC(year, 2, 1));
  const mar2ndSun = new Date(Date.UTC(year, 2, (14 - mar1.getUTCDay()) % 7 + 8, 7));
  const nov1 = new Date(Date.UTC(year, 10, 1));
  const nov1stSun = new Date(Date.UTC(year, 10, (7 - nov1.getUTCDay()) % 7 + 1, 6));
  return (ts >= mar2ndSun.getTime() && ts < nov1stSun.getTime()) ? -4 : -5;
}

function nyHourFor(ts: number): number {
  let h = new Date(ts).getUTCHours() + nyOffsetFor(ts);
  if (h < 0) h += 24;
  if (h >= 24) h -= 24;
  return h;
}

export function sessionForTime(ts: number): SessionName {
  const h = nyHourFor(ts);
  if (h >= 20 || h < 2) return "Asia";   // NY Asia 20:00–02:00 (prev-day evening + overnight)
  if (h >= 2 && h < 8) return "London";  // London KZ 02:00–05:00 + London PM/pre-NY 05:00–08:00
  if (h >= 8 && h < 11) return "NY AM";  // NY AM Killzone 08:00–11:00
  if (h >= 11 && h < 13) return "Off";   // NY Lunch 11:00–13:00 (low liquidity)
  if (h >= 13 && h < 16) return "NY PM"; // NY PM 13:00–16:00
  return "Off";                          // NY Close 16:00–17:00 + off hours 17:00–20:00
}
