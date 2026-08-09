const test = require("node:test");
const assert = require("node:assert");
const { CONFIG } = require("../tools/lib/engine_config.cjs");

test("config loads and validates without throwing", () => {
  assert.ok(CONFIG && typeof CONFIG === "object");
});

test("WP-13: inversion minScore is <= maxScore (gate and detector can agree)", () => {
  assert.ok(CONFIG.inversion.minScore >= 1);
  assert.ok(CONFIG.inversion.minScore <= CONFIG.inversion.maxScore);
});

test("WP-2: londonPMIsKillzone is false (ICT dead zone)", () => {
  assert.strictEqual(CONFIG.killzones.londonPMIsKillzone, false);
});

test("WP-1: ATR period is 14", () => {
  assert.strictEqual(CONFIG.atr.period, 14);
});

test("liquidityRaid confirmation rule is one of close|wick", () => {
  assert.ok(["close", "wick"].includes(CONFIG.liquidityRaid.confirmation));
});
