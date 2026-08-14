// Missed Entry Handler — ICT "How To Navigate The Same Trade Idea"
// + "Turning Loss Into Gain – Market Alchemy" (extended).
//
// Missing the first entry does NOT invalidate the idea. If the HTF narrative,
// the graded PD array, and the time window are still intact, a disciplined
// second-chance entry is allowed — never chasing the original price. A loss on
// the first transaction is only one transaction: the same idea is re-worked
// with adjusted risk and a pre-defined backup plan.
//
// Decision rule (from the lectures):
//   IF original_setup was valid
//   AND HTF_narrative + graded_array still intact
//   AND current_time is inside valid_window
//   AND a new_tethered_PD_array has formed (prefer Inversion FVG)
//   THEN allow_secondary_entry = true
//        - enter in the LOWER half (longs) / UPPER half (shorts) of the array
//        - stop beyond the defining array low/high; size cut to 0.5x
//        - require bodies to confirm in the favorable half (body discipline)
//        - tag the nearest unswept pool as the minor liquidity target
//        - pre-define a LARGER inversion FVG as backup if stopped out
//   ELSE stand_aside
//
// Usage (CLI):
//   node tools/missed_entry.cjs <PAIR>          → print + persist state
//   node tools/missed_entry.cjs <PAIR> --reset  → clear today's state
//
// Usage (import) — called by run_pair.cjs after a decision is built:
//   const { assessMissedEntry } = require("./missed_entry.cjs");
//   decision.missedEntry = assessMissedEntry(PAIR, decision);
//
// State persists per pair per day at shared/DATE/PAIR/missed_entry_state.json
// so a "missed" setup is recognized across pipeline re-runs.

const fs = require("fs");
const path = require("path");
const { atomicWrite } = require("./tv-mcp/atomic_write.cjs");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..");
const DATE = require("./ny_time.cjs").getNYDate();

function r5(v) { return Number(v).toFixed(5); }
function r2(v) { return Number(v).toFixed(2); }

function pairDir(pair) { return pair === "XAUUSD" ? "GOLD" : pair; }
function dataDirFor(pair) { return path.join(ROOT, "shared", DATE, pairDir(pair)); }

function loadCandles(pair, tf) {
  try { return JSON.parse(fs.readFileSync(path.join(dataDirFor(pair), `candles_${tf}.json`), "utf8")); }
  catch { return null; }
}

function loadEngine(pair, tf) {
  try { return JSON.parse(fs.readFileSync(path.join(dataDirFor(pair), `engine_${tf}.json`), "utf8")); }
  catch { return null; }
}

function stateFileFor(pair) {
  return path.join(dataDirFor(pair), "missed_entry_state.json");
}

function loadState(pair) {
  try { return JSON.parse(fs.readFileSync(stateFileFor(pair), "utf8")); } catch { return null; }
}

function saveState(pair, state) {
  try { atomicWrite(stateFileFor(pair), state); } catch (e) { /* best-effort persistence */ }
}

// ── Time filter — re-entry is only valid inside algorithmic windows ──
function inValidWindow() {
  try {
    const ny = require("./ny_time.cjs");
    if (ny.isInKillzoneNY()) return { ok: true, label: "killzone (" + ny.getNYSession().name + ")" };
    const sb = ny.isInSilverBulletNY();
    if (sb.active) return { ok: true, label: "silver bullet" };
    return { ok: false, label: ny.getNYSession().name || "unknown" };
  } catch {
    return { ok: true, label: "ny_time unavailable — window assumed open" };
  }
}

// ── Was the original entry MISSED? ──
// A setup is "missed" once price has travelled more than half the original risk
// (|entry - SL|) past the ideal entry — the optimal fill is gone and chasing it
// would turn a high-probability setup into a low-probability one.
function entryWasMissed(d, currentPrice) {
  if (!d?.entry || d.entry.type !== "LONG" && d.entry.type !== "SHORT") return false;
  if (!(d.entry.price > 0) || !(d.entry.sl > 0)) return false;

  const risk = Math.abs(d.entry.price - d.entry.sl);
  if (risk <= 0) return false;
  const missBuffer = risk * 0.5;

  if (d.entry.type === "LONG") return currentPrice > d.entry.price + missBuffer;
  return currentPrice < d.entry.price - missBuffer;
}

