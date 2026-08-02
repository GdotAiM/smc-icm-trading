// ICT Market Order Flow — Pullback Zones Before BOS
// Audited against innercircletrader.net 2026-07-31
//
// Order Flow = the pullback candles inside a directional leg BEFORE a BOS.
// These are institutional accumulation (bullish) / distribution (bearish) footprints.
// After BOS confirms, price retraces BACK to these zones for re-entry.
//
// NOT the same as Order Blocks. OB = last opposing candle. OF = ALL pullbacks.
// "1st OF is tested first. No confirmation → escalate to 2nd OF."
//
// Usage: node tools/order_flow.cjs PAIR

const fs = require("fs");
const path = require("path");

const L2 = require("./tv-mcp/lecture2_setup.cjs");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..");
const DATE = new Date().toISOString().split("T")[0];
const PAIR = process.argv[2] || "GBPUSD";

function r5(v) { return Number(v).toFixed(5); }
function r2(v) { return Number(v).toFixed(2); }

function loadCandles(tf) {
  try {
    const dir = PAIR === "XAUUSD" ? "GOLD" : PAIR;
    return JSON.parse(fs.readFileSync(path.join(ROOT, "shared", DATE, dir, `candles_${tf}.json`), "utf8"));
  } catch { return null; }
}

function loadEngine(tf) {
  try {
    const dir = PAIR === "XAUUSD" ? "GOLD" : PAIR;
    return JSON.parse(fs.readFileSync(path.join(ROOT, "shared", DATE, dir, `engine_${tf}.json`), "utf8"));
  } catch { return null; }
}

// ═══ 1. FIND BOS LEG ═══
// Isolate the impulse leg that produced the most recent BOS
function findBOSLeg(candles, swings) {
  if (!candles || candles.length < 10 || swings.length < 3) return null;

  const engine15m = loadEngine("15m");
  const engine1h = loadEngine("1h");
  // Prefer 1H for BOS (more significant), fall back to 15m
  const primaryEngine = (engine1h?.structure?.lastEvent === "BOS") ? engine1h :
                         (engine15m?.structure?.lastEvent === "BOS") ? engine15m :
                         (engine1h?.structure?.lastEvent === "CHoCH") ? engine1h :
                         (engine15m?.structure?.lastEvent === "CHoCH") ? engine15m : null;
  if (!primaryEngine) return null;

  const lastEvent = primaryEngine.structure.lastEvent;
  const lastEventPrice = primaryEngine.structure.lastEventPrice;
  const bias = primaryEngine.structure.bias || "neutral";
  const sourceTF = primaryEngine === engine1h ? "1H" : "15m";

  if (!lastEventPrice || bias === "neutral") return null;
  // Accept both BOS and CHoCH — both create valid structural legs with pullbacks
  if (lastEvent !== "BOS" && lastEvent !== "CHoCH") return null;

  // Find BOS point in candles
  let bosIdx = -1;
  for (let i = candles.length - 1; i >= 0; i--) {
    if (Math.abs(candles[i].close - lastEventPrice) / lastEventPrice < 0.002) {
      bosIdx = i; break;
    }
  }
  if (bosIdx < 0) bosIdx = candles.length - 3;

  // Find the prior swing that was broken
  let priorSwing = null;
  for (let i = swings.length - 1; i >= 0; i--) {
    if (swings[i].index < bosIdx) {
      if (bias === "bullish" && swings[i].type === "high") { priorSwing = swings[i]; break; }
      if (bias === "bearish" && swings[i].type === "low") { priorSwing = swings[i]; break; }
    }
  }
  if (!priorSwing) return null;

  const legCandles = candles.slice(priorSwing.index, bosIdx + 1);
  if (legCandles.length < 4) return null;

  return {
    direction: bias,
    priorSwing: { index: priorSwing.index, price: priorSwing.price, type: priorSwing.type },
    bosIdx, bosPrice: lastEventPrice,
    legCandles,
    legHigh: Math.max(...legCandles.map(c => c.high)),
    legLow: Math.min(...legCandles.map(c => c.low)),
    detail: `${lastEvent} ${bias} @ ${r5(lastEventPrice)} (${sourceTF}) | Leg: ${legCandles.length} candles from ${priorSwing.type} @ ${r5(priorSwing.price)}`,
  };
}

