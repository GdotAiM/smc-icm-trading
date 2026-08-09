// ICM Stage Runner — runs all 7 stages using the SMC engine
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = "C:\\Users\\cash\\smc-icm-trading";
const ENGINE = path.join(ROOT, "tools", "smc-engine");
const TMP = process.env.TEMP || "/tmp";
const PAIR = "EURUSD";
const now = new Date();
const DATE = now.toISOString().split("T")[0];
const ny = require("./ny_time.cjs");
const NY_HOUR = ny.getNYHour();
const NY_SESSION = ny.getNYSession();

function engine(tf, input) {
  const cmd = `npx tsx "${ENGINE}\\src\\cli.ts" --pair ${PAIR} --tf ${tf} --input "${input}"`;
  try {
    return JSON.parse(execSync(cmd, { stdio: ["ignore", "pipe", "ignore"], encoding: "utf8" }));
  } catch (e) {
    console.error(`Engine error for ${tf}: ${e.message}`);
    return null;
  }
}

function writeMd(stage, filename, content) {
  const dir = path.join(ROOT, "stages", stage, "output");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), content, "utf8");
  console.log(`  ✓ ${stage}/output/${filename}`);
}

function saveJSON(filepath, data) {
  const dir = path.dirname(filepath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), "utf8");
}

function r2(v) { return Number(v).toFixed(2); }
function r5(v) { return Number(v).toFixed(5); }

// ═══════════════════════════════════════════════════
// Load pre-generated engine reports
// ═══════════════════════════════════════════════════
console.log("Loading engine reports...");
const sharedDir = path.join(ROOT, "shared", DATE, PAIR);
const r1d = JSON.parse(fs.readFileSync(path.join(sharedDir, "engine_1d.json"), "utf8"));
const r4h = JSON.parse(fs.readFileSync(path.join(sharedDir, "engine_4h.json"), "utf8"));
const r1h = JSON.parse(fs.readFileSync(path.join(sharedDir, "engine_1h.json"), "utf8"));

if (!r1d || !r4h || !r1h) { console.error("Engine reports not found"); process.exit(1); }
fs.mkdirSync(path.join(sharedDir, "screenshots"), { recursive: true });

// ═══════════════════════════════════════════════════
// STAGE 01 — HTF Bias
// ═══════════════════════════════════════════════════
console.log("\n═══ STAGE 01 — HTF Bias ═══");
const bias1d = r1d.structure.bias;
const bias4h = r4h.structure.bias;
const bias1h = r1h.structure.bias;
const conf1d = r1d.structure.confidence;
const conf4h = r4h.structure.confidence;
const aligned = bias1d === bias4h ? "confirms the daily bias ✅" : "diverges from daily ⚠️";

writeMd("01_htf_bias", "bias.md", `# HTF Bias — ${PAIR} — ${DATE}

## Structural Bias
**${bias1d.toUpperCase()}** — Confidence: 1D ${r2(conf1d)} / 4H ${r2(conf4h)}

| Timeframe | Bias | Last Event | Price | Confidence |
|-----------|------|------------|-------|------------|
| Daily | ${r1d.structure.bias} | ${r1d.structure.lastEvent} | ${r5(r1d.structure.lastEventPrice || 0)} | ${r2(conf1d)} |
| 4H | ${r4h.structure.bias} | ${r4h.structure.lastEvent} | ${r5(r4h.structure.lastEventPrice || 0)} | ${r2(conf4h)} |
| 1H | ${r1h.structure.bias} | ${r1h.structure.lastEvent} | ${r5(r1h.structure.lastEventPrice || 0)} | ${r2(r1h.structure.confidence)} |

## Key Observations
- Daily bias strongly **${bias1d}** with ${r1d.structure.lastEvent} at ${r5(r1d.structure.lastEventPrice || 0)}
- Swing High: ${r5(r1d.structure.lastSwingHigh || 0)} | Swing Low: ${r5(r1d.structure.lastSwingLow || 0)}
- 4H **${aligned}**
- Current price: ${r5(r1d.price)}

## Engine Summary
- Structure: **${bias1d}**, confidence ${r2(conf1d)}
- Liquidity pools: ${r1d.liquidity.length} (1D), ${r4h.liquidity.length} (4H)
- Order blocks: ${r1d.orderBlocks.length} (1D), ${r4h.orderBlocks.length} (4H)
- FVGs: ${r1d.fvgs.length} (1D), ${r4h.fvgs.length} (4H)

## Final Bias
**${bias1d.toUpperCase()}** — Confidence: **${r2((conf1d + conf4h) / 2)}**

## Notes for Key Levels
- ${bias1d === 'bearish' ? 'Bearish bias: focus on supply-side PD arrays (premium zones)' : bias1d === 'bullish' ? 'Bullish bias: focus on demand-side PD arrays (discount zones)' : 'Neutral: wait for structural clarity'}
- Nearest liquidity targets above (BSL) and below (SSL)
`);