// ── Narrative continuity — is the original idea still intact? ──
function narrativeIntact(orig, current) {
  if (!orig || !current) return false;
  // Same direction (draw on liquidity unchanged)
  if (orig.entry?.type !== current.entry?.type) return false;
  // Original graded array / model still the reference
  if (orig.registry?.primary && current.registry?.primary &&
      orig.registry.primary !== current.registry.primary) return false;
  // Chain of custody not broken — narrative is intact unless the invalidation
  // status WORSENED (was valid, now invalidated). If both original and current
  // are INVALIDATED, nothing changed — the setup was always on watch.
  const origWasInvalidated = orig.invalidation?.status === "INVALIDATED";
  const currIsInvalidated = current.invalidation?.status === "INVALIDATED";
  if (!origWasInvalidated && currIsInvalidated) return false; // new breakage only
  // Registry still has a complete setup
  if (current.registry?.verdict !== "SETUP COMPLETE") return false;
  return true;
}

// ── Find a fresh tethered PD array for the second chance ──
// Scans 5m/1H engine reports for an Inversion FVG (preferred — the Market
// Alchemy entry vehicle), then FVG/OB, whose midpoint is tethered to the
// original graded entry level (within 0.2%) and pointed in the trade direction.
function findSecondaryArray(pair, orig) {
  const reports = { "5m": loadEngine(pair, "5m"), "1H": loadEngine(pair, "1h") };
  const anchor = orig.entry?.price || 0;
  if (!anchor) return null;

  const dir = orig.entry.type; // LONG → bullish array, SHORT → bearish array
  const wantType = dir === "LONG" ? "bullish" : "bearish";
  const tethered = [];
  const tol = 0.002;

  for (const tf of ["5m", "1H"]) {
    const r = reports[tf];
    if (!r) continue;

    // 1) Inversion FVG (preferred — grade-1 second-chance vehicle).
    //    For a LONG we want the inversion acting as SUPPORT (below price);
    //    for a SHORT as RESISTANCE (above price).
    for (const iv of (r.inversionFvgs || [])) {
      const mid = (iv.top + iv.bottom) / 2;
      const onSide = dir === "LONG" ? (r.price >= iv.top) : (r.price <= iv.bottom);
      if (Math.abs(mid - anchor) / anchor < tol && onSide) {
        tethered.push({ kind: "IFVG", tf, price: mid, top: iv.top, bottom: iv.bottom, inversion: true });
      }
    }

    // 2) Ordinary FVG
    for (const fvg of (r.fvgs || [])) {
      if ((fvg.type || "bullish") !== wantType) continue;
      const mid = (fvg.top + fvg.bottom) / 2;
      if (Math.abs(mid - anchor) / anchor < tol) {
        tethered.push({ kind: "FVG", tf, price: mid, top: fvg.top, bottom: fvg.bottom });
      }
    }

    // 3) Order block (proximal/distal map to top/bottom for half-entry math)
    for (const ob of (r.orderBlocks || [])) {
      const mid = (ob.proximal + ob.distal) / 2;
      if (Math.abs(mid - anchor) / anchor < tol) {
        tethered.push({
          kind: "OB", tf, price: mid,
          top: Math.max(ob.proximal, ob.distal),
          bottom: Math.min(ob.proximal, ob.distal),
        });
      }
    }
  }

  if (tethered.length === 0) return null;
  // Prefer the freshest (lowest TF) array closest to anchor, IFVG first
  tethered.sort((a, b) =>
    (b.inversion ? 1 : 0) - (a.inversion ? 1 : 0) ||
    (a.tf === "5m" ? 0 : 1) - (b.tf === "5m" ? 0 : 1) ||
    Math.abs(a.price - anchor) - Math.abs(b.price - anchor));
  return tethered[0];
}

