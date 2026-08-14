// operator_loop.cjs — PHASE 2: the autonomous ICT operator loop
//
// The LLM is the trader in the chair. Each cycle it:
//   1. PERCEIVES  — reads the market brief (tools/llm/market_brief.cjs)
//   2. REASONS    — acts as ICT: HYPOTHESIS → EVIDENCE → COUNTER-EVIDENCE → VERDICT
//   3. PROPOSES   — structured trade JSON or NO_TRADE (parsed strictly)
//   4. GATE       — deterministic supervisor approves or blocks (never skipped)
//   5. EXECUTES   — paper order via TV CDP when gate passes
//   6. VERIFIES   — confirms position appears
//   7. JOURNALS   — appends every step to the decision ledger (Phase 3)
//
// Deterministic gates ALWAYS have the final word. The LLM proposes; hard rules
// veto. Every step is written to shared/<DATE>/operator_ledger.jsonl and a
// per-pair operator_trace.md digest.
//
// Usage:
//   node tools/llm/operator_loop.cjs EURUSD --cycle            # one cycle, one pair
//   node tools/llm/operator_loop.cjs --all --cycle             # one cycle, all pairs
//   node tools/llm/operator_loop.cjs EURUSD                    # loop until Ctrl-C
//   node tools/llm/operator_loop.cjs EURUSD --dry-run          # no LLM, no execution — preview brief only
//   node tools/llm/operator_loop.cjs EURUSD --no-execute       # gate + journal, but never place an order

const path = require("path");
const fs = require("fs");
const { execSync, spawn } = require("child_process");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..", "..");
const { buildBrief } = require("./market_brief.cjs");
const { append, tracePair } = require("./ledger.cjs");
const { chatCompletion, safeJsonParse } = require("./llm_client.cjs");
const { COT_CHAIN } = require("./llm_prompts.cjs");
const { loadActiveLessons, formatMemoryMarkdown } = require("./memory_lessons.cjs");
const { computeSwingTarget, countModelPasses, SWING_TARGET_MODEL } = require("./swing_target.cjs");
require("./load_env.cjs").loadProjectEnv();

const ALL_PAIRS = ["XAUUSD", "GBPUSD", "EURUSD", "NAS100", "USDOLLAR"];
const { getNYDate } = require("../ny_time.cjs");
const CYCLE_ID = getNYDate() + "-" + String(Date.now()).slice(-6);

// ── NY Lunch Reversal (Prev-Day Carry-Forward) carve-out ──────────────────────
// cross_system_guard.cjs: NY_LUNCH is CAUTION (50% size, tighter confirmation),
// not a hard block, when the proposal is a carry-forward model backed by a real
// carried inefficiency from the prior day (ICT 2026 Lunch Reversal PDA).
const LUNCH_CARRY_MODELS = {
  ny_lunch_reversal_short: { kind: "BISI", side: "SHORT" },
  ny_lunch_reversal_long: { kind: "SIBI", side: "LONG" },
};

function carryContext(pair) {
  try {
    const p = path.join(ROOT, "shared", getNYDate(), pair, "prev_lunch_inefficiency.json");
    if (!fs.existsSync(p)) return null;
    const d = JSON.parse(fs.readFileSync(p, "utf8"));
    return d && d.found && d.inefficiency ? d : null;
  } catch (_) {
    return null;
  }
}

// Time-window models: legitimate ICT lecture setups that fire OUTSIDE the
// standard killzones. The pipeline's own detector (lecture2_setup.cjs) already
// time-gates to 07:00-08:00 NY and only reports setupReady on a real detected
// hunt + MSS + IFVG + entry zone. The gate waives the session block for these —
// nothing else is admitted outside a tradeable window.
const TIME_WINDOW_MODELS = {
  "london hunt + ifvg": { window: [7.0, 7.67], confFloor: 60, size: 1.0 },
  "08:30 liquidity raid model": { window: [8.0, 10.0], confFloor: 50, size: 1.0 },
  "ndog/nwog news model": { window: [8.5, 10.0], confFloor: 50, size: 1.0 },
};

// DST-aware current NY time as a decimal hour (e.g. 07:25 → 7.42). The --full
// ny_time context carries only the integer hour, so compute minutes locally.
function nyHourMin() {
  const [h, m] = new Date()
    .toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false, hour: "2-digit", minute: "2-digit" })
    .split(":");
  return Number(h) + Number(m) / 60;
}

