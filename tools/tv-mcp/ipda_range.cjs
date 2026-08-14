// ICT IPDA Dealing Ranges — 20/40/60 period, equilibrium, premium/discount
// Usage: node tools/tv-mcp/ipda_range.cjs PAIR
const fs = require("fs");
const path = require("path");

const ROOT = "C:/Users/cash/smc-icm-trading";
const DATE = require("../ny_time.cjs").getNYDate();
const PAIR = process.argv[2] || "XAUUSD";

function getCandles(tf) {
  try {
    let file = path.join(ROOT, "shared", DATE, PAIR, `candles_${tf}.json`);
    if (!fs.existsSync(file) && PAIR === "XAUUSD") file = path.join(ROOT, "shared", DATE, "GOLD", `candles_${tf}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch(e) { return null; }
}

function getEngine(tf) {
  try {
    let file = path.join(ROOT, "shared", DATE, PAIR, `engine_${tf}.json`);
    if (!fs.existsSync(file) && PAIR === "XAUUSD") file = path.join(ROOT, "shared", DATE, "GOLD", `engine_${tf}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch(e) { return null; }
}

// ═══ IPDA Dealing Range ═══
function calcDealingRange(candles, period) {
  if (!candles || candles.length < period) return null;
  const slice = candles.slice(-period);
  const high = Math.max(...slice.map(c => c.high || c.h));
  const low = Math.min(...slice.map(c => c.low || c.l));
  const range = high - low;
  const equilibrium = low + range / 2;
  const premiumTop = equilibrium + range * 0.25;  // Upper premium
  const discountBottom = equilibrium - range * 0.25; // Lower discount

  return { high, low, range, equilibrium, premiumTop, discountBottom, period };
}

// ═══ Market Maker Model Detection ═══
function detectMMModel(eng4h, dealingRange, currentPrice) {
  if (!eng4h?.structure) return { model: "UNKNOWN", detail: "No 4H structure data" };

  const bias = eng4h.structure.bias;
  const event = eng4h.structure.lastEvent;
  const lastSwingHigh = eng4h.structure.lastSwingHigh;
  const lastSwingLow = eng4h.structure.lastSwingLow;

  // Market Maker Buy Model (MMBM): Price moves from discount to premium
  // Market Maker Sell Model (MMSM): Price moves from premium to discount

  const inDiscount = currentPrice < dealingRange.equilibrium;
  const inPremium = currentPrice > dealingRange.equilibrium;
  const nearEquilibrium = Math.abs(currentPrice - dealingRange.equilibrium) / dealingRange.range < 0.1;

  // Draw direction from engine
  const draw = eng4h.draw?.direction || "?";

  let model = "UNKNOWN";
  let detail = "";

  if (bias === "bullish" && inDiscount && event === "CHoCH") {
    model = "MMBM (Market Maker Buy Model)";
    detail = "Price in discount, 4H CHoCH bullish. IPDA delivering price UP through equilibrium toward premium. Buy at discount, target premium.";
  } else if (bias === "bullish" && inDiscount) {
    model = "MMBM EARLY";
    detail = "Price in discount, 4H bullish. Waiting for CHoCH confirmation. Potential buy setup forming.";
  } else if (bias === "bearish" && inPremium && event === "CHoCH") {
    model = "MMSM (Market Maker Sell Model)";
    detail = "Price in premium, 4H CHoCH bearish. IPDA delivering price DOWN through equilibrium toward discount. Sell at premium, target discount.";
  } else if (bias === "bearish" && inPremium) {
    model = "MMSM EARLY";
    detail = "Price in premium, 4H bearish. Waiting for CHoCH confirmation. Potential sell setup forming.";
  } else if (bias === "bullish" && inPremium) {
    model = "LATE CYCLE";
    detail = "Price already in premium on bullish bias. Expansion may continue but risk/reward deteriorating. Consider waiting for pullback to discount.";
  } else if (bias === "bearish" && inDiscount) {
    model = "LATE CYCLE";
    detail = "Price already in discount on bearish bias. Downside may continue but risk/reward deteriorating. Consider waiting for rally to premium.";
  } else if (nearEquilibrium) {
    model = "EQUILIBRIUM";
    detail = "Price at equilibrium — IPDA transitioning. Wait for direction to establish. Both buy and sell models possible.";
  }

  return { model, detail, inDiscount, inPremium, nearEquilibrium, bias, event, draw };
}

// ═══ MAIN ═══
const candles4h = getCandles("4h");
const candles1d = getCandles("1d");
const eng4h = getEngine("4h");
const eng1d = getEngine("1d");

const ranges = {};
for (const [name, candles, period] of [
  ["20-period", candles4h, 20],
  ["40-period", candles4h, 40],
  ["60-period", candles1d, 60]
]) {
  const range = calcDealingRange(candles, period);
  if (range) ranges[name] = range;
}

// Current price from most recent candle
const last4h = candles4h ? candles4h[candles4h.length - 1] : null;
const currentPrice = last4h ? (last4h.close || last4h.c) : null;

// Primary dealing range (40-period for swing context)
const primaryRange = ranges["40-period"] || ranges["20-period"];
const mmModel = primaryRange && currentPrice && eng4h
  ? detectMMModel(eng4h, primaryRange, currentPrice)
  : { model: "UNKNOWN", detail: "Insufficient data for MM model detection" };

// Price position in each range
const position = {};
for (const [name, range] of Object.entries(ranges)) {
  if (!currentPrice) continue;
  const pctFromLow = ((currentPrice - range.low) / range.range) * 100;
  const zone = pctFromLow > 75 ? "PREMIUM" : pctFromLow > 50 ? "ABOVE_EQ" : pctFromLow > 25 ? "BELOW_EQ" : "DISCOUNT";
  position[name] = { zone, pctFromLow: Math.round(pctFromLow), price: currentPrice, equilibrium: range.equilibrium };
}

// Equilibrium cascade: how equilibriums stack across periods
const eqCascade = Object.entries(ranges)
  .map(([name, r]) => `${name.split('-')[0]}p EQ: ${r.equilibrium.toFixed(2)}`)
  .join(" → ");

const result = {
  pair: PAIR,
  currentPrice,
  dealingRanges: ranges,
  position,
  marketMakerModel: mmModel,
  equilibriumCascade: eqCascade,
  summary: mmModel.model !== "UNKNOWN"
    ? `${mmModel.model}: ${mmModel.detail}`
    : "IPDA data incomplete — run session_start.cjs"
};

console.log(JSON.stringify(result, null, 2));
