// ICT Inducement (IDM) Engine — structure-timeframe library (WP-9)
// Audited against innercircletrader.net 2026-07-31
//
// Inducement = the first valid pullback after a BOS or CHOCH.
// It's a TRAP — smart money sweeps it to stop out early entrants.
// "Do not enter until the inducement is grabbed."
//
// Sequence: BOS/CHOCH → first pullback (≥0.5 Fib) → inducement level
//           → wait for sweep → MSS confirmation → entry gate OPEN
//
// WP-9 (audit Bug 6.6): the structural event, pullback, sweep, and MSS are all
// evaluated on the SAME timeframe as the structure break (default 15m). 1m is
// only used when a model explicitly specifies a fine "sentence" on 1m
// (`confirmTF: "1m"`). Confirming a 15m-sized fact with 1m candles is reading
// a fingerprint to check a door was unlocked — the scale of the fact must be
// the scale of the confirmation.
//
// Usage (CLI): node tools/inducement_engine.cjs PAIR
// Usage (lib): runInducementCheck(pair, { structureTF: "15m", confirmTF: "15m" })

const fs = require("fs");
const path = require("path");

const L2 = require("./tv-mcp/lecture2_setup.cjs");
const { LIQUIDITY_RAID_CONFIRMATION } = require("./lib/raid_config.cjs");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..");
const DATE = new Date().toISOString().split("T")[0];
const PAIR = process.argv[2] || "GBPUSD";

function r5(v) { return Number(v).toFixed(5); }
function r2(v) { return Number(v).toFixed(2); }

function loadCandles(tf, pair, date) {
  try {
    const p = pair || PAIR;
    const dir = p === "XAUUSD" ? "GOLD" : p;
    return JSON.parse(fs.readFileSync(path.join(ROOT, date || DATE, dir, `candles_${tf}.json`), "utf8"));
  } catch { return null; }
}

function loadEngine(tf, pair, date) {
  try {
    const p = pair || PAIR;
    const dir = p === "XAUUSD" ? "GOLD" : p;
    return JSON.parse(fs.readFileSync(path.join(ROOT, date || DATE, dir, `engine_${tf}.json`), "utf8"));
  } catch { return null; }
}

