// cycle_state.cjs — per-cycle state for the autonomous operator loop
//
// Persists state between LLM calls so the operator learns from its own history:
//   - lastProposal      : what was proposed last cycle (null if NO_TRADE)
//   - lastRejection     : why it was blocked (gate reasons joined)
//   - consecutiveNoTrade: count of back-to-back NO_TRADE/MONITOR cycles
//   - executionAttempts : how many times we tried and failed to place
//   - missedSetup       : a setup that looked valid but time/window expired
//   - priceDrift        : % price move since last cycle checked this pair
//   - updatedAt         : ISO timestamp of last save
//
// State is keyed by pair inside a per-date JSON file at:
//   shared/<DATE>/cycle_state.json
//
// Usage:
//   const { load, save, briefContext } = require("./cycle_state.cjs");
//   const state = load("EURUSD");                       // current state
//   save("EURUSD", { consecutiveNoTrade: 3 });          // update fields
//   const ctx = briefContext("EURUSD");                 // injectable text

const fs = require("fs");
const path = require("path");
const { getNYDate } = require("../ny_time.cjs");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..", "..");

function statePath(date) {
  return path.join(ROOT, "shared", date || getNYDate(), "cycle_state.json");
}

/**
 * Load cycle state for one pair. Returns null if never seen.
 */
function load(pair, date) {
  try {
    const all = JSON.parse(fs.readFileSync(statePath(date), "utf8"));
    return all[pair] ?? null;
  } catch {
    return null;
  }
}

/**
 * Save (merge) fields into cycle state for one pair. Uses atomic tmp+rename.
 */
function save(pair, fields, date) {
  const p = statePath(date);
  let all = {};
  try { all = JSON.parse(fs.readFileSync(p, "utf8")); } catch {}
  all[pair] = { ...all[pair], ...fields, updatedAt: new Date().toISOString() };
  const tmp = p + ".tmp";
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(all, null, 2));
  fs.renameSync(tmp, p);
}

/**
 * Compute price drift between this cycle's last candle close and the prior cycle's.
 * Returns null if either side unavailable.
 */
function computePriceDrift(pair, candles, prevClose) {
  if (!candles || !Array.isArray(candles) || candles.length === 0) return null;
  if (prevClose == null || prevClose <= 0) return null;
  const last = candles[candles.length - 1];
  const drift = (last.close - prevClose) / prevClose;
  return drift;
}

/**
 * Format as injectable text for the LLM user message.
 * Returns empty string when no state exists.
 */
function briefContext(pair, state) {
  if (!state) return "";
  const lines = [];
  if (state.lastProposal) {
    const p = state.lastProposal;
    lines.push(
      `- Last cycle proposed: ${p.action} ${p.side ?? ""} @ ${p.entry} model="${p.model}" —`,
      `  ${state.lastRejection || "executed"}`
    );
  }
  if (state.consecutiveNoTrade > 0) {
    lines.push(`- ⏸ ${state.consecutiveNoTrade} consecutive NO_TRADE/MONITOR cycles`);
  }
  if (state.executionAttempts > 0) {
    lines.push(`- 🔁 ${state.executionAttempts} execution failure(s) — consider backoff`);
  }
  if (state.missedSetup) {
    const m = state.missedSetup;
    lines.push(`- ⏳ Previously-missed setup still fresh: ${m.model} ${m.side} @ ${m.entry} (missed: ${m.reason})`);
  }
  if (state.priceDrift != null) {
    lines.push(`- 📈 Price drift since last check: ${(state.priceDrift * 100).toFixed(2)}%`);
  }
  if (lines.length === 0) return "";
  return "\n## RECENT CYCLE CONTEXT\n" + lines.join("\n") + "\n";
}

module.exports = { load, save, computePriceDrift, briefContext };