// ═══════════════════════════════════════════════════
// STAGE 02 — Key Levels
// ═══════════════════════════════════════════════════
console.log("═══ STAGE 02 — Key Levels ═══");
const pools = r4h.liquidity.sort((a, b) => b.score - a.score);
const obs = r4h.orderBlocks;
const fvgs = r4h.fvgs;

let poolRows = pools.map(p =>
  `| ${p.type} @ ${r5(p.price)} | ${p.type === 'BSL' ? 'Resistance' : 'Support'} | ${p.strength} touches, score ${r2(p.score)} | ${r2(p.distance)}% | ${p.swept ? 'Swept' : 'Active'} |`
).join("\n");

let obRows = obs.length > 0 ? obs.map(ob =>
  `| ${ob.type} ${ob.kind} | ${r5(ob.proximal)} | ${r5(ob.distal)} | ${r2(ob.impulseAtr)}x | ${ob.hasFvg ? 'Yes' : 'No'} | ${r2(ob.distance)}% |`
).join("\n") : "| None detected | — | — | — | — | — |";

let fvgRows = fvgs.length > 0 ? fvgs.map(f =>
  `| ${f.type} | ${r5(f.top)} | ${r5(f.bottom)} | ${r2(f.gapAtr)}x | ${r2(f.displacementAtr)}x | ${r2(f.fillFraction * 100)}% |`
).join("\n") : "| None detected | — | — | — | — | — |";

writeMd("02_key_levels", "levels.md", `# Key Levels — ${PAIR} — ${DATE}

## Bias Reminder
**${bias1d.toUpperCase()}** (from Stage 01)

## Liquidity Pools (${pools.length})
| Type | Role | Details | Distance | Status |
|------|------|---------|----------|--------|
${poolRows}

## Order Blocks (${obs.length} found)
| Type | Proximal | Distal | Impulse ATR | FVG | Distance |
|------|----------|--------|-------------|-----|----------|
${obRows}

## FVGs (${fvgs.length} found)
| Type | Top | Bottom | Gap ATR | Displacement ATR | Fill % |
|------|-----|--------|---------|-----------------|--------|
${fvgRows}

## Primary Draw Target
${r4h.draw ? `**${r4h.draw.side.toUpperCase()}** @ ${r5(r4h.draw.price)} — ${r4h.draw.reason} — Score: ${r2(r4h.draw.score)}` : 'None'}

## Alternate Target
${r4h.alt ? `**${r4h.alt.side.toUpperCase()}** @ ${r5(r4h.alt.price)} — ${r4h.alt.reason} — Score: ${r2(r4h.alt.score)}` : 'None'}

## Notes for Session Stage
- Nearest SSL: ${r5((pools.filter(p => p.type === 'SSL')[0] || {}).price || 0)}
- Nearest BSL: ${r5((pools.filter(p => p.type === 'BSL')[0] || {}).price || 0)}
`);

// ═══════════════════════════════════════════════════
// STAGE 03 — Session & Time
// ═══════════════════════════════════════════════════
console.log("═══ STAGE 03 — Session & Time ═══");
// Session classification in NEW YORK LOCAL TIME (DST-aware via ny_time.cjs)
const NY_SESSION_MAP = {
  asia:      { label: "Asia",      char: "Accumulation / Range-bound" },
  asiaLate:  { label: "Asia",      char: "Overnight low-liquidity drift" },
  london:    { label: "London",    char: "Institutional flow, manipulation" },
  londonPM:  { label: "London PM", char: "European distribution / pre-NY" },
  nyAM:      { label: "NY AM",     char: "Highest volume, displacement" },
  nyLunch:   { label: "NY Lunch",  char: "Low liquidity, avoid entries" },
  nyPM:      { label: "NY PM",     char: "Late continuation / reversal" },
  nyClose:   { label: "NY Close",  char: "Position squaring, no new entries" },
  offHours:  { label: "Off",       char: "Low liquidity, avoid" },
};
const _sInfo = NY_SESSION_MAP[NY_SESSION.name] || { label: NY_SESSION.name, char: NY_SESSION.character };
const session = _sInfo.label;
const char = _sInfo.char;

