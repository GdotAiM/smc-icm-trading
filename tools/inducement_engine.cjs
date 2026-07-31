// ICT Inducement (IDM) Engine — Entry Gate
// Audited against innercircletrader.net 2026-07-31
//
// Inducement = the first valid pullback after a BOS or CHOCH.
// It's a TRAP — smart money sweeps it to stop out early entrants.
// "Do not enter until the inducement is grabbed."
//
// Sequence: BOS/CHOCH → first pullback (≥0.5 Fib) → inducement level
//           → wait for sweep → MSS confirmation → entry gate OPEN
//
// Usage: node tools/inducement_engine.cjs PAIR

const fs = require("fs");
const path = require("path");

const L2 = require("./tv-mcp/lecture2_setup.cjs");

const ROOT = "C:/Users/cash/smc-icm-trading";
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

// ═══ 1. FIND MOST RECENT BOS OR CHOCH ═══
function findStructuralEvent(candles, swings) {
  if (!candles || candles.length < 10 || swings.length < 3) return null;

  // Use engine report for confirmed structure events
  const engine15m = loadEngine("15m");
  const engine1h = loadEngine("1h");
  const lastEvent = engine15m?.structure?.lastEvent || engine1h?.structure?.lastEvent || null;
  const lastEventPrice = engine15m?.structure?.lastEventPrice || engine1h?.structure?.lastEventPrice || null;
  const bias = engine15m?.structure?.bias || engine1h?.structure?.bias || "neutral";

  if (!lastEvent || !lastEventPrice) return null;

  // Determine BOS vs CHOCH from engine bias context
  const isCHOCH = lastEvent === "CHoCH";
  const isBOS = lastEvent === "BOS";

  if (!isCHOCH && !isBOS) return null;

  // Find the impulse leg that led to this structural event
  // The impulse leg = the move that broke the prior swing
  const eventIdx = candles.findIndex(c => Math.abs(c.close - lastEventPrice) / lastEventPrice < 0.001);
  const searchIdx = eventIdx >= 0 ? eventIdx : candles.length - 3;

  // Find the swing point that was broken (the prior extreme)
  let priorSwing = null;
  for (let i = swings.length - 1; i >= 0; i--) {
    if (swings[i].index < searchIdx) {
      if (isCHOCH) {
        // CHOCH: first break of counter-trend swing
        // Bearish CHOCH: broke a prior swing LOW
        // Bullish CHOCH: broke a prior swing HIGH
        if (bias === "bearish" && swings[i].type === "low") { priorSwing = swings[i]; break; }
        if (bias === "bullish" && swings[i].type === "high") { priorSwing = swings[i]; break; }
      } else {
        // BOS: continuation break
        if (bias === "bullish" && swings[i].type === "high") { priorSwing = swings[i]; break; }
        if (bias === "bearish" && swings[i].type === "low") { priorSwing = swings[i]; break; }
      }
    }
  }

  if (!priorSwing) return null;

  // The impulse leg = from prior swing to the structural break
  const impulseStart = priorSwing.index;
  const impulseEnd = searchIdx;
  const impulseCandles = candles.slice(impulseStart, impulseEnd + 1);

  if (impulseCandles.length < 3) return null;

  const impulseHigh = Math.max(...impulseCandles.map(c => c.high));
  const impulseLow = Math.min(...impulseCandles.map(c => c.low));
  const impulseRange = impulseHigh - impulseLow;

  return {
    type: isCHOCH ? "CHOCH" : "BOS",
    direction: bias,
    eventPrice: lastEventPrice,
    priorSwing: { index: priorSwing.index, price: priorSwing.price, type: priorSwing.type },
    impulseStart, impulseEnd,
    impulseCandles,
    impulseHigh, impulseLow, impulseRange,
    detail: `${isCHOCH ? 'CHOCH' : 'BOS'} ${bias} @ ${r5(lastEventPrice)} | Impulse: ${impulseCandles.length} candles, range ${r5(impulseRange)}`,
  };
}

