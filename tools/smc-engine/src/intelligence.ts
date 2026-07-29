import type { Candle } from "./types";
import type { SmcReport } from "./report";
import { equalLevels as fastEqualLevels } from "./liquidity";
import { atrSeries } from "./atr";
import { volumeSma, isVolumeSpike } from "./volume";
import { SMC_CONFIG } from "./config";

export type SessionName = "Asia" | "London" | "NY AM" | "NY PM" | "Off";

export function currentSession(d = new Date()): SessionName {
  const h = d.getUTCHours();
  if (h >= 0 && h < 7) return "Asia";
  if (h >= 7 && h < 12) return "London";
  if (h >= 12 && h < 16) return "NY AM";
  if (h >= 16 && h < 21) return "NY PM";
  return "Off";
}

// Session is "aligned" with directional bias when we're inside a killzone.
export function sessionAlignment(bias: "bullish" | "bearish" | "neutral"): {
  ok: boolean;
  session: SessionName;
  note: string;
} {
  const s = currentSession();
  const inKillzone = s === "London" || s === "NY AM";
  const ok = bias !== "neutral" && inKillzone;
  return {
    ok,
    session: s,
    note: inKillzone
      ? `Inside ${s} killzone â€” institutional flow active`
      : `${s} session â€” lower displacement probability`,
  };
}

// Detect equal highs/lows (engineered liquidity). Delegates to the O(n log n)
// sort+sweep clusterer in liquidity.ts â€” kept here as a re-export so existing
// callers continue to work.
export const equalLevels = fastEqualLevels;

/**
 * Displacement strength: ratio of last candle body to ATR(14).
 * When volume data is available, also confirms via volume spike.
 */
export function displacement(candles: Candle[]): {
  strength: number;
  label: string;
  volumeConfirmed: boolean;
  volumeRatio: number;
} {
  if (candles.length < 15) return { strength: 0, label: "n/a", volumeConfirmed: false, volumeRatio: 0 };
  const atr = atrSeries(candles);
  const last = candles[candles.length - 1];
  const body = Math.abs(last.close - last.open);
  const ratio = atr[atr.length - 1] ? body / atr[atr.length - 1] : 0;
  const label =
    ratio > SMC_CONFIG.displacementStrong
      ? "strong"
      : ratio > SMC_CONFIG.displacementModerate
        ? "moderate"
        : "weak";

  const volSma = volumeSma(candles);
  const lastIdx = candles.length - 1;
  const volumeConfirmed = isVolumeSpike(candles, lastIdx, volSma);
  const volAvg = volSma[lastIdx];
  const volumeRatio = volAvg > 0 ? candles[lastIdx].volume / volAvg : 0;

  return { strength: ratio, label, volumeConfirmed, volumeRatio };
}

export type ConfidenceDriver = { label: string; ok: boolean; detail: string };

export function buildConfidenceDrivers(
  tfReport: SmcReport,
  htfReport: SmcReport | undefined,
  candles: Candle[],
): ConfidenceDriver[] {
  const drivers: ConfidenceDriver[] = [];

  // HTF alignment
  if (htfReport) {
    const aligned = tfReport.structure.bias === htfReport.structure.bias && tfReport.structure.bias !== "neutral";
    drivers.push({
      label: "HTF alignment",
      ok: aligned,
      detail: aligned
        ? `Matches higher TF ${htfReport.structure.bias} bias`
        : `HTF is ${htfReport.structure.bias}, this TF is ${tfReport.structure.bias}`,
    });
  } else {
    drivers.push({
      label: "HTF alignment",
      ok: false,
      detail: "No higher timeframe loaded for comparison",
    });
  }

  // Session
  const sa = sessionAlignment(tfReport.structure.bias);
  drivers.push({ label: "Session alignment", ok: sa.ok, detail: sa.note });

  // Liquidity engineered (equal highs/lows present and aligned with draw)
  const eq = equalLevels(candles);
  const drawSide = tfReport.draw?.side;
  const liqOk =
    (drawSide === "up" && !!eq.equalHighs) || (drawSide === "down" && !!eq.equalLows);
  drivers.push({
    label: "Engineered liquidity",
    ok: liqOk,
    detail: liqOk
      ? `Equal ${drawSide === "up" ? "highs" : "lows"} sitting as draw magnet`
      : "No clean equal highs/lows aligned with draw",
  });

  // Displacement
  const d = displacement(candles);
  drivers.push({
    label: "Displacement",
    ok: d.strength > SMC_CONFIG.displacementModerate,
    detail: `Last candle body is ${d.label} (${d.strength.toFixed(2)}Ã— ATR)`,
  });

  // Structure event recency (BOS/CHoCH)
  const evOk = tfReport.structure.lastEvent !== "none";
  drivers.push({
    label: "Structure shift",
    ok: evOk,
    detail: evOk
      ? `${tfReport.structure.lastEvent} confirms ${tfReport.structure.bias} intent`
      : "No recent BOS/CHoCH â€” range conditions",
  });

  return drivers;
}

