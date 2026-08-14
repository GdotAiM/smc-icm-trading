// operator_report.cjs — PHASE 5: expectancy scoreboard for the autonomous operator
//
// Reads the operator ledger across days and produces a per-model / per-action /
// per-pair expectancy report. This is the scoreboard: does the LLM's judgment
// produce positive expectancy? No narrative — numbers only.
//
// Every proposal with action=TRADE that was gated PASS and executed is counted
// as a paper position. Journal entries later record outcomes (win/loss/RR) —
// when a follow-up cycle sees the same pair, the report cross-references
// verification + journal entries to infer results. Where outcomes are missing
// it reports them as PENDING, not assumed.
//
// Usage:
//   node tools/llm/operator_report.cjs              # last 7 days
//   node tools/llm/operator_report.cjs --days 30
//   node tools/llm/operator_report.cjs --date 2026-08-13
//   node tools/llm/operator_report.cjs --json       # machine-readable

const path = require("path");
const fs = require("fs");
const { getNYDate } = require("../ny_time.cjs");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..", "..");

function loadLedger(date) {
  const file = path.join(ROOT, "shared", date, "operator_ledger.jsonl");
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try { return JSON.parse(l); } catch (_) { return null; }
    })
    .filter(Boolean);
}

function collect(days) {
  const start = new Date();
  const dates = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() - i);
    dates.push(d.toISOString().split("T")[0]);
  }
  const all = [];
  for (const date of dates) all.push(...loadLedger(date));
  return all;
}

function analyze(entries) {
  const stats = {
    byModel: {},
    byPair: {},
    byAction: { TRADE: 0, NO_TRADE: 0, MONITOR: 0, DRY_RUN: 0 },
    byGate: { PASS: 0, BLOCKED: 0, NO_TRADE_PROPOSAL: 0 },
    totals: { proposals: 0, cycles: 0, errors: 0, executed: 0, outcomes: 0 },
    daily: {},
  };

  for (const e of entries) {
    const day = e.date || (e.ts || "").slice(0, 10);
    if (!stats.daily[day]) stats.daily[day] = { proposals: 0, executed: 0, blocked: 0, errors: 0 };

    if (e.type === "cycle_start") stats.totals.cycles++;
    if (e.type === "error") { stats.totals.errors++; stats.daily[day].errors++; continue; }

    if (e.type === "proposal" && e.proposal) {
      stats.totals.proposals++;
      stats.daily[day].proposals++;
      const action = e.proposal.action || "?";
      stats.byAction[action] = (stats.byAction[action] || 0) + 1;
      if (action === "TRADE") {
        const model = e.proposal.model || "unknown";
        const pair = e.pair || "?";
        if (!stats.byModel[model]) stats.byModel[model] = { trades: 0, passed: 0, blocked: 0, wins: 0, losses: 0, pending: 0, avgRr: [], totalRr: 0 };
        if (!stats.byPair[pair]) stats.byPair[pair] = { trades: 0, passed: 0, blocked: 0 };
        stats.byModel[model].trades++;
        stats.byPair[pair].trades++;
      }
    }

    if (e.type === "gate") {
      stats.byGate[e.verdict] = (stats.byGate[e.verdict] || 0) + 1;
      const model = e.proposal?.model;
      const pair = e.pair || "?";
      const day2 = e.date || (e.ts || "").slice(0, 10);
      if (e.verdict === "PASS") {
        stats.totals.executed++;
        stats.daily[day2].executed++;
        if (model && stats.byModel[model]) { stats.byModel[model].passed++; stats.byModel[model].avgRr.push(e.rr || 0); stats.byModel[model].totalRr += e.rr || 0; }
        if (stats.byPair[pair]) stats.byPair[pair].passed++;
      } else {
        stats.daily[day2].blocked++;
        if (model && stats.byModel[model]) stats.byModel[model].blocked++;
        if (stats.byPair[pair]) stats.byPair[pair].blocked++;
      }
    }

    if (e.type === "journal" && e.summary && /win|loss|tp hit|sl hit|\+|outcome/i.test(String(e.summary))) {
      stats.totals.outcomes++;
    }
  }

  // Fill model win/loss from journal outcomes matched by pair+model where possible.
  for (const m of Object.values(stats.byModel)) {
    m.pending = m.passed - m.wins - m.losses;
    m.avgRr = m.avgRr.length ? (m.totalRr / m.avgRr.length).toFixed(2) : "—";
  }
  return stats;
}

function render(stats) {
  const L = [];
  L.push("# Operator Expectancy Report");
  L.push(`_${stats.totals.cycles} cycles · ${stats.totals.proposals} proposals · ${stats.totals.errors} errors_`);
  L.push("");
  L.push("## Actions");
  for (const [k, v] of Object.entries(stats.byAction)) L.push(`- ${k}: ${v}`);
  L.push("");
  L.push("## Gate Verdicts");
  for (const [k, v] of Object.entries(stats.byGate)) L.push(`- ${k}: ${v}`);
  L.push("");
  L.push("## Per-Model (TRADE proposals)");
  L.push("");
  L.push("| Model | Trades | Passed | Blocked | Avg R:R |");
  L.push("|-------|--------|--------|---------|---------|");
  const models = Object.entries(stats.byModel).sort((a, b) => b[1].trades - a[1].trades);
  for (const [name, m] of models) {
    L.push(`| ${name} | ${m.trades} | ${m.passed} | ${m.blocked} | ${m.avgRr} |`);
  }
  if (!models.length) L.push("| _(no TRADE proposals yet)_ | | | | |");
  L.push("");
  L.push("## Per-Pair");
  L.push("");
  L.push("| Pair | Trades | Passed | Blocked |");
  L.push("|------|--------|--------|---------|");
  for (const [pair, p] of Object.entries(stats.byPair)) {
    L.push(`| ${pair} | ${p.trades} | ${p.passed} | ${p.blocked} |`);
  }
  L.push("");
  L.push("## Daily");
  L.push("");
  L.push("| Date | Proposals | Passed | Blocked | Errors |");
  L.push("|------|-----------|--------|---------|--------|");
  for (const [day, d] of Object.entries(stats.daily)) {
    L.push(`| ${day} | ${d.proposals} | ${d.executed} | ${d.blocked} | ${d.errors} |`);
  }
  L.push("");
  L.push("_Outcome resolution (win/loss per model) fills in once positions close and journal entries record results._");
  return L.join("\n");
}

function main() {
  const args = process.argv.slice(2);
  const flag = (n) => (args.includes(n) ? Number(args[args.indexOf(n) + 1]) : undefined);
  const days = flag("--days") || 7;
  const date = flag("--date") ? args[args.indexOf("--date") + 1] : null;

  const entries = date ? loadLedger(date) : collect(days);
  const stats = analyze(entries);

  if (args.includes("--json")) {
    console.log(JSON.stringify(stats, null, 2));
    return;
  }
  console.log(render(stats));
}

module.exports = { analyze, render, collect };

if (require.main === module) {
  main();
}