import React from "react";

const STAGE_LABELS: Record<string, string> = {
  "01_htf_bias": "HTF Bias",
  "02_key_levels": "Key Levels",
  "03_session_time": "Session & Time",
  "04_model_selection": "Model Selection",
  "05_entry_refinement": "Entry Refinement",
  "06_risk_management": "Risk Management",
  "07_journal_review": "Journal Review",
};

interface Props {
  stages: string[];
  activeStage: number;
  data: Record<string, string>;
  onSelect: (index: number) => void;
}

export default function StageTimeline({ stages, activeStage, data, onSelect }: Props) {
  return (
    <nav className="w-64 border-r border-gray-800 bg-gray-900 p-4 flex flex-col gap-1">
      <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
        Stages
      </h2>
      {stages.map((stage, i) => {
        const hasData = !!data[stage];
        const isActive = i === activeStage;
        return (
          <button
            key={stage}
            onClick={() => onSelect(i)}
            className={`text-left px-3 py-2 rounded-lg text-sm transition-colors ${
              isActive
                ? "bg-blue-600 text-white"
                : hasData
                  ? "text-gray-300 hover:bg-gray-800"
                  : "text-gray-600 hover:bg-gray-800/50"
            }`}
          >
            <span className="text-xs text-gray-500 mr-2">
              {hasData ? "✓" : "○"}
            </span>
            {STAGE_LABELS[stage] ?? stage}
          </button>
        );
      })}
    </nav>
  );
}
