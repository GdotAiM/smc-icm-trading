// ICT Macro Times — 20-min high-conviction windows within killzones
// "A macro is a short order of instructions that creates an event in price delivery"
// Usage: node tools/tv-mcp/macro_times.cjs

const { execSync } = require("child_process");
const path = require("path");
const ROOT = "C:/Users/cash/smc-icm-trading";

function getNY() {
  try {
    const raw = execSync(`node "${path.join(ROOT, "tools", "ny_time.cjs")}" --now`, {
      encoding: "utf8", timeout: 10000, stdio: ["ignore", "pipe", "ignore"]
    });
    return JSON.parse(raw);
  } catch(e) { return null; }
}

// ═══ ALL ICT MACRO TIMES (NY local) ═══
const MACRO_SCHEDULE = [
  // London KZ macros (every 20 min during 02:00-05:00)
  { start: { h: 2, m: 0 }, end: { h: 2, m: 20 }, session: "London KZ", name: "London Open Macro", reliability: 0.8 },
  { start: { h: 2, m: 20 }, end: { h: 2, m: 40 }, session: "London KZ", name: "London KZ Macro #2", reliability: 0.7 },
  { start: { h: 2, m: 40 }, end: { h: 3, m: 0 }, session: "London KZ", name: "London SB Pre-Macro", reliability: 0.9 },
  // London SB macros (03:00-04:00 — highest conviction)
  { start: { h: 3, m: 0 }, end: { h: 3, m: 20 }, session: "London SB", name: "London SB Macro #1 ⭐", reliability: 1.0 },
  { start: { h: 3, m: 20 }, end: { h: 3, m: 40 }, session: "London SB", name: "London SB Macro #2", reliability: 0.9 },
  { start: { h: 3, m: 40 }, end: { h: 4, m: 0 }, session: "London SB", name: "London SB Macro #3", reliability: 0.8 },
  // London KZ late macros
  { start: { h: 4, m: 0 }, end: { h: 4, m: 20 }, session: "London KZ", name: "London Late Macro", reliability: 0.6 },
  { start: { h: 4, m: 20 }, end: { h: 4, m: 40 }, session: "London KZ", name: "London Close Macro", reliability: 0.5 },

  // Pre-NY AM — 07:00 AM Liquidity Hunt + IFVG Entry (ICT 2024 Lecture 2)
  // "Sit down before 07:00 AM NY. Mark London high/low. Do not predict."
  { start: { h: 7, m: 0 }, end: { h: 7, m: 20 }, session: "Pre-NY AM", name: "07:00 AM Liquidity Hunt ⭐", reliability: 1.0 },
  { start: { h: 7, m: 20 }, end: { h: 7, m: 40 }, session: "Pre-NY AM", name: "07:20 IFVG Entry Window", reliability: 0.9 },
  { start: { h: 7, m: 40 }, end: { h: 8, m: 0 }, session: "Pre-NY AM", name: "Pre-NY Open Macro", reliability: 0.8 },

  // NY AM KZ macros (08:00-11:00)
  { start: { h: 8, m: 0 }, end: { h: 8, m: 20 }, session: "NY AM KZ", name: "NY Open Macro", reliability: 0.7 },
  { start: { h: 8, m: 20 }, end: { h: 8, m: 40 }, session: "NY AM KZ", name: "NY AM Early Macro", reliability: 0.7 },
  { start: { h: 8, m: 40 }, end: { h: 9, m: 0 }, session: "NY AM KZ", name: "NY Pre-Data Macro", reliability: 0.8 },
  { start: { h: 9, m: 0 }, end: { h: 9, m: 20 }, session: "NY AM KZ", name: "NY AM Macro #1", reliability: 0.8 },
  { start: { h: 9, m: 20 }, end: { h: 9, m: 40 }, session: "NY AM KZ", name: "NY AM Macro #2", reliability: 0.8 },
  { start: { h: 9, m: 40 }, end: { h: 10, m: 0 }, session: "NY AM KZ", name: "NY AM Pre-SB Macro", reliability: 0.9 },
  // NY AM SB macros (10:00-11:00 — ICT's "09:50 NY-AM macro" is the entry into this)
  { start: { h: 9, m: 50 }, end: { h: 10, m: 10 }, session: "NY AM SB", name: "09:50 NY-AM Macro ⭐⭐", reliability: 1.0 },
  { start: { h: 10, m: 0 }, end: { h: 10, m: 20 }, session: "NY AM SB", name: "NY AM SB Macro #1 ⭐", reliability: 1.0 },
  { start: { h: 10, m: 20 }, end: { h: 10, m: 40 }, session: "NY AM SB", name: "NY AM SB Macro #2", reliability: 0.9 },
  { start: { h: 10, m: 40 }, end: { h: 11, m: 0 }, session: "NY AM SB", name: "NY AM SB Macro #3", reliability: 0.8 },

  // NY PM / London Close macros (13:00-16:00 — "last hour has four macros")
  { start: { h: 13, m: 0 }, end: { h: 13, m: 20 }, session: "NY PM", name: "NY PM Early Macro", reliability: 0.6 },
  { start: { h: 13, m: 10 }, end: { h: 13, m: 30 }, session: "NY PM", name: "13:10 NY-PM Macro ⭐", reliability: 0.9 },
  { start: { h: 13, m: 30 }, end: { h: 13, m: 50 }, session: "NY PM", name: "NY PM Mid Macro", reliability: 0.7 },
  { start: { h: 14, m: 0 }, end: { h: 14, m: 20 }, session: "NY PM SB", name: "NY PM SB Macro #1 ⭐", reliability: 0.9 },
  { start: { h: 14, m: 20 }, end: { h: 14, m: 40 }, session: "NY PM SB", name: "NY PM SB Macro #2", reliability: 0.8 },
  { start: { h: 14, m: 40 }, end: { h: 15, m: 0 }, session: "NY PM SB", name: "NY PM SB Macro #3", reliability: 0.7 },
  // Last hour has FOUR macros (ICT)
  { start: { h: 15, m: 0 }, end: { h: 15, m: 20 }, session: "London Close", name: "Last Hour Macro #1", reliability: 0.7 },
  { start: { h: 15, m: 20 }, end: { h: 15, m: 40 }, session: "London Close", name: "Last Hour Macro #2", reliability: 0.7 },
  { start: { h: 15, m: 40 }, end: { h: 16, m: 0 }, session: "London Close", name: "Last Hour Macro #3", reliability: 0.6 },
  { start: { h: 16, m: 0 }, end: { h: 16, m: 20 }, session: "London Close", name: "Last Hour Macro #4", reliability: 0.5 },
];

