// ICT Weekly Profile Engine — AMD cycle, NDOG, weekly range, day matching
// Usage: node tools/tv-mcp/weekly_profile.cjs PAIR
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = "C:/Users/cash/smc-icm-trading";
const DATE = new Date().toISOString().split("T")[0];
const PAIR = process.argv[2] || "XAUUSD";

// ═══ HELPERS ═══
function getNY() {
  try {
    const raw = execSync(`node "${path.join(ROOT, "tools", "ny_time.cjs")}" --now`, {
      encoding: "utf8", timeout: 10000, stdio: ["ignore", "pipe", "ignore"]
    });
    return JSON.parse(raw);
  } catch(e) { return null; }
}

function getEngine(tf, dateOverride) {
  try {
    const d = dateOverride || DATE;
    const file = path.join(ROOT, "shared", d, PAIR, `engine_${tf}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch(e) { return null; }
}

// Get all available weekdays for this week
function getWeekdayData() {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon...
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7)); // Go back to Monday

  const days = [];
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    const engine1d = getEngine("1d", dateStr);

    days.push({
      date: dateStr,
      day: dayNames[d.getDay()],
      index: i,
      hasData: !!engine1d,
      bias: engine1d?.structure?.bias || "?",
      event: engine1d?.structure?.lastEvent || "?",
      swingHigh: engine1d?.structure?.lastSwingHigh || null,
      swingLow: engine1d?.structure?.lastSwingLow || null,
    });
  }

  return {
    days,
    daysWithData: days.filter(d => d.hasData).length,
    daysMissing: days.filter(d => !d.hasData).length,
    completeness: Math.round((days.filter(d => d.hasData).length / 5) * 100),
  };
}

// ═══ 1. AMD CYCLE PHASE ═══
function getAMDPhase() {
  const ny = getNY();
  const engine4h = getEngine("4h");
  const engine1d = getEngine("1d");

  if (!ny || !engine4h) return { phase: "UNKNOWN", detail: "Engine data missing — run session_start.cjs" };

  const day = ny.dayProfile?.name || "?";
  const hour = ny.nyTime?.hour || 0;
  const cycleEst = ny.cycleEstimate || "UNKNOWN";
  const bias4h = engine4h?.structure?.bias || "?";
  const event4h = engine4h?.structure?.lastEvent || "?";
  const bias1d = engine1d?.structure?.bias || "?";

  // AMD cycle mapping by day
  const amdMap = {
    Monday:    { phase: "ACCUMULATION", detail: "Weekly range being set. Institutions accumulating positions. Low conviction — wait for range to establish." },
    Tuesday:   { phase: "ACCUMULATION → MANIPULATION", detail: "Range extends or reverses. 'Turnaround Tuesday.' Watch for Monday high/low sweep." },
    Wednesday: { phase: "MANIPULATION → DISTRIBUTION", detail: "Classic reversal day. Mon-Tue accumulation sweeps, then reversal. Highest probability reversal of the week." },
    Thursday:  { phase: "DISTRIBUTION → EXPANSION", detail: "Strongest trending day. The big move of the week. Expand what was accumulated Mon-Wed. ★ MMXM prime time." },
    Friday:    { phase: "CLOSE-OUT / SQUARING", detail: "Profit-taking dominates. Weekly move likely already delivered. Trade small or pass. TGIF rules apply." },
  };

  const amd = amdMap[day] || { phase: "UNKNOWN", detail: "Unknown day" };

  // Structural confirmation
  let structuralNote = "";
  if (bias4h === "bullish" && event4h === "CHoCH") structuralNote = "4H CHoCH bullish — structural reversal confirmed. AMD cycle supports continuation.";
  else if (bias4h === "bearish" && event4h === "CHoCH") structuralNote = "4H CHoCH bearish — structural reversal confirmed. AMD cycle supports continuation down.";
  else if (bias1d === "bullish" && bias4h === "bullish") structuralNote = "1D + 4H aligned bullish — AMD cycle in distribution/expansion. Trend is strong.";
  else if (bias1d === "bearish" && bias4h === "bearish") structuralNote = "1D + 4H aligned bearish — AMD cycle in distribution/expansion down.";
  else structuralNote = "1D and 4H disagree — AMD cycle is in transition. Expect choppy price action.";

  return {
    phase: amd.phase,
    dayContext: amd.detail,
    cycleEstimate: cycleEst,
    structuralNote,
    bias4h, event4h, bias1d
  };
}

// ═══ 2. WEEKLY RANGE (HIGH/LOW) ═══
function getWeeklyRange() {
  const engine1w = getEngine("1w");
  const engine1d = getEngine("1d");

  let weeklyHigh = null, weeklyLow = null, source = "none";

  if (engine1w?.structure) {
    weeklyHigh = engine1w.structure.lastSwingHigh;
    weeklyLow = engine1w.structure.lastSwingLow;
    source = "1W engine";
  }

  if (engine1d?.structure && !weeklyHigh) {
    weeklyHigh = engine1d.structure.lastSwingHigh;
    weeklyLow = engine1d.structure.lastSwingLow;
    source = "1D engine (1W missing)";
  }

  if (!weeklyHigh) return { weeklyHigh: null, weeklyLow: null, source: "Engine data missing — run session_start.cjs" };

  return { weeklyHigh, weeklyLow, source };
}

// ═══ 3. DAY PROFILE MATCHING ═══
function getDayProfileMatch() {
  const ny = getNY();
  if (!ny) return { match: "UNKNOWN", detail: "NY time unavailable" };

  const day = ny.dayProfile?.name || "?";
  const engine4h = getEngine("4h");
  const bias4h = engine4h?.structure?.bias || "?";
  const event4h = engine4h?.structure?.lastEvent || "?";

  // ICT weekly profile matching
  const profiles = {
    Monday: {
      expected: "Range-setting. Weekly high or low often forms Mon PM - Tue AM.",
      trade: "Don't trade first 2h of London. Let the range establish. Watch for NDOG.",
      bias: bias4h === "bullish" ? "If bullish, Monday may set the weekly low." : "If bearish, Monday may set the weekly high."
    },
    Tuesday: {
      expected: "Continuation or 'Turnaround Tuesday'. Monday's range extends or reverses.",
      trade: "If Monday was range-bound, Tuesday is the expansion day. Enter on break of Monday's range.",
      bias: event4h === "CHoCH" ? "CHoCH on 4H — Turnaround Tuesday reversal likely." : "BOS on 4H — continuation likely."
    },
    Wednesday: {
      expected: "Reversal Day. Often marks weekly high/low. NY AM critical.",
      trade: "★ Turtle Soup, Judas Swing, Silver Bullet (NY AM). Wait for sweep then reverse entry.",
      bias: "Highest probability reversal day. If Mon-Tue trended, expect reversal."
    },
    Thursday: {
      expected: "Expansion Day. Strongest trending. Post-reversal continuation.",
      trade: "★ MMXM, Unicorn, SCOB, 2FVG, OTE + OB. Best day for trend trades. Pyramid aggressively.",
      bias: bias4h === "bullish" ? "Thursday expansion likely continues the Wednesday reversal up." : "Thursday expansion likely continues down."
    },
    Friday: {
      expected: "Position Squaring. Profit-taking. Thursday's move often retraces.",
      trade: "TGIF: London = watch sweep. NY AM = scalp only. NY PM = late bounce. Close all by NY close.",
      bias: bias4h === "bullish" ? "After bullish expansion week, expect profit-taking pullback. Weekly high likely set Thursday." : "After bearish week, expect short-covering bounce. Weekly low likely set Thursday."
    }
  };

  const profile = profiles[day] || { expected: "Unknown", trade: "Unknown", bias: "Unknown" };

  return {
    day,
    expected: profile.expected,
    tradePlan: profile.trade,
    biasNote: profile.bias
  };
}

// ═══ 4. NDOG LEVELS ═══
function getNDOGLevels() {
  // NDOG = New Day Opening Gap — 5pm to 6pm NY gap
  // For current day: yesterday's close to today's open
  const engine1d = getEngine("1d");
  if (!engine1d?.candles || engine1d.candles.length < 2) {
    return { available: false, detail: "Need 1D candles for NDOG calculation" };
  }

  const candles = engine1d.candles;
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];

  // NDOG is the gap between prev day close and current day open
  const ndogHigh = Math.max(prev.c, last.o);
  const ndogLow = Math.min(prev.c, last.o);
  const gapSize = Math.abs(ndogHigh - ndogLow);
  const gapType = last.o > prev.c ? "BULLISH" : last.o < prev.c ? "BEARISH" : "FLAT";

  return {
    available: true,
    prevClose: prev.c,
    todayOpen: last.o,
    ndogHigh: ndogHigh,
    ndogLow: ndogLow,
    gapSize: gapSize,
    gapType: gapType,
    detail: gapType === "BULLISH" ? `Bullish gap — ${ndogLow.toFixed(2)} to ${ndogHigh.toFixed(2)}. Gap support at ${ndogLow}.` :
            gapType === "BEARISH" ? `Bearish gap — ${ndogHigh.toFixed(2)} to ${ndogLow.toFixed(2)}. Gap resistance at ${ndogHigh}.` :
            "No gap — flat open."
  };
}

// ═══ MAIN ═══
const weekdays = getWeekdayData();
const amd = getAMDPhase();
const range = getWeeklyRange();
const dayProfile = getDayProfileMatch();
const ndog = getNDOGLevels();

// Build a 5-day narrative
const dayBias = weekdays.days.map(d => `${d.day.substring(0,3)}:${d.hasData ? d.bias.toUpperCase() : "???"}`).join(" → ");
const dataNote = weekdays.completeness < 60
  ? `⚠️ Only ${weekdays.daysWithData}/5 days have engine data. Run session_start.cjs daily for full weekly context.`
  : `${weekdays.daysWithData}/5 days available.`;

const result = {
  pair: PAIR,
  date: DATE,
  weeklyData: {
    completeness: weekdays.completeness + "%",
    daysWithData: weekdays.daysWithData,
    daysMissing: weekdays.daysMissing,
    dayBias,
    dataNote,
    days: weekdays.days,
  },
  amd,
  weeklyRange: range,
  dayProfile,
  ndog,
  summary: `${dataNote} | ${amd.phase} → ${dayProfile.expected} | ${amd.structuralNote || dayProfile.tradePlan}`
};

console.log(JSON.stringify(result, null, 2));
