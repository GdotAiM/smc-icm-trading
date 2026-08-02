// ICT Weekly Range Profile Engine — 12-Profile Classification System
// Audited against innercircletrader.net 2026-07-31
//
// The Weekly Range Profiles predict which day the weekly high or low will form
// and how price behaves around the HTF PD array. This is the highest-level
// context layer — above daily bias, above session routing, above entry models.
//
// Profiles I-XII:
//   I:   Classic Tuesday Low (bullish)       VII:  Consolidation Midweek Rally (bullish)
//   II:  Classic Tuesday High (bearish)       VIII: Consolidation Midweek Decline (bearish)
//   III: Wednesday Low (bullish)              IX:   Seek & Destroy Bullish Friday (LOW PROB — SKIP)
//   IV:  Wednesday High (bearish)             X:    Seek & Destroy Bearish Friday (LOW PROB — SKIP)
//   V:   Consolidation Thursday Bull Rev      XI:   Wednesday Weekly Bullish Reversal
//   VI:  Consolidation Thursday Bear Rev      XII:  Wednesday Weekly Bearish Reversal
//
// Usage: node tools/weekly_profile_engine.cjs PAIR

const fs = require("fs");
const path = require("path");
const ny = require("./ny_time.cjs");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..");
const DATE = new Date().toISOString().split("T")[0];
const PAIR = process.argv[2] || "GBPUSD";

function r5(v) { return Number(v).toFixed(5); }
function r2(v) { return Number(v).toFixed(2); }

function loadEngine(tf, dateOverride) {
  try {
    const d = dateOverride || DATE;
    const dir = PAIR === "XAUUSD" ? "GOLD" : PAIR;
    return JSON.parse(fs.readFileSync(path.join(ROOT, "shared", d, dir, `engine_${tf}.json`), "utf8"));
  } catch { return null; }
}

function loadCandles(tf, dateOverride) {
  try {
    const d = dateOverride || DATE;
    const dir = PAIR === "XAUUSD" ? "GOLD" : PAIR;
    return JSON.parse(fs.readFileSync(path.join(ROOT, "shared", d, dir, `candles_${tf}.json`), "utf8"));
  } catch { return null; }
}

// ═══ HTF PD ARRAY CONTEXT ═══
// The foundation — profiles cannot be classified without this
function getHTFContext(reports) {
  const w = reports["1W"];
  const d = reports["1D"];
  if (!d) return null;

  const currentPrice = d.price;
  const pdArray1D = d.pdArray;
  const pdArray1W = w?.pdArray;

  // Use 1D PD array primarily, fall back to structure swing extremes
  const premiumHigh = pdArray1D?.rangeHigh || d.structure?.lastSwingHigh || currentPrice * 1.02;
  const discountLow = pdArray1D?.rangeLow || d.structure?.lastSwingLow || currentPrice * 0.98;
  const midpoint = pdArray1D?.midpoint || (premiumHigh + discountLow) / 2;

  const inPremium = currentPrice > midpoint;
  const inDiscount = currentPrice < midpoint;

  // Which array is untouched (price hasn't reached it yet this week)?
  const weeklyCandles = loadCandles("1w");
  const thisWeekHigh = weeklyCandles?.[weeklyCandles.length - 1]?.high || currentPrice;
  const thisWeekLow = weeklyCandles?.[weeklyCandles.length - 1]?.low || currentPrice;

  const premiumUntouched = thisWeekHigh < premiumHigh;
  const discountUntouched = thisWeekLow > discountLow;

  return {
    currentPrice,
    premiumHigh, discountLow, midpoint,
    inPremium, inDiscount,
    premiumUntouched, discountUntouched,
    detail: `HTF Arrays: Premium @ ${r5(premiumHigh)} (${premiumUntouched ? 'UNTOCUHED' : 'touched'}) | Discount @ ${r5(discountLow)} (${discountUntouched ? 'UNTOUCHED' : 'touched'}) | Price in ${inPremium ? 'PREMIUM' : inDiscount ? 'DISCOUNT' : 'MID'} zone`
  };
}

