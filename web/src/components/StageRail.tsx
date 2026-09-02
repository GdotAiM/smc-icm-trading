import React from "react";

interface StageDef {
  id: string;
  label: string;
}

interface Props {
  stages: StageDef[];
  activeId: string;
  data: Record<string, string>;
  onSelect: (id: string) => void;
}

export default function StageRail({ stages, activeId, data, onSelect }: Props) {
  return (
    <nav className="w-52 shrink-0 border-r border-[var(--border)] bg-[var(--bg-surface)] flex flex-col">
      <div className="px-3 py-2.5 border-b border-[var(--border)]">
        <div className="font-mono text-[9px] uppercase tracking-[3px] text-[var(--text-dim)]">
          Pipeline
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {stages.map((stage) => {
          const hasData = !!data[stage.id];
          const isActive = stage.id === activeId;
          return (
            <div
              key={stage.id}
              onClick={() => onSelect(stage.id)}
              className={`stage-item ${isActive ? "active" : ""}`}
            >
              <span className="stage-num">{stage.id.split("_")[0]}</span>
              <div className="stage-info">
                <div className="stage-name truncate">{stage.label}</div>
                <div className="stage-meta">
                  {hasData ? (
                    <span className="text-emerald-500">loaded</span>
                  ) : (
                    <span className="text-[var(--text-dim)]">empty</span>
                  )}
                </div>
              </div>
              <span
                className={`stage-status ${hasData ? "verdict-clear" : "verdict-blocked"}`}
              >
                {hasData ? "✓" : "○"}
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer info */}
      <div className="px-3 py-2.5 border-t border-[var(--border)]">
        <div className="font-mono text-[8px] text-[var(--text-dim)] leading-relaxed">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="live-dot" />
            <span>TV CDP CONNECTED</span>
          </div>
          <div>Run: node tools/run_pair.cjs</div>
        </div>
      </div>
    </nav>
  );
}
