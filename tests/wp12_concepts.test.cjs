// tests/wp12_concepts.test.cjs
// WP-12 (audit Section 5.1-5.8 + Gap 4.2/4.4/4.6): the missing concepts.
// DoD: each missing concept has a module or registry field and a unit test, and
// no weekday confidence multiplier exists anywhere.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const { killzoneFor, KILLZONES } = require("../tools/lib/killzone.cjs");
const { detectRejection } = require("../tools/lib/rejection.cjs");
const { previousSessionHL } = require("../tools/lib/session_levels.cjs");
const { LIQUIDITY_RAID_CONFIRMATION, loadRaidConfirmation } = require("../tools/lib/raid_config.cjs");
const { nextDraw } = require("../tools/lib/draw.cjs");
const { findRelativeEqualLevels } = require("../tools/lib/liquidity.cjs");
const { MODELS } = require("../tools/models/registry.cjs");

const ROOT = path.resolve(__dirname, "..");

// ── 5.3 BOS quality by purge ──────────────────────────────────────────────
// purgeRequired models must check the sweep step — the purge (fuel collection)
// is what makes a BOS quality. Lecture models carry the sweep inside their
// hunt/raid steps, which is still a sweep gate.
const SWEEP_BEARING_STEPS = new Set(["sweep", "purge", "lecture2_hunt_swept", "lecture1_raid"]);

test("5.3: every purgeRequired model checks a sweep-bearing step", () => {
  const purgeModels = MODELS.filter(m => m.purgeRequired);
  assert.ok(purgeModels.length >= 3, "expected at least 3 purgeRequired models");
  for (const m of purgeModels) {
    assert.ok(
      m.sequence.some(s => SWEEP_BEARING_STEPS.has(s)),
      `${m.id} has purgeRequired:true but its sequence never checks the sweep step (${m.sequence.join(",")})`
    );
  }
});

// ── 5.4 Event-time quality ────────────────────────────────────────────────
test("5.4: killzoneFor grades NY hours against London / NY AM / NY PM", () => {
  assert.strictEqual(killzoneFor(3).name, "London");
  assert.strictEqual(killzoneFor(2).name, "London");
  assert.strictEqual(killzoneFor(8).name, "NY AM");
  assert.strictEqual(killzoneFor(9).name, "NY AM");
  assert.strictEqual(killzoneFor(13).name, "NY PM");
  assert.strictEqual(killzoneFor(14).name, "NY PM");
  assert.strictEqual(killzoneFor(1).inKillzone, false);
  assert.strictEqual(killzoneFor(6).inKillzone, false);
  assert.strictEqual(killzoneFor(11).inKillzone, false);
  assert.strictEqual(killzoneFor(16).inKillzone, false);
  assert.strictEqual(killzoneFor(NaN).inKillzone, false);
  assert.ok(Array.isArray(KILLZONES) && KILLZONES.length >= 3);
});

// ── 5.5 Previous-session H/L draws ────────────────────────────────────────
test("5.5: previousSessionHL returns the most recent COMPLETED day", () => {
  const days = [
    { time: "2026-08-06", high: 1.100, low: 1.090 },
    { time: "2026-08-07", high: 1.110, low: 1.095 },
    { time: "2026-08-08", high: 1.120, low: 1.101 }, // today, still forming
  ];
  const prev = previousSessionHL(days);
  assert.strictEqual(prev.high, 1.110);
  assert.strictEqual(prev.low, 1.095);
  assert.strictEqual(prev.date, "2026-08-07");
});

test("5.5: previousSessionHL returns null with fewer than 2 daily candles", () => {
  assert.strictEqual(previousSessionHL([{ high: 1, low: 0 }]), null);
  assert.strictEqual(previousSessionHL(null), null);
});

// ── 5.7 Consistent wick vs close rule ─────────────────────────────────────
test("5.7: LIQUIDITY_RAID_CONFIRMATION is a single valid decision constant", () => {
  assert.ok(["wick", "close"].includes(LIQUIDITY_RAID_CONFIRMATION), "constant must be wick or close");
  assert.strictEqual(LIQUIDITY_RAID_CONFIRMATION, "wick", "default must be wick (configurable to close)");
  assert.strictEqual(loadRaidConfirmation(), "wick");
});

test("5.7: the raid constant is configurable to close without code edits", () => {
  const out = execFileSync(process.execPath, ["-e", "console.log(require('./tools/lib/raid_config.cjs').LIQUIDITY_RAID_CONFIRMATION)"], {
    cwd: ROOT,
    env: { ...process.env, LIQUIDITY_RAID_CONFIRMATION: "close" },
    encoding: "utf8",
  }).trim();
  assert.strictEqual(out, "close");
});