// ═══ 1. FIND MOST RECENT BOS OR CHOCH ═══
// `engines` = { [tf]: engineReport, ... }; the structure TF's report is read
// first, then the next-higher TF as fallback (both are structure-scale).
function findStructuralEvent(candles, swings, engines, structureTF = "15m") {
  if (!candles || candles.length < 10 || swings.length < 3) return null;

  const eng = engines || {};
  const fallbackTF = structureTF === "15m" ? "1h" : structureTF === "5m" ? "15m" : "1h";
  const lastEvent = eng[structureTF]?.structure?.lastEvent || eng[fallbackTF]?.structure?.lastEvent || null;
  const lastEventPrice = eng[structureTF]?.structure?.lastEventPrice || eng[fallbackTF]?.structure?.lastEventPrice || null;
  const bias = eng[structureTF]?.structure?.bias || eng[fallbackTF]?.structure?.bias || "neutral";

  if (!lastEvent || !lastEventPrice) return null;

  // Determine BOS vs CHOCH from engine bias context
  const isCHOCH = lastEvent === "CHoCH";
  const isBOS = lastEvent === "BOS";

  if (!isCHOCH && !isBOS) return null;

  // Find the impulse leg that led to this structural event
  // Search BACKWARDS from the end — event price may match old candles at the start
  let eventIdx = -1;
  for (let i = candles.length - 1; i >= 0; i--) {
    if (Math.abs(candles[i].close - lastEventPrice) / lastEventPrice < 0.001) {
      eventIdx = i; break;
    }
  }
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
    structureTF,
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

// ═══ 4. CHECK IF INDUCEMENT HAS BEEN SWEPT (STRUCTURE TF) ═══
// WP-9: the sweep, the reversal, AND the MSS are confirmed on the SAME
// timeframe as the structure break (default 15m). A model that specifies a fine
// 1m "sentence" passes `confirmTF: "1m"` explicitly — nothing defaults to 1m.
function checkInducementSweep(inducement, structuralEvent, confirmCandles, opts = {}) {
  const confirmTF = opts.confirmTF || structuralEvent?.structureTF || "15m";
  if (!inducement || !confirmCandles || confirmCandles.length < 5) {
    return { swept: false, confirmTF, detail: "No inducement or insufficient data" };
  }

  const isBullish = inducement.direction === "bullish";
  const isBearish = inducement.direction === "bearish";

  // Find candles AFTER the structural event (impulse end)
  const eventTime = structuralEvent.impulseCandles[structuralEvent.impulseCandles.length - 1]?.time;
  const postEvent = eventTime
    ? confirmCandles.filter(c => c.time > eventTime)
    : confirmCandles.slice(-20);

  if (postEvent.length < 3) {
    return { swept: false, confirmTF, detail: "Not enough post-structure candles for sweep check" };
  }

  let swept = false, sweepCandle = null, reversed = false;

  // WP-12 audit 5.7: raid confirmation by WICK (touch through the level) or by
  // CLOSE (body through the level) — one decision constant from config.
  const raidByClose = LIQUIDITY_RAID_CONFIRMATION === "close";

  if (isBullish) {
    // Bullish: price must dip BELOW inducement (sell-side sweep), then close back above
    for (const c of postEvent) {
      if (raidByClose ? c.close < inducement.price : c.low < inducement.price) {
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
      if (raidByClose ? c.close > inducement.price : c.high > inducement.price) {
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

  // Check for MSS after sweep — on the SAME confirmation timeframe.
  let mssConfirmed = false;
  let mssSource = null;
  if (swept && reversed) {
    const fakeHunt = {
      active: true, reversed: true,
      direction: isBullish ? "BULLISH" : "BEARISH",
      swept: isBullish ? "INDUCEMENT LOW" : "INDUCEMENT HIGH",
      sweepPrice: inducement.price,
      sweepTime: sweepCandle?.time || new Date().toISOString(),
    };
    const mss = L2.confirmMSS(confirmCandles, fakeHunt);
    if (mss?.confirmed) {
      mssConfirmed = true;
      mssSource = confirmTF;
    }
  }

  return {
    swept,
    reversed,
    mssConfirmed,
    mssSource,
    confirmTF,
    sweepCandle: sweepCandle ? { time: sweepCandle.time, price: isBullish ? sweepCandle.low : sweepCandle.high } : null,
    currentPrice: postEvent[postEvent.length - 1]?.close || 0,
    detail: swept && reversed && mssConfirmed
      ? `✅ Inducement SWEPT + REVERSED + MSS CONFIRMED (${confirmTF}) — entry gate OPEN`
      : swept && reversed
        ? `⚡ Inducement swept + reversed — awaiting MSS (${confirmTF})`
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
      ? `✅ GATE OPEN — Inducement swept, reversed, MSS confirmed (${sweepStatus.confirmTF || 'structure TF'}). Entry allowed.`
      : `🛑 GATE CLOSED — ${sweepStatus.detail}`,
    inducementPrice: inducement?.price || null,
    slReference: inducement ? inducement.price : null, // SL beyond inducement extreme
  };
}

// ═══ MAIN ═══
// Everything runs on the structure TF (default 15m): event, pullback,
// inducement, sweep, reversal, and MSS all on the same candles.
function runInducementCheck(pair, opts = {}) {
  const p = pair || PAIR;
  const structureTF = opts.structureTF || "15m";
  const confirmTF = opts.confirmTF || structureTF;
  const date = opts.date || DATE;

  const candlesStruct = loadCandles(structureTF, p, date);
  const candlesConfirm = confirmTF === structureTF ? candlesStruct : loadCandles(confirmTF, p, date);

  if (!candlesStruct || !candlesConfirm) {
    return { pair: p, structureTF, confirmTF, gateOpen: false, detail: "Insufficient candle data" };
  }

  const swingsStruct = L2.findSwings(candlesStruct, 2);
  const engines = { [structureTF]: loadEngine(structureTF, p, date) };
  if (structureTF === "15m") engines["1h"] = loadEngine("1h", p, date);
  if (structureTF === "5m") engines["15m"] = loadEngine("15m", p, date);

  // Step 1: Find structural event on the structure TF
  const structuralEvent = findStructuralEvent(candlesStruct, swingsStruct, engines, structureTF);

  // Step 2: Find first pullback (same candles, same scale)
  const pullback = findFirstPullback(structuralEvent, candlesStruct);

  // Step 3: Mark inducement
  const inducement = markInducement(pullback, structuralEvent);

  // Step 4: Check inducement sweep — structure-TF confirmation (no 1m default)
  const sweepStatus = checkInducementSweep(inducement, structuralEvent, candlesConfirm, { confirmTF });

  // Step 5: Entry gate
  const gate = getEntryGate(sweepStatus, inducement);

  return {
    pair: p,
    structureTF,
    confirmTF,
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

// ═══ OUTPUT (CLI) ═══
const result = runInducementCheck(PAIR);

const outDir = path.join(ROOT, "stages", "05b_micro_confirmation", "output");
fs.mkdirSync(outDir, { recursive: true });

let md = `# Inducement Check — ${result.pair} — ${DATE} (${result.structureTF} confirm)\n\n`;

if (result.structuralEvent) {
  md += `## Structural Event\n${result.structuralEvent.detail}\n\n`;
}
if (result.pullback) {
  md += `## First Pullback\n${result.pullback.detail}\n\n`;
}
if (result.inducement) {
  md += `## Inducement Level\n${result.inducement.detail}\n\n`;
}
md += `## Sweep Status\n${result.sweepStatus?.detail || "No sweep analysis — insufficient data"}\n\n`;
md += `## Entry Gate\n**${result.gate?.reason || "GATE CLOSED — insufficient data"}**\n`;
if (result.gate?.open) {
  md += `- SL Reference: Beyond inducement @ ${r5(result.gate.inducementPrice)}\n`;
}

const outFile = path.join(outDir, `${PAIR.toLowerCase()}_inducement.md`);
fs.writeFileSync(outFile, md, "utf8");
console.log(`  ✓ Inducement → ${outFile}`);

// Console
console.log(`\n═══ INDUCEMENT CHECK — ${PAIR} (${result.structureTF} confirm) ═══`);
console.log(`  Structure: ${result.structuralEvent?.detail || 'None'}`);
console.log(`  Pullback: ${result.pullback?.detail || 'None'}`);
console.log(`  Inducement: ${result.inducement?.detail || 'None'}`);
console.log(`  Sweep: ${result.sweepStatus?.detail || 'No sweep analysis — insufficient data'}`);
console.log(`  Gate: ${result.gate?.reason || 'GATE CLOSED — insufficient data'}`);

module.exports = { runInducementCheck, findStructuralEvent, findFirstPullback, markInducement, checkInducementSweep, getEntryGate };
