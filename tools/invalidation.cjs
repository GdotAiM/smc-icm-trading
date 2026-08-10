// Invalidation Engine — Multi-Dimensional Trade Invalidation Awareness
// Know where you're wrong before you enter. Check ALL invalidation dimensions.
const fs = require("fs");
const path = require("path");
const { calcATR, loadCandles } = require("./lib/metrics.cjs");

const ROOT = "C:\\Users\\cash\\smc-icm-trading";
const DATE = new Date().toISOString().split("T")[0];
const ny = require("./ny_time.cjs");
const time = require("./lib/time.cjs");
const NY_HOUR = ny.getNYHour();
const DAY_NUM = ny.getNYDay();

function r2(v) { return Number(v).toFixed(2); }
function r5(v) { return Number(v).toFixed(5); }

const PAIR = process.argv[2] || "GBPUSD";
const pairLabel = PAIR === "GOLD" ? "XAUUSD" : PAIR;
const sharedDir = path.join(ROOT, "shared", DATE, PAIR);

function loadEngine(tf) {
  try { return JSON.parse(fs.readFileSync(path.join(sharedDir, `engine_${tf}.json`), "utf8")); }
  catch { return null; }
}

const r1w = loadEngine("1w"); const r1d = loadEngine("1d"); const r4h = loadEngine("4h");
const r1h = loadEngine("1h"); const r15m = loadEngine("15m"); const r5m = loadEngine("5m"); const r1m = loadEngine("1m");
if (!r4h || !r1d) { console.log(JSON.stringify({error:"Engine reports missing"})); process.exit(1); }

// ── Invalidation Dimensions ──────────────────────────────────────────────

// 1. PRICE INVALIDATION — SL level hit
const htfBias = r4h.structure.bias;
const entryPrice = r1h ? r1h.price : r4h.price;
const swingHigh = r4h.structure.lastSwingHigh || r1d.structure.lastSwingHigh || entryPrice + 0.003;
const swingLow = r4h.structure.lastSwingLow || r1d.structure.lastSwingLow || entryPrice - 0.003;
// Real ATR-14 (WP-1 / audit Gap 4.1). Fallback only when candles unavailable.
const c4h = loadCandles(sharedDir, "4h");
const realATR = calcATR(c4h, 14);
const atrBuffer = realATR != null && realATR > 0 ? realATR * 0.5 : null; // WP-1: No fake ATR
const slPrice = htfBias === "bearish" ? swingHigh + atrBuffer : swingLow - atrBuffer;
const slDistance = Math.abs(entryPrice - slPrice);
const slPips = Math.round(slDistance * (pairLabel === "XAUUSD" ? 10 : 10000));
const priceAtRisk = Math.abs(entryPrice - slPrice) / entryPrice * 100;
const priceInvalidation = {
  slPrice, slDistance, slPips,
  level: htfBias === "bearish" ? `4H Swing High @ ${r5(swingHigh)} + ${r5(atrBuffer)} buffer` :
         htfBias === "bullish" ? `4H Swing Low @ ${r5(swingLow)} - ${r5(atrBuffer)} buffer` : "N/A",
  triggered: false, // Would need live price feed
  risk: `${r2(priceAtRisk)}% of price`,
};

// 2. STRUCTURE INVALIDATION — HTF structure breaks against trade
const structureChecks = [];
// Check if 4H structure still supports the direction
if (r4h.structure.lastEvent === "CHoCH" && r4h.structure.bias !== htfBias) {
  structureChecks.push({ status: "INVALIDATED", detail: `4H CHoCH flipped to ${r4h.structure.bias} — structure no longer supports ${htfBias}` });
} else if (r4h.structure.lastEvent === "BOS" && r4h.structure.bias === htfBias) {
  structureChecks.push({ status: "VALID", detail: `4H BOS ${htfBias} — structure confirms direction` });
} else {
  structureChecks.push({ status: "MONITOR", detail: `4H structure: ${r4h.structure.bias} with ${r4h.structure.lastEvent}` });
}
// Check 1D
if (r1d.structure.bias !== htfBias && r1d.structure.bias !== "neutral") {
  structureChecks.push({ status: "WARNING", detail: `1D bias is ${r1d.structure.bias} — HTF may be opposing the trade` });
} else if (r1d.structure.bias === htfBias) {
  structureChecks.push({ status: "VALID", detail: `1D bias ${htfBias} — HTF confirms` });
}
// Check 1W
if (r1w && r1w.structure.bias !== "neutral" && r1w.structure.bias !== htfBias) {
  structureChecks.push({ status: "WARNING", detail: `1W bias is ${r1w.structure.bias} — MACRO trend opposes trade direction. This may be a pullback, not a reversal.` });
}