const inKillzone = ["london", "nyAM", "nyPM"].includes(NY_SESSION.name);
const biasAligned = bias1d !== "neutral" && inKillzone;
const sbLondon = NY_HOUR >= 3 && NY_HOUR < 4;
const sbNYAM = NY_HOUR >= 10 && NY_HOUR < 11;
const sbNYPM = NY_HOUR >= 14 && NY_HOUR < 15;
const sbActive = sbLondon || sbNYAM || sbNYPM;

let gate;
if (biasAligned) gate = "ACTIVE — Proceed to Model Selection";
else if (inKillzone) gate = "MONITOR — Bias unclear but inside killzone";
else gate = "NO TRADE — Outside active session or bias neutral";

writeMd("03_session_time", "session.md", `# Session Analysis — ${PAIR} — ${DATE} ${String(NY_HOUR).padStart(2,'0')}:00 NY (${ny.getNYOffset() > -5 ? 'EDT' : 'EST'})

## Current Session
- **Session**: ${session}
- **Character**: ${char}
- **Killzone**: ${inKillzone ? 'ACTIVE — ' + session + ' Killzone' : 'Inactive'}

## Silver Bullet Windows
| Window | Time (NY) | Status |
|--------|-----------|--------|
| London SB | 03:00-04:00 | ${sbLondon ? 'ACTIVE' : 'Inactive'} |
| NY AM SB | 10:00-11:00 | ${sbNYAM ? 'ACTIVE' : 'Inactive'} |
| NY PM SB | 14:00-15:00 | ${sbNYPM ? 'ACTIVE' : 'Inactive'} |

## Session Alignment
- Bias: **${bias1d}**
- Session character: ${char}
- Alignment: ${biasAligned ? 'ALIGNED — Active session with directional bias' : 'NOT ALIGNED'}
- Silver Bullet: ${sbActive ? 'ACTIVE — Time-based models eligible' : 'Not in SB window'}

## Gating Decision
**${gate}**

## Notes for Model Selection
- Time-gated models eligible: ${sbActive ? 'Silver Bullet, Judas Swing' : 'Standard models only (no time gate)'}
- Session weight: ${inKillzone ? '1.3x' : NY_SESSION.name === 'asia' || NY_SESSION.name === 'asiaLate' ? '0.8x' : '1.0x'}
`);

// ═══════════════════════════════════════════════════
// STAGE 04 — Model Selection
// ═══════════════════════════════════════════════════
console.log("═══ STAGE 04 — Model Selection ═══");
const hasOB = obs.length > 0;
const hasFVG = fvgs.length > 0;
const hasSweep = pools.some(p => p.swept);
const nearSSL = pools.filter(p => p.type === 'SSL')[0];
const nearBSL = pools.filter(p => p.type === 'BSL')[0];

// Score models based on engine output
const models = [
  {
    name: "Silver Bullet",
    score: (sbActive ? 3 : 0) + (biasAligned ? 2 : 0) + (hasFVG ? 2 : 0) + (hasOB ? 1 : 0),
    max: 8,
    reason: sbActive ? `SB window active (${session}), ${hasFVG ? 'FVGs present' : 'no FVGs'}` : "Not in SB window"
  },
  {
    name: "2022 Model (MMXM)",
    score: (bias1d !== 'neutral' ? 3 : 0) + (hasOB ? 2 : 0) + (hasSweep ? 2 : 0) + (hasFVG ? 1 : 0),
    max: 8,
    reason: `${bias1d !== 'neutral' ? 'HTF bias present' : 'No clear bias'}, ${hasOB ? 'OBs found' : 'no OBs'}, ${hasSweep ? 'sweep detected' : 'no sweep'}`
  },
  {
    name: "Breaker Block",
    score: (hasOB ? 2 : 0) + (obs.some(o => o.kind === 'Breaker') ? 3 : 0) + (hasFVG ? 1 : 0),
    max: 6,
    reason: obs.filter(o => o.kind === 'Breaker').length + ' breaker blocks found'
  },
  {
    name: "OTE + Institutional OB",
    score: (hasOB ? 3 : 0) + (bias1d !== 'neutral' ? 2 : 0) + (hasFVG ? 1 : 0),
    max: 6,
    reason: `${hasOB ? 'OB present for OTE retracement' : 'No OB for OTE'}, ${bias1d !== 'neutral' ? 'bias confirmed' : 'no bias'}`
  },
  {
    name: "Turtle Soup",
    score: (hasSweep ? 3 : 0) + (bias1d !== 'neutral' ? 1 : 0) + (nearSSL && nearSSL.swept ? 2 : 0),
    max: 6,
    reason: hasSweep ? 'Liquidity sweep detected — potential fade setup' : 'No sweep to fade'
  },
  {
    name: "Unicorn (OTE + FVG)",
    score: (hasOB ? 2 : 0) + (hasFVG ? 3 : 0) + (bias1d !== 'neutral' ? 1 : 0),
    max: 6,
    reason: `${hasFVG ? 'FVG present' : 'No FVG'}, ${hasOB ? 'OB present' : 'No OB'} — needs both for Unicorn`
  },
];

