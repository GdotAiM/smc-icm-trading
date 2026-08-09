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
