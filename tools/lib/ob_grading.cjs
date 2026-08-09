// tools/lib/ob_grading.cjs
// WP-11 (audit Gap 4.3): Order-block grading — the "fresh vs used" fact.
//
// An order block is like a spring that's been stepped on. Once price has
// pushed back into it, the spring has delivered its energy — it's a used
// spring. Trading a used spring as if it were fresh is why entries fail.
// "Fresh vs used" (unmitigated vs mitigated) is a fact about the block and is
// computed HERE, once, in the fact layer (Principle 2) — never re-derived in
// the decision layer.
//
// Flags on every graded OB:
//   mitigated       — price has returned INTO the block (tagged, not broken)
//   consumed        — price closed THROUGH the entire block (broken / breaker)
//   unmitigated     — still fresh AND displacement-backed  ← the only tradeable
//   displacementOk  — the originating leg was a real displacement (ATR-based)
//
// The grade is recomputed from the candles that follow the OB candle whenever
// they are available; it falls back to the SMC engine's `kind` classification
// (OB = fresh, Mitigation = tagged, Breaker = broken) otherwise.

const MIN_IMPULSE_ATR = 1.0; // matches SMC engine `obImpulseMinAtr`

function zoneOf(ob) {
  return {
    top: ob.top != null ? ob.top : ob.distal,
    bottom: ob.bottom != null ? ob.bottom : ob.proximal,
  };
}

// Locate the OB candle index within a candle array (time first, then index).
function locateIndex(ob, candles) {
  if (!ob || !candles || candles.length === 0) return -1;
  if (ob.time != null) {
    const byTime = candles.findIndex(c => String(c.time) === String(ob.time));
    if (byTime >= 0) return byTime;
  }
  if (Number.isInteger(ob.index) && ob.index >= 0 && ob.index < candles.length) return ob.index;
  return -1;
}

function gradeOrderBlock(ob, candles, opts = {}) {
  if (!ob) return null;
  const minImpulse = opts.minImpulseAtr ?? MIN_IMPULSE_ATR;
  const { top, bottom } = zoneOf(ob);

  let mitigated = false;
  let consumed = false;
  let gradeSource = "kind"; // fallback when no usable candle data

  if (candles && candles.length > 0) {
    const idx = locateIndex(ob, candles);
    if (idx >= 0) {
      gradeSource = "candles";
      const after = candles.slice(idx + 3); // impulse occupies the next two candles
      const bullish = ob.type === "bullish";
      for (const c of after) {
        if (bullish) {
          if (c.low <= top) mitigated = true; // price dipped into the block
          if (c.close < bottom) { consumed = true; break; } // closed through it
        } else {
          if (c.high >= bottom) mitigated = true; // price rose into the block
          if (c.close > top) { consumed = true; break; }
        }
      }
      if (consumed) mitigated = true; // a broken block was certainly re-entered
    }
  }

  if (gradeSource === "kind") {
    if (ob.kind === "Breaker") { consumed = true; mitigated = true; }
    else if (ob.kind === "Mitigation") { mitigated = true; }
  }

  const displacementOk = ob.hasFvg === true || (ob.impulseAtr ?? 0) >= minImpulse;
  const fresh = !mitigated && !consumed;

  return {
    ...ob,
    mitigated,
    consumed,
    displacementOk,
    unmitigated: fresh && displacementOk,
    grade: consumed ? "consumed" : mitigated ? "mitigated" : "unmitigated",
    gradeSource,
  };
}

function gradeOrderBlocks(list, candles, opts = {}) {
  return (list || []).map(ob => gradeOrderBlock(ob, candles, opts)).filter(Boolean);
}

// The "unmitigated set" — fresh AND displacement-backed. Consumed blocks are
// never included here (WP-11 DoD).
function unmitigatedOf(list) {
  return (list || []).filter(o => o.unmitigated);
}

// Mitigated but NOT broken — the "used spring" set (Mitigation Block model).
function mitigatedOf(list) {
  return (list || []).filter(o => o.mitigated && !o.consumed);
}

function consumedOf(list) {
  return (list || []).filter(o => o.consumed);
}

// Price is "at" an unmitigated array when it is inside the zone or within one
// zone-height of its edges. Consumed blocks can never make this true — a
// broken block is not a fresh array to re-enter.
function arrayInPlayFor(price, gradedObs, opts = {}) {
  const buffer = opts.nearBuffer ?? 1.0;
  return (gradedObs || []).some(ob => {
    if (!ob.unmitigated) return false;
    const { top, bottom } = zoneOf(ob);
    const h = Math.max(top - bottom, 0) || 0;
    const near = h * buffer;
    return price >= bottom - near && price <= top + near;
  });
}

function countByGrade(list) {
  const counts = { unmitigated: 0, mitigated: 0, consumed: 0 };
  for (const o of list || []) {
    if (o.grade && Object.prototype.hasOwnProperty.call(counts, o.grade)) counts[o.grade]++;
  }
  return counts;
}

module.exports = {
  gradeOrderBlock,
  gradeOrderBlocks,
  unmitigatedOf,
  mitigatedOf,
  consumedOf,
  arrayInPlayFor,
  countByGrade,
  zoneOf,
  MIN_IMPULSE_ATR,
};
