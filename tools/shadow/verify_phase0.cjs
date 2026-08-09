// tools/shadow/verify_phase0.cjs — Phase-0 remediation verification.
// Exits 0 on success (all checks pass), 1 with a list of failures otherwise.
const fs = require("fs");
const path = require("path");
const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..", "..");
const failures = [];
const check = (name, ok, detail) => { if (!ok) failures.push(name + (detail ? " :: " + detail : "")); };
const readTool = (f) => { try { return fs.readFileSync(path.join(ROOT, "tools", f), "utf8"); } catch { return null; } };

const metrics = require("../lib/metrics.cjs");
const time = require("../lib/time.cjs");
const { CONFIG } = require("../lib/engine_config.cjs");

check("lib modules load", !!metrics.calcATR && !!time.resolveSessionFor && CONFIG.atr.period === 14);

const candles = [];
for (let i = 0; i < 30; i++) candles.push({ open: 100, high: 105, low: 99, close: 101 });
const atr = metrics.calcATR(candles, 14);
check("WP-1 ATR=6", atr != null && Math.abs(atr - 6) < 1e-9, "atr=" + atr);
check("WP-1 structuralSL=103", metrics.structuralSL({ direction: "bearish", swingLevel: 100, atr: 6 }) === 103);

check("WP-2 londonPM not killzone", time.isKillzoneFor(Date.UTC(2026, 0, 15, 12, 30)) === false);
check("WP-2 nyAM killzone", time.isKillzoneFor(Date.UTC(2026, 6, 15, 13, 0)) === true);
check("WP-2 nyPM killzone", time.isKillzoneFor(Date.UTC(2026, 6, 15, 18, 0)) === true);

const runPair = readTool("run_pair.cjs");
const nyTime = readTool("ny_time.cjs");
const invalidation = readTool("invalidation.cjs");
const tier1 = readTool("tier1.cjs");
const rsa = readTool("run_all_stages.cjs");
const ipda = readTool("ipda.cjs");
const guard = readTool("cross_system_guard.cjs");
const fractal = readTool("fractal_mmxm.cjs");

