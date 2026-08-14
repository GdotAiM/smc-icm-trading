// market_brief.cjs — PHASE 1 (Perception): assemble the "market brief"
//
// The LLM cannot see a chart. This module turns the raw workspace state into
// a single structured brief that an LLM operator can read like a chart in
// front of a trader: time/session, per-TF structure, liquidity, PD arrays,
// forecasts, stage conclusions, trade-graph memory, and the existing decision.
//
// The brief is written to shared/<DATE>/<PAIR>/market_brief.md and returned as
// a string. It is the perception input to the operator loop (Phase 2).
//
// Usage:
//   node tools/llm/market_brief.cjs EURUSD              # today
//   node tools/llm/market_brief.cjs EURUSD --date 2026-08-13
//   node tools/llm/market_brief.cjs EURUSD --no-write   # print only
//   node tools/llm/market_brief.cjs EURUSD --compact    # print-only, shorter

const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..", "..");
const { getNYDate, getNYHourFor } = require("../ny_time.cjs");
const { computeSwingTarget, fmt: stFmt } = require("./swing_target.cjs");
const { loadActiveLessons, formatMemoryMarkdown } = require("./memory_lessons.cjs");
const {
  markPreSessionRange,
  markDailyWeeklyLevels,
  checkTethering,
  bodyVsWickConfidence,
  defineORG,
  classifyGapType,
} = require("../high_precision_secrets.cjs");
const { runLecture2Setup } = require("../tv-mcp/lecture2_setup.cjs");
const { runLecture1Setup } = require("../tv-mcp/lecture1_setup.cjs");
const { runLecture4Setup } = require("../tv-mcp/lecture4_setup.cjs");

const TFS = ["1w", "1d", "4h", "1h", "15m", "5m", "1m"];

// ── Time & Session context ─────────────────────────────────────────────────────

const _timeCache = { at: 0, data: null };
function timeContext(root = ROOT) {
  const now = Date.now();
  if (_timeCache.data && now - _timeCache.at < 30000) return _timeCache.data;
  try {
    const out = execSync(`node "${path.join(root, "tools", "ny_time.cjs")}" --full`, {
      encoding: "utf8",
      timeout: 20000,
      windowsHide: true,
    });
    _timeCache.at = now;
    _timeCache.data = JSON.parse(out);
  } catch (_) {
    _timeCache.data = {
      nyTime: { hour: new Date().getUTCHours() - 4, day: "?", dayIndex: 0 },
      session: { name: "unknown", character: "", killzone: false, reliability: 1 },
      tradeable: true,
      multipliers: { combined: 1 },
      macroEvents: [],
      rules: { noTrade: null },
    };
  }
  return _timeCache.data;
}

// ── Candle compaction ──────────────────────────────────────────────────────────

function compactCandles(candles, recentN = 10) {
  if (!Array.isArray(candles) || candles.length === 0) return null;
  const last = candles[candles.length - 1];
  const window = candles.slice(-Math.min(recentN, candles.length));
  const bars = window
    .map((c) => `${c.open.toFixed(5)}/${c.high.toFixed(5)}/${c.low.toFixed(5)}/${c.close.toFixed(5)}`)
    .join(" ");
  const hi = Math.max(...candles.slice(-100).map((c) => c.high));
  const lo = Math.min(...candles.slice(-100).map((c) => c.low));
  return {
    count: candles.length,
    lastClose: last.close,
    lastTime: last.time,
    lastBars: bars,
    range100: `${lo.toFixed(5)} - ${hi.toFixed(5)}`,
  };
}

// ── Engine compaction ──────────────────────────────────────────────────────────

function compactEngine(eng) {
  if (!eng || typeof eng !== "object") return null;
  const top = (arr, n) => (Array.isArray(arr) ? arr.slice(0, n) : []);
  const liq = top(eng.liquidity, 3).map((l) => ({
    p: l.price.toFixed ? l.price.toFixed(5) : l.price,
    t: l.type,
    str: l.strength,
    swept: l.swept,
  }));
  const ob = top(eng.orderBlocks, 2).map((o) => ({
    p: `${o.proximal ? o.proximal.toFixed(5) : ""}/${o.distal ? o.distal.toFixed(5) : ""}`,
    kind: o.kind,
    type: o.type,
    hasFvg: o.hasFvg,
  }));
  const ifvg = top(eng.inversionFvgs, 2).map((i) => ({
    p: `${i.top ? i.top.toFixed(5) : ""}/${i.bottom ? i.bottom.toFixed(5) : ""}`,
  }));
  return {
    price: eng.price,
    bias: eng.structure?.bias,
    lastEvent: eng.structure?.lastEvent,
    confidence: eng.structure?.confidence,
    swingHigh: eng.structure?.lastSwingHigh,
    swingLow: eng.structure?.lastSwingLow,
    liquidity: liq,
    orderBlocks: ob,
    fvgCount: Array.isArray(eng.fvgs) ? eng.fvgs.length : 0,
    inversionFvgs: ifvg,
    draw: eng.draw ? { side: eng.draw.side, distance: eng.draw.distance, reason: eng.draw.reason } : null,
    pdZone: eng.pdArray?.currentZone || null,
    volume: eng.volumeDisplacement?.label || null,
  };
}

