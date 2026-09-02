import React, { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { readStageFile, type LedgerEntry, readOperatorLedger, readMarketBrief } from "../lib/data";

interface Props {
  stageId: string;
  content: string | null;
  pair: string;
  date: string;
}

const STAGE_LABELS: Record<string, string> = {
  "00_macro_context": "Macro Context",
  "00_council_vote": "Council Vote",
  "01_htf_bias": "HTF Bias",
  "02_key_levels": "Key Levels",
  "03_session_time": "Session & Time",
  "04_model_selection": "Model Selection",
  "05_entry_refinement": "Entry Plan",
  "05b_micro_confirmation": "Micro Confirm",
  "06_risk_management": "Risk Mgmt",
  "07_journal_review": "Journal",
};

// Extract entry plan data from markdown content
function extractEntryPlan(content: string) {
  const lines = content.split("\n");
  const plan: Record<string, string> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("## Model:")) {
      plan.model = trimmed.replace("## Model:", "").replace(/\*\*/g, "");
    }
    if (trimmed.match(/Direction[":\s]*[A-Z]/)) {
      const m = trimmed.match(/[A-Z]{3,}/);
      if (m) plan.direction = m[0];
    }
    if (trimmed.startsWith("| Entry |")) {
      const parts = trimmed.split("|").map((s) => s.trim());
      if (parts[2]) plan.entry = parts[2];
      if (parts[3]) plan.sl = parts[3];
    }
    if (trimmed.startsWith("## R:R")) {
      const m = trimmed.match(/(\d+:?\d*)/);
      if (m) plan.rr = m[1];
    }
  }
  return plan;
}

export default function ContentPanel({ stageId, content, pair, date }: Props) {
  const [entryPlan, setEntryPlan] = useState<Record<string, string>>({});

  useEffect(() => {
    if (content) {
      setEntryPlan(extractEntryPlan(content));
    }
  }, [content]);

  if (!content) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--text-dim)] gap-3">
        <div className="font-mono text-xs uppercase tracking-widest">No data loaded</div>
        <div className="text-[10px] text-center">
          Run <code className="text-cyan">node tools/run_pair.cjs {pair}</code>
          <br />
          to generate stage outputs
        </div>
        <div className="w-24 h-px bg-[var(--border)]" />
        <div className="font-mono text-[9px]">{STAGE_LABELS[stageId] ?? stageId}</div>
      </div>
    );
  }

  const isNoTrade = content.includes("NO TRADE") || content.includes("NO_TRADE");
  const hasEntryPlan = Object.keys(entryPlan).length > 0;

  return (
    <div className="flex flex-col gap-3 h-full overflow-hidden">
      {/* Verdict banner */}
      <div
        className={`rounded px-3 py-2 font-mono text-[10px] flex items-center gap-2 ${
          isNoTrade
            ? "bg-red-950/30 border border-red-900/50 text-bear"
            : hasEntryPlan
              ? "bg-emerald-950/30 border border-emerald-900/50 text-emerald-400"
              : "bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-muted)]"
        }`}
      >
        <span>{isNoTrade ? "⛔" : hasEntryPlan ? "✓" : "○"}</span>
        <span className="uppercase tracking-wider">
          {isNoTrade ? "No Trade" : hasEntryPlan ? "Setup Found" : "Awaiting Data"}
        </span>
        <span className="text-[var(--text-dim)] ml-auto">{pair} · {date}</span>
      </div>

      {/* Entry plan card (if available) */}
      {hasEntryPlan && (
        <div
          className={`entry-plan ${
            entryPlan.direction === "BULLISH"
              ? "bullish"
              : entryPlan.direction === "BEARISH"
                ? "bearish"
                : ""
          }`}
        >
          <div className="entry-plan-title">
            Entry Plan · {entryPlan.model || "Awaiting Model"}
          </div>
          <div className="entry-plan-grid">
            <div className="entry-plan-item">
              <span className="entry-plan-key">Direction</span>
              <span
                className="entry-plan-val"
                style={{
                  color:
                    entryPlan.direction === "BULLISH"
                      ? "#39ff14"
                      : entryPlan.direction === "BEARISH"
                        ? "#ff2d2d"
                        : "#e8eaed",
                }}
              >
                {entryPlan.direction || "—"}
              </span>
            </div>
            {entryPlan.entry && (
              <div className="entry-plan-item">
                <span className="entry-plan-key">Entry</span>
                <span className="entry-plan-val">{entryPlan.entry}</span>
              </div>
            )}
            {entryPlan.sl && (
              <div className="entry-plan-item">
                <span className="entry-plan-key">Stop Loss</span>
                <span className="entry-plan-val" style={{ color: "#ff2d2d" }}>
                  {entryPlan.sl}
                </span>
              </div>
            )}
            {entryPlan.rr && (
              <div className="entry-plan-item">
                <span className="entry-plan-key">R:R</span>
                <span className="entry-plan-val text-cyan">{entryPlan.rr}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stage content */}
      <div className="panel flex-1 overflow-hidden flex flex-col min-h-0">
        <div className="panel-header">
          <span className="panel-title">{STAGE_LABELS[stageId] ?? stageId}</span>
          <span className="font-mono text-[9px] text-[var(--text-dim)]">
            stages/{stageId}/output/{pair.toLowerCase()}_*.md
          </span>
        </div>
        <div className="panel-body instrument-prose overflow-y-auto flex-1">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