check("run_pair no cycle fallback", runPair ? runPair.includes("no calendar fallback") : false);
check("run_pair uses resolveCyclePhase", runPair ? runPair.includes("resolveCyclePhase(") : false);
check("run_pair no markdown phase regex", runPair ? !runPair.includes("cycleMd.match(/\\*\\*([A-Z]+)/)") && !runPair.includes("phaseMatch ? phaseMatch[1]") : false);
check("run_pair londonPM kz:false", runPair ? !/londonPM[^,}]*kz: true/.test(runPair) : false);
check("run_pair real ATR", runPair ? runPair.includes("calcATR(_c4hCandles, 14)") : false);
check("run_pair SB scalp real ATR", runPair ? runPair.includes("calcATR(loadCandles(sharedDir, \"15m\")") : false);
check("run_pair shadow log", runPair ? runPair.includes("logDisagreement") : false);
check("ny_time excludes londonPM", nyTime ? /\[\"london\", \"nyAM\", \"nyPM\"\]/.test(nyTime) : false);
check("invalidation isKillzoneHour", invalidation ? invalidation.includes("time.isKillzoneHour(NY_HOUR)") : false);
check("invalidation real ATR", invalidation ? invalidation.includes("calcATR(c4h, 14)") : false);
check("tier1 real ATR", tier1 ? tier1.includes("calcATR(c4h, 14)") : false);
check("run_all_stages excludes londonPM", rsa ? !/\[\"london\", \"londonPM\", \"nyAM\", \"nyPM\"\]/.test(rsa) : false);
check("ipda weight 0.4", ipda ? ipda.includes("weight: 0.4") : false);
check("guard CONFIG.inversion", guard ? guard.includes("CONFIG.inversion.minScore") : false);
check("fractal CONFIG.inversion", fractal ? fractal.includes("CONFIG.inversion.minScore") : false);

const nyTimeWp3 = readTool("ny_time.cjs");
const po3sm = readTool("po3_state_machine.cjs");
const macroCtx = readTool("macro_context.cjs");
const cycleLib = readTool("lib/cycle_phase.cjs");
check("ny_time getCycleEstimate removed", nyTimeWp3 ? !nyTimeWp3.includes("function getCycleEstimate") : false);
check("po3_state_machine imports lib", po3sm ? po3sm.includes('require("./lib/cycle_phase.cjs")') : false);
check("po3_state_machine writes cycle_phase.json", po3sm ? po3sm.includes("cycle_phase.json") : false);
check("macro_context imports lib", macroCtx ? macroCtx.includes('require("./lib/cycle_phase.cjs")') : false);
check("cycle lib exists with resolveCyclePhase", cycleLib ? cycleLib.includes("function resolveCyclePhase") : false);
check("cycle lib UNKNOWN on null", cycleLib ? cycleLib.includes('state: "UNKNOWN"') : false);

const narrativeLib = readTool("lib/narrative.cjs");
check("narrative lib exists with resolveBias", narrativeLib ? narrativeLib.includes("function resolveBias") : false);
check("narrative lib confidence not from vote margin", narrativeLib ? narrativeLib.includes("confidenceFromConfluence") && !narrativeLib.includes("totalWeight") : false);
check("run_pair votes array deleted", runPair ? !runPair.includes("const votes = [") : false);
check("run_pair uses resolveBias", runPair ? runPair.includes("resolveBias({") : false);
check("run_pair governingBias not weightedBias", runPair ? !runPair.includes("weightedBias") : false);
check("run_pair no vote weights", runPair ? !runPair.includes("weight: 3") && !runPair.includes("weight: 0.5") : false);
const brief = readTool("morning_briefing.cjs");
check("morning_briefing parses Dominance Bias", brief ? brief.includes("Dominance Bias:") : false);

const dealingLib = readTool("lib/dealing_range.cjs");
const irlErl = readTool("irl_erl_engine.cjs");
const oneTrade = readTool("one_trade_setup.cjs");
const tpg = readTool("time_price_grid.cjs");
const ipdaWp5 = readTool("ipda.cjs");
check("dealing range lib exists", dealingLib ? dealingLib.includes("function computeDealingRange") && dealingLib.includes("function getPremiumDiscount") : false);
check("dealing lib returns null when no sweep", dealingLib ? dealingLib.includes("if (!lastAbove || !lastBelow) return null;") : false);
check("irl_erl uses sweep-based range", irlErl ? irlErl.includes('require("./lib/dealing_range.cjs")') && irlErl.includes("computeDealingRange(candles)") : false);
check("one_trade no pdArray.midpoint", oneTrade ? !oneTrade.includes("pdArray.midpoint") : false);
check("one_trade uses getPremiumDiscount", oneTrade ? oneTrade.includes("getPremiumDiscount(dealingRange") : false);
check("time_price_grid no 20-bar mean", tpg ? !tpg.includes("w.map(c => c.high)") && !tpg.includes("range20 = dailyCandles") : false);
check("time_price_grid uses sweep range", tpg ? tpg.includes("computeDealingRange(dailyCandles)") : false);
check("ipda IPDA20 sweep-anchored", ipdaWp5 ? ipdaWp5.includes("computeDealingRange(candles, { lookback: 20 })") : false);

const liqLib = readTool("lib/liquidity.cjs");
const liqMarker = readTool("liquidity_marker.cjs");
const lect2 = readTool("tv-mcp/lecture2_setup.cjs");
check("liquidity lib exists", liqLib ? liqLib.includes("function findRelativeEqualLevels") && liqLib.includes("RELATIVE_EQ_TOLERANCE") : false);
check("liquidity lib symmetric (no right-shoulder)", liqLib ? !liqLib.includes("* 1.001") && !liqLib.includes("* 0.999") : false);
check("liquidity lib marks swept clusters", liqLib ? liqLib.includes("swept:") : false);
check("liquidity_marker imports lib", liqMarker ? liqMarker.includes('require("./lib/liquidity.cjs")') : false);
check("liquidity_marker no pool filter", liqMarker ? !liqMarker.includes('p.type === "BSL" && !p.swept') : false);
check("lecture2 delegates to lib", lect2 ? lect2.includes('require("../lib/liquidity.cjs")') : false);
check("irl_erl IRL includes equal clusters", irlErl ? irlErl.includes('kind: "equalHighs"') && irlErl.includes("findRelativeEqualLevels(src, atr)") : false);

let gm = null;
try { gm = JSON.parse(fs.readFileSync(path.join(ROOT, "tests", "golden", "primitives.json"), "utf8")); } catch {}
check("golden-master exists", !!gm);
check("golden londonPM not killzone", gm ? gm.time.killzoneChecks.jan0730 === false : false);
check("golden ATR=6", gm ? gm.metrics.atr14 === 6 : false);

if (failures.length > 0) {
  console.error("PHASE0_VERIFY_FAIL:");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log("PHASE0_VERIFY_OK");