// ── Forecast compaction ────────────────────────────────────────────────────────

function compactForecast(fc) {
  if (!fc || typeof fc !== "object") return null;
  const median = Array.isArray(fc.median_path) ? fc.median_path : null;
  return {
    model: fc.model || fc.name || "forecast",
    direction: fc.direction,
    strength: fc.strength,
    currentPrice: fc.current_price,
    medianStart: median && median.length ? median[0] : null,
    medianEnd: median && median.length ? median[median.length - 1] : null,
  };
}

// ── Stage outputs (condensed) ──────────────────────────────────────────────────

const STAGE_FILES = [
  ["01_htf_bias", "{pair}_bias.md", "HTF Bias"],
  ["02_key_levels", "{pair}_levels.md", "Key Levels"],
  ["03_session_time", "{pair}_session.md", "Session"],
  ["05b_micro_confirmation", "{pair}_coherence.md", "Coherence"],
  ["05b_micro_confirmation", "{pair}_inducement.md", "Inducement"],
  ["05b_micro_confirmation", "{pair}_invalidation.md", "Invalidation"],
  ["04_model_selection", "{pair}_active_models.md", "Active Models"],
  ["05_entry_refinement", "{pair}_entry_plan.md", "Entry Plan"],
  ["06_risk_management", "{pair}_risk_plan.md", "Risk Plan"],
];

const PER_FILE_CAP = 900;
const TOTAL_STAGE_CAP = 8000;

function loadStageOutputs(pair, root = ROOT) {
  const P = pair.toUpperCase();
  const sections = [];
  let used = 0;
  for (const [stage, file, label] of STAGE_FILES) {
    if (used >= TOTAL_STAGE_CAP) break;
    const p = path.join(root, "stages", stage, "output", file.split("{pair}").join(P));
    if (!fs.existsSync(p)) continue;
    let content = fs.readFileSync(p, "utf8").trim();
    if (content.length > PER_FILE_CAP) content = content.slice(0, PER_FILE_CAP) + "\n…[truncated]";
    sections.push(`### ${label} (${stage})\n${content}`);
    used += content.length;
  }
  return sections.join("\n\n");
}

// ── Graded levels & tethering (ICT High Precision Secrets) ────────────────────

