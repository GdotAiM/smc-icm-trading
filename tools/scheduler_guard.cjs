// Scheduler Guard — single-driver execution lock.
// auto_scheduler.cjs writes a heartbeat; the phase-based drivers
// (ny_am_autonomous.cjs, autonomous_session.cjs) consult it and
// step aside so only ONE driver executes trades at a time.
//
// Usage (driver):   const guard = require("../scheduler_guard.cjs");
//                    guard.markActive(mode)   // mode: "EXECUTE" | "MONITOR"
// Usage (phase):    if (guard.isActive("EXECUTE", 15)) { /* skip */ }
const fs = require("fs");
const path = require("path");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..");
const DATE = new Date().toISOString().split("T")[0];

function stateFile() {
  return path.join(ROOT, "shared", DATE, "scheduler_state.json");
}

// Writes a heartbeat so other drivers know a scheduler is alive.
// Called on every scheduler cycle (not just at start) so the lock
// expires automatically if the scheduler dies.
function markActive(mode, detail) {
  try {
    fs.mkdirSync(path.dirname(stateFile()), { recursive: true });
    fs.writeFileSync(stateFile(), JSON.stringify({
      pid: process.pid,
      mode: mode || "MONITOR",
      detail: detail || null,
      at: Date.now(),
    }));
  } catch (e) { /* best-effort */ }
}

// Returns true if a scheduler has marked itself active within maxAgeMin.
function isActive(maxAgeMin) {
  try {
    const raw = fs.readFileSync(stateFile(), "utf8").replace(/^\uFEFF/, "");
    const s = JSON.parse(raw);
    if (!s || !s.at) return false;
    return Date.now() - s.at < (maxAgeMin || 10) * 60000;
  } catch { return false; }
}

// Returns the scheduler mode ("EXECUTE" / "MONITOR") or null if no live scheduler.
function activeMode(maxAgeMin) {
  if (!isActive(maxAgeMin)) return null;
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), "utf8").replace(/^\uFEFF/, ""));
    return s.mode || "MONITOR";
  } catch { return null; }
}

module.exports = { markActive, isActive, activeMode, stateFile };
