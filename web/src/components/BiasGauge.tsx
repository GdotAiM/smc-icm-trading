import React from "react";

export default function BiasGauge() {
  // In production, this reads from stages/01_htf_bias/output/bias.md
  // For now, it's a static placeholder
  return (
    <div className="flex items-center gap-4 p-4 bg-gray-900 rounded-lg border border-gray-800">
      <div className="flex-1">
        <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">
          Structural Bias
        </div>
        <div className="text-lg font-bold text-green-400">BULLISH</div>
        <div className="text-xs text-gray-600">Confidence: High · D1/4H Aligned</div>
      </div>
      <div className="text-right">
        <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">
          Active Model
        </div>
        <div className="text-sm font-medium text-gray-300">2022 Model (MMXM)</div>
        <div className="text-xs text-gray-600">Confluence: 7/9</div>
      </div>
    </div>
  );
}
