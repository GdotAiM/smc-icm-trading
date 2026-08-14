// tools/self_validate.cjs
// Mechanical self-validation — verifies every stage's claims (direction, guard,
// sweep, FVG, trigger, SL/TP geometry) against the raw engine reports and candle
// data BEFORE any LLM sees the decision. Deterministic, zero tokens, no model.
//
//   node tools/self_validate.cjs <PAIR> [--date YYYY-MM-DD]
//
// Output: shared/<DATE>/<PAIR>/self_validation.json + .md
//   verdict: CLEAN | CAUTION | CONFLICT
//   checks:  [{ id, level: PASS|WARN|FAIL, source, detail }]
//
// It NEVER gates — the deterministic engine remains the authority. This layer
// only catches the class of bug the LLM auditor kept finding (e.g. a SHORT
// decision with BULLISH stage text) mechanically, pre-LLM.
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = process.env.WORKSPACE_ROOT || "C:\\Users\\cash\\smc-icm-trading";

// Shared runner — used by the CLI entrypoint below AND by run_pair.cjs at
// decision-emit time. Pure function: no process.exit, no stdout (caller logs).
function runSelfValidation(pair, date) {
  const PAIR = (pair || "").toUpperCase();
  const DATE = date || new Date().toISOString().slice(0, 10);

  const pairDir = PAIR === "XAUUSD" ? "GOLD" : PAIR;
  const sharedDir = path.join(ROOT, "shared", DATE, pairDir);
  const stagesDir = path.join(ROOT, "stages");

  function readJson(file) {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
    } catch {
      return null;
    }
  }

  function readMd(relPath) {
    try {
      return fs.readFileSync(relPath, "utf8");
    } catch {
      return null;
    }
  }

  function stageMd(stage, name) {
    return readMd(path.join(stagesDir, stage, "output", `${PAIR.toLowerCase()}_${name}`));
  }

  const checks = [];
  const add = (id, level, source, detail) => checks.push({ id, level, source, detail });

  // ── Load inputs ──────────────────────────────────────────────────────────
  const decision = readJson(path.join(sharedDir, "decision.json"));
  const biasMd = stageMd("01_htf_bias", "bias.md");
  const guardMd = stageMd("05b_micro_confirmation", "guard.md");
  const coherenceMd = stageMd("05b_micro_confirmation", "coherence.md");
  const triggerMd = stageMd("05b_micro_confirmation", "trigger_check.md");
  const entryMd = stageMd("05_entry_refinement", "entry_plan.md");
  const engine5m = readJson(path.join(sharedDir, "engine_5m.json"));
  const engine15m = readJson(path.join(sharedDir, "engine_15m.json"));

  // ── 1. Direction coherence: decision vs bias file ─────────────────────────
  const decDir = decision?.entry?.type; // SHORT | LONG | NO TRADE
  const biasMatch = biasMd ? /Final Bias[\s\S]{0,60}?\*\*([A-Z]+)\*\*/.exec(biasMd) : null;
  const biasWord = biasMatch ? biasMatch[1].toUpperCase() : null;
  const biasDir = biasWord === "BULLISH" ? "LONG" : biasWord === "BEARISH" ? "SHORT" : null;

  if (decDir && biasDir && decDir !== "NO TRADE" && decDir !== biasDir) {
    add("direction_vs_bias", "FAIL", "01_htf_bias/output/bias.md",
      `Decision is ${decDir} but the HTF bias stage declares ${biasWord} (${biasDir}). Stage text argues the opposite direction — resolve before trade.`);
  } else if (decDir && decDir !== "NO TRADE") {
    add("direction_vs_bias", "PASS", "01_htf_bias/output/bias.md",
      `Decision ${decDir} aligns with HTF bias ${biasWord || "unparsed"}.`);
  } else if (decDir) {
    add("direction_vs_bias", "PASS", "01_htf_bias/output/bias.md", `Decision is NO TRADE — direction not applicable.`);
  } else {
    add("direction_vs_bias", "WARN", "decision.json", "No decision direction found.");
  }

  // ── 2. Trigger text direction: does the entry trigger contradict the side? ─
  const triggerLine = entryMd ? entryMd.split("\n").find(l => l.includes("Trigger")) : null;
  if (triggerLine && decDir && decDir !== "NO TRADE") {
    const tl = triggerLine.toLowerCase();
    const longsWords = ["bullish", "upside", "buy"];
    const shortWords = ["bearish", "downside", "sell"];
    const longs = longsWords.filter(w => tl.includes(w)).length;
    const shorts = shortWords.filter(w => tl.includes(w)).length;
    const triggerDir = longs > shorts ? "LONG" : shorts > longs ? "SHORT" : null;
    if (triggerDir && triggerDir !== decDir) {
      add("trigger_text_direction", "FAIL", "05_entry_refinement/output/entry_plan.md",
        `Decision ${decDir} but trigger text says: "${triggerLine.trim()}" — the trigger describes a ${triggerDir} move.`);
    } else {
      add("trigger_text_direction", "PASS", "05_entry_refinement/output/entry_plan.md",
        `Trigger text is direction-consistent (${triggerLine.trim().slice(0, 80)}).`);
    }
  } else {
    add("trigger_text_direction", "WARN", "05_entry_refinement/output/entry_plan.md",
      triggerLine ? "No decision direction (NO TRADE) — trigger not checked." : "No trigger line found in entry plan.");
  }

  // ── 3. Micro trigger checklist direction ──────────────────────────────────
  const trigDirMatch = triggerMd ? /Direction:\s*\*\*?(LONG|SHORT)/i.exec(triggerMd) : null;
  const microTriggerDir = trigDirMatch ? trigDirMatch[1].toUpperCase() : null;
  if (decDir && decDir !== "NO TRADE" && microTriggerDir && microTriggerDir !== decDir) {
    add("micro_trigger_direction", "FAIL", "05b_micro_confirmation/output/trigger_check.md",
      `Decision ${decDir} but the trigger checklist runs a ${microTriggerDir} setup (Direction: ${microTriggerDir}).`);
  } else if (decDir && decDir !== "NO TRADE") {
    add("micro_trigger_direction", "PASS", "05b_micro_confirmation/output/trigger_check.md",
      `Trigger checklist direction (${microTriggerDir || "n/a"}) matches decision ${decDir}.`);
  } else {
    add("micro_trigger_direction", "WARN", "05b_micro_confirmation/output/trigger_check.md",
      microTriggerDir ? "NO TRADE decision — direction not applicable." : "No direction in trigger checklist.");
  }

  // ── 4. Guard verdict vs decision gates ────────────────────────────────────
  const guardBlocked = guardMd ? /\*\*❌ DO NOT ENTER\*\*/.test(guardMd) || /Entry Allowed:\s*❌/.test(guardMd) : null;
  const gatesNotBlocked = decision?.gates?.notGuardBlocked;
  if (guardBlocked === true && gatesNotBlocked === true) {
    add("guard_vs_gates", "FAIL", "05b_micro_confirmation/output/guard.md",
      "Guard stage says DO NOT ENTER but decision.gates.notGuardBlocked is true — gate state contradicts stage evidence.");
  } else if (guardBlocked === true) {
    add("guard_vs_gates", "PASS", "05b_micro_confirmation/output/guard.md",
      "Guard blocks entry and decision gates reflect it (fail-closed working as intended).");
  } else {
    add("guard_vs_gates", "WARN", "05b_micro_confirmation/output/guard.md",
      guardBlocked == null ? "Guard file unparsed/missing." : "Guard clear; decision gates consistent.");
  }

  // ── 5. SL/TP geometry vs decision side ────────────────────────────────────
  const e = decision?.entry;
  if (e && e.type && e.type !== "NO TRADE" && Number.isFinite(e.price) && Number.isFinite(e.sl) && Number.isFinite(e.tp1)) {
    const price = e.price, sl = e.sl, tp1 = e.tp1;
    let ok = false, reason = "";
    if (e.type === "SHORT") {
      ok = sl > price && tp1 < price;
      reason = `SHORT: SL ${sl.toFixed(5)} ${sl > price ? ">" : "≤"} entry ${price.toFixed(5)}; TP1 ${tp1.toFixed(5)} ${tp1 < price ? "<" : "≥"} entry.`;
    } else if (e.type === "LONG") {
      ok = sl < price && tp1 > price;
      reason = `LONG: SL ${sl.toFixed(5)} ${sl < price ? "<" : "≥"} entry ${price.toFixed(5)}; TP1 ${tp1.toFixed(5)} ${tp1 > price ? ">" : "≤"} entry.`;
    }
    add("sl_tp_geometry", ok ? "PASS" : "FAIL", "decision.json", reason);
    if (ok && Math.abs(sl - price) < 1e-9) {
      add("sl_tp_degenerate", "FAIL", "decision.json", `SL == entry (${sl.toFixed(5)}) — degenerate stop, riskPips will explode.`);
    }
  } else {
    add("sl_tp_geometry", "WARN", "decision.json", "No entry/SL/TP (NO TRADE or incomplete) — geometry not checked.");
  }

  // ── 6. Sweep claim vs engine reports ──────────────────────────────────────
  const engines = { "5m": engine5m, "15m": engine15m };
  for (const [tf, eng] of Object.entries(engines)) {
    if (!eng) continue;
    const pools = eng.liquidity?.sweptPools || eng.liquidity || [];
    const arr = Array.isArray(pools) ? pools : [];
    const swept = arr.filter(p => p.swept === true).length;
    const hasAny = arr.length > 0;
    if (e?.type && e.type !== "NO TRADE" && hasAny && swept === 0) {
      add("sweep_claim", "WARN", `engine_${tf}.json`,
        `Decision trades but engine ${tf} reports ${arr.length} pool(s) (e.g. ${arr[0].type}) — none marked swept. Sweep-dependent models (purge-gated) would be contradicting the trade.`);
    } else {
      add("sweep_claim", hasAny ? "PASS" : "WARN", `engine_${tf}.json`,
        hasAny ? `${arr.length} pool(s), ${swept} swept.` : "No liquidity pools parsed from engine.");
    }
  }

  // ── 7. FVG claim vs engine reports ────────────────────────────────────────
  const primaryModel = decision?.registry?.primary || "";
  for (const [tf, eng] of Object.entries(engines)) {
    if (!eng) continue;
    const fvgs = Array.isArray(eng.fvgs) ? eng.fvgs.length : 0;
    const modelMentionsFvg = /FVG|fvg/i.test(primaryModel) || /FVG|fvg/i.test(e?.type || "") || (entryMd ? /FVG|fvg/i.test(entryMd) : false);
    if (modelMentionsFvg && fvgs === 0 && e?.type && e.type !== "NO TRADE") {
      add("fvg_claim", "WARN", `engine_${tf}.json`,
        `Decision trades on ${primaryModel || "a model"} but engine ${tf} reports 0 FVGs — an FVG-dependent setup with no unmitigated FVG on the entry TF.`);
    } else {
      add("fvg_claim", fvgs > 0 ? "PASS" : "WARN", `engine_${tf}.json`,
        `${fvgs} unmitigated FVG(s) on ${tf}.`);
    }
  }

  // ── Verdict ───────────────────────────────────────────────────────────────
  const failCount = checks.filter(c => c.level === "FAIL").length;
  const warnCount = checks.filter(c => c.level === "WARN").length;
  const verdict = failCount > 0 ? "CONFLICT" : warnCount > 0 ? "CAUTION" : "CLEAN";

  const out = {
    pair: PAIR,
    date: DATE,
    validatedAt: new Date().toISOString(),
    verdict,
    counts: { pass: checks.filter(c => c.level === "PASS").length, warn: warnCount, fail: failCount },
    checks,
  };

  fs.mkdirSync(sharedDir, { recursive: true });
  fs.writeFileSync(path.join(sharedDir, "self_validation.json"), JSON.stringify(out, null, 2));

  const md = [
    `# Self-Validation — ${PAIR} — ${DATE}`,
    ``,
    `> Mechanical, pre-LLM stage-claim verification. Verdict: **${verdict}** (${out.counts.fail} FAIL / ${out.counts.warn} WARN / ${out.counts.pass} PASS).`,
    ``,
    `| Check | Level | Source | Detail |`,
    `|-------|-------|--------|--------|`,
    ...checks.map(c => `| ${c.id} | **${c.level}** | ${c.source} | ${c.detail.replace(/\|/g, "\\|")} |`),
    ``,
  ].join("\n");
  fs.writeFileSync(path.join(sharedDir, "self_validation.md"), md);

  return out;
}

module.exports = { runSelfValidation };

// ── CLI entrypoint ─────────────────────────────────────────────────────────
if (require.main === module) {
  const PAIR = (process.argv[2] || "").toUpperCase();
  if (!PAIR) {
    console.log("Usage: node tools/self_validate.cjs <PAIR> [--date YYYY-MM-DD]");
    process.exit(1);
  }
  const dateArg = process.argv.indexOf("--date");
  const DATE = dateArg >= 0 ? process.argv[dateArg + 1] : new Date().toISOString().slice(0, 10);
  const out = runSelfValidation(PAIR, DATE);
  console.log(`Self-validation ${PAIR} (${DATE}): ${out.verdict} — ${out.counts.fail} FAIL, ${out.counts.warn} WARN, ${out.counts.pass} PASS`);
  for (const c of out.checks.filter(c => c.level !== "PASS")) {
    console.log(`  [${c.level}] ${c.id} (${c.source}): ${c.detail}`);
  }
  process.exit(out.counts.fail > 0 ? 2 : 0);
}
