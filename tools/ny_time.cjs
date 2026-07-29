// NY Time Module — All ICT time references MUST use New York (Eastern) time.
// ICT: "Everything is based on New York local time. Not UTC. Not London. New York."

const NY_TIMEZONE = "America/New_York";

// NY offset from UTC: EST = -5, EDT = -4
// US DST: 2nd Sunday March → 1st Sunday November
function getNYOffset() {
  const now = new Date();
  const year = now.getUTCFullYear();
  // Compute 2nd Sunday of March
  const mar1 = new Date(Date.UTC(year, 2, 1)); // March 1
  const mar2ndSun = new Date(Date.UTC(year, 2, (14 - mar1.getUTCDay()) % 7 + 8));
  // Compute 1st Sunday of November
  const nov1 = new Date(Date.UTC(year, 10, 1)); // November 1
  const nov1stSun = new Date(Date.UTC(year, 10, (7 - nov1.getUTCDay()) % 7 + 1));
  const ts = now.getTime();
  return (ts >= mar2ndSun.getTime() && ts < nov1stSun.getTime()) ? -4 : -5;
}

function getNYHour() {
  const utcHour = new Date().getUTCHours();
  const offset = getNYOffset();
  let nyHour = utcHour + offset;
  if (nyHour < 0) nyHour += 24;
  if (nyHour >= 24) nyHour -= 24;
  return nyHour;
}

function getNYDay() {
  const utcHour = new Date().getUTCHours();
  const offset = getNYOffset();
  const nyHour = utcHour + offset;
  const now = new Date();
  // If UTC hour + offset < 0, it's still previous day in NY
  if (nyHour < 0) {
    const prev = new Date(now.getTime() - 86400000);
    return prev.getDay();
  }
  return now.getDay();
}

function getNYDate() {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const offset = getNYOffset();
  const nyHour = utcHour + offset;
  if (nyHour < 0) {
    const prev = new Date(now.getTime() - 86400000);
    return prev.toISOString().split("T")[0];
  }
  return now.toISOString().split("T")[0];
}

// ICT Killzone times in NY LOCAL time
const NY_KILLZONES = {
  asia:      { start: 20, end: 24, label: "Asia (prev day evening)", character: "Accumulation / Range-bound" },
  asiaLate:  { start: 0, end: 2, label: "Asia (overnight)", character: "Low liquidity drift" },
  london:    { start: 2, end: 5, label: "London Killzone", character: "Institutional flow, manipulation" },
  londonPM:  { start: 5, end: 8, label: "London PM / Pre-NY", character: "European distribution, trend building" },
  nyAM:      { start: 8, end: 11, label: "NY AM Killzone", character: "Highest volume, displacement" },
  nyLunch:   { start: 11, end: 13, label: "NY Lunch", character: "Low liquidity, avoid entries" },
  nyPM:      { start: 13, end: 16, label: "NY PM Session", character: "Afternoon continuation / reversal" },
  nyClose:   { start: 16, end: 17, label: "NY Close", character: "Position squaring, no new entries" },
  offHours:  { start: 17, end: 20, label: "Off Hours", character: "Very low liquidity, avoid trading" },
};

// ICT Silver Bullet windows in NY LOCAL time
const NY_SILVER_BULLET = {
  londonSB: { start: 3, end: 4, label: "London Silver Bullet" },
  nyAMSB:   { start: 10, end: 11, label: "NY AM Silver Bullet" },
  nyPMSB:   { start: 14, end: 15, label: "NY PM Silver Bullet" },
};

// ICT Judas Swing windows in NY LOCAL time
const NY_JUDAS_SWING = {
  londonOpen: { start: 2, end: 3, label: "London Open Judas Swing" },
  nyOpen:     { start: 8, end: 9, label: "NY Open Judas Swing" },
};

function getNYSession() {
  const h = getNYHour();
  for (const [key, zone] of Object.entries(NY_KILLZONES)) {
    if (h >= zone.start && h < zone.end) {
      return { name: key, ...zone, hour: h };
    }
  }
  return { name: "unknown", label: "Unknown", character: "Unknown", hour: h };
}

function isInKillzoneNY() {
  const s = getNYSession();
  return ["london", "londonPM", "nyAM", "nyPM"].includes(s.name);
}

function isInSilverBulletNY() {
  const h = getNYHour();
  for (const [key, sb] of Object.entries(NY_SILVER_BULLET)) {
    if (h >= sb.start && h < sb.end) return { active: true, ...sb };
  }
  return { active: false };
}

