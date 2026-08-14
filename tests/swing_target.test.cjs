// Swing Target / Multi-Setup Session (ICT Gems) tests — timeframe ladder map,
// qualification floor, and the 2-morning/2-afternoon cadence gate.
// Run: npm test   (node --test tests/*.test.cjs)

process.env.WORKSPACE_ROOT = require("path").join(__dirname, "..");

const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const ROOT = process.env.WORKSPACE_ROOT;
const ny = require(path.join(ROOT, "tools", "ny_time.cjs"));
const st = require(path.join(ROOT, "tools", "llm", "swing_target.cjs"));
const brief = require(path.join(ROOT, "tools", "llm", "market_brief.cjs"));
const loop = require(path.join(ROOT, "tools", "llm", "operator_loop.cjs"));

function writePair(tmp, date, opts = {}) {
  const dir = path.join(tmp, "shared", date, "NAS100");
  fs.mkdirSync(dir, { recursive: true });
  const price = opts.price ?? 100.0;
  const dayOpen = opts.dayOpen ?? 99.5;
  const disp = opts.displacement === false ? { atrRatio: 0.4, label: "weak" } : { atrRatio: 1.2, label: "strong" };
  const lastEvent = opts.swingBreak === false ? "none" : "MSS";
  const fvg = opts.fvgRetest === false ? [] : [{ top: 100.5, bottom: 99.8, fillFraction: 0 }];
  fs.writeFileSync(path.join(dir, "engine_1d.json"), JSON.stringify({
    structure: { bias: "bearish", lastEvent: "CHoCH", lastEventPrice: price },
    draw: { price: 101.5, side: "down", reason: "sell-side sweep below REL lows" },
    liquidity: [],
  }));
  fs.writeFileSync(path.join(dir, "engine_15m.json"), JSON.stringify({
    price,
    structure: { bias: "bearish", lastEvent },
    volumeDisplacement: disp,
    fvgs: fvg,
    orderBlocks: [],
    liquidity: [],
  }));
  fs.writeFileSync(path.join(dir, "engine_1m.json"), JSON.stringify({
    price,
    structure: { bias: "bearish", lastEvent },
    volumeDisplacement: disp,
    fvgs: [{ top: 100.2, bottom: 99.95, fillFraction: 0 }],
    orderBlocks: [],
    inversionFvgs: [],
    liquidity: [],
  }));
  fs.writeFileSync(path.join(dir, "candles_1d.json"), JSON.stringify([
    { time: "2026-08-12T21:00:00Z", open: 101, high: 102, low: 99, close: 100 },
  ]));
  fs.writeFileSync(path.join(dir, "candles_1h.json"), JSON.stringify([
    { time: `${date}T05:00:00Z`, open: dayOpen, high: dayOpen + 0.5, low: dayOpen - 0.5, close: dayOpen + 0.1 },
  ]));
  fs.writeFileSync(path.join(dir, "liquidity_marker.json"), JSON.stringify({
    relEquals: { highs: [100.7], lows: [], magnets: [] },
  }));
  return dir;
}

function gateCtx(tmp, hour = 9) {
  return {
    pair: "NAS100",
    root: tmp,
    tc: { tradeable: true, session: { name: "nyAm" }, rules: {}, nyTime: { hour } },
  };
}

function scalpProposal(overrides = {}) {
  return {
    action: "TRADE",
    model: "Swing Target (Multi-Setup)",
    side: "SHORT",
    entry: 100.0,
    sl: 100.55,
    tp: 99.2,
    confidence: 55,
    ...overrides,
  };
}

function writeLedger(tmp, date, entries) {
  const dir = path.join(tmp, "shared", date);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "operator_ledger.jsonl"), entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
}

// ── helper map ─────────────────────────────────────────────────────────────────

test("computeSwingTarget reads the timeframe ladder and qualification boxes", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "st-map-"));
  try {
    const date = ny.getNYDate();
    writePair(tmp, date);
    const m = st.computeSwingTarget("NAS100", date, tmp);
    assert.ok(m, "map should build");
    assert.strictEqual(m.bias, "BEARISH");
    assert.strictEqual(m.openingSide, "ABOVE");
    assert.ok(m.dailyOB != null, "daily OB (open of down-close candle) derived");
    assert.strictEqual(m.qualification.boxes, 4, "all 4 boxes checked with full narrative");
    assert.strictEqual(m.qualification.qualified, true);
    assert.strictEqual(m.rel.highs.length, 1, "REL highs surfaced");
    assert.strictEqual(m.setups.morning + m.setups.afternoon, m.setups.total);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("computeSwingTarget drops below the floor when the narrative is missing", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "st-poor-"));
  try {
    const date = ny.getNYDate();
    writePair(tmp, date, { displacement: false, swingBreak: false });
    const m = st.computeSwingTarget("NAS100", date, tmp);
    assert.strictEqual(m.qualification.boxes, 2, "missing displacement + swing break -> 2/4");
    assert.strictEqual(m.qualification.qualified, false, "2/4 < 3 floor");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ── brief section ──────────────────────────────────────────────────────────────

test("swingTargetSection renders the TF ladder and qualification", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "st-sec-"));
  try {
    const date = ny.getNYDate();
    writePair(tmp, date);
    const s = brief.swingTargetSection("NAS100", date, tmp);
    assert.ok(s, "section renders");
    assert.ok(s.includes("TF ladder: DAILY = bias/draw"), "ladder line present");
    assert.ok(s.includes("15m = framework"), "15m framework role present");
    assert.ok(s.includes("5m = noisy"), "5m noise role present");
    assert.ok(s.includes("1m = precision entry"), "1m precision role present");
    assert.ok(s.includes("Qualification: 4/4"), "boxes rendered");
    assert.ok(s.includes("QUALIFIED"), "floor verdict rendered");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ── gate: qualification + cadence ─────────────────────────────────────────────

test("gate admits Swing Target at 55 when qualified, blocks below the floor", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "st-gate-"));
  try {
    const date = ny.getNYDate();
    writePair(tmp, date);
    const pass = loop.gate(scalpProposal(), gateCtx(tmp, 9));
    assert.strictEqual(pass.verdict, "PASS", `expected PASS: ${pass.reasons.join("; ")}`);
    assert.ok(pass.notes.some((n) => n.includes("swing target")));

    writePair(tmp, date, { displacement: false, swingBreak: false });
    const blocked = loop.gate(scalpProposal(), gateCtx(tmp, 9));
    assert.notStrictEqual(blocked.verdict, "PASS");
    assert.ok(blocked.reasons.some((r) => r.includes("qualification")), "floor enforced");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("gate enforces the 2-morning / 2-afternoon cadence", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "st-cap-"));
  try {
    const date = ny.getNYDate();
    writePair(tmp, date);
    const mk = (ts) => ({ ts, type: "gate", pair: "NAS100", verdict: "PASS", proposal: { model: "Swing Target (Multi-Setup)" } });
    // 08:00 and 09:00 NY (UTC-4) = 12:00/13:00Z -> morning
    writeLedger(tmp, date, [mk(`${date}T12:10:00Z`), mk(`${date}T13:20:00Z`)]);

    const morning = loop.gate(scalpProposal(), gateCtx(tmp, 10));
    assert.notStrictEqual(morning.verdict, "PASS");
    assert.ok(morning.reasons.some((r) => r.includes("cadence: 2 morning")), "morning cap hit");

    const afternoon = loop.gate(scalpProposal(), gateCtx(tmp, 14));
    assert.strictEqual(afternoon.verdict, "PASS", "afternoon part is fresh: " + afternoon.reasons.join("; "));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});