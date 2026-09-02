import React, { useEffect, useState } from "react";
import { readEngineReport, readRiskState, type EngineReport } from "../lib/data";

interface Props {
  pair: string;
  date: string;
}

interface ParsedKPI {
  bias: "BULLISH" | "BEARISH" | "NEUTRAL";
  confidence: number;
  price: number;
  sslPrice: number | null;
  bslPrice: number | null;
  fvgCount: number;
  obCount: number;
  session: string;
  killzone: string;
  mmxmStep: string;
  modelCount: number;
  sweepRatio: number;
}

function parseKPI(report: EngineReport, pair: string): ParsedKPI {
  const structure = report.structure || {};
  const liquidity = report.liquidity || [];
  const sorted = [...liquidity].sort((a, b) => b.strength - a.strength);
  const ssl = sorted.find((l) => l.type === "SSL");
  const bsl = sorted.find((l) => l.type === "BSL");
  const sweptPools = liquidity.filter((l) => l.swept).length;
  const totalPools = liquidity.length;

  // Extract session info from the pair context
  let session = "Unknown";
  let killzone = "INACTIVE";
  let mmxmStep = "—";

  // Heuristic: check if we have time-based data
  if (structure.lastEvent) {
    const event = structure.lastEvent;
    if (event.includes("CHoCH") || event.includes("BOS")) {
      // Could infer from event timing but we'd need timestamp
    }
  }

  return {
    bias: (structure.bias || "neutral").toUpperCase() as any,
    confidence: Math.round((structure.confidence || 0) * 100),
    price: report.price || 0,
    sslPrice: ssl?.price ?? null,
    bslPrice: bsl?.price ?? null,
    fvgCount: report.fvgs?.length || 0,
    obCount: report.orderBlocks?.length || 0,
    session,
    killzone,
    mmxmStep,
    modelCount: 0,
    sweepRatio: totalPools > 0 ? Math.round((sweptPools / totalPools) * 100) : 0,
  };
}

