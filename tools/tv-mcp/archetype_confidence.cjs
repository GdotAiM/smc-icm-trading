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
// LAYER 3: SWING TRADER (4H) + IPDA DEALING RANGE
// Structural zones + Market Maker Model. Provides "where".
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

  // Run IPDA dealing range analysis
  let ipdaData = null;
  try {
    const { execSync: es } = require("child_process");
    const raw = es(`node "${path.join(ROOT, "tools", "tv-mcp", "ipda_range.cjs")}" ${PAIR}`, {
      encoding: "utf8", timeout: 15000, stdio: ["ignore", "pipe", "ignore"]
    });
    if (raw) ipdaData = JSON.parse(raw);
  } catch(e) {}

  const mmModel = ipdaData?.marketMakerModel?.model || "UNKNOWN";
  const mmDetail = ipdaData?.marketMakerModel?.detail || "";
  const priceZone = ipdaData?.position?.["40-period"]?.zone || "UNKNOWN";
  const priceAtEq = ipdaData?.position?.["40-period"]?.pctFromLow || 50;
  const eqCascade = ipdaData?.equilibriumCascade || "";

  // Zone bonus based on ICT rule: buy discount, sell premium
  let zoneBonus = 0;
  const buyingInDiscount = DIRECTION === "BUY" && (priceZone === "DISCOUNT" || priceZone === "BELOW_EQ");
  const sellingInPremium = DIRECTION === "SELL" && (priceZone === "PREMIUM" || priceZone === "ABOVE_EQ");
  const ictAligned = buyingInDiscount || sellingInPremium;

  if (ictAligned) zoneBonus = 12;
  else if (priceZone === "ABOVE_EQ" || priceZone === "BELOW_EQ") zoneBonus = 5; // Near equilibrium = neutral

  // MM Model bonus
  let mmBonus = 0;
  if (mmModel.includes("MMBM") && DIRECTION === "BUY") mmBonus = 10;
  if (mmModel.includes("MMSM") && DIRECTION === "SELL") mmBonus = 10;
  if (mmModel.includes("LATE CYCLE")) mmBonus = -5;

  const chochBonus = (event4h === "CHoCH" && with4H) ? 8 : 0;
  const baseConfidence = with4H ? 20 : 5;
  const confidence = Math.round(baseConfidence + zoneBonus * 0.5 + chochBonus * 0.5 + mmBonus * 0.5);

  let note = "";
  if (with4H && event4h === "CHoCH") note = `4H CHoCH ${bias4h} — structural reversal.`;
  else if (with4H) note = `4H ${bias4h} BOS — aligned.`;
  else note = `Against 4H ${bias4h}. Need 3/3 LTF + SB.`;

  note += ` ${mmModel}. ${mmDetail.substring(0, 80)}`;

  return {
    active: true,
    bias4h, event4h, with4H,
    zone: priceZone, ictAligned,
    mmModel, mmDetail, eqCascade,
    zoneBonus, chochBonus, mmBonus,
    confidence,
    note,
    detail: `4H:${bias4h} ${event4h} | ${priceZone} (${priceAtEq}%) | ${mmModel}`
  };
}

// ═══════════════════════════════════════════════
// LAYER 2: DAY TRADER (15m/1H) — ALWAYS ACTIVE
// Directional filter with SWING CONTEXT CASCADE.
// Receives HTF IPDA/MM info to inform LTF entries.
// ═══════════════════════════════════════════════
function layerDay(swingLayer) {
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
  let confidence = counterTrend ? 0 : Math.round(tfsAgree * 13.3);

  // ═══ SWING CONTEXT CASCADE ═══
  // The day trader receives HTF information to contextualize LTF entries
  let swingContext = "";
  let contextBonus = 0;

  if (swingLayer?.active) {
    const mmModel = swingLayer.mmModel || "";
    const zone = swingLayer.zone || "";
    const eqCascade = swingLayer.eqCascade || "";
    const with4H = swingLayer.with4H;

    // Fractal: if 4H is in discount and we're buying, the 15m is riding the IPDA delivery
    if (mmModel.includes("MMBM") && DIRECTION === "BUY") {
      swingContext = `4H MMBM in discount → IPDA delivering UP. 15m entries in buy direction have structural support. Target 4H equilibrium at ≈${eqCascade.split('→')[0]?.match(/[\d.]+/)?.[0] || '?'}.`;
      contextBonus = 10;
    } else if (mmModel.includes("MMSM") && DIRECTION === "SELL") {
      swingContext = `4H MMSM in premium → IPDA delivering DOWN. 15m entries in sell direction have structural support.`;
      contextBonus = 10;
    } else if (mmModel.includes("LATE CYCLE")) {
      swingContext = `4H in late cycle — IPDA move may be exhausted. LTF entries have reduced probability. Consider waiting for new dealing range to establish.`;
      contextBonus = -5;
    } else if (with4H) {
      swingContext = `4H aligned with trade direction — LTF entries have HTF wind at their back.`;
      contextBonus = 5;
    } else if (!with4H && tfsAgree >= 2) {
      swingContext = `Trading against 4H but 2/3 LTFs agree — possible counter-trend scalp. Tight SL, small target.`;
      contextBonus = 0; // Allow but don't encourage
    }
  }

  confidence = Math.round(confidence + contextBonus * 0.5);

  let note = "";
  if (counterTrend) note = "HARD BLOCK: 0/3 TFs agree.";
  else if (tfsAgree === 3) note = "3/3 aligned.";
  else if (tfsAgree === 2) note = "2/3 aligned.";
  else note = "1/3 aligned. Weak.";

  if (swingContext) note += " " + swingContext;

  return {
    active: true,
    b15, b5, b1,
    tfsAgree, allAligned, counterTrend,
    confidence,
    swingContext,
    note,
    detail: `15m:${b15} 5m:${b5} 1m:${b1} | ${tfsAgree}/3 agree | HTF: ${swingLayer?.mmModel || '?'}`
  };
}