const structureValid = structureChecks.every(c => c.status !== "INVALIDATED");
const structureWarnings = structureChecks.filter(c => c.status === "WARNING").length;

// 3. TIME INVALIDATION — Session/killzone/window expiry (NEW YORK local time)
const timeChecks = [];
const inKillzone = time.isKillzoneHour(NY_HOUR); // London 02-05 | NY AM 08-11 | NY PM 13-16 (ICT-correct, WP-2)
const inSB = (NY_HOUR >= 3 && NY_HOUR < 4) || (NY_HOUR >= 10 && NY_HOUR < 11) || (NY_HOUR >= 14 && NY_HOUR < 15);

if (inKillzone) {
  const kzEnd = NY_HOUR < 11 ? 11 : 16;
  const remaining = (kzEnd - NY_HOUR) * 60;
  timeChecks.push({ status: "ACTIVE", detail: `Killzone active — ${Math.floor(remaining/60)}h ${remaining%60}m remaining` });
} else if (NY_HOUR >= 20 || NY_HOUR < 2) {
  timeChecks.push({ status: "WARNING", detail: "Asia session — lower probability. If trade is active, tighten stops." });
} else if (NY_HOUR >= 17) {
  timeChecks.push({ status: "INVALIDATED", detail: "OFF HOURS — no new entries. Close existing positions." });
} else {
  timeChecks.push({ status: "MONITOR", detail: "Between killzones — reduced displacement probability" });
}

if (inSB) {
  timeChecks.push({ status: "ACTIVE", detail: "Silver Bullet window ACTIVE — time-gated models eligible" });
} else if (NY_HOUR >= 2 && NY_HOUR < 21) {
  const nextSB = NY_HOUR < 3 ? "London SB at 03:00" : NY_HOUR < 10 ? "NY AM SB at 10:00" : NY_HOUR < 14 ? "NY PM SB at 14:00" : "tomorrow";
  timeChecks.push({ status: "INACTIVE", detail: `SB window not active — next: ${nextSB}` });
}

if (DAY_NUM === 5 && NY_HOUR >= 16) {
  timeChecks.push({ status: "INVALIDATED", detail: "Friday PM — close all positions by NY close. No weekend holds." });
}

// 4. MODEL INVALIDATION — Model-specific conditions
const modelChecks = [];
// These would be populated per-model from the model definitions
// For Silver Bullet (GBPUSD primary):
if (!inSB) {
  modelChecks.push({ model: "Silver Bullet", status: "INVALIDATED", detail: "Not in Silver Bullet window — model requires active SB killzone" });
} else {
  modelChecks.push({ model: "Silver Bullet", status: "VALID", detail: "SB window active — model conditions met" });
}
// For MMXM:
const hasOB = (r4h.orderBlocks || []).length > 0 || (r1d.orderBlocks || []).length > 0;
const hasSweep = (r4h.liquidity || []).some(p => p.swept) || (r1d.liquidity || []).some(p => p.swept);
if (hasOB && hasSweep) {
  modelChecks.push({ model: "2022 Model (MMXM)", status: "VALID", detail: "OB present + sweep detected — MMXM conditions met" });
} else if (!hasOB) {
  modelChecks.push({ model: "2022 Model (MMXM)", status: "INVALIDATED", detail: "No unmitigated OB — MMXM requires HTF POI" });
} else {
  modelChecks.push({ model: "2022 Model (MMXM)", status: "PARTIAL", detail: "OB present but no sweep — waiting for inducement" });
}