// ═══ DAY-BY-DAY ARRAY REACH CHECK ═══
// Tracks whether price reached the array on each day this week
function checkArrayReach(reports, htfContext) {
  if (!htfContext) return { monReached: false, tueReached: false, wedReached: false };

  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon...5=Fri
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));

  const result = { monReached: false, tueReached: false, wedReached: false };

  for (let i = 0; i < Math.min(dayOfWeek, 5); i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = d.toISOString().split("T")[0];
    const engine1D = loadEngine("1d", dateStr);
    if (!engine1D) continue;

    const dayHigh = engine1D.structure?.lastSwingHigh || engine1D.price;
    const dayLow = engine1D.structure?.lastSwingLow || engine1D.price;

    const reachedPremium = dayHigh >= htfContext.premiumHigh * 0.998;
    const reachedDiscount = dayLow <= htfContext.discountLow * 1.002;

    if (i === 0) result.monReached = reachedPremium || reachedDiscount;
    if (i === 1) result.tueReached = reachedPremium || reachedDiscount;
    if (i === 2) result.wedReached = reachedPremium || reachedDiscount;
  }

  return result;
}

// ═══ BIAS DETECTION ═══
function getHTFBias(reports) {
  const wBias = reports["1W"]?.structure?.bias || "neutral";
  const dBias = reports["1D"]?.structure?.bias || "neutral";
  const h4Bias = reports["4H"]?.structure?.bias || "neutral";
  const aligned = (wBias === dBias || dBias === h4Bias) && dBias !== "neutral";
  return {
    bias: aligned ? dBias : (wBias !== "neutral" ? wBias : "neutral"),
    weekly: wBias, daily: dBias, h4: h4Bias,
    aligned,
    detail: `${wBias}→${dBias}→${h4Bias} — ${aligned ? 'ALIGNED' : 'MIXED'}`,
  };
}

// ═══ NEWS / SKIP-WEEK DETECTION ═══
function checkSkipWeekRisk() {
  const today = new Date();
  const month = today.getMonth(); // 0=Jan, 6=Jul, 7=Aug
  const dayOfWeek = today.getDay();
  const dayOfMonth = today.getDate();

  // Summer months (July=6, August=7) → elevated IX/X risk
  const isSummer = month === 6 || month === 7;

  // NFP week = first Friday of the month
  const isNFPWeek = dayOfWeek === 5 && dayOfMonth <= 7;

  // Check for FOMC week (3rd week approximation)
  const isFOMCWeek = dayOfMonth >= 14 && dayOfMonth <= 21;

  const skipRisk = (isSummer ? 1 : 0) + (isNFPWeek ? 2 : 0) + (isFOMCWeek ? 1 : 0);

  return {
    isSummer,
    isNFPWeek,
    isFOMCWeek,
    skipRisk, // 0=none, 1-2=elevated, 3+=high
    elevated: skipRisk >= 2,
    detail: skipRisk >= 2
      ? `⚠️ ELEVATED SEEK & DESTROY RISK (${[
          isSummer ? 'Summer' : '',
          isNFPWeek ? 'NFP Week' : '',
          isFOMCWeek ? 'FOMC Week' : ''
        ].filter(Boolean).join(', ')}) — Profiles IX/X likely. Consider skipping.`
      : skipRisk >= 1
        ? `Slight IX/X risk (${isSummer ? 'Summer' : isFOMCWeek ? 'FOMC' : ''}) — monitor.`
        : "Normal week — low IX/X risk.",
  };
}

// ═══ DAY OF WEEK ═══
function getDayInfo() {
  const dayOfWeek = ny.getNYDay(); // 0=Sun, 1=Mon...5=Fri (NY local)
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const nyTime = new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false });
  const nyHour = ny.getNYHour();

  return {
    dayOfWeek,
    dayName: dayNames[dayOfWeek],
    isMonday: dayOfWeek === 1,
    isTuesday: dayOfWeek === 2,
    isWednesday: dayOfWeek === 3,
    isThursday: dayOfWeek === 4,
    isFriday: dayOfWeek === 5,
    isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    isThursday2PM: dayOfWeek === 4 && nyHour === 14, // 2:00 PM NY = Thursday catalyst
    nyTime, nyHour,
  };
}