export default function KPICards({ pair, date }: Props) {
  const [kpi, setKpi] = useState<ParsedKPI | null>(null);
  const [riskState, setRiskState] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [bestTF, setBestTF] = useState("1h");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Try multiple timeframes, pick the one with most complete data
      for (const tf of ["1h", "4h", "1d"]) {
        const report = await readEngineReport(date, pair, tf);
        if (report && report.price > 0) {
          if (!cancelled) {
            setKpi(parseKPI(report, pair));
            setBestTF(tf);
            break;
          }
        }
      }

      const risk = await readRiskState();
      if (!cancelled && risk) setRiskState(risk);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [pair, date]);

  if (loading || !kpi) {
    return (
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="panel p-3 animate-pulse">
            <div className="h-3 w-16 bg-[var(--border)] rounded mb-2" />
            <div className="h-6 w-12 bg-[var(--border)] rounded" />
          </div>
        ))}
      </div>
    );
  }

  const biasColor =
    kpi.bias === "BULLISH" ? "text-bull" : kpi.bias === "BEARISH" ? "text-bear" : "text-neutral";
  const biasHex =
    kpi.bias === "BULLISH" ? "#39ff14" : kpi.bias === "BEARISH" ? "#ff2d2d" : "#f0c040";

  return (
    <div className="grid grid-cols-4 gap-3 mb-4">
      {/* Bias */}
      <div className="panel">
        <div className="panel-header py-2">
          <span className="panel-title">Structural Bias</span>
          <span className={`font-mono text-[9px] ${biasColor}`}>{kpi.bias}</span>
        </div>
        <div className="panel-body py-3 text-center">
          <div className="font-mono text-2xl font-bold" style={{ color: biasHex }}>
            {kpi.bias === "BULLISH" ? "▲" : kpi.bias === "BEARISH" ? "▼" : "▶"}
          </div>
          <div className="font-mono text-xs mt-1" style={{ color: biasHex }}>
            {kpi.confidence}% conf
          </div>
          <div className="font-mono text-[8px] text-[var(--text-dim)] mt-1">
            {bestTF.toUpperCase()} · 1W→1H cascade
          </div>
        </div>
      </div>

      {/* Price + Levels */}
      <div className="panel">
        <div className="panel-header py-2">
          <span className="panel-title">Price &amp; Pools</span>
          <span className="font-mono text-[9px] text-[var(--text-dim)]">{pair}</span>
        </div>
        <div className="panel-body py-2 space-y-1.5">
          <div>
            <div className="font-mono text-[8px] text-[var(--text-dim)] uppercase">Current</div>
            <div className="font-mono text-sm font-bold">{kpi.price.toFixed(5)}</div>
          </div>
          {kpi.sslPrice && (
            <div className="flex justify-between items-center">
              <span className="font-mono text-[8px] text-bear">SSL</span>
              <span className="font-mono text-xs text-bear">{kpi.sslPrice.toFixed(5)}</span>
            </div>
          )}
          {kpi.bslPrice && (
            <div className="flex justify-between items-center">
              <span className="font-mono text-[8px] text-bull">BSL</span>
              <span className="font-mono text-xs text-bull">{kpi.bslPrice.toFixed(5)}</span>
            </div>
          )}
          <div className="flex justify-between items-center pt-1 border-t border-[var(--border)]">
            <span className="font-mono text-[8px] text-[var(--text-dim)]">Sweep Ratio</span>
            <span className={`font-mono text-xs ${kpi.sweepRatio > 50 ? "text-bear" : "text-cyan"}`}>
              {kpi.sweepRatio}%
            </span>
          </div>
        </div>
      </div>

      {/* Session */}
      <div className="panel">
        <div className="panel-header py-2">
          <span className="panel-title">Session</span>
          <span
            className={`font-mono text-[8px] px-1.5 py-0.5 rounded ${
              kpi.killzone === "ACTIVE" ? "verdict-clear" : "verdict-blocked"
            }`}
          >
            {kpi.killzone}
          </span>
        </div>
        <div className="panel-body py-2">
          <div className="font-display text-lg font-bold">{kpi.session || "LOADING..."}</div>
          <div className="font-mono text-[9px] text-[var(--text-dim)] mt-1">
            MMXM: {kpi.mmxmStep}
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <span className="live-dot" />
            <span className="font-mono text-[8px] text-[var(--text-dim)]">TV CDP LIVE</span>
          </div>
        </div>
      </div>

      {/* Models + Risk */}
      <div className="panel">
        <div className="panel-header py-2">
          <span className="panel-title">Signals &amp; Risk</span>
          {riskState && (
            <span className="font-mono text-[9px] text-[var(--text-muted)]">
              ${(parseFloat(riskState.balance || "0")).toFixed(0)}
            </span>
          )}
        </div>
        <div className="panel-body py-2 space-y-1.5">
          <div className="flex justify-between">
            <span className="font-mono text-[9px] text-[var(--text-muted)]">FVGs</span>
            <span className="font-mono text-sm font-bold text-cyan">{kpi.fvgCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-mono text-[9px] text-[var(--text-muted)]">OBs</span>
            <span className="font-mono text-sm font-bold text-purple">{kpi.obCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-mono text-[9px] text-[var(--text-muted)]">Active Models</span>
            <span className="font-mono text-sm font-bold">—</span>
          </div>
          {riskState && (
            <div className="flex justify-between pt-1 border-t border-[var(--border)]">
              <span className="font-mono text-[9px] text-[var(--text-dim)]">Streak</span>
              <span className="font-mono text-[9px] text-[var(--text-muted)]">
                {riskState.consecutiveWins > 0
                  ? `${riskState.consecutiveWins}W`
                  : riskState.consecutiveLosses > 0
                    ? `${riskState.consecutiveLosses}L`
                    : "—"}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
