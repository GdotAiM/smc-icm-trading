// ledger.cjs — PHASE 3: append-only decision ledger (proof of work)
//
// Every action the autonomous operator takes is appended here as a typed,
// timestamped JSONL record. This is the tape the owner reviews: what the LLM
// perceived, what it proposed, what the deterministic gate decided, what was
// executed, and what was verified. Nothing is mutated — only appended.
//
// Files:
//   shared/<DATE>/operator_ledger.jsonl   — machine-readable tape (one JSON per line)
//   shared/<DATE>/<PAIR>/operator_trace.md — human-readable digest per pair
//
// Usage (CLI):
//   node tools/llm/ledger.cjs --dump [DATE]          # print ledger tail
//   node tools/llm/ledger.cjs --trace EURUSD [DATE]  # print pair digest
//
// Programmatic:
//   const { append, load, tracePair } = require("./ledger.cjs");
//   await append("proposal", { pair: "EURUSD", proposal: {...}, cycleId });

const path = require("path");
const fs = require("fs");
const { getNYDate } = require("../ny_time.cjs");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..", "..");

// ── Core append ────────────────────────────────────────────────────────────────

/**
 * Append one entry to the ledger. Async (atomic file append).
 * @param {string}   type   - entry type: cycle_start|brief|proposal|gate|execution|verification|journal|error|meta
 * @param {Object}   data   - entry payload (pair, cycleId, and typed fields)
 * @param {Object}   [opts] - { date, root }
 * @returns {Promise<Object>} the stored entry
 */
async function append(type, data = {}, opts = {}) {
  const date = opts.date || getNYDate();
  const root = opts.root || ROOT;
  const dir = path.join(root, "shared", date);
  const file = path.join(dir, "operator_ledger.jsonl");
  fs.mkdirSync(dir, { recursive: true });

  const entry = {
    ts: new Date().toISOString(),
    date,
    type,
    pair: data.pair ? String(data.pair).toUpperCase() : null,
    cycleId: data.cycleId || null,
    ...data,
  };
  delete entry.date;

  await fs.promises.appendFile(file, JSON.stringify(entry) + "\n", "utf8");
  return entry;
}

// ── Read / query ───────────────────────────────────────────────────────────────

function load(date, root = ROOT) {
  const d = date || getNYDate();
  const file = path.join(root, "shared", d, "operator_ledger.jsonl");
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
  const entries = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line));
    } catch (_) {
      /* skip corrupt line */
    }
  }
  return entries;
}

function entriesFor(entries, type) {
  return entries.filter((e) => e.type === type);
}

// ── Human-readable digest ──────────────────────────────────────────────────────

function formatEntry(e) {
  const t = (e.ts || "").slice(11, 19);
  const head = `[${t}] ${e.type.toUpperCase()}${e.pair ? " " + e.pair : ""}${e.cycleId ? " (cycle " + e.cycleId + ")" : ""}`;
  if (e.type === "cycle_start") return `${head}\n  → ${e.reason || e.summary || ""}`;
  if (e.type === "brief") return `${head} — ${e.chars ?? "?"} chars, ${e.path || ""}`;
  if (e.type === "proposal") {
    const p = e.proposal || {};
    return `${head}\n  → ${p.action === "NO_TRADE" ? "NO TRADE — " + (p.reason || "") : (p.side || "?") + " " + e.pair + " @ " + (p.entry ?? "?") + " SL " + (p.sl ?? "?") + " TP " + (p.tp ?? "?") + " | " + (p.model || "?") + " | R:R " + (p.rr || "?")}`;
  }
  if (e.type === "gate") return `${head} → ${e.verdict}${e.reasons && e.reasons.length ? " — " + e.reasons.join("; ") : ""}`;
  if (e.type === "execution") return `${head} → ${e.status}${e.orderId ? " order=" + e.orderId : ""}${e.detail ? " | " + e.detail : ""}`;
  if (e.type === "verification") return `${head} → ${e.verified ? "CONFIRMED" : "NOT FOUND"}${e.verified ? "" : " | " + (e.detail || "")}`;
  if (e.type === "journal") return `${head} → ${e.summary || e.verdict || ""}`;
  if (e.type === "error") return `${head} → ${e.message || ""}`;
  return `${head} → ${JSON.stringify(Object.fromEntries(Object.entries(e).filter(([k]) => !["ts", "type", "pair", "cycleId", "date"].includes(k)))).slice(0, 300)}`;
}

/**
 * Build a per-pair human-readable digest and write it to
 * shared/<DATE>/<PAIR>/operator_trace.md. Returns the markdown.
 */
function tracePair(pair, date, root = ROOT) {
  const P = String(pair || "").toUpperCase();
  const d = date || getNYDate();
  const entries = load(d, root).filter((e) => !e.pair || e.pair === P);
  const lines = [];
  lines.push(`# Operator Trace — ${P} — ${d}`);
  lines.push(`_${entries.length} ledger entries_`);
  lines.push("");
  let lastCycle = null;
  for (const e of entries) {
    if (e.cycleId && e.cycleId !== lastCycle) {
      lines.push(`## Cycle ${e.cycleId}`);
      lastCycle = e.cycleId;
    }
    lines.push(formatEntry(e));
    lines.push("");
  }
  const md = lines.join("\n");
  try {
    const pairDir = path.join(root, "shared", d, P);
    fs.mkdirSync(pairDir, { recursive: true });
    fs.writeFileSync(path.join(pairDir, "operator_trace.md"), md, "utf8");
  } catch (_) {}
  return md;
}

function dump(date, root = ROOT, limit = 50) {
  const entries = load(date, root);
  return entries.slice(-limit).map(formatEntry).join("\n");
}

// ── CLI ────────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const mode = args[0];
  const flag = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);

  if (mode === "--dump") {
    const date = flag("--date") || getNYDate();
    console.log(dump(date));
    return;
  }
  if (mode === "--trace") {
    const pair = (args[1] || "").toUpperCase();
    const date = flag("--date") || getNYDate();
    if (!pair) {
      console.error("Usage: node tools/llm/ledger.cjs --trace <PAIR> [--date YYYY-MM-DD]");
      process.exit(1);
    }
    console.log(tracePair(pair, date));
    return;
  }
  if (mode === "--tail") {
    const date = flag("--date") || getNYDate();
    const raw = load(date);
    console.log(`${raw.length} entries · ${path.join(ROOT, "shared", date, "operator_ledger.jsonl")}`);
    return;
  }
  console.log(`Usage:
  node tools/llm/ledger.cjs --dump [--date YYYY-MM-DD]    # ledger tail
  node tools/llm/ledger.cjs --trace <PAIR> [--date ...]   # pair digest
  node tools/llm/ledger.cjs --tail                        # counts`);
}

module.exports = { append, load, entriesFor, formatEntry, tracePair, dump };

if (require.main === module) {
  main();
}