// ═══ 2. MARK OF ZONES ═══
// Find ALL counter-trend pullback candles inside the BOS leg
// Bullish BOS → bearish pullback candles = bullish OF zones (support for re-entry)
// Bearish BOS → bullish pullback candles = bearish OF zones (resistance for re-entry)
function markOFZones(bosLeg) {
  if (!bosLeg) return [];

  const isBullish = bosLeg.direction === "bullish";
  const zones = [];
  let currentCluster = null;

  for (let i = 0; i < bosLeg.legCandles.length; i++) {
    const c = bosLeg.legCandles[i];
    const isCounterTrend = isBullish
      ? c.close < c.open  // Bearish candle in bullish leg = OF zone
      : c.close > c.open; // Bullish candle in bearish leg = OF zone

    if (isCounterTrend) {
      if (!currentCluster) {
        currentCluster = { candles: [c], startIdx: i, high: c.high, low: c.low };
      } else {
        currentCluster.candles.push(c);
        currentCluster.high = Math.max(currentCluster.high, c.high);
        currentCluster.low = Math.min(currentCluster.low, c.low);
      }
    } else if (currentCluster) {
      // End of cluster — save it
      zones.push({
        high: currentCluster.high,
        low: currentCluster.low,
        mid: (currentCluster.high + currentCluster.low) / 2,
        candleCount: currentCluster.candles.length,
        type: isBullish ? "BULLISH OF (Support)" : "BEARISH OF (Resistance)",
      });
      currentCluster = null;
    }
  }

  // Don't forget last cluster
  if (currentCluster) {
    zones.push({
      high: currentCluster.high,
      low: currentCluster.low,
      mid: (currentCluster.high + currentCluster.low) / 2,
      candleCount: currentCluster.candles.length,
      type: isBullish ? "BULLISH OF (Support)" : "BEARISH OF (Resistance)",
    });
  }

  // Label sequentially (1st OF = closest to BOS, 2nd = next, etc.)
  zones.reverse(); // Closest to BOS first
  zones.forEach((z, i) => {
    z.label = `${i + 1}${i === 0 ? 'st' : i === 1 ? 'nd' : i === 2 ? 'rd' : 'th'} OF`;
    z.priority = i + 1;
    z.detail = `${z.label}: ${z.type} @ ${r5(z.mid)} (H ${r5(z.high)} L ${r5(z.low)}, ${z.candleCount}c)`;
  });

  return zones;
}

// ═══ 3. CHECK OF RETRACEMENT ═══
// Has price retraced back to any OF zone after the BOS?
function checkOFRetracement(ofZones, bosLeg, currentPrice) {
  if (!ofZones.length || !bosLeg) return { testing: false, detail: "No OF zones marked" };

  // Find which zone price is currently inside or nearest to
  let testingZone = null;
  for (const zone of ofZones) {
    if (currentPrice >= zone.low && currentPrice <= zone.high) {
      testingZone = zone;
      break;
    }
  }

  // If not inside any zone, find nearest
  if (!testingZone) {
    let nearest = ofZones[0];
    let nearestDist = Math.abs(currentPrice - ofZones[0].mid);
    for (const zone of ofZones) {
      const dist = Math.abs(currentPrice - zone.mid);
      if (dist < nearestDist) { nearest = zone; nearestDist = dist; }
    }
    testingZone = nearest;
  }

  const inside = currentPrice >= testingZone.low && currentPrice <= testingZone.high;

  return {
    testing: inside,
    testedZone: testingZone,
    inside,
    currentPrice,
    distanceToZone: r2(Math.abs(currentPrice - testingZone.mid)),
    detail: inside
      ? `✅ Price INSIDE ${testingZone.label} (${testingZone.type}) — look for LTF confirmation`
      : `⏳ Price ${r2(Math.abs(currentPrice - testingZone.mid))} from nearest zone: ${testingZone.label}`,
  };
}

// ═══ 4. ENTRY CONFIRMATION INSIDE OF ZONE ═══
function checkOFConfirmation(ofZone, reports, candles1m) {
  if (!ofZone) return { confirmed: false, detail: "No OF zone to check" };

  const r1h = reports["1H"];
  const r15m = reports["15m"];

  // Check for MSS inside/near the zone
  const mssEvent = r15m?.structure?.lastEvent === "CHoCH" || r1h?.structure?.lastEvent === "CHoCH";
  const mssDirection = r15m?.structure?.bias || r1h?.structure?.bias;

  // Check for FVG near the zone
  const nearbyFvgs = (r15m?.fvgs || []).concat(r1h?.fvgs || []).filter(f => {
    const fMid = (f.top + f.bottom) / 2;
    return fMid >= ofZone.low * 0.999 && fMid <= ofZone.high * 1.001 && (f.fillFraction || 0) < 0.3;
  });

  // Check for OB near the zone
  const nearbyOBs = (r15m?.orderBlocks || []).concat(r1h?.orderBlocks || []).filter(ob => {
    const obMid = (ob.proximal + ob.distal) / 2;
    return obMid >= ofZone.low * 0.999 && obMid <= ofZone.high * 1.001;
  });

  const hasFVG = nearbyFvgs.length > 0;
  const hasOB = nearbyOBs.length > 0;
  const confirmed = mssEvent && (hasFVG || hasOB);

  return {
    confirmed,
    mssEvent, mssDirection,
    fvgsInZone: nearbyFvgs.length,
    obsInZone: nearbyOBs.length,
    detail: confirmed
      ? `✅ OF CONFIRMED: ${ofZone.label} — MSS ${mssDirection} + ${hasFVG ? nearbyFvgs.length + ' FVG(s)' : ''}${hasOB ? ' + ' + nearbyOBs.length + ' OB(s)' : ''}`
      : mssEvent
        ? `MSS confirmed but no PD array in zone — waiting for FVG/OB formation`
        : `⏳ Awaiting MSS + PD array inside ${ofZone.label}`,
  };
}

