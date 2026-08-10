// tools/models/registry.cjs
// WP-8 model registry + per-model confirmation matrices (audit Section 0,
// Gap 3.2, Gap 3.4, Gap 1.4, Gap 4.5).
//
// A model is a RECIPE, not a dish with a rank. Each entry carries:
//   timeWindows         — when this recipe may be cooked (NY hours, end-exclusive)
//   intrinsicDirection  — what the model MEANS by its mechanics
//   sequence            — the confirmation matrix; EVERY step must pass
//   purgeRequired       — eligibility demands a liquidity purge (fuel collected)
//
// The decision path is eligibility + sequence only. No numeric rank exists —
// a model is either COMPLETE or it is nothing. If exactly one model is complete
// → SETUP COMPLETE. If zero or several → NO TRADE (ties resolve by tier, then
// by proximity to a draw, never by multiplying confidences).

const { steps } = require("./steps.cjs");

const MODELS = [
  // ── Tier 1 ────────────────────────────────────────────────────────────
  { id: "mmxm_sell", name: "MMXM Sell Model", tier: 1, timeWindows: null,
    intrinsicDirection: "SELL", purgeRequired: true,
    sequence: ["sweep", "ob", "mss", "smt"],
    description: "Market Maker Expansion — distribution: sell the rally after a purge." },
  { id: "mmxm_buy", name: "MMXM Buy Model", tier: 1, timeWindows: null,
    intrinsicDirection: "BUY", purgeRequired: true,
    sequence: ["sweep", "ob", "mss", "smt"],
    description: "Market Maker Expansion — accumulation: buy the dip after a purge." },
  { id: "silver_bullet", name: "Silver Bullet", tier: 1,
    timeWindows: [{ label: "London SB", start: 3, end: 4 }, { label: "NY AM SB", start: 10, end: 11 }, { label: "NY PM SB", start: 14, end: 15 }],
    intrinsicDirection: "narrative", purgeRequired: true,
    sequence: ["sweep", "reversal", "mss", "fvg", "tethered_array"],
    description: "One candle, one displacement, one window — the scalp in the SB window. NY-AM/PM deliveries must tether to the 7-9AM canvas." },
  { id: "ote_institutional_ob", name: "OTE + Institutional OB", tier: 1, timeWindows: null,
    intrinsicDirection: "narrative", purgeRequired: false,
    sequence: ["ob", "ote", "array_mitigated"],
    description: "Entry at OTE of the displacement leg, back at the institutional OB." },
  { id: "turtle_soup", name: "Turtle Soup", tier: 1, timeWindows: null,
    intrinsicDirection: "counter-sweep", purgeRequired: true,
    sequence: ["htf_ranging", "sweep", "reversal", "mss", "displacement"],
    description: "Failed breakout — fade the sweep once price closes back inside." },
  { id: "unicorn_ote_fvg", name: "Unicorn (OTE+FVG)", tier: 1, timeWindows: null,
    intrinsicDirection: "narrative", purgeRequired: false,
    sequence: ["ob", "fvg", "ote"],
    description: "FVG at OTE — confluence of imbalance and the ideal retracement." },
  { id: "breaker_block", name: "Breaker Block", tier: 1, timeWindows: null,
    intrinsicDirection: "narrative", purgeRequired: false,
    sequence: ["ob", "reversal", "mss"],
    description: "The OB that broke and flipped — trade the flip after the reversal holds." },

  // ── Tier 2 ────────────────────────────────────────────────────────────
  { id: "ifvg_scale_in", name: "IFVG Scale-In", tier: 2, timeWindows: null,
    intrinsicDirection: "narrative", purgeRequired: true,
    sequence: ["sweep", "reversal", "mss", "ifvg_present"],
    description: "Inversion FVG as dynamic support/resistance after sweep+reversal. Initial entry inside bias-aligned IFVG; scale in at deep/CE levels on retest. ICT: High-Resistance Liquidity Run Conditions." },
  { id: "scob", name: "SCOB", tier: 2, timeWindows: null,
    intrinsicDirection: "narrative", purgeRequired: false,
    sequence: ["ob", "fvg", "displacement"],
    description: "Single Candle Order Block — OB + FVG + displacement on the same leg." },
  { id: "two_fvg", name: "2FVG Entry", tier: 2, timeWindows: null,
    intrinsicDirection: "narrative", purgeRequired: false,
    sequence: ["fvg", "sweep"],
    description: "Two consecutive unmitigated FVGs — expansion fuel stacked." },
  { id: "judas_swing", name: "Judas Swing", tier: 2,
    timeWindows: [{ label: "London open", start: 2, end: 3 }, { label: "NY open", start: 8, end: 9 }],
    intrinsicDirection: "fade-first-move", purgeRequired: true,
    sequence: ["sweep", "mss"],
    description: "The fake session-open swing — fade the first move after the sweep." },
  { id: "asian_range_breakout", name: "Asian Range Breakout", tier: 2,
    timeWindows: [{ label: "Asia", start: 20, end: 2 }],
    intrinsicDirection: "breakout", purgeRequired: true,
    sequence: ["sweep", "ob"],
    description: "Break of the Asian range in the direction of the narrative." },
  { id: "nwog_ndog", name: "NWOG/NDOG", tier: 2, timeWindows: null,
    intrinsicDirection: "narrative", purgeRequired: false,
    sequence: ["ob"],
    description: "Weekly/daily opening gap plays — draw on the gap fill." },

  // ── Tier 3 — Situational / time-based ────────────────────────────────
  { id: "mitigation_block", name: "Mitigation Block", tier: 3, timeWindows: null,
    intrinsicDirection: "narrative", purgeRequired: false,
    sequence: ["ob", "array_mitigated"],
    description: "The OB that was tagged but not broken — entry on the mitigation." },
  { id: "rejection_block", name: "Rejection Block", tier: 3, timeWindows: null,
    intrinsicDirection: "counter-sweep", purgeRequired: false,
    sequence: ["ob", "reversal"],
    description: "The OB that HELD — a rejection wick at the array, then reversal." },
  { id: "london_hunt_ifvg", name: "London Hunt + IFVG", tier: 3,
    timeWindows: [{ label: "London Hunt", start: 7, end: 8 }],
    intrinsicDirection: "narrative", purgeRequired: true,
    sequence: ["lecture2_hunt_swept", "lecture2_mss", "lecture2_ready"],
    description: "07:00 NY hunt of relative equal levels → IFVG CE entry." },
  { id: "ndog_nwog_news", name: "NDOG/NWOG News Model", tier: 3,
    timeWindows: [{ label: "News", start: 8, end: 10 }],
    intrinsicDirection: "narrative", purgeRequired: true,
    sequence: ["lecture4_gap_draw", "sweep", "lecture4_mss", "lecture4_ready", "tethered_array"],
    description: "News gap draw — MSS at the gap cluster, entry at the breaker/CE. Purge gate: the gap must be swept before it is a draw (WP-12 5.3). Post-9:01 entries tether to the 7-9AM canvas." },
  { id: "raid_0830", name: "08:30 Liquidity Raid Model", tier: 3,
    timeWindows: [{ label: "Raid", start: 8, end: 10 }],
    intrinsicDirection: "narrative", purgeRequired: true,
    sequence: ["lecture1_formation", "lecture1_raid", "lecture1_mss", "lecture1_ready", "tethered_array"],
    description: "Post-08:30 raid of the pre-open equal levels → PD array entry. Post-9:01 entries tether to the 7-9AM canvas." },

  // ── Tier 3 — NY Lunch Reversal (Prev-Day Carry-Forward) ──────────────
  // ICT CPI Day Video (2026): New PDA — prior-day lunch inefficiency before
  // the liquidity sweep carried forward. BISI → bearish reversal (short),
  // SIBI → bullish reversal (long). Valid all NY sessions — the entry
  // happens NEXT day when price returns to the carried level.
  { id: "ny_lunch_reversal_short", name: "NY Lunch Reversal (Short)", tier: 3,
    timeWindows: [{ label: "NY AM", start: 8, end: 11 }, { label: "NY PM", start: 13, end: 16 }],
    intrinsicDirection: "SELL", purgeRequired: false,
    sequence: ["prev_day_lunch_sweep", "prev_day_bisi", "price_enters_lunch_inefficiency", "mss"],
    description: "Prior day NY lunch BISI carried forward → price enters zone → complex reversal SHORT. ICT: 'If it trades up into it, it can set the tone for a shorting opportunity.'" },
  { id: "ny_lunch_reversal_long", name: "NY Lunch Reversal (Long)", tier: 3,
    timeWindows: [{ label: "NY AM", start: 8, end: 11 }, { label: "NY PM", start: 13, end: 16 }],
    intrinsicDirection: "BUY", purgeRequired: false,
    sequence: ["prev_day_lunch_sweep", "prev_day_sibi", "price_enters_lunch_inefficiency", "mss"],
    description: "Prior day NY lunch SIBI carried forward → price enters zone → complex reversal LONG. ICT: 'Reverse it for going long.'" },
];