// ═══ 12-PROFILE CLASSIFICATION ═══
function classifyProfile(reports) {
  const htf = getHTFContext(reports);
  const bias = getHTFBias(reports);
  const day = getDayInfo();
  const skipRisk = checkSkipWeekRisk();
  const arrayReach = checkArrayReach(reports, htf);

  if (day.isWeekend || !htf || bias.bias === "neutral") {
    return {
      profileId: null,
      profileName: "NO CLASSIFICATION",
      confidence: 0,
      bias: bias.bias,
      detail: day.isWeekend ? "Weekend — no profile classification." : bias.bias === "neutral" ? "Neutral bias — cannot classify." : "Insufficient HTF data.",
      candidates: [],
      skipWeek: false,
    };
  }

  const isBullish = bias.bias === "bullish";
  const candidates = [];
  const profileDefs = getProfileDefinitions();

  // Filter candidates by bias (halves the set)
  const eligibleProfiles = Object.entries(profileDefs)
    .filter(([id, def]) => def.bias === bias.bias || def.bias === "neutral")
    .map(([id, def]) => ({ id: parseInt(id), ...def }));

  // Score each candidate based on current conditions
  for (const profile of eligibleProfiles) {
    let score = 0;
    const reasons = [];

    // Day matching
    if (day.isMonday && [1, 2, 3, 4, 7, 8, 11, 12].includes(profile.id)) {
      score += 2; reasons.push("Monday — eligible");
    }
    if (day.isTuesday && [1, 2, 3, 4, 11, 12].includes(profile.id)) {
      score += profile.id <= 4 ? 3 : 2; reasons.push("Tuesday — primary delivery day");
    }
    if (day.isWednesday && [3, 4, 11, 12, 7, 8].includes(profile.id)) {
      score += profile.id <= 4 || profile.id >= 11 ? 3 : 2; reasons.push("Wednesday — delivery/reversal day");
    }
    if (day.isThursday && [5, 6, 7, 8].includes(profile.id)) {
      score += profile.id <= 6 ? 3 : 2; reasons.push("Thursday — expansion/reversal");
    }
    if (day.isFriday && [7, 8, 9, 10].includes(profile.id)) {
      score += profile.id >= 9 ? 1 : 2; reasons.push("Friday — resolution day");
    }

    // Array reach elimination
    if (arrayReach.monReached && [3, 4, 5, 6, 7, 8, 11, 12].includes(profile.id)) {
      score += 2; reasons.push("Monday reached array — Tue profiles eliminated");
    }
    if (!arrayReach.monReached && !arrayReach.tueReached && [3, 4, 11, 12].includes(profile.id)) {
      score += 3; reasons.push("Array untouched Mon-Tue — Wednesday profiles likely");
    }
    if (arrayReach.tueReached && [5, 6, 7, 8].includes(profile.id)) {
      score += (day.isWednesday || day.isThursday) ? 3 : 1; reasons.push("Tuesday reached — Thu/Fri profiles");
    }

    // HTF array context
    if (isBullish && htf.discountUntouched) {
      if ([1, 3, 5, 11].includes(profile.id)) { score += 2; reasons.push("Discount untouched — target below"); }
    }
    if (!isBullish && htf.premiumUntouched) {
      if ([2, 4, 6, 12].includes(profile.id)) { score += 2; reasons.push("Premium untouched — target above"); }
    }

    // Skip-week risk
    if (skipRisk.elevated && [9, 10].includes(profile.id)) {
      score += 4; reasons.push("Skip risk elevated — IX/X likely");
    }
    if (!skipRisk.elevated && [9, 10].includes(profile.id)) {
      score -= 3; reasons.push("Normal week — IX/X unlikely");
    }

    // Thursday 2PM catalyst
    if (day.isThursday2PM && [5, 6].includes(profile.id)) {
      score += 4; reasons.push("Thursday 2PM NY catalyst ACTIVE");
    }

    // Wednesday close invalidation check
    if (day.isThursday && !arrayReach.wedReached && [1, 2, 3, 4, 11, 12].includes(profile.id)) {
      score -= 5; reasons.push("INVALIDATED — expected extreme not formed by Wednesday close");
    }

    candidates.push({ ...profile, score, reasons });
  }

  // Sort by score
  candidates.sort((a, b) => b.score - a.score);

  // Top candidate
  const top = candidates[0];
  const confidence = candidates.length > 0
    ? Math.min(100, Math.round((top.score / Math.max(1, candidates[0]?.score || 1)) * 100))
    : 0;

  // Determine if this is a skip week
  const skipWeek = skipRisk.elevated && [9, 10].includes(top?.id);

  return {
    profileId: top?.id || null,
    profileName: top?.name || "UNCLASSIFIED",
    confidence: skipWeek ? Math.round(confidence * 0.5) : confidence,
    bias: bias.bias,
    direction: isBullish ? "BULLISH" : "BEARISH",
    targetDay: top?.dayOfExtreme || "Unknown",
    targetZone: isBullish ? "DISCOUNT" : "PREMIUM",
    behavior: top?.behavior || "Unknown",
    skipWeek,
    skipRiskDetail: skipRisk.detail,
    candidates: candidates.slice(0, 4).map(c => ({
      id: c.id, name: c.name, score: c.score, dayOfExtreme: c.dayOfExtreme, reasons: c.reasons
    })),
    detail: top
      ? `${top.name} (Profile ${romanNumeral(top.id)}) — ${top.behavior}. Target: ${top.dayOfExtreme} ${isBullish ? 'LOW' : 'HIGH'} at ${isBullish ? 'discount' : 'premium'} array. Confidence: ${confidence}%. ${skipWeek ? '⚠️ SKIP WEEK — IX/X risk elevated.' : ''}`
      : "Unable to classify weekly profile.",
  };
}

