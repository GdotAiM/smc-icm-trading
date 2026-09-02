import React, { useEffect, useState } from "react";
import { readOperatorLedger, readMarketBrief, type LedgerEntry } from "../lib/data";

interface Props {
  date: string;
  pairs: string[];
  activePair: string;
  onBack: () => void;
}

const PAIR_COLORS: Record<string, string> = {
  XAUUSD: "#f0c040",
  GBPUSD: "#00d4ff",
  EURUSD: "#39ff14",
  NAS100: "#a855f7",
  USDOLLAR: "#6b7280",
};

const TYPE_STYLES: Record<string, string> = {
  cycle_start: "bg-[var(--bg-elevated)] text-[var(--text-muted)] border border-[var(--border)]",
  brief:       "bg-sky-950/40 text-sky-400 border border-sky-900/50",
  proposal:    "bg-indigo-950/40 text-indigo-400 border border-indigo-900/50",
  gate:        "bg-amber-950/40 text-amber-400 border border-amber-900/50",
  execution:   "bg-emerald-950/40 text-emerald-400 border border-emerald-900/50",
  verification:"bg-teal-950/40 text-teal-400 border border-teal-900/50",
  journal:     "bg-[var(--bg-elevated)] text-[var(--text-dim)] border border-[var(--border)]",
  error:       "bg-red-950/40 text-red-400 border border-red-900/50",
};

function proposalSummary(e: LedgerEntry): string {
  const p = (e.proposal || {}) as Record<string, unknown>;
  if (p.action === "NO_TRADE") return `NO_TRADE — ${p.verdict || p.evidence || ""}`;
  if (p.action === "TRADE") {
    return `${p.side} @ ${p.entry} · SL ${p.sl} · TP ${p.tp} · ${(p.confidence as number)?.toFixed(0)}% conf`;
  }
  return JSON.stringify(p).slice(0, 160);
}

function renderEntry(e: LedgerEntry): string {
  switch (e.type) {
    case "proposal": return proposalSummary(e);
    case "gate":
      return `${e.verdict}${e.reasons?.length ? ` · ${e.reasons.join(" · ")}` : ""}`;
    case "journal": return e.summary || e.verdict || "";
    case "execution": return e.detail || e.status || "";
    case "verification": return e.verified ? "CONFIRMED" : `NOT FOUND — ${e.detail || ""}`;
    default: return String(e.detail || e.message || e.reason || e.summary || "");
  }
}

export default function OperatorView({ date, pairs, activePair: propActivePair, onBack }: Props) {
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [activePair, setActivePair] = useState(propActivePair);
  const [brief, setBrief] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    readOperatorLedger(date).then((entries) => {
      if (!cancelled) {
        setLedger(entries);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [date]);

  useEffect(() => {
    let cancelled = false;
    readMarketBrief(date, activePair).then((text) => {
      if (!cancelled && text) setBrief(text);
    });
    return () => { cancelled = true; };
  }, [date, activePair]);

  const cycles = Array.from(new Set(ledger.map((e) => e.cycleId).filter(Boolean))).reverse();

  return (
    <div className="flex h-full gap-0">
      {/* Ledger */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-3xl mx-auto">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={onBack}
                className="font-mono text-[10px] px-2 py-1 rounded border border-[var(--border)] text-[var(--text-muted)] hover:text-white hover:border-[var(--accent-cyan)] transition-colors"
              >
                ← Pipeline
              </button>
              <h2 className="font-display text-sm font-semibold text-gray-100 uppercase tracking-widest">
                Operator Ledger
              </h2>
              <span className="font-mono text-[10px] text-[var(--text-dim)]">{date}</span>
            </div>
            <span className="font-mono text-[9px] text-[var(--text-dim)]">
              {ledger.length} entries · {cycles.length} cycles
            </span>
          </div>

          {cycles.length === 0 && !loading && (
            <div className="text-center py-20">
              <div className="font-mono text-xs uppercase tracking-widest text-[var(--text-dim)] mb-2">
                No operator activity today
              </div>
              <div className="font-mono text-[10px] text-[var(--text-dim)]">
                Run: <code className="text-cyan">node tools/llm/operator_loop.cjs --all --cycle</code>
              </div>
            </div>
          )}

          {cycles.map((cycleId) => {
            const cycleEntries = ledger.filter((e) => e.cycleId === cycleId);
            return (
              <div key={cycleId} className="mb-4 border border-[var(--border)] rounded overflow-hidden">
                <div className="bg-[var(--bg-elevated)] px-3 py-1.5 font-mono text-[9px] text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border)] flex items-center justify-between">
                  <span>{cycleId}</span>
                  <span className="text-[var(--text-dim)]">{cycleEntries.length} entries</span>
                </div>
                <div className="divide-y divide-[var(--border)]">
                  {cycleEntries.map((e, i) => (
                    <div key={i} className="px-3 py-2 flex items-start gap-3 hover:bg-[var(--bg-elevated)]/50 transition-colors">
                      <span className="font-mono text-[9px] text-[var(--text-dim)] mt-0.5 shrink-0">
                        {(e.ts || "").slice(11, 19)}
                      </span>
                      <span className={`text-[8px] font-semibold px-1.5 py-0.5 rounded shrink-0 mt-0.5 font-mono uppercase tracking-wide border ${TYPE_STYLES[e.type] || TYPE_STYLES.error}`}>
                        {e.type}
                      </span>
                      {e.pair && (
                        <span
                          className="font-mono text-[9px] px-1.5 py-0.5 rounded border shrink-0 mt-0.5"
                          style={{ color: PAIR_COLORS[e.pair] || "var(--text-muted)", borderColor: (PAIR_COLORS[e.pair] || "var(--border)") + "40" }}
                        >
                          {e.pair}
                        </span>
                      )}
                      <div className="font-mono text-[11px] text-gray-300 leading-relaxed min-w-0 break-words">
                        {renderEntry(e)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Brief panel */}
      <aside className="w-96 border-l border-[var(--border)] overflow-y-auto bg-[var(--bg-surface)]">
        <div className="p-3 border-b border-[var(--border)]">
          <div className="font-display text-[9px] font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-2">
            Market Brief
          </div>
          <div className="flex flex-wrap gap-1.5">
            {pairs.map((p) => (
              <button
                key={p}
                onClick={() => setActivePair(p)}
                className="font-mono text-[9px] px-2 py-1 rounded border transition-all"
                style={{
                  color: activePair === p ? (PAIR_COLORS[p] || "var(--text-primary)") : "var(--text-dim)",
                  borderColor: activePair === p ? ((PAIR_COLORS[p] || "var(--border)") + "80") : "var(--border)",
                  background: activePair === p ? `${PAIR_COLORS[p] || "var(--bg-elevated)"}15` : "transparent",
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="p-3">
          {brief ? (
            <pre className="font-mono text-[10px] text-gray-300 whitespace-pre-wrap leading-relaxed">
              {brief}
            </pre>
          ) : (
            <div className="font-mono text-[10px] text-[var(--text-dim)] text-center py-8">
              No market brief for {activePair}
              <br /><br />
              Run a cycle first.
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
