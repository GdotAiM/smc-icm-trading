// Cross-System Guard — Detects gaps where systems disagree or don't communicate.
// Prevents: entering during Judas Swing, trading NY Lunch, ignoring IPDA context, etc.
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = "C:\\Users\\cash\\smc-icm-trading";
const { getNYHour, getNYSession, isInKillzoneNY, isInSilverBulletNY, isInJudasSwingNY } = require(path.join(ROOT, "tools", "ny_time.cjs"));
const DATE = new Date().toISOString().split("T")[0];
const NY_HOUR = getNYHour();
const nySession = getNYSession();
const inKillzone = isInKillzoneNY();
const inSB = isInSilverBulletNY().active;
const inJudas = isInJudasSwingNY().active;
const sbLabel = isInSilverBulletNY().active ? isInSilverBulletNY().label : "none";
const judasLabel = isInJudasSwingNY().active ? isInJudasSwingNY().label : "none";

const PAIR = process.argv[2] || "GBPUSD";
const pairLabel = PAIR === "GOLD" ? "XAUUSD" : PAIR;
const sharedDir = path.join(ROOT, "shared", DATE, PAIR);

function loadEngine(tf) {
  try { return JSON.parse(fs.readFileSync(path.join(sharedDir, `engine_${tf.toLowerCase()}.json`), "utf8")); }
  catch { return null; }
}

const r4h = loadEngine("4h"), r1h = loadEngine("1h"), r15m = loadEngine("15m"), r5m = loadEngine("5m"), r1m = loadEngine("1m");
const htfBias = r4h?.structure?.bias || "neutral";

// ═══════════════════════════════════════════════════════════════════
// GAP CHECKS — Each returns { blocked, warning, narrative }
// ═══════════════════════════════════════════════════════════════════

const guards = [];

// ── GAP 1: Judas Swing Window — first move is FAKE ──────────────────
if (inJudas) {
  const hasReversal = r1m?.structure?.lastEvent === "CHoCH" && r1m?.structure?.bias !== htfBias;
  guards.push({
    id: "JUDAS_SWING",
    severity: "HIGH",
    blocked: true,
    entryAllowed: false,
    narrative: `⚠️ JUDAS SWING ACTIVE (${judasLabel}). The first move of this session is OFTEN FAKE. The current 1m signal may be the trap. Wait for: (1) reversal confirmation, or (2) Silver Bullet window at ${inSB ? 'now' : 'next SB window'}.`,
    action: "WAIT — Do not enter during Judas Swing unless a clear reversal has already occurred.",
    check: hasReversal ? "Reversal detected on 1m — Judas may have already played out." : "No reversal yet — Judas trap still possible.",
  });
}

// ── GAP 2: Silver Bullet timing — enter only during SB window ───────
if (inSB) {
  guards.push({
    id: "SILVER_BULLET",
    severity: "INFO",
    blocked: false,
    entryAllowed: true,
    narrative: `✅ SILVER BULLET ACTIVE (${sbLabel}). This is the highest-probability 1-hour window. Displacement during SB is REAL. Enter with confidence if structure confirms.`,
    action: "ENTER — SB window is the optimal entry window.",
    confidenceBoost: +1,
  });
} else if (inKillzone) {
  guards.push({
    id: "SILVER_BULLET",
    severity: "INFO",
    blocked: false,
    entryAllowed: true,
    narrative: `Killzone active but Silver Bullet window not yet. SB window at ${NY_HOUR < 3 ? '03:00 London SB' : NY_HOUR < 10 ? '10:00 NY AM SB' : NY_HOUR < 14 ? '14:00 NY PM SB' : 'tomorrow'}.`,
    action: "Standard entry — SB window provides additional confidence.",
  });
}

// ── GAP 3: NY Lunch — BLOCK all entries ────────────────────────────
if (nySession.name === "nyLunch") {
  guards.push({
    id: "NY_LUNCH",
    severity: "CRITICAL",
    blocked: true,
    entryAllowed: false,
    narrative: "❌ NY LUNCH (11:00-13:00 NY). ICT explicitly teaches: NO entries during lunch. Low liquidity. Wait for NY PM at 13:00.",
    action: "BLOCK ALL ENTRIES — Resume at 13:00 NY.",
  });
}

// ── GAP 4: NY Close approaching — no new entries ────────────────────
if (NY_HOUR >= 15 && NY_HOUR < 16) {
  guards.push({
    id: "NY_CLOSE",
    severity: "HIGH",
    blocked: true,
    entryAllowed: false,
    narrative: "⚠️ NY CLOSE APPROACHING. No new entries after 15:30 NY. Tighten stops on existing positions. Close all by 16:00.",
    action: "NO NEW ENTRIES — Manage existing positions only.",
  });
}
if (NY_HOUR >= 16 && NY_HOUR < 17) {
  guards.push({
    id: "NY_CLOSE",
    severity: "CRITICAL",
    blocked: true,
    entryAllowed: false,
    narrative: "❌ NY CLOSE. All positions should be closed or trailed tightly. No new positions under any circumstances.",
    action: "CLOSE ALL — Market is closing.",
  });
}