// ═══ WEEKLY ANCHOR ═══
// Translates profile classification into trade direction + boosts
function getWeeklyAnchor(classification) {
  if (!classification || !classification.profileId) {
    return {
      direction: "neutral",
      targetDay: null,
      targetZone: null,
      boostMultiplier: 1.0,
      counterWeight: 1.0,
      skipWeek: false,
      detail: "No weekly profile — neutral anchor.",
    };
  }

  const isBullish = classification.direction === "BULLISH";
  const skipWeek = classification.skipWeek;

  return {
    direction: isBullish ? "BUY" : "SELL",
    targetDay: classification.targetDay,
    targetZone: isBullish ? "DISCOUNT (below)" : "PREMIUM (above)",
    // Direction boost: stronger early in the week, weaker later
    boostMultiplier: skipWeek ? 0.3 : 1.4,    // Aligned models get ×1.4
    counterWeight: skipWeek ? 0.3 : 0.3,       // Opposing models get ×0.3 (higher TF veto)
    skipWeek,
    detail: skipWeek
      ? `⚠️ SEEK & DESTROY WEEK — all models reduced to ×0.3. Skip trading.`
      : `Weekly Anchor: ${isBullish ? 'BULLISH' : 'BEARISH'} — ${classification.targetDay} ${isBullish ? 'LOW' : 'HIGH'} expected. Aligned models ×1.4, opposing ×0.7.`,
  };
}

// ═══ PROFILE DEFINITIONS ═══
function getProfileDefinitions() {
  return {
    1:  { name: "Classic Tuesday Low",          bias: "bullish", dayOfExtreme: "Tuesday",     behavior: "Monday manipulation → Tuesday drop into discount → rally" },
    2:  { name: "Classic Tuesday High",         bias: "bearish", dayOfExtreme: "Tuesday",     behavior: "Monday manipulation → Tuesday rally into premium → drop" },
    3:  { name: "Wednesday Low",                bias: "bullish", dayOfExtreme: "Wednesday",   behavior: "Mon-Tue manipulation → Wednesday drop into discount → rally" },
    4:  { name: "Wednesday High",               bias: "bearish", dayOfExtreme: "Wednesday",   behavior: "Mon-Tue manipulation → Wednesday rally into premium → drop" },
    5:  { name: "Consolidation Thu Bullish Rev",bias: "bullish", dayOfExtreme: "Thursday 2PM",behavior: "Mon-Wed consolidation → Thursday run intra-wk low → reject → reverse up" },
    6:  { name: "Consolidation Thu Bearish Rev",bias: "bearish", dayOfExtreme: "Thursday 2PM",behavior: "Mon-Wed consolidation → Thursday run intra-wk high → reject → reverse down" },
    7:  { name: "Consolidation Midweek Rally",  bias: "bullish", dayOfExtreme: "Wed→Friday",  behavior: "Mon-Wed consolidation → expansion up through highs into Friday" },
    8:  { name: "Consolidation Midweek Decline",bias: "bearish", dayOfExtreme: "Wed→Friday",  behavior: "Mon-Wed consolidation → expansion down through lows into Friday" },
    9:  { name: "Seek & Destroy Bullish Friday",bias: "neutral",dayOfExtreme: "Friday",       behavior: "Mon-Thu choppy both-side stops → Friday expansion up — LOW PROB, SKIP" },
    10: { name: "Seek & Destroy Bearish Friday",bias: "neutral",dayOfExtreme: "Friday",       behavior: "Mon-Thu choppy both-side stops → Friday expansion down — LOW PROB, SKIP" },
    11: { name: "Wednesday Weekly Bullish Rev", bias: "bullish", dayOfExtreme: "Wednesday",   behavior: "Mon-Tue consolidation → Wednesday sell-stop raid at LT low → strong reversal up" },
    12: { name: "Wednesday Weekly Bearish Rev", bias: "bearish", dayOfExtreme: "Wednesday",   behavior: "Mon-Tue consolidation → Wednesday buy-stop raid at LT high → strong reversal down" },
  };
}