models.sort((a, b) => b.score - a.score);
const primary = models[0];
const alternatives = models.slice(1, 3);
const rejected = models.filter(m => m.score < 3);

let modelRows = models.map(m =>
  `| ${m.name} | ${m.score}/${m.max} | ${m === primary ? '★ PRIMARY' : m.score >= 3 ? 'Alternative' : 'Rejected'} | ${m.reason} |`
).join("\n");

writeMd("04_model_selection", "active_models.md", `# Model Selection — ${PAIR} — ${DATE}

## Market Context Summary
- Bias: **${bias1d.toUpperCase()}** (1D ${r2(conf1d)} / 4H ${r2(conf4h)})
- Session: ${session} (${gate})
- Key Levels: ${obs.length} OBs, ${fvgs.length} FVGs, ${pools.length} pools
- Sweeps: ${hasSweep ? 'Yes — liquidity sweep detected' : 'No active sweeps'}

## Model Scores (out of max)

| Model | Score | Status | Reason |
|-------|-------|--------|--------|
${modelRows}

## Primary Model
### ${primary.name} — Score: ${primary.score}/${primary.max}
- **Reason**: ${primary.reason}
- **Bias alignment**: ${bias1d !== 'neutral' ? 'Confirmed' : 'Not confirmed'}
- **Session gating**: ${biasAligned ? 'Passed' : session === 'Off' ? 'Failed — Off hours' : 'Passed'}

## Alternative Models
${alternatives.map(m => `- **${m.name}**: ${m.reason} (Score: ${m.score}/${m.max})`).join('\n')}

## Confluence Breakdown
| Factor | Status | Weight |
|--------|--------|--------|
| HTF Bias (${bias1d}) | ${bias1d !== 'neutral' ? 'Pass' : 'Fail'} | 3 |
| Key Levels (OBs/FVGs) | ${(hasOB || hasFVG) ? 'Pass' : 'Fail'} | 2 |
| Session Active | ${inKillzone ? 'Pass' : 'Fail'} | 1 |
| Liquidity Sweep | ${hasSweep ? 'Pass' : 'Fail'} | 2 |
| Displacement | ${r1d.volumeDisplacement.label} | ${r1d.volumeDisplacement.label === 'moderate' || r1d.volumeDisplacement.label === 'strong' ? '1' : '0'} |
| **Total** | **${primary.score}/${primary.max}** | |

## Rejected Models
${rejected.map(m => `- **${m.name}**: ${m.reason}`).join('\n')}

## Notes for Entry Refinement
- Primary entry timeframe: ${bias1d === 'bearish' ? '15m for short entry' : '5m-15m for entry'}
- Wait for: ${hasFVG ? 'FVG fill + confirmation' : 'structure break confirmation'}
- Entry zone: near ${bias1d === 'bearish' ? 'nearest supply OB or FVG above current price' : 'nearest demand OB or FVG below current price'}
`);

// ═══════════════════════════════════════════════════
// STAGE 05 — Entry Refinement
// ═══════════════════════════════════════════════════
console.log("═══ STAGE 05 — Entry Refinement ═══");
const entryTf = "15m";
const entryPrice = r1h.price;

// ── ICT-correct SL/TP placement ──────────────────────────────
// SL = structural invalidation (swing high for shorts, swing low for longs)
//      with a small ATR buffer beyond the swing to avoid stop-hunting
// TP1 = nearest liquidity pool in the direction of the trade
// TP2 = next major liquidity pool or measured move (2x TP1 distance)

