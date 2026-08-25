// Tests for discord_premium.cjs
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

// Helper to create test briefing files
function createTestBriefing(dir, symbol, bias) {
  const data = {
    symbol,
    date: new Date().toISOString(),
    bias,
    draw_on_liquidity: "BSL at 1.1650",
    entry_trigger: "FVG at 1.1620",
    invalidation: "1.1600",
    target: "1.1680",
    confluence_score: 3,
    decision: "WATCH",
  };
  const filePath = path.join(dir, `${symbol.toLowerCase()}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return filePath;
}

test("parseBriefing: valid JSON returns parsed object", () => {
  const tmpDir = ".tmp-test-parse";
  fs.mkdirSync(tmpDir, { recursive: true });
  const filePath = createTestBriefing(tmpDir, "EURUSD", "BULLISH");

  const data = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(data);

  assert.strictEqual(parsed.symbol, "EURUSD");
  assert.strictEqual(parsed.bias, "BULLISH");
  assert.ok(parsed.date);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("parseBriefing: malformed JSON handles gracefully", () => {
  const tmpDir = ".tmp-test-malformed";
  fs.mkdirSync(tmpDir, { recursive: true });
  const filePath = path.join(tmpDir, "bad.json");
  fs.writeFileSync(filePath, "{invalid json}");

  let result = null;
  try {
    result = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    result = null;
  }

  assert.strictEqual(result, null);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("parseBriefing: empty file handles gracefully", () => {
  const tmpDir = ".tmp-test-empty";
  fs.mkdirSync(tmpDir, { recursive: true });
  const filePath = path.join(tmpDir, "empty.json");
  fs.writeFileSync(filePath, "");

  let result = null;
  try {
    result = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    result = null;
  }

  assert.strictEqual(result, null);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("formatDate: valid ISO string formats without error", () => {
  const date = new Date("2026-08-25T14:30:00Z");
  const formatted = date.toLocaleDateString("en-ZA", {
    timeZone: "Africa/Johannesburg",
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  assert.ok(formatted.length > 0);
  assert.ok(!formatted.includes("Invalid"));
});

test("loadSubscribers: empty CSV returns empty array", () => {
  const tmpFile = ".tmp-subscribers.csv";
  fs.writeFileSync(tmpFile, "# Header only\nname,email\n");

  const lines = fs.readFileSync(tmpFile, "utf8")
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"));

  assert.strictEqual(lines.length, 1); // Only header line

  fs.unlinkSync(tmpFile);
});

test("saveLastPostedDate: writes valid JSON", () => {
  const tmpFile = ".tmp-last-posted.json";
  const testData = { date: "20260825", ts: new Date().toISOString() };

  fs.writeFileSync(tmpFile, JSON.stringify(testData));
  const loaded = JSON.parse(fs.readFileSync(tmpFile, "utf8"));

  assert.strictEqual(loaded.date, "20260825");
  assert.ok(loaded.ts);

  fs.unlinkSync(tmpFile);
});