function romanNumeral(n) {
  const r = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
  return r[n] || String(n);
}

// ═══ MAIN ═══
function analyzeWeeklyProfile(pair) {
  const p = pair || PAIR;
  const reports = {};
  for (const tf of ["1W", "1D", "4H", "1H"]) {
    reports[tf] = loadEngine(tf);
  }

  const day = getDayInfo();
  const htf = getHTFContext(reports);
  const bias = getHTFBias(reports);
  const classification = classifyProfile(reports);
  const anchor = getWeeklyAnchor(classification);

  return {
    pair: p,
    date: DATE,
    day: day.dayName,
    nyTime: day.nyTime,
    htf,
    bias,
    classification,
    anchor,
    detail: [
      `Day: ${day.dayName} ${day.nyTime} NY`,
      htf?.detail || "No HTF context",
      `Bias: ${bias.detail}`,
      classification.detail,
      anchor.detail,
    ].join("\n"),
  };
}

// ═══ OUTPUT ═══
const result = analyzeWeeklyProfile(PAIR);

const outDir = path.join(ROOT, "stages", "00_macro_context", "output");
fs.mkdirSync(outDir, { recursive: true });

let md = `# Weekly Range Profile — ${result.pair} — ${DATE}\n\n`;
md += `## Day: ${result.day} ${result.nyTime} NY\n\n`;
md += `## HTF Context\n${result.htf?.detail || 'N/A'}\n\n`;
md += `## Bias\n${result.bias?.detail || 'N/A'}\n\n`;

md += `## Profile Classification\n`;
md += `**${result.classification.profileName}** (${result.classification.confidence}% confidence)\n`;
md += `- Direction: ${result.classification.direction}\n`;
md += `- Target Day: ${result.classification.targetDay}\n`;
md += `- Behavior: ${result.classification.behavior}\n`;
md += `- Skip Week: ${result.classification.skipWeek ? '⚠️ YES' : '✅ No'}\n`;
md += `- ${result.classification.skipRiskDetail}\n\n`;

md += `### Candidate Profiles\n`;
md += `| ID | Profile | Score | Day of Extreme | Reasons |\n`;
md += `|----|---------|-------|----------------|----------|\n`;
for (const c of result.classification.candidates) {
  md += `| ${romanNumeral(c.id)} | ${c.name} | ${c.score} | ${c.dayOfExtreme} | ${c.reasons.join(', ')} |\n`;
}

md += `\n## Weekly Anchor\n`;
md += `- Direction: **${result.anchor.direction}**\n`;
md += `- Boost: ×${result.anchor.boostMultiplier} (agreeing) / ×${result.anchor.counterWeight} (opposing)\n`;
md += `- ${result.anchor.detail}\n`;

const outFile = path.join(outDir, `${PAIR.toLowerCase()}_weekly_profile.md`);
fs.writeFileSync(outFile, md, "utf8");
console.log(`  ✓ Weekly Profile → ${outFile}`);

// Console summary
console.log(`\n═══ WEEKLY PROFILE — ${PAIR} — ${result.day} ═══`);
console.log(`  HTF: ${result.htf?.detail || 'N/A'}`);
console.log(`  Bias: ${result.bias?.detail}`);
console.log(`  Profile: ${result.classification.profileName} (${result.classification.confidence}%)`);
console.log(`  Target: ${result.classification.targetDay} ${result.classification.direction === 'BULLISH' ? 'LOW' : 'HIGH'}`);
console.log(`  Anchor: ${result.anchor.detail}`);
if (result.anchor.skipWeek) console.log(`  ⚠️ SEEK & DESTROY — skip trading this week`);

module.exports = { analyzeWeeklyProfile, classifyProfile, getWeeklyAnchor, getHTFContext, getHTFBias, checkSkipWeekRisk, getDayInfo };
