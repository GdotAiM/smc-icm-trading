// ICT Bread and Butter — Buy + Sell Intraday Scalp Framework
// Audited against innercircletrader.net 2026-07-31
//
// Two IPDA price engines cycle across 4 sessions:
//   Offset: Fresh stop hunt (sweep extreme → fake breakout → reversal)
//   Re-accumulation/distribution: Retrace into existing PD array → reload → reversal
//
// 4 sessions (NY local time):
//   London (00:00-05:00) | NY (08:20 AM) | London Close (10:30 AM-1 PM) | Asia (7:00 PM)
//
// Usage: node tools/bread_and_butter.cjs PAIR

const fs = require("fs");
const path = require("path");
const ny = require("./ny_time.cjs");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..");
const DATE = new Date().toISOString().split("T")[0];
const PAIR = process.argv[2] || "GBPUSD";

function r5(v) { return Number(v).toFixed(5); }
function r2(v) { return Number(v).toFixed(2); }

function loadEngine(tf) {
  try {
    const dir = PAIR === "XAUUSD" ? "GOLD" : PAIR;
    return JSON.parse(fs.readFileSync(path.join(ROOT, "shared", DATE, dir, `engine_${tf}.json`), "utf8"));
  } catch { return null; }
}

function loadCandles(tf) {
  try {
    const dir = PAIR === "XAUUSD" ? "GOLD" : PAIR;
    return JSON.parse(fs.readFileSync(path.join(ROOT, "shared", DATE, dir, `candles_${tf}.json`), "utf8"));
  } catch { return null; }
}

// ═══ GET NY TIME + ACTIVE SESSION ═══
function getNYSession() {
  const nyHour = ny.getNYHour();
  const nyMin = ny.getNYMin();
  const nyTime = new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false });

  let session = null;
  // NY local time session windows
  if (nyHour >= 0 && nyHour < 5) session = { id: "london", label: "London Open", window: "00:00-05:00 NY" };
  else if (nyHour >= 5 && nyHour < 8) session = { id: "london_retest", label: "London Retest Window", window: "05:00-08:00 NY" };
  else if (nyHour >= 8 && nyHour < 10) session = { id: "ny_open", label: "New York Open (CME)", window: "08:00-10:00 NY" };
  else if (nyHour >= 10 && nyHour < 13) session = { id: "london_close", label: "London Close (Counter-Trend)", window: "10:00 AM-1:00 PM NY" };
  else if (nyHour >= 13 && nyHour < 16) session = { id: "ny_pm", label: "NY PM Session", window: "1:00-4:00 PM NY" };
  else if (nyHour >= 19 || nyHour < 0) session = { id: "asia", label: "Asia Open", window: "7:00 PM NY" };
  else session = { id: "transition", label: "Session Transition", window: `${nyHour}:00 NY — monitoring` };

  return { nyHour, nyMin, nyTime, session };
}

// ═══ HTF BIAS ═══
function getHTFBias(reports) {
  const dBias = reports["1D"]?.structure?.bias || "neutral";
  const h4Bias = reports["4H"]?.structure?.bias || "neutral";
  const aligned = dBias === h4Bias && dBias !== "neutral";
  return { bias: aligned ? dBias : "neutral", daily: dBias, h4: h4Bias, aligned, detail: aligned ? `${dBias.toUpperCase()} aligned 1D+4H` : "NOT ALIGNED" };
}