test("5.7: the raid constant is actually consumed by the L2 sweep detection", () => {
  const src = fs.readFileSync(path.join(ROOT, "tools", "inducement_engine.cjs"), "utf8");
  assert.ok(src.includes("LIQUIDITY_RAID_CONFIRMATION"), "inducement_engine must consume the constant");
});

// ── 5.8 + Gap 4.2 Rejection as a leading signal ───────────────────────────
test("5.8/Gap 4.2: detectRejection fires on an opposite-color candle at the extreme", () => {
  // Bullish rejection at demand: bearish body, long lower wick at the lows.
  const bull = [
    { open: 1.1980, high: 1.2000, low: 1.1940, close: 1.1990 },
    { open: 1.2000, high: 1.2050, low: 1.1900, close: 1.1980 },
    { open: 1.1980, high: 1.2020, low: 1.1940, close: 1.1990 },
  ];
  const rb = detectRejection(bull, { direction: "bullish" });
  assert.ok(rb.detected, `expected bullish rejection: ${rb.detail}`);
  assert.strictEqual(rb.direction, "bullish");

  // Bearish rejection at supply: bullish body, long upper wick at the highs.
  const bear = [
    { open: 1.1980, high: 1.2000, low: 1.1940, close: 1.1990 },
    { open: 1.2000, high: 1.2100, low: 1.2040, close: 1.2060 },
    { open: 1.2060, high: 1.2090, low: 1.2020, close: 1.2050 },
  ];
  const rs = detectRejection(bear, { direction: "bearish" });
  assert.ok(rs.detected, `expected bearish rejection: ${rs.detail}`);
  assert.strictEqual(rs.direction, "bearish");
});

test("5.8: detectRejection does NOT fire on a non-extreme wick (Gap 4.2: not a mirror of the prior candle)", () => {
  // Strong body, no long wick against the move — no rejection.
  const strong = [
    { open: 1.1980, high: 1.2000, low: 1.1940, close: 1.1990 },
    { open: 1.2000, high: 1.2050, low: 1.1970, close: 1.2020 },
    { open: 1.2020, high: 1.2040, low: 1.1990, close: 1.2000 },
  ];
  assert.strictEqual(detectRejection(strong, { direction: "bullish" }).detected, false);
  // Same-color body at the extreme is not a rejection block.
  const sameColor = [
    { open: 1.1980, high: 1.2000, low: 1.1940, close: 1.1990 },
    { open: 1.1990, high: 1.2050, low: 1.1900, close: 1.1920 },
    { open: 1.1920, high: 1.1980, low: 1.1890, close: 1.1960 },
  ];
  assert.strictEqual(detectRejection(sameColor, { direction: "bullish" }).detected, false);
  // Fewer than 3 candles is not enough structure to read a rejection.
  const two = [
    { open: 1.2000, high: 1.2050, low: 1.1900, close: 1.1980 },
    { open: 1.1980, high: 1.2020, low: 1.1940, close: 1.1990 },
  ];
  assert.strictEqual(detectRejection(two, { direction: "bullish" }).detected, false);
});

// ── 5.1 Draw-on-liquidity (nearest first, never skip) ─────────────────────
test("5.1: nextDraw honors the exact draw-map order — nearest first, never skip", () => {
  const pools = [
    { type: "SSL", price: 1.10, swept: true },  // nearer but already mitigated
    { type: "SSL", price: 1.08, swept: false },
    { type: "SSL", price: 1.06, swept: false },
    { type: "BSL", price: 1.14, swept: false },
  ];
  // Short draw: nearest unmitigated SSL below (1.08), skipping the swept 1.10.
  const sell = nextDraw({ direction: "bearish", liquidityMap: pools, price: 1.12 });
  assert.ok(sell, "expected a sell-side draw");
  assert.strictEqual(sell.price, 1.08);
  // Long draw: nearest BSL above.
  const buy = nextDraw({ direction: "bullish", liquidityMap: pools, price: 1.12 });
  assert.ok(buy, "expected a buy-side draw");
  assert.strictEqual(buy.price, 1.14);
});

// ── Gap 4.4 Equal-level detection (structure/facts layer) ──────────────────
const mk = (open, high, low, close, time) => ({ open, high, low, close, time });

