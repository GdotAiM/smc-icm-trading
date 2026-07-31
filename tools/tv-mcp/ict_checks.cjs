// ICT Advanced Checks — Judas Swing, SMT Divergence, Premium/Discount
// Usage: node tools/tv-mcp/ict_checks.cjs PAIR DIRECTION
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = "C:/Users/cash/smc-icm-trading";
const DATE = new Date().toISOString().split("T")[0];
const PAIR = process.argv[2] || "XAUUSD";
const DIRECTION = (process.argv[3] || "BUY").toUpperCase();

function run(cmd, timeout = 20000) {
  try { return execSync(cmd, { encoding: "utf8", timeout, stdio: ["ignore", "pipe", "pipe"] }); }
  catch(e) { return null; }
}

function getEngine(pair, tf, dateOverride) {
  try {
    const d = dateOverride || DATE;
    let file = path.join(ROOT, "shared", d, pair, `engine_${tf}.json`);
    if (!fs.existsSync(file) && pair === "XAUUSD") {
      file = path.join(ROOT, "shared", d, "GOLD", `engine_${tf}.json`);
    }
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch(e) { return null; }
}

function getNY() {
  const raw = run(`node "${path.join(ROOT, "tools", "ny_time.cjs")}" --now`);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// ═══════════════════════════════════════════════════
// CHECK 1: JUDAS SWING DETECTOR
// ═══════════════════════════════════════════════════
function checkJudasSwing() {
  const ny = getNY();
  if (!ny) return { pass: true, detail: "NY time unavailable" };

  const hour = ny.nyTime?.hour || 0;
  const session = ny.session?.name || "?";
  const sbActive = ny.silverBullet?.active || false;

  // Manipulation windows where Judas Swing is likely
  const isLondonManipulation = (hour >= 2 && hour < 3);
  const isNYAMManipulation = (hour >= 8 && hour < 9);
  const isManipulationWindow = isLondonManipulation || isNYAMManipulation;

  // Read 5m engine for recent sweep data
  const engine5m = getEngine(PAIR, "5m");
  let recentSweep = false;
  let sweepDetail = "";

  if (engine5m?.liquidity) {
    const sweeps = engine5m.liquidity.filter(l => l.swept);
    if (sweeps.length > 0) {
      recentSweep = true;
      const lastSweep = sweeps[sweeps.length - 1];
      sweepDetail = `Recent ${lastSweep.type} sweep at ${lastSweep.price?.toFixed(2)}. `;
    }
  }

  // Determine risk
  let warning = null;
  let risk = "LOW";

  if (isManipulationWindow && recentSweep) {
    risk = "HIGH";
    warning = `⚠️ JUDAS SWING ACTIVE: ${session} manipulation hour (${hour}:00). ${sweepDetail}Price likely to sweep further before reversing. Do NOT enter before the sweep completes. Consider placing SL beyond the swept level + 1 ATR buffer.`;
  } else if (isManipulationWindow) {
    risk = "MEDIUM";
    warning = `⚠️ Manipulation hour (${hour}:00 NY). Judas Swing possible. Wait for sweep to complete. If entering, use wider SL.`;
  } else if (recentSweep && hour >= 3 && hour < 5 && sbActive) {
    risk = "LOW";
    warning = `✅ Post-sweep SB window. ${sweepDetail}The sweep likely completed. Good entry timing if structure confirms.`;
  }

  return {
    pass: risk !== "HIGH", // HIGH risk blocks, MEDIUM warns
    risk,
    manipulationWindow: isManipulationWindow,
    recentSweep,
    sbActive,
    warning,
    detail: warning || `No Judas Swing risk. ${session} — ${sbActive ? "SB active" : "No SB"}.`
  };
}

// ═══════════════════════════════════════════════════
// CHECK 2: SMT DIVERGENCE (Dollar Pairs Only)
// ═══════════════════════════════════════════════════
function checkSMTDivergence() {
  // SMT only applies to dollar pairs (EURUSD, GBPUSD)
  if (PAIR !== "EURUSD" && PAIR !== "GBPUSD") {
    return { pass: true, applicable: false, detail: "SMT only applies to dollar pairs" };
  }

  const otherPair = PAIR === "EURUSD" ? "GBPUSD" : "EURUSD";
  const our5m = getEngine(PAIR, "5m");
  const other5m = getEngine(otherPair, "5m");

  if (!our5m?.structure || !other5m?.structure) {
    return { pass: true, detail: "Engine data missing for SMT check — cannot verify" };
  }

  const ourBias = our5m.structure.bias;
  const otherBias = other5m.structure.bias;
  const ourEvent = our5m.structure.lastEvent;
  const otherEvent = other5m.structure.lastEvent;

  // SMT Divergence: pairs move in OPPOSITE directions at key levels
  const diverging = (ourBias === "bullish" && otherBias === "bearish") ||
                    (ourBias === "bearish" && otherBias === "bullish");
  const bothSame = ourBias === otherBias;

  let warning = null;
  let pass = true;

  if (bothSame) {
    warning = `⚠️ EURUSD & GBPUSD both ${ourBias.toUpperCase()} — correlated dollar move. Taking both is redundant risk. Pick ONE or skip both.`;
  } else if (diverging) {
    warning = `✅ SMT DIVERGENCE: ${PAIR} is ${ourBias} while ${otherPair} is ${otherBias}. Pair-specific move — higher confidence.`;
  }

  // Don't block, but warn heavily if both same direction
  return {
    pass,
    applicable: true,
    diverging,
    correlated: bothSame,
    ourBias,
    otherBias,
    ourEvent,
    otherEvent,
    warning,
    detail: warning || `${PAIR}:${ourBias} vs ${otherPair}:${otherBias} — ${diverging ? "DIVERGING ✅" : "CORRELATED ⚠️"}`
  };
}

// ═══════════════════════════════════════════════════
// CHECK 3: PREMIUM / DISCOUNT ZONE
// ═══════════════════════════════════════════════════
function checkPremiumDiscount() {
  const engines = {};
  const tfs = ["1h", "4h", "1d"];
  let allDiscount = 0, allPremium = 0, totalTFs = 0;

  for (const tf of tfs) {
    const eng = getEngine(PAIR, tf);
    if (!eng?.ipda) continue;
    engines[tf] = eng.ipda;
    totalTFs++;
    if (eng.ipda.zone === "DISCOUNT") allDiscount++;
    if (eng.ipda.zone === "PREMIUM") allPremium++;
  }

  if (totalTFs === 0) {
    return { pass: true, detail: "IPDA zone data unavailable — run session_start.cjs" };
  }

  const dominantZone = allDiscount > allPremium ? "DISCOUNT" :
                       allPremium > allDiscount ? "PREMIUM" : "EQUILIBRIUM";
  const consensus = Math.round((Math.max(allDiscount, allPremium) / totalTFs) * 100);

  // ICT: Buy in discount, sell in premium
  let warning = null;
  const buyingInPremium = DIRECTION === "BUY" && dominantZone === "PREMIUM";
  const sellingInDiscount = DIRECTION === "SELL" && dominantZone === "DISCOUNT";
  const buyingInDiscount = DIRECTION === "BUY" && dominantZone === "DISCOUNT";
  const sellingInPremium = DIRECTION === "SELL" && dominantZone === "PREMIUM";

  if (buyingInPremium) {
    warning = `⚠️ BUYING into PREMIUM zone (${consensus}% consensus across ${totalTFs} TFs). ICT: "Buy in discount, sell in premium." Higher risk of reversal. Consider waiting for pullback to discount.`;
  } else if (sellingInDiscount) {
    warning = `⚠️ SELLING into DISCOUNT zone (${consensus}% consensus across ${totalTFs} TFs). ICT: "Buy in discount, sell in premium." Higher risk of reversal. Consider waiting for rally to premium.`;
  } else if (buyingInDiscount) {
    warning = `✅ Buying in DISCOUNT zone (${consensus}% consensus). ICT-aligned entry.`;
  } else if (sellingInPremium) {
    warning = `✅ Selling in PREMIUM zone (${consensus}% consensus). ICT-aligned entry.`;
  }

  return {
    pass: true, // Never blocks, always warns
    dominantZone,
    consensus,
    totalTFs,
    zoneBreakdown: engines,
    ictAligned: buyingInDiscount || sellingInPremium,
    warning,
    detail: warning || `${dominantZone} zone (${consensus}% consensus)`
  };
}

// ═══ MAIN ═══
const judas = checkJudasSwing();
const smt = checkSMTDivergence();
const pmd = checkPremiumDiscount();

const result = {
  pair: PAIR,
  direction: DIRECTION,
  checks: [
    { name: "JUDAS_SWING", ...judas },
    { name: "SMT_DIVERGENCE", ...smt },
    { name: "PREMIUM_DISCOUNT", ...pmd },
  ],
  blocks: [judas, smt].filter(c => !c.pass).map(c => c.name),
  go: [judas, smt].every(c => c.pass),
};

console.log(JSON.stringify(result, null, 2));
process.exit(result.go ? 0 : 1);