// ═══ TWO-ENGINE CLASSIFIER ═══
// Offset: fresh stop hunt (wick through extreme, body close back inside)
// Re-accumulation: retrace into existing PD array without fresh sweep
function classifyEngine(sessionHigh, sessionLow, currentPrice, reports) {
  const r1h = reports["1H"];
  const sweptPools = (r1h?.liquidity || []).filter(p => p.swept);
  const sweptAbove = sweptPools.filter(p => p.type === "BSL" && p.price >= sessionHigh * 0.998);
  const sweptBelow = sweptPools.filter(p => p.type === "SSL" && p.price <= sessionLow * 1.002);

  // Offset: fresh sweep of session extreme
  if (sweptAbove.length > 0 && currentPrice < sessionHigh) {
    return { engine: "OFFSET-DISTRIBUTION", direction: "SELL", detail: `Offset: Session high swept @ ${r5(sweptAbove[0].price)}, price reversed back below. Fake breakout → sell.` };
  }
  if (sweptBelow.length > 0 && currentPrice > sessionLow) {
    return { engine: "OFFSET-ACCUMULATION", direction: "BUY", detail: `Offset: Session low swept @ ${r5(sweptBelow[0].price)}, price reversed back above. Fake breakout → buy.` };
  }

  // Re-accumulation/distribution: retrace into PD array zone without fresh sweep
  const fvgs = (r1h?.fvgs || []).filter(f => (f.fillFraction || 0) < 0.5);
  const obs = (r1h?.orderBlocks || []);
  const nearPremiumFVG = fvgs.find(f => f.type === "bearish" && Math.abs((f.top + f.bottom) / 2 - currentPrice) / currentPrice < 0.003);
  const nearDiscountFVG = fvgs.find(f => f.type === "bullish" && Math.abs((f.top + f.bottom) / 2 - currentPrice) / currentPrice < 0.003);

  if (nearPremiumFVG) {
    return { engine: "RE-DISTRIBUTION", direction: "SELL", detail: `Re-Distribution: Price near premium FVG @ ${r5((nearPremiumFVG.top + nearPremiumFVG.bottom) / 2)}. PD array retest → sell.` };
  }
  if (nearDiscountFVG) {
    return { engine: "RE-ACCUMULATION", direction: "BUY", detail: `Re-Accumulation: Price near discount FVG @ ${r5((nearDiscountFVG.top + nearDiscountFVG.bottom) / 2)}. PD array retest → buy.` };
  }

  return { engine: "NONE", direction: "neutral", detail: "No active engine — no sweep or PD array retest detected." };
}

// ═══ PER-SESSION SETUP DETECTOR ═══
function getSessionSetup(session, htfBias, reports, candles5m) {
  if (!session) return null;

  const r1h = reports["1H"];
  const currentPrice = r1h?.price || 0;

  // Default scalp params
  const params = {
    london:       { tp: "20-30 pips", sl: "Beyond swept extreme", risk: "0.5-1%", maxHold: "1-2 hours" },
    ny_open:      { tp: "20-30 pips", sl: "Beyond swept extreme", risk: "0.5-1%", maxHold: "1-2 hours" },
    london_close: { tp: "20-30% daily range", sl: "10 pips beyond day high/low", risk: "Tight", maxHold: "1-2 hours" },
    ny_pm:        { tp: "15-25 pips", sl: "Beyond swept extreme", risk: "0.5-1%", maxHold: "1-2 hours" },
    asia:         { tp: "15-20 pips", sl: "Beyond swept extreme", risk: "Small", maxHold: "1-2 hours" },
    transition:   { tp: "10-15 pips", sl: "Beyond swept extreme", risk: "Minimal", maxHold: "30 min" },
  };

  // London Close has strict prerequisites
  if (session.id === "london_close") {
    const dRange = Math.abs((r1h?.structure?.lastSwingHigh || currentPrice * 1.01) - (r1h?.structure?.lastSwingLow || currentPrice * 0.99));
    const needsAlignment = htfBias.aligned; // Both London and NY must move together
    if (!needsAlignment) return { active: false, detail: "London Close: HTF not aligned — London+NY must move together." };

    // Counter-trend: if HTF bullish → London Close is a SELL retracement. If HTF bearish → BUY retracement.
    const counterDirection = htfBias.bias === "bullish" ? "SELL" : htfBias.bias === "bearish" ? "BUY" : null;
    if (!counterDirection) return { active: false, detail: "London Close: neutral bias — no counter-trend setup." };

    return {
      active: true, session: session.id, label: session.label,
      direction: counterDirection,
      engine: "COUNTER-TREND RETRACEMENT",
      tp: `${r2(0.25 * dRange)} (25% of daily range ${r5(dRange)})`,
      sl: `10 pips beyond day's ${counterDirection === 'SELL' ? 'high' : 'low'}`,
      risk: params.london_close.risk,
      detail: `London Close: HTF ${htfBias.bias} → counter-trend ${counterDirection} retracement. TP: 25% daily range. SL: 10 pips.`,
    };
  }

  // Asia: simple open-price scalp
  if (session.id === "asia") {
    return {
      active: true, session: session.id, label: session.label,
      direction: htfBias.bias === "bullish" ? "BUY" : htfBias.bias === "bearish" ? "SELL" : "neutral",
      engine: "ASIA RANGE FORMATION",
      tp: "15-20 pips", sl: "Beyond swept extreme",
      risk: params.asia.risk,
      detail: `Asia Open: ${htfBias.bias.toUpperCase()} bias → scalp ${htfBias.bias === 'bullish' ? 'BUY' : 'SELL'} from open. TP: 15-20 pips.`,
    };
  }

  // London and NY: use the two-engine classifier with session range
  const sessionCandles = candles5m || [];
  const recentHigh = sessionCandles.length > 5 ? Math.max(...sessionCandles.slice(-20).map(c => c.high)) : currentPrice * 1.005;
  const recentLow = sessionCandles.length > 5 ? Math.min(...sessionCandles.slice(-20).map(c => c.low)) : currentPrice * 0.995;

  const engine = classifyEngine(recentHigh, recentLow, currentPrice, reports);

  if (engine.engine === "NONE") {
    return { active: false, detail: `${session.label}: No engine active — no sweep or PD array retest.` };
  }

  // Validate against HTF bias
  const biasMatch = (htfBias.bias === "bullish" && engine.direction === "BUY") ||
                    (htfBias.bias === "bearish" && engine.direction === "SELL");
  const confidence = biasMatch ? "HIGH" : htfBias.bias === "neutral" ? "MEDIUM" : "LOW (counter-bias)";

  const scalpParams = params[session.id] || params.london;

  return {
    active: true,
    session: session.id, label: session.label,
    direction: engine.direction,
    engine: engine.engine,
    confidence,
    tp: scalpParams.tp,
    sl: scalpParams.sl,
    risk: scalpParams.risk,
    maxHold: scalpParams.maxHold,
    detail: `${session.label}: ${engine.engine} → ${engine.direction}. Confidence: ${confidence}. TP: ${scalpParams.tp}. SL: ${scalpParams.sl}. ${engine.detail}`,
  };
}