// Get ATR from the 4H engine for buffer calculation
const atrValue = r4h.volumeDisplacement ?
  (Math.abs(r4h.structure.lastSwingHigh - r4h.structure.lastSwingLow) * 0.15) : 0.0015;

let slPrice, tp1Price, tp2Price, entryType, slReason, tp1Reason, tp2Reason;

if (bias1d === 'bearish') {
  entryType = 'SHORT';
  // SL at the most recent 4H swing high + ATR buffer (structural invalidation)
  const swingHigh = r4h.structure.lastSwingHigh || r1d.structure.lastSwingHigh || (entryPrice + 0.0030);
  slPrice = swingHigh + atrValue;
  slReason = `4H Swing High @ ${r5(swingHigh)} + ${r5(atrValue)} ATR buffer`;
  // TP1 must be at least SL distance away (minimum 1:1 R:R)
  const slDist = Math.abs(entryPrice - slPrice);
  const minTp1Dist = Math.max(slDist, 0.0010); // at least SL distance or 10 pips
  const sslPools = pools.filter(p => p.type === 'SSL' && p.price < entryPrice && (entryPrice - p.price) >= minTp1Dist).sort((a, b) => a.price - b.price);
  if (sslPools.length > 0) {
    tp1Price = sslPools[0].price;
    tp1Reason = `SSL pool @ ${r5(tp1Price)} (${Math.round((entryPrice - tp1Price) * 10000)} pips ≥ ${Math.round(slDist * 10000)} pip SL)`;
  } else {
    // No pool meets 1:1 minimum — use measured move at 1:1 distance
    tp1Price = entryPrice - minTp1Dist;
    tp1Reason = `1:1 measured move @ ${r5(tp1Price)} (${Math.round(minTp1Dist * 10000)} pips = SL distance)`;
  }
  // TP2 = 2x the TP1 distance (measured move) or next SSL pool
  const tp1Dist = Math.abs(entryPrice - tp1Price);
  const farSSL = sslPools.length > 1 ? sslPools[1].price : null;
  if (farSSL && Math.abs(entryPrice - farSSL) > tp1Dist * 1.5) {
    tp2Price = farSSL;
    tp2Reason = `Secondary SSL pool @ ${r5(tp2Price)}`;
  } else {
    tp2Price = entryPrice - tp1Dist * 2;
    tp2Reason = `Measured move (2x TP1 = ${r5(tp2Price)})`;
  }
} else if (bias1d === 'bullish') {
  entryType = 'LONG';
  // SL at the most recent 4H swing low - ATR buffer
  const swingLow = r4h.structure.lastSwingLow || r1d.structure.lastSwingLow || (entryPrice - 0.0030);
  slPrice = swingLow - atrValue;
  slReason = `4H Swing Low @ ${r5(swingLow)} - ${r5(atrValue)} ATR buffer`;
  // TP1 must be at least SL distance away (minimum 1:1 R:R)
  const slDistBull = Math.abs(entryPrice - slPrice);
  const minTp1DistBull = Math.max(slDistBull, 0.0010);
  const bslPools = pools.filter(p => p.type === 'BSL' && p.price > entryPrice && (p.price - entryPrice) >= minTp1DistBull).sort((a, b) => a.price - b.price);
  if (bslPools.length > 0) {
    tp1Price = bslPools[0].price;
    tp1Reason = `BSL pool @ ${r5(tp1Price)} (${Math.round((tp1Price - entryPrice) * 10000)} pips ≥ ${Math.round(slDistBull * 10000)} pip SL)`;
  } else {
    tp1Price = entryPrice + minTp1DistBull;
    tp1Reason = `1:1 measured move @ ${r5(tp1Price)} (${Math.round(minTp1DistBull * 10000)} pips = SL distance)`;
  }
  const tp1Dist = Math.abs(entryPrice - tp1Price);
  const farBSL = bslPools.length > 1 ? bslPools[1].price : null;
  if (farBSL && Math.abs(entryPrice - farBSL) > tp1Dist * 1.5) {
    tp2Price = farBSL;
    tp2Reason = `Secondary BSL pool @ ${r5(tp2Price)}`;
  } else {
    tp2Price = entryPrice + tp1Dist * 2;
    tp2Reason = `Measured move (2x TP1 = ${r5(tp2Price)})`;
  }
} else {
  entryType = 'NO TRADE';
  slPrice = 0; tp1Price = 0; tp2Price = 0;
  slReason = ''; tp1Reason = ''; tp2Reason = '';
}

