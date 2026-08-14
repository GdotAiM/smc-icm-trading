// Hourly Candle Scalp (ICT Gems) tests — brief section + gate cadence/dedup.
//
// The 15m is the bellwether, the daily is the bias, hourly setups are executed
// on the 1m from the 07:00 hour onward, exactly once per NY hour per pair.
// Run: npm test   (node --test tests/*.test.cjs)

process.env.WORKSPACE_ROOT = require("path").join(__dirname, "..");

const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const ROOT = process.env.WORKSPACE_ROOT;
const brief = require(path.join(ROOT, "tools", "llm", "market_brief.cjs"));
const loop = require(path.join(ROOT, "tools", "llm", "operator_loop.cjs"));

const STATE_FILE = path.join(ROOT, "shared", "operator_planner_state.json");

function withState(t) {
  const had = fs.existsSync(STATE_FILE);
  const saved = had ? fs.readFileSync(STATE_FILE, "utf8") : null;
  t.after(() => {
    if (had) fs.writeFileSync(STATE_FILE, saved);
    else fs.rmSync(STATE_FILE, { force: true });
  });
}

function gateCtx(hour = 9) {
  return {
    pair: "NAS100",
    tc: {
      tradeable: true,
      session: { name: "nyAm" },
      rules: {},
      nyTime: { hour },
    },
  };
}

function scalpProposal(overrides = {}) {
  return {
    action: "TRADE",
    model: "Hourly Candle Scalp",
    side: "LONG",
    entry: 19000,
    sl: 18950,
    tp: 19100,
    confidence: 55,
    ...overrides,
  };
}

// ── brief section builder ─────────────────────────────────────────────────────

test("hourlyScalpSection renders the framework from engine/candle files", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hs-brief-"));
  try {
    const date = "2026-08-13";
    const dir = path.join(tmp, "shared", date, "NAS100");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "engine_1d.json"), JSON.stringify({ structure: { bias: "bullish", confidence: 80 } }));
    fs.writeFileSync(path.join(dir, "engine_15m.json"), JSON.stringify({ structure: { bias: "bullish", confidence: 65, lastEvent: "CHoCH" }, liquidity: [{ type: "SSL", price: 18900, swept: true }] }));
    fs.writeFileSync(path.join(dir, "candles_1h.json"), JSON.stringify([
      { time: "2026-08-13T11:00:00Z", open: 18900, high: 18980, low: 18890, close: 18970 },
      { time: "2026-08-13T12:00:00Z", open: 18970, high: 19020, low: 18960, close: 19010 },
    ]));
    fs.writeFileSync(path.join(dir, "engine_1m.json"), JSON.stringify({
      orderBlocks: [{ kind: "bullish", type: "OB", p: 18950 }],
      inversionFvgs: [{ p: 18955 }],
      fvgCount: 3,
    }));

    const s = brief.hourlyScalpSection("NAS100", date, tmp, 8);
    assert.ok(s, "section should render when 1d bias exists at/after 07:00");
    assert.ok(s.includes("Daily bias: BULLISH"), "renders daily bias");
    assert.ok(s.includes("15m bellwether: bias BULLISH"), "renders 15m bellwether");
    assert.ok(s.includes("swept: SSL@18900"), "renders swept liquidity");
    assert.ok(s.includes("07:00"), "starts hourly units at 07:00");
    assert.ok(s.includes("08:00 (current)"), "marks the current hour");
    assert.ok(s.includes("BULL"), "labels candle bodies");
    assert.ok(s.includes("OB"), "renders 1m entry context zones");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("hourlyScalpSection is null before 07:00 and without a daily bias", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hs-null-"));
  try {
    const date = "2026-08-13";
    const dir = path.join(tmp, "shared", date, "NAS100");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "engine_1d.json"), JSON.stringify({ structure: { bias: "bullish", confidence: 80 } }));

    assert.strictEqual(brief.hourlyScalpSection("NAS100", date, tmp, 6), null, "before 07:00 NY -> no section");

    fs.rmSync(path.join(dir, "engine_1d.json"));
    assert.strictEqual(brief.hourlyScalpSection("NAS100", date, tmp, 9), null, "no daily bias -> no section");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ── gate cadence (one eval per NY hour per pair) ──────────────────────────────

test("gate admits Hourly Candle Scalp at confidence 55 and blocks below", withState, () => {
  const pass = loop.gate(scalpProposal(), gateCtx(9));
  assert.strictEqual(pass.verdict, "PASS", `expected PASS, got: ${pass.verdict} ${pass.reasons.join("; ")}`);
  assert.ok(pass.notes.some((n) => n.includes("hourly candle scalp")));

  const lowConf = loop.gate(scalpProposal({ confidence: 54 }), gateCtx(10));
  assert.notStrictEqual(lowConf.verdict, "PASS");
  assert.ok(lowConf.reasons.some((r) => r.includes("54 < 55")), "55 floor enforced");
});

test("gate allows exactly one Hourly Candle Scalp eval per NY hour per pair", withState, () => {
  const ctx = gateCtx(9);
  const first = loop.gate(scalpProposal(), ctx);
  assert.strictEqual(first.verdict, "PASS", `first eval should pass: ${first.reasons.join("; ")}`);

  const repeat = loop.gate(scalpProposal(), ctx);
  assert.notStrictEqual(repeat.verdict, "PASS");
  assert.ok(repeat.reasons.some((r) => r.includes("already evaluated for NAS100 this NY hour")), "repeat blocked by dedup");

  const nextHour = loop.gate(scalpProposal(), gateCtx(10));
  assert.strictEqual(nextHour.verdict, "PASS", "a fresh hour is a fresh evaluation");
});

test("dedup survives restart via planner state (persisted key)", withState, () => {
  const loop2 = require(path.join(ROOT, "tools", "llm", "operator_loop.cjs"));
  const ctx = gateCtx(14);
  assert.strictEqual(loop2.gate(scalpProposal(), ctx).verdict, "PASS");
  const st = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  const key = Object.values(st.hourlyScalp)[0] || {};
  assert.strictEqual(key.NAS100, 14, "hourlyScalp state persists pair->hour");
});

// ── prompt ────────────────────────────────────────────────────────────────────

test("operator prompt encodes the hourly candle scalp hierarchy", () => {
  const p = loop.buildOperatorPrompt("brief", "memory");
  const system = p.find((m) => m.role === "system").content;
  assert.ok(system.includes("HOURLY CANDLE SCALP (ICT Gems"));
  assert.ok(system.includes("15m is the BELLWETHER"));
  assert.ok(system.includes("from the actual 07:00 hour"));
  assert.ok(system.includes('model name "Hourly Candle Scalp" with confidence >= 55'));
  assert.ok(system.includes("ONE evaluation per NY hour per pair"));
});