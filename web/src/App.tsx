import React, { useEffect, useState } from "react";
import StageRail from "./components/StageRail";
import ContentPanel from "./components/ContentPanel";
import OperatorView from "./components/OperatorView";
import KPICards from "./components/KPICards";
import { readStageFile, discoverSharedDates, type TradeEntry } from "./lib/data";

const PAIRS = ["XAUUSD", "GBPUSD", "EURUSD", "NAS100", "USDOLLAR"];

const PAIR_META: Record<string, { color: string; risk: string }> = {
  XAUUSD:  { color: "#f0c040", risk: "Gold · High vol" },
  GBPUSD:  { color: "#00d4ff", risk: "Cable · Medium" },
  EURUSD:  { color: "#39ff14", risk: "Euro · Low spread" },
  NAS100:  { color: "#a855f7", risk: "Tech index" },
  USDOLLAR:{ color: "#6b7280", risk: "DXY inverse" },
};

const STAGES = [
  { id: "00_macro_context",   label: "Macro Context" },
  { id: "00_council_vote",    label: "Council Vote" },
  { id: "01_htf_bias",        label: "HTF Bias" },
  { id: "02_key_levels",      label: "Key Levels" },
  { id: "03_session_time",    label: "Session & Time" },
  { id: "04_model_selection", label: "Model Selection" },
  { id: "05_entry_refinement",label: "Entry Plan" },
  { id: "05b_micro_confirmation", label: "Micro Confirm" },
  { id: "06_risk_management", label: "Risk Mgmt" },
  { id: "07_journal_review",  label: "Journal" },
];

export default function App() {
  const [activePair, setActivePair] = useState("EURUSD");
  const [activeStage, setActiveStage] = useState("01_htf_bias");
  const [view, setView] = useState<"pipeline" | "operator">("pipeline");
  const [stagedData, setStagedData] = useState<Record<string, string>>({});
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [trades, setTrades] = useState<TradeEntry[]>([]);

  // Discover available dates
  useEffect(() => {
    discoverSharedDates().then((found) => {
      if (found.length > 0) {
        setDates(found);
        setSelectedDate(found[0]);
      } else {
        // Fallback to today
        setSelectedDate(new Date().toISOString().split("T")[0]);
      }
    });
  }, []);

  // Load trades
  useEffect(() => {
    import("./lib/data").then((m) => m.readTradeLog().then(setTrades));
  }, []);

  // Load stage content when pair/date changes
  useEffect(() => {
    if (!selectedDate) return;
    let cancelled = false;
    setLoading(true);

    async function load() {
      const results: Record<string, string> = {};
      for (const stage of STAGES) {
        const content = await readStageFile(stage.id, activePair);
        if (content && !cancelled) results[stage.id] = content;
      }
      if (!cancelled) {
        setStagedData(results);
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [activePair, selectedDate]);

  const loadedCount = Object.keys(stagedData).length;

  if (loading && Object.keys(stagedData).length === 0) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: "var(--bg-primary)" }}>
        <div className="text-center">
          <div className="font-mono text-xs uppercase tracking-widest text-[var(--text-dim)] mb-2">
            Loading workspace
          </div>
          <div className="flex gap-1 justify-center">
            {[0,1,2].map(i => (
              <div
                key={i}
                className="w-1 h-4 bg-cyan rounded-sm"
                style={{ animation: `bar 1s ease-in-out ${i * 0.15}s infinite`, opacity: 0.6 }}
              />
            ))}
          </div>
          <style>{`
            @keyframes bar {
              0%, 100% { transform: scaleY(0.4); opacity: 0.3; }
              50% { transform: scaleY(1); opacity: 1; }
            }
          `}</style>
        </div>
      </div>
    );
  }

  if (view === "operator") {
    return (
      <div className="flex flex-col h-screen" style={{ background: "var(--bg-primary)" }}>
        <Header
          activePair={activePair}
          pairMeta={PAIR_META[activePair]}
          onViewChange={setView}
          onPairChange={setActivePair}
          pairs={PAIRS}
          loadedCount={loadedCount}
          totalStages={STAGES.length}
          selectedDate={selectedDate}
          dates={dates}
          onDateChange={setSelectedDate}
          trades={trades}
        />
        <div className="flex-1 overflow-hidden">
          <OperatorView
            date={selectedDate}
            pairs={PAIRS}
            activePair={activePair}
            onBack={() => setView("pipeline")}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen" style={{ background: "var(--bg-primary)" }}>
      <Header
        activePair={activePair}
        pairMeta={PAIR_META[activePair]}
        onViewChange={setView}
        onPairChange={setActivePair}
        pairs={PAIRS}
        loadedCount={loadedCount}
        totalStages={STAGES.length}
        selectedDate={selectedDate}
        dates={dates}
        onDateChange={setSelectedDate}
        trades={trades}
      />
      <KPICards pair={activePair} date={selectedDate} />
      <div className="flex flex-1 overflow-hidden">
        <StageRail
          stages={STAGES}
          activeId={activeStage}
          data={stagedData}
          onSelect={(id) => setActiveStage(id)}
        />
        <main className="flex-1 overflow-hidden p-3">
          <ContentPanel
            stageId={activeStage}
            content={stagedData[activeStage] ?? null}
            pair={activePair}
            date={selectedDate}
          />
        </main>
      </div>
    </div>
  );
}