// ── Risk adjustment for the second chance ──
// Entering later means a better-placed limit, a tighter stop and smaller size.
// Market Alchemy rule: enter in the LOWER half of the array for longs, the
// UPPER half for shorts — the optimal risk portion of the inversion zone.
function adjustedRisk(orig, arr) {
  const dir = orig.entry.type;
  const top = arr.top, bottom = arr.bottom;
  const zone = (top - bottom) || 0;
  // Lower-half entry (longs) = 25% up from the bottom of the zone.
  // Upper-half entry (shorts) = 25% down from the top of the zone.
  const entry = dir === "LONG"
    ? bottom + zone * 0.25
    : top - zone * 0.25;
  const origSL = orig.entry.sl;
  const origRisk = Math.abs(orig.entry.price - origSL);

  // Tightened SL: pull toward entry by 40% of original risk (still on correct side)
  let sl;
  if (dir === "LONG") sl = entry - origRisk * 0.6;
  else sl = entry + origRisk * 0.6;
  // Never beyond the original invalidation
  if (dir === "LONG") sl = Math.max(sl, origSL);
  else sl = Math.min(sl, origSL);

  const sizeMultiplier = 0.5; // half size — late entries carry more risk
  return {
    entry: Number(entry.toFixed(5)),
    sl: Number(sl.toFixed(5)),
    tp1: orig.entry.tp1 || null,
    sizeMultiplier,
    riskNote: "Late entry — " + (dir === "LONG" ? "lower" : "upper") + "-half entry on the array, stop tightened ~40% toward entry and size cut to 0.5x",
  };
}

// ── Minor liquidity target (Market Alchemy) ──
// The MAIN target (news high / session high) is the draw. A MINOR buy-side /
// sell-side is the nearest unswept pool on the path — relative equal highs
// below the main high (or lows above the main low). It gives a closer first
// objective to bank part of the trade before the main pool.
function findMinorTarget(pair, orig) {
  const dir = orig.entry.type;
  const anchor = orig.entry?.price || 0;
  if (!anchor) return null;

  const pools = [];
  for (const tf of ["5m", "1H"]) {
    const r = loadEngine(pair, tf === "1H" ? "1h" : "5m");
    if (!r) continue;
    for (const l of (r.liquidity || [])) {
      if (l.swept) continue; // only UNSWEPT pools are draw
      if (dir === "LONG" && l.type === "BSL" && l.price > anchor) {
        pools.push({ tf, type: "BSL", price: l.price, strength: l.strength || 0 });
      }
      if (dir === "SHORT" && l.type === "SSL" && l.price < anchor) {
        pools.push({ tf, type: "SSL", price: l.price, strength: l.strength || 0 });
      }
    }
  }
  if (pools.length === 0) return null;

  // Nearest pool in the trade direction = the MINOR target (closer objective).
  pools.sort((a, b) => dir === "LONG" ? a.price - b.price : b.price - a.price);
  return {
    type: pools[0].type,
    price: Number(pools[0].price.toFixed(5)),
    tf: pools[0].tf,
    detail: "Minor " + (pools[0].type === "BSL" ? "buy-side" : "sell-side") + " @ " + r5(pools[0].price) + " (" + pools[0].tf + ") — nearest unswept pool before the main draw",
  };
}

// ── Mohawk tolerance (Market Alchemy) ──
// A mohawk is a tiny variance OUTSIDE the array that is tolerated as long as
// candle BODIES do not close beyond it. It tells us price is testing the
// array boundary without accepting beyond it — manipulation, not delivery.
function checkMohawk(pair, arr) {
  const candles = loadCandles(pair, "1m");
  if (!candles || candles.length < 5 || !arr?.top || !arr?.bottom) {
    return { mohawk: false, detail: "mohawk check unavailable" };
  }
  const recent = candles.slice(-10);
  const top = arr.top, bottom = arr.bottom;
  // Tiny variance tolerance = 0.03% of the array height (or price-scaled)
  const height = top - bottom;
  const tol = height > 0 ? height * 0.15 : (top * 0.0003);

  let exceeded = 0;
  let bodyBeyond = 0;
  for (const c of recent) {
    const wickTop = Math.max(c.high, c.open, c.close);
    const wickBot = Math.min(c.low, c.open, c.close);
    const bodyTop = Math.max(c.open, c.close);
    const bodyBot = Math.min(c.open, c.close);
    // Exceed the array top by more than tolerance?
    if (wickTop > top + tol) {
      exceeded++;
      if (bodyTop > top + tol) bodyBeyond++;
    }
    // Exceed the array bottom by more than tolerance?
    if (wickBot < bottom - tol) {
      exceeded++;
      if (bodyBot < bottom - tol) bodyBeyond++;
    }
  }

  return {
    mohawk: exceeded > 0 && bodyBeyond === 0,
    detail: exceeded > 0
      ? (bodyBeyond === 0
        ? `mohawk tolerated — ${exceeded} wick(s) pierced ${r5(top + tol)}/${r5(bottom - tol)} but bodies held inside the array`
        : `NOT a mohawk — ${bodyBeyond} body(ies) closed beyond the array (acceptance = delivery)`)
      : "no variance beyond the array",
  };
}

