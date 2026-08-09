// tools/lib/time.cjs
// Single Source of Truth for ICT session time (Remediation WP-2).
//
// Corrected killzone set (ICT-correct):
//   London 02:00-05:00  |  NY AM 08:00-11:00  |  NY PM 13:00-16:00
//   "London PM" (05:00-08:00) is the London-close / NY-pre-open DEAD ZONE.
//   It is NOT a killzone and must never be treated as one.
//
// This module is self-contained (DST-aware, New York local time) so that
// every existing consumer can migrate to a single clock. ny_time.cjs remains
// as a compatibility shim that delegates session semantics here.

const SESSIONS = [
  { name: "asia",     start: 20, end: 24, label: "Asia (prev day evening)", killzone: false },
  { name: "asiaLate", start: 0,  end: 2,  label: "Asia (overnight)",        killzone: false },
  { name: "london",   start: 2,  end: 5,  label: "London Killzone",         killzone: true },
  { name: "londonPM", start: 5,  end: 8,  label: "London PM (dead zone)",   killzone: false },
  { name: "nyAM",     start: 8,  end: 11, label: "NY AM Killzone",          killzone: true },
  { name: "nyLunch",  start: 11, end: 13, label: "NY Lunch",                killzone: false },
  { name: "nyPM",     start: 13, end: 16, label: "NY PM Killzone",          killzone: true },
  { name: "nyClose",  start: 16, end: 17, label: "NY Close",                killzone: false },
  { name: "offHours", start: 17, end: 20, label: "Off Hours",               killzone: false },
];

const SILVER_BULLET = [
  { name: "londonSB", start: 3,  end: 4,  label: "London Silver Bullet" },
  { name: "nyAMSB",   start: 10, end: 11, label: "NY AM Silver Bullet" },
  { name: "nyPMSB",   start: 14, end: 15, label: "NY PM Silver Bullet" },
];

const JUDAS_SWING = [
  { name: "londonOpen", start: 2, end: 3, label: "London Open Judas Swing" },
  { name: "nyOpen",     start: 8, end: 9, label: "NY Open Judas Swing" },
];

// ── DST-aware New York time (self-contained) ────────────────────────────
// EST = -5, EDT = -4. DST: 2nd Sunday March → 1st Sunday November,
// transitions at 07:00 UTC (start) and 06:00 UTC (end).
function getNYOffset(ts) {
  const d = ts === undefined ? new Date() : new Date(ts);
  const year = d.getUTCFullYear();
  const mar1 = new Date(Date.UTC(year, 2, 1));
  const mar2ndSun = new Date(Date.UTC(year, 2, (14 - mar1.getUTCDay()) % 7 + 8, 7));
  const nov1 = new Date(Date.UTC(year, 10, 1));
  const nov1stSun = new Date(Date.UTC(year, 10, (7 - nov1.getUTCDay()) % 7 + 1, 6));
  const t = d.getTime();
  return t >= mar2ndSun.getTime() && t < nov1stSun.getTime() ? -4 : -5;
}

function getNYHourFor(ts) {
  const d = new Date(ts);
  let nyHour = d.getUTCHours() + getNYOffset(ts);
  if (nyHour < 0) nyHour += 24;
  if (nyHour >= 24) nyHour -= 24;
  return nyHour;
}

function getNYDayFor(ts) {
  const d = new Date(ts);
  if (d.getUTCHours() + getNYOffset(ts) < 0) {
    return new Date(ts - 86400000).getUTCDay();
  }
  return d.getUTCDay();
}

// ── Session resolution ──────────────────────────────────────────────────
function sessionForHour(h) {
  for (const s of SESSIONS) {
    if (h >= s.start && h < s.end) {
      return { name: s.name, label: s.label, hour: h, killzone: s.killzone };
    }
  }
  return { name: "unknown", label: "Unknown", hour: h, killzone: false };
}

function resolveSessionFor(ts) {
  return sessionForHour(getNYHourFor(ts));
}

function isKillzoneFor(ts) {
  return resolveSessionFor(ts).killzone;
}

// Direct hour-based check (no timestamp needed) — used by scripts that only
// hold the current NY hour.
function isKillzoneHour(h) {
  const s = SESSIONS.find(z => h >= z.start && h < z.end);
  return !!s && s.killzone;
}

function isInSilverBulletFor(ts) {
  const h = getNYHourFor(ts);
  for (const w of SILVER_BULLET) {
    if (h >= w.start && h < w.end) return { active: true, name: w.name, label: w.label };
  }
  return { active: false };
}

function isInJudasSwingFor(ts) {
  const h = getNYHourFor(ts);
  for (const w of JUDAS_SWING) {
    if (h >= w.start && h < w.end) return { active: true, name: w.name, label: w.label };
  }
  return { active: false };
}

module.exports = {
  SESSIONS,
  SILVER_BULLET,
  JUDAS_SWING,
  getNYOffset,
  getNYHourFor,
  getNYDayFor,
  sessionForHour,
  resolveSessionFor,
  isKillzoneFor,
  isKillzoneHour,
  isInSilverBulletFor,
  isInJudasSwingFor,
};
