// Mandatory pre-entry checklist — must pass BEFORE any trade
// Usage: node pre_entry_check.cjs PAIR DIRECTION
// Returns JSON: { go: true/false, checks: [...], blockers: [...] }
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

// ═══ CHECK 1: Killzone Timing ═══
function checkTiming() {
  const raw = run(`node "${path.join(ROOT, "tools", "ny_time.cjs")}" --now`);
  if (!raw) return { pass: false, detail: "ny_time.cjs failed" };
  try {
    const ny = JSON.parse(raw);
    const hour = ny.nyTime?.hour || 0;
    const sbActive = ny.silverBullet?.active || false;
    const tradeable = ny.tradeable || false;

    if (!tradeable) return { pass: false, detail: "Session not tradeable" };

    // Manipulation hour gates
    if (hour >= 2 && hour < 3) return { pass: false, detail: "London manipulation hour (02:00-03:00) — wait for SB overlap" };
    if (hour >= 8 && hour < 9) return { pass: false, detail: "NY AM manipulation hour (08:00-09:00) — wait for pre-SB" };

    // SB overlap = highest conviction
    if (sbActive) return { pass: true, detail: "SB window active — highest probability" };

    // Post-SB / general killzone
    if ((hour >= 3 && hour < 5) || (hour >= 9 && hour < 11)) return { pass: true, detail: "Killzone active — standard entry" };

    return { pass: true, detail: "Outside killzone — reduced confidence" };
  } catch(e) {
    return { pass: false, detail: "Timing check parse error: " + e.message };
  }
}

// ═══ CHECK 2: Multi-TF Alignment ═══
function checkAlignment() {
  const raw = run(`node "${path.join(ROOT, "tools", "tv-mcp", "scan_all_pairs.cjs")}"`, 90000);
  if (!raw) return { pass: false, detail: "scan_all_pairs.cjs failed — BLIND" };

  try {
    const pairs = JSON.parse(raw);
    const target = pairs.find(p => p.pair === PAIR);
    if (!target) return { pass: false, detail: PAIR + " not found in scan results" };

    const t15 = target.trend15m;
    const t5 = target.trend5m;
    const t1 = target.trend1m;
    const align = (t15 === t5 && t5 === t1) ? 3 : (t15 === t5 || t5 === t1) ? 2 : 1;

    // Direction must match the dominant trend
    const trends = [t15, t5, t1];
    const bullishCount = trends.filter(t => t === "BULLISH").length;
    const bearishCount = trends.filter(t => t === "BEARISH").length;
    const dominantTrend = bullishCount >= bearishCount ? "BULLISH" : "BEARISH";

    if (DIRECTION !== (dominantTrend === "BULLISH" ? "BUY" : "SELL")) {
      return { pass: false, detail: `Direction mismatch: trading ${DIRECTION} but TFs are ${dominantTrend} (${t15}/${t5}/${t1})` };
    }

    if (align < 2) return { pass: false, detail: `Alignment only ${align}/3 (need ≥2). 15m:${t15} 5m:${t5} 1m:${t1}` };

    return { pass: true, detail: `3/3 aligned ${dominantTrend}`, score: target.score, atr: target.atr5m };
  } catch(e) {
    return { pass: false, detail: "Alignment parse error: " + e.message };
  }
}

// ═══ CHECK 3: Day Profile ═══
function checkDayProfile() {
  const raw = run(`node "${path.join(ROOT, "tools", "ny_time.cjs")}" --now`);
  if (!raw) return { pass: true, detail: "Day check skipped (ny_time failed)" };
  try {
    const ny = JSON.parse(raw);
    const day = ny.dayProfile?.name || "?";
    const multiplier = ny.dayProfile?.multiplier || 1;
    if (multiplier < 0.7) return { pass: false, detail: `${day} ×${multiplier} — low conviction day. Reduce size or skip.` };
    return { pass: true, detail: `${day} ×${multiplier}` };
  } catch { return { pass: true, detail: "Day check parse error" }; }
}

// ═══ MAIN ═══
const checks = [
  { name: "TIMING", ...checkTiming() },
  { name: "ALIGNMENT", ...checkAlignment() },
  { name: "DAY_PROFILE", ...checkDayProfile() },
];

const blockers = checks.filter(c => !c.pass);
const go = blockers.length === 0;

const result = {
  go,
  pair: PAIR,
  direction: DIRECTION,
  checks,
  blockers: blockers.map(b => b.name + ": " + b.detail),
};

console.log(JSON.stringify(result, null, 2));
process.exit(go ? 0 : 1);
