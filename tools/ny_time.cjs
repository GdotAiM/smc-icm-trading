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

module.exports = {
  getNYHour, getNYDay, getNYDate, getNYOffset,
  getNYSession, isInKillzoneNY, isInSilverBulletNY, isInJudasSwingNY,
  NY_KILLZONES, NY_SILVER_BULLET, NY_JUDAS_SWING, NY_DAYS,
};