// Two isolated swing highs; the RIGHT shoulder is HIGHER — the old one-sided
// "right-shoulder-lower" constraint dropped exactly this cluster. Gap 4.4 says
// equal means equal, in both directions.
const EQ_CANDLES = [
  mk(1.1000, 1.1010, 1.0990, 1.1000, 0),
  mk(1.1000, 1.1010, 1.0990, 1.1000, 1),
  mk(1.1000, 1.1010, 1.0990, 1.1000, 2),
  mk(1.1000, 1.1200, 1.0995, 1.1190, 3), // swing high 1.1200
  mk(1.1190, 1.1195, 1.1150, 1.1160, 4),
  mk(1.1160, 1.1165, 1.1120, 1.1130, 5),
  mk(1.1130, 1.1135, 1.1090, 1.1100, 6),
  mk(1.1100, 1.1202, 1.1095, 1.1190, 7), // swing high 1.1202 (right shoulder HIGHER)
  mk(1.1190, 1.1195, 1.1150, 1.1160, 8),
  mk(1.1160, 1.1165, 1.1120, 1.1130, 9),
];

test("Gap 4.4: a higher right shoulder still forms an equal-high cluster (symmetric)", () => {
  const r = findRelativeEqualLevels(EQ_CANDLES, 0.002);
  assert.ok(r.highs.length >= 1, "expected an equal-high cluster");
  const cluster = r.highs[0];
  assert.strictEqual(cluster.type, "equalHighs");
  assert.strictEqual(cluster.top, 1.1202, "cluster top = higher shoulder");
  assert.strictEqual(cluster.bottom, 1.1200, "cluster bottom = lower shoulder");
  assert.strictEqual(cluster.swept, false, "unswept while price has not traded above the top");
});

test("Gap 4.4: equal-high cluster flips to swept once price trades above the top", () => {
  const withRaid = [...EQ_CANDLES, mk(1.1200, 1.1230, 1.1190, 1.1210, 10)];
  const r = findRelativeEqualLevels(withRaid, 0.002);
  assert.ok(r.highs.length >= 1, "expected an equal-high cluster");
  assert.strictEqual(r.highs[0].swept, true, "a close above the cluster top is a raid");
});

test("Gap 4.4: equal lows detected symmetrically with the cluster zone marked", () => {
  const lows = [
    mk(1.1000, 1.1010, 1.0990, 1.1000, 0),
    mk(1.1000, 1.1010, 1.0990, 1.1000, 1),
    mk(1.1000, 1.1010, 1.0990, 1.1000, 2),
    mk(1.1000, 1.0990, 1.0800, 1.0810, 3), // swing low 1.0800
    mk(1.0810, 1.0850, 1.0805, 1.0840, 4),
    mk(1.0840, 1.0880, 1.0835, 1.0870, 5),
    mk(1.0870, 1.0910, 1.0865, 1.0900, 6),
    mk(1.0900, 1.0940, 1.0798, 1.0810, 7), // swing low 1.0798 (lower shoulder)
    mk(1.0810, 1.0850, 1.0805, 1.0840, 8),
    mk(1.0840, 1.0880, 1.0835, 1.0870, 9),
  ];
  const r = findRelativeEqualLevels(lows, 0.002);
  assert.ok(r.lows.length >= 1, "expected an equal-low cluster");
  const cluster = r.lows[0];
  assert.strictEqual(cluster.type, "equalLows");
  assert.strictEqual(cluster.bottom, 1.0798, "cluster bottom = lower of the two shoulders");
  assert.strictEqual(cluster.top, 1.0800, "cluster top = the resting-stops zone ceiling");
  assert.strictEqual(cluster.swept, false, "unswept until price trades below the bottom");
});

// ── Gap 4.6 No weekday confidence multiplier ──────────────────────────────
test("4.6: ny_time.cjs contains zero fixed weekday multipliers (mon0.8/thu1.3/fri0.6)", () => {
  const src = fs.readFileSync(path.join(ROOT, "tools", "ny_time.cjs"), "utf8");
  const forbidden = ["multiplier: 0.0", "multiplier: 0.8", "multiplier: 1.0", "multiplier: 1.2", "multiplier: 1.3", "multiplier: 0.6"];
  for (const token of forbidden) {
    assert.ok(!src.includes(token), `ny_time.cjs still hardcodes ${token} — Gap 4.6 requires no weekday confidence multiplier`);
  }
  assert.ok(src.includes("open: false"), "weekend days must be flagged open:false");
});

test("4.6: live ny_time --full output carries no day multiplier", () => {
  const out = JSON.parse(execFileSync(process.execPath, [path.join(ROOT, "tools", "ny_time.cjs"), "--full"], { encoding: "utf8" }));
  assert.strictEqual(typeof out.dayProfile.open, "boolean", "dayProfile.open must be a boolean");
  assert.strictEqual(out.dayProfile.multiplier, undefined, "dayProfile must no longer carry a multiplier");
  assert.strictEqual(out.multipliers.day, 1, "multipliers.day must be a neutral 1 (weekday boost removed)");
  assert.strictEqual(typeof out.tradeable, "boolean", "tradeable must remain a boolean");
});
