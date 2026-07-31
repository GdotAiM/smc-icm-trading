// Fluid Archetype Confidence — market-activated, not hardcoded
// Usage: node tools/tv-mcp/archetype_confidence.cjs PAIR DIRECTION
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = "C:/Users/cash/smc-icm-trading";
const DATE = new Date().toISOString().split("T")[0];
const PAIR = process.argv[2] || "XAUUSD";
const DIRECTION = (process.argv[3] || "BUY").toUpperCase();

function getEngine(tf, pairOverride) {
  const p = pairOverride || PAIR;
  try {
    let file = path.join(ROOT, "shared", DATE, p, `engine_${tf}.json`);
    if (!fs.existsSync(file) && p === "XAUUSD") file = path.join(ROOT, "shared", DATE, "GOLD", `engine_${tf}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch(e) { return null; }
}

function getNY() {
  try {
    const raw = execSync(`node "${path.join(ROOT, "tools", "ny_time.cjs")}" --now`, { encoding: "utf8", timeout: 10000, stdio: ["ignore", "pipe", "ignore"] });
    return JSON.parse(raw);
  } catch(e) { return null; }
}

// ═══════════════════════════════════════════════
// LAYER 4: POSITION TRADER (1W/1D)
// Context only. Does not veto. But being counter-trend here raises the bar.
// ═══════════════════════════════════════════════
function layerPosition() {
  const eng1w = getEngine("1w");
  const eng1d = getEngine("1d");
  const ny = getNY();
  const day = ny?.dayProfile?.name || "?";

  if (!eng1w?.structure || !eng1d?.structure) {
    return { active: false, confidence: 5, detail: "Weekly data unavailable — neutral weight" };
  }

  const bias1w = eng1w.structure.bias;
  const bias1d = eng1d.structure.bias;
  const event1w = eng1w.structure.lastEvent;
  const event1d = eng1d.structure.lastEvent;

  const ourDir = DIRECTION === "BUY" ? "bullish" : "bearish";
  const with1W = bias1w === ourDir;
  const with1D = bias1d === ourDir;
  const layersAgree = (with1W ? 1 : 0) + (with1D ? 1 : 0);

  // Weekly context notes
  let note = "";
  if (layersAgree === 2) note = "1W + 1D aligned with trade. Strong structural support.";
  else if (layersAgree === 1) note = with1W ? "1W supports but 1D disagrees. Mixed signal." : "1D supports but 1W disagrees. Higher timeframe caution.";
  else note = "Both 1W and 1D counter to trade. This is counter-trend on the macro level. Requires exceptional LTF confirmation.";

  // Friday: reduce weekly conviction
  const dayMult = day === "Friday" ? 0.6 : day === "Thursday" ? 1.3 : 1.0;

  return {
    active: true,
    bias1w, bias1d, event1w, event1d,
    with1W, with1D,
    layersAgree,
    confidence: Math.round(8 + layersAgree * 4 * dayMult), // 8-16 range
    note,
    detail: `1W:${bias1w} ${event1w} | 1D:${bias1d} ${event1d} | ${layersAgree}/2 layers agree`
  };
}

// ═══════════════════════════════════════════════
// LAYER 3: SWING TRADER (4H)
// Structural zones. Provides "where" — discount/premium.
// ═══════════════════════════════════════════════
function layerSwing() {
  const eng4h = getEngine("4h");
  const eng1h = getEngine("1h");

  if (!eng4h?.structure) {
    return { active: false, confidence: 8, detail: "4H data unavailable — neutral weight" };
  }

  const bias4h = eng4h.structure.bias;
  const event4h = eng4h.structure.lastEvent;
  const ourDir = DIRECTION === "BUY" ? "bullish" : "bearish";
  const with4H = bias4h === ourDir;

  // Check IPDA zone
  let zone = "UNKNOWN";
  let zoneBonus = 0;
  if (eng4h.ipda?.zone) {
    zone = eng4h.ipda.zone;
    if ((DIRECTION === "BUY" && zone === "DISCOUNT") || (DIRECTION === "SELL" && zone === "PREMIUM")) {
      zoneBonus = 12; // ICT-aligned: buy discount, sell premium
    } else if ((DIRECTION === "BUY" && zone === "PREMIUM") || (DIRECTION === "SELL" && zone === "DISCOUNT")) {
      zoneBonus = 0; // Counter to ICT zone rule
    }
  }

  const chochBonus = (event4h === "CHoCH" && with4H) ? 8 : 0; // CHoCH in our direction is strong
  const baseConfidence = with4H ? 20 : 5;
  const confidence = Math.round(baseConfidence + zoneBonus * 0.5 + chochBonus * 0.5);

  let note = "";
  if (with4H && event4h === "CHoCH") note = `4H CHoCH ${bias4h} — strong structural reversal in our direction.`;
  else if (with4H) note = `4H ${bias4h} BOS — aligned.`;
  else note = `Trading against 4H ${bias4h}. Need 3/3 LTF + SB window.`;

  if (zone !== "UNKNOWN") note += ` Price in ${zone} zone${zoneBonus > 0 ? ' (ICT-aligned)' : ''}.`;

  return {
    active: true,
    bias4h, event4h, zone,
    with4H, zoneBonus, chochBonus,
    confidence,
    note,
    detail: `4H:${bias4h} ${event4h} | Zone:${zone} | ${with4H ? 'WITH' : 'AGAINST'}`
  };
}

// ═══════════════════════════════════════════════
// LAYER 2: DAY TRADER (15m/1H) — ALWAYS ACTIVE
// Directional filter. CAN veto if counter-trend on all TFs.
// ═══════════════════════════════════════════════
function layerDay() {
  const eng15m = getEngine("15m");
  const eng5m = getEngine("5m");
  const eng1m = getEngine("1m");

  if (!eng5m?.structure) {
    return { active: true, confidence: 10, detail: "5m data missing — reduced confidence" };
  }

  const b15 = eng15m?.structure?.bias || "?";
  const b5 = eng5m.structure.bias;
  const b1 = eng1m?.structure?.bias || "?";

  const ourDir = DIRECTION === "BUY" ? "bullish" : "bearish";
  const tfsAgree = (b15 === ourDir ? 1 : 0) + (b5 === ourDir ? 1 : 0) + (b1 === ourDir ? 1 : 0);
  const allAligned = (b15 === b5 && b5 === b1);
  const counterTrend = tfsAgree === 0;

  // Confidence: 0-40 based on alignment
  const confidence = counterTrend ? 0 : Math.round(tfsAgree * 13.3);

  let note = "";
  if (counterTrend) note = "HARD BLOCK: 0/3 TFs agree. Counter-trend on ALL entry timeframes.";
  else if (tfsAgree === 3) note = "3/3 aligned. Strong directional agreement.";
  else if (tfsAgree === 2) note = "2/3 aligned. Direction supported but not unanimous.";
  else note = "1/3 aligned. Weak directional support. Need HTF context to justify.";

  return {
    active: true,
    b15, b5, b1,
    tfsAgree, allAligned, counterTrend,
    confidence,
    note,
    detail: `15m:${b15} 5m:${b5} 1m:${b1} | ${tfsAgree}/3 agree`
  };
}

// ═══════════════════════════════════════════════
// LAYER 1: SCALPER (1m/5m) — ALWAYS ACTIVE
// Entry timing. Checks for FVG, MSS, killzone window.
// ═══════════════════════════════════════════════
function layerScalp() {
  const ny = getNY();
  const eng5m = getEngine("5m");

  const hour = ny?.nyTime?.hour || 0;
  const sbActive = ny?.silverBullet?.active || false;
  const inKillzone = (hour >= 2 && hour < 5) || (hour >= 8 && hour < 11) || (hour >= 13 && hour < 16);
  const inSB = sbActive;
  const inManipulation = (hour >= 2 && hour < 3) || (hour >= 8 && hour < 9);

  // Check for recent sweeps (scalper's trigger)
  let hasSweep = false;
  if (eng5m?.liquidity) {
    hasSweep = eng5m.liquidity.some(l => l.swept);
  }

  // Window quality
  let windowScore = 0;
  if (inSB) windowScore = 15;    // SB = highest probability
  else if (inKillzone) windowScore = 10;  // KZ = good
  else windowScore = 3;  // Outside windows = low

  // Sweep bonus
  const sweepBonus = hasSweep ? 5 : 0;

  // Manipulation penalty
  const manipulationPenalty = inManipulation ? -5 : 0;

  const confidence = Math.max(0, Math.round(windowScore + sweepBonus + manipulationPenalty));

  let note = "";
  if (inSB && hasSweep) note = "SB window + sweep detected — ideal scalp conditions.";
  else if (inSB) note = "SB window active. Watch for FVG trigger.";
  else if (inKillzone) note = "Killzone active. Scalp entry valid if LTF confirms.";
  else note = "Outside primary windows. Reduced scalp probability.";
  if (inManipulation) note += " WARNING: Manipulation hour. Expect sweeps.";

  return {
    active: true,
    inKillzone, inSB, inManipulation, hasSweep,
    confidence,
    note,
    detail: `${inSB ? '🔫 SB' : inKillzone ? 'KZ' : 'No window'} | Sweep:${hasSweep ? 'YES' : 'no'}`
  };
}

// ═══════════════════════════════════════════════
// COMBINED FLUID CONFIDENCE
// ═══════════════════════════════════════════════
const position = layerPosition();
const swing = layerSwing();
const day = layerDay();
const scalp = layerScalp();

// Weight: Day + Scalp are primary (we trade intraday)
// Swing + Position are contextual (add or subtract from base)
const baseConfidence = Math.round((day.confidence + scalp.confidence) / 2);
const contextAdjustment = Math.round((swing.confidence - 10) * 0.3 + (position.confidence - 10) * 0.2);
const totalConfidence = Math.max(0, Math.min(100, baseConfidence + contextAdjustment));

// Counter-trend on LTF = hard block regardless of HTF context
const blocked = day.counterTrend;

// Sizing suggestion based on confidence
let sizing = "SKIP";
if (!blocked && totalConfidence >= 70) sizing = "FULL — pyramiding allowed";
else if (!blocked && totalConfidence >= 50) sizing = "STANDARD";
else if (!blocked && totalConfidence >= 30) sizing = "50% REDUCED";
else if (!blocked) sizing = "25% MICRO";

// Which timeframes are we with/against?
const withTFs = [];
const againstTFs = [];
if (position.with1W) withTFs.push("1W"); else againstTFs.push("1W");
if (position.with1D) withTFs.push("1D"); else againstTFs.push("1D");
if (swing.with4H) withTFs.push("4H"); else againstTFs.push("4H");

const result = {
  pair: PAIR,
  direction: DIRECTION,
  blocked,
  confidence: totalConfidence,
  sizing,
  layers: { position, swing, day, scalp },
  withTimeframes: withTFs,
  againstTimeframes: againstTFs,
  summary: blocked
    ? `BLOCKED: ${day.note}`
    : `${totalConfidence}% | ${sizing} | With: [${withTFs.join(',')}] Against: [${againstTFs.join(',')}] | ${day.note}`
};

console.log(JSON.stringify(result, null, 2));
process.exit(blocked ? 1 : 0);