// 5. CYCLE INVALIDATION — Phase change
// WP-3: Cycle phase from structure-based JSON, not markdown regex.
// The per-pair JSON (e.g. eurusd_cycle_phase.json) is the machine-readable
// output of po3_state_machine.cjs — the sole cycle authority.
const cycleChecks = [];
let currentPhase = "UNKNOWN";
try {
  const cycleJsonPath = path.join(ROOT, "stages", "00_macro_context", "output", `${pairLabel.toLowerCase()}_cycle_phase.json`);
  if (fs.existsSync(cycleJsonPath)) {
    const cycleData = JSON.parse(fs.readFileSync(cycleJsonPath, "utf8"));
    currentPhase = cycleData.phase || "UNKNOWN";
  }
} catch(e) { /* currentPhase stays UNKNOWN */ }

if (currentPhase === "ACCUMULATION") {
  cycleChecks.push({ status: "WARNING", detail: "Market in ACCUMULATION — breakouts may be false. Tighten stops, take profits early." });
} else if (currentPhase === "MANIPULATION") {
  cycleChecks.push({ status: "ACTIVE", detail: "MANIPULATION phase — sweeps are likely. Hold through the noise if structure intact." });
} else if (currentPhase === "DISTRIBUTION") {
  cycleChecks.push({ status: "VALID", detail: "DISTRIBUTION phase — trend is active. Let winners run." });
} else if (currentPhase === "EXPANSION") {
  cycleChecks.push({ status: "WARNING", detail: "EXPANSION phase — blow-off risk. Trail stops tightly. Do not add." });
} else {
  cycleChecks.push({ status: "UNKNOWN", detail: currentPhase === "UNKNOWN" ? "Cycle data unavailable — no structure-based phase" : `Unknown phase: ${currentPhase}` });
}

// 6. MICRO INVALIDATION — LTF structure contradicts
const microChecks = [];
if (r15m) {
  const ltfAligned = r15m.structure.bias === htfBias;
  if (ltfAligned) {
    microChecks.push({ status: "VALID", detail: `15m bias ${r15m.structure.bias} — aligned with HTF` });
  } else if (r15m.structure.bias === "neutral") {
    microChecks.push({ status: "MONITOR", detail: "15m neutral — no LTF confirmation yet" });
  } else {
    microChecks.push({ status: "WARNING", detail: `15m bias ${r15m.structure.bias} — OPPOSING HTF. This is a pullback. Hold if SL not threatened.` });
  }
}
if (r5m && r5m.structure.lastEvent === "CHoCH" && r5m.structure.bias !== htfBias) {
  microChecks.push({ status: "WARNING", detail: `5m CHoCH flipped to ${r5m.structure.bias} — micro reversal. Check if SL threatened.` });
}

// 7. CORRELATION INVALIDATION — Confluence breakdown
const corrChecks = [];
try {
  const dxy1d = JSON.parse(fs.readFileSync(path.join(ROOT, "shared", DATE, "DXY", "engine_1d.json"), "utf8"));
  const dxyBias = dxy1d.structure.bias;
  const expectedDXY = htfBias === "bearish" ? "bullish" : htfBias === "bullish" ? "bearish" : "neutral";
  if (dxyBias === expectedDXY) {
    corrChecks.push({ status: "VALID", detail: `DXY is ${dxyBias} — confirms USD direction for ${htfBias} ${pairLabel}` });
  } else {
    corrChecks.push({ status: "WARNING", detail: `DXY is ${dxyBias}, expected ${expectedDXY} — correlation weakening. Reduce size or tighten SL.` });
  }
} catch(e) { corrChecks.push({ status: "UNKNOWN", detail: "DXY data unavailable" }); }