const ALL_STEP_NAMES = new Set(Object.keys(steps));

function inModelWindow(model, hour) {
  if (!model.timeWindows || model.timeWindows.length === 0) return { pass: true, detail: "any window" };
  const h = Number.isFinite(hour) ? ((hour % 24) + 24) % 24 : -1;
  for (const w of model.timeWindows) {
    const open = (w.start <= w.end) ? (h >= w.start && h < w.end) : (h >= w.start || h < w.end);
    if (open) return { pass: true, detail: `${w.label} (${w.start}:00-${w.end}:00 NY)` };
  }
  return { pass: false, detail: `outside ${model.timeWindows.map(w => w.label).join(" / ")}` };
}

function fadeDirection(ctx) {
  if (ctx.lastSweepType === "BSL") return "SELL"; // highs raided → fade down
  if (ctx.lastSweepType === "SSL") return "BUY";  // lows raided → fade up
  return null;
}

function directionAligned(model, ctx) {
  const d = model.intrinsicDirection;
  if (d === "narrative") return ctx.bias && ctx.bias !== "neutral";
  if (d === "SELL") return ctx.bias === "bearish";
  if (d === "BUY") return ctx.bias === "bullish";
  if (d === "counter-sweep" || d === "fade-first-move") {
    const fade = fadeDirection(ctx);
    return fade === "SELL" ? ctx.bias === "bearish" : fade === "BUY" ? ctx.bias === "bullish" : false;
  }
  return true;
}