// ═══ 2. FIND FIRST VALID PULLBACK IN IMPULSE LEG ═══
// ICT: "The first valid pullback inside the impulse leg that produced the BOS/CHOCH"
// Valid = retracement ≥ 0.5 Fibonacci of the impulse leg
function findFirstPullback(structuralEvent, candles) {
  if (!structuralEvent) return null;

  const impStart = structuralEvent.impulseStart;
  const impEnd = structuralEvent.impulseEnd;
  const isBullish = structuralEvent.direction === "bullish";
  const isBearish = structuralEvent.direction === "bearish";
  const impRange = structuralEvent.impulseRange;

  // Scan from impulse end BACKWARD to find first retracement ≥ 0.5 Fib
  const swings = L2.findSwings(candles, 1);
  const relevantSwings = swings.filter(s => s.index >= impStart && s.index <= impEnd);

  // The first pullback = first swing in the OPPOSITE direction within the impulse leg
  let pullbackSwing = null;
  for (const s of relevantSwings) {
    if (isBullish && s.type === "low") {
      // Bullish impulse: pullback = first swing LOW in the impulse leg
      pullbackSwing = s;
      break;
    }
    if (isBearish && s.type === "high") {
      // Bearish impulse: pullback = first swing HIGH in the impulse leg
      pullbackSwing = s;
      break;
    }
  }

  if (!pullbackSwing) return null;

  // Calculate Fib retracement of the pullback
  const retracement = isBullish
    ? (structuralEvent.impulseHigh - pullbackSwing.price) / impRange  // How far did it pull back from the high?
    : (pullbackSwing.price - structuralEvent.impulseLow) / impRange;   // How far did it pull back from the low?

  const valid = retracement >= 0.5; // Must retrace at least 50%

  return {
    swing: pullbackSwing,
    retracement: r2(retracement),
    fibLevel: retracement >= 0.79 ? "0.79" : retracement >= 0.705 ? "0.705" : retracement >= 0.62 ? "0.62" : retracement >= 0.5 ? "0.50" : "<0.50",
    valid,
    detail: valid
      ? `First pullback: ${pullbackSwing.type} @ ${r5(pullbackSwing.price)} | Retracement: ${r2(retracement * 100)}% — ✅ VALID (≥50%)`
      : `First pullback: ${pullbackSwing.type} @ ${r5(pullbackSwing.price)} | Retracement: ${r2(retracement * 100)}% — ❌ INVALID (<50%)`,
  };
}

// ═══ 3. MARK INDUCEMENT LEVEL ═══
// Bullish direction → inducement = pullback LOW (sell-side trap)
// Bearish direction → inducement = pullback HIGH (buy-side trap)
function markInducement(pullback, structuralEvent) {
  if (!pullback || !pullback.valid || !structuralEvent) return null;

  const isBullish = structuralEvent.direction === "bullish";
  const isBearish = structuralEvent.direction === "bearish";

  // Find the candle at the pullback swing to get its extreme
  const candles = structuralEvent.impulseCandles;
  const swingIdx = pullback.swing.index - structuralEvent.impulseStart;
  const swingCandle = candles[Math.max(0, Math.min(swingIdx, candles.length - 1))];

  let inducementPrice, inducementType;
  if (isBullish) {
    // Bullish: inducement = the LOW of the pullback (where sell stops sit)
    inducementPrice = pullback.swing.price;
    inducementType = "SSL (Sell-Side)";
  } else {
    // Bearish: inducement = the HIGH of the pullback (where buy stops sit)
    inducementPrice = pullback.swing.price;
    inducementType = "BSL (Buy-Side)";
  }

  return {
    price: inducementPrice,
    type: inducementType,
    direction: structuralEvent.direction,
    detail: `Inducement: ${inducementType} @ ${r5(inducementPrice)} — ${isBullish ? 'Sell-side trap below pullback low' : 'Buy-side trap above pullback high'}`,
  };
}

// ═══ 4. CHECK IF INDUCEMENT HAS BEEN SWEPT ═══
function checkInducementSweep(inducement, structuralEvent, candles1m) {
  if (!inducement || !candles1m || candles1m.length < 5) {
    return { swept: false, detail: "No inducement or insufficient data" };
  }

  const isBullish = inducement.direction === "bullish";
  const isBearish = inducement.direction === "bearish";

  // Find candles AFTER the structural event (impulse end)
  const eventTime = structuralEvent.impulseCandles[structuralEvent.impulseCandles.length - 1]?.time;
  const postEvent = eventTime
    ? candles1m.filter(c => c.time > eventTime)
    : candles1m.slice(-20);

  if (postEvent.length < 3) {
    return { swept: false, detail: "Not enough post-structure candles for sweep check" };
  }

  let swept = false, sweepCandle = null, reversed = false;

  if (isBullish) {
    // Bullish: price must dip BELOW inducement (sell-side sweep), then close back above
    for (const c of postEvent) {
      if (c.low < inducement.price) {
        swept = true;
        sweepCandle = c;
        break;
      }
    }
    if (swept) {
      const lastClose = postEvent[postEvent.length - 1].close;
      reversed = lastClose > inducement.price;
    }
  } else {
    // Bearish: price must spike ABOVE inducement (buy-side sweep), then close back below
    for (const c of postEvent) {
      if (c.high > inducement.price) {
        swept = true;
        sweepCandle = c;
        break;
      }
    }
    if (swept) {
      const lastClose = postEvent[postEvent.length - 1].close;
      reversed = lastClose < inducement.price;
    }
  }

  // Check for MSS after sweep
  let mssConfirmed = false;
  if (swept && reversed) {
    const fakeHunt = {
      active: true, reversed: true,
      direction: isBullish ? "BULLISH" : "BEARISH",
      swept: isBullish ? "INDUCEMENT LOW" : "INDUCEMENT HIGH",
      sweepPrice: inducement.price,
      sweepTime: sweepCandle?.time || new Date().toISOString(),
    };
    const mssCheck = L2.confirmMSS(candles1m, fakeHunt);
    mssConfirmed = mssCheck?.confirmed || false;
  }

  return {
    swept,
    reversed,
    mssConfirmed,
    sweepCandle: sweepCandle ? { time: sweepCandle.time, price: isBullish ? sweepCandle.low : sweepCandle.high } : null,
    currentPrice: postEvent[postEvent.length - 1]?.close || 0,
    detail: swept && reversed && mssConfirmed
      ? `✅ Inducement SWEPT + REVERSED + MSS CONFIRMED — entry gate OPEN`
      : swept && reversed
        ? `⚡ Inducement swept + reversed — awaiting MSS confirmation`
        : swept
          ? `⚡ Inducement swept — awaiting reversal back`
          : `⏳ Inducement NOT swept — entry gate CLOSED. Waiting for ${isBullish ? 'dip below' : 'spike above'} ${r5(inducement.price)}.`,
  };
}

