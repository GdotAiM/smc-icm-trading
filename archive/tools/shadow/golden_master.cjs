// tools/shadow/golden_master.cjs
// SAFETY NET — golden-master snapshots for deterministic primitives.
//
// Snapshot the behavior of the fixed primitives (session time, ATR, config),
// then diff later. Any unintended behavior change is caught immediately.
//
// Usage:
//   node tools/shadow/golden_master.cjs capture   → writes tests/golden/primitives.json
//   node tools/shadow/golden_master.cjs check     → recomputes and diffs (exit 1 on mismatch)
const fs = require("fs");
const path = require("path");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..", "..");
const GOLDEN_PATH = path.join(ROOT, "tests", "golden", "primitives.json");

function captureState() {
  const time = require("../lib/time.cjs");
  const metrics = require("../lib/metrics.cjs");
  const { CONFIG } = require("../lib/engine_config.cjs");
  const cycle = require("../lib/cycle_phase.cjs");
  const narrative = require("../lib/narrative.cjs");
  const dealing = require("../lib/dealing_range.cjs");
  const liquidity = require("../lib/liquidity.cjs");

  // Fixed timestamps spanning DST: Jan (EST, -5) and Jul (EDT, -4).
  // 2026-01-15 12:30 UTC → 07:30 EST (londonPM dead zone)
  // 2026-07-15 15:30 UTC → 11:30 EDT (nyLunch)
  const tsJan = Date.UTC(2026, 0, 15, 12, 30, 0);
  const tsJul = Date.UTC(2026, 6, 15, 15, 30, 0);
  // 2026-07-15 10:30 UTC → 06:30 EDT (londonPM dead zone, should NOT be killzone)
  const tsJul_0630 = Date.UTC(2026, 6, 15, 10, 30, 0);
  // 2026-07-15 11:00 UTC → 07:00 EDT (still dead zone)
  const tsJul_0700 = Date.UTC(2026, 6, 15, 11, 0, 0);
  // 2026-07-15 13:00 UTC → 09:00 EDT (nyAM killzone)
  const tsJul_0900 = Date.UTC(2026, 6, 15, 13, 0, 0);
  // 2026-07-15 18:00 UTC → 14:00 EDT (nyPM killzone)
  const tsJul_1400 = Date.UTC(2026, 6, 15, 18, 0, 0);

  // Constant-range candles: TR = 6 every bar → ATR-14 (Wilder) = 6.000
  const candles = [];
  for (let i = 0; i < 30; i++) {
    candles.push({ open: 100, high: 105, low: 99, close: 101 });
  }

  // Synthetic engine reports for cycle primitives (WP-3).
  const mkReport = (over = {}) => ({
    structure: { bias: "bearish", lastEvent: "none" },
    liquidity: [],
    volumeDisplacement: { label: "weak", atrRatio: 0.4 },
    fvgs: [],
    ...over,
  });

  // Synthetic sweep series for dealing-range primitives (WP-5).
  const sweepCandles = [];
  for (let i = 0; i < 10; i++) sweepCandles.push({ time: i, high: 105, low: 99, close: 101 });
  sweepCandles.push({ time: 10, high: 108, low: 100, close: 102 }); // external sweep above
  for (let i = 11; i < 20; i++) sweepCandles.push({ time: i, high: 106, low: 98, close: 101 });
  sweepCandles.push({ time: 20, high: 104, low: 94, close: 100 }); // external sweep below
  const sweepRange = dealing.computeDealingRange(sweepCandles);
  const belowOnly = [];
  for (let i = 0; i < 15; i++) belowOnly.push({ time: i, high: 105, low: 99, close: 101 });
  belowOnly.push({ time: 15, high: 103, low: 90, close: 99 }); // external sweep below only

  // Synthetic equal-high/low series for liquidity primitives (WP-6).
  const liqCandles = [
    ...Array.from({ length: 4 }, (_, i) => ({ time: i, high: 99.5 + i, low: 99, close: 99.2 + i })),
    { time: 4, high: 102, low: 100, close: 101.5 }, // swing high 1 = 102
    { time: 5, high: 101.2, low: 100.2, close: 100.6 },
    { time: 6, high: 100.6, low: 99.8, close: 100.2 },
    { time: 7, high: 100, low: 99.4, close: 99.8 },
    { time: 8, high: 99.8, low: 99.2, close: 99.5 },
    { time: 9, high: 99.6, low: 99, close: 99.3 },
    { time: 10, high: 102.1, low: 99.4, close: 100.5 }, // swing high 2 = 102.1
    { time: 11, high: 101.2, low: 99.8, close: 100.2 },
    { time: 12, high: 100.8, low: 99.6, close: 100 },
  ];
  const liqLevels = liquidity.findRelativeEqualLevels(liqCandles, 1);

  return {
    _meta: { generatedBy: "golden_master.cjs", generatedAt: new Date().toISOString() },
    time: {
      janOffset: time.getNYOffset(tsJan),
      julOffset: time.getNYOffset(tsJul),
      jan0730: time.resolveSessionFor(tsJan),
      jul0630: time.resolveSessionFor(tsJul_0630),
      jul0700: time.resolveSessionFor(tsJul_0700),
      jul0900: time.resolveSessionFor(tsJul_0900),
      jul1400: time.resolveSessionFor(tsJul_1400),
      killzoneChecks: {
        jan0730: time.isKillzoneFor(tsJan),
        jul0630: time.isKillzoneFor(tsJul_0630),
        jul0900: time.isKillzoneFor(tsJul_0900),
        jul1400: time.isKillzoneFor(tsJul_1400),
      },
      sbActive: time.isInSilverBulletFor(Date.UTC(2026, 6, 15, 14, 30, 0)).active,
      judasActive: time.isInJudasSwingFor(Date.UTC(2026, 6, 15, 13, 30, 0)).active,
    },
    metrics: {
      atr14: metrics.calcATR(candles, 14),
      atrShortSeriesNull: metrics.calcATR([{ high: 1, low: 0.5, close: 0.8 }], 14),
      structuralSLShort: metrics.structuralSL({ direction: "bearish", swingLevel: 100, atr: 6, bufferMultiple: 0.5 }),
      structuralSLNull: metrics.structuralSL({ direction: "bearish", swingLevel: 100, atr: null }),
    },
    cycle: {
      // Canonical transition outcomes (WP-3 structure-only semantics).
      nullState: cycle.determineState(null).state,
      ambiguousState: cycle.determineState(mkReport({ structure: { bias: "bearish", lastEvent: "none" } })).state,
      manipulationState: cycle.determineState(mkReport({ structure: { bias: "bullish", lastEvent: "CHoCH" }, liquidity: [{ swept: true }] })).state,
      distributionState: cycle.determineState(mkReport({ structure: { bias: "bearish", lastEvent: "BOS" }, volumeDisplacement: { label: "strong", atrRatio: 1.2 } })).state,
      expansionState: cycle.determineState(mkReport({ structure: { bias: "bullish", lastEvent: "BOS" }, volumeDisplacement: { label: "strong", atrRatio: 2.6 }, fvgs: [{}, {}, {}] })).state,
      accumulationState: cycle.determineState(mkReport({ structure: { bias: "neutral", lastEvent: "none" } })).state,
      resolveEmpty: cycle.resolveCyclePhase({ "4H": null, "1H": null, "1D": null }).phase,
      resolvePrioritySource: cycle.resolveCyclePhase({ "4H": mkReport({ structure: { bias: "bullish", lastEvent: "CHoCH" }, liquidity: [{ swept: true }] }) }).source,
      resolveFallbackSource: cycle.resolveCyclePhase({ "4H": mkReport({ structure: { bias: "bearish", lastEvent: "none" }, volumeDisplacement: { label: "moderate", atrRatio: 0.9 } }), "1H": null, "1D": mkReport({ structure: { bias: "bullish", lastEvent: "BOS" }, volumeDisplacement: { label: "strong", atrRatio: 1.3 } }) }).source,
    },
    config: {
      atrPeriod: CONFIG.atr.period,
      inversionMinScore: CONFIG.inversion.minScore,
      londonPMIsKillzone: CONFIG.killzones.londonPMIsKillzone,
    },
    narrative: {
      // Dominance-chain bias (WP-4): 1W governs -> 1D -> 4H; 1H opposes = pullback.
      wGoverns: narrative.resolveBias({ bias1W: "bullish", bias1D: "bearish", bias4H: "bearish" }).direction,
      dGoverns: narrative.resolveBias({ bias1W: "neutral", bias1D: "bearish", bias4H: "bullish" }).direction,
      hGoverns: narrative.resolveBias({ bias1W: null, bias1D: "neutral", bias4H: "bullish" }).direction,
      allNeutral: narrative.resolveBias({ bias1W: "neutral", bias1D: "neutral", bias4H: "neutral" }).direction,
      pullback1H: narrative.resolveBias({ bias1W: "bullish", bias1D: "bullish", bias4H: "bullish", bias1H: "bearish" }).pullback,
      aligned1H: narrative.resolveBias({ bias1W: "bearish", bias1D: "bearish", bias4H: "bearish", bias1H: "bearish" }).pullback,
      govTF: narrative.resolveBias({ bias1W: "neutral", bias1D: "neutral", bias4H: "bearish" }).governingTF,
      confNone: narrative.confidenceFromConfluence().confidence,
      confWindow: narrative.confidenceFromConfluence({ inKillzone: true }).confidence,
      confWindowArray: narrative.confidenceFromConfluence({ inKillzone: true, nearPdArray: true }).confidence,
      confAllCapped: narrative.confidenceFromConfluence({ inKillzone: true, nearPdArray: true, hasDraw: true }).confidence,
      pdInside: narrative.nearUnmitigatedPdArray(1.15, { orderBlocks: [{ top: 1.16, bottom: 1.14 }], fvgs: [] }),
      pdFar: narrative.nearUnmitigatedPdArray(1.10, { orderBlocks: [{ top: 1.16, bottom: 1.14 }], fvgs: [] }),
      pdMitigated: narrative.nearUnmitigatedPdArray(1.15, { orderBlocks: [{ top: 1.16, bottom: 1.14, mitigated: true }], fvgs: [] }),
      pdFilledFvg: narrative.nearUnmitigatedPdArray(1.15, { orderBlocks: [], fvgs: [{ top: 1.16, bottom: 1.14, fillFraction: 0.9 }] }),
    },
    dealingRange: {
      // Sweep-defined range (WP-5): anchored to external sweeps, null when a
      // side is missing. Constant candles / below-only never produce a range.
      nullWhenFlat: dealing.computeDealingRange(candles),
      nullWhenBelowOnly: dealing.computeDealingRange(belowOnly),
      sweepHigh: sweepRange.high,
      sweepLow: sweepRange.low,
      equilibrium: sweepRange.equilibrium,
      zone: sweepRange.zone,
      positionPct: sweepRange.positionPct,
      pdAbove: dealing.getPremiumDiscount(sweepRange, 106),
      pdBelow: dealing.getPremiumDiscount(sweepRange, 97),
      pdAtEq: dealing.getPremiumDiscount(sweepRange, sweepRange.equilibrium),
      pdNoRange: dealing.getPremiumDiscount(null, 100),
    },
    liquidity: {
      // ATR-relative equal highs/lows (WP-6): symmetric, ATR tolerance, swept state.
      eqHighCount: liqLevels.highs.length,
      eqHighTop: liqLevels.highs[0]?.top ?? null,
      eqHighBottom: liqLevels.highs[0]?.bottom ?? null,
      eqHighSwept: liqLevels.highs[0]?.swept ?? null,
      eqLowCount: liqLevels.lows.length,
      tolRefused: liquidity.findRelativeEqualLevels(liqCandles, 0.5).highs.length, // 0.1/0.5 = 20% >= 15% -> 0
      tolAtWideATR: liquidity.findRelativeEqualLevels(liqCandles, 1).highs.length, // 0.1/1 = 10% < 15% -> 1
      toleranceConst: liquidity.RELATIVE_EQ_TOLERANCE,
    },
  };
}