// Hourly Candle Scalp (ICT Gems): the 15m is the bellwether, the daily is the
// bias, and hourly setups are executed on the 1m from the actual 07:00 hour
// onward. It is a knowledge-driven discipline — the LLM owns the decision, the
// gate owns the vetoes. To keep it daily-cadenced (not every 5-min cycle), the
// gate admits exactly ONE "hourly candle scalp" evaluation per NY hour per pair,
// persisted in the planner state so restarts cannot re-fire it either.
const HOURLY_SCALP_MODEL = "hourly candle scalp";

function hourlyScalpEvaled(pair, hour) {
  try {
    const { loadState } = require("./day_planner.cjs");
    const st = loadState();
    return st.hourlyScalp?.[getNYDate()]?.[pair] === hour;
  } catch (_) {
    return false;
  }
}

function markHourlyScalpEval(pair, hour) {
  try {
    const { loadState, saveState } = require("./day_planner.cjs");
    const st = loadState();
    const date = getNYDate();
    st.hourlyScalp = st.hourlyScalp || {};
    st.hourlyScalp[date] = st.hourlyScalp[date] || {};
    st.hourlyScalp[date][pair] = hour;
    saveState(st);
  } catch (_) {}
}

// ── Deterministic supervisor ───────────────────────────────────────────────────

const DOLLAR_CORRELATED = {
  EURUSD: ["GBPUSD", "USDOLLAR", "XAUUSD"],
  GBPUSD: ["EURUSD", "USDOLLAR", "XAUUSD"],
  USDOLLAR: ["EURUSD", "GBPUSD", "XAUUSD"],
  XAUUSD: ["EURUSD", "GBPUSD", "USDOLLAR"],
  NAS100: [],
};

function riskState() {
  try {
    const out = execSync(`node "${path.join(ROOT, "tools", "risk_tracker.cjs")}" --check`, {
      encoding: "utf8", timeout: 15000, windowsHide: true,
    });
    return JSON.parse(out.trim());
  } catch (_) {
    return { allowed: true, reason: "risk_tracker unavailable — treated as unknown", openPositions: 0 };
  }
}

function timeContext() {
  try {
    const out = execSync(`node "${path.join(ROOT, "tools", "ny_time.cjs")}" --full`, {
      encoding: "utf8", timeout: 15000, windowsHide: true,
    });
    return JSON.parse(out);
  } catch (_) {
    return { tradeable: false, session: { name: "unknown" }, rules: {} };
  }
}

function loadOpenPositions() {
  try {
    const log = JSON.parse(fs.readFileSync(path.join(ROOT, "shared", "trade_log.json"), "utf8"));
    return (Array.isArray(log) ? log : []).filter((t) => t.status === "OPEN");
  } catch (_) {
    return [];
  }
}

function todayEvents() {
  for (const f of ["today_events.json", path.join("shared", "today_events.json")]) {
    const p = path.join(ROOT, f);
    if (fs.existsSync(p)) {
      try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (_) {}
    }
  }
  return [];
}

/**
 * Deterministic gate — ALWAYS the final word. Returns { verdict, reasons, canExecute, rr, sizeMultiplier, notes }.
 * @param {Object} proposal - parsed LLM proposal
 * @param {Object} ctx      - { pair, tc }
 */
