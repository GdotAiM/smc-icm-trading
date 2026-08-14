// tools/lib/killzone.cjs
// WP-12 / audit 5.4: event-time quality — grade WHEN a sweep/MSS happened
// against the NY killzones. A killzone event carries the day's liquidity;
// an off-hours event is timing noise, not timing quality.
//
// NY hours (local, America/New_York) are used — run_pair already computes
// NY_HOUR via ny_time.cjs. Killzone windows come from
// _config/constants.json → `sessions.killzones` if present, else the ICT
// defaults from the audit: London 2-5, NY AM 7-10, NY PM 12-15.

const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.resolve(__dirname, "../../_config/constants.json");

// WP-15: aligned with ny_time.cjs NY_KILLZONES (end-exclusive).
// Prior defaults were shifted 1h early vs the canonical NY time engine.
// londonPM (05-08) is NOT a killzone per ICT — dead overlap, monitor only.
const DEFAULT_KILLZONES = [
  { name: "London", start: 2, end: 5 },
  { name: "NY AM", start: 8, end: 11 },
  { name: "NY PM", start: 13, end: 16 },
];

function loadKillzones() {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    const kz = raw && raw.sessions ? raw.sessions.killzones : null;
    if (kz && typeof kz === "object") {
      return Object.entries(kz).map(([key, v]) => ({
        name: key,
        start: Number(v && v.start !== undefined ? v.start : 0),
        end: Number(v && v.end !== undefined ? v.end : 24),
      }));
    }
  } catch { /* fall through to defaults */ }
  return DEFAULT_KILLZONES;
}

const KILLZONES = loadKillzones();

// NY hour is end-exclusive. Returns { inKillzone, name }.
function killzoneFor(nyHour) {
  if (!Number.isFinite(nyHour)) return { inKillzone: false, name: null };
  for (const kz of KILLZONES) {
    if (nyHour >= kz.start && nyHour < kz.end) {
      return { inKillzone: true, name: kz.name };
    }
  }
  return { inKillzone: false, name: null };
}

module.exports = { killzoneFor, KILLZONES, DEFAULT_KILLZONES, loadKillzones };
