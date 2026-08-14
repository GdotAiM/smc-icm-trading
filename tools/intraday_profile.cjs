// ICT Intraday Profile Engine — CBDR + Asian Range + Protraction Classification
// Based on: https://innercircletrader.net/tutorials/ict-intraday-profiles/
// Classifies each session into Sell/Buy Profile with Normal/Delayed protraction.

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = "C:\\Users\\cash\\smc-icm-trading";
const { getNYHour, getNYDate, getNYSession, isInKillzoneNY, isInSilverBulletNY, isInJudasSwingNY } = require(path.join(ROOT, "tools", "ny_time.cjs"));

const NY_HOUR = getNYHour();
const DATE = require("./ny_time.cjs").getNYDate();

// NY-midnight-anchored windows: NY offsets are always whole hours and DST never
// changes at midnight, so anchoring to today's NY date (00:00 UTC of that date)
// and adding/subtracting fixed hours gives exact NY-local window boundaries.
function nyWindowStart(dayOffset, nyHour) {
  const todayStartUtc = Date.parse(getNYDate() + "T00:00:00.000Z");
  return todayStartUtc + dayOffset * 86400000 + nyHour * 3600000;
}

function r2(v) { return Number(v).toFixed(2); }
function r5(v) { return Number(v).toFixed(5); }

const PAIR = process.argv[2] || "GBPUSD";
const pairLabel = PAIR === "GOLD" ? "XAUUSD" : PAIR;
const sharedDir = path.join(ROOT, "shared", DATE, PAIR);

// ── Load engine + raw candles ──────────────────────────────────────────
function loadEngine(tf) {
  try { return JSON.parse(fs.readFileSync(path.join(sharedDir, `engine_${tf.toLowerCase()}.json`), "utf8")); }
  catch { return null; }
}
function loadRaw(tf) {
  try {
    const f = path.join(process.env.TEMP || "/tmp", `${PAIR}_${tf.toLowerCase()}.json`);
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8"));
    return null;
  } catch(e) { return null; }
}

const r1d = loadEngine("1d"), r4h = loadEngine("4h");
const dailyBias = r1d?.structure?.bias || r4h?.structure?.bias || "neutral";

// ═══════════════════════════════════════════════════════════════════
// CBDR: Central Bank Dealers Range (14:00-20:00 NY — previous day)
// ═══════════════════════════════════════════════════════════════════

function computeCBDR(candles) {
  if (!candles || candles.length === 0) return null;

  // CBDR is formed during 14:00-20:00 NY (yesterday)
  const cbdrStart = nyWindowStart(-1, 14);
  const cbdrEnd = nyWindowStart(-1, 20);

  const cbdrCandles = candles.filter(c => {
    const t = new Date(c.time).getTime();
    return t >= cbdrStart && t < cbdrEnd;
  });

  if (cbdrCandles.length < 5) {
    // Fallback: use last 6 hours of yesterday's data
    const recent = candles.slice(-100);
    if (recent.length < 10) return null;
    const hi = Math.max(...recent.map(c => c.high));
    const lo = Math.min(...recent.map(c => c.low));
    const range = hi - lo;
    return {
      high: r5(hi), low: r5(lo), range: r5(range),
      rangePips: Math.round(range * 10000),
      candles: recent.length,
      valid: range * 10000 < 40,
      narrative: range * 10000 < 40 ? "✅ CBDR valid" : `❌ CBDR too wide (${Math.round(range * 10000)} pips > 40)`,
    };
  }

  const hi = Math.max(...cbdrCandles.map(c => c.high));
  const lo = Math.min(...cbdrCandles.map(c => c.low));
  const range = hi - lo;

  return {
    high: r5(hi), low: r5(lo), range: r5(range),
    rangePips: Math.round(range * 10000),
    candles: cbdrCandles.length,
    valid: range * 10000 < 40,
    narrative: range * 10000 < 40 ? "✅ CBDR valid (< 40 pips)" : `❌ CBDR too wide (${Math.round(range * 10000)} pips > 40 pips) — profile may not form cleanly.`,
  };
}

// ═══════════════════════════════════════════════════════════════════
// ASIAN RANGE: 20:00-00:00 NY (overnight)
// ═══════════════════════════════════════════════════════════════════

function computeAsianRange(candles) {
  if (!candles || candles.length === 0) return null;

  // Asian range: 20:00-00:00 NY (overnight into today)
  const asianStart = nyWindowStart(-1, 20);
  const asianEnd = nyWindowStart(0, 0);

  const asianCandles = candles.filter(c => {
    const t = new Date(c.time).getTime();
    return t >= asianStart && t < asianEnd;
  });

  if (asianCandles.length < 3) {
    const recent = candles.slice(-50);
    if (recent.length < 5) return null;
    const hi = Math.max(...recent.map(c => c.high));
    const lo = Math.min(...recent.map(c => c.low));
    const range = hi - lo;
    return {
      high: r5(hi), low: r5(lo), range: r5(range),
      rangePips: Math.round(range * 10000),
      valid: range * 10000 <= 30,
      narrative: range * 10000 <= 30 ? "✅ Asian range valid (≤ 30 pips)" : `⚠️ Asian range wide (${Math.round(range * 10000)} pips > 30). Profile may be less reliable.`,
    };
  }

  const hi = Math.max(...asianCandles.map(c => c.high));
  const lo = Math.min(...asianCandles.map(c => c.low));
  const range = hi - lo;

  return {
    high: r5(hi), low: r5(lo), range: r5(range),
    rangePips: Math.round(range * 10000),
    valid: range * 10000 <= 30,
    narrative: range * 10000 <= 30 ? "✅ Asian range valid (≤ 30 pips)" : `⚠️ Asian range wide (${Math.round(range * 10000)} pips > 30). Profile may be less reliable.`,
  };
}