function gate(proposal, ctx) {
  const reasons = [];
  const notes = [];
  const tc = ctx.tc;

  if (proposal.action !== "TRADE") {
    return { verdict: "NO_TRADE_PROPOSAL", reasons: [`proposal action = ${proposal.action}`], canExecute: false };
  }

  // NY Lunch carve-out: a carry-forward model (backed by a real carried prior-day
  // lunch inefficiency, correct side) is the ONLY lunch entry permitted — at 50%
  // size and with tighter (60+) confidence. Everything else stays blocked.
  const inLunch = tc.session?.name === "nyLunch" || (tc.nyTime?.hour >= 11 && tc.nyTime?.hour < 13);
  const model = String(proposal.model || "").toLowerCase();
  const lunchSpec = inLunch ? LUNCH_CARRY_MODELS[model] : null;
  const lunchCarveout = !!lunchSpec &&
    carryContext(ctx.pair)?.inefficiency?.kind === lunchSpec.kind &&
    String(proposal.side || "").toUpperCase() === lunchSpec.side;

  // Lecture 2 (London Hunt + IFVG) carve-out: model + time-window gated. The
  // brief's Lecture 2 section surfaces the live detector state (London H/L,
  // hunt, MSS, IFVG CE, SL, Fib TPs) so the LLM only proposes it when real.
  const tNow = nyHourMin();
  const modelSpec = TIME_WINDOW_MODELS[model];
  const windowCarveout = !!modelSpec && tNow >= modelSpec.window[0] && tNow <= modelSpec.window[1];
  const carveout = lunchCarveout || windowCarveout;

  // Hourly Candle Scalp cadence: one evaluation per NY hour per pair.
  const hourlyScalp = model === HOURLY_SCALP_MODEL;
  const nyHour = tc.nyTime?.hour;
  if (hourlyScalp && Number.isInteger(nyHour)) {
    if (hourlyScalpEvaled(ctx.pair, nyHour)) {
      reasons.push(`hourly candle scalp already evaluated for ${ctx.pair} this NY hour (${String(nyHour).padStart(2, "0")}:00) — one eval per hour per pair`);
    } else {
      markHourlyScalpEval(ctx.pair, nyHour);
    }
  }

  // Swing Target (Multi-Setup): "the precision element is only beneficial if you
  // have all the other narrative" — require the brief's qualification floor
  // (>=3/4 boxes) and the lesson's cadence (max 2 morning + 2 afternoon).
  const swingTarget = model === SWING_TARGET_MODEL;
  if (swingTarget) {
    const sRoot = ctx.root || ROOT;
    const st = computeSwingTarget(ctx.pair, getNYDate(), sRoot);
    if (!st || !st.qualification) {
      reasons.push(`swing target map unavailable for ${ctx.pair}`);
    } else if (!st.qualification.qualified) {
      reasons.push(`swing target qualification ${st.qualification.boxes}/${st.qualification.total} < 3 (needs displacement + swing break + FVG retest + opening-price side)`);
    }
    const counts = countModelPasses(ctx.pair, SWING_TARGET_MODEL, getNYDate(), sRoot);
    const part = Number.isInteger(nyHour) ? (nyHour < 12 ? "morning" : "afternoon") : null;
    if (part && counts[part] >= 2) {
      reasons.push(`swing target cadence: ${counts[part]} ${part} trades already (max 2 per session part)`);
    }
  }

  // Time-window models are ONLY valid in their window — even inside a tradeable
  // session, "London Hunt + IFVG" at 08:30 is rejected (the window ended 07:40).
  if (modelSpec && !windowCarveout) {
    reasons.push(`time-window model "${proposal.model}" outside its ${modelSpec.window[0].toFixed(2)}-${modelSpec.window[1].toFixed(2)} NY window (now ${tNow.toFixed(2)})`);
  }

  // 1. Session / killzone
  if (!tc.tradeable && !carveout) {
    reasons.push(`session not tradeable (${tc.session?.name || "unknown"}, tradeable=${tc.tradeable})`);
  }
  if (tc.rules?.noTrade && !carveout) reasons.push(`no-trade rule: ${tc.rules.noTrade}`);
  if (tc.rules?.fridayRule) reasons.push(tc.rules.fridayRule);

  // 2. Structural sanity
  const side = String(proposal.side || "").toUpperCase();
  const entry = Number(proposal.entry);
  const sl = Number(proposal.sl);
  const tp = Number(proposal.tp);
  if (!["LONG", "SHORT"].includes(side)) reasons.push(`invalid side "${side}"`);
  if (![entry, sl, tp].every((n) => Number.isFinite(n) && n > 0)) reasons.push("entry/SL/TP must be positive numbers");
  else if (side === "LONG" && !(sl < entry && tp > entry)) reasons.push("LONG requires SL < entry < TP");
  else if (side === "SHORT" && !(sl > entry && tp < entry)) reasons.push("SHORT requires SL > entry > TP");

  // 3. R:R
  const riskDist = Math.abs(entry - sl);
  const reward = Math.abs(tp - entry);
  const rr = riskDist > 0 ? reward / riskDist : 0;
  if (riskDist <= 0) reasons.push("zero risk distance");
  else if (rr < 1.0) reasons.push(`R:R ${rr.toFixed(2)} < 1.0`);

  // 4. Risk tracker (daily/weekly loss, drawdown)
  const rsk = riskState();
  if (rsk.allowed === false) reasons.push(`risk gate: ${rsk.reason}`);
  if (rsk.openPositions >= 2) reasons.push(`max 2 open positions (${rsk.openPositions} open)`);

  // 5. Correlation — never double up on the dollar
  const open = loadOpenPositions();
  const correlated = DOLLAR_CORRELATED[ctx.pair] || [];
  const clash = open.find((o) => correlated.includes(o.pair));
  if (clash) reasons.push(`correlated exposure — ${clash.pair} already open (${clash.direction})`);

  // 6. News gate — high-impact within 30 min
  const events = todayEvents();
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  for (const ev of events) {
    const evTime = ev.time || ev.timeUtc || ev.startTime || "";
    const m = String(evTime).match(/(\d{1,2}):(\d{2})/);
    if (m && ev.impact === "High") {
      const evMin = Number(m[1]) * 60 + Number(m[2]);
      const diff = Math.abs(evMin - nowMin);
      if (diff <= 30) reasons.push(`high-impact ${ev.event || ev.title || "event"} @ ${evTime} within 30 min`);
    }
  }

  // 7. Confidence — carry-forward/time-window models need tighter confirmation
  const conf = Number(proposal.confidence);
  const minConf = lunchCarveout ? 60 : windowCarveout ? (modelSpec.confFloor || 60) : hourlyScalp || swingTarget ? 55 : 50;
  if (!Number.isFinite(conf) || conf < minConf) {
    reasons.push(`confidence ${conf} < ${minConf}${carveout ? " (time-window model requires tighter confirmation)" : ""}`);
  }

  const sizeMultiplier = lunchCarveout ? 0.5 : windowCarveout ? modelSpec.size : 1;
  if (lunchCarveout) {
    notes.push(`lunch carry-forward carve-out: ${model} at 50% size — prior-day ${carryContext(ctx.pair).inefficiency.kind} carried`);
  }
  if (windowCarveout) {
    const mm = (v) => `${String(Math.floor(v)).padStart(2, "0")}:${String(Math.round((v % 1) * 60)).padStart(2, "0")}`;
    notes.push(`time-window carve-out: ${proposal.model} in its ${mm(modelSpec.window[0])}-${mm(modelSpec.window[1])} NY window — size ${modelSpec.size}x, confidence >= ${modelSpec.confFloor}`);
  }
  if (hourlyScalp) {
    notes.push(`hourly candle scalp — 15m bellwether + daily bias + 1m entry (from 07:00 NY); one eval per hour per pair, confidence >= 55`);
  }
  if (swingTarget) {
    notes.push(`swing target (multi-setup) — daily bias/draw + 15m framework + 1m precision entry; qualification >= 3/4; cadence 2 morning / 2 afternoon, confidence >= 55`);
  }

  const verdict = reasons.length === 0 ? "PASS" : "BLOCKED";
  return { verdict, reasons, notes, canExecute: verdict === "PASS", rr, sizeMultiplier };
}