function directionDetail(model, ctx) {
  const d = model.intrinsicDirection;
  if (d === "narrative") return ctx.bias && ctx.bias !== "neutral" ? `narrative ${ctx.bias.toUpperCase()}` : "narrative neutral — no direction";
  if (d === "SELL" || d === "BUY") return `intrinsic ${d} vs bias ${(ctx.bias || "neutral").toUpperCase()}`;
  const fade = fadeDirection(ctx);
  return `fade ${fade || "unknown-sweep"} vs bias ${(ctx.bias || "neutral").toUpperCase()}`;
}

// Eligibility: window + intrinsic direction + purge. All three are booleans.
function eligibilityOf(model, ctx) {
  const win = inModelWindow(model, ctx.hour);
  const dir = { pass: directionAligned(model, ctx), detail: directionDetail(model, ctx) };
  const purge = { pass: !model.purgeRequired || !!ctx.hasSweep, detail: model.purgeRequired ? (ctx.hasSweep ? "purge present" : "purge required but absent") : "no purge prerequisite" };
  const eligible = win.pass && dir.pass && purge.pass;
  return { win, dir, purge, eligible };
}

// Run every step in the model's confirmation matrix. Each step is a boolean gate.
function sequenceOf(model, ctx) {
  return model.sequence.map(name => {
    const fn = steps[name];
    if (!fn) return { name, pass: false, detail: `unknown sequence step "${name}" (not in vocabulary)` };
    const r = fn(ctx) || { pass: false, detail: "step returned no verdict" };
    return { name, pass: !!r.pass, detail: r.detail };
  });
}

function evaluateModel(model, ctx) {
  const elig = eligibilityOf(model, ctx);
  const sequence = sequenceOf(model, ctx);
  const complete = elig.eligible && sequence.every(s => s.pass);
  return {
    id: model.id,
    name: model.name,
    tier: model.tier,
    timeWindows: model.timeWindows,
    intrinsicDirection: model.intrinsicDirection,
    purgeRequired: model.purgeRequired,
    sequence,
    complete,
    gateTrace: {
      window: elig.win,
      direction: elig.dir,
      purge: elig.purge,
      sequence,
    },
  };
}

function tieBreak(a, b, ctx) {
  if (a.tier !== b.tier) return a.tier - b.tier; // higher tier first
  const aDraw = ctx.hasDraw, bDraw = ctx.hasDraw;
  if (aDraw !== bDraw) return aDraw ? -1 : 1;    // nearer a draw wins
  return 0;
}

// Full registry evaluation. Verdict is a boolean: exactly one complete model.
function runRegistry(ctx) {
  const results = MODELS.map(m => evaluateModel(m, ctx));
  const complete = results.filter(r => r.complete);
  let primary = null;
  if (complete.length === 1) {
    primary = complete[0];
  } else if (complete.length > 1) {
    complete.sort((a, b) => tieBreak(a, b, ctx));
    primary = complete[0];
  }
  return {
    verdict: complete.length === 1 ? "SETUP COMPLETE" : "NO TRADE",
    primary,
    complete,
    count: complete.length,
    results,
    resolved: {
      tie: complete.length > 1,
      rule: "single complete setup, else no trade; ties by tier then draw proximity",
    },
  };
}

module.exports = {
  MODELS,
  inModelWindow,
  directionAligned,
  eligibilityOf,
  sequenceOf,
  evaluateModel,
  runRegistry,
  ALL_STEP_NAMES,
};