// ═══ 5. ENTRY GATE DECISION ═══
function getEntryGate(sweepStatus, inducement) {
  const gateOpen = sweepStatus.swept && sweepStatus.reversed && sweepStatus.mssConfirmed;

  return {
    open: gateOpen,
    reason: gateOpen
      ? "✅ GATE OPEN — Inducement swept, reversed, MSS confirmed. Entry allowed."
      : `🛑 GATE CLOSED — ${sweepStatus.detail}`,
    inducementPrice: inducement?.price || null,
    slReference: inducement ? inducement.price : null, // SL beyond inducement extreme
  };
}

// ═══ MAIN ═══
function runInducementCheck(pair) {
  const p = pair || PAIR;
  const candles15m = loadCandles("15m");
  const candles1m = loadCandles("1m");

  if (!candles15m || !candles1m) {
    return { gateOpen: false, detail: "Insufficient candle data" };
  }

  const swings15m = L2.findSwings(candles15m, 2);

  // Step 1: Find structural event
  const structuralEvent = findStructuralEvent(candles15m, swings15m);

  // Step 2: Find first pullback
  const pullback = findFirstPullback(structuralEvent, candles15m);

  // Step 3: Mark inducement
  const inducement = markInducement(pullback, structuralEvent);

  // Step 4: Check inducement sweep
  const sweepStatus = checkInducementSweep(inducement, structuralEvent, candles1m);

  // Step 5: Entry gate
  const gate = getEntryGate(sweepStatus, inducement);

  return {
    pair: p,
    time: new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false }) + " NY",
    structuralEvent,
    pullback,
    inducement,
    sweepStatus,
    gate,
    detail: [
      structuralEvent?.detail || "No structural event found",
      pullback?.detail || "No valid pullback",
      inducement?.detail || "No inducement marked",
      sweepStatus.detail,
      gate.reason,
    ].join("\n"),
  };
}

// ═══ OUTPUT ═══
const result = runInducementCheck(PAIR);

const outDir = path.join(ROOT, "stages", "05b_micro_confirmation", "output");
fs.mkdirSync(outDir, { recursive: true });

let md = `# Inducement Check — ${result.pair} — ${DATE}\n\n`;

if (result.structuralEvent) {
  md += `## Structural Event\n${result.structuralEvent.detail}\n\n`;
}
if (result.pullback) {
  md += `## First Pullback\n${result.pullback.detail}\n\n`;
}
if (result.inducement) {
  md += `## Inducement Level\n${result.inducement.detail}\n\n`;
}
md += `## Sweep Status\n${result.sweepStatus.detail}\n\n`;
md += `## Entry Gate\n**${result.gate.reason}**\n`;
if (result.gate.open) {
  md += `- SL Reference: Beyond inducement @ ${r5(result.gate.inducementPrice)}\n`;
}

const outFile = path.join(outDir, `${PAIR.toLowerCase()}_inducement.md`);
fs.writeFileSync(outFile, md, "utf8");
console.log(`  ✓ Inducement → ${outFile}`);

// Console
console.log(`\n═══ INDUCEMENT CHECK — ${PAIR} ═══`);
console.log(`  Structure: ${result.structuralEvent?.detail || 'None'}`);
console.log(`  Pullback: ${result.pullback?.detail || 'None'}`);
console.log(`  Inducement: ${result.inducement?.detail || 'None'}`);
console.log(`  Sweep: ${result.sweepStatus.detail}`);
console.log(`  Gate: ${result.gate.reason}`);

module.exports = { runInducementCheck, findStructuralEvent, findFirstPullback, markInducement, checkInducementSweep, getEntryGate };