// ── Position sizing (paper) ────────────────────────────────────────────────────

function sizeQty(proposal, pair) {
  const riskAmount = 100; // 1% of $10k
  const riskDist = Math.abs(Number(proposal.entry) - Number(proposal.sl));
  if (riskDist <= 0) return 0;
  if (pair === "NAS100") {
    const perPoint = 1;
    return Math.max(1, Math.round(riskAmount / (riskDist * 100 * perPoint)));
  }
  if (pair === "USDOLLAR") return 10000;
  if (pair === "XAUUSD") return Math.max(100, Math.round((riskAmount / (riskDist * 10000)) * 100));
  const perPip = 10; // $10/pip standard lot on fx
  const pips = riskDist * 10000;
  const lots = riskAmount / (pips * perPip);
  if (lots >= 0.1) return Math.round(lots * 100);
  return Math.max(100, Math.round(lots * 1000));
}

// ── Execute via TV CDP ─────────────────────────────────────────────────────────

function run(cmd, timeoutMs = 30000) {
  try {
    return execSync(cmd, { encoding: "utf8", timeout: timeoutMs, windowsHide: true });
  } catch (e) {
    return null;
  }
}

async function executeOrder(proposal, ctx) {
  const side = String(proposal.side).toUpperCase();
  const pair = ctx.pair;
  const qty = ctx.qty;
  const sl = Number(proposal.sl).toFixed(5);
  const tp = Number(proposal.tp).toFixed(5);
  const cmd = `node "${path.join(ROOT, "tools", "tv-mcp", "market_order.cjs")}" ${pair} ${side} ${sl} ${tp} ${qty}`;
  await append("execution", { pair, cycleId: CYCLE_ID, status: "attempting", detail: cmd, side, entry: proposal.entry, sl, tp, qty });
  const out = run(cmd, 30000);
  if (!out) {
    await append("execution", { pair, cycleId: CYCLE_ID, status: "failed", detail: "market_order.cjs returned null (TV CDP busy?)" });
    return { status: "failed" };
  }
  await append("execution", { pair, cycleId: CYCLE_ID, status: "placed", detail: out.trim().slice(0, 300) });
  return { status: "placed", out };
}