// ── GAP 5: Off-hours — BLOCK ───────────────────────────────────────
if (NY_HOUR >= 17 || NY_HOUR < 2) {
  const isAsia = NY_HOUR >= 20 || NY_HOUR < 2;
  guards.push({
    id: "OFF_HOURS",
    severity: isAsia ? "MEDIUM" : "HIGH",
    blocked: !isAsia,
    entryAllowed: isAsia,
    narrative: isAsia ? "Asia session — low volume. Only range setups. Reduce size." : "❌ OFF HOURS. No liquidity. Avoid trading entirely.",
    action: isAsia ? "REDUCE SIZE 50% — Asia session only." : "NO TRADING.",
    sizeMultiplier: isAsia ? 0.5 : 0,
  });
}

// ── GAP 6: IPDA zone vs entry direction ────────────────────────────
try {
  const ipdaOutput = execSync(`node "${ROOT}/tools/ipda.cjs" ${PAIR}`, { stdio: ["ignore","pipe","ignore"], encoding: "utf8", timeout: 10000 });
  const ipda = JSON.parse(ipdaOutput);
  const consensus = ipda.draw?.consensus;
  const drawDir = ipda.draw?.direction?.split("(")[0]?.trim();

  if (consensus === "DISCOUNT" && htfBias === "bearish") {
    guards.push({
      id: "IPDA_ZONE",
      severity: "WARNING",
      blocked: false,
      entryAllowed: true,
      narrative: `⚠️ IPDA ZONE CONFLICT: ${consensus} across all TFs. You are SHORTING into the BUY ZONE. This is a counter-trend trade within the IPDA context. The bearish move may exhaust. Consider tighter stops and earlier profit-taking.`,
      action: "TRADE WITH CAUTION — Shorting into discount zone. IPDA says price is drawn UP to equilibrium.",
      sizeMultiplier: 0.75,
      confidenceAdjustment: -1,
    });
  } else if (consensus === "PREMIUM" && htfBias === "bullish") {
    guards.push({
      id: "IPDA_ZONE",
      severity: "WARNING",
      blocked: false,
      entryAllowed: true,
      narrative: `⚠️ IPDA ZONE CONFLICT: ${consensus} across all TFs. You are BUYING into the SELL ZONE. This is a counter-trend trade within the IPDA context.`,
      action: "TRADE WITH CAUTION — Buying into premium zone.",
      sizeMultiplier: 0.75,
      confidenceAdjustment: -1,
    });
  } else if (consensus === htfBias === "bearish" ? "PREMIUM" : "DISCOUNT") {
    guards.push({
      id: "IPDA_ZONE",
      severity: "INFO",
      blocked: false,
      entryAllowed: true,
      narrative: `✅ IPDA ZONE ALIGNED: ${consensus}. Trade direction matches dealing range context.`,
      confidenceBoost: +1,
    });
  }
} catch(e) {}

// ── GAP 7: Fractal nesting breaks → reduce confidence ──────────────
try {
  const fractalOutput = execSync(`node "${ROOT}/tools/fractal_mmxm.cjs" ${PAIR}`, { stdio: ["ignore","pipe","ignore"], encoding: "utf8", timeout: 10000 });
  const fractal = JSON.parse(fractalOutput);
  if (fractal.nestingScore <= 3) {
    guards.push({
      id: "FRACTAL_NESTING",
      severity: "WARNING",
      blocked: false,
      entryAllowed: true,
      narrative: `⚠️ FRACTAL NESTING BROKEN (${fractal.nestingScore}/6). The MMXM is not nesting correctly across timeframes. Reduce size or wait.`,
      action: "REDUCE SIZE 50% — Fractal nesting is broken.",
      sizeMultiplier: 0.5,
      confidenceAdjustment: -2,
    });
  }
} catch(e) {}

// ── GAP 8: 1m Inversion not detected → no entry ────────────────────
try {
  const fractalOutput2 = execSync(`node "${ROOT}/tools/fractal_mmxm.cjs" ${PAIR}`, { stdio: ["ignore","pipe","ignore"], encoding: "utf8", timeout: 10000 });
  const fractal2 = JSON.parse(fractalOutput2);
  if (!fractal2.inversionDetected && fractal2.inversionScore < 4) {
    guards.push({
      id: "INVERSION_MISSING",
      severity: "HIGH",
      blocked: true,
      entryAllowed: false,
      narrative: "❌ 1m Inversion NOT DETECTED. ICT requires the entry sentence to be written on the 1m before entering. Wait for CHoCH + sweep + FVG on 1m.",
      action: "WAIT — No entry without 1m Inversion.",
    });
  }
} catch(e) {}