// The LLM sees a chart through graded levels: the 7-9AM pre-session range, its
// CE/quadrants/octants, the -0.5 projections, daily/weekly anchors (PDH/PDL/CE,
// PWH/PWL), the tethering weight boost, body-vs-wick confidence, and the ORG.
// Computed live from the same shared/<DATE>/<PAIR> files the rest of the brief
// reads — so it respects the --date override instead of always using today.
function gradedLevelsSection(pair, date, root = ROOT) {
  const P = pair.toUpperCase();
  const dir = P === "XAUUSD" ? "GOLD" : P;
  const d = path.join(root, "shared", date, dir);
  const read = (f) => {
    const p = path.join(d, f);
    if (!fs.existsSync(p)) return null;
    try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (_) { return null; }
  };

  const c1m = read("candles_1m.json");
  const c1d = read("candles_1d.json");
  const c1w = read("candles_1w.json");
  const eng1h = read("engine_1h.json");
  const eng5m = read("engine_5m.json");
  const eng1d = read("engine_1d.json");
  if (!c1m || !c1d) return null;

  const currentPrice = eng1h?.price || 0;
  const dailyBias = eng1d?.structure?.bias || "neutral";
  const fvgs = (eng5m?.fvgs || []).concat(eng1h?.fvgs || []);
  const obs = (eng5m?.orderBlocks || []).concat(eng1h?.orderBlocks || []);

  const pre = markPreSessionRange(c1m);
  const dailyLevels = markDailyWeeklyLevels(c1d, c1w);
  const tether = checkTethering(fvgs, obs, pre, dailyLevels);
  const bodyWick = bodyVsWickConfidence(c1m, currentPrice);
  const org = defineORG(c1d, currentPrice, c1m);
  const gaps = classifyGapType(fvgs, org, currentPrice, dailyBias);

  const tetherAdj = (parseFloat(tether.boost) - 1) * 100;
  const composite = Math.round(tetherAdj + bodyWick.adjustment);

  const lines = [];
  lines.push(pre
    ? `- Pre-session 7-9AM range: ${pre.low.toFixed(5)}-${pre.high.toFixed(5)} | CE ${pre.ce.toFixed(5)} | quadrants ${pre.quadrants.lower.toFixed(5)}/${pre.ce.toFixed(5)}/${pre.quadrants.upper.toFixed(5)} | octants ${pre.octants.map((o) => o.toFixed(5)).join(", ")}`
    : "- Pre-session 7-9AM range: not yet formed (pre-9:00 NY)");
  if (pre) lines.push(`- -0.5 projections: ${pre.projNeg05.toFixed(5)} above high / ${pre.projNeg05Low.toFixed(5)} below low`);
  if (dailyLevels.length) lines.push(`- Daily/Weekly anchors: ${dailyLevels.map((l) => `${l.label} ${l.price.toFixed(5)}`).join(" | ")}`);
  lines.push(`- Tethering: ${tether.detail}`);
  lines.push(`- Body/Wick: ${bodyWick.detail}`);
  if (org) lines.push(`- ORG: ${org.detail} | -0.5 @ ${org.projNeg05.toFixed(5)} | -1.0 @ ${org.projNeg1.toFixed(5)}`);
  if (gaps.length) lines.push(`- Gaps: ${gaps.map((g) => g.detail).join(" | ")}`);
  lines.push(`- Composite confidence adjustment: ${composite >= 0 ? "+" : ""}${composite} pts`);

  // NY Lunch carry-forward (prev-day) — feeds the ny_lunch_reversal_* models
  try {
    const carryPath = path.join(d, "prev_lunch_inefficiency.json");
    if (fs.existsSync(carryPath)) {
      const carry = JSON.parse(fs.readFileSync(carryPath, "utf8"));
      if (carry.found && carry.inefficiency) {
        const z = carry.inefficiency;
        lines.push(`- NY Lunch carry-forward (prior day ${carry.prevDate || ""}): ${z.kind} zone ${z.bottom.toFixed(5)}-${z.top.toFixed(5)} (mid ${z.midpoint.toFixed(5)}) → ${z.expectedReaction.replace("_", " ")} | sweep @ ${carry.sweep?.price ? carry.sweep.price.toFixed(5) : "?"}`);
      }
    }
  } catch (_) {}

  return lines.join("\n");
}

// ── Lecture 2 (London Hunt + IFVG) — live detector state ──────────────────────

const fmt = (x) => (x != null && typeof x.toFixed === "function" ? x.toFixed(5) : x);

function lecture2Section(pair, date, root = ROOT) {
  try {
    const L2 = runLecture2Setup(pair, date, root);
    if (!L2 || (L2.detail || "").includes("Outside Lecture 2 window")) return null;
    const lines = [];
    if (L2.londonRange) lines.push(`- London H/L: ${fmt(L2.londonRange.high)} / ${fmt(L2.londonRange.low)} (${L2.londonRange.source || "1H draw ref"})`);
    if (L2.relEqualHighs?.length || L2.relEqualLows?.length) {
      lines.push(`- Rel-equal targets: ${L2.relEqualHighs.length} highs / ${L2.relEqualLows.length} lows (5m/1m post-07:00)`);
    }
    if (L2.hunt) lines.push(`- Hunt: ${L2.hunt.active ? `${L2.hunt.direction}${L2.hunt.reversed ? " — REVERSED (awaiting MSS)" : " — active"}` : (L2.hunt.detail || "not triggered")}`);
    if (L2.mss) lines.push(`- MSS: ${L2.mss.confirmed ? (L2.mss.detail || "confirmed") : "not confirmed"}`);
    if (L2.ifvg) lines.push(`- IFVG: ${L2.ifvg.found ? (L2.ifvg.detail || `CE ${fmt(L2.ifvg.ce)}`) : "not found"}`);
    if (L2.breaker?.found) lines.push(`- Breaker (backup entry): ${L2.breaker.detail || `@ ${fmt(L2.breaker.entry)}`}`);
    if (L2.postHuntSL) lines.push(`- SL (post-hunt swing): ${fmt(L2.postHuntSL.price)} — ${L2.postHuntSL.source || "structural"}`);
    if (L2.fibTargets) lines.push(`- TP (Fib ext): ${L2.fibTargets.detail || `${fmt(L2.fibTargets.tp1)} → ${fmt(L2.fibTargets.tp2)}`}`);
    if (L2.setupReady && L2.direction) {
      lines.push(`- **SETUP READY: ${L2.direction}** — entry ${fmt(L2.entryPrice)} (${L2.ifvg?.found ? "IFVG CE" : "Breaker"}), SL ${fmt(L2.slReference)}, per the Stage 05 Lecture 2 override`);
    } else {
      lines.push(`- Status: ${L2.detail || "building"}`);
    }
    lines.push(`- Model #15 "London Hunt + IFVG" — valid 07:00-07:40 NY; gate admits it there with confidence >= 60`);
    return lines.join("\n");
  } catch (_) {
    return null;
  }
}