// ═══════════════════════════════════════════════════════════════════
// STANDARD DEVIATION PROJECTIONS (1σ, 2σ, 3σ of CBDR)
// ═══════════════════════════════════════════════════════════════════

function computeSDProjections(cbdr) {
  if (!cbdr) return null;
  const range = parseFloat(cbdr.range);
  const high = parseFloat(cbdr.high);
  const low = parseFloat(cbdr.low);
  const mean = (high + low) / 2;
  const sd = range / 4; // Approximate SD from range

  return {
    sd1_upper: r5(mean + sd),
    sd1_lower: r5(mean - sd),
    sd2_upper: r5(mean + sd * 2),
    sd2_lower: r5(mean - sd * 2),
    sd3_upper: r5(mean + sd * 3),
    sd3_lower: r5(mean - sd * 3),
    narrative: `1σ: ${r5(mean + sd)} / ${r5(mean - sd)} | 2σ: ${r5(mean + sd*2)} / ${r5(mean - sd*2)} | 3σ: ${r5(mean + sd*3)} / ${r5(mean - sd*3)}`,
  };
}

// ═══════════════════════════════════════════════════════════════════
// PROFILE CLASSIFICATION
// ═══════════════════════════════════════════════════════════════════

function classifyProfile(dailyBias, cbdr, asianRange, inJudas) {
  // Validity gate
  if (dailyBias === "neutral") {
    return { type: "NO PROFILE", valid: false, narrative: "Neutral daily bias — ICT says neutral days do not produce a clean profile. Wait for directional bias." };
  }
  if (!cbdr || !cbdr.valid) {
    return { type: "DEGRADED", valid: false, narrative: `CBDR invalid (${cbdr?.rangePips || '?'} pips). Profile conditions not met. Trade with reduced confidence.` };
  }
  if (asianRange && !asianRange.valid) {
    return { type: "DEGRADED", valid: false, narrative: `Asian range too wide (${asianRange.rangePips} pips). Profile may be less reliable.` };
  }

  const profileType = dailyBias === "bearish" ? "SELL PROFILE" : "BUY PROFILE";

  // Judas Swing SD validation — protraction must stay within 2-3σ of CBDR
  let sdValid = true, sdNote = "";
  if (sdProj && cbdr) {
    const cbdrMid = (cbdr.high + cbdr.low) / 2;
    const protractionPips = dailyBias === "bearish"
      ? Math.abs((cbdr.high) - cbdrMid) * 10000  // How far above CBDR?
      : Math.abs((cbdr.low) - cbdrMid) * 10000;
    const sd2Limit = Math.abs(sdProj.sd2_upper - cbdrMid) * 10000;
    if (protractionPips > sd2Limit * 1.5) {
      sdValid = false;
      sdNote = `⚠️ Judas Swing protraction (${Math.round(protractionPips)} pips) exceeds 2-3σ limit (${Math.round(sd2Limit)} pips). Profile reliability reduced.`;
    }
  }

  const protraction = inJudas ? "NORMAL (move arriving during Judas window 00:00-02:00 NY)" :
                      NY_HOUR >= 2 ? "DELAYED (move arriving after 02:00 NY — London open)" : "PENDING (waiting for protraction)";

  return {
    type: profileType,
    valid: sdValid,
    protraction,
    sdValid, sdNote,
    entryZone: profileType === "SELL PROFILE" ? "PREMIUM (above equilibrium)" : "DISCOUNT (below equilibrium)",
    stopLoss: protraction.includes("NORMAL") ? "London session high (shorts) / London session low (longs)" : "Dealing range high (shorts) / Dealing range low (longs)",
    narrative: `${profileType} — ${protraction}. ${sdNote} Enter at ${profileType === 'SELL PROFILE' ? 'premium' : 'discount'} after 5m MSS.`,
  };
}

// ═══════════════════════════════════════════════════════════════════
// 10-STEP CHECKLIST
// ═══════════════════════════════════════════════════════════════════