async function verifyOrder(pair) {
  const out = run(`node "${path.join(ROOT, "tools", "tv-mcp", "check_orders.cjs")}"`, 20000);
  const verified = !!out && !/no positions|none|error/i.test(out);
  await append("verification", { pair, cycleId: CYCLE_ID, verified, detail: out ? out.trim().slice(0, 300) : "no output" });
  return { verified, out };
}

// ── LLM propose (the ICT operator) ─────────────────────────────────────────────

function buildOperatorPrompt(brief, memoryText) {
  const systemPrompt = `You are ICT (Inner Circle Trader) acting as the lead operator of a trading desk. You make trading decisions, and a deterministic supervisor enforces hard risk rules after you. You never place an order directly.

${COT_CHAIN}

You are given a MARKET BRIEF: a structured read of time/session, per-timeframe market structure, liquidity pools, PD arrays, forecasts, stage conclusions, and your own trade-graph memory.

DECIDE LIKE A DISCIPLINED ICT TRADER:
- Higher-timeframe context beats lower-timeframe noise. Never trade against a clear HTF bias.
- Trade only in killzones unless a setup is exceptional. No entries in Asia, no NY Lunch entries — EXCEPT the NY Lunch Reversal carry-forward models (ny_lunch_reversal_short/long) when the brief shows a carried prior-day lunch inefficiency; those are permitted at 50% size with tighter confirmation (confidence >= 60). EXCEPT also the Lecture 2 window (07:00-07:40 NY): the "London Hunt + IFVG" model is permitted there when the brief's Lecture 2 section shows SETUP READY, at full size with confidence >= 60. The gate enforces this.
- SL is structural invalidation (swing + ATR buffer) — never a liquidity pool. Liquidity pools are TARGETS.
- Entry needs displacement + MSS/CHoCH + FVG/OB retest. Wait for candle close.
- If conditions are unclear or confluence is weak, say NO_TRADE. Never force a trade.
- Prefer scalping setups in their windows (Silver Bullet 10:00-11:00 / 14:00-15:00 NY), trend-following otherwise.

GRADED-LEVEL PRIORITY (from the brief's "GRADED LEVELS & TETHERING" section):
- A PD array is only high-probability when tethered to a graded level: the 7-9AM range's CE/quadrants/octants, or the daily/weekly anchors (PDH/PDL/Prev-Day CE/PWH/PWL). Weight it: >=3 tethered = x1.3, >=1 = x1.1, none = x0.9.
- Prefer entries at a graded level that coincides with a liquidity sweep + displacement — the graded CE/octants are the day's algorithmic anchors. Untethered mid-range arrays are weak; downgrade them.
- Use the ORG: a FILLED gap has drawn through — target the -0.5/-1.0 ORG projections. An OPEN gap is the draw. Inversion FVGs near the ORG CE are the highest-quality retracement zones.
- Fold the Composite Confidence adjustment (tether boost + body/wick) into your "confidence" field.

HOURLY CANDLE SCALP (ICT Gems — from the brief's "HOURLY CANDLE" section):
- Hierarchy: the 15m is the BELLWETHER, the DAILY is the BIAS, and hourly setups are executed on the 1m, starting from the actual 07:00 hour.
- Evaluate hours only from 07:00 NY onward, only in tradeable (killzone) hours, and only in the direction of the daily bias. No indicators — time + price only.
- The 15m must confirm first: a liquidity sweep + MSS/CHoCH on the 15m tells you which way the hour resolves.
- Entry: a 1m FVG/OB CE inside the current hour's context (the hourly range/order block). SL: beyond the hourly extreme. TP: opposing liquidity (prior hour high/low or the session target).
- Use model name "Hourly Candle Scalp" with confidence >= 55. The gate admits only ONE evaluation per NY hour per pair — so make it count. Never re-propose the same hourly setup within the same hour.

SWING TARGET / MULTI-SETUP SESSION (ICT Gems — from the brief's "SWING TARGET MAP"):
- Timeframe ladder: the DAILY is the BIAS and the DRAW (the majority of your analysis is framed on the daily — where is expansion likely to take price). The 15m is the FRAMEWORK: judge the setup on the 15m, NOT the 5m — the 5m never looks clean, that is normal. The HOURLY is where the daily OB and swing projections show up in time. The 1m is the PRECISION ENTRY: the micro imbalance/FVG that prints right after a short-term low is broken with displacement.
- Entry sequence: displacement + broken short-term low (the fulcrum) → retest of the fresh 1m FVG → entry; TP1 = the fulcrum / short-term low (the liquidity), TP2 = the daily OB. Aim for the liquidity.
- Only use the model "Swing Target (Multi-Setup)" when the brief shows qualification >= 3/4 boxes (displacement, swing break, FVG retest, opening-price side) — the precision element is only beneficial with the full narrative. Confidence >= 55.
- Cadence: 2-3 setups in the morning (9:30 NY open), at most 2 morning + 2 afternoon per pair — the gate enforces it. Setups repeat like buses on a schedule: never force one, never chase a missed one. No new entries in the lunch hour.

RESPOND WITH ONLY A SINGLE JSON OBJECT (no markdown fences, no prose, keep every prose field to ONE short sentence):
{
  "action": "TRADE" | "NO_TRADE" | "MONITOR",
  "side": "LONG" | "SHORT",
  "entry": <number, precise trigger price>,
  "sl": <number, structural invalidation level>,
  "tp": <number, target at opposing liquidity>,
  "model": "<entry model name>",
  "confidence": <integer 0-100>,
  "hypothesis": "<one sentence>",
  "evidence": "<specific levels/timeframes from the brief>",
  "counterEvidence": "<strongest case against this trade, or 'none found'>",
  "verdict": "<one-sentence decision>",
  "riskNote": "<specific risk factor>"
}
If you decide NO_TRADE or MONITOR, still return the JSON with only action + verdict + evidence filled.

GROUND RULES:
- Cite specific prices/timeframes from the brief in evidence/counterEvidence.
- Never invent levels not present in the brief.
- A missing counter-evidence scan is a failed answer.`;

  return [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `## MARKET BRIEF\n${brief}\n\n${memoryText ? `## YOUR TRADE-GRAPH MEMORY\n${memoryText}` : ""}\n\nDecide. Respond with the JSON object only.`,
    },
  ];
}