function lecture1Section(pair, date, root = ROOT) {
  try {
    const L1 = runLecture1Setup(pair, date, root);
    if (!L1 || (L1.detail || "").includes("Outside Lecture 1")) return null;
    const lines = [];
    if (L1.bias) lines.push(`- 15m bias: ${L1.bias}`);
    if (L1.currentPrice != null) lines.push(`- Price: ${fmt(L1.currentPrice)}`);
    if (L1.formation?.detail) lines.push(`- Pre-08:30 formation: ${L1.formation.detail}`);
    if (L1.raid) lines.push(`- Raid: ${L1.raid.active ? `${L1.raid.type || "?"}${L1.raid.reversed ? " — REVERSED (awaiting MSS)" : " — active"}` : (L1.raid.detail || "not triggered")}`);
    if (L1.mss) lines.push(`- MSS: ${L1.mss.confirmed ? (L1.mss.detail || "confirmed") : "not confirmed"}`);
    if (L1.firstTagged) lines.push(`- First-tagged PD array: ${L1.firstTagged.type} @ ${fmt(L1.firstTagged.price)}`);
    if (L1.slReference != null) lines.push(`- SL (post-08:30 range): ${fmt(L1.slReference)} — ${L1.slSource || "structural"}`);
    if (L1.tpTargets?.detail) lines.push(`- TP: ${L1.tpTargets.detail}`);
    if (L1.setupReady && L1.direction) {
      lines.push(`- **SETUP READY: ${L1.direction}** — entry ${fmt(L1.entryPrice)} (${L1.entrySource || "PD array"}), per the Stage 05 Lecture 1 override`);
    } else {
      lines.push(`- Status: ${L1.detail || "building"}`);
    }
    lines.push(`- Model #17 "08:30 Liquidity Raid Model" — valid 08:00-10:00 NY; gate blocks it outside that window`);
    return lines.join("\n");
  } catch (_) {
    return null;
  }
}

function lecture4Section(pair, date, root = ROOT) {
  try {
    const L4 = runLecture4Setup(pair, date, root);
    if (!L4 || (L4.detail || "").includes("Outside 08:30")) return null;
    const lines = [];
    if (L4.bias) lines.push(`- Bias: ${L4.bias}`);
    if (L4.gapClusters?.detail) lines.push(`- NDOG/NWOG clusters: ${L4.gapClusters.detail}`);
    if (L4.substituteGap) lines.push(`- Gap substitute (FVG): ${L4.substituteGap}`);
    if (L4.gapDraw) lines.push(`- Draw: ${L4.gapDraw.drawing ? (L4.gapDraw.nearestGap?.type || "gap") + " toward " + (L4.gapDraw.direction || "?") : (L4.gapDraw.detail || "no draw")}`);
    if (L4.quarterTap?.detected) lines.push(`- Quarter tap: ${L4.quarterTap.detail}`);
    if (L4.mss) lines.push(`- MSS: ${L4.mss.confirmed ? (L4.mss.detail || "confirmed") : "not confirmed"}`);
    if (L4.entry) lines.push(`- Entry: ${L4.entry.found ? (L4.entry.detail || `@ ${fmt(L4.entryPrice)}`) : "not found"}`);
    if (L4.slReference != null) lines.push(`- SL (post-MSS swing): ${fmt(L4.slReference)} — ${L4.slSource || "structural"}`);
    if (L4.tpTargets?.detail) lines.push(`- TP: ${L4.tpTargets.detail}`);
    if (L4.setupReady && L4.direction) {
      lines.push(`- **SETUP READY: ${L4.direction}** — entry ${fmt(L4.entryPrice)}, per the Stage 05 Lecture 4 override`);
    } else {
      lines.push(`- Status: ${L4.detail || "building"}`);
    }
    lines.push(`- Model #16 "NDOG/NWOG News Model" — valid 08:30-10:00 NY; gate blocks it outside that window`);
    return lines.join("\n");
  } catch (_) {
    return null;
  }
}

function lectureSetupsSection(pair, date, root = ROOT) {
  const blocks = [
    ["### Lecture 2 — London Hunt + IFVG (07:00-07:40 NY)", lecture2Section(pair, date, root)],
    ["### Lecture 1 — 08:30 Liquidity Raid (08:00-10:00 NY)", lecture1Section(pair, date, root)],
    ["### Lecture 4 — NDOG/NWOG News (08:30-10:00 NY)", lecture4Section(pair, date, root)],
  ].filter(([, body]) => body);
  if (!blocks.length) return null;
  return blocks.map(([h, body]) => `${h}\n${body}`).join("\n\n");
}

