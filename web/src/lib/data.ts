/**
 * File reader utility for the SMC-ICM dashboard.
 * Reads stage outputs, engine reports, and shared data.
 */

// ── Stage Outputs ──────────────────────────────────────────────
// Stages output per-pair files: stages/{stage}/output/{pair}_*.md
export const STAGE_FILE_MAP: Record<string, string[]> = {
  "00_macro_context": [
    "eurusd_mmxm.md",
    "gbpusd_mmxm.md",
    "xauusd_mmxm.md",
    "nas100_mmxm.md",
    "dxy_mmxm.md",
  ],
  "00_council_vote": ["eurusd_narrative.md", "gbpusd_narrative.md", "xauusd_narrative.md"],
  "01_htf_bias": ["eurusd_bias.md", "gbpusd_bias.md", "xauusd_bias.md", "nas100_bias.md", "dxy_bias.md"],
  "02_key_levels": ["eurusd_liquidity.md", "eurusd_levels.md", "eurusd_order_flow.md"],
  "03_session_time": ["eurusd_session.md", "eurusd_opening_range.md"],
  "04_model_selection": ["eurusd_active_models.md", "gbpusd_active_models.md", "xauusd_active_models.md"],
  "05_entry_refinement": ["eurusd_entry_plan.md", "gbpusd_entry_plan.md", "xauusd_entry_plan.md"],
  "05b_micro_confirmation": ["eurusd_coherence.md", "eurusd_guard.md", "eurusd_inducement.md"],
  "06_risk_management": ["eurusd_risk_plan.md", "gbpusd_risk_plan.md", "xauusd_risk_plan.md"],
  "07_journal_review": ["eurusd_review.md", "gbpusd_review.md", "xauusd_review.md"],
};

/**
 * Get the main content file for a stage + pair combo.
 * Falls back to first available file if exact match missing.
 */
export async function readStageFile(stage: string, pair: string): Promise<string | null> {
  const pairLower = pair.toLowerCase();
  const files = STAGE_FILE_MAP[stage] || [];

  // Try exact match first
  for (const file of files) {
    if (file.startsWith(`${pairLower}_`)) {
      try {
        const res = await fetch(`/stages/${stage}/output/${file}`);
        if (res.ok) return await res.text();
      } catch {}
    }
  }

  // Fallback: try any file from this stage
  for (const file of files) {
    try {
      const res = await fetch(`/stages/${stage}/output/${file}`);
      if (res.ok) return await res.text();
    } catch {}
  }

  return null;
}

// ── Engine Reports ─────────────────────────────────────────────
export interface EngineReport {
  price: number;
  structure: {
    bias: string;
    confidence: number;
    lastEvent: string;
    lastSwingHigh: number;
    lastSwingLow: number;
  };
  liquidity: Array<{
    type: string;
    price: number;
    strength: number;
    swept: boolean;
  }>;
  fvgs: unknown[];
  orderBlocks: unknown[];
}

export async function readEngineReport(date: string, pair: string, tf = "1h"): Promise<EngineReport | null> {
  try {
    const res = await fetch(`/shared/${date}/${pair}/engine_${tf}.json`);
    if (res.ok) return await res.json();
  } catch {}
  return null;
}

// ── Risk State ─────────────────────────────────────────────────
export interface RiskState {
  balance: string;
  peakBalance: number;
  consecutiveLosses: number;
  consecutiveWins: number;
  lastUpdated: string;
}

export async function readRiskState(): Promise<RiskState | null> {
  try {
    const res = await fetch("/shared/risk_state.json");
    if (res.ok) return await res.json();
  } catch {}
  return null;
}

// ── Trade Log ──────────────────────────────────────────────────
export interface TradeEntry {
  pair: string;
  direction: string;
  pnl: number;
  model: string;
  session: string;
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  risk: number;
  rr: string;
  notes: string;
  date: string;
  status: string;
}

export async function readTradeLog(): Promise<TradeEntry[]> {
  try {
    const res = await fetch("/shared/trade_log.json");
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    }
  } catch {}
  return [];
}

// ── Date Discovery ─────────────────────────────────────────────
export async function discoverSharedDates(): Promise<string[]> {
  const dates: string[] = [];
  // Scan last 90 days from today
  const today = new Date();
  for (let offset = 0; offset < 90; offset++) {
    const d = new Date(today);
    d.setDate(d.getDate() - offset);
    const dateStr = d.toISOString().split("T")[0];
    try {
      const res = await fetch(`/shared/${dateStr}/EURUSD/engine_1h.json`);
      if (res.ok) {
        dates.push(dateStr);
        if (dates.length >= 5) return dates.sort().reverse();
      }
    } catch {}
  }
  return dates.sort().reverse();
}

// ── Operator Ledger ───────────────────────────────────────────
export interface LedgerEntry {
  ts: string;
  type: string;
  pair?: string;
  cycleId?: string;
  proposal?: Record<string, unknown>;
  reasons?: string[];
  verdict?: string;
  detail?: string;
  summary?: string;
  verified?: boolean;
}

export async function readOperatorLedger(date: string): Promise<LedgerEntry[]> {
  try {
    const res = await fetch(`/shared/${date}/operator_ledger.jsonl`);
    if (res.ok) {
      const text = await res.text();
      return text
        .split("\n")
        .filter(Boolean)
        .map((l) => { try { return JSON.parse(l) as LedgerEntry; } catch { return null; } })
        .filter(Boolean) as LedgerEntry[];
    }
  } catch {}
  return [];
}

// ── Market Brief ───────────────────────────────────────────────
export async function readMarketBrief(date: string, pair: string): Promise<string | null> {
  try {
    const res = await fetch(`/shared/${date}/${pair}/market_brief.md`);
    if (res.ok) return await res.text();
  } catch {}
  return null;
}