// Pre-computed transparent "thoughts" from each agent â€” the pipeline log.
export type AgentThought = { agent: string; text: string };

export function agentReasoningLog(report: SmcReport, candles: Candle[]): AgentThought[] {
  const eq = equalLevels(candles);
  const d = displacement(candles);
  const s = currentSession();
  const logs: AgentThought[] = [];

  logs.push({
    agent: "Structure",
    text: `Bias: ${report.structure.bias.toUpperCase()}. Last event: ${report.structure.lastEvent}${
      report.structure.lastEventPrice ? ` @ ${report.structure.lastEventPrice}` : ""
    }. Confidence ${(report.structure.confidence * 100).toFixed(0)}%.`,
  });

  const bsl = report.liquidity.filter((l) => l.type === "BSL");
  const ssl = report.liquidity.filter((l) => l.type === "SSL");
  logs.push({
    agent: "Liquidity",
    text: `Found ${bsl.length} BSL pools above price${
      bsl[0] ? ` (nearest @ ${bsl[0].price.toFixed(4)}, +${bsl[0].distance.toFixed(2)}%)` : ""
    } and ${ssl.length} SSL pools below${
      ssl[0] ? ` (nearest @ ${ssl[0].price.toFixed(4)}, -${ssl[0].distance.toFixed(2)}%)` : ""
    }.${
      eq.equalHighs ? ` Equal highs detected near ${eq.equalHighs.price.toFixed(4)}.` : ""
    }${eq.equalLows ? ` Equal lows detected near ${eq.equalLows.price.toFixed(4)}.` : ""}`,
  });

  logs.push({
    agent: "Order Blocks",
    text: `${report.orderBlocks.length} unmitigated OBs in play${
      report.orderBlocks[0]
        ? ` â€” nearest ${report.orderBlocks[0].type} OB ${report.orderBlocks[0].bottom.toFixed(
            4,
          )}â€“${report.orderBlocks[0].top.toFixed(4)}.`
        : "."
    }`,
  });

  logs.push({
    agent: "FVG",
    text: `${report.fvgs.length} unfilled imbalances${
      report.fvgs[0]
        ? ` â€” closest ${report.fvgs[0].type} FVG ${report.fvgs[0].bottom.toFixed(
            4,
          )}â€“${report.fvgs[0].top.toFixed(4)}.`
        : "."
    }`,
  });

  const volNote = d.volumeConfirmed ? " âœ… vol spike" : d.volumeRatio > 0 ? " âŒ no vol" : "";
  logs.push({
    agent: "Order Flow",
    text: `Displacement: ${d.label} (${d.strength.toFixed(2)}Ã— ATR)${volNote}. Session: ${s}.`,
  });

  logs.push({
    agent: "Synthesizer",
    text: report.draw
      ? `Highest-probability draw: ${report.draw.side === "up" ? "â–²" : "â–¼"} ${report.draw.price.toFixed(
          4,
        )} (${report.draw.reason}, conf ${(report.draw.score * 100).toFixed(0)}%).${
          report.alt ? ` Alt: ${report.alt.side === "up" ? "â–²" : "â–¼"} ${report.alt.price.toFixed(4)}.` : ""
        }`
      : "No clean draw target â€” wait for liquidity engineering.",
  });

  return logs;
}
