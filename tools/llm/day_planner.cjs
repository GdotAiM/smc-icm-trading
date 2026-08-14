// day_planner.cjs — the operator's daily schedule (PHASE 6: the day plan)
//
// The loop polls every N minutes 24/7. This module decides WHAT the loop should
// be doing at any given NY time and HOW fast it should scan:
//
//   phase      WARMUP/LOCK/SCAN/EXTRACT/CLOSE/PAUSE — what kind of day it is now
//   scanMin    loop interval — tight (5m) in killzones, sparse (15m) in dead zones
//   actions    one-shot scheduled jobs (full fetch, lunch extraction, EOD report)
//
// Scheduled actions run ONCE per day, at or after their trigger minute. They are
// "heavy" jobs that pause pair scanning while they run (the loop awaits them).
//
// The plan is deliberately deterministic and time-based, mirroring the ICT day:
//   Asia 00-02   : dead — no liquidity, no LLM calls (PAUSE)
//   London 02-05 : first killzone + Silver Bullet 03:00-04:00 (SCAN @5m)
//   05-07        : pre-NY lull (PREP @10m)
//   07-07:40     : Lecture 2 — London Hunt + IFVG (SCAN @5m — LLM active)
//   07:40-08     : 7-9AM pre-session range forming (LOCK @5m — data collection)
//   08-09        : NY AM killzone open + news/raid (SCAN @5m)
//   09-11        : post-9AM — 7-9 range locked, ORG; refresh after the range
//                  locks so the graded octants/tethering populate (SCAN @5m)
//   11-13        : NY Lunch — ONLY carry-forward entries; extract today's lunch
//                  inefficiency for tomorrow (EXTRACT @10m)
//   13-16        : NY PM + Silver Bullet 14:00-15:00; refresh after lunch so the
//                  full lunch window is captured (SCAN @5m)
//   16-17        : NY close — end-of-day report + position check (CLOSE @10m)
//   17-24        : post-close / Asia (PAUSE @15m)

const path = require("path");
const fs = require("fs");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..", "..");

// ── Scheduled action registry ─────────────────────────────────────────────────
// script: script path (relative to ROOT) + fixed args, run via `node`.
// timeoutMs: how long the loop will wait before giving up.
const ACTIONS = {
  warmup: {
    label: "Session warm-up (full data fetch + engines + forecasts)",
    script: ["tools/session_start.cjs"],
    timeoutMs: 600000,
  },
  refresh_range: {
    label: "Refresh after 7-9AM range lock (populate graded octants/ORG)",
    script: ["tools/session_start.cjs"],
    timeoutMs: 600000,
  },
  refresh_lunch: {
    label: "Refresh after lunch window (capture full lunch for carry-forward)",
    script: ["tools/session_start.cjs"],
    timeoutMs: 600000,
  },
  lunch_extract: {
    label: "Extract NY lunch carry-forward (prev_day_lunch_carry)",
    script: ["tools/prev_day_lunch_carry.cjs", "--all"],
    timeoutMs: 180000,
  },
  eod_report: {
    label: "End-of-day expectancy report",
    script: ["tools/llm/operator_report.cjs", "--days", "1"],
    timeoutMs: 60000,
  },
  close_check: {
    label: "NY close — verify open positions",
    script: null,
    timeoutMs: 0,
  },
};

// ── DAY_PLAN table — half-open [start, end) NY-hour windows ───────────────────
const DAY_PLAN = [
  { window: [0, 2], phase: "PAUSE", label: "Asia / dead zone", scanMin: 15 },
  { window: [2, 5], phase: "SCAN", label: "London KZ (SB 03:00-04:00)", scanMin: 5, actions: [{ id: "warmup", at: 2.0 }] },
  { window: [5, 7], phase: "PREP", label: "Pre-NY lull", scanMin: 10 },
  { window: [7, 7.67], phase: "SCAN", label: "Lecture 2 — London Hunt + IFVG (07:00-07:40)", scanMin: 5 },
  { window: [7.67, 8], phase: "LOCK", label: "7-9AM range forming (post-lecture2)", scanMin: 5 },
  { window: [8, 9], phase: "SCAN", label: "NY AM KZ open (news/raid)", scanMin: 5 },
  { window: [9, 11], phase: "SCAN", label: "NY AM + 9:30 ORG", scanMin: 5, actions: [{ id: "refresh_range", at: 9.08 }] },
  { window: [11, 13], phase: "EXTRACT", label: "NY Lunch — carry-forward only", scanMin: 10, actions: [{ id: "lunch_extract", at: 11.08 }] },
  { window: [13, 16], phase: "SCAN", label: "NY PM (SB 14:00-15:00)", scanMin: 5, actions: [{ id: "refresh_lunch", at: 13.08 }] },
  { window: [16, 17], phase: "CLOSE", label: "NY close", scanMin: 10, actions: [{ id: "eod_report", at: 16.05 }, { id: "close_check", at: 16.06 }] },
  { window: [17, 20], phase: "PAUSE", label: "Post-close", scanMin: 15 },
  { window: [20, 24], phase: "PAUSE", label: "Asia", scanMin: 15 },
];

// ── Current NY time (DST-aware, no subprocess) ────────────────────────────────
function nyNow() {
  const parts = new Date()
    .toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false, hour: "2-digit", minute: "2-digit" })
    .split(":");
  return { hour: parseInt(parts[0], 10), minute: parseInt(parts[1], 10) };
}

// ── Plan resolution ───────────────────────────────────────────────────────────
// Returns the active plan entry (window, phase, label, scanMin) plus the list of
// one-shot action ids whose trigger time (a.at) has already passed.
function planAt(nyHour, nyMin = 0) {
  const t = Number(nyHour) + Number(nyMin) / 60;
  const entry = DAY_PLAN.find((w) => t >= w.window[0] && t < w.window[1]) || DAY_PLAN[DAY_PLAN.length - 1];
  const dueActions = (entry.actions || []).filter((a) => t >= a.at).map((a) => a.id);
  return { ...entry, time: t, dueActions };
}

// ── Run-state persistence (one-shot actions, reset each NY day) ───────────────
function statePath() {
  return path.join(ROOT, "shared", "operator_planner_state.json");
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(statePath(), "utf8"));
  } catch {
    return { date: null, actions: {} };
  }
}

function saveState(state) {
  try {
    fs.mkdirSync(path.dirname(statePath()), { recursive: true });
    fs.writeFileSync(statePath(), JSON.stringify(state, null, 2));
  } catch (_) {}
}

// Has the action already run today (per the persisted state)?
function alreadyRan(state, date, id) {
  return state.date === date && state.actions[id] !== undefined;
}

// ── Exports ───────────────────────────────────────────────────────────────────
module.exports = { DAY_PLAN, ACTIONS, nyNow, planAt, loadState, saveState, alreadyRan };