import type { Candle } from "./types";
import { analyzeStructure, type StructureResult } from "./structure";
import { analyzeLiquidity, type LiquidityPool } from "./liquidity";
import { analyzeOrderBlocks, type OrderBlock } from "./order-blocks";
import { analyzeFVG, analyzeIFVG, type FVG, type InversionFVG } from "./fvg";
import { analyzeDailyBias, type DailyBiasResult } from "./daily-bias";
import { analyzePDArray, type PDArrayResult } from "./pd-array";
import { analyzeSMT, type SMTResult } from "./smt";
import { displacement } from "./intelligence";
import { SMC_CONFIG } from "./config";

export type BuildReportOptions = {
  /** Daily-timeframe candles for macro trend bias. */
  dailyCandles?: Candle[];
  /** Correlated pair data for SMT divergence detection. */
  correlatedPairs?: { symbol: string; candles: Candle[] }[];
};

export type DrawTarget = {
  price: number;
  side: "up" | "down";
  distance: number; // %
  reason: string;
  score: number;
};

export type SmcReport = {
  price: number;
  structure: StructureResult;
  liquidity: LiquidityPool[];
  orderBlocks: OrderBlock[];
  fvgs: FVG[];
  draw: DrawTarget | null;
  alt: DrawTarget | null;
  /** Volume-confirmed displacement of the last bar. */
  volumeDisplacement: {
    atrRatio: number;
    label: string;
    volumeConfirmed: boolean;
    volumeRatio: number;
  };
  /** Daily macro trend bias (if daily candles provided). */
  dailyBias?: DailyBiasResult;
  /** Premium / Discount zone of current price. */
  pdArray?: PDArrayResult;
  /** Filled gaps that flipped to support / resistance. */
  inversionFvgs?: InversionFVG[];
  /** SMT divergences with correlated pairs (if pair data provided). */
  smt?: SMTResult[];
};

export function buildReport(
  candles: Candle[],
  options?: BuildReportOptions,
): SmcReport {
  const price = candles[candles.length - 1]?.close ?? 0;
  const structure = analyzeStructure(candles);
  const liquidity = analyzeLiquidity(candles);
  const orderBlocks = analyzeOrderBlocks(candles);
  const fvgs = analyzeFVG(candles);

  // â”€â”€ New detection modules â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const volDisp = displacement(candles);
  const volumeDisplacement = {
    atrRatio: volDisp.strength,
    label: volDisp.label,
    volumeConfirmed: volDisp.volumeConfirmed,
    volumeRatio: volDisp.volumeRatio,
  };

  const dailyBias = options?.dailyCandles
    ? analyzeDailyBias(options.dailyCandles)
    : undefined;

  const pdArray = analyzePDArray(candles);

  const inversionFvgs = analyzeIFVG(candles);

  const smt = options?.correlatedPairs?.map((p) =>
    analyzeSMT(candles, p.candles, p.symbol),
  ) ?? undefined;

  // â”€â”€ Draw target scoring (enhanced) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const { proximity, strength, bias } = SMC_CONFIG.drawWeights;
  const candidates: DrawTarget[] = liquidity.map((p) => {
    const aligned =
      (p.type === "BSL" && structure.bias === "bullish") ||
      (p.type === "SSL" && structure.bias === "bearish");
    const proximityScore = Math.max(
      0,
      1 - Math.abs(p.distance) / SMC_CONFIG.drawProximityRangePct,
    );
    const strengthScore = Math.min(1, p.strength / SMC_CONFIG.drawStrengthCap);
    const biasScore = aligned ? 1 : structure.bias === "neutral" ? 0.5 : 0.2;

    let score =
      proximityScore * proximity + strengthScore * strength + biasScore * bias;

    // â”€â”€ Multiplier: daily bias alignment â”€â”€
    if (dailyBias && dailyBias.bias !== "neutral") {
      const dailyAligned =
        (p.type === "BSL" && dailyBias.bias === "bullish") ||
        (p.type === "SSL" && dailyBias.bias === "bearish");
      score *= dailyAligned ? 1.2 : 0.8;
    }

    // â”€â”€ Multiplier: PD array alignment â”€â”€
    if (pdArray && pdArray.rangeHigh > 0) {
      const pdAligned =
        (p.type === "BSL" && pdArray.currentZone === "discount") ||   // buy from discount
        (p.type === "SSL" && pdArray.currentZone === "premium");      // sell from premium
      if (pdAligned) score *= 1.15;
    }

    return {
      price: p.price,
      side: p.type === "BSL" ? "up" : "down",
      distance: p.distance,
      reason: `${p.type} pool Â· ${p.strength} touch${p.strength > 1 ? "es" : ""}`,
      score,
    };
  });

  candidates.sort((a, b) => b.score - a.score);
  const draw = candidates[0] ?? null;
  const alt = candidates.find((c) => c.side !== draw?.side) ?? null;

  return {
    price,
    structure,
    liquidity,
    orderBlocks,
    fvgs,
    draw,
    alt,
    volumeDisplacement,
    dailyBias,
    pdArray,
    inversionFvgs,
    smt,
  };
}