// ── News calendar (today_events.json) ──────────────────────────────────────────

function loadNews(root = ROOT) {
  for (const f of ["today_events.json", path.join("shared", "today_events.json")]) {
    const p = path.join(root, f);
    if (fs.existsSync(p)) {
      try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (_) {}
    }
  }
  return [];
}

// ── Open book & risk ───────────────────────────────────────────────────────────

const _riskCache = { at: 0, data: null };
function riskContext(root = ROOT) {
  const now = Date.now();
  if (_riskCache.data && now - _riskCache.at < 30000) return _riskCache.data;
  try {
    const out = execSync(`node "${path.join(root, "tools", "risk_tracker.cjs")}" --check`, {
      encoding: "utf8", timeout: 15000, windowsHide: true,
    });
    _riskCache.at = now;
    _riskCache.data = JSON.parse(out.trim());
  } catch (_) {
    _riskCache.data = null;
  }
  return _riskCache.data;
}

function openPositions(root = ROOT) {
  try {
    const log = JSON.parse(fs.readFileSync(path.join(root, "shared", "trade_log.json"), "utf8"));
    return (Array.isArray(log) ? log : []).filter((t) => t.status === "OPEN");
  } catch (_) {
    return [];
  }
}

function openBookSection(root = ROOT) {
  const lines = [];
  const open = openPositions(root);
  if (open.length) {
    lines.push(`- OPEN (${open.length}/2): ${open.map((t) => `${t.pair} ${t.direction} @${t.entry} qty ${t.qty ?? "?"}${t.tp ? ` TP ${t.tp}` : ""}${t.sl ? ` SL ${t.sl}` : ""}`).join(" | ")}`);
  } else {
    lines.push(`- OPEN: none (0/2 positions)`);
  }
  const r = riskContext(root);
  if (r) {
    lines.push(`- Balance: $${r.balance} | Daily P/L: $${r.dailyPnl} (remaining $${r.dailyLossRemaining}) | Weekly P/L: $${r.weeklyPnl} | Risk budget: $${r.riskBudget}`);
    if (r.consecutiveLosses >= 1) lines.push(`- Streak: ${r.consecutiveLosses} losses / ${r.consecutiveWins} wins${r.sizeMultiplier < 1 ? ` — size reduced ×${r.sizeMultiplier}` : ""}`);
    if (!r.allowed) lines.push(`- ⛔ ${r.reason}`);
  } else {
    lines.push(`- Risk tracker: unavailable`);
  }
  return lines.join("\n");
}

// ── Hourly Candle Scalp (ICT Gems) — 15m bellwether / daily bias / 1m entry ──

function hourlyScalpSection(pair, date, root = ROOT, nowHour) {
  try {
    const P = String(pair || "").toUpperCase();
    const pairDir = path.join(root, "shared", date, P);
    const tc = nowHour === undefined ? timeContext(root) : { nyTime: { hour: nowHour } };
    const nowH = Number.isInteger(nowHour) ? nowHour : tc.nyTime?.hour;
    if (!Number.isInteger(nowH) || nowH < 7) return null;

    let d1 = null;
    try { d1 = JSON.parse(fs.readFileSync(path.join(pairDir, "engine_1d.json"), "utf8")); } catch (_) {}
    const dailyBias = d1?.structure?.bias ?? d1?.bias;
    if (!dailyBias) return null;

    const lines = [];
    const dConf = d1?.structure?.confidence ?? d1?.confidence;
    const fmtConf = (v) => (Number.isFinite(v) ? (v > 0 && v <= 1 ? `${Math.round(v * 100)}%` : v) : null);
    lines.push(`- Daily bias: ${String(dailyBias).toUpperCase()}${fmtConf(dConf) ? ` (conf ${fmtConf(dConf)})` : ""}`);

    try {
      const m15 = JSON.parse(fs.readFileSync(path.join(pairDir, "engine_15m.json"), "utf8"));
      const m15bias = m15?.structure?.bias ?? m15?.bias;
      const m15conf = m15?.structure?.confidence ?? m15?.confidence;
      const m15evt = m15?.structure?.lastEvent ?? m15?.lastEvent;
      const swept = (m15?.liquidity || []).filter((l) => l.swept).map((l) => `${l.type}@${Number(l.price).toFixed(5)}`);
      lines.push(`- 15m bellwether: bias ${m15bias ? String(m15bias).toUpperCase() : "—"}${fmtConf(m15conf) ? ` (${fmtConf(m15conf)})` : ""} | last ${m15evt || "—"}${swept.length ? ` | swept: ${swept.join(", ")}` : " | no sweep yet"}`);
    } catch (_) {}

    let h1 = [];
    try { h1 = JSON.parse(fs.readFileSync(path.join(pairDir, "candles_1h.json"), "utf8")); } catch (_) {}
    const hours = [];
    if (Array.isArray(h1) && h1.length) {
      for (let h = 7; h <= nowH; h++) {
        const c = [...h1].reverse().find((x) => getNYHourFor(x.time) === h);
        if (!c) continue;
        const body = c.close - c.open;
        hours.push(`${String(h).padStart(2, "0")}:00${h === nowH ? " (current)" : ""} ${c.open.toFixed(5)}→${c.close.toFixed(5)} ${body >= 0 ? "BULL" : "BEAR"} body ${Math.abs(body).toFixed(5)} | H ${c.high.toFixed(5)} / L ${c.low.toFixed(5)}`);
      }
    }
    lines.push(hours.length ? `- Hours (NY, from 07:00): ${hours.join(" | ")}` : "- Hours (NY, from 07:00): no 1h candle data");

    try {
      const m1 = JSON.parse(fs.readFileSync(path.join(pairDir, "engine_1m.json"), "utf8"));
      const ce = compactEngine(m1);
      if (ce) {
        const zones = [];
        if (ce.orderBlocks.length) zones.push(`OB ${ce.orderBlocks.map((o) => `${o.kind} ${o.type} ${o.p}`).join(", ")}`);
        if (ce.inversionFvgs.length) zones.push(`IFVG ${ce.inversionFvgs.map((i) => i.p).join(", ")}`);
        if (ce.fvgCount) zones.push(`FVGs ${ce.fvgCount}`);
        lines.push(`- 1m entry context: ${zones.join(" | ") || "(none yet)"}`);
      }
    } catch (_) {}

    return lines.join("\n");
  } catch (_) {
    return null;
  }
}