// ═══ MAIN ═══
function analyzeOrderFlow(pair) {
  const p = pair || PAIR;
  const candles15m = loadCandles("15m");
  const candles1m = loadCandles("1m");
  const reports = {};
  for (const tf of ["1H", "15m", "5m"]) reports[tf] = loadEngine(tf);

  if (!candles15m) return { zones: [], detail: "No 15m candle data" };

  const swings15m = L2.findSwings(candles15m, 2);
  const currentPrice = reports["1H"]?.price || reports["15m"]?.price || 0;

  // Step 1: Find BOS leg
  const bosLeg = findBOSLeg(candles15m, swings15m);

  // Step 2: Mark OF zones
  const ofZones = markOFZones(bosLeg);

  // Step 3: Check retracement
  const retracement = checkOFRetracement(ofZones, bosLeg, currentPrice);

  // Step 4: Entry confirmation
  const confirmation = retracement.testing
    ? checkOFConfirmation(retracement.testedZone, reports, candles1m)
    : { confirmed: false, detail: "Price not at OF zone yet" };

  return {
    pair: p,
    time: new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false }) + " NY",
    bosLeg,
    zones: ofZones,
    zoneCount: ofZones.length,
    retracement,
    confirmation,
    detail: [
      bosLeg?.detail || "No BOS found",
      `${ofZones.length} OF zones marked`,
      retracement.detail,
      confirmation.detail,
    ].join("\n"),
  };
}

// ═══ OUTPUT ═══
const result = analyzeOrderFlow(PAIR);

const outDir = path.join(ROOT, "stages", "02_key_levels", "output");
fs.mkdirSync(outDir, { recursive: true });

let md = `# Order Flow Zones — ${result.pair} — ${DATE}\n\n`;

if (result.bosLeg) {
  md += `## BOS Leg\n${result.bosLeg.detail}\n\n`;
}

md += `## OF Zones (${result.zoneCount} marked)\n`;
md += `| Zone | Type | Price (Mid) | High | Low | Candles |\n`;
md += `|------|------|-------------|------|-----|--------|\n`;
for (const z of result.zones) {
  md += `| ${z.label} | ${z.type} | ${r5(z.mid)} | ${r5(z.high)} | ${r5(z.low)} | ${z.candleCount} |\n`;
}

md += `\n## Retracement\n${result.retracement.detail}\n`;
if (result.retracement.testing) {
  md += `- Tested Zone: ${result.retracement.testedZone?.label}\n`;
}

md += `\n## Entry Confirmation\n${result.confirmation.detail}\n`;
if (result.confirmation.confirmed) {
  md += `- MSS: ${result.confirmation.mssEvent ? '✅ ' + result.confirmation.mssDirection : 'No'}\n`;
  md += `- FVGs in zone: ${result.confirmation.fvgsInZone} | OBs in zone: ${result.confirmation.obsInZone}\n`;
}

const outFile = path.join(outDir, `${PAIR.toLowerCase()}_order_flow.md`);
fs.writeFileSync(outFile, md, "utf8");
console.log(`  ✓ Order Flow → ${outFile}`);

console.log(`\n═══ ORDER FLOW — ${PAIR} ═══`);
console.log(`  BOS: ${result.bosLeg?.detail || 'None'}`);
console.log(`  Zones: ${result.zoneCount} marked`);
for (const z of result.zones) console.log(`    ${z.detail}`);
console.log(`  Retracement: ${result.retracement.detail}`);
console.log(`  Confirmation: ${result.confirmation.detail}`);

module.exports = { analyzeOrderFlow, findBOSLeg, markOFZones, checkOFRetracement, checkOFConfirmation };
