import React from "react";

interface Layer {
  name: string;
  value: number;   // 0-100
  weight: number;  // e.g. 3.0 for 1W
  status: "aligned" | "conflict" | "pending";
}

interface Props {
  layers: Layer[];
  pair: string;
  bias: "BULLISH" | "BEARISH";
}

const LAYER_COLORS: Record<string, string> = {
  aligned: "#39ff14",
  conflict: "#ff2d2d",
  pending: "#f0c040",
};

export default function LayerStack({ layers, pair, bias }: Props) {
  const bullishColor = "#39ff14";
  const bearishColor = "#ff2d2d";
  const accent = bias === "BULLISH" ? bullishColor : bearishColor;

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">Six-Layer Authority Stack</span>
        <span className="font-mono text-[9px]" style={{ color: accent }}>
          {pair} · {bias}
        </span>
      </div>
      <div className="panel-body p-0">
        {layers.map((layer) => {
          const barColor = LAYER_COLORS[layer.status];
          return (
            <div key={layer.name} className="signal-row px-4">
              <span className="signal-label">{layer.name}</span>
              <div className="signal-bar-track">
                <div
                  className="signal-bar-fill"
                  style={{ width: `${layer.value}%`, background: barColor }}
                />
              </div>
              <span
                className="signal-value"
                style={{ color: barColor }}
              >
                {layer.value}%
              </span>
              <span className="font-mono text-[9px] text-[var(--text-dim)] w-6 text-right">
                ×{layer.weight}
              </span>
            </div>
          );
        })}
      </div>
      <div className="px-4 pb-3">
        <div className="flex items-center justify-between text-[9px]">
          <span className="font-mono text-[var(--text-dim)] uppercase tracking-wider">
            Total Weight: {(layers as any[]).reduce((s: number, l: any) => s + l.weight, 0)} · Winning weight: {Math.round((layers as any[]).filter((l: any) => l.status === "aligned").reduce((s: number, l: any) => s + l.weight, 0) / (layers as any[]).reduce((s: number, l: any) => s + l.weight, 0) * 100)}%
          </span>
          <span className="font-mono text-[var(--text-dim)]">Inducement gate: swept</span>
        </div>
      </div>
    </div>
  );
}
