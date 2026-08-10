// tools/models/steps.cjs
// WP-8 sequence-step vocabulary (audit Section 7 / Gap 3.4).
//
// Each step is a boolean GATE over a context object — no partial credit, no
// multipliers, no numeric rank. A model's sequence is complete only when EVERY
// step passes (Principle 3: gates over multipliers).
//
// The context object is assembled by the caller (run_pair.cjs shadow wiring or
// the test suite) and must expose objective facts:
//   hour (NY hour int), bias, hasSweep, lastSweepType, hasReversal, mss,
//   hasOB, uniqueOBs (unmitigated only), mitigatedOBs, consumedOBs,
//   consumedAtPrice, hasFVG, fvgs, arrayInPlay, oteZone, cisd, smt,
//   htfRanging, displacement, lecture1/2/4 subsets.

const pass = detail => ({ pass: true, detail });
const fail = detail => ({ pass: false, detail });

const p5 = n => (Number.isFinite(n) ? Number(n).toFixed(5) : "n/a");

const steps = {
  // ── Core sequence (structure-timeframe facts) ──────────────────────
  sweep(ctx) {
    if (!ctx.hasSweep) return fail("no external liquidity sweep detected");
    return pass(`liquidity swept (${ctx.lastSweepType || "pool"} raided) — inducement collected`);
  },
  reversal(ctx) {
    if (ctx.hasReversal) return pass("post-sweep reversal — price closed back inside the raid");
    return fail("no post-sweep reversal — price has not closed back inside");
  },
  mss(ctx) {
    if (ctx.mss) return pass("MSS/CHoCH confirmed on the structure timeframe");
    return fail("no confirmed MSS on the structure timeframe");
  },
  fvg(ctx) {
    if (ctx.hasFVG) return pass(`${ctx.fvgs.length} unmitigated displacement FVG(s)`);
    return fail("no unmitigated displacement FVG");
  },
  ob(ctx) {
    if (ctx.hasOB) return pass(`${ctx.uniqueOBs.length} unmitigated order block(s) present`);
    return fail("no unmitigated order block present — consumed/mitigated blocks don't count (WP-11)");
  },
  array_mitigated(ctx) {
    if (ctx.consumedAtPrice) return fail("the only array at price is CONSUMED — a broken block can't be re-entered (WP-11)");
    if (ctx.arrayInPlay) return pass("price re-entered an unmitigated PD array (fresh array, not consumed)");
    return fail("no fresh-array mitigation — price has not returned to an unmitigated displacement origin");
  },
  ote(ctx) {
    if (ctx.oteZone) return pass("price in OTE zone (62-79% retracement)");
    return fail(`price outside OTE zone (retrace ${p5(ctx.oteRetrace)} )`);
  },
  cisd(ctx) {
    if (ctx.cisd) return pass("CISD engulfing candle detected");
    return fail("no CISD");
  },
  smt(ctx) {
    if (ctx.smt) return pass("SMT divergence detected (correlated pair)");
    return fail("no SMT divergence");
  },
  htf_ranging(ctx) {
    if (ctx.htfRanging) return pass("HTF ranging/consolidating — failed-breakout context");
    return fail("HTF trending — not a ranging context");
  },
  displacement(ctx) {
    if (ctx.displacement) return pass("displacement FVG/OB present for the entry leg");
    return fail("no displacement zone");
  },
  purge(ctx) {
    if (ctx.hasSweep) return pass("liquidity purge present — fuel collected before the break");
    return fail("no liquidity purge (BOS without collected fuel)");
  },

  // ── High Precision Secrets — 7-9AM tethering gate (post-9:01) ────────
  // ICT Gems 9:30AM Liquidity Target / High Precision Secrets: after the 7-9AM
  // range locks at ~9:01, a PD array is only high-probability when tethered to
  // a projected level (high, low, CE, quadrant, octant, -0.5). The gate is
  // NOT applicable before the lock — the framework only governs post-9:01.
  tethered_array(ctx) {
    const p = ctx.precision;
    if (!p?.active) return pass("7-9AM precision framework inactive — tethering not applicable");
    if ((p.tetheredCount || 0) > 0) return pass(`${p.tetheredCount} PD array(s) tethered to 7-9AM levels`);
    return fail("no PD array tethered to a 7-9AM level — untethered arrays are low quality (High Precision Secrets)");
  },

  // ── Lecture 2 — London Hunt + IFVG (07:00-07:40 NY) ────────────────
  lecture2_hunt_swept(ctx) {
    const h = ctx.lecture2?.hunt;
    if (h?.swept) return pass(`hunt swept @ ${p5(h.sweepPrice)}`);
    return fail(h?.active ? "hunt active but not yet swept" : "no hunt detected");
  },
  lecture2_mss(ctx) {
    if (ctx.lecture2?.mss?.confirmed) return pass(`MSS confirmed (${ctx.lecture2.mss.direction || "direction"})`);
    return fail(ctx.lecture2?.mss ? "MSS not confirmed" : "no lecture-2 MSS data");
  },
  lecture2_ready(ctx) {
    if (ctx.lecture2?.setupReady) return pass("Lecture 2 setup READY");
    return fail("Lecture 2 setup not ready");
  },

  // ── Lecture 1 — 08:30 Liquidity Raid (08:00-10:00 NY) ──────────────
  lecture1_formation(ctx) {
    if (ctx.lecture1?.formation?.formed) return pass("pre-08:30 formation window formed");
    return fail(ctx.lecture1?.formation ? "formation not formed" : "no formation data");
  },
  lecture1_raid(ctx) {
    if (ctx.lecture1?.raid?.active) return pass("post-08:30 liquidity raid active");
    return fail("raid not active");
  },
  lecture1_mss(ctx) {
    if (ctx.lecture1?.mss?.confirmed) return pass("MSS confirmed on 1m");
    return fail("lecture-1 MSS not confirmed");
  },
  lecture1_ready(ctx) {
    if (ctx.lecture1?.setupReady) return pass("Lecture 1 setup READY");
    return fail("Lecture 1 setup not ready");
  },

  // ── IFVG Scale-In ───────────────────────────────────────────────────
  // ICT "Navigating High Resistance Liquidity Run Conditions" (2026):
  // Inversion FVG acting as dynamic support/resistance after a sweep+reversal.
  // Price must be inside a bias-aligned IFVG for the step to pass.
  ifvg_present(ctx) {
    const ivs = ctx.inversionFvgs;
    if (!ivs || ivs.length === 0) return fail("no bias-aligned inversion FVGs detected");
    if (ctx.ifvgInPlay) {
      const iv = ivs.find(i => ctx.price >= i.bottom && ctx.price <= i.top) || ivs[0];
      return pass(`price ${p5(ctx.price)} inside IFVG ${p5(iv.bottom)}–${p5(iv.top)} (CE ${p5((iv.top + iv.bottom) / 2)})`);
    }
    const nearest = ivs[0];
    const mid = (nearest.top + nearest.bottom) / 2;
    const dist = ctx.price > nearest.top
      ? `${p5(ctx.price - nearest.top)} above nearest IFVG (${p5(nearest.bottom)}–${p5(nearest.top)})`
      : `${p5(nearest.bottom - ctx.price)} below nearest IFVG (${p5(nearest.bottom)}–${p5(nearest.top)})`;
    return fail(`${ivs.length} IFVG(s) detected but price not inside — ${dist}`);
  },

  // ── Body Defense (Wick CE) ──────────────────────────────────────────
  // ICT: "I don't want to see any bodies buried south of its consequent
  // encroachment level." Candle bodies (open-to-close range) must not
  // close past the defensive wick's CE in the direction of the original
  // body. Violation → deeper retracement expected.
  body_defense(ctx) {
    const dw = ctx.defensiveWickCE;
    if (!dw) return pass("no defensive wick CE to check — step not applicable (no qualifying wick found)");
    if (dw.bodyViolated) {
      const v = dw.violationDetail || "candle body closed past defensive CE";
      return fail(`body defense VIOLATED — ${v}`);
    }
    return pass(`defensive wick CE @ ${p5(dw.ce)} holding — bodies respecting the level`);
  },

  // ── NY Lunch Reversal (Prev-Day Carry-Forward) ──────────────────────
  // ICT CPI Day Video (2026): "You take that inefficiency right before it
  // takes the liquidity, carry that forward into the next day. If it trades
  // up into it, it can set the tone for a shorting opportunity."
  prev_day_lunch_sweep(ctx) {
    if (ctx.prevLunch?.sweepType) return pass(`prior day NY lunch ${ctx.prevLunch.sweepType} sweep @ ${p5(ctx.prevLunch.sweepPrice)} — carry-forward active`);
    return fail("no liquidity sweep during prior day NY lunch (10:00-13:30 ET) — carry-forward not available");
  },
  prev_day_bisi(ctx) {
    if (ctx.prevLunch?.inefficiencyKind === "BISI") {
      const z = ctx.prevLunch;
      return pass(`BISI zone ${p5(z.bottom)}–${p5(z.top)} (mid ${p5(z.midpoint)}) carried from ${z.sourceDate} lunch → expect bearish reversal`);
    }
    return fail("no BISI inefficiency before prior day lunch sweep");
  },
  prev_day_sibi(ctx) {
    if (ctx.prevLunch?.inefficiencyKind === "SIBI") {
      const z = ctx.prevLunch;
      return pass(`SIBI zone ${p5(z.bottom)}–${p5(z.top)} (mid ${p5(z.midpoint)}) carried from ${z.sourceDate} lunch → expect bullish reversal`);
    }
    return fail("no SIBI inefficiency before prior day lunch sweep");
  },
  price_enters_lunch_inefficiency(ctx) {
    if (!ctx.prevLunch?.inefficiencyKind) return fail("no carried lunch inefficiency to check");
    const z = ctx.prevLunch;
    const inside = ctx.price >= z.bottom && ctx.price <= z.top;
    if (inside) return pass(`price ${p5(ctx.price)} is inside carried ${z.inefficiencyKind} zone ${p5(z.bottom)}–${p5(z.top)}`);
    const dist = ctx.price > z.top
      ? `${p5(ctx.price - z.top)} above zone`
      : `${p5(z.bottom - ctx.price)} below zone`;
    return fail(`price ${p5(ctx.price)} has not entered the carried lunch inefficiency (${dist})`);
  },

  // ── Lecture 4 — NDOG/NWOG News Model (08:30-10:00 NY) ──────────────
  lecture4_gap_draw(ctx) {
    const g = ctx.lecture4?.gapClusters?.hasGaps || ctx.lecture4?.substituteGap || ctx.lecture4?.gapDraw?.drawing;
    if (g) return pass(ctx.lecture4?.gapClusters?.detail || "gap/substitute gap present — drawing");
    return fail("no gap draw cluster");
  },
  lecture4_mss(ctx) {
    if (ctx.lecture4?.mss?.confirmed) return pass("MSS confirmed at the gap cluster");
    return fail("lecture-4 MSS not confirmed");
  },
  lecture4_ready(ctx) {
    if (ctx.lecture4?.setupReady) return pass("Lecture 4 setup READY");
    return fail("Lecture 4 setup not ready");
  },
};

module.exports = { steps };