// ── Backup plan (Market Alchemy) ──
// If the second chance gets stopped out, do NOT abandon the narrative — look
// for a LARGER inversion FVG (or next tethered array) on a higher TF and
// re-enter the SAME idea. Pre-defined so execution is mechanical, not emotional.
function findBackupInversion(pair, orig, currentArr) {
  const reports = { "5m": loadEngine(pair, "5m"), "1H": loadEngine(pair, "1h"), "4H": loadEngine(pair, "4h") };
  const anchor = orig.entry?.price || 0;
  if (!anchor) return null;

  const dir = orig.entry.type;
  const tol = 0.004; // backup can be tethered a bit wider (0.4%)
  const candidates = [];

  for (const tf of Object.keys(reports)) {
    const r = reports[tf];
    if (!r) continue;
    for (const iv of (r.inversionFvgs || [])) {
      const mid = (iv.top + iv.bottom) / 2;
      const onSide = dir === "LONG" ? (r.price >= iv.top) : (r.price <= iv.bottom);
      if (Math.abs(mid - anchor) / anchor < tol && onSide) {
        const width = iv.top - iv.bottom;
        // Prefer LARGER inversions than the current array (if we have one)
        const largerThanCurrent = !currentArr || width >= (currentArr.top - currentArr.bottom);
        if (largerThanCurrent) {
          candidates.push({ kind: "IFVG", tf, price: mid, top: iv.top, bottom: iv.bottom });
        }
      }
    }
  }
  if (candidates.length === 0) return null;

  // Largest inversion first (bigger zone = higher-probability re-entry point)
  candidates.sort((a, b) => (b.top - b.bottom) - (a.top - a.bottom));
  const b = candidates[0];
  const risk = adjustedRisk(orig, b);
  return {
    array: { kind: b.kind, tf: b.tf, price: b.price, top: b.top, bottom: b.bottom },
    entry: risk.entry,
    sl: risk.sl,
    tp1: risk.tp1,
    sizeMultiplier: risk.sizeMultiplier,
    detail: `Backup: ${b.kind} ${b.tf} @ ${r5(b.price)} — if the second chance stops out, re-enter the SAME narrative on this larger inversion`,
  };
}

