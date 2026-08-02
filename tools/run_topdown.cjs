// ICT Top-Down Analysis — 1W → 1D → 4H → 1H → 15m → 5m → 1m
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = "C:\\Users\\cash\\smc-icm-trading";
const ENGINE = path.join(ROOT, "tools", "smc-engine");
const TMP = process.env.TEMP || "/tmp";
const PAIR = "EURUSD";
const now = new Date();
const DATE = now.toISOString().split("T")[0];

function r2(v) { return Number(v).toFixed(2); }
function r5(v) { return Number(v).toFixed(5); }
function pips(v) { return Math.round(v * 10000); }

// Load pre-generated engine reports
const TFS = ["1W", "1D", "4H", "1H", "15m", "5m", "1m"];
const sharedDir = path.join(ROOT, "shared", DATE, PAIR);
fs.mkdirSync(sharedDir, { recursive: true });

const reports = {};
console.log("Loading engine reports...");
for (const tf of TFS) {
  const file = path.join(sharedDir, `engine_${tf.toLowerCase()}.json`);
  try {
    reports[tf] = JSON.parse(fs.readFileSync(file, "utf8"));
    console.log(`  ${tf}: ${reports[tf].structure.bias} (conf ${r2(reports[tf].structure.confidence)}) | ${reports[tf].liquidity.length} pools | ${reports[tf].orderBlocks.length} OBs | ${reports[tf].fvgs.length} FVGs`);
  } catch (e) {
    console.error(`  ${tf}: LOAD FAILED — ${e.message.slice(0, 60)}`);
    reports[tf] = null;
  }
}

// ═══════════════════════════════════════════════════
// TOP-DOWN CASCADE ANALYSIS
// ═══════════════════════════════════════════════════

// Determine bias cascade
const biasChain = TFS.map(tf => reports[tf] ? reports[tf].structure.bias : "N/A");
const biases = biasChain.filter(b => b !== "N/A" && b !== "neutral");
const anchorTf = biasChain.findIndex(b => b !== "neutral" && b !== "N/A");
const anchorLabel = anchorTf >= 0 ? TFS[anchorTf] : "none";
const dominantBias = biases[0] || "neutral";

// Count aligned TFs
const alignedTFs = TFS.filter((tf, i) => {
  if (i === 0) return reports[tf] && reports[tf].structure.bias !== "neutral";
  return reports[tf] && reports[tf].structure.bias === reports[TFS[0]].structure.bias;
}).length;

// Find highest-TF structure event
let htfEvent = null;
for (const tf of ["1W", "1D", "4H"]) {
  const r = reports[tf];
  if (r && r.structure.lastEvent && r.structure.lastEvent !== "none") {
    htfEvent = { tf, event: r.structure.lastEvent, price: r.structure.lastEventPrice, bias: r.structure.bias };
    break;
  }
}

// Entry-level details (1H, 15m, 5m, 1m)
const entryTFs = ["1H", "15m", "5m", "1m"];
const entryBias = reports["1H"] ? reports["1H"].structure.bias : "neutral";
const ltfOBs = entryTFs.reduce((sum, tf) => sum + (reports[tf] ? reports[tf].orderBlocks.length : 0), 0);
const ltfFVGs = entryTFs.reduce((sum, tf) => sum + (reports[tf] ? reports[tf].fvgs.length : 0), 0);

// Find displacement on any TF
const strongestDisp = TFS.map(tf => ({
  tf,
  label: reports[tf] ? reports[tf].volumeDisplacement.label : "n/a",
  ratio: reports[tf] ? reports[tf].volumeDisplacement.atrRatio : 0
})).sort((a, b) => b.ratio - a.ratio)[0];

// Draw targets from HTF
const htfDraw = reports["4H"] ? reports["4H"].draw : (reports["1D"] ? reports["1D"].draw : null);
const htfAlt = reports["4H"] ? reports["4H"].alt : (reports["1D"] ? reports["1D"].alt : null);

// ═══════════════════════════════════════════════════
// BUILD OUTPUT
// ═══════════════════════════════════════════════════
const stageDir = path.join(ROOT, "stages", "01_htf_bias", "output");
fs.mkdirSync(stageDir, { recursive: true });