// ═══════════════════════════════════════════════
// LAYER 1: SCALPER (1m/5m) — ALWAYS ACTIVE
// Entry timing. Receives fractal context from Day + Swing layers.
// ═══════════════════════════════════════════════
function layerScalp(swingLayer, dayLayer) {
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
  if (inSB) windowScore = 15;
  else if (inKillzone) windowScore = 10;
  else windowScore = 3;

  const sweepBonus = hasSweep ? 5 : 0;
  const manipulationPenalty = inManipulation ? -5 : 0;

  let confidence = Math.max(0, Math.round(windowScore + sweepBonus + manipulationPenalty));

  // ═══ FRACTAL CONTEXT CASCADE ═══
  // The scalper receives information from the day trader and swing trader
  // ICT: patterns repeat across timeframes — what the 4H does, the 1m echoes
  let fractalContext = "";
  let fractalBonus = 0;

  if (dayLayer?.active && swingLayer?.active) {
    const dayAligned = dayLayer.tfsAgree >= 2;
    const swingAligned = swingLayer.with4H;
    const mmModel = swingLayer.mmModel || "";

    if (dayAligned && swingAligned && mmModel.includes("MMBM") && DIRECTION === "BUY") {
      fractalContext = "FULL STACK: 4H MMBM → 15m aligned → 1m entry. Fractal confluence. Scale in.";
      fractalBonus = 12;
    } else if (dayAligned && swingAligned && mmModel.includes("MMSM") && DIRECTION === "SELL") {
      fractalContext = "FULL STACK: 4H MMSM → 15m aligned → 1m entry. Fractal confluence. Scale in.";
      fractalBonus = 12;
    } else if (dayAligned && !swingAligned) {
      fractalContext = "PARTIAL: 15m aligned but against 4H. Scalp only — tight SL, small target. Don't pyramid.";
      fractalBonus = 3;
    } else if (!dayAligned && swingAligned) {
      fractalContext = "WAIT: 4H supports but 15m not ready. Let LTF catch up to HTF. Patience.";
      fractalBonus = 0;
    } else {
      fractalContext = "NO STACK: Neither 4H nor 15m support. Skip.";
    }
  }

  confidence = Math.round(confidence + fractalBonus * 0.5);

  let note = "";
  if (inSB && hasSweep) note = "SB + sweep — ideal.";
  else if (inSB) note = "SB active.";
  else if (inKillzone) note = "KZ active.";
  else note = "No window.";
  if (inManipulation) note += " MANIPULATION.";
  if (fractalContext) note += " " + fractalContext;

  return {
    active: true,
    inKillzone, inSB, inManipulation, hasSweep,
    confidence,
    fractalContext,
    note,
    detail: `${inSB ? '🔫 SB' : inKillzone ? 'KZ' : 'No win'} | Sweep:${hasSweep ? 'YES' : 'no'} | ${fractalContext?.substring(0, 40) || ''}`
  };
}

// ═══════════════════════════════════════════════
// COMBINED FLUID CONFIDENCE
// ═══════════════════════════════════════════════
const position = layerPosition();
const swing = layerSwing();
const day = layerDay(swing);     // Day receives swing context
const scalp = layerScalp(swing, day); // Scalp receives swing + day fractal context

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