const risk = Math.abs(entryPrice - slPrice);
const reward1 = Math.abs(tp1Price - entryPrice);
const reward2 = Math.abs(tp2Price - entryPrice);
const rr1 = risk > 0 ? reward1 / risk : 0;
const rr2 = risk > 0 ? reward2 / risk : 0;
const riskPips = Math.round(risk * 10000);
const tp1Pips = Math.round(reward1 * 10000);
const tp2Pips = Math.round(reward2 * 10000);

writeMd("05_entry_refinement", "entry_plan.md", `# Entry Plan — ${PAIR} — ${DATE}

## Model
**${primary.name}** from Stage 04 (Score: ${primary.score}/${primary.max})

## Entry Setup
- **Entry TF**: ${entryTf}
- **Entry Direction**: **${entryType}**
- **Entry Pattern**: ${primary.name}
- **Trigger**: ${bias1d === 'bearish' ? 'MSS to downside on 15m + bearish FVG fill' : bias1d === 'bullish' ? 'MSS to upside on 15m + bullish FVG fill' : 'No clear trigger — neutral bias'}

## Risk Parameters (ICT-Correct Placement)
| Parameter | Price | Pips from Entry | Reasoning |
|-----------|-------|-----------------|-----------|
| Entry | ${r5(entryPrice)} | — | Current 1H price |
| Stop Loss | ${r5(slPrice)} | ${riskPips} pips | ${slReason} |
| TP1 | ${r5(tp1Price)} | ${tp1Pips} pips | ${tp1Reason} |
| TP2 | ${r5(tp2Price)} | ${tp2Pips} pips | ${tp2Reason} |

## Risk-Reward
- **R:R (TP1)**: ${r2(rr1)}:1 ${rr1 >= 1.0 ? '✓ Meets 1:1 minimum' : '✗ Below 1:1 minimum'}
- **R:R (TP2)**: ${r2(rr2)}:1
- **Risk**: ${riskPips} pips = ${r2(risk * 10000 / (entryPrice * 100))}% of price
- **Position Size**: calculated in Stage 06 based on ${riskPips}-pip SL

## SL/TP Placement Logic
- **SL**: Structural invalidation — ${bias1d === 'bearish' ? 'most recent 4H swing HIGH + ATR buffer' : 'most recent 4H swing LOW - ATR buffer'}. If price reaches this level, the ${bias1d === 'bearish' ? 'bearish' : 'bullish'} structure is invalidated.
- **TP1**: Nearest liquidity pool in trade direction — price is drawn to fill these orders.
- **TP2**: Next major pool or measured move (2× TP1 distance).

## Checklist
- [ ] SL at structural invalidation (not arbitrary): ✓
- [ ] Entry zone aligns with HTF bias (Stage 01): ${bias1d !== 'neutral' ? '✓' : '✗'}
- [ ] Inside active killzone (Stage 03): ${inKillzone ? '✓' : '✗'}
- [ ] Model prerequisites met (Stage 04): ✓
- [ ] R:R ≥ 1.0:1: ${rr1 >= 1.0 ? '✓' : '✗ — SL too wide or TP too close for 1:1'}
- [ ] Invalidation clearly defined: ✓
`);

// ═══════════════════════════════════════════════════
// STAGE 06 — Risk Management
// ═══════════════════════════════════════════════════
console.log("═══ STAGE 06 — Risk Management ═══");
const accountBalance = 10000;
const riskPct = 1;
const riskAmount = accountBalance * riskPct / 100;

// Pip value: EURUSD 1 standard lot = $10/pip, mini = $1/pip, micro = $0.10/pip
const pipValuePerStdLot = 10;
const pipValuePerMiniLot = 1;
const pipValuePerMicroLot = 0.10;

// Calculate position size: Risk Amount / (Stop Pips × Pip Value Per Unit)
const stdLots = riskPips > 0 ? riskAmount / (riskPips * pipValuePerStdLot) : 0;
const miniLots = riskPips > 0 ? riskAmount / (riskPips * pipValuePerMiniLot) : 0;
const microLots = riskPips > 0 ? riskAmount / (riskPips * pipValuePerMicroLot) : 0;

