// Multi-Pair Confluence Dashboard
// EURUSD + NAS100 + GOLD + GBPUSD + DXY
const fs = require("fs");
const path = require("path");

const ROOT = "C:\\Users\\cash\\smc-icm-trading";
const DATE = require("./ny_time.cjs").getNYDate();
const SHARED = path.join(ROOT, "shared", DATE);
const TFS = ["1W", "1D", "4H", "1H", "15m", "5m", "1m"];

function r2(v) { return Number(v).toFixed(2); }
function r5(v) { return Number(v).toFixed(5); }

// Load all reports
const pairs = ["EURUSD", "NAS100", "GOLD", "GBPUSD", "DXY"];
const allReports = {};

for (const pair of pairs) {
  allReports[pair] = {};
  for (const tf of TFS) {
    const file = path.join(SHARED, pair, `engine_${tf.toLowerCase()}.json`);
    try { allReports[pair][tf] = JSON.parse(fs.readFileSync(file, "utf8")); }
    catch { allReports[pair][tf] = null; }
  }
}

// ── Build cascade for each pair ──
function cascade(pair) {
  return TFS.map(tf => {
    const r = allReports[pair][tf];
    if (!r) return { bias: "N/A", conf: 0, event: "?", price: 0, pools: 0, obs: 0, fvgs: 0, disp: "?" };
    return {
      bias: r.structure.bias,
      conf: r.structure.confidence,
      event: r.structure.lastEvent || "none",
      price: r.structure.lastEventPrice || r.price,
      pools: r.liquidity.length,
      obs: r.orderBlocks.length,
      fvgs: r.fvgs.length,
      disp: r.volumeDisplacement.label,
    };
  });
}

const cascades = {};
for (const pair of pairs) cascades[pair] = cascade(pair);

// ── Determine dominant bias per pair ──
function dominantBias(c) {
  const biases = c.map(t => t.bias).filter(b => b !== "neutral" && b !== "N/A");
  return biases[0] || "neutral";
}

// ── Check DXY inverse correlation ──
const eurBias = dominantBias(cascades["EURUSD"]);
const dxyBias = dominantBias(cascades["DXY"]);
const inverseOk = (eurBias === "bearish" && dxyBias === "bullish") ||
                  (eurBias === "bullish" && dxyBias === "bearish");

// ── Count aligned pairs ──
const usdPairs = ["EURUSD", "GBPUSD", "GOLD"];
const usdBiases = usdPairs.map(p => {
  const c = cascades[p];
  return { pair: p, bias: c[1].bias, conf: c[1].conf, event: c[1].event };
});
const usdBearish = usdBiases.filter(b => b.bias === "bearish").length;
const usdBullish = usdBiases.filter(b => b.bias === "bullish").length;

// ── Build output ──
let out = `# Confluence Dashboard — ${DATE}

## Multi-Pair Bias Matrix (Daily)

| Pair | 1D Bias | Confidence | Event | Interpretation |
|------|---------|------------|-------|----------------|
`;
for (const pair of pairs) {
  if (pair === "DXY") continue;
  const d = cascades[pair][1]; // 1D
  const label = pair === "GOLD" ? "XAUUSD" : pair;
  const interpret = d.bias === "bearish" ? "USD strength" : d.bias === "bullish" ? "USD weakness" : "Neutral";
  out += `| ${label} | **${d.bias.toUpperCase()}** | ${r2(d.conf)} | ${d.event} ${d.price ? '@ ' + r5(d.price) : ''} | ${interpret} |\n`;
}
// DXY last
const dxy = cascades["DXY"][1];
out += `| DXY (USD Index) | **${dxy.bias.toUpperCase()}** | ${r2(dxy.conf)} | ${dxy.event} ${dxy.price ? '@ ' + r5(dxy.price) : ''} | ${dxy.bias === 'bullish' ? 'USD strengthening' : dxy.bias === 'bearish' ? 'USD weakening' : 'Neutral'} |\n`;

out += `
## Correlation Check

`;
if (eurBias !== "neutral" && dxyBias !== "neutral") {
  out += `- EURUSD: **${eurBias.toUpperCase()}** | DXY: **${dxyBias.toUpperCase()}**
- Inverse correlation: ${inverseOk ? '✅ CONFIRMED — DXY moving opposite to EURUSD as expected' : '⚠️ DIVERGENCE — DXY not inversely correlated with EURUSD — caution'}\n`;
} else {
  out += `- One or both pairs neutral — correlation check skipped\n`;
}

out += `
## Full Cascade — All Pairs

| TF | EURUSD | NAS100 | GOLD | GBPUSD | DXY |
|----|--------|--------|------|--------|-----|
`;
for (let i = 0; i < TFS.length; i++) {
  const tf = TFS[i];
  out += `| ${tf} |`;
  for (const pair of pairs) {
    const c = cascades[pair][i];
    const icon = c.bias === "bullish" ? "🟢" : c.bias === "bearish" ? "🔴" : c.bias === "N/A" ? "—" : "⚪";
    out += ` ${icon} ${c.bias} |`;
  }
  out += "\n";
}