// ── MAIN ASSESSMENT ──
function assessMissedEntry(pair, currentDecision) {
  const current = currentDecision || null;
  const state = loadState(pair);
  const price = current?.freshness?.source === "live"
    ? null
    : current?.entry?.price || null;

  // Current live price from the freshest engine we can load
  let currentPrice = price;
  if (!currentPrice) {
    const r1h = loadEngine(pair, "1h");
    currentPrice = r1h?.price || 0;
  }
  if (!currentPrice) currentPrice = current?.entry?.price || 0;

  const result = {
    pair,
    assessedAt: new Date().toISOString(),
    originalSetup: state?.originalSetup || null,
    status: "stand_aside",
    allowSecondaryEntry: false,
    reasons: [],
    secondaryEntry: null,
  };

  // If there's no current decision at all, we cannot assess — stand aside.
  if (!current || current.registry?.verdict !== "SETUP COMPLETE") {
    result.reasons.push("no current valid setup (registry not SETUP COMPLETE)");
    saveState(pair, result);
    return result;
  }

  // 1) Was there a valid original setup we may have missed?
  const orig = state?.originalSetup || null;

  if (orig && entryWasMissed(orig, currentPrice)) {
    result.originalSetup = orig;
    result.reasons.push("original entry price passed by market without execution (missed)");

    // 2) Narrative continuity
    if (!narrativeIntact(orig, current)) {
      result.reasons.push("narrative broken — direction/model/invalidation changed");
      result.status = "abandoned";
      saveState(pair, result);
      return result;
    }
    result.reasons.push("narrative intact (same direction + model + not invalidated)");

    // 3) Time window
    const win = inValidWindow();
    if (!win.ok) {
      result.reasons.push("outside valid algorithmic window (" + win.label + ")");
      result.status = "abandoned";
      saveState(pair, result);
      return result;
    }
    result.reasons.push("inside valid window (" + win.label + ")");

    // 4) Fresh tethered PD array
    const arr = findSecondaryArray(pair, orig);
    if (!arr) {
      result.reasons.push("no fresh tethered PD array at original graded level");
      result.status = "stand_aside";
      saveState(pair, result);
      return result;
    }
    result.reasons.push("secondary array found: " + arr.kind + " @" + r5(arr.price) + " (" + arr.tf + ")");

    // 5) Allow secondary entry with adjusted risk + Market Alchemy contingencies
    const risk = adjustedRisk(orig, arr);
    const minor = findMinorTarget(pair, orig);
    const mohawk = checkMohawk(pair, arr);
    const backup = findBackupInversion(pair, orig, arr);
    const halfTag = arr.kind === "IFVG" ? "Inversion FVG" : arr.kind + " (tethered)";

    result.allowSecondaryEntry = true;
    result.status = "secondary_entry_available";
    result.secondaryEntry = {
      array: { kind: arr.kind, tf: arr.tf, price: arr.price, top: arr.top, bottom: arr.bottom, inversion: !!arr.inversion },
      ...risk,
      half: arr.kind === "IFVG" ? (orig.entry.type === "LONG" ? "lower half" : "upper half") : null,
      minorTarget: minor,
      mohawk: mohawk,
      backupPlan: backup,
      originalIdea: {
        model: orig.registry?.primary || null,
        direction: orig.entry?.type || null,
        originalEntry: orig.entry?.price || null,
      },
      rules: [
        "Do NOT chase the original entry price",
        "Enter on the " + halfTag + " — " + (orig.entry.type === "LONG" ? "LOWER half (longs)" : "UPPER half (shorts)") + " for better risk",
        "Use tightened SL + 0.5x size",
        (minor ? "First objective = minor " + (minor.type === "BSL" ? "buy-side" : "sell-side") + " @" + r5(minor.price) : "Bank part at TP1"),
        (mohawk.mohawk ? "Mohawk tolerated — bodies must stay inside the array (acceptance = delivery)" : "No mohawk variance — bodies confirm"),
        (backup ? "If stopped out, re-enter on backup " + backup.array.kind + " " + backup.array.tf + " @" + r5(backup.array.price) + " (same narrative)" : "No larger backup inversion available"),
        "Abort if narrative breaks or window closes",
      ],
    };
    saveState(pair, result);
    return result;
  }

  // No original (or not yet missed): remember the current valid setup as the
  // potential "missed" candidate for next run.
  if (orig) {
    result.reasons.push("original setup still within entry tolerance — monitoring");
    result.status = "watching";
  } else {
    result.reasons.push("first valid setup recorded — monitoring for missed entry");
    result.status = "watching";
  }
  result.originalSetup = {
    registry: current.registry || null,
    entry: current.entry || null,
    rr: current.rr || null,
    coherence: current.coherence || null,
    invalidation: current.invalidation || null,
    emittedAt: current.emittedAt || new Date().toISOString(),
  };
  saveState(pair, result);
  return result;
}

// ── CLI ──
if (require.main === module) {
  const pair = process.argv[2];
  const reset = process.argv.includes("--reset");
  if (!pair) { console.error("Usage: node tools/missed_entry.cjs <PAIR> [--reset]"); process.exit(2); }

  if (reset) {
    try { fs.unlinkSync(stateFileFor(pair)); console.log("State reset for " + pair); }
    catch { console.log("No state to reset for " + pair); }
    process.exit(0);
  }

  const decisionFile = path.join(dataDirFor(pair), "decision.json");
  let decision = null;
  try {
    decision = JSON.parse(fs.readFileSync(decisionFile, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    console.error("No decision.json — run run_pair.cjs first");
    process.exit(1);
  }

  const out = assessMissedEntry(pair, decision);
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.allowSecondaryEntry ? 0 : 1);
}

module.exports = { assessMissedEntry, entryWasMissed, narrativeIntact, findSecondaryArray, inValidWindow, adjustedRisk, findMinorTarget, checkMohawk, findBackupInversion };
