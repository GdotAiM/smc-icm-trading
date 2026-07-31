// Pre-entry confluence check — flags risks, doesn't blindly block
// ICT: Price AND time together. Not time alone. Not price alone.
// Returns: { go, confidence, warnings, checks }
const { execSync } = require("child_process");
const path = require("path");

const ROOT = "C:/Users/cash/smc-icm-trading";
const NODE_PATH = path.join(ROOT, "tools", "tv-mcp", "node_modules");

const PAIR = process.argv[2] || "XAUUSD";
const DIRECTION = (process.argv[3] || "BUY").toUpperCase();

function run(cmd, timeout = 30000) {
  try { return execSync(cmd, { encoding: "utf8", timeout, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NODE_PATH } }); }
  catch(e) { return null; }
}

// ═══ CHECK 1: What is price saying? (Multi-TF alignment) ═══
function checkPriceAction() {
  const raw = run(`node "${path.join(ROOT, "tools", "tv-mcp", "scan_all_pairs.cjs")}"`, 90000);
  if (!raw) return { pass: false, warning: "BLIND — scan_all_pairs.cjs failed. Cannot read price." };

  try {
    const pairs = JSON.parse(raw);
    const target = pairs.find(p => p.pair === PAIR);
    if (!target) return { pass: false, warning: PAIR + " not in scan" };

    const t15 = target.trend15m;
    const t5 = target.trend5m;
    const t1 = target.trend1m;
    const align = (t15 === t5 && t5 === t1) ? 3 : (t15 === t5 || t5 === t1) ? 2 : 1;

    const trends = [t15, t5, t1];
    const bullishCount = trends.filter(t => t === "BULLISH").length;
    const bearishCount = trends.filter(t => t === "BEARISH").length;
    const dominantTrend = bullishCount >= bearishCount ? "BULLISH" : "BEARISH";

    const dirMatch = DIRECTION === (dominantTrend === "BULLISH" ? "BUY" : "SELL");

    // How many TFs agree with OUR direction?
    const tfsAgreeWithUs = (DIRECTION === "BUY" && t15 === "BULLISH" ? 1 : 0) +
                           (DIRECTION === "BUY" && t5 === "BULLISH" ? 1 : 0) +
                           (DIRECTION === "BUY" && t1 === "BULLISH" ? 1 : 0) +
                           (DIRECTION === "SELL" && t15 === "BEARISH" ? 1 : 0) +
                           (DIRECTION === "SELL" && t5 === "BEARISH" ? 1 : 0) +
                           (DIRECTION === "SELL" && t1 === "BEARISH" ? 1 : 0);

    if (tfsAgreeWithUs === 0) {
      return { pass: false, warning: `HARD BLOCK: 0/3 TFs agree with ${DIRECTION}. All TFs are ${dominantTrend}. This is a pure counter-trend trade.` };
    }

    if (tfsAgreeWithUs === 1) {
      return { pass: false, warning: `Counter-trend: only 1/3 TFs agree with ${DIRECTION} (${t15}/${t5}/${t1}). Need ≥2/3 for entry.` };
    }

    if (tfsAgreeWithUs === 2) {
      return { pass: true, warning: `Partial alignment: 2/3 TFs agree with ${DIRECTION} (${t15}/${t5}/${t1}). Proceed with caution.`, align: tfsAgreeWithUs, score: target.score, atr: target.atr5m };
    }

    return { pass: true, warning: null, align: 3, score: target.score, atr: target.atr5m, detail: `3/3 aligned with ${DIRECTION}` };
  } catch(e) {
    return { pass: false, warning: "Scan parse error: " + e.message };
  }
}

// ═══ CHECK 2: What is time saying? (Session context, not hard blocks) ═══
function checkTimeContext() {
  const raw = run(`node "${path.join(ROOT, "tools", "ny_time.cjs")}" --now`);
  if (!raw) return { pass: true, warning: "Time check unavailable" };

  try {
    const ny = JSON.parse(raw);
    const hour = ny.nyTime?.hour || 0;
    const session = ny.session?.name || "?";
    const reliability = ny.session?.reliability || 1;
    const sbActive = ny.silverBullet?.active || false;
    const day = ny.dayProfile?.name || "?";
    const dayMult = ny.dayProfile?.multiplier || 1;
    const combined = parseFloat(ny.combinedMultiplier) || 1;

    const warnings = [];

    // Context, not blocks:
    if (hour >= 2 && hour < 3) warnings.push("London manipulation hour (02:00-03:00) — expect sweeps. Consider wider SL or wait for SB overlap.");
    if (hour >= 8 && hour < 9) warnings.push("NY AM manipulation hour (08:00-09:00) — expect sweeps. Yesterday's 08:00 entry won +$9,922 here — price confirmed.");
    if (dayMult < 0.7) warnings.push(`Friday ×${dayMult} — low conviction day. Reduce size, not skip.`);
    if (sbActive) warnings.unshift("🔫 SB WINDOW ACTIVE — highest probability entry window.");

    return {
      pass: true,
      session, hour, reliability, sbActive, day, dayMult, combined,
      warnings: warnings.length > 0 ? warnings : null,
      detail: `${session} | ${day} ×${combined} | ${sbActive ? "SB ACTIVE" : "No SB"}`
    };
  } catch(e) {
    return { pass: true, warning: "Time parse error" };
  }
}

