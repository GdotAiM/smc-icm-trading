const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const enginePath = path.resolve(__dirname, "../tools/inducement_engine.cjs");
const eng = require(enginePath);

// Build 15m candles (o,h,l,c) starting 2026-08-09 09:00 UTC.
function makeCandles(rows) {
  return rows.map(([o, h, l, c], i) => ({
    time: new Date(Date.UTC(2026, 7, 9, 9, 0) + i * 15 * 60000).toISOString(),
    open: o, high: h, low: l, close: c,
  }));
}

// Bullish structure: impulse up → swing high 1.1030 @ i14 → pullback sweeps
// below inducement 1.1000 @ i18 → rally closes above 1.1030 (MSS on 15m).
const BULL = makeCandles([
  [1.0950, 1.0953, 1.0948, 1.0952],
  [1.0952, 1.0954, 1.0944, 1.0946],
  [1.0946, 1.0952, 1.0949, 1.0951],
  [1.0951, 1.0956, 1.0950, 1.0954],
  [1.0954, 1.0955, 1.0953, 1.0954],
  [1.0954, 1.0955, 1.0953, 1.0954],
  [1.0954, 1.0962, 1.0953, 1.0960],
  [1.0960, 1.0970, 1.0959, 1.0968],
  [1.0968, 1.0978, 1.0967, 1.0976],
  [1.0976, 1.0986, 1.0975, 1.0984],
  [1.0984, 1.0994, 1.0983, 1.0992],
  [1.0992, 1.1003, 1.0991, 1.1001],
  [1.1001, 1.1012, 1.1000, 1.1010],
  [1.1010, 1.1021, 1.1009, 1.1019],
  [1.1019, 1.1030, 1.1018, 1.1028],
  [1.1028, 1.1029, 1.1019, 1.1021],
  [1.1021, 1.1022, 1.1010, 1.1012],
  [1.1012, 1.1013, 1.1000, 1.1002],
  [1.1002, 1.1003, 1.0990, 1.0992],
  [1.0992, 1.0995, 1.0987, 1.0989],
  [1.0989, 1.1001, 1.0988, 1.0999],
  [1.0999, 1.1012, 1.0998, 1.1010],
  [1.1010, 1.1024, 1.1009, 1.1022],
  [1.1022, 1.1036, 1.1021, 1.1034],
  [1.1034, 1.1048, 1.1032, 1.1046],
  [1.1046, 1.1058, 1.1044, 1.1056],
]);

// Inverted mirror → bearish series with identical swing structure.
const BEAR = BULL.map(c => ({
  time: c.time,
  open: +(2.2 - c.open).toFixed(5),
  high: +(2.2 - c.low).toFixed(5),
  low: +(2.2 - c.high).toFixed(5),
  close: +(2.2 - c.close).toFixed(5),
}));

function structEvent(candles, tf) {
  return {
    structureTF: tf,
    impulseCandles: candles.slice(10, 15), // impulse ends at candle 14
  };
}

test("inducement_engine module should load cleanly without path errors", () => {
  assert.doesNotThrow(() => { require(enginePath); });
});

test("bullish inducement: sweep + reversal + MSS confirmed on the STRUCTURE TF (15m), never 1m", () => {
  const inducement = { price: 1.1, direction: "bullish", type: "SSL" };
  const s = eng.checkInducementSweep(inducement, structEvent(BULL, "15m"), BULL, { confirmTF: "15m" });
  assert.strictEqual(s.swept, true, "inducement low must be raided");
  assert.strictEqual(s.reversed, true, "must close back above inducement");
  assert.strictEqual(s.mssConfirmed, true, "MSS must confirm on 15m after the sweep");
  assert.strictEqual(s.confirmTF, "15m");
  assert.strictEqual(s.mssSource, "15m");
  const gate = eng.getEntryGate(s, inducement);
  assert.strictEqual(gate.open, true);
});

test("bearish inducement: sweep + reversal + MSS confirmed on the structure TF", () => {
  const inducement = { price: 1.1, direction: "bearish", type: "BSL" };
  const s = eng.checkInducementSweep(inducement, structEvent(BEAR, "15m"), BEAR, { confirmTF: "15m" });
  assert.strictEqual(s.swept, true, "inducement high must be raided");
  assert.strictEqual(s.reversed, true, "must close back below inducement");
  assert.strictEqual(s.mssConfirmed, true, "MSS must confirm on 15m after the sweep");
  assert.strictEqual(s.mssSource, "15m");
  assert.strictEqual(eng.getEntryGate(s, inducement).open, true);
});

test("gate stays CLOSED when the inducement level is never swept", () => {
  const unSwept = BULL.filter(c => c.low >= 1.1000); // price never dips below inducement
  const inducement = { price: 1.1, direction: "bullish", type: "SSL" };
  const s = eng.checkInducementSweep(inducement, structEvent(BULL, "15m"), unSwept, { confirmTF: "15m" });
  assert.strictEqual(s.swept, false);
  assert.strictEqual(s.mssConfirmed, false);
  assert.strictEqual(eng.getEntryGate(s, inducement).open, false);
});

test("default confirmation is the structure TF (15m), not 1m (WP-9 / Bug 6.6)", () => {
  // No real data for this pair/date → library returns the defaults we assert on.
  const res = eng.runInducementCheck("NOPEUSD", { date: "1999-01-01" });
  assert.strictEqual(res.structureTF, "15m");
  assert.strictEqual(res.confirmTF, "15m");
  assert.strictEqual(res.gateOpen, false);
  assert.ok(/insufficient/i.test(res.detail));
});

test("same-TF confirmation is preserved when confirmTF defaults to structureTF", () => {
  const inducement = { price: 1.1, direction: "bullish", type: "SSL" };
  // No confirmTF passed → falls back to the structure TF of the event.
  const s = eng.checkInducementSweep(inducement, structEvent(BULL, "15m"), BULL);
  assert.strictEqual(s.confirmTF, "15m");
});