// ═══ FIND CURRENT + UPCOMING MACROS ═══
const ny = getNY();
if (!ny) {
  console.log(JSON.stringify({ error: "NY time unavailable" }));
  process.exit(1);
}

const hour = ny.nyTime?.hour || 0;
const minute = new Date().getMinutes(); // Current minute (approximate)
const currentMinutes = hour * 60 + minute;

// Find active macro
let active = null;
for (const m of MACRO_SCHEDULE) {
  const startMin = m.start.h * 60 + m.start.m;
  const endMin = m.end.h * 60 + m.end.m;
  if (currentMinutes >= startMin && currentMinutes < endMin) {
    active = m;
    break;
  }
}

// Find next 3 upcoming macros
const upcoming = MACRO_SCHEDULE
  .filter(m => (m.start.h * 60 + m.start.m) > currentMinutes)
  .sort((a, b) => (a.start.h * 60 + a.start.m) - (b.start.h * 60 + b.start.m))
  .slice(0, 5);

// Count macros remaining today
const remaining = MACRO_SCHEDULE.filter(m => (m.start.h * 60 + m.start.m) > currentMinutes).length;

// Star macros (reliability >= 1.0)
const starMacros = MACRO_SCHEDULE.filter(m => m.reliability >= 1.0);
const nextStar = starMacros.find(m => (m.start.h * 60 + m.start.m) > currentMinutes);

const result = {
  time: `${hour}:${String(minute).padStart(2, "0")} NY`,
  active: active ? {
    name: active.name,
    session: active.session,
    reliability: active.reliability,
    endsIn: `${active.end.h}:${String(active.end.m).padStart(2, "0")} NY`
  } : null,
  upcoming: upcoming.map(m => ({
    name: m.name,
    session: m.session,
    reliability: m.reliability,
    starts: `${m.start.h}:${String(m.start.m).padStart(2, "0")} NY`,
    inMinutes: (m.start.h * 60 + m.start.m) - currentMinutes
  })),
  nextStar: nextStar ? {
    name: nextStar.name,
    starts: `${nextStar.start.h}:${String(nextStar.start.m).padStart(2, "0")} NY`,
    inMinutes: (nextStar.start.h * 60 + nextStar.start.m) - currentMinutes
  } : null,
  macrosRemaining: remaining,
  detail: active
    ? `Active: ${active.name} (${active.session}, reliability ${active.reliability}) — ends ${active.end.h}:${String(active.end.m).padStart(2, "0")} NY`
    : `No active macro. Next: ${upcoming[0]?.name || 'none'} in ${upcoming[0]?.inMinutes || '?'} min`
};

console.log(JSON.stringify(result, null, 2));