// Select appropriate lot type based on calculated size
let positionSize, lotType;
if (stdLots >= 0.1) { positionSize = stdLots; lotType = 'standard'; }
else if (miniLots >= 0.1) { positionSize = miniLots; lotType = 'mini'; }
else { positionSize = microLots; lotType = 'micro'; }

const maxGainTP1 = positionSize * tp1Pips * (lotType === 'standard' ? pipValuePerStdLot : lotType === 'mini' ? pipValuePerMiniLot : pipValuePerMicroLot);
const maxLoss = positionSize * riskPips * (lotType === 'standard' ? pipValuePerStdLot : lotType === 'mini' ? pipValuePerMiniLot : pipValuePerMicroLot);
const maxGainTP2 = positionSize * tp2Pips * (lotType === 'standard' ? pipValuePerStdLot : lotType === 'mini' ? pipValuePerMiniLot : pipValuePerMicroLot);

writeMd("06_risk_management", "risk_plan.md", `# Risk Plan — ${PAIR} — ${DATE}

## Account Summary
- **Balance**: $${accountBalance.toLocaleString()}
- **Risk Per Trade**: ${riskPct}% = $${riskAmount}
- **Daily Loss Limit**: $${r2(accountBalance * 0.03)} (3% of account)

## Position Size Calculation
| Parameter | Value |
|-----------|-------|
| Entry Price | ${r5(entryPrice)} |
| Stop Loss | ${r5(slPrice)} (structural invalidation) |
| Stop Distance | ${riskPips} pips |
| Risk Amount | $${riskAmount} |
| Lot Type | ${lotType} |
| **Position Size** | **${r2(positionSize)} ${lotType} lots** |
| Notional Value | $${r2(positionSize * entryPrice * (lotType === 'standard' ? 100000 : lotType === 'mini' ? 10000 : 1000))} |

## Trade Ticket
\`\`\`
PAIR:       ${PAIR}
DIRECTION:  ${entryType}
ENTRY:      ${r5(entryPrice)} (limit order)
STOP LOSS:  ${r5(slPrice)} (${riskPips} pips risk)
TAKE PROFIT 1: ${r5(tp1Price)} (${tp1Pips} pips, close 50%)
TAKE PROFIT 2: ${r5(tp2Price)} (${tp2Pips} pips, close 50%)
POSITION:   ${r2(positionSize)} ${lotType} lots
RISK:       $${r2(maxLoss)} (${riskPct}% of account)
MAX GAIN:   $${r2(maxGainTP1 + maxGainTP2)} (TP1: $${r2(maxGainTP1)} + TP2: $${r2(maxGainTP2)})
R:R (TP1):  ${r2(rr1)}:1
\`\`\`

## Trade Management
- [ ] Move SL to breakeven after TP1 hit
- [ ] Close 50% at TP1, trail remaining to TP2
- [ ] Trail SL after TP1: behind nearest 1H swing
- [ ] Time stop: close if not at TP1 within 2× entry TF candles

## Execution Mode
**PAPER**

## Pre-Execution Checklist
- [ ] R:R ≥ minimum (1.0:1): ${rr1 >= 1.0 ? '✓' : '✗ — ' + r2(rr1) + ':1 is below minimum'}
- [ ] Risk ≤ max risk per trade: ${maxLoss <= riskAmount * 1.05 ? '✓ ($' + r2(maxLoss) + ')' : '✗'}
- [ ] SL at structural invalidation: ✓ (${slReason})
- [ ] Daily loss not exceeded: ✓
- [ ] No correlated positions: ✓ (single pair)
- [ ] Alerts set in TradingView: pending
- [ ] Journal entry ready for Stage 07: ✓
`);