// ── Aggregate Invalidation Score ─────────────────────────────────────────
function countByStatus(checks, status) { return checks.filter(c => c.status === status).length; }

const allChecks = [
  { dimension: "PRICE", checks: [priceInvalidation] },
  { dimension: "STRUCTURE", checks: structureChecks },
  { dimension: "TIME", checks: timeChecks },
  { dimension: "MODEL", checks: modelChecks },
  { dimension: "CYCLE", checks: cycleChecks },
  { dimension: "MICRO", checks: microChecks },
  { dimension: "CORRELATION", checks: corrChecks },
];

let totalInvalidated = 0, totalWarnings = 0, totalValid = 0;
for (const dim of allChecks) {
  totalInvalidated += countByStatus(dim.checks, "INVALIDATED");
  totalWarnings += countByStatus(dim.checks, "WARNING");
  totalValid += countByStatus(dim.checks, "VALID") + countByStatus(dim.checks, "ACTIVE");
}

const overallStatus = totalInvalidated > 0 ? "INVALIDATED" :
                      totalWarnings >= 3 ? "HIGH RISK" :
                      totalWarnings >= 1 ? "CAUTION" : "VALID";

const statusLabel = {
  INVALIDATED: "❌ TRADE INVALID — At least one dimension has failed. Exit or do not enter.",
  "HIGH RISK": "⚠️ HIGH RISK — Multiple warnings. Reduce size, tighten SL, or wait.",
  CAUTION: "⚡ CAUTION — Minor warnings. Trade with awareness.",
  VALID: "✅ VALID — All dimensions confirm the trade thesis.",
};

// ── Output ────────────────────────────────────────────────────────────────
const outDir = path.join(ROOT, "stages", "05b_micro_confirmation", "output");
fs.mkdirSync(outDir, { recursive: true });

let out = `# Invalidation Awareness — ${pairLabel} — ${DATE}

## Overall Status: ${statusLabel[overallStatus] || overallStatus}

| Dimension | Status | Detail |
|-----------|--------|--------|
`;
for (const dim of allChecks) {
  for (const c of dim.checks) {
    const icon = c.status === "INVALIDATED" ? "❌" : c.status === "WARNING" ? "⚠️" : c.status === "VALID" || c.status === "ACTIVE" ? "✅" : "⏳";
    out += `| ${dim.dimension} | ${icon} ${c.status} | ${c.detail || ''} |\n`;
  }
}

out += `
## Invalidation Summary
- **Invalidated**: ${totalInvalidated} dimension(s) — ${totalInvalidated > 0 ? 'EXIT OR DO NOT ENTER' : 'None'}
- **Warnings**: ${totalWarnings} — ${totalWarnings > 0 ? 'Trade with reduced size and awareness' : 'None'}
- **Confirmed**: ${totalValid} checks passed

## If Trade Is Active
`;
if (overallStatus === "INVALIDATED") {
  out += `- **EXIT NOW** — the trade thesis is no longer valid.\n`;
} else {
  out += `- **SL**: ${r5(slPrice)} (${slPips} ${pairLabel === 'XAUUSD' ? 'pts' : 'pips'} risk)\n`;
  out += `- **Next check**: Re-evaluate on 4H close or if ${htfBias === 'bearish' ? 'price closes above 4H swing high' : 'price closes below 4H swing low'}\n`;
  out += `- **Scale out**: ${totalWarnings >= 2 ? 'Consider partial TP — warnings are accumulating' : 'Hold full position'}\n`;
}
out += `- **Re-entry**: Only if ALL dimensions return to VALID status\n`;

fs.writeFileSync(path.join(outDir, `${PAIR.toLowerCase()}_invalidation.md`), out, "utf8");

console.log(JSON.stringify({
  pair: pairLabel,
  overallStatus,
  totalInvalidated, totalWarnings, totalValid,
  price: { sl: r5(slPrice), slPips, atRisk: priceInvalidation.risk },
  summary: statusLabel[overallStatus] || overallStatus,
}, null, 2));