out += `
## Per-Pair Top-Down Detail

### EURUSD
`;
out += pairDetail(cascades["EURUSD"], "EURUSD");
out += `### NAS100 (US100)
`;
out += pairDetail(cascades["NAS100"], "NAS100");
out += `### GOLD (XAUUSD)
`;
out += pairDetail(cascades["GOLD"], "GOLD");
out += `### GBPUSD
`;
out += pairDetail(cascades["GBPUSD"], "GBPUSD");
out += `### DXY (US Dollar Index)
`;
out += pairDetail(cascades["DXY"], "DXY");

out += `
## Confluence Scorecard

| Check | Status |
|-------|--------|
`;
// Check 1: EURUSD + GBPUSD aligned
const eurGbpAligned = cascades["EURUSD"][1].bias === cascades["GBPUSD"][1].bias;
out += `| EURUSD & GBPUSD aligned | ${eurGbpAligned ? '✅ Both ' + cascades['EURUSD'][1].bias.toUpperCase() + ' — USD direction clear' : '⚠️ Mixed — USD direction unclear'} |\n`;

// Check 2: DXY inverse to EURUSD
out += `| DXY inverse to EURUSD | ${inverseOk ? '✅ Correlation working' : '⚠️ Correlation broken'} |\n`;

// Check 3: Gold confirming risk sentiment
const goldBias = cascades["GOLD"][1].bias;
out += `| Gold (XAUUSD) | ${goldBias === 'bullish' ? '🟢 BULLISH — risk-on / USD weakness' : goldBias === 'bearish' ? '🔴 BEARISH — risk-off / USD strength' : '⚪ Neutral'} |\n`;

// Check 4: NAS100 risk barometer
const nasBias = cascades["NAS100"][1].bias;
out += `| NAS100 | ${nasBias === 'bullish' ? '🟢 BULLISH — equities bid, risk-on' : nasBias === 'bearish' ? '🔴 BEARISH — equities offered, risk-off' : '⚪ Neutral'} |\n`;

// Check 5: Multi-TF alignment per pair
out += `| Multi-TF Alignment | |\n`;
for (const pair of pairs) {
  const c = cascades[pair];
  const dom = dominantBias(c);
  const aligned = c.filter(t => t.bias === dom).length;
  out += `|   ${pair} | ${aligned}/${TFS.length} TFs aligned ${dom.toUpperCase()} |\n`;
}

out += `
## Trade Bias Summary

`;
const usdStrong = usdBearish >= 2;
const usdWeak = usdBullish >= 2;
const equitiesBid = cascades["NAS100"][1].bias === "bullish";
const goldBid = cascades["GOLD"][1].bias === "bullish";

if (usdStrong) {
  out += `**USD STRENGTH** — ${usdBearish}/3 USD pairs bearish. DXY ${dxyBias}. NAS100 ${nasBias}.\n`;
  out += `\n**Preferred setups**: SHORT EURUSD, SHORT GBPUSD, SHORT GOLD.\n`;
  out += `**Key risk**: DXY ${dxyBias !== 'bullish' ? 'NOT confirming — caution' : 'confirming ✅'}.\n`;
} else if (usdWeak) {
  out += `**USD WEAKNESS** — ${usdBullish}/3 USD pairs bullish. DXY ${dxyBias}. NAS100 ${nasBias}.\n`;
  out += `\n**Preferred setups**: LONG EURUSD, LONG GBPUSD, LONG GOLD.\n`;
  out += `**Key risk**: DXY ${dxyBias !== 'bearish' ? 'NOT confirming — caution' : 'confirming ✅'}.\n`;
} else {
  out += `**MIXED SIGNALS** — No clear USD direction. WAIT for alignment.\n`;
}

if (equitiesBid && goldBid) {
  out += `\n⚠️ **Both NAS100 AND Gold bullish** — unusual correlation. Possible USD crash or risk-on euphoria. Check fundamentals.\n`;
} else if (!equitiesBid && goldBid) {
  out += `\n🛡️ **Gold bullish, NAS100 not** — classic risk-off. Flight to safety. USD should weaken if gold bid is real.\n`;
} else if (equitiesBid && !goldBid) {
  out += `\n📈 **Equities bid, Gold offered** — pure risk-on. USD direction depends on rate expectations.\n`;
}

out += `
---
*Generated from live TradingView data | Engine: SMC Pulse*
*Pairs: EURUSD, NAS100 (US100), XAUUSD, GBPUSD, DXY (USDOLLAR)*
`;

const outFile = path.join(ROOT, "stages", "01_htf_bias", "output", "confluence.md");
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, out, "utf8");
console.log(`Confluence dashboard written to stages/01_htf_bias/output/confluence.md`);
console.log(out);

function pairDetail(c, label) {
  const dom = dominantBias(c);
  const aligned = c.filter(t => t.bias === dom).length;
  let d = `\`\`\`
`;
  d += TFS.map((tf, i) => {
    const bar = c[i].bias === "bullish" ? "█" : c[i].bias === "bearish" ? "█" : "·";
    return `  ${tf.padEnd(4)} ${bar.repeat(c[i].bias === 'bullish' ? 3 : c[i].bias === 'bearish' ? 3 : 0).padEnd(9)} ${c[i].bias.toUpperCase().padEnd(7)} ${c[i].event.padEnd(5)} ${c[i].pools}p ${c[i].obs}ob ${c[i].fvgs}fvg`;
  }).join("\n");
  d += `\n\`\`\`
  **Dominant**: ${dom.toUpperCase()} (${aligned}/${TFS.length} TFs aligned)
`;
  return d;
}