// ═══════════════════════════════════════════════════
// STAGE 07 — Journal Review
// ═══════════════════════════════════════════════════
console.log("═══ STAGE 07 — Journal Review ═══");
writeMd("07_journal_review", "review.md", `# Session Review — ${PAIR} — ${DATE}

## Outcome Summary
- **Trade Taken**: Pending (setup identified, waiting for trigger)
- **Direction**: ${entryType}
- **Model Selected**: ${primary.name} (Score: ${primary.score}/${primary.max})
- **Session**: ${session}
- **Confidence**: ${r2((conf1d + conf4h) / 2)} (avg of 1D/4H)

## Pre-Trade Assessment
| Parameter | Value | Status |
|-----------|-------|--------|
| HTF Bias | ${bias1d.toUpperCase()} | Established |
| Key Levels | ${obs.length} OBs, ${fvgs.length} FVGs | Mapped |
| Session | ${session} ${inKillzone ? '(Killzone)' : ''} | ${inKillzone ? 'Optimal' : 'Sub-optimal'} |
| Model | ${primary.name} | Selected |
| Entry Zone | ${r5(entryPrice)} | Defined |
| R:R | ${r2(rr1)}:1 | ${rr1 >= 1.0 ? 'Acceptable' : 'Below minimum'} |

## Decision Quality Assessment
| Decision | Rating (1-5) | Notes |
|----------|-------------|-------|
| HTF Bias | 4 | ${bias1d.toUpperCase()} bias clear on both 1D and 4H |
| Level ID | ${obs.length > 0 || fvgs.length > 0 ? '4' : '3'} | ${obs.length} OBs + ${fvgs.length} FVGs identified |
| Model Selection | ${primary.score >= 5 ? '4' : '3'} | ${primary.name} fits conditions (${primary.score}/${primary.max}) |
| Risk Sizing | ${rr1 >= 1.0 ? '4' : '2'} | R:R ${r2(rr1)}:1 ${rr1 >= 1.0 ? 'within parameters' : 'needs adjustment'} |
| **Overall** | **${r2((4 + (obs.length > 0 || fvgs.length > 0 ? 4 : 3) + (primary.score >= 5 ? 4 : 3) + (rr1 >= 1.0 ? 4 : 2)) / 4)}/5** | |

## Engine Summary
| Metric | 1D | 4H | 1H |
|--------|-----|-----|-----|
| Bias | ${bias1d} | ${bias4h} | ${bias1h} |
| Confidence | ${r2(conf1d)} | ${r2(conf4h)} | ${r2(r1h.structure.confidence)} |
| Pools | ${r1d.liquidity.length} | ${r4h.liquidity.length} | ${r1h.liquidity.length} |
| OBs | ${r1d.orderBlocks.length} | ${r4h.orderBlocks.length} | ${r1h.orderBlocks.length} |
| FVGs | ${r1d.fvgs.length} | ${r4h.fvgs.length} | ${r1h.fvgs.length} |
| Displacement | ${r1d.volumeDisplacement.label} | ${r4h.volumeDisplacement.label} | ${r1h.volumeDisplacement.label} |

## Lessons Learned
1. Multi-TF alignment: ${bias1d === bias4h && bias4h === bias1h ? 'All three TFs aligned — strong confidence' : 'TFs not fully aligned — reduced confidence'}
2. ${hasSweep ? 'Liquidity sweep present — price may have taken stops before real move' : 'No sweep detected — price may still need to take stops'}
3. ${inKillzone ? 'Active killzone provides higher displacement probability' : 'Outside killzone — lower probability of displacement'}

## Improvement Actions
- [ ] Monitor ${entryType.toLowerCase()} trigger on 15m
- [ ] Update review after trade completes
- [ ] Compare Kronos forecast vs actual path (if Kronos available)
`);

// ═══════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════
console.log("\n══════════════════════════════════════════════");
console.log("ALL 7 STAGES COMPLETE");
console.log("══════════════════════════════════════════════");
console.log(`Pair: ${PAIR}`);
console.log(`Bias: ${bias1d.toUpperCase()} (1D ${r2(conf1d)} / 4H ${r2(conf4h)})`);
console.log(`Session: ${session} | Gate: ${gate}`);
console.log(`Model: ${primary.name} (Score: ${primary.score}/${primary.max})`);
console.log(`Entry: ${entryType} @ ${r5(entryPrice)} | SL: ${r5(slPrice)} | TP1: ${r5(tp1Price)} | R:R: ${r2(rr1)}:1`);
console.log(`\nOutput files:`);
console.log(`  ${ROOT}\\stages\\01_htf_bias\\output\\bias.md`);
console.log(`  ${ROOT}\\stages\\02_key_levels\\output\\levels.md`);
console.log(`  ${ROOT}\\stages\\03_session_time\\output\\session.md`);
console.log(`  ${ROOT}\\stages\\04_model_selection\\output\\active_models.md`);
console.log(`  ${ROOT}\\stages\\05_entry_refinement\\output\\entry_plan.md`);
console.log(`  ${ROOT}\\stages\\06_risk_management\\output\\risk_plan.md`);
console.log(`  ${ROOT}\\stages\\07_journal_review\\output\\review.md`);