async function propose(brief, pair) {
  const mem = loadActiveLessons({ pair, limit: 6 });
  const memoryText = formatMemoryMarkdown(mem);
  const messages = buildOperatorPrompt(brief, memoryText);

  const fallbackProviders = ["gemini"];
  let lastError = "";

  for (let attempt = 0; attempt < 3; attempt++) {
    const provider = attempt === 0 ? undefined : fallbackProviders[attempt - 1];
    try {
      const resp = await chatCompletion(messages, { provider, maxTokens: 2000, temperature: 0.2, timeout: 120000 });
      if (resp.text.startsWith("[LLM")) {
        lastError = resp.text;
        await append("error", { pair, cycleId: CYCLE_ID, message: resp.text });
        continue;
      }
      // Free-tier reasoning models occasionally return the answer only in
      // reasoning_content with empty content. Fall back to it.
      const raw = resp.text || resp.rawMessage?.reasoning_content || "";
      const parsed = safeJsonParse(raw, null);
      if (parsed && parsed.action) {
        return { ...parsed, raw, provider: resp.provider, model: resp.model };
      }
      // Strict recovery: re-ask for ONLY the JSON at temperature 0. Long
      // reasoning can truncate the payload; a tight re-ask fits in budget.
      lastError = "proposal not JSON — " + raw.slice(0, 200);
      await append("error", { pair, cycleId: CYCLE_ID, message: `${provider || "default"}: ${lastError}` });
      const retryResp = await chatCompletion(
        [
          ...messages,
          { role: "user", content: 'Your previous response was truncated. Return ONLY a single valid JSON object now — no markdown fences, no prose, every prose field ONE short sentence: {"action":"TRADE"|"NO_TRADE"|"MONITOR","side":"LONG"|"SHORT","entry":0,"sl":0,"tp":0,"model":"","confidence":0,"hypothesis":"","evidence":"","counterEvidence":"","verdict":"","riskNote":""}' },
        ],
        { provider, maxTokens: 800, temperature: 0, timeout: 90000 },
      );
      const retryRaw = retryResp.text || retryResp.rawMessage?.reasoning_content || "";
      const retryParsed = safeJsonParse(retryRaw, null);
      if (retryParsed && retryParsed.action) {
        return { ...retryParsed, raw: retryRaw, provider: retryResp.provider, model: retryResp.model, recovered: true };
      }
      lastError = "strict re-ask failed — " + retryRaw.slice(0, 200);
      await append("error", { pair, cycleId: CYCLE_ID, message: `${provider || "default"}: ${lastError}` });
    } catch (e) {
      lastError = e.message;
      await append("error", { pair, cycleId: CYCLE_ID, message: e.message });
    }
  }
  return { action: "NO_TRADE", error: lastError };
}