interface HeaderProps {
  activePair: string;
  pairMeta: { color: string; risk: string };
  onViewChange: (v: "pipeline" | "operator") => void;
  onPairChange: (p: string) => void;
  pairs: string[];
  loadedCount: number;
  totalStages: number;
  selectedDate: string;
  dates: string[];
  onDateChange: (d: string) => void;
  trades: TradeEntry[];
}

function Header({ activePair, pairMeta, onViewChange, onPairChange, pairs, loadedCount, totalStages, selectedDate, dates, onDateChange, trades }: HeaderProps) {
  const recentTrades = trades.filter((t) => t.date === selectedDate);

  return (
    <header className="header-bar">
      <div className="flex items-center gap-4">
        <div className="logo">
          SMC<span>-</span>ICM
        </div>

        {/* Pair selector */}
        <div className="flex items-center gap-1.5">
          {pairs.map((p) => (
            <button
              key={p}
              onClick={() => onPairChange(p)}
              className="pair-chip"
              style={{
                borderColor: PAIR_META[p]?.color || "var(--border)",
                color: activePair === p ? (PAIR_META[p]?.color || "var(--text-primary)") : (PAIR_META[p]?.color || "var(--text-muted)"),
                background: activePair === p ? `${PAIR_META[p]?.color || "var(--border)"}15` : "transparent",
              }}
              title={PAIR_META[p]?.risk}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Date selector */}
        <select
          value={selectedDate}
          onChange={(e) => onDateChange(e.target.value)}
          className="font-mono text-[10px] px-2 py-1 rounded border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-muted)] cursor-pointer"
          style={{ colorScheme: "dark" }}
        >
          {dates.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
          <option value={new Date().toISOString().split("T")[0]}>Today</option>
        </select>

        {/* View switch */}
        <div className="flex items-center gap-1 ml-2" style={{ borderLeft: "1px solid var(--border)", paddingLeft: "12px" }}>
          <button
            onClick={() => onViewChange("pipeline")}
            className="font-mono text-[10px] px-2.5 py-1 rounded"
            style={{
              background: "var(--bg-elevated)",
              color: "var(--text-primary)",
              border: "1px solid var(--accent-cyan)",
            }}
          >
            Pipeline
          </button>
          <button
            onClick={() => onViewChange("operator")}
            className="font-mono text-[10px] px-2.5 py-1 rounded"
            style={{
              background: "transparent",
              color: "var(--text-muted)",
              border: "1px solid var(--border)",
            }}
          >
            Operator
          </button>
        </div>
      </div>

      <div className="header-meta">
        <span className="flex items-center gap-1.5">
          <span className="live-dot" />
          TV CDP LIVE
        </span>
        <span>{activePair} · {selectedDate}</span>
        <span>{loadedCount}/{totalStages} stages</span>
        {recentTrades.length > 0 && (
          <span className="text-bull">· {recentTrades.length} trade{recentTrades.length > 1 ? "s" : ""}</span>
        )}
        <span>{new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
      </div>
    </header>
  );
}
