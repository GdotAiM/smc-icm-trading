// tools/models/sentence_gate.cjs
// ONE TRADE IS ONE SENTENCE — an ADVISORY 6-word report.
//
//   daily bias → the single liquidity draw on the side of that bias → one PD
//   array in premium/discount → MSS on the entry TF inside the killzone → SL
//   beyond the structural swing → TP at the draw.
//
// If any word of that sentence is missing, the sentence is broken. That fact
// is MADE KNOWN (console + decision.json), never enforced: the registry verdict
// is untouched and the entry plan still emits. This module is a build-time
// telemetry layer — the invariant is visible long before it becomes a gate.
//
// Input contract (facts object):
//   bias           "bullish" | "bearish" | "neutral"
//   hasDraw        bool — a liquidity draw exists
//   poolTarget     { type: "BSL"|"SSL", price } | null — nearest draw on bias side
//   arrayInPlay    bool — price at a fresh unmitigated PD array
//   mss            bool — MSS confirmed on the structure timeframe
//   killzone       bool — currently inside a trading killzone
//   killzoneName   string
//   entryType      "LONG" | "SHORT" | "NO TRADE"
//   slReason       string — SL rationale from the entry plan
//   tp1Reason      string — TP1 rationale from the entry plan
//
// Returns { open, passed, total, missing, elements } where each element is
// { key, label, pass, detail }.

function evaluateSentence(facts = {}) {
  const f = facts;
  const noTrade = f.entryType === "NO TRADE";

  const elements = [];

  // 1 — daily bias
  const biasOk = f.bias === "bullish" || f.bias === "bearish";
  elements.push({
    key: "bias",
    label: "Daily bias",
    pass: biasOk,
    detail: biasOk ? `bias ${f.bias}` : "bias is neutral — the sentence cannot start",
  });

  // 2 — single liquidity draw on the side of that bias
  const drawOk = !!f.hasDraw && !!f.poolTarget;
  elements.push({
    key: "draw",
    label: "Single liquidity draw on bias side",
    pass: drawOk,
    detail: drawOk
      ? `nearest ${f.poolTarget.type} @ ${Number(f.poolTarget.price).toFixed(5)}`
      : f.hasDraw ? "draws exist but none on the bias side" : "no liquidity draw detected",
  });

  // 3 — one PD array in premium/discount
  const arrayOk = !!f.arrayInPlay;
  elements.push({
    key: "pd_array",
    label: "One PD array in premium/discount",
    pass: arrayOk,
    detail: arrayOk ? "price at a fresh unmitigated PD array" : "no fresh PD array in play",
  });

  // 4 — MSS on the entry TF inside the killzone
  // The entry TF for an intraday/scalping trader is 1m/5m. entryMss is built
  // only from genuine 1m/5m MSS/CHoCH sources (turtle-soup 1m confirmMSS,
  // lecture 1m MSS, 1m/5m engine CHoCH). Falls back to the registry mss union
  // only when entryMss was never supplied (defensive default).
  const mssSource = f.entryMss !== undefined ? f.entryMss : f.mss;
  const mssDetail = f.entryMssDetail || (f.mss ? "MSS confirmed (registry union)" : "no MSS");
  const mssKzOk = !!(mssSource && f.killzone);
  elements.push({
    key: "mss_killzone",
    label: "MSS on entry TF (1m/5m) inside killzone",
    pass: mssKzOk,
    detail: mssKzOk
      ? `1m/5m MSS in ${f.killzoneName || "a killzone"} — ${mssDetail}`
      : `MSS=${!!mssSource} (${mssDetail}), killzone=${!!f.killzone} — both required`,
  });

  // 5 — SL beyond the structural swing
  const slOk = !noTrade && !!f.slReason && /swing/i.test(f.slReason);
  elements.push({
    key: "sl",
    label: "SL beyond structural swing",
    pass: slOk,
    detail: noTrade ? "no entry plan (NO TRADE)" : slOk ? f.slReason : "SL not anchored to a structural swing",
  });

  // 6 — TP at the draw
  const tpOk = !noTrade && !!f.tp1Reason && /\b(BSL|SSL)\b|pool|draw/i.test(f.tp1Reason);
  elements.push({
    key: "tp",
    label: "TP at the draw",
    pass: tpOk,
    detail: noTrade ? "no entry plan (NO TRADE)" : tpOk ? f.tp1Reason : "TP not targeting a liquidity draw",
  });

  const passed = elements.filter(e => e.pass).length;
  return {
    open: passed === elements.length,
    passed,
    total: elements.length,
    missing: elements.filter(e => !e.pass).map(e => e.label),
    elements,
  };
}

module.exports = { evaluateSentence };
