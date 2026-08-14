import React, { useEffect, useState } from "react";

interface LedgerEntry {
  ts: string;
  type: string;
  pair?: string | null;
  cycleId?: string | null;
  proposal?: Record<string, unknown>;
  reasons?: string[];
  verdict?: string;
  detail?: string;
  summary?: string;
  chars?: number;
  verified?: boolean;
  [key: string]: unknown;
}

interface Props {
  date: string;
  pairs: string[];
}

const PAIR_COLORS: Record<string, string> = {
  XAUUSD: "text-yellow-400 border-yellow-400/40",
  GBPUSD: "text-blue-400 border-blue-400/40",
  EURUSD: "text-cyan-400 border-cyan-400/40",
  NAS100: "text-purple-400 border-purple-400/40",
  USDOLLAR: "text-green-400 border-green-400/40",
};

function typeBadge(type: string): string {
  switch (type) {
    case "cycle_start": return "bg-gray-700 text-gray-200";
    case "brief": return "bg-sky-900/60 text-sky-300";
    case "proposal": return "bg-indigo-900/60 text-indigo-300";
    case "gate": return "bg-amber-900/60 text-amber-300";
    case "execution": return "bg-green-900/60 text-green-300";
    case "verification": return "bg-teal-900/60 text-teal-300";
    case "journal": return "bg-gray-800 text-gray-300";
    case "error": return "bg-red-900/60 text-red-300";
    default: return "bg-gray-700 text-gray-300";
  }
}

function proposalSummary(e: LedgerEntry): string {
  const p = (e.proposal || {}) as Record<string, unknown>;
  if (p.action === "NO_TRADE") return `NO_TRADE — ${p.verdict || p.evidence || ""}`;
  if (p.action === "TRADE") {
    return `${p.side} @ ${p.entry} | SL ${p.sl} | TP ${p.tp} | ${p.model} | conf ${p.confidence}`;
  }
  return JSON.stringify(p).slice(0, 160);
}

function renderEntry(e: LedgerEntry): string {
  switch (e.type) {
    case "proposal": return proposalSummary(e);
    case "gate":
      return `${e.verdict}${e.reasons?.length ? ` — ${e.reasons.join("; ")}` : ""}`;
    case "journal": return e.summary || e.verdict || "";
    case "execution": return e.detail || e.status || "";
    case "verification": return e.verified ? "CONFIRMED" : `NOT FOUND — ${e.detail || ""}`;
    default: return String(e.detail || e.message || e.reason || e.summary || "");
  }
}

export default function OperatorView({ date, pairs }: Props) {
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [activePair, setActivePair] = useState<string>(pairs[0]);
  const [brief, setBrief] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/shared/${date}/operator_ledger.jsonl`);
        if (res.ok) {
          const text = await res.text();
          const entries = text
            .split("\n")
            .filter(Boolean)
            .map((l) => {
              try { return JSON.parse(l) as LedgerEntry; } catch { return null; }
            })
            .filter(Boolean) as LedgerEntry[];
          if (!cancelled) setLedger(entries);
        }
      } catch {}
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [date]);

  useEffect(() => {
    let cancelled = false;
    async function loadBrief() {
      const res = await fetch(`/shared/${date}/${activePair}/market_brief.md`);
      if (res.ok) {
        const text = await res.text();
        if (!cancelled) setBrief(text);
      }
    }
    loadBrief();
    return () => { cancelled = true; };
  }, [date, activePair]);

  const cycles = Array.from(new Set(ledger.map((e) => e.cycleId).filter(Boolean))).reverse();

  return (
    <div className="flex h-full">
      {/* Ledger timeline */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-100">
              Operator Ledger <span className="text-sm font-normal text-gray-500">— {date}</span>
            </h2>
            <span className="text-xs text-gray-500">{ledger.length} entries · {cycles.length} cycles</span>
          </div>

          {cycles.length === 0 && !loading && (
            <div className="text-center py-16 text-gray-600">
              <p className="text-lg">No operator activity today</p>
              <p className="text-sm mt-2">
                Run: <code className="text-gray-400">node tools/llm/operator_loop.cjs --all --cycle</code>
              </p>
            </div>
          )}

          {cycles.map((cycleId) => {
            const cycleEntries = ledger.filter((e) => e.cycleId === cycleId);
            return (
              <div key={cycleId} className="mb-6 rounded-lg border border-gray-800 overflow-hidden">
                <div className="bg-gray-900 px-4 py-2 text-xs font-mono text-gray-400 border-b border-gray-800">
                  {cycleId}
                </div>
                <div className="divide-y divide-gray-800/70">
                  {cycleEntries.map((e, i) => (
                    <div key={i} className="px-4 py-2 flex items-start gap-3">
                      <span className="font-mono text-xs text-gray-600 mt-0.5 shrink-0">
                        {(e.ts || "").slice(11, 19)}
                      </span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${typeBadge(e.type)}`}>
                        {e.type.toUpperCase()}
                      </span>
                      {e.pair && (
                        <span className={`text-xs border px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${PAIR_COLORS[e.pair] || "text-gray-400 border-gray-500/40"}`}>
                          {e.pair}
                        </span>
                      )}
                      <div className="text-sm text-gray-300 leading-snug min-w-0 break-words">
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

      {/* Brief viewer */}
      <aside className="w-1/2 border-l border-gray-800 overflow-y-auto p-4">
        <div className="mb-3 flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mr-2">
            Market Brief
          </h3>
          {pairs.map((p) => (
            <button
              key={p}
              onClick={() => setActivePair(p)}
              className={`text-xs px-2 py-1 rounded border ${
                activePair === p
                  ? `${PAIR_COLORS[p] || "text-gray-200 border-gray-500"} bg-gray-800`
                  : "text-gray-500 border-gray-700 hover:text-gray-300"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        {brief ? (
          <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
            {brief}
          </pre>
        ) : (
          <div className="text-sm text-gray-600">No market brief for {activePair} — run a cycle first.</div>
        )}
      </aside>
    </div>
  );
}