// ── Swing Target / Multi-Setup Session (ICT Gems) ───────────────────────────────

function swingTargetSection(pair, date, root = ROOT) {
  const st = computeSwingTarget(pair, date, root);
  if (!st) return null;
  const q = st.qualification;
  const L = [];
  const m15fvg = st.fifteen.fvg ? stFmt(st.fifteen.fvg.mid) : null;
  const m15ob = st.fifteen.ob ? `${st.fifteen.ob.kind || "OB"} ${stFmt(st.fifteen.ob.proximal)}` : null;
  const m1zones = [];
  if (st.oneMin.fvg) m1zones.push(`FVG ${stFmt(st.oneMin.fvg.mid)}`);
  if (st.oneMin.ob) m1zones.push(`OB ${stFmt(st.oneMin.ob.proximal)}`);
  if (st.oneMin.inversionFvgs.length) m1zones.push(`IFVG ${st.oneMin.inversionFvgs.map((i) => stFmt(i.price ?? i.p ?? i)).join(", ")}`);
  L.push(`- TF ladder: DAILY = bias/draw (${st.bias}${st.draw ? `, draw ${String(st.draw.side).toUpperCase()} → ${stFmt(st.draw.level)}` : ""}) | 15m = framework (${st.fifteen.bias}${m15fvg ? ` FVG ${m15fvg}` : ""}${m15ob ? ` ${m15ob}` : ""}) | 5m = noisy — judge on the 15m | 1m = precision entry (${m1zones.join(", ") || "—"})`);
  if (st.dailyOB != null) L.push(`- Daily OB (draw target): ${stFmt(st.dailyOB)} — open of last ${st.bias === "BEARISH" ? "down-close (bull OB)" : "up-close (bear OB)"} daily candle`);
  L.push(`- Midnight open: ${stFmt(st.dayOpen)} — price ${st.openingSide || "—"}`);
  if (st.rel.highs.length || st.rel.lows.length) {
    const hi = st.rel.highs.map(fmt).join(", ");
    const lo = st.rel.lows.map(fmt).join(", ");
    L.push(`- REL: ${hi ? `highs ${hi}` : ""}${hi && lo ? " | " : ""}${lo ? `lows ${lo}` : ""}`);
  }
  const onoff = (b) => (b ? "Y" : "n");
  L.push(`- Qualification: ${q.boxes}/${q.total} (disp ${onoff(q.displacement)} / break ${onoff(q.swingBreak)} / FVG-retest ${onoff(q.fvgRetest)} / open-side ${onoff(q.openingSide)}) — ${q.qualified ? "QUALIFIED (≥3/4)" : "below floor"}`);
  L.push(`- Setups today (Swing Target): ${st.setups.total} (${st.setups.morning} morning / ${st.setups.afternoon} afternoon)`);
  return L.join("\n");
}

// ── Decision ───────────────────────────────────────────────────────────────────