// ── One cycle for one pair ─────────────────────────────────────────────────────

async function cyclePair(pair, opts) {
  await append("cycle_start", { pair, cycleId: CYCLE_ID, reason: "cycle scan" });

  const briefRes = buildBrief(pair, { noWrite: false });
  if (briefRes.error && !briefRes.brief) {
    await append("error", { pair, cycleId: CYCLE_ID, message: "brief build failed: " + briefRes.error });
    return;
  }
  await append("brief", { pair, cycleId: CYCLE_ID, chars: briefRes.chars, path: briefRes.path });

  if (opts.dryRun) {
    await append("proposal", { pair, cycleId: CYCLE_ID, action: "DRY_RUN" });
    return;
  }

  // Planner PAUSE phase — dead zones (Asia, post-close). No LLM call; the brief
  // is still built so data stays readable, but tokens are not spent on a
  // proposal the deterministic gate would veto anyway.
  if (opts.skipLLM) {
    await append("journal", { pair, cycleId: CYCLE_ID, verdict: "MONITOR", summary: "planner PAUSE — no LLM call (dead zone)" });
    return;
  }

  const proposal = await propose(briefRes.brief, pair);
  await append("proposal", { pair, cycleId: CYCLE_ID, proposal });

  if (proposal.action !== "TRADE") {
    await append("journal", { pair, cycleId: CYCLE_ID, verdict: proposal.action, summary: proposal.verdict || proposal.reason || "" });
    return;
  }

  const tc = timeContext();
  const g = gate(proposal, { pair, tc });
  await append("gate", { pair, cycleId: CYCLE_ID, verdict: g.verdict, reasons: g.reasons, notes: g.notes, rr: g.rr, sizeMultiplier: g.sizeMultiplier, proposal: { side: proposal.side, entry: proposal.entry, sl: proposal.sl, tp: proposal.tp, model: proposal.model, confidence: proposal.confidence } });

  if (!g.canExecute || opts.noExecute) {
    await append("journal", {
      pair, cycleId: CYCLE_ID, verdict: g.verdict,
      summary: `proposal BLOCKED${opts.noExecute ? " (no-execute mode)" : ""}: ${g.reasons.join("; ") || "gate denied"}`,
      proposal,
    });
    return;
  }

  const qty = Math.round(sizeQty(proposal, pair) * (g.sizeMultiplier || 1));
  const exec = await executeOrder(proposal, { pair, qty });
  if (exec.status === "placed") {
    await new Promise((r) => setTimeout(r, 5000));
    await verifyOrder(pair);
  }
  await append("journal", {
    pair, cycleId: CYCLE_ID, verdict: g.verdict,
    summary: `${proposal.side} ${pair} @ ${proposal.entry} SL ${proposal.sl} TP ${proposal.tp} | ${proposal.model} | qty ${qty} | ${exec.status}`,
    proposal,
  });
}

// ── Day-planner (PHASE 6) ─────────────────────────────────────────────────────
// Scheduled actions run once per day via child process. They PUSH data into the
// workspace (session_start re-fetches candles + engines + forecasts) so the
// briefs the loop reads are fresh and the 7-9AM / lunch / ORG levels populate.

function runCmd(scriptArgs, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, scriptArgs, { windowsHide: true });
    let out = "", err = "", done = false;
    const timer = setTimeout(() => {
      if (!done) { done = true; child.kill(); resolve({ ok: false, out, err: "timeout" }); }
    }, timeoutMs || 120000);
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", (e) => { if (!done) { done = true; clearTimeout(timer); resolve({ ok: false, out, err: e.message }); } });
    child.on("close", (code) => { if (!done) { done = true; clearTimeout(timer); resolve({ ok: code === 0, code, out, err }); } });
  });
}

async function runPlannerAction(id, spec) {
  if (!spec) return;
  if (id === "close_check") {
    const open = loadOpenPositions();
    const detail = open.length === 0
      ? "no open positions at NY close"
      : `${open.length} OPEN position(s): ${open.map((o) => `${o.pair} ${o.direction}`).join(", ")}`;
    await append("planner", { pair: "ALL", cycleId: CYCLE_ID, action: id, status: open.length ? "warning" : "ok", detail });
    return;
  }
  const r = await runCmd([path.join(ROOT, ...spec.script)], spec.timeoutMs);
  await append("planner", {
    pair: "ALL", cycleId: CYCLE_ID, action: id,
    status: r.ok ? "ok" : "failed",
    detail: `${spec.label}: ${r.ok ? `OK${r.code === 0 ? "" : " (exit " + r.code + ")"}` : "FAILED — " + (r.err || "timeout").slice(0, 200)}`,
  });
  console.error(`[planner] ${id}: ${r.ok ? "OK" : "FAILED"} — ${(r.out || r.err || "").slice(-140).trim()}`);
}