// ═══ MAIN ═══
function analyzeBreadAndButter(pair) {
  const p = pair || PAIR;
  const reports = {};
  for (const tf of ["1D", "4H", "1H", "5m"]) reports[tf] = loadEngine(tf);

  const candles5m = loadCandles("5m");
  const htfBias = getHTFBias(reports);
  const nySession = getNYSession();
  const setup = getSessionSetup(nySession.session, htfBias, reports, candles5m);

  return {
    pair: p,
    time: nySession.nyTime,
    session: nySession.session,
    htfBias,
    setup,
    detail: setup?.detail || "No Bread and Butter setup for current session.",
  };
}

// ═══ OUTPUT ═══
const result = analyzeBreadAndButter(PAIR);

const outDir = path.join(ROOT, "stages", "03_session_time", "output");
fs.mkdirSync(outDir, { recursive: true });

let md = `# Bread and Butter — ${result.pair} — ${DATE}\n\n`;
md += `## Session: ${result.session?.label || 'None'} (${result.session?.window || 'N/A'})\n`;
md += `## HTF Bias: ${result.htfBias.detail}\n\n`;
if (result.setup?.active) {
  md += `## Active Setup\n`;
  md += `- **Direction**: ${result.setup.direction}\n`;
  md += `- **Engine**: ${result.setup.engine}\n`;
  md += `- **Confidence**: ${result.setup.confidence}\n`;
  md += `- **TP**: ${result.setup.tp}\n`;
  md += `- **SL**: ${result.setup.sl}\n`;
  md += `- **Risk**: ${result.setup.risk}\n`;
  md += `- **Max Hold**: ${result.setup.maxHold}\n`;
  md += `- ${result.setup.detail}\n`;
} else {
  md += `## No Active Setup\n${result.setup?.detail || 'N/A'}\n`;
}

const outFile = path.join(outDir, `${PAIR.toLowerCase()}_bread_and_butter.md`);
fs.writeFileSync(outFile, md, "utf8");

console.log(`\n═══ BREAD AND BUTTER — ${PAIR} ═══`);
console.log(`  Session: ${result.session?.label || 'None'} (${result.nySession?.nyTime || '?'})`);
console.log(`  HTF: ${result.htfBias.detail}`);
console.log(`  Setup: ${result.setup?.detail || 'None'}`);
console.log(`  ✓ Output → ${outFile}`);

module.exports = { analyzeBreadAndButter, classifyEngine, getSessionSetup, getNYSession };