function main() {
  const mode = process.argv[2] || "check";
  const state = captureState();

  if (mode === "capture") {
    fs.mkdirSync(path.dirname(GOLDEN_PATH), { recursive: true });
    fs.writeFileSync(GOLDEN_PATH, JSON.stringify(state, null, 2), "utf8");
    console.log("Golden-master captured →", GOLDEN_PATH);
    return;
  }

  if (!fs.existsSync(GOLDEN_PATH)) {
    console.error("No golden-master file found. Run: node tools/shadow/golden_master.cjs capture");
    process.exit(1);
  }

  const golden = JSON.parse(fs.readFileSync(GOLDEN_PATH, "utf8"));
  // _meta carries a generatedAt timestamp — strip it so the diff compares
  // behavior, not wall-clock time.
  delete golden._meta;
  delete state._meta;
  const a = JSON.stringify(golden, null, 2);
  const b = JSON.stringify(state, null, 2);

  if (a === b) {
    console.log("✅ Golden-master CHECK PASSED — primitives unchanged.");
    return;
  }
  console.error("❌ Golden-master CHECK FAILED — primitives changed!\n");
  const g = JSON.parse(a), n = JSON.parse(b);
  for (const k of Object.keys(g)) {
    if (JSON.stringify(g[k]) !== JSON.stringify(n[k])) {
      console.error(`  Diff in "${k}":`);
      console.error("    golden:", JSON.stringify(g[k]));
      console.error("    now   :", JSON.stringify(n[k]));
    }
  }
  process.exit(1);
}

main();
