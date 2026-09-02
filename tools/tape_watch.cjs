#!/usr/bin/env node
// Tape Watch — runs every 15min, checks predictions, auto-observes if price moved
// Usage: node tools/tape_watch.cjs [--loop]
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..");

const PAIRS = ["EURUSD", "GBPUSD", "XAUUSD", "NAS100"];
const DIR_MAP = { XAUUSD: "GOLD" };
const DATE = require("./ny_time.cjs").getNYDate();
const nyTime = require("./ny_time.cjs");
const nyH = () => nyTime.getNYHour();
const nyM = () => nyTime.getNYMin();
const nyTS = () => `${String(nyH()).padStart(2,"0")}:${String(nyM()).padStart(2,"0")}`;

function log(msg) { console.log(`[${nyTS()}] ${msg}`); }
function run(cmd) {
  try { return execSync(cmd, { encoding:"utf8", stdio:["ignore","pipe","ignore"], timeout:30000 }).trim(); }
  catch(e) { return ""; }
}

for (const pair of PAIRS) {
  const dir = DIR_MAP[pair] || pair;
  const journal = path.join(ROOT, "shared", DATE, dir, "tape_journal.jsonl");
  if (!fs.existsSync(journal)) continue;
  const lines = fs.readFileSync(journal, "utf8").trim().split("\n").filter(Boolean);
  // Find latest unobserved prediction
  let pred = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const e = JSON.parse(lines[i]);
      if (e.kind === "prediction" && !e.observed) { pred = e; break; }
    } catch {}
  }
  if (!pred) continue;
  const ageMin = Math.round((Date.now() - pred.ts) / 60000);
  if (ageMin < 12) continue; // wait at least 12 min before auto-observe
  log(`${pair}: prediction ${ageMin}min old (price ${pred.price}) — watching`);
  // Trigger observation via the tool
  const result = run(`node "${path.join(ROOT,"tools","tape_practice.cjs")}" observe ${pair}`);
  if (result) log(`  → ${result.split("\n")[0]}`);
}

const loop = process.argv.includes("--loop");
if (loop) {
  log("Loop mode: checking every 900s...");
  setInterval(() => {
    for (const pair of PAIRS) {
      const dir = DIR_MAP[pair] || pair;
      const journal = path.join(ROOT, "shared", DATE, dir, "tape_journal.jsonl");
      if (!fs.existsSync(journal)) continue;
      const lines = fs.readFileSync(journal, "utf8").trim().split("\n").filter(Boolean);
      let pred = null;
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const e = JSON.parse(lines[i]);
          if (e.kind === "prediction" && !e.observed) { pred = e; break; }
        } catch {}
      }
      if (!pred) continue;
      const ageMin = Math.round((Date.now() - pred.ts) / 60000);
      if (ageMin < 12) continue;
      log(`${nyTS()} ${pair}: ${ageMin}min — auto-observing`);
      const r = run(`node "${path.join(ROOT,"tools","tape_practice.cjs")}" observe ${pair}`);
      if (r) log(`  → ${r.split("\n")[0]}`);
    }
  }, 900000);
} else {
  log("Single pass complete.");
}
