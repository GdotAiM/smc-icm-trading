// tools/shadow/shadow_log.cjs
// SAFETY NET — shadow-mode disagreement logger (Remediation Part D2).
//
// Records old-vs-new behavior disagreements in append-only JSONL so every
// behavior change introduced by the remediation is auditable and comparable.
// Old value = what the legacy logic produced. New value = what the corrected
// logic produces. Never throws — a logging failure must never break the pipeline.
const fs = require("fs");
const path = require("path");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..", "..");

function logDisagreement({ area, oldValue, newValue, detail, pair, source }) {
  try {
    const date = new Date().toISOString().split("T")[0];
    const dir = path.join(ROOT, "stages", "shadow", date);
    fs.mkdirSync(dir, { recursive: true });
    const rec = {
      ts: new Date().toISOString(),
      area,
      pair: pair || "",
      source: source || "",
      oldValue,
      newValue,
      detail: detail || "",
    };
    fs.appendFileSync(path.join(dir, "disagreements.jsonl"), JSON.stringify(rec) + "\n", "utf8");
    return true;
  } catch {
    return false;
  }
}

// Convenience: read today's (or a given date's) disagreement log.
function readLog(date) {
  try {
    const d = date || new Date().toISOString().split("T")[0];
    const f = path.join(ROOT, "stages", "shadow", d, "disagreements.jsonl");
    if (!fs.existsSync(f)) return [];
    return fs.readFileSync(f, "utf8")
      .split("\n")
      .filter(Boolean)
      .map(line => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

module.exports = { logDisagreement, readLog };
