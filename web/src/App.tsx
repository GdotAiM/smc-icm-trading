import React, { useEffect, useState } from "react";
import StageTimeline from "./components/StageTimeline";
import MarkdownViewer from "./components/MarkdownViewer";
import BiasGauge from "./components/BiasGauge";
import OperatorView from "./components/OperatorView";
import type { SessionData } from "./lib/fileReader";

const OPERATOR_PAIRS = ["XAUUSD", "GBPUSD", "EURUSD", "NAS100", "USDOLLAR"];

const STAGES = [
  "01_htf_bias",
  "02_key_levels",
  "03_session_time",
  "04_model_selection",
  "05_entry_refinement",
  "06_risk_management",
  "07_journal_review",
];

export default function App() {
  const [activeStage, setActiveStage] = useState(0);
  const [view, setView] = useState<"pipeline" | "operator">("pipeline");
  const [data, setData] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // In production, this would read from the filesystem via API.
    // For the ICM architecture, the dashboard reads markdown files directly.
    // The web server (Vite dev) serves files from the parent directory.
    async function loadStage(stage: string) {
      try {
        const res = await fetch(`/stages/${stage}/output/bias.md`);
        if (res.ok) return await res.text();
      } catch {}
      return null;
    }

    async function loadAll() {
      const results: Record<string, string> = {};
      for (const stage of STAGES) {
        const content = await loadStage(stage);
        if (content) results[stage] = content;
      }
      setData(results);
      setLoading(false);
    }

    loadAll();
  }, []);

  const currentStage = STAGES[activeStage];
  const currentContent = data[currentStage];

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950">
        <div className="text-gray-500">Loading session data...</div>
      </div>
    );
  }

  if (view === "operator") {
    return (
      <div className="flex h-screen flex-col bg-gray-950">
        <div className="flex items-center justify-between border-b border-gray-800 px-6 py-3">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-bold text-gray-100">SMC-ICM</h1>
            <nav className="flex gap-1">
              <button
                onClick={() => setView("pipeline")}
                className="px-3 py-1.5 rounded text-sm text-gray-400 hover:text-gray-200"
              >
                Pipeline
              </button>
              <button
                onClick={() => setView("operator")}
                className="px-3 py-1.5 rounded text-sm bg-gray-800 text-gray-100"
              >
                Operator
              </button>
            </nav>
          </div>
          <span className="text-xs text-gray-500">Agent ledger + market brief</span>
        </div>
        <div className="flex-1 overflow-hidden">
          <OperatorView date={new Date().toISOString().split("T")[0]} pairs={OPERATOR_PAIRS} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-950">
      {/* Left sidebar — stage timeline */}
      <StageTimeline
        stages={STAGES}
        activeStage={activeStage}
        data={data}
        onSelect={setActiveStage}
      />

      {/* Center — stage output */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">
          <div className="mb-6 flex items-center justify-between">
            <BiasGauge />
            <button
              onClick={() => setView("operator")}
              className="text-xs px-2.5 py-1.5 rounded border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500"
            >
              View Operator →
            </button>
          </div>
          {currentContent ? (
            <MarkdownViewer content={currentContent} />
          ) : (
            <div className="text-center py-20 text-gray-600">
              <p className="text-lg">No data for {currentStage.replace(/_/g, " ")}</p>
              <p className="text-sm mt-2">
                Run the stage with Claude Code to generate output.
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Right panel — quick info */}
      <aside className="w-72 border-l border-gray-800 p-4 overflow-y-auto">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Session Info
        </h3>
        <div className="text-sm text-gray-500 space-y-2">
          <p>Date: {new Date().toISOString().split("T")[0]}</p>
          <p>Stages complete: {Object.keys(data).length} / 7</p>
          <p className="text-xs text-gray-600 mt-4">
            Files are read from the stages/*/output/ folders.
            Run Claude Code to populate.
          </p>
        </div>
      </aside>
    </div>
  );
}
