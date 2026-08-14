// swing_target.cjs — "Multiple Setups in one Trading Session" (ICT Gems) map.
//
// Single source of truth for the brief's "SWING TARGET MAP" section AND the
// gate's "Swing Target (Multi-Setup)" qualification + cadence checks, so the
// LLM never invents levels and the deterministic gate never contradicts it.
//
// Timeframe ladder (from the lesson):
//   DAILY   = bias + draw ("the majority of your analysis should be framed on
//             your daily chart") — where expansion is likely to take price.
//   HOURLY  = where the daily OB level appears in time (reaction/timing).
//   15m     = the FRAMEWORK (the FVG/OB the whole session hangs on).
//   5m      = noisy execution view — never judge a setup cleanly on it.
//   1m      = PRECISION ENTRY (micro imbalance right after a short-term low is
//             broken with displacement).
//
// Qualification boxes (the "how many boxes did we just check off" checklist):
//   1. displacement   2. swing break (MSS/CHoCH)   3. FVG retest
//   4. opening-price side (bearish setup needs price ABOVE the midnight open,
//      bullish setup needs price BELOW it). Qualified = 3/4+ — "the precision
//      element is only beneficial if you have all the other narrative".
//
// Cadence: setups repeat like buses — at most 2 morning + 2 afternoon per pair.

const path = require("path");
const fs = require("fs");
const { getNYDate, getNYHourFor } = require("../ny_time.cjs");

const ROOT = process.env.WORKSPACE_ROOT || path.join(__dirname, "..", "..");
const SWING_TARGET_MODEL = "swing target (multi-setup)";

const readJson = (p) => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (_) {
    return null;
  }
};

const fmt = (v) => (v == null || !Number.isFinite(Number(v)) ? "—" : Number(v).toFixed(5));

// NY hour (DST-aware) from an ISO timestamp, for day-part bucketing.
function nyHourFrom(iso) {
  try {
    const h = new Date(iso).toLocaleTimeString("en-US", {
      timeZone: "America/New_York", hour12: false, hour: "2-digit",
    });
    return Number(h);
  } catch (_) {
    return null;
  }
}

const isShift = (ev) => /mss|choch|cisd/i.test(String(ev || ""));

function displacementStrong(eng) {
  const vd = eng && eng.volumeDisplacement;
  return !!vd && (Number(vd.atrRatio) >= 1 || /strong|extreme/i.test(String(vd.label || "")));
}

function insideOrNearFvg(eng, price, tight) {
  const fvgs = (eng && eng.fvgs) || [];
  for (const f of fvgs) {
    if (Number(f.fillFraction || 0) > 0) continue;
    const top = Number(f.top), bottom = Number(f.bottom);
    if (price >= bottom && price <= top) return true;
    if (!tight) {
      const tol = Math.max((top - bottom) * 2, price * 0.0015);
      if (Math.abs(price - (top + bottom) / 2) <= tol) return true;
    }
  }
  return false;
}

function nearestFvg(eng, price) {
  const fvgs = (eng && eng.fvgs) || [];
  let best = null, bd = Infinity;
  for (const f of fvgs) {
    if (Number(f.fillFraction || 0) > 0) continue;
    const top = Number(f.top), bottom = Number(f.bottom);
    const d = Math.abs(price - (top + bottom) / 2);
    if (d < bd) { bd = d; best = { top, bottom, mid: (top + bottom) / 2 }; }
  }
  return best;
}

function nearestOb(eng, price) {
  const obs = (eng && eng.orderBlocks) || [];
  let best = null, bd = Infinity;
  for (const o of obs) {
    const p = Number(o.proximal != null ? o.proximal : o.bottom);
    const d = Math.abs(price - p);
    if (d < bd) { bd = d; best = { top: Number(o.top), bottom: Number(o.bottom), proximal: p, kind: o.kind }; }
  }
  return best;
}

// PASSed evaluations for a model today, bucketed morning (<12:00 NY) / afternoon.
function countModelPasses(pair, model, date, root = ROOT) {
  const counts = { morning: 0, afternoon: 0, total: 0 };
  let entries = [];
  try {
    entries = require("./ledger.cjs").load(date || getNYDate(), root);
  } catch (_) {}
  for (const e of entries) {
    if (e.type !== "gate" && e.type !== "journal") continue;
    if (e.verdict !== "PASS") continue;
    if (String(e.pair || "").toUpperCase() !== String(pair || "").toUpperCase()) continue;
    if (String((e.proposal && e.proposal.model) || e.model || "").toLowerCase() !== model) continue;
    const h = nyHourFrom(e.ts);
    if (h == null) continue;
    if (h < 12) counts.morning++;
    else counts.afternoon++;
    counts.total++;
  }
  return counts;
}