function isInJudasSwingNY() {
  const h = getNYHour();
  for (const [key, js] of Object.entries(NY_JUDAS_SWING)) {
    if (h >= js.start && h < js.end) return { active: true, ...js };
  }
  return { active: false };
}

// NY day-of-week for ICT calendar
const NY_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ═══════════════ ICT DAY PROFILES ═══════════════
const DAY_PROFILES = {
  0: { name: "Sunday",     character: "Weekly prep. Low volume, gap analysis only.", risk: "None", multiplier: 0.0, bestModels: [], notes: "No trading. Prepare for the week." },
  1: { name: "Monday",     character: "Range Set Day. Weekly range established.", risk: "Low", multiplier: 0.8, bestModels: ["Asian Range","NWOG/NDOG","Judas Swing"], notes: "Don't trade first 2h of London. Wait for weekly range to set." },
  2: { name: "Tuesday",    character: "Continuation Day. Monday extends or reverses.", risk: "Medium", multiplier: 1.0, bestModels: ["Breaker Block","OTE + OB","Silver Bullet"], notes: "If Monday range-bound, Tuesday expands. Watch for turnaround." },
  3: { name: "Wednesday",  character: "Reversal Day. Often marks weekly high/low.", risk: "Medium-High", multiplier: 1.2, bestModels: ["Turtle Soup","Judas Swing","Silver Bullet (NY AM)"], notes: "Highest probability reversal day. NY AM critical." },
  4: { name: "Thursday",   character: "Expansion Day. Strongest trending day.", risk: "High", multiplier: 1.3, bestModels: ["MMXM","Unicorn","SCOB","2FVG","OTE + OB"], notes: "Best day for trend trades. Highest MMXM win rate." },
  5: { name: "Friday",     character: "Position Squaring. Profit-taking dominates.", risk: "Low", multiplier: 0.6, bestModels: ["Silver Bullet (AM only)"], notes: "Close all positions by NY close. No new swings. No weekend holds." },
  6: { name: "Saturday",   character: "Market closed.", risk: "None", multiplier: 0.0, bestModels: [], notes: "No trading." },
};

// Weekly cycle position based on day + session
function getWeeklyPosition(nyHour, nyDay) {
  if (nyDay === 1) return nyHour < 12 ? "Monday AM — Gap analysis, weekly range not yet set" : "Monday PM — Weekly range setting, high/low of week often forms now";
  if (nyDay === 2) return "Tuesday — Range extending or reversing. 'Turnaround Tuesday'";
  if (nyDay === 3) return nyHour < 12 ? "Wednesday AM — Weekly reversal zone" : "Wednesday PM — Weekly expansion begins. Big move incoming.";
  if (nyDay === 4) return "Thursday — Weekly expansion peak. Strongest trending. ★ MMXM prime time.";
  if (nyDay === 5) return nyHour < 12 ? "Friday AM — Late continuation or early squaring" : "Friday PM — Close all positions. No new trades.";
  return "Weekend — No trading";
}

// Monthly/quarterly event detection
function getMacroEvents() {
  const now = new Date();
  const dom = now.getUTCDate();
  const month = now.getUTCMonth(); // 0-11
  const day = now.getUTCDay();
  const year = now.getUTCFullYear();
  const events = [];

  // NFP: 1st Friday
  if (dom <= 7 && day === 5) events.push({ event: "NFP Week", impact: "Extreme", action: "No positions 30min before/after release" });

  // Options expiry: 3rd Friday
  if (dom >= 15 && dom <= 21 && day === 5) events.push({ event: "Options Expiry", impact: "High — pinning", action: "Expect range-bound, avoid breakouts" });

  // Month-end: last 2-3 trading days
  const lastDay = new Date(year, month + 1, 0).getDate();
  if (dom >= lastDay - 2) events.push({ event: "Month-End Rebalancing", impact: "Medium", action: "Institutional flow can reverse technicals" });

  // Quarter-end
  if ([2,5,8,11].includes(month) && dom >= lastDay - 4) events.push({ event: "Quarter-End", impact: "High", action: "Major rebalancing. Expect unusual correlations." });

  // CPI week (2nd week, rough)
  if (dom >= 8 && dom <= 14 && day >= 1 && day <= 4) events.push({ event: "CPI/Inflation Window", impact: "High", action: "Tighten SL, reduce size" });

  return events;
}

// Day-of-week cycle estimate (fallback when macro_context returns UNKNOWN)
// Based on model_cycle_map.md day+cycle combined table
function getCycleEstimate(nyDay, nyHour) {
  if (nyDay === 1) return "ACCUMULATION";
  if (nyDay === 2) return "MANIPULATION";
  if (nyDay === 3) return "MANIPULATION";
  if (nyDay === 4) return nyHour < 12 ? "DISTRIBUTION" : "EXPANSION";
  if (nyDay === 5) return nyHour < 12 ? "EXPANSION" : "ACCUMULATION";
  return "ACCUMULATION";
}

// Next Silver Bullet window
function getNextSB(nyHour) {
  if (nyHour < 3) return { window: "London SB", time: "03:00-04:00 NY", countdown: (3 - nyHour) + "h" };
  if (nyHour === 3) return { window: "London SB", time: "NOW — 03:00-04:00 NY", countdown: "ACTIVE" };
  if (nyHour < 10) return { window: "NY AM SB", time: "10:00-11:00 NY", countdown: (10 - nyHour) + "h" };
  if (nyHour === 10) return { window: "NY AM SB", time: "NOW — 10:00-11:00 NY", countdown: "ACTIVE" };
  if (nyHour < 14) return { window: "NY PM SB", time: "14:00-15:00 NY", countdown: (14 - nyHour) + "h" };
  if (nyHour === 14) return { window: "NY PM SB", time: "NOW — 14:00-15:00 NY", countdown: "ACTIVE" };
  return { window: "London SB (tomorrow)", time: "03:00-04:00 NY", countdown: ((27 - nyHour) % 24) + "h" };
}

// ═══════════════ CLI ═══════════════
if (require.main === module) {
  const mode = process.argv[2] || "--now";
  const sb = isInSilverBulletNY();
  const js = isInJudasSwingNY();
  const session = getNYSession();
  const kz = isInKillzoneNY();
  const nyDay = getNYDay();
  const nyHour = getNYHour();
  const dayProfile = DAY_PROFILES[nyDay] || DAY_PROFILES[0];
  const nextSB = getNextSB(nyHour);
  const macroEvents = getMacroEvents();
  const weeklyPosition = getWeeklyPosition(nyHour, nyDay);

  const reliability = sb.active ? 1.5 : kz ? 1.3 : session.name === "nyLunch" ? 0.4 : session.name === "offHours" ? 0.3 : 1.0;
  const dayMultiplier = dayProfile.multiplier;
  const combinedMultiplier = (reliability * dayMultiplier).toFixed(2);
  const cycleEstimate = getCycleEstimate(nyDay, nyHour);

  const output = {
    now: new Date().toISOString(),
    nyTime: { hour: nyHour, day: NY_DAYS[nyDay], dayIndex: nyDay },
    session: { name: session.label, character: session.character, killzone: kz, reliability: reliability },
    cycleEstimate: cycleEstimate,
    dayProfile: { name: dayProfile.name, character: dayProfile.character, risk: dayProfile.risk, multiplier: dayMultiplier, bestModels: dayProfile.bestModels, notes: dayProfile.notes },
    silverBullet: { active: sb.active, current: sb.active ? sb.label : null, next: nextSB },
    judasSwing: { active: js.active, current: js.active ? js.label : null },
    weeklyPosition: weeklyPosition,
    multipliers: { session: reliability, day: dayMultiplier, combined: combinedMultiplier },
    tradeable: kz && !["nyLunch","offHours","nyClose"].includes(session.name) && dayMultiplier > 0,
    macroEvents: macroEvents,
    rules: {
      noTrade: session.name === "offHours" ? "Off hours — no liquidity" :
                session.name === "nyLunch" ? "NY Lunch — low liquidity, avoid entries" :
                session.name === "nyClose" ? "NY Close approaching — tighten stops, no new entries" : null,
      dayNote: dayProfile.notes,
      fridayRule: nyDay === 5 ? "CLOSE ALL POSITIONS by 16:00 NY. No weekend holds." : null,
    }
  };

  if (mode === "--full" || mode === "-f") {
    console.log(JSON.stringify(output, null, 2));
  } else {
    // Compact mode
    console.log(JSON.stringify({
      nyTime: output.nyTime,
      session: output.session,
      cycleEstimate: output.cycleEstimate,
      dayProfile: { name: output.dayProfile.name, multiplier: output.dayProfile.multiplier },
      silverBullet: output.silverBullet,
      combinedMultiplier: output.multipliers.combined,
      tradeable: output.tradeable,
      nextSB: nextSB.window + " " + nextSB.time,
    }, null, 2));
  }
  process.exit(0);
}

module.exports = {
  getNYHour, getNYDay, getNYDate, getNYOffset,
  getNYSession, isInKillzoneNY, isInSilverBulletNY, isInJudasSwingNY,
  NY_KILLZONES, NY_SILVER_BULLET, NY_JUDAS_SWING, NY_DAYS,
};
