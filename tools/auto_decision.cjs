// Shared auto-trade gate — consumes decision.json emitted by run_pair.cjs.
// Both auto-traders (autonomous_session.cjs, ny_am_autonomous.cjs) MUST pass
// this gate before placing an order. market_order.cjs itself stays raw.
//
// Usage (CLI):
//   node tools/auto_decision.cjs XAUUSD [--strict]
//     → prints JSON { allowed, reasons[], decision } , exit 0/1
//
// Usage (import):
//   const autoDecision = require("../auto_decision.cjs");
//   const gate = autoDecision.gate(pair, { strict: true });
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..");

function loadDecision(pair) {
  const dir = pair === "XAUUSD" ? "GOLD" : pair; // XAUUSD data lives in GOLD/
  const date = require("./ny_time.cjs").getNYDate();
  const candidates = [
    path.join(ROOT, "shared", date, dir, "decision.json"),
    path.join(ROOT, "shared", date, pair, "decision.json"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        const raw = fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "");
        return { file: p, data: JSON.parse(raw) };
      }
      catch { continue; }
    }
  }
  return null;
}

const MAX_AGE_MS = 15 * 60 * 1000; // decision must be < 15 min old

function gate(pair, opts = {}) {
  const strict = !!opts.strict;
  const reasons = [];

  const loaded = loadDecision(pair);
  if (!loaded) {
    return { allowed: false, reasons: ["No decision.json — run run_pair.cjs first"], decision: null };
  }
  const { file, data } = loaded;
  const d = data;

  // Missed-entry second chance — if the pipeline flagged allowSecondaryEntry, the
  // operative levels are the tightened tethered-array levels from missed_entry.cjs,
  // NOT the original (now-passed) entry. The gate consumes those instead.
  const me = d.missedEntry;
  const secondChance = !!(me && me.allowSecondaryEntry && me.secondaryEntry);
  const sec = secondChance ? me.secondaryEntry : null;
  const operative = secondChance
    ? {
        kind: "SECONDARY",
        side: sec.originalIdea?.direction || d.entry?.type,
        entry: sec.entry,
        sl: sec.sl,
        tp1: sec.tp1,
        sizeMultiplier: sec.sizeMultiplier || 0.5,
      }
    : {
        kind: "PRIMARY",
        side: d.entry?.type,
        entry: d.entry?.price,
        sl: d.entry?.sl,
        tp1: d.entry?.tp1,
        sizeMultiplier: 1,
      };

  // Freshness
  const ageMs = Date.now() - fs.statSync(file).mtimeMs;
  if (ageMs > MAX_AGE_MS) {
    reasons.push(`decision stale (${Math.round(ageMs / 60000)}m > ${MAX_AGE_MS / 60000}m)`);
  }

  // Registry — setup must be complete
  if (d.registry?.verdict !== "SETUP COMPLETE") {
    reasons.push(`registry: ${d.registry?.verdict || "missing"} (need SETUP COMPLETE)`);
  }
  if (!d.registry?.primary) {
    reasons.push("registry: no primary model");
  }

  // Entry — must be a real LONG/SHORT with levels (operative = original or second-chance)
  if (operative.side !== "LONG" && operative.side !== "SHORT") {
    reasons.push(`entry: ${operative.side || "missing"}`);
  }
  if (!(operative.entry > 0) || !(operative.sl > 0) || !(operative.tp1 > 0)) {
    reasons.push("entry: missing/invalid price/SL/TP1");
  }
  if (d.entry?.noDrawDir) {
    reasons.push(`entry: no draw on liquidity (${d.entry.noDrawDir})`);
  }

  // R:R — recomputed on the operative entry/SL/TP (second-chance SL is tightened,
  // so R:R is measured on the levels the auto-trader will actually place).
  // Intraday setups (15m/1H swings) may run as low as 0.75:1 — the cascading SL
  // in run_pair.cjs already validated this is the tightest structural level with
  // a definable draw. Swing setups (4H/1D) still require ≥ 1:1.
  const risk = Math.abs(operative.entry - operative.sl);
  const reward = Math.abs(operative.tp1 - operative.entry);
  const operativeRR = risk > 0 ? reward / risk : 0;
  const minRR = d.entry?.slReason?.includes('15m Swing') || d.entry?.slReason?.includes('1H Swing') ? 0.75 : 1.0;
  if (!(operativeRR >= minRR)) {
    reasons.push(`R:R ${operativeRR.toFixed(2) ?? "?"}:1 < ${minRR}:1`);
  }

  // Coherence / invalidation — invalidation alone is NOT a hard block.
  // The invalidation module flags structural/time/model warnings that are
  // already factored into the guard's size multiplier. Only block when the
  // guard ALSO has hard blocks (structural failure, off-hours, lunch, etc.).
  const invalidationBlocked = d.invalidation?.status === "INVALIDATED" && (d.guard?.blocked > 0);
  if (invalidationBlocked) {
    reasons.push(`invalidation: ${d.invalidation.status} + guard blocked`);
  }
  if (strict && (d.coherence?.unified ?? 0) < 60) {
    reasons.push(`coherence ${d.coherence?.unified ?? "?"}/100 < 60`);
  }

  // Cross-system guard — hard blocks (NY_LUNCH, OFF_HOURS, etc.)
  if (d.guard?.blocked > 0) {
    reasons.push(`guard BLOCKED: ${(d.guard.blockedIds || []).join(", ") || "multiple"}`);
  }

  // Freshness score
  if ((d.freshness?.score ?? 0) < 5) {
    reasons.push(`freshness ${d.freshness?.score ?? "?"}/10 < 5`);
  }

  // Risk gate
  if (d.risk?.allowed === false) {
    reasons.push(`risk: ${d.risk.reason || "blocked"}`);
  }

  // WP-15: Position limit enforcement — max 2 open positions (risk_parameters.md).
  // The risk tracker reports open count but didn't block. This gate does.
  try {
    const tradeLogPath = path.join(ROOT, "shared", "trade_log.json");
    if (fs.existsSync(tradeLogPath)) {
      const trades = JSON.parse(fs.readFileSync(tradeLogPath, "utf8"));
      const openPositions = (Array.isArray(trades) ? trades : []).filter(t => t.status === "OPEN");
      if (openPositions.length >= 2) {
        reasons.push(`position limit: ${openPositions.length} already open (max 2)`);
      }
    }
  } catch { /* trade log unavailable — skip position check */ }

  // WP-15: News calendar gate — block trades within 30 min of high-impact events.
  // ICT One Shot One Kill: no entries near red-folder news unless it's a deliberate
  // news trade (which uses a separate path via tv-mcp/news_trade.cjs).
  try {
    const todayEventsPath = path.join(ROOT, "shared", date, "today_events.json");
    let events = null;
    if (fs.existsSync(todayEventsPath)) {
      events = JSON.parse(fs.readFileSync(todayEventsPath, "utf8"));
    } else {
      // Try to fetch events on-demand (cached for the day)
      try {
        const pyOut = execSync(`python "${path.join(ROOT, "tools", "economic_calendar.py")}" --today-only --output "${todayEventsPath}"`, {
          timeout: 15000, stdio: ["ignore", "pipe", "ignore"], encoding: "utf8",
        });
        if (fs.existsSync(todayEventsPath)) {
          events = JSON.parse(fs.readFileSync(todayEventsPath, "utf8"));
        }
      } catch { /* calendar fetch failed — skip news gate */ }
    }
    if (events && Array.isArray(events)) {
      const now = new Date();
      const nowNY = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
      const nowMin = nowNY.getHours() * 60 + nowNY.getMinutes();
      for (const ev of events) {
        const impact = (ev.impact || "").toLowerCase();
        if (impact !== "high" && impact !== "red" && impact !== "3") continue;
        // Parse event time (HH:MM format expected)
        const timeMatch = (ev.time || "").match(/(\d{1,2}):(\d{2})/);
        if (!timeMatch) continue;
        const evMin = parseInt(timeMatch[1]) * 60 + parseInt(timeMatch[2]);
        const diffMin = Math.abs(nowMin - evMin);
        if (diffMin <= 30) {
          reasons.push(`news: ${ev.title || ev.event || 'High-impact event'} at ${ev.time} (${diffMin}min ${nowMin > evMin ? 'ago' : 'away'})`);
          break; // one is enough
        }
      }
    }
  } catch { /* news gate unavailable — skip */ }

  // Evaluation
  if (d.evaluation?.blocked) {
    reasons.push("evaluation: BLOCKED");
  }
  if (strict && d.evaluation?.verdict && d.evaluation.verdict !== "CLEAR" && d.evaluation.verdict !== "CAUTION") {
    reasons.push(`evaluation: ${d.evaluation.verdict}`);
  }

  // Phase conflicts
  if (d.conflicts?.phase > 0) {
    reasons.push(`${d.conflicts.phase} phase conflict(s)`);
  }

  // ═══ WP-16: Kelly-Optimal Position Sizing ═══
  // f = (bp - q) / b   where b = R:R, p = P(win), q = 1-p
  // When ML probability is available, risk scales with edge.
  // Without ML data, falls back to fixed 1% risk.
  let kellyFraction = null;
  let kellyDetail = null;
  const mlProb = d.registry?.mlProbability;
  if (mlProb && mlProb.samples >= 3 && operativeRR > 0) {
    const b = operativeRR;                    // net odds (R:R)
    const p = mlProb.win_rate_pct / 100;      // P(win) from ML
    const q = 1 - p;                          // P(loss)
    const kelly = (b * p - q) / b;            // Kelly fraction

    // Clamp: never exceed 1% max risk, never go negative
    const maxRisk = 0.01;                     // 1% max per trade
    const clampedKelly = Math.max(0, Math.min(kelly, maxRisk));

    kellyFraction = clampedKelly;
    kellyDetail = {
      formula: "f = (bp - q) / b",
      b: Math.round(b * 100) / 100,
      p: Math.round(p * 100) / 100,
      q: Math.round(q * 100) / 100,
      raw_kelly: Math.round(kelly * 10000) / 100 + "%",
      clamped: Math.round(clampedKelly * 10000) / 100 + "%",
      interpretation: kelly <= 0 ? "NO_BET — negative expected value" :
                      clampedKelly < maxRisk ? "KELLY_SCALED — edge-based sizing" :
                      "MAX_RISK — edge exceeds 1% cap",
    };

    if (kelly <= 0) {
      reasons.push(`Kelly: EV is negative (f=${kellyDetail.raw_kelly}) — no bet`);
    }
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    decision: d,
    file,
    gates: d.gates || null,
    secondChance,
    operative,
    operativeRR,
    kellyFraction,
    kellyDetail,
  };
}

if (require.main === module) {
  const pair = process.argv[2];
  const strict = process.argv.includes("--strict");
  if (!pair) {
    console.error("Usage: node tools/auto_decision.cjs <PAIR> [--strict]");
    process.exit(2);
  }
  try {
    const result = gate(pair, { strict });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.allowed ? 0 : 1);
  } catch (e) {
    console.error("auto_decision error: " + e.message);
    process.exit(1);
  }
}

module.exports = { gate };