function computeSwingTarget(pair, date, root = ROOT) {
  const P = String(pair || "").toUpperCase();
  const dir = path.join(root, "shared", date, P === "XAUUSD" ? "GOLD" : P === "USDOLLAR" ? "DXY" : P);
  const d1 = readJson(path.join(dir, "engine_1d.json"));
  const m15 = readJson(path.join(dir, "engine_15m.json"));
  const m1 = readJson(path.join(dir, "engine_1m.json"));
  const c1d = readJson(path.join(dir, "candles_1d.json"));
  const c1h = readJson(path.join(dir, "candles_1h.json"));
  const lm = readJson(path.join(dir, "liquidity_marker.json"));
  if (!d1 || !m15 || !c1d || !c1h) return null;

  const struct = d1.structure || {};
  const bias = String(struct.bias || "").toUpperCase();
  const draw = d1.draw || null;
  const price = Number(m1 && m1.price != null ? m1.price : struct.lastEventPrice);

  // Daily OB = opening price of the last down-close (bull OB) / up-close (bear OB) candle.
  let bullOB = null, bearOB = null;
  const days = Array.isArray(c1d) ? c1d : [];
  for (let i = days.length - 1; i >= 0; i--) {
    const c = days[i];
    if (!c) continue;
    if (bullOB === null && c.close < c.open) bullOB = Number(c.open);
    if (bearOB === null && c.close > c.open) bearOB = Number(c.open);
    if (bullOB !== null && bearOB !== null) break;
  }
  // A "down" draw (sell) targets the daily bullish OB below; "up" (buy) targets the bearish OB above.
  const drawOB = String(draw && draw.side || "").toLowerCase() === "down" ? bullOB : bearOB;

  // Midnight (NY) open = first 1h candle of the day.
  let dayOpen = null;
  if (Array.isArray(c1h)) {
    for (const c of c1h) {
      if (getNYDate(c.time) === date) { dayOpen = Number(c.open); break; }
    }
  }
  const openingSide = dayOpen != null && Number.isFinite(price)
    ? (price >= dayOpen ? "ABOVE" : "BELOW")
    : null;

  const m15s = m15.structure || {};
  const m1s = m1 && m1.structure ? m1.structure : {};

  const boxDisplacement = displacementStrong(m15) || displacementStrong(m1);
  const boxSwingBreak = isShift(m15s.lastEvent) || isShift(m1s.lastEvent);
  const boxFvgRetest = insideOrNearFvg(m15, price) || insideOrNearFvg(m1, price);
  const boxOpening =
    (bias === "BEARISH" && openingSide === "ABOVE") ||
    (bias === "BULLISH" && openingSide === "BELOW");
  const boxes = [boxDisplacement, boxSwingBreak, boxFvgRetest, boxOpening].filter(Boolean).length;

  const rel = (lm && lm.relEquals) || {};

  const setups = countModelPasses(P, SWING_TARGET_MODEL, date, root);

  return {
    pair: P,
    date,
    price,
    bias,
    draw: draw ? { side: draw.side, level: Number(draw.price), reason: draw.reason } : null,
    dailyOB: drawOB,
    bullOB,
    bearOB,
    dayOpen,
    openingSide,
    rel: { highs: rel.highs || [], lows: rel.lows || [], magnets: rel.magnets || [] },
    fifteen: { bias: String(m15s.bias || "").toUpperCase(), fvg: nearestFvg(m15, price), ob: nearestOb(m15, price) },
    oneMin: { fvg: nearestFvg(m1, price), ob: nearestOb(m1, price), inversionFvgs: (m1 && m1.inversionFvgs || []).slice(0, 2) },
    qualification: {
      displacement: boxDisplacement,
      swingBreak: boxSwingBreak,
      fvgRetest: boxFvgRetest,
      openingSide: boxOpening,
      boxes,
      total: 4,
      qualified: boxes >= 3,
    },
    setups,
  };
}

module.exports = { computeSwingTarget, countModelPasses, SWING_TARGET_MODEL, fmt, nyHourFrom };