// ═══ CHECK 3: Weekly Profile (AMD Cycle + Day Matching + TGIF) ═══
function checkWeeklyProfile() {
  // Run the weekly profile engine
  const raw = run(`node "${path.join(ROOT, "tools", "tv-mcp", "weekly_profile.cjs")}" ${PAIR}`, 15000);
  if (!raw) return { pass: true, detail: "Weekly profile engine unavailable" };

  try {
    const wp = JSON.parse(raw);
    const day = wp.dayProfile?.day || "?";
    const amd = wp.amd || {};
    const dayPlan = wp.dayProfile || {};
    const range = wp.weeklyRange || {};
    const ndog = wp.ndog || {};

    // Build comprehensive guidance
    const guidance = [];

    // AMD phase
    if (amd.phase && amd.phase !== "UNKNOWN") {
      guidance.push(`AMD: ${amd.phase} — ${amd.detail}`);
    }
    if (amd.structuralNote) guidance.push(amd.structuralNote);

    // Day profile
    if (dayPlan.tradePlan) guidance.push(`Today: ${dayPlan.tradePlan}`);
    if (dayPlan.biasNote) guidance.push(dayPlan.biasNote);

    // Weekly range
    if (range.weeklyHigh) {
      guidance.push(`Weekly Range: ${range.weeklyLow?.toFixed(2)} — ${range.weeklyHigh?.toFixed(2)} (${range.source})`);
    }

    // NDOG
    if (ndog.available) {
      guidance.push(`NDOG: ${ndog.detail}`);
    }

    // TGIF window guidance
    const ny = getNY();
    if (ny && day === "Friday") {
      const hour = ny.nyTime?.hour || 0;
      if (hour >= 2 && hour < 5) guidance.push("⏰ London KZ — TGIF SETUP. Watch sweep. Don't enter before it.");
      else if (hour >= 8 && hour < 11) guidance.push("⏰ NY AM — TGIF ENTRY #1. Enter after sweeps confirm.");
      else if (hour >= 13 && hour < 14) guidance.push("⏰ NY PM — TGIF ENTRY #2. Late profit-taking move.");
    }

    // Warnings
    let warning = null;
    if (amd.phase === "UNKNOWN" && day === "Friday") {
      warning = "Engine data missing — run session_start.cjs for full weekly context. Reduce Friday size by 50%.";
    }

    return {
      pass: true,
      day,
      amdPhase: amd.phase || "UNKNOWN",
      weeklyHigh: range.weeklyHigh,
      weeklyLow: range.weeklyLow,
      ndogGap: ndog.available ? ndog.gapType : null,
      guidance: guidance.length > 0 ? guidance : null,
      warning,
      detail: guidance[0] || "Weekly profile check complete"
    };
  } catch(e) {
    return { pass: true, detail: "Weekly profile parse error: " + e.message };
  }
}

// Helper: get NY time
function getNY() {
  const raw = run(`node "${path.join(ROOT, "tools", "ny_time.cjs")}" --now`, 10000);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// ═══ CHECK 4: Data quality — are we flying blind? ═══
function checkDataQuality(priceCheck) {
  if (!priceCheck.pass && priceCheck.warning?.includes("BLIND")) {
    return { pass: false, warning: "CRITICAL: Cannot read price data. Do not trade blind." };
  }
  return { pass: true };
}

// ═══ MAIN ═══
const price = checkPriceAction();
const time = checkTimeContext();
const weekly = checkWeeklyProfile();
const dataQuality = checkDataQuality(price);

const checks = [
  { name: "PRICE", ...price },
  { name: "TIME", ...time },
  { name: "WEEKLY_PROFILE", ...weekly },
  { name: "DATA_QUALITY", ...dataQuality },
];

// Only block if: data is blind OR price is counter-trend with <2 alignment
const blockers = checks.filter(c => !c.pass);
const go = blockers.length === 0;

// Confidence: 0-100 based on alignment, day, session
const alignScore = price.align || 0;
const confidence = Math.round(
  (alignScore / 3) * 50 +  // Alignment: up to 50 points
  (time.combined || 1) * 20 +  // Session multiplier: up to 30
  (time.sbActive ? 20 : 0)  // SB bonus: 20
);

const result = { go, pair: PAIR, direction: DIRECTION, confidence: Math.min(100, confidence), checks };
console.log(JSON.stringify(result, null, 2));
process.exit(go ? 0 : 1);
