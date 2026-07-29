import type { Candle } from "./types";
import { atrSeries } from "./atr";
import { volumeSma, isVolumeSpike } from "./volume";
import { SMC_CONFIG } from "./config";

export type OrderBlockKind = "OB" | "Breaker" | "Mitigation";

export type OrderBlock = {
  /** Distal (extreme) edge of the block. */
  top: number;
  /** Proximal (inner) edge of the block. */
  bottom: number;
  /** Proximal line â€” the edge price interacts with first. */
  proximal: number;
  /** Distal line â€” the protective extreme. */
  distal: number;
  type: "bullish" | "bearish";
  /** OB = unmitigated origin; Breaker = swept then closed through and flipped;
   *  Mitigation = previously tagged but not yet broken. */
  kind: OrderBlockKind;
  index: number;
  time: number;
  /** ATR-normalised size of the impulse leg that created the OB. */
  impulseAtr: number;
  /** True if the impulse left a Fair Value Gap (real ICT OB). */
  hasFvg: boolean;
  distance: number;
};

/**
 * True ICT order-block detection.
 *
 *  - The OB candle is the LAST opposite-color candle before a displacement
 *    impulse (â‰¥ obImpulseMinAtr Ã— ATR).
 *  - The impulse must (optionally) print a Fair Value Gap â€” this is the
 *    canonical filter that separates real OBs from random pin bars.
 *  - Proximal / distal lines are exposed explicitly:
 *      bullish OB â†’ proximal = high, distal = low
 *      bearish OB â†’ proximal = low,  distal = high
 *  - Mitigation: price trading past obMitigationFraction of the body from
 *    the proximal side marks the OB as tagged (kind = "Mitigation"); a
 *    subsequent close fully through flips it to a Breaker.
 */
export function analyzeOrderBlocks(candles: Candle[]): OrderBlock[] {
  const n = candles.length;
  if (n < 5) return [];
  const last = candles[n - 1].close;
  const atr = atrSeries(candles);
  const volSma = volumeSma(candles);
  const ratio = SMC_CONFIG.obBodyToRangeRatio;
  const minImpulse = SMC_CONFIG.obImpulseMinAtr;

  const blocks: OrderBlock[] = [];

  for (let i = 2; i < n - 2; i++) {
    const c = candles[i];
    const next = candles[i + 1];
    const next2 = candles[i + 2];
    const a = atr[i + 1] || atr[i] || 0;
    if (a === 0) continue;

    const range = next.high - next.low;
    const body = Math.abs(next.close - next.open);
    if (range === 0) continue;

    const impulseAtr = body / a;
    const volOk = isVolumeSpike(candles, i + 1, volSma);
    const strongUp =
      next.close > next.open &&
      next2.close > next.high &&
      body / range > ratio &&
      impulseAtr >= minImpulse &&
      volOk;
    const strongDn =
      next.close < next.open &&
      next2.close < next.low &&
      body / range > ratio &&
      impulseAtr >= minImpulse &&
      volOk;

    // FVG check: bullish impulse needs candle[i].high < candle[i+2].low
    // (gap above OB candle); bearish needs candle[i].low > candle[i+2].high.
    const fvgUp = c.high < next2.low;
    const fvgDn = c.low > next2.high;

    if (c.close < c.open && strongUp && (!SMC_CONFIG.obRequireFvg || fvgUp)) {
      blocks.push(
        classify(
          {
            top: c.high,
            bottom: c.low,
            proximal: c.high,
            distal: c.low,
            type: "bullish",
            kind: "OB",
            index: i,
            time: c.time,
            impulseAtr,
            hasFvg: fvgUp,
            distance: ((last - (c.high + c.low) / 2) / last) * 100,
          },
          candles,
          last,
        ),
      );
    }
    if (c.close > c.open && strongDn && (!SMC_CONFIG.obRequireFvg || fvgDn)) {
      blocks.push(
        classify(
          {
            top: c.high,
            bottom: c.low,
            proximal: c.low,
            distal: c.high,
            type: "bearish",
            kind: "OB",
            index: i,
            time: c.time,
            impulseAtr,
            hasFvg: fvgDn,
            distance: (((c.high + c.low) / 2 - last) / last) * 100,
          },
          candles,
          last,
        ),
      );
    }
  }

  // Drop fully-violated OBs (kind = invalid). Keep OB / Mitigation / Breaker.
  return blocks
    .filter((b) => b.kind !== ("invalid" as OrderBlockKind))
    .sort((a, b) => b.index - a.index)
    .slice(0, SMC_CONFIG.maxOrderBlocks);
}

function classify(b: OrderBlock, candles: Candle[], last: number): OrderBlock {
  const after = candles.slice(b.index + 3);
  const range = b.top - b.bottom;
  if (range === 0) return b;
  const mitigationLine =
    b.type === "bullish"
      ? b.top - range * SMC_CONFIG.obMitigationFraction
      : b.bottom + range * SMC_CONFIG.obMitigationFraction;

  let tagged = false;
  let fullyBroken = false;
  for (const k of after) {
    if (b.type === "bullish") {
      if (k.low <= mitigationLine) tagged = true;
      if (
        SMC_CONFIG.obBreakerCloseConfirms ? k.close < b.bottom : k.low < b.bottom
      ) {
        fullyBroken = true;
        break;
      }
    } else {
      if (k.high >= mitigationLine) tagged = true;
      if (
        SMC_CONFIG.obBreakerCloseConfirms ? k.close > b.top : k.high > b.top
      ) {
        fullyBroken = true;
        break;
      }
    }
  }

  if (fullyBroken) {
    const flipped: "bullish" | "bearish" = b.type === "bullish" ? "bearish" : "bullish";
    const mid = (b.top + b.bottom) / 2;
    return {
      ...b,
      kind: "Breaker",
      type: flipped,
      proximal: flipped === "bullish" ? b.top : b.bottom,
      distal: flipped === "bullish" ? b.bottom : b.top,

      distance: flipped === "bullish"
        ? ((last - mid) / last) * 100
        : ((mid - last) / last) * 100,
    };
  }
  if (tagged) return { ...b, kind: "Mitigation" };
  return b;
}