let out = `# Top-Down Analysis — ${PAIR} — ${DATE}

## Bias Cascade (1W → 1m)

\`\`\`
1W  ${"■".repeat(biasChain[0] === "bearish" ? 3 : biasChain[0] === "bullish" ? 3 : 0)} ${biasChain[0].toUpperCase()}  ${reports["1W"] ? "conf " + r2(reports["1W"].structure.confidence) : "N/A"}
1D  ${"■".repeat(biasChain[1] === "bearish" ? 3 : biasChain[1] === "bullish" ? 3 : 0)} ${biasChain[1].toUpperCase()}  ${reports["1D"] ? "conf " + r2(reports["1D"].structure.confidence) : "N/A"}
4H  ${"■".repeat(biasChain[2] === "bearish" ? 3 : biasChain[2] === "bullish" ? 3 : 0)} ${biasChain[2].toUpperCase()}  ${reports["4H"] ? "conf " + r2(reports["4H"].structure.confidence) : "N/A"}
1H  ${"■".repeat(biasChain[3] === "bearish" ? 2 : biasChain[3] === "bullish" ? 2 : 0)} ${biasChain[3].toUpperCase()}  ${reports["1H"] ? "conf " + r2(reports["1H"].structure.confidence) : "N/A"}
15m ${"■".repeat(biasChain[4] === "bearish" ? 1 : biasChain[4] === "bullish" ? 1 : 0)} ${biasChain[4].toUpperCase()}  ${reports["15m"] ? "conf " + r2(reports["15m"].structure.confidence) : "N/A"}
5m  ${biasChain[5] === biasChain[0] ? "↓" : "·"} ${biasChain[5]}  ${reports["5m"] ? "conf " + r2(reports["5m"].structure.confidence) : "N/A"}
1m  ${biasChain[6] === biasChain[0] ? "↓" : "·"} ${biasChain[6]}  ${reports["1m"] ? "conf " + r2(reports["1m"].structure.confidence) : "N/A"}
\`\`\`

## Cascade Summary

| Metric | Value |
|--------|-------|
| **Dominant Bias** | **${dominantBias.toUpperCase()}** |
| **Anchor TF** | ${anchorLabel} (${anchorTf >= 0 ? biasChain[anchorTf].toUpperCase() : 'N/A'}) |
| **Aligned TFs** | ${alignedTFs} / ${TFS.length} |
| **HTF Event** | ${htfEvent ? htfEvent.event + ' @ ' + r5(htfEvent.price) + ' on ' + htfEvent.tf : 'None'} |
| **LTF OBs** | ${ltfOBs} across 1H→1m |
| **LTF FVGs** | ${ltfFVGs} across 1H→1m |
| **Strongest Displacement** | ${strongestDisp.tf} — ${strongestDisp.label} (${r2(strongestDisp.ratio)}x ATR) |

## Per-Timeframe Breakdown

| TF | Bias | Last Event | Price | Confidence | Pools | OBs | FVGs | Displacement |
|----|------|------------|-------|------------|-------|-----|------|-------------|
${TFS.map(tf => {
  const r = reports[tf];
  if (!r) return `| ${tf} | — | — | — | — | — | — | — | — |`;
  return `| ${tf} | **${r.structure.bias.toUpperCase()}** | ${r.structure.lastEvent || 'none'} | ${r5(r.structure.lastEventPrice || r.price)} | ${r2(r.structure.confidence)} | ${r.liquidity.length} | ${r.orderBlocks.length} | ${r.fvgs.length} | ${r.volumeDisplacement.label} |`;
}).join("\n")}

## Structure Map

### Higher Timeframes (1W / 1D / 4H)
${["1W", "1D", "4H"].map(tf => {
  const r = reports[tf];
  if (!r) return `- **${tf}**: No data`;
  const swHi = r.structure.lastSwingHigh ? r5(r.structure.lastSwingHigh) : "?";
  const swLo = r.structure.lastSwingLow ? r5(r.structure.lastSwingLow) : "?";
  return `- **${tf}**: ${r.structure.bias.toUpperCase()} | ${r.structure.lastEvent || 'no event'} | Swings: H ${swHi} / L ${swLo} | ${r.structure.bias === 'bullish' ? 'HH+HL sequence — bullish structure intact' : r.structure.bias === 'bearish' ? 'LH+LL sequence — bearish structure intact' : 'No clear structure'}`
}).join("\n")}

### Lower Timeframes (1H / 15m / 5m / 1m)
${entryTFs.map(tf => {
  const r = reports[tf];
  if (!r) return `- **${tf}**: No data`;
  const aligned = r.structure.bias === dominantBias ? "✅" : "⚠️";
  return `- **${tf}**: ${aligned} ${r.structure.bias.toUpperCase()} | ${r.structure.lastEvent || 'no event'} | OBs: ${r.orderBlocks.length} | FVGs: ${r.fvgs.length} | Disp: ${r.volumeDisplacement.label}`
}).join("\n")}

## Liquidity Map (Key Pools)

| TF | Type | Price | Strength | Score | Distance | Swept |
|----|------|-------|----------|-------|----------|-------|
${["1D", "4H", "1H"].flatMap(tf => {
  const r = reports[tf];
  if (!r) return [];
  return r.liquidity.slice(0, 3).map(p => `| ${tf} | ${p.type} | ${r5(p.price)} | ${p.strength} | ${r2(p.score)} | ${r2(p.distance)}% | ${p.swept ? '⚡' : ''} |`);
}).join("\n")}

## Trade Bias Decision

**${dominantBias.toUpperCase()}** — ${alignedTFs} of ${TFS.length} timeframes aligned.

${alignedTFs >= 5 ?
  `Strong cascade alignment. ${dominantBias === 'bearish' ? 'Look for SHORT entries on LTF retracements to supply zones.' : dominantBias === 'bullish' ? 'Look for LONG entries on LTF retracements to demand zones.' : ''}` :
  alignedTFs >= 3 ?
  `Moderate alignment. Trade with caution, reduce position size.` :
  `Mixed signals across timeframes. WAIT for alignment or skip.`}

### HTF Draw Targets
${htfDraw ? `- **Primary**: ${htfDraw.side.toUpperCase()} @ ${r5(htfDraw.price)} — ${htfDraw.reason} (score: ${r2(htfDraw.score)})` : '- No primary draw target'}
${htfAlt ? `- **Alternate**: ${htfAlt.side.toUpperCase()} @ ${r5(htfAlt.price)} — ${htfAlt.reason} (score: ${r2(htfAlt.score)})` : '- No alternate target'}

## Entry Refinement (LTF)

| TF | Bias | Entry Signal | OBs in Play | FVGs in Play |
|----|------|-------------|-------------|-------------|
${entryTFs.map(tf => {
  const r = reports[tf];
  if (!r) return `| ${tf} | — | — | — | — |`;
  const sig = r.structure.lastEvent === "CHoCH" ? "⚠️ CHoCH — potential reversal" :
              r.structure.lastEvent === "BOS" ? "BOS — continuation" : "No clear signal";
  return `| ${tf} | ${r.structure.bias.toUpperCase()} | ${sig} | ${r.orderBlocks.length} | ${r.fvgs.length} |`;
}).join("\n")}

---

*Generated: ${new Date().toISOString()} | Data source: TradingView Desktop (live)*
*Engine: SMC Pulse @ ${ROOT}*
`;

fs.writeFileSync(path.join(stageDir, "topdown.md"), out, "utf8");
console.log(`\n✓ Top-down analysis written to stages/01_htf_bias/output/topdown.md`);
console.log(`\n═══════════════════════════════════════════`);
console.log(`TOP-DOWN CASCADE: ${biasChain.map(b => b === 'bearish' ? '🔴' : b === 'bullish' ? '🟢' : '⚪').join(' → ')}`);
console.log(`Bias: ${dominantBias.toUpperCase()} | Aligned: ${alignedTFs}/${TFS.length} | Anchor: ${anchorLabel}`);
console.log(`HTF Event: ${htfEvent ? htfEvent.event + ' @ ' + r5(htfEvent.price) : 'None'}`);
console.log(`Displacement: ${strongestDisp.tf} ${strongestDisp.label} (${r2(strongestDisp.ratio)}x)`);
if (htfDraw) console.log(`Draw: ${htfDraw.side} @ ${r5(htfDraw.price)} | Alt: ${htfAlt ? htfAlt.side + ' @ ' + r5(htfAlt.price) : 'none'}`);
console.log(`═══════════════════════════════════════════`);