function printDayPlan() {
  const { DAY_PLAN, nyNow, planAt } = require("./day_planner.cjs");
  console.log("\n═══ OPERATOR DAY PLAN (NY time) ═══");
  for (const w of DAY_PLAN) {
    const acts = (w.actions || []).map((a) => `${a.id}@${a.at.toFixed(2)}`).join(", ") || "—";
    console.log(`  ${String(w.window[0]).padStart(2, "0")}:00-${String(w.window[1]).padStart(2, "0")}:00  ${w.phase.padEnd(8)} ${w.label.padEnd(34)} every ${String(w.scanMin).padStart(2)}m  ${acts}`);
  }
  const n = nyNow();
  const cur = planAt(n.hour, n.minute);
  console.log(`\n  NOW ${String(n.hour).padStart(2, "0")}:${String(n.minute).padStart(2, "0")} → ${cur.phase} (${cur.label}) | every ${cur.scanMin}m | due: ${cur.dueActions.join(", ") || "—"}`);
}

// ── CLI ────────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const pairArg = args.find((a) => !a.startsWith("-") && a.toUpperCase() !== "ALL");
  const pairs = pairArg ? [pairArg.toUpperCase()] : args.includes("--all") ? ALL_PAIRS : [];
  const opts = { dryRun: args.includes("--dry-run"), noExecute: args.includes("--no-execute") };
  const planner = !args.includes("--cycle") && !args.includes("--dry-run");

  if (args.includes("--plan")) {
    printDayPlan();
    return;
  }

  if (pairs.length === 0) {
    console.log(`Usage: node tools/llm/operator_loop.cjs <PAIR|--all> [options]
  --cycle         run exactly one cycle, then exit
  --dry-run       build brief only (no LLM, no execution)
  --no-execute    run LLM + gate but never place an order
  --plan          print the DAY_PLAN table and current slot, then exit`);
    return;
  }

  if (opts.dryRun) {
    for (const p of pairs) {
      await append("cycle_start", { pair: p, cycleId: CYCLE_ID, reason: "dry-run" });
      const r = buildBrief(p, { noWrite: false });
      await append("brief", { pair: p, cycleId: CYCLE_ID, chars: r.chars, path: r.path });
      console.log(`[dry-run] ${p}: brief ${r.chars} chars → ${r.path}`);
    }
    tracePair(pairs[0]);
    return;
  }

  const { nyNow, planAt, loadState, saveState, alreadyRan, ACTIONS } = require("./day_planner.cjs");
  let state = loadState();

  do {
    const date = getNYDate();
    if (state.date !== date) state = { date, actions: {} };

    const n = nyNow();
    const plan = planAt(n.hour, n.minute);

    // Run due one-shot actions first (they push fresh data), then scan. A heavy
    // action pauses pair scanning for that iteration.
    let ranAction = false;
    if (planner) {
      for (const id of plan.dueActions) {
        if (alreadyRan(state, date, id)) continue;
        state.actions[id] = new Date().toISOString();
        saveState(state);
        await runPlannerAction(id, ACTIONS[id]);
        ranAction = true;
      }
    }

    if (!ranAction) {
      for (const p of pairs) {
        try {
          // No LLM calls in dead zones / pre-session formation (PAUSE, PREP, LOCK
          // 7-8AM) — nothing is tradeable and the gate would veto every proposal.
          // Active killzones, lunch (carry-forward) and close still call the LLM.
          await cyclePair(p, { ...opts, skipLLM: ["PAUSE", "PREP", "LOCK"].includes(plan.phase) });
        } catch (e) {
          await append("error", { pair: p, cycleId: CYCLE_ID, message: "cyclePair: " + e.message });
        }
      }
    }
    for (const p of pairs) tracePair(p);
    if (args.includes("--cycle")) return;

    await new Promise((r) => setTimeout(r, plan.scanMin * 60 * 1000));
  } while (true);
}

if (require.main === module) {
  main().catch((e) => {
    console.error("operator_loop fatal:", e.message);
    process.exit(1);
  });
}

module.exports = { gate, sizeQty, buildOperatorPrompt, cyclePair };