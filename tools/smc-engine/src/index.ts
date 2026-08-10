// Barrel export — SMC Engine
export { buildReport } from "./report";
export type { SmcReport, DrawTarget, BuildReportOptions } from "./report";

export { analyzeStructure } from "./structure";
export type { StructureResult, StructureBias } from "./structure";

export { analyzeLiquidity, equalLevels } from "./liquidity";
export type { LiquidityPool } from "./liquidity";

export { analyzeOrderBlocks } from "./order-blocks";
export type { OrderBlock, OrderBlockKind } from "./order-blocks";

export { analyzeFVG, analyzeIFVG } from "./fvg";
export type { FVG, InversionFVG } from "./fvg";

export { analyzeDailyBias } from "./daily-bias";
export type { DailyBiasResult, DailyBias } from "./daily-bias";

export { analyzePDArray } from "./pd-array";
export type { PDArrayResult, PDZone } from "./pd-array";

export { analyzeSMT } from "./smt";
export type { SMTResult, SMTDivergence, SMTDivergenceType } from "./smt";

export { displacement, currentSession, sessionAlignment, buildConfidenceDrivers } from "./intelligence";

export { findPivots } from "./pivots";
export { atrSeries, lastAtr } from "./atr";
export { volumeSma, isVolumeSpike } from "./volume";

export { SMC_CONFIG, sessionForTime } from "./config";
export type { SessionName } from "./config";

export { detectLunchInefficiency, eventHorizon, nearestEventHorizon, toCarryForwardLevel } from "./prev-day-inefficiency";
export type { LunchInefficiency, LunchSweep, PrevDayLunchResult, CarryForwardLevel, EventHorizonResult, ImbalanceKind } from "./prev-day-inefficiency";

export type { Candle } from "./types";
