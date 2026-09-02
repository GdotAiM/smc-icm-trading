import React from "react";

interface Props {
  score: number;       // 0-100 coherence score
  bias: "BULLISH" | "BEARISH" | "NEUTRAL";
  confidence: number;  // 0-100
  activeModels: string[];
}

export default function CoherenceGauge({ score, bias, confidence, activeModels }: Props) {
  const circumference = 2 * Math.PI * 80; // r=80
  const offset = circumference * (1 - score / 100);

  const colorMap: Record<string, string> = {
    BULLISH: "#39ff14",
    BEARISH: "#ff2d2d",
    NEUTRAL: "#f0c040",
  };
  const needleColor = colorMap[bias];

  return (
    <div className="flex items-center gap-6">
      {/* Gauge */}
      <div className="gauge-container">
        <svg className="gauge-svg" viewBox="0 0 200 200">
          {/* Background arc */}
          <circle cx="100" cy="100" r="80" className="gauge-bg" />
          {/* Fill arc */}
          <circle
            cx="100"
            cy="100"
            r="80"
            className="gauge-fill"
            stroke={needleColor}
            strokeDasharray={`${circumference}`}
            strokeDashoffset={`${offset}`}
            style={{ filter: `drop-shadow(0 0 6px ${needleColor}44)` }}
          />
        </svg>
        <div className="gauge-center">
          <div className="gauge-score" style={{ color: needleColor }}>{score}</div>
          <div className="gauge-label">Coherence</div>
          <div className="gauge-bias" style={{ color: needleColor }}>{bias}</div>
        </div>
      </div>

      {/* Details */}
      <div className="flex flex-col gap-3 flex-1 min-w-0">
        <div>
          <div className="text-[9px] uppercase tracking-[2px] text-[var(--text-muted)] font-display mb-1">
            Bias Confidence
          </div>
          <div className="flex items-center gap-2">
            <div className="signal-bar-track flex-1">
              <div
                className="signal-bar-fill"
                style={{
                  width: `${confidence}%`,
                  background: needleColor,
                }}
              />
            </div>
            <span className="font-mono text-xs text-gray-300">{confidence}%</span>
          </div>
        </div>

        <div>
          <div className="text-[9px] uppercase tracking-[2px] text-[var(--text-muted)] font-display mb-1">
            Active Models
          </div>
          <div className="flex flex-wrap gap-1.5">
            {activeModels.map((m) => (
              <span
                key={m}
                className="font-mono text-[9px] px-2 py-0.5 rounded border border-[var(--border)] text-[var(--text-muted)]"
              >
                {m}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <VerdictBadge verdict="CLEAR" />
          <span className="font-mono text-[9px] text-[var(--text-dim)]">Verdict · All gates clear</span>
        </div>
      </div>
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: string }) {
  const cls =
    verdict === "CLEAR"
      ? "verdict-clear"
      : verdict === "CAUTION"
        ? "verdict-caution"
        : "verdict-blocked";
  return <span className={`verdict-badge ${cls}`}>{verdict}</span>;
}