function compactDecision(pair, date, root = ROOT) {
  const P = pair.toUpperCase();
  const p = path.join(root, "shared", date, P, "decision.json");
  if (!fs.existsSync(p)) return null;
  try {
    const d = JSON.parse(fs.readFileSync(p, "utf8"));
    const pick = ["pair", "date", "registry", "entry", "rr", "coherence", "invalidation", "guard", "gates", "risk", "sizing"];
    const out = {};
    for (const k of pick) if (d[k] !== undefined) out[k] = d[k];
    return JSON.stringify(out, null, 2);
  } catch (_) {
    return "[decision.json unreadable]";
  }
}

// ── Screenshot reference ───────────────────────────────────────────────────────

function findScreenshot(pair, date, root = ROOT) {
  const P = pair.toUpperCase();
  const candidates = [
    path.join(root, "shared", date, P, "chart.png"),
    path.join(root, "shared", date, P, `${P.toLowerCase()}_chart.png`),
    path.join(root, "shared", "screenshots", `${P.toLowerCase()}_${date}.png`),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}

// ── Brief builder ──────────────────────────────────────────────────────────────

function buildBrief(pair, opts = {}) {
  const P = String(pair || "").toUpperCase();
  if (!P) return { error: "no pair provided", brief: "" };

  const date = opts.date || getNYDate();
  const root = opts.root || ROOT;
  const pairDir = path.join(root, "shared", date, P);
  const briefPath = path.join(pairDir, "market_brief.md");

  const lines = [];
  lines.push(`# MARKET BRIEF — ${P} — ${date}`);
  lines.push(`_Generated ${new Date().toISOString()}_`);
  lines.push("");

  // 1. Time & session
  const tc = timeContext(root);
  lines.push("## 1. TIME & SESSION");
  lines.push(`- NY: ${tc.nyTime?.day} ${String(tc.nyTime?.hour ?? "?").padStart(2, "0")}:00 | Session: ${tc.session?.name || "?"}${tc.session?.killzone ? " (KILLZONE)" : ""}`);
  lines.push(`- Tradeable: ${tc.tradeable ? "YES" : "NO"} | Multiplier: ${tc.multipliers?.combined ?? 1}`);
  if (tc.session?.character) lines.push(`- Session character: ${tc.session.character}`);
  if (tc.rules?.noTrade) lines.push(`- ⛔ No-trade rule: ${tc.rules.noTrade}`);
  if (tc.rules?.fridayRule) lines.push(`- ⛔ ${tc.rules.fridayRule}`);
  if (Array.isArray(tc.macroEvents) && tc.macroEvents.length) {
    lines.push(`- Macro events: ${tc.macroEvents.map((e) => (typeof e === "string" ? e : (e.title || e.name || JSON.stringify(e)))).join(" | ")}`);
  }
  const news = loadNews(root);
  if (Array.isArray(news) && news.length) {
    const highImpact = news.filter((e) => String(e.impact || "").toLowerCase() === "high");
    if (highImpact.length) {
      lines.push(`- ⚠️ High-impact news today: ${highImpact.map((e) => `${e.time || e.timeUtc || "?"} ${e.event || e.title || "event"}`).join(" | ")}`);
    } else {
      lines.push(`- News: ${news.length} event(s) scheduled, none high-impact`);
    }
  }
  lines.push("");

  // 2. Per-TF structure
  lines.push("## 2. MARKET STRUCTURE (per timeframe)");
  for (const tf of TFS) {
    const engPath = path.join(pairDir, `engine_${tf}.json`);
    const candlesPath = path.join(pairDir, `candles_${tf}.json`);
    const fcPath = path.join(pairDir, `forecast_${tf}.json`);
    const chunks = [];
    if (fs.existsSync(candlesPath)) {
      try {
        const cc = compactCandles(JSON.parse(fs.readFileSync(candlesPath, "utf8")));
        if (cc) chunks.push(`close ${cc.lastClose.toFixed(5)} | range100 ${cc.range100} | bars: ${cc.lastBars}`);
      } catch (_) {}
    }
    if (fs.existsSync(engPath)) {
      try {
        const ce = compactEngine(JSON.parse(fs.readFileSync(engPath, "utf8")));
        if (ce) {
          chunks.push(`bias ${ce.bias} (${ce.confidence}) | last ${ce.lastEvent} | swing ${ce.swingLow}→${ce.swingHigh}`);
          if (ce.liquidity.length) chunks.push(`liq: ${ce.liquidity.map((l) => `${l.t}@${l.p}${l.swept ? " (swept)" : ""}`).join(", ")}`);
          if (ce.orderBlocks.length) chunks.push(`OB: ${ce.orderBlocks.map((o) => `${o.kind} ${o.type} ${o.p}`).join(", ")}`);
          if (ce.fvgCount) chunks.push(`FVGs: ${ce.fvgCount}`);
          if (ce.inversionFvgs.length) chunks.push(`IFVG: ${ce.inversionFvgs.map((i) => i.p).join(", ")}`);
          if (ce.draw) chunks.push(`draw ${ce.draw.side} (${ce.draw.distance.toFixed ? ce.draw.distance.toFixed(4) : ce.draw.distance}) ${ce.draw.reason || ""}`);
          if (ce.pdZone) chunks.push(`zone ${ce.pdZone}`);
        }
      } catch (_) {}
    }
    if (fs.existsSync(fcPath)) {
      try {
        const cf = compactForecast(JSON.parse(fs.readFileSync(fcPath, "utf8")));
        if (cf && cf.medianEnd) chunks.push(`forecast ${cf.direction} → ${cf.medianEnd.toFixed(5)}`);
      } catch (_) {}
    }
    lines.push(`**${tf}:** ${chunks.join(" | ") || "(no data)"}`);
  }
  lines.push("");

  // 3. Lecture setups (time-window detectors) — L2/L1/L4 live state
  const setups = lectureSetupsSection(P, date, root);
  if (setups) {
    lines.push("## 3. LECTURE SETUPS (time-window)");
    lines.push(setups);
    lines.push("");
  }

  // 4. Open book & risk
  const ob = openBookSection(root);
  if (ob) {
    lines.push("## 4. OPEN BOOK & RISK");
    lines.push(ob);
    lines.push("");
  }

  // 5. Hourly candle scalp (ICT Gems) — from 07:00 NY
  const hc = hourlyScalpSection(P, date, root);
  if (hc) {
    lines.push("## 5. HOURLY CANDLE (SCALP — from 07:00 NY)");
    lines.push(hc);
    lines.push("");
  }

  // 6. Swing target map (ICT Gems) — daily bias/draw, 15m framework, 1m entry
  const stm = swingTargetSection(P, date, root);
  if (stm) {
    lines.push("## 6. SWING TARGET MAP");
    lines.push(stm);
    lines.push("");
  }

  // 7. Graded levels & tethering
  const graded = gradedLevelsSection(P, date, root);
  if (graded) {
    lines.push("## 7. GRADED LEVELS & TETHERING");
    lines.push(graded);
    lines.push("");
  }

  // 8. Stage outputs
  const stages = loadStageOutputs(P, root);
  if (stages) {
    lines.push("## 8. STAGE CONCLUSIONS");
    lines.push(stages);
    lines.push("");
  }

  // 9. Memory
  const mem = loadActiveLessons({ pair: P, limit: 8 });
  const memText = formatMemoryMarkdown(mem);
  lines.push("## 9. TRADE-GRAPH MEMORY");
  lines.push(memText || (mem?.error ? `[${mem.error}]` : "(none)"));
  lines.push("");

  // 10. Decision
  const dec = compactDecision(P, date, root);
  if (dec) {
    lines.push("## 10. EMITTED DECISION");
    lines.push("```json");
    lines.push(dec);
    lines.push("```");
    lines.push("");
  }

  // 11. Screenshot
  const shot = opts.screenshot || findScreenshot(P, date, root);
  if (shot) {
    lines.push("## 11. CHART");
    lines.push(`Screenshot: ${shot}`);
    lines.push("");
  }

  const brief = lines.join("\n");

  // Write
  if (!opts.noWrite) {
    try {
      fs.mkdirSync(pairDir, { recursive: true });
      fs.writeFileSync(briefPath, brief, "utf8");
    } catch (e) {
      return { error: `write failed: ${e.message}`, brief, path: briefPath };
    }
  }

  return { brief, path: briefPath, date, pair: P, chars: brief.length };
}

// ── CLI ────────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const pair = (args.find((a) => !a.startsWith("-")) || "").toUpperCase();
  const flag = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);

  if (!pair || args.includes("--help")) {
    console.log(`Usage: node tools/llm/market_brief.cjs <PAIR> [options]
  --date <YYYY-MM-DD>   shared date dir (default: today NY)
  --no-write            print only, do not write market_brief.md
  --compact             print only, shorter output
  --screenshot <path>   attach a chart screenshot reference`);
    return;
  }

  const noWrite = args.includes("--no-write") || args.includes("--compact");
  const res = buildBrief(pair, {
    date: flag("--date"),
    noWrite,
    screenshot: flag("--screenshot"),
  });

  if (res.error && !res.brief) {
    console.error(res.error);
    process.exit(1);
  }
  console.log(res.brief);
  if (!noWrite) console.error(`\n[market_brief] written → ${res.path} (${res.chars} chars)`);
}

// ── Exports ────────────────────────────────────────────────────────────────────

module.exports = { buildBrief, compactCandles, compactEngine, compactForecast, timeContext, gradedLevelsSection, lecture2Section, lecture1Section, lecture4Section, lectureSetupsSection, loadNews, openBookSection, hourlyScalpSection, swingTargetSection };

if (require.main === module) {
  main();
}