function buildChecklist(profile, cbdr, asianRange, sdProj, dailyBias) {
  return [
    { step: 1, label: "Daily directional bias", status: dailyBias !== "neutral" ? "✅" : "✗", detail: `${dailyBias.toUpperCase()} on 1D/4H` },
    { step: 2, label: "Mark CBDR < 40 pips", status: cbdr?.valid ? "✅" : "✗", detail: `${cbdr?.rangePips || '?'} pips` },
    { step: 3, label: "Mark Asian range 20-30 pips", status: asianRange?.valid ? "✅" : "✗", detail: `${asianRange?.rangePips || '?'} pips` },
    { step: 4, label: "Plot 1σ/2σ/3σ projections", status: sdProj ? "✅" : "✗", detail: sdProj ? `2σ: ${sdProj.sd2_upper}/${sdProj.sd2_lower}` : "N/A" },
    { step: 5, label: "Watch 00:00-02:00 NY Judas Swing", status: NY_HOUR >= 0 ? "✅" : "⏳", detail: isInJudasSwingNY().active ? "ACTIVE NOW" : "Window passed" },
    { step: 6, label: "Classify Normal vs Delayed", status: profile.valid ? "✅" : "✗", detail: profile.protraction },
    { step: 7, label: "Wait for 5m MSS", status: "⏳", detail: "Monitor 5m for CHoCH in profile direction" },
    { step: 8, label: "Enter on retest at premium/discount", status: "⏳", detail: `Entry at ${profile.entryZone}` },
    { step: 9, label: "Stop placement", status: "⏳", detail: profile.stopLoss },
    { step: 10, label: "Target HTF DOL or opposite PD Array", status: "⏳", detail: "50-70 pips default or nearest liquidity pool" },
  ];
}

// ── Run ──────────────────────────────────────────────────────────────
const rawData = loadRaw("15m") || loadRaw("1h") || loadRaw("4h");
const cbdr = computeCBDR(rawData);
const asianRange = computeAsianRange(rawData);
const sdProj = computeSDProjections(cbdr);
const inJudas = isInJudasSwingNY().active;
const profile = classifyProfile(dailyBias, cbdr, asianRange, inJudas);
const checklist = buildChecklist(profile, cbdr, asianRange, sdProj, dailyBias);
const completedSteps = checklist.filter(s => s.status === "✅").length;

// ── Output ──────────────────────────────────────────────────────────
const outDir = path.join(ROOT, "stages", "00_macro_context", "output");
fs.mkdirSync(outDir, { recursive: true });

const md = `# ICT Intraday Profile — ${pairLabel} — ${DATE}

## Profile: **${profile.type}** (${profile.valid ? 'VALID' : 'INVALID'})

**${profile.narrative}**

## Key Levels

| Level | Price | Notes |
|-------|-------|-------|
| CBDR High | ${cbdr?.high || 'N/A'} | Yesterday 14:00-20:00 NY |
| CBDR Low | ${cbdr?.low || 'N/A'} | Range: ${cbdr?.rangePips || '?'} pips |
| Asian High | ${asianRange?.high || 'N/A'} | Overnight 20:00-00:00 NY |
| Asian Low | ${asianRange?.low || 'N/A'} | Range: ${asianRange?.rangePips || '?'} pips |
${sdProj ? `| 1σ Upper | ${sdProj.sd1_upper} | +1 SD from CBDR mean |\n| 2σ Upper | ${sdProj.sd2_upper} | +2 SD — ICT target zone |\n| 2σ Lower | ${sdProj.sd2_lower} | -2 SD — ICT target zone |` : ''}

## Protraction

**${profile.protraction}**

${inJudas ? 'Currently IN Judas Swing window (00:00-02:00 NY). Watch for the protraction move.' : NY_HOUR >= 2 ? 'Judas Swing window has passed. Classify as Delayed — London open has occurred.' : 'Waiting for Judas Swing window to begin.'}

## 10-Step ICT Checklist

| # | Step | Status | Detail |
|---|------|--------|--------|
${checklist.map(s => `| ${s.step} | ${s.label} | ${s.status} | ${s.detail} |`).join("\n")}

**Completed**: ${completedSteps}/10 steps

## Daily Bias

**${dailyBias.toUpperCase()}** — ${dailyBias === 'bearish' ? 'Looking for SELL setups. Target downside liquidity.' : dailyBias === 'bullish' ? 'Looking for BUY setups. Target upside liquidity.' : 'NEUTRAL — profile may not form cleanly. Wait for bias to establish.'}

---

*ICT Intraday Profile — reference: innercircletrader.net/tutorials/ict-intraday-profiles/*
`;

fs.writeFileSync(path.join(outDir, `${PAIR.toLowerCase()}_intraday_profile.md`), md, "utf8");

console.log(JSON.stringify({
  pair: pairLabel,
  dailyBias,
  profile: profile.type,
  valid: profile.valid,
  protraction: profile.protraction,
  cbdr: cbdr ? { high: cbdr.high, low: cbdr.low, range: cbdr.rangePips + " pips", rangePips: cbdr.rangePips, valid: cbdr.valid } : null,
  asianRange: asianRange ? { high: asianRange.high, low: asianRange.low, range: asianRange.rangePips + " pips", rangePips: asianRange.rangePips, valid: asianRange.valid } : null,
  checklist: `${completedSteps}/10 steps complete`,
  narrative: profile.narrative,
}, null, 2));