// ── GAP 9: Monday weight → reduce size ─────────────────────────────
const dayNum = new Date().getDay();
if (dayNum === 1) {
  guards.push({
    id: "MONDAY",
    severity: "INFO",
    blocked: false,
    entryAllowed: true,
    narrative: "📅 MONDAY — Weekly range not yet established. Reduce size, avoid early London entries.",
    action: "REDUCE SIZE 25% — Monday range-setting day.",
    sizeMultiplier: 0.75,
  });
}
if (dayNum === 5) {
  guards.push({
    id: "FRIDAY",
    severity: "HIGH",
    blocked: false,           // Don't hard-block — Silver Bullet scalps are allowed
    entryAllowed: true,       // Scalping models (SB, lecture setups) can still fire
    narrative: "📅 FRIDAY — No swing trades. Scalps only (Silver Bullet, lecture setups). Close all by NY close. Size ×0.5.",
    action: "SCALPS ONLY — Silver Bullet + time-based lecture setups allowed at 50% size. Close all by 16:00 NY.",
    sizeMultiplier: 0.5,      // Half size for all Friday trades
    confidenceAdjustment: -10, // Higher bar for entry
  });
}

// ═══════════════════════════════════════════════════════════════════
// AGGREGATE
// ═══════════════════════════════════════════════════════════════════

const blockedGuards = guards.filter(g => g.blocked);
const warningGuards = guards.filter(g => g.severity === "WARNING" || g.severity === "HIGH");
const sizeMultiplier = guards.reduce((m, g) => m * (g.sizeMultiplier ?? 1), 1.0);
const confidenceAdj = guards.reduce((adj, g) => adj + (g.confidenceAdjustment ?? 0) + (g.confidenceBoost ?? 0), 0);

const entryAllowed = blockedGuards.length === 0;
const verdict = entryAllowed ? (warningGuards.length > 0 ? "⚠️ ENTER WITH CAUTION" : "✅ ENTER") : "❌ DO NOT ENTER";

// ── Output ──────────────────────────────────────────────────────────
const outDir = path.join(ROOT, "stages", "05b_micro_confirmation", "output");
fs.mkdirSync(outDir, { recursive: true });

let md = `# Cross-System Guard Report — ${pairLabel} — ${DATE}
## NY Time: ${String(NY_HOUR).padStart(2,'0')}:00 | Session: ${nySession.label} | Judas: ${inJudas ? '✅ ' + judasLabel : 'Inactive'} | SB: ${inSB ? '✅ ' + sbLabel : 'Inactive'}

## Verdict: **${verdict}**
${blockedGuards.length > 0 ? `\n### ❌ BLOCKED (${blockedGuards.length})\n${blockedGuards.map(g => `- **${g.id}**: ${g.narrative} → ${g.action}`).join("\n")}` : ''}
${warningGuards.filter(g => !g.blocked).length > 0 ? `\n### ⚠️ WARNINGS (${warningGuards.filter(g => !g.blocked).length})\n${warningGuards.filter(g => !g.blocked).map(g => `- **${g.id}**: ${g.narrative} → ${g.action}`).join("\n")}` : ''}

## All Guards
| Guard | Severity | Blocked | Narrative |
|-------|----------|---------|-----------|
${guards.map(g => `| ${g.id} | ${g.severity} | ${g.blocked ? '❌' : '✅'} | ${g.narrative.slice(0, 80)}... |`).join("\n")}

## Adjustments
- Size Multiplier: ×${sizeMultiplier.toFixed(2)}
- Confidence Adjustment: ${confidenceAdj > 0 ? '+' + confidenceAdj : confidenceAdj}
- Entry Allowed: ${entryAllowed ? '✅' : '❌'}
`;

fs.writeFileSync(path.join(outDir, `${PAIR.toLowerCase()}_guard.md`), md, "utf8");

console.log(JSON.stringify({
  pair: pairLabel,
  nyHour: NY_HOUR,
  session: nySession.label,
  judasActive: inJudas,
  sbActive: inSB,
  entryAllowed,
  blocked: blockedGuards.length,
  warnings: warningGuards.filter(g => !g.blocked).length,
  verdict,
  sizeMultiplier: sizeMultiplier.toFixed(2),
  confidenceAdj,
  guards: guards.map(g => ({ id: g.id, severity: g.severity, blocked: g.blocked, action: g.action })),
}, null, 